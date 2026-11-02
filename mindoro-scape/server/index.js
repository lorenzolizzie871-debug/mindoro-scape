
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

// Firebase Admin modular SDK
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");

const app = express();
const PORT = process.env.PORT || 3000;

// ==================================================
// 1. CONFIGURATION
// ==================================================

const PAYPAL_MODE = (
  process.env.PAYPAL_MODE || "sandbox"
).toLowerCase();

if (!["sandbox", "live"].includes(PAYPAL_MODE)) {
  console.error("Invalid PAYPAL_MODE. Use sandbox or live.");
  process.exit(1);
}

const PAYPAL_BASE_URL =
  PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const PAYPAL_RETURN_URL = process.env.PAYPAL_RETURN_URL;
const PAYPAL_CANCEL_URL = process.env.PAYPAL_CANCEL_URL;

const allowedOrigins = (
  process.env.CLIENT_ORIGINS ||
  "http://localhost:8100,http://localhost:8101,http://localhost:8102,http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// ==================================================
// 2. MIDDLEWARE
// ==================================================

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));

// ==================================================
// 3. ENVIRONMENT VALIDATION
// ==================================================

if (
  !process.env.PAYPAL_CLIENT_ID ||
  !process.env.PAYPAL_CLIENT_SECRET
) {
  console.error(
    "Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in server/.env"
  );
  process.exit(1);
}

if (!PAYPAL_RETURN_URL || !PAYPAL_CANCEL_URL) {
  console.error(
    "Missing PAYPAL_RETURN_URL or PAYPAL_CANCEL_URL in server/.env"
  );
  process.exit(1);
}

try {
  new URL(PAYPAL_RETURN_URL);
  new URL(PAYPAL_CANCEL_URL);
} catch {
  console.error("Invalid PayPal return or cancel URL.");
  process.exit(1);
}

// ==================================================
// 4. FIREBASE ADMIN INITIALIZATION
// ==================================================

const serviceAccountPath = path.join(
  __dirname,
  "serviceAccountKey.json"
);

if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    "Firebase serviceAccountKey.json is missing from the server folder."
  );
  process.exit(1);
}

let db;
let firebaseAuth;

try {
  const serviceAccount = require(serviceAccountPath);

  initializeApp({
    credential: cert(serviceAccount),
  });

  db = getFirestore();
  firebaseAuth = getAuth();

  console.log("Firebase Admin connected successfully.");
} catch (error) {
  console.error("Firebase Admin initialization failed:", error);
  process.exit(1);
}

// ==================================================
// 5. HELPER FUNCTIONS
// ==================================================

function formatAmount(amount) {
  return Number(amount).toFixed(2);
}

function amountInCents(amount) {
  return Math.round(Number(amount) * 100);
}

function buildReturnUrl(baseUrl, reservationId) {
  const url = new URL(baseUrl);

  url.searchParams.set("reservationId", reservationId);

  return url.toString();
}

function getPayPalError(error) {
  return (
    error.response?.data?.details?.[0]?.description ||
    error.response?.data?.message ||
    error.message ||
    "Unknown PayPal error"
  );
}

// ==================================================
// 6. FIREBASE AUTHENTICATION
// ==================================================

async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required.",
      });
    }

    const idToken = authHeader
      .substring("Bearer ".length)
      .trim();

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing.",
      });
    }

    const decodedToken = await firebaseAuth.verifyIdToken(idToken);

    req.user = decodedToken;

    return next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
}

// ==================================================
// 7. PAYPAL ACCESS TOKEN
// ==================================================

