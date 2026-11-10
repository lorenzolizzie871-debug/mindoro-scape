const path = require("path");

// Always load the .env file located beside this index.js file.
require("dotenv").config({
  path: path.join(__dirname, ".env"),
  override: true,
});

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const cron = require("node-cron");

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

const PAYPAL_MODE = String(
  process.env.PAYPAL_MODE || "sandbox"
).trim().toLowerCase();

if (!["sandbox", "live"].includes(PAYPAL_MODE)) {
  console.error("Invalid PAYPAL_MODE. Use sandbox or live.");
  process.exit(1);
}

const PAYPAL_BASE_URL =
  PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

// Trim credentials to avoid accidental whitespace/newlines.
const PAYPAL_CLIENT_ID = String(
  process.env.PAYPAL_CLIENT_ID || ""
).trim();

const PAYPAL_CLIENT_SECRET = String(
  process.env.PAYPAL_CLIENT_SECRET || ""
).trim();

const PAYPAL_RETURN_URL = String(
  process.env.PAYPAL_RETURN_URL || ""
).trim();

const PAYPAL_CANCEL_URL = String(
  process.env.PAYPAL_CANCEL_URL || ""
).trim();

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

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
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

// Safe PayPal error details.
// Never log or return Client Secret or access tokens.
function getPayPalErrorDetails(error) {
  const data = error.response?.data || {};

  return {
    message:
      data.error_description ||
      data.details?.[0]?.description ||
      data.message ||
      error.message ||
      "Unknown PayPal error",

    providerStatus: error.response?.status || null,
    providerCode: data.name || data.error || null,
    debugId: data.debug_id || data.debugId || null,
  };
}

function getPayPalError(error) {
  return getPayPalErrorDetails(error).message;
}

// Create a consistent receipt number for a reservation.
function buildReceiptNumber(reservation, reservationId) {
  const reference = String(
    reservation.referenceCode || reservationId
  )
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toUpperCase();

  return `MSR-${reference}`;
}

// Build receipt data stored inside the reservation document.
function buildPayPalReceipt({
  reservation,
  reservationId,
  orderId,
  captureId,
  amount,
  currency,
  payerEmail,
}) {
  return {
    receiptNumber: buildReceiptNumber(
      reservation,
      reservationId
    ),
    reservationId,
    referenceCode: reservation.referenceCode || reservationId,
    paymentMethod: "PayPal",
    paymentStatus: "paid",
    amount: Number(amount),
    currency: String(currency).toUpperCase(),
    transactionId: captureId,
    orderId,
    payerEmail: payerEmail || null,
    issuedAt: FieldValue.serverTimestamp(),
    issuedBy: "paypal_backend",
  };
}

// ==================================================
// 5A. AUTOMATIC BOOKING CANCELLATION
// ==================================================

