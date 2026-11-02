
import React, { useEffect, useRef, useState } from 'react';
import {
  IonContent,
  IonPage,
  IonSpinner,
} from '@ionic/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { auth } from '../firebase';

const API_URL = 'http://localhost:3000';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const orderId = searchParams.get('token');
  const reservationId = searchParams.get('reservationId');

  const started = useRef(false);

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('Verifying your PayPal payment...');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const capturePayment = async () => {
      try {
        if (!orderId || !reservationId) {
          throw new Error('Missing PayPal order or reservation reference.');
        }

        const user = auth.currentUser;

        if (!user) {
          throw new Error('Please sign in again to verify your payment.');
        }

        const idToken = await user.getIdToken();

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

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success !== true || result.paymentStatus !== 'paid') {
          throw new Error(
            result.message || 'We could not verify your PayPal payment.'
          );
        }

        setSuccess(true);
        setMessage('Your PayPal payment has been completed successfully!');
      } catch (error) {
        console.error('PayPal capture error:', error);

        setSuccess(false);
        setMessage(
          error instanceof Error
            ? error.message
            : 'An error occurred while verifying your payment.'
        );
      } finally {
        setLoading(false);
      }
    };

    void capturePayment();
  }, [orderId, reservationId]);

  return (
    <IonPage>
      <IonContent fullscreen>
        <div
          style={{
            minHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: '#f8f9ff',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              padding: 32,
              borderRadius: 20,
              background: '#ffffff',
              textAlign: 'center',
              boxShadow: '0 8px 30px rgba(0,0,0,0.07)',
            }}
          >
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

                <button
                  type="button"
                  onClick={() => navigate('/feature/reservations', { replace: true })}
                  style={primaryButton}
                >
                  View My Bookings
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/user/dashboard', { replace: true })}
                  style={secondaryButton}
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
                  onClick={() => navigate('/feature/reservations', { replace: true })}
                  style={primaryButton}
                >
                  View My Bookings
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/user/dashboard', { replace: true })}
                  style={secondaryButton}
                >
                  Back to Dashboard
                </button>
              </>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

const primaryButton: React.CSSProperties = {
  width: '100%',
  padding: '14px 18px',
  marginTop: 20,
  border: 'none',
  borderRadius: 10,
  background: '#ef9418',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButton: React.CSSProperties = {
  width: '100%',
  padding: '14px 18px',
  marginTop: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  background: '#ffffff',
  color: '#333333',
  fontWeight: 600,
  cursor: 'pointer',
};

export default PaymentSuccess;