async function generateAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await axios.post(
    `${PAYPAL_BASE_URL}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 20000,
    }
  );

  if (!response.data?.access_token) {
    throw new Error("PayPal did not return an access token.");
  }

  return response.data.access_token;
}

// ==================================================
// 8. BACKEND HEALTH CHECK
// ==================================================

app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "MINDORO SCAPE Backend is running!",
    firebase: "connected",
    paypalMode: PAYPAL_MODE,
  });
});

// ==================================================
// 9. PAYPAL CONNECTION TEST
// ==================================================

app.get("/api/paypal/test", async (req, res) => {
  try {
    await generateAccessToken();

    return res.json({
      success: true,
      message: `PayPal ${PAYPAL_MODE.toUpperCase()} connection successful!`,
    });
  } catch (error) {
    console.error(
      "PayPal connection error:",
      getPayPalError(error)
    );

    return res.status(500).json({
      success: false,
      message:
        "PayPal authentication failed. Check your credentials and mode.",
    });
  }
});

// ==================================================
// 10. CREATE PAYPAL ORDER
// ==================================================

app.post(
  "/api/paypal/create-order",
  authenticateUser,
  async (req, res) => {
    try {
      const { reservationId } = req.body;

      if (
        !reservationId ||
        typeof reservationId !== "string" ||
        !reservationId.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "A valid reservation ID is required.",
        });
      }

      const reservationRef = db
        .collection("reservations")
        .doc(reservationId);

      const reservationSnap = await reservationRef.get();

      if (!reservationSnap.exists) {
        return res.status(404).json({
          success: false,
          message: "Reservation not found.",
        });
      }

      const reservation = reservationSnap.data();

      // Verify reservation owner.
      if (reservation.userId !== req.user.uid) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to pay for this reservation.",
        });
      }

      // Verify payment method.
      if (reservation.paymentMethod !== "paypal") {
        return res.status(400).json({
          success: false,
          message: "This reservation is not configured for PayPal.",
        });
      }

      // Prevent payment after successful payment.
      if (reservation.paymentStatus === "paid") {
        return res.status(409).json({
          success: false,
          message: "This reservation has already been paid.",
        });
      }

      if (!["pending", "confirmed"].includes(reservation.status)) {
        return res.status(400).json({
          success: false,
          message: "This reservation cannot be paid in its current status.",
        });
      }

      // Get amount from Firestore, not the frontend.
      const amount = Number(reservation.pricing?.total);

      const currency = String(
        reservation.pricing?.currency || "PHP"
      ).toUpperCase();

      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid reservation amount.",
        });
      }

      if (currency !== "PHP") {
        return res.status(400).json({
          success: false,
          message: "Only PHP reservations are supported.",
        });
      }

      const accessToken = await generateAccessToken();

      // Add reservation ID to PayPal callback URLs.
      const returnUrl = buildReturnUrl(
        PAYPAL_RETURN_URL,
        reservationId
      );

      const cancelUrl = buildReturnUrl(
        PAYPAL_CANCEL_URL,
        reservationId
      );

      // Unique invoice reference for this order.
      const invoiceId = `MND-${crypto.randomUUID()}`;

      const orderPayload = {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: reservationId,
            custom_id: reservationId,
            invoice_id: invoiceId,
            description: `MINDORO SCAPE reservation - ${
              reservation.resortName || "Resort"
            }`,
            amount: {
              currency_code: currency,
              value: formatAmount(amount),
            },
          },
        ],
        application_context: {
          brand_name: "MINDORO SCAPE",
          user_action: "PAY_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      };

      const response = await axios.post(
        `${PAYPAL_BASE_URL}/v2/checkout/orders`,
        orderPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id": crypto.randomUUID(),
          },
          timeout: 30000,
        }
      );

      const order = response.data;

      const approvalLink = order.links?.find(
        (link) =>
          link.rel === "approve" ||
          link.rel === "payer-action"
      );

      if (!order.id || !approvalLink?.href) {
        throw new Error(
          "PayPal did not return a valid approval URL."
        );
      }

      // Save order details to Firestore.
      await reservationRef.update({
        paypalOrderId: order.id,
        paypalOrderStatus: order.status || "CREATED",
        paypalInvoiceId: invoiceId,
        paymentStatus: "unpaid",
        updatedAt: FieldValue.serverTimestamp(),
      });

      return res.json({
        success: true,
        id: order.id,
        status: order.status,
        approvalUrl: approvalLink.href,
        reservationId,
      });
    } catch (error) {
      console.error(
        "Create PayPal order error:",
        getPayPalError(error)
      );

      return res.status(500).json({
        success: false,
        message: "Unable to create PayPal order.",
      });
    }
  }
);

// ==================================================
// 11. CAPTURE PAYPAL ORDER
// ==================================================

app.post(
  "/api/paypal/capture-order/:orderId",
  authenticateUser,
  async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const { reservationId } = req.body;

      if (
        !orderId ||
        !reservationId ||
        typeof reservationId !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "PayPal order ID and reservation ID are required.",
        });
      }

      const reservationRef = db
        .collection("reservations")
        .doc(reservationId);

      const reservationSnap = await reservationRef.get();

      if (!reservationSnap.exists) {
        return res.status(404).json({
          success: false,
          message: "Reservation not found.",
        });
      }

      const reservation = reservationSnap.data();

      // Verify reservation owner.
      if (reservation.userId !== req.user.uid) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to access this reservation.",
        });
      }

      if (reservation.paymentMethod !== "paypal") {
        return res.status(400).json({
          success: false,
          message: "This reservation does not use PayPal.",
        });
      }

      // Verify PayPal order ownership.
      if (reservation.paypalOrderId !== orderId) {
        return res.status(400).json({
          success: false,
          message: "PayPal order does not match this reservation.",
        });
      }

      // Safe response for repeated success-page requests.
      if (reservation.paymentStatus === "paid") {
        return res.json({
          success: true,
          message: "Reservation is already paid.",
          orderId,
          captureId: reservation.paypalCaptureId || null,
          paymentStatus: "paid",
        });
      }

      const expectedAmount = Number(
        reservation.pricing?.total
      );

      const expectedCurrency = String(
        reservation.pricing?.currency || "PHP"
      ).toUpperCase();

      if (
        !Number.isFinite(expectedAmount) ||
        expectedAmount <= 0 ||
        expectedCurrency !== "PHP"
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid reservation payment details.",
        });
      }

      const accessToken = await generateAccessToken();

      // Capture the approved PayPal order.
      const response = await axios.post(
        `${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id": `capture-${orderId}`,
          },
          timeout: 30000,
        }
      );

      const captureData = response.data;

      const purchaseUnit = captureData.purchase_units?.[0];

      const capture = purchaseUnit?.payments?.captures?.[0];

      // Verify completed payment.
      if (
        captureData.status !== "COMPLETED" ||
        capture?.status !== "COMPLETED"
      ) {
        return res.status(400).json({
          success: false,
          message: "PayPal payment has not been completed.",
          paymentStatus: captureData.status || "UNKNOWN",
        });
      }

      const capturedAmount = Number(capture?.amount?.value);

      const capturedCurrency = capture?.amount?.currency_code;

      // Verify reservation ID, amount, and currency.
      if (
        purchaseUnit?.custom_id !== reservationId ||
        purchaseUnit?.reference_id !== reservationId ||
        capturedCurrency !== expectedCurrency ||
        !Number.isFinite(capturedAmount) ||
        amountInCents(capturedAmount) !== amountInCents(expectedAmount) ||
        !capture?.id
      ) {
        return res.status(400).json({
          success: false,
          message: "PayPal payment details do not match the reservation.",
        });
      }

      // Mark reservation as paid only after verification.
      await reservationRef.update({
        paymentStatus: "paid",
        paypalOrderStatus: captureData.status,
        paypalCaptureId: capture.id,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return res.json({
        success: true,
        message: "PayPal payment completed successfully!",
        orderId: captureData.id,
        captureId: capture.id,
        paymentStatus: "paid",
      });
    } catch (error) {
      console.error(
        "Capture PayPal payment error:",
        getPayPalError(error)
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to capture PayPal payment. Check the order status before retrying.",
      });
    }
  }
);

// ==================================================
// 12. NOT FOUND HANDLER
// ==================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// ==================================================
// 13. GLOBAL ERROR HANDLER
// ==================================================

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

// ==================================================
// 14. START SERVER
// ==================================================

app.listen(PORT, () => {
  console.log("----------------------------------------");
  console.log("MINDORO SCAPE BACKEND");
  console.log("----------------------------------------");
  console.log("Firebase Admin: connected");
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`PayPal mode: ${PAYPAL_MODE}`);
  console.log("----------------------------------------");
});