function getManilaDateKey(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  let date = null;

  if (typeof value === "string") {
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value.toDate === "function") {
    date = value.toDate();
  }

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function autoCancelUnconfirmedReservations() {
  try {
    const today = getManilaDateKey(new Date());

    const pendingStatuses = [
      "pending",
      "unconfirmed",
      "awaiting_confirmation",
      "pending_confirmation",
    ];

    const snapshot = await db
      .collection("reservations")
      .where("status", "in", pendingStatuses)
      .get();

    let cancelledCount = 0;

    for (const bookingDoc of snapshot.docs) {
      const bookingRef = bookingDoc.ref;

      const wasCancelled = await db.runTransaction(
        async (transaction) => {
          const latestSnapshot = await transaction.get(bookingRef);

          if (!latestSnapshot.exists) return false;

          const booking = latestSnapshot.data();

          const status = String(
            booking.status || ""
          ).toLowerCase();

          const checkInDate = getManilaDateKey(
            booking.checkIn
          );

          const stillPending =
            pendingStatuses.includes(status);

          const checkInStarted =
            Boolean(checkInDate) && checkInDate <= today;

          if (!stillPending || !checkInStarted) {
            return false;
          }

          transaction.update(bookingRef, {
            status: "cancelled",
            cancellationType: "system_auto_cancel",
            cancellationReason:
              "Automatically cancelled because the resort owner did not confirm before the check-in date.",
            autoCancelledAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          return true;
        }
      );

      if (wasCancelled) {
        cancelledCount++;

        console.log(
          `[AUTO-CANCEL] Reservation ${bookingDoc.id} cancelled.`
        );
      }
    }

    console.log(
      `[AUTO-CANCEL] Completed. Cancelled ${cancelledCount} booking(s).`
    );
  } catch (error) {
    console.error(
      "[AUTO-CANCEL] Error:",
      error
    );
  }
}

// Run immediately when backend starts.
void autoCancelUnconfirmedReservations();

// Run every 15 minutes.
cron.schedule(
  "*/15 * * * *",
  () => {
    void autoCancelUnconfirmedReservations();
  },
  {
    timezone: "Asia/Manila",
  }
);

console.log(
  "[AUTO-CANCEL] Scheduler initialized."
);

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
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are missing.");
  }

  const credentials = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await axios.post(
    `${PAYPAL_BASE_URL}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
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
    const details = getPayPalErrorDetails(error);

    console.error(
      "[PAYPAL TEST] Authentication failed:",
      details
    );

    return res.status(502).json({
      success: false,
      message: "PayPal authentication failed.",
      providerStatus: details.providerStatus,
      providerCode: details.providerCode,
      providerMessage: details.message,
      debugId: details.debugId,
      mode: PAYPAL_MODE,
      credentialsPresent: {
        clientId: Boolean(PAYPAL_CLIENT_ID),
        clientSecret: Boolean(PAYPAL_CLIENT_SECRET),
      },
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

      if (reservation.userId !== req.user.uid) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to pay for this reservation.",
        });
      }

      if (reservation.paymentMethod !== "paypal") {
        return res.status(400).json({
          success: false,
          message: "This reservation is not configured for PayPal.",
        });
      }

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

      // Always get the payment amount from Firestore.
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

      const returnUrl = buildReturnUrl(
        PAYPAL_RETURN_URL,
        reservationId
      );

      const cancelUrl = buildReturnUrl(
        PAYPAL_CANCEL_URL,
        reservationId
      );

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
      const details = getPayPalErrorDetails(error);

      console.error(
        "[PAYPAL CREATE ORDER] Failed:",
        details
      );

      return res.status(502).json({
        success: false,
        message: "Unable to create PayPal order.",
        providerStatus: details.providerStatus,
        providerCode: details.providerCode,
        providerMessage: details.message,
        debugId: details.debugId,
      });
    }
  }
);

// ==================================================
// 11. CAPTURE PAYPAL ORDER AND SAVE RECEIPT
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
        typeof reservationId !== "string" ||
        !reservationId.trim()
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

      // Verify reservation ownership.
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

      if (reservation.paypalOrderId !== orderId) {
        return res.status(400).json({
          success: false,
          message: "PayPal order does not match this reservation.",
        });
      }

      const expectedAmount = Number(reservation.pricing?.total);

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

      // Get PayPal access token.
      const accessToken = await generateAccessToken();

      const paypalHeaders = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      };

      // Retrieve original PayPal order before capturing.
      const orderResponse = await axios.get(
        `${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
        {
          headers: paypalHeaders,
          timeout: 30000,
        }
      );

      let orderDetails = orderResponse.data;

      if (orderDetails.id !== orderId) {
        return res.status(400).json({
          success: false,
          message: "PayPal returned an unexpected order.",
        });
      }

      let purchaseUnit = orderDetails.purchase_units?.[0];

      if (!purchaseUnit) {
        return res.status(400).json({
          success: false,
          message: "PayPal order has no purchase details.",
        });
      }

      // Verify reservation reference from the original order.
      const customId = purchaseUnit.custom_id;
      const referenceId = purchaseUnit.reference_id;

      const hasMatchingReference =
        customId === reservationId ||
        referenceId === reservationId;

      const hasConflictingReference =
        (Boolean(customId) && customId !== reservationId) ||
        (Boolean(referenceId) && referenceId !== reservationId);

      if (!hasMatchingReference || hasConflictingReference) {
        console.error("PayPal reservation reference mismatch:", {
          reservationId,
          customId: customId || null,
          referenceId: referenceId || null,
        });

        return res.status(400).json({
          success: false,
          message: "PayPal order reference does not match the reservation.",
        });
      }

      // Verify original order amount and currency.
      const orderAmount = Number(purchaseUnit.amount?.value);

      const orderCurrency = String(
        purchaseUnit.amount?.currency_code || ""
      ).toUpperCase();

      if (
        !Number.isFinite(orderAmount) ||
        amountInCents(orderAmount) !== amountInCents(expectedAmount) ||
        orderCurrency !== expectedCurrency
      ) {
        console.error("PayPal original order amount mismatch:", {
          reservationId,
          expectedAmount,
          expectedCurrency,
          orderAmount,
          orderCurrency,
        });

        return res.status(400).json({
          success: false,
          message: "PayPal order amount does not match the reservation.",
        });
      }

      // Capture only approved orders.
      // Never capture an already completed order again.
      if (orderDetails.status !== "COMPLETED") {
        if (orderDetails.status !== "APPROVED") {
          return res.status(400).json({
            success: false,
            message: `PayPal order is not approved. Current status: ${
              orderDetails.status || "UNKNOWN"
            }.`,
            paymentStatus: orderDetails.status || "UNKNOWN",
          });
        }

        try {
          await axios.post(
            `${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
            {},
            {
              headers: {
                ...paypalHeaders,
                "PayPal-Request-Id": `capture-${orderId}`,
              },
              timeout: 30000,
            }
          );
        } catch (captureError) {
          // A timeout does not necessarily mean capture failed.
          // Retrieve the order again before deciding what happened.
          console.warn(
            "PayPal capture response was interrupted. Checking order status..."
          );

          const recoveryResponse = await axios.get(
            `${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
            {
              headers: paypalHeaders,
              timeout: 30000,
            }
          );

          orderDetails = recoveryResponse.data;

          if (orderDetails.status !== "COMPLETED") {
            throw captureError;
          }
        }

        // Retrieve the latest order and capture details.
        if (orderDetails.status !== "COMPLETED") {
          const latestResponse = await axios.get(
            `${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
            {
              headers: paypalHeaders,
              timeout: 30000,
            }
          );

          orderDetails = latestResponse.data;
        }
      }

      if (orderDetails.status !== "COMPLETED") {
        return res.status(400).json({
          success: false,
          message: "PayPal payment has not been completed.",
          paymentStatus: orderDetails.status || "UNKNOWN",
        });
      }

      // Read actual completed capture.
      purchaseUnit = orderDetails.purchase_units?.[0];

      const captures = purchaseUnit?.payments?.captures || [];

      const capture = captures.find(
        (item) => item.status === "COMPLETED"
      );

      if (!capture?.id) {
        return res.status(400).json({
          success: false,
          message: "No completed PayPal capture was found.",
        });
      }

      const capturedAmount = Number(capture.amount?.value);

      const capturedCurrency = String(
        capture.amount?.currency_code || ""
      ).toUpperCase();

      // Verify actual captured amount and currency.
      if (
        !Number.isFinite(capturedAmount) ||
        amountInCents(capturedAmount) !== amountInCents(expectedAmount) ||
        capturedCurrency !== expectedCurrency
      ) {
        console.error("PayPal captured amount mismatch:", {
          reservationId,
          captureId: capture.id,
          expectedAmount,
          expectedCurrency,
          capturedAmount,
          capturedCurrency,
        });

        return res.status(400).json({
          success: false,
          message: "Captured PayPal amount does not match the reservation.",
        });
      }

      const payerEmail =
        orderDetails.payer?.email_address || null;

      // Build receipt using verified PayPal details.
      const receipt = buildPayPalReceipt({
        reservation,
        reservationId,
        orderId,
        captureId: capture.id,
        amount: capturedAmount,
        currency: capturedCurrency,
        payerEmail,
      });

      // Atomically save payment status and receipt.
      const finalReceipt = await db.runTransaction(
        async (transaction) => {
          const latestSnap = await transaction.get(reservationRef);

          if (!latestSnap.exists) {
            throw new Error("Reservation no longer exists.");
          }

          const latestReservation = latestSnap.data();

          if (latestReservation.userId !== req.user.uid) {
            throw new Error("Reservation ownership verification failed.");
          }

          if (latestReservation.paymentMethod !== "paypal") {
            throw new Error("Reservation payment method has changed.");
          }

          if (latestReservation.paypalOrderId !== orderId) {
            throw new Error("PayPal order no longer matches reservation.");
          }

          // Reuse an existing receipt if payment was already saved.
          if (
            latestReservation.paymentStatus === "paid" &&
            latestReservation.receipt
          ) {
            return latestReservation.receipt;
          }

          const latestAmount = Number(
            latestReservation.pricing?.total
          );

          const latestCurrency = String(
            latestReservation.pricing?.currency || "PHP"
          ).toUpperCase();

          if (
            !Number.isFinite(latestAmount) ||
            amountInCents(latestAmount) !== amountInCents(capturedAmount) ||
            latestCurrency !== capturedCurrency
          ) {
            throw new Error(
              "Reservation amount changed during payment verification."
            );
          }

          transaction.update(reservationRef, {
            paymentStatus: "paid",
            paypalOrderStatus: "COMPLETED",
            paypalCaptureId: capture.id,
            paypalPayerEmail: payerEmail,
            paidAt: FieldValue.serverTimestamp(),
            receipt,
            updatedAt: FieldValue.serverTimestamp(),
          });

          return {
            ...receipt,
            issuedAt: new Date().toISOString(),
          };
        }
      );

      console.log("PayPal payment verified successfully:", {
        reservationId,
        orderId,
        captureId: capture.id,
        amount: capturedAmount,
        currency: capturedCurrency,
      });

      return res.json({
        success: true,
        message: "PayPal payment completed successfully!",
        orderId,
        captureId: capture.id,
        paymentStatus: "paid",
        receipt: finalReceipt,
      });

    } catch (error) {
      const details = getPayPalErrorDetails(error);

      console.error(
        "[PAYPAL CAPTURE] Failed:",
        details
      );

      return res.status(502).json({
        success: false,
        message:
          "Unable to verify PayPal payment. Check the PayPal order status before retrying.",
        providerStatus: details.providerStatus,
        providerCode: details.providerCode,
        providerMessage: details.message,
        debugId: details.debugId,
      });
    }
  }
);

// ==================================================
// 12. OPENWEATHER API INTEGRATION
// ==================================================

const OPENWEATHER_API_KEY = String(
  process.env.OPENWEATHER_API_KEY || ""
).trim();

const OPENWEATHER_BASE_URL =
  "https://api.openweathermap.org/data/2.5";

// Log only safe metadata. Never print the complete API key.
console.log("[WEATHER CONFIG]", {
  configured: Boolean(OPENWEATHER_API_KEY),
  keyLength: OPENWEATHER_API_KEY.length,
  keyPreview: OPENWEATHER_API_KEY
    ? `${OPENWEATHER_API_KEY.slice(0, 4)}...${OPENWEATHER_API_KEY.slice(-4)}`
    : "EMPTY",
});

// ==================================================
// WEATHER LOCATION VALIDATION
// ==================================================

function getWeatherParams(req) {
  const { city, lat, lon } = req.query;

  if (lat !== undefined || lon !== undefined) {
    if (lat === undefined || lon === undefined) {
      return null;
    }

    const latitude = Number(lat);
    const longitude = Number(lon);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }

    return {
      lat: latitude,
      lon: longitude,
    };
  }

  const location = String(
    city || "Victoria,PH"
  ).trim();

  if (!location || location.length > 100) {
    return null;
  }

  return { q: location };
}

// ==================================================
// WEATHER ERROR HANDLER
// ==================================================

function getWeatherErrorDetails(error) {
  return {
    message: error.message || "Unknown request error",
    code: error.code || null,
    status: error.response?.status || null,
    providerMessage:
      error.response?.data?.message ||
      error.response?.data?.error ||
      null,
  };
}

function sendWeatherError(res, error, operation) {
  const details = getWeatherErrorDetails(error);

  console.error(`[WEATHER] ${operation} failed:`, details);

  if (error.response?.status === 401) {
    return res.status(502).json({
      success: false,
      code: "OPENWEATHER_UNAUTHORIZED",
      message:
        "OpenWeather rejected the configured API key. Check that server/.env contains the correct OPENWEATHER_API_KEY, then verify the key status in your OpenWeather account. This response does not mean the server needs a new key.",
      providerStatus: 401,
      providerMessage: details.providerMessage,
    });
  }

  if (error.response?.status === 404) {
    return res.status(404).json({
      success: false,
      code: "WEATHER_LOCATION_NOT_FOUND",
      message: "Weather location was not found.",
      providerMessage: details.providerMessage,
    });
  }

  if (error.response?.status === 429) {
    return res.status(503).json({
      success: false,
      code: "OPENWEATHER_RATE_LIMIT",
      message:
        "OpenWeather request limit reached. Please try again later.",
      providerStatus: 429,
    });
  }

  if (error.code === "ECONNABORTED") {
    return res.status(504).json({
      success: false,
      code: "WEATHER_REQUEST_TIMEOUT",
      message: "Weather provider took too long to respond.",
    });
  }

  if (error.response) {
    return res.status(502).json({
      success: false,
      code: "OPENWEATHER_REQUEST_FAILED",
      message: "OpenWeather could not complete the request.",
      providerStatus: error.response.status,
      providerMessage: details.providerMessage,
    });
  }

  return res.status(502).json({
    success: false,
    code: "WEATHER_CONNECTION_FAILED",
    message:
      "Unable to connect to OpenWeather. Check the server internet connection.",
    errorCode: details.code,
  });
}

// ==================================================
// CURRENT WEATHER
// ==================================================

app.get("/api/weather/current", async (req, res) => {
  console.log("[WEATHER] Current weather route reached.");

  try {
    if (!OPENWEATHER_API_KEY) {
      console.error("[WEATHER] API key is missing.");

      return res.status(503).json({
        success: false,
        code: "WEATHER_API_KEY_MISSING",
        message: "Weather API key is not configured.",
      });
    }

    const location = getWeatherParams(req);

    if (!location) {
      return res.status(400).json({
        success: false,
        code: "INVALID_WEATHER_LOCATION",
        message: "Invalid weather location.",
      });
    }

    console.log(
      "[WEATHER] Requesting current weather from OpenWeather..."
    );

    const response = await axios.get(
      `${OPENWEATHER_BASE_URL}/weather`,
      {
        params: {
          ...location,
          appid: OPENWEATHER_API_KEY,
          units: "metric",
        },
        timeout: 15000,
      }
    );

    const weather = response.data;

    console.log(
      `[WEATHER] Current weather received for ${weather.name}.`
    );

    return res.json({
      success: true,
      data: {
        location: weather.name,
        country: weather.sys?.country,
        temperature: weather.main?.temp,
        feelsLike: weather.main?.feels_like,
        humidity: weather.main?.humidity,
        pressure: weather.main?.pressure,
        condition: weather.weather?.[0]?.main,
        description: weather.weather?.[0]?.description,
        icon: weather.weather?.[0]?.icon,
        windSpeed: weather.wind?.speed,
        windDirection: weather.wind?.deg,
        clouds: weather.clouds?.all,
        rain: weather.rain?.["1h"] || 0,
        sunrise: weather.sys?.sunrise,
        sunset: weather.sys?.sunset,
        timestamp: weather.dt,
      },
    });

  } catch (error) {
    return sendWeatherError(
      res,
      error,
      "Current weather"
    );
  }
});

// ==================================================
// FIVE-DAY WEATHER FORECAST
// ==================================================

app.get("/api/weather/forecast", async (req, res) => {
  console.log("[WEATHER] Forecast route reached.");

  try {
    if (!OPENWEATHER_API_KEY) {
      return res.status(503).json({
        success: false,
        code: "WEATHER_API_KEY_MISSING",
        message: "Weather API key is not configured.",
      });
    }

    const location = getWeatherParams(req);

    if (!location) {
      return res.status(400).json({
        success: false,
        code: "INVALID_WEATHER_LOCATION",
        message: "Invalid weather location.",
      });
    }

    console.log(
      "[WEATHER] Requesting forecast from OpenWeather..."
    );

    const response = await axios.get(
      `${OPENWEATHER_BASE_URL}/forecast`,
      {
        params: {
          ...location,
          appid: OPENWEATHER_API_KEY,
          units: "metric",
        },
        timeout: 15000,
      }
    );

    const forecast = response.data;

    console.log(
      `[WEATHER] Forecast received for ${forecast.city?.name}.`
    );

    return res.json({
      success: true,
      location: forecast.city?.name,
      country: forecast.city?.country,
      timezone: forecast.city?.timezone,

      data: (forecast.list || []).map((item) => ({
        dateTime: item.dt_txt,
        timestamp: item.dt,
        temperature: item.main?.temp,
        feelsLike: item.main?.feels_like,
        humidity: item.main?.humidity,
        condition: item.weather?.[0]?.main,
        description: item.weather?.[0]?.description,
        icon: item.weather?.[0]?.icon,
        windSpeed: item.wind?.speed,
        rainProbability: item.pop,
        rainfall: item.rain?.["3h"] || 0,
      })),
    });

  } catch (error) {
    return sendWeatherError(
      res,
      error,
      "Forecast"
    );
  }
});

// ==================================================
// WEATHER API CONFIGURATION CHECK
// ==================================================

app.get("/api/weather/health", (req, res) => {
  return res.json({
    success: true,
    configured: Boolean(OPENWEATHER_API_KEY),
    keyLength: OPENWEATHER_API_KEY.length,
    provider: "OpenWeather",
    message: OPENWEATHER_API_KEY
      ? "The server loaded an OpenWeather API key from server/.env. This does not yet confirm that OpenWeather has activated or accepted it."
      : "OPENWEATHER_API_KEY was not found. Check the server/.env file.",
  });
});

// ==================================================
// ACTUAL OPENWEATHER CONNECTION TEST
// ==================================================

app.get("/api/weather/test-connection", async (req, res) => {
  console.log("[WEATHER] Provider connection test requested.");

  if (!OPENWEATHER_API_KEY) {
    return res.status(503).json({
      success: false,
      code: "WEATHER_API_KEY_MISSING",
      message: "Weather API key is not configured.",
    });
  }

  try {
    const response = await axios.get(
      `${OPENWEATHER_BASE_URL}/weather`,
      {
        params: {
          q: "Victoria,PH",
          appid: OPENWEATHER_API_KEY,
          units: "metric",
        },
        timeout: 15000,
      }
    );

    return res.json({
      success: true,
      message:
        "OpenWeather authentication and request succeeded.",
      location: response.data.name,
      country: response.data.sys?.country,
      temperature: response.data.main?.temp,
      condition:
        response.data.weather?.[0]?.description,
    });

  } catch (error) {
    return sendWeatherError(
      res,
      error,
      "Connection test"
    );
  }
});

// ==================================================
// 13. NOT FOUND HANDLER
// ==================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// ==================================================
// 14. GLOBAL ERROR HANDLER
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
// 15. START SERVER
// ==================================================

app.listen(PORT, () => {
  console.log("----------------------------------------");
  console.log("MINDORO SCAPE BACKEND");
  console.log("----------------------------------------");
  console.log("Firebase Admin: connected");
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`PayPal mode: ${PAYPAL_MODE}`);
  console.log(
    `PayPal Client ID: ${PAYPAL_CLIENT_ID ? "loaded" : "MISSING"}`
  );
  console.log(
    `PayPal Client Secret: ${PAYPAL_CLIENT_SECRET ? "loaded" : "MISSING"}`
  );
  console.log(
    `OpenWeather key: ${OPENWEATHER_API_KEY ? "loaded" : "MISSING"}`
  );
  console.log("----------------------------------------");
});