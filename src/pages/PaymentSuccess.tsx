import React, { useEffect, useState } from 'react';
import {
  IonContent,
  IonPage,
  IonSpinner,
} from '@ionic/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Printer,
  X,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const API_URL =
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';

interface PaymentReceipt {
  receiptNumber?: string;
  reservationId?: string;
  referenceCode?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  amount?: number | string;
  currency?: string;
  transactionId?: string;
  orderId?: string;
  payerEmail?: string;
  issuedAt?: string | {
    seconds?: number;
    _seconds?: number;
  };
  issuedBy?: string;
}

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // PayPal automatically returns the order ID as "token".
  const orderId = searchParams.get('token');
  const reservationId = searchParams.get('reservationId');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState(
    'Verifying your PayPal payment...'
  );
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let captureStarted = false;

    const capturePayment = async (user: NonNullable<typeof auth.currentUser>) => {
      if (captureStarted) return;
      captureStarted = true;

      try {
        if (!orderId || !reservationId) {
          throw new Error(
            'Missing PayPal order ID or reservation reference. Please check your booking.'
          );
        }

        const idToken = await user.getIdToken(true);

        const response = await fetch(
          `${API_URL}/api/paypal/capture-order/${encodeURIComponent(orderId)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ reservationId }),
          }
        );

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            result?.message ||
              `Payment verification failed. Server returned ${response.status}.`
          );
        }

        if (
          result?.success !== true ||
          result?.paymentStatus !== 'paid'
        ) {
          throw new Error(
            result?.message || 'PayPal payment has not been confirmed.'
          );
        }

        if (cancelled) return;

        setSuccess(true);
        setMessage(
          'Your PayPal payment has been completed and verified successfully!'
        );

        if (result.receipt) {
          setReceipt(result.receipt);
          setShowReceipt(true);
        }
      } catch (error) {
        console.error('PayPal capture error:', error);

        if (cancelled) return;

        setSuccess(false);

        setMessage(
          error instanceof TypeError
            ? 'Unable to connect to the payment server. Make sure your backend is running and the API URL is correct.'
            : error instanceof Error
              ? error.message
              : 'An unexpected error occurred while verifying your payment.'
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (!orderId || !reservationId) {
      setSuccess(false);
      setMessage(
        'Missing PayPal order ID or reservation reference. The payment could not be verified.'
      );
      setLoading(false);

      return;
    }

    // Wait for Firebase to restore the signed-in user.
    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (cancelled) return;

        if (!user) {
          setSuccess(false);
          setMessage(
            'Your login session could not be verified. Please sign in again and check your booking before attempting another payment.'
          );
          setLoading(false);
          return;
        }

        void capturePayment(user);
      },
      (error) => {
        console.error('Firebase authentication error:', error);

        if (!cancelled) {
          setSuccess(false);
          setMessage(
            'Unable to verify your login session. Please sign in again.'
          );
          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [orderId, reservationId]);

  const formatDate = (
    dateValue?: PaymentReceipt['issuedAt']
  ) => {
    if (!dateValue) return new Date().toLocaleString();

    let date: Date;

    if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      const seconds =
        dateValue.seconds ?? dateValue._seconds;

      date = seconds
        ? new Date(seconds * 1000)
        : new Date();
    }

    return Number.isNaN(date.getTime())
      ? new Date().toLocaleString()
      : date.toLocaleString();
  };

  const formatAmount = () => {
    if (receipt?.amount === undefined || receipt.amount === null) {
      return '—';
    }

    const amount = Number(receipt.amount);
    const currency = receipt.currency || 'PHP';

    if (!Number.isFinite(amount)) {
      return `${receipt.amount} ${currency}`;
    }

    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const handleViewBookings = () => {
    navigate('/user/bookings', {
      replace: true,
      state: { reservationId },
    });
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <style>
          {`
            .payment-success-page {
              min-height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 24px;
              background: #f8f9ff;
            }

            .payment-result-card {
              width: 100%;
              max-width: 460px;
              padding: 32px;
              border-radius: 20px;
              background: #ffffff;
              text-align: center;
              box-shadow: 0 8px 30px rgba(0,0,0,0.07);
            }

            .payment-result-card h2 {
              margin: 18px 0 8px;
              color: #1f2937;
              font-size: 25px;
              font-weight: 800;
            }

            .payment-result-card p {
              color: #6b7280;
              line-height: 1.6;
              overflow-wrap: anywhere;
            }

            .payment-primary-button,
            .payment-secondary-button {
              width: 100%;
              padding: 14px 18px;
              margin-top: 12px;
              border-radius: 10px;
              font-weight: 700;
              cursor: pointer;
            }

            .payment-primary-button {
              border: none;
              background: #ef9418;
              color: #ffffff;
            }

            .payment-secondary-button {
              border: 1px solid #e5e7eb;
              background: #ffffff;
              color: #333333;
            }

            .receipt-overlay {
              position: fixed;
              inset: 0;
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 18px;
              background: rgba(15, 23, 42, 0.65);
              overflow-y: auto;
            }

            .receipt-modal {
              width: 100%;
              max-width: 520px;
              max-height: 92vh;
              overflow-y: auto;
              border-radius: 18px;
              background: #ffffff;
              box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            }

            .receipt-modal-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 18px 22px;
              border-bottom: 1px solid #e5e7eb;
            }

            .receipt-modal-header h3 {
              margin: 0;
              color: #1f2937;
              font-size: 18px;
              font-weight: 800;
            }

            .receipt-close-button {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 36px;
              height: 36px;
              border: none;
              border-radius: 50%;
              background: #f3f4f6;
              color: #374151;
              cursor: pointer;
            }

            .receipt-content {
              padding: 28px;
              color: #1f2937;
            }

            .receipt-brand {
              text-align: center;
              padding-bottom: 22px;
              border-bottom: 1px dashed #d1d5db;
            }

            .receipt-brand h2 {
              margin: 0;
              color: #ef9418;
              font-size: 25px;
              font-weight: 900;
              letter-spacing: 1px;
            }

            .receipt-brand p {
              margin: 6px 0 0;
              color: #6b7280;
              font-size: 12px;
            }

            .receipt-paid {
              margin: 20px 0;
              text-align: center;
            }

            .receipt-paid strong {
              display: block;
              margin-top: 8px;
              color: #15803d;
              font-size: 17px;
            }

            .receipt-amount {
              margin: 12px 0 22px;
              text-align: center;
              font-size: 30px;
              font-weight: 900;
              color: #111827;
              overflow-wrap: anywhere;
            }

            .receipt-details {
              border-top: 1px dashed #d1d5db;
              border-bottom: 1px dashed #d1d5db;
              padding: 16px 0;
            }

            .receipt-row {
              display: flex;
              justify-content: space-between;
              gap: 14px;
              margin: 12px 0;
              font-size: 13px;
            }

            .receipt-row span:first-child {
              color: #6b7280;
            }

            .receipt-row strong {
              max-width: 65%;
              text-align: right;
              overflow-wrap: anywhere;
              color: #1f2937;
            }

            .receipt-footer {
              padding-top: 18px;
              text-align: center;
              color: #6b7280;
              font-size: 12px;
              line-height: 1.6;
            }

            .receipt-actions {
              display: flex;
              gap: 10px;
              padding: 18px 22px;
              border-top: 1px solid #e5e7eb;
            }

            .receipt-print-button,
            .receipt-done-button {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              padding: 13px;
              border-radius: 10px;
              font-weight: 700;
              cursor: pointer;
            }

            .receipt-print-button {
              border: none;
              background: #ef9418;
              color: white;
            }

            .receipt-done-button {
              border: 1px solid #e5e7eb;
              background: white;
              color: #374151;
            }

            @media print {
              @page {
                size: auto;
                margin: 12mm;
              }

              body * {
                visibility: hidden !important;
              }

              .receipt-overlay,
              .receipt-overlay * {
                visibility: visible !important;
              }

              .receipt-overlay {
                position: absolute !important;
                inset: 0 !important;
                display: block !important;
                padding: 0 !important;
                overflow: visible !important;
                background: white !important;
              }

              .receipt-modal {
                width: 100% !important;
                max-width: 100% !important;
                max-height: none !important;
                overflow: visible !important;
                box-shadow: none !important;
                border-radius: 0 !important;
              }

              .receipt-modal-header,
              .receipt-actions {
                display: none !important;
              }

              .receipt-content {
                padding: 10px !important;
              }
            }

            @media (max-width: 480px) {
              .payment-result-card {
                padding: 26px 20px;
              }

              .receipt-content {
                padding: 22px 18px;
              }

              .receipt-actions {
                flex-direction: column;
              }
            }
          `}
        </style>

        <div className="payment-success-page">
          <div className="payment-result-card">
            {loading ? (
              <>
                <IonSpinner name="crescent" color="warning" />
                <h2>Verifying Payment</h2>
                <p>{message}</p>
              </>
            ) : success ? (
              <>
                <CheckCircle2
                  size={58}
                  color="#16a34a"
                  style={{ margin: '0 auto' }}
                />

                <h2>Payment Successful!</h2>
                <p>{message}</p>

                {receipt ? (
                  <button
                    type="button"
                    className="payment-primary-button"
                    onClick={() => setShowReceipt(true)}
                  >
                    View Payment Receipt
                  </button>
                ) : (
                  <p style={{ fontSize: 13 }}>
                    Your payment was verified successfully.
                    Please check your booking details for the receipt.
                  </p>
                )}

                <button
                  type="button"
                  className="payment-secondary-button"
                  onClick={handleViewBookings}
                >
                  View My Bookings
                </button>

                <button
                  type="button"
                  className="payment-secondary-button"
                  onClick={() =>
                    navigate('/user/dashboard', { replace: true })
                  }
                >
                  Back to Dashboard
                </button>
              </>
            ) : (
              <>
                <AlertCircle
                  size={58}
                  color="#dc2626"
                  style={{ margin: '0 auto' }}
                />

                <h2>Payment Not Verified</h2>
                <p>{message}</p>

                <button
                  type="button"
                  className="payment-primary-button"
                  onClick={handleViewBookings}
                >
                  View My Bookings
                </button>

                <button
                  type="button"
                  className="payment-secondary-button"
                  onClick={() =>
                    navigate('/user/dashboard', { replace: true })
                  }
                >
                  Back to Dashboard
                </button>
              </>
            )}
          </div>
        </div>

        {showReceipt && receipt && (
          <div className="receipt-overlay">
            <div className="receipt-modal">
              <div className="receipt-modal-header">
                <h3>Payment Receipt</h3>

                <button
                  type="button"
                  className="receipt-close-button"
                  onClick={() => setShowReceipt(false)}
                  aria-label="Close receipt"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="receipt-content">
                <div className="receipt-brand">
                  <h2>MINDORO SCAPE</h2>
                  <p>Resort Booking Payment Receipt</p>
                </div>

                <div className="receipt-paid">
                  <CheckCircle2
                    size={42}
                    color="#16a34a"
                    style={{ margin: '0 auto' }}
                  />
                  <strong>PAYMENT COMPLETED</strong>
                </div>

                <div className="receipt-amount">
                  {formatAmount()}
                </div>

                <div className="receipt-details">
                  <div className="receipt-row">
                    <span>Receipt Number</span>
                    <strong>{receipt.receiptNumber || '—'}</strong>
                  </div>

                  <div className="receipt-row">
                    <span>Booking Reference</span>
                    <strong>
                      {receipt.referenceCode ||
                        receipt.reservationId ||
                        '—'}
                    </strong>
                  </div>

                  <div className="receipt-row">
                    <span>Payment Method</span>
                    <strong>{receipt.paymentMethod || 'PayPal'}</strong>
                  </div>

                  <div className="receipt-row">
                    <span>Payment Status</span>
                    <strong style={{ color: '#15803d' }}>
                      {receipt.paymentStatus?.toUpperCase() || 'PAID'}
                    </strong>
                  </div>

                  <div className="receipt-row">
                    <span>Transaction ID</span>
                    <strong>{receipt.transactionId || '—'}</strong>
                  </div>

                  <div className="receipt-row">
                    <span>PayPal Order ID</span>
                    <strong>{receipt.orderId || orderId || '—'}</strong>
                  </div>

                  {receipt.payerEmail && (
                    <div className="receipt-row">
                      <span>PayPal Email</span>
                      <strong>{receipt.payerEmail}</strong>
                    </div>
                  )}

                  <div className="receipt-row">
                    <span>Date Issued</span>
                    <strong>{formatDate(receipt.issuedAt)}</strong>
                  </div>
                </div>

                <div className="receipt-footer">
                  <p>
                    Thank you for booking with Mindoro Scape!
                  </p>
                  <p>
                    This receipt confirms that your PayPal payment
                    was successfully processed.
                  </p>
                </div>
              </div>

              <div className="receipt-actions">
                <button
                  type="button"
                  className="receipt-print-button"
                  onClick={handlePrintReceipt}
                >
                  <Printer size={18} />
                  Print / Save PDF
                </button>

                <button
                  type="button"
                  className="receipt-done-button"
                  onClick={() => setShowReceipt(false)}
                >
                  Close Receipt
                </button>
              </div>
            </div>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default PaymentSuccess;
