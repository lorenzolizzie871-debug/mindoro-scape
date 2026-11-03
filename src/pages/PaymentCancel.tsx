
import React from 'react';
import {
  IonContent,
  IonPage,
} from '@ionic/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

const PaymentCancel: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const reservationId = searchParams.get('reservationId');

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
            <AlertCircle
              size={58}
              color="#d97706"
              style={{ margin: '0 auto' }}
            />

            <h2>Payment Cancelled</h2>

            <p>
              Your PayPal checkout was cancelled. No payment was confirmed.
              Your reservation remains unpaid and pending.
            </p>

            <button
              type="button"
              onClick={() => navigate('/feature/reservations', { replace: true })}
              style={{
                width: '100%',
                padding: '14px 18px',
                marginTop: 20,
                border: 'none',
                borderRadius: 10,
                background: '#ef9418',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              View My Bookings
            </button>

            <button
              type="button"
              onClick={() => navigate('/user/dashboard', { replace: true })}
              style={{
                width: '100%',
                padding: '14px 18px',
                marginTop: 10,
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                background: '#ffffff',
                color: '#333333',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PaymentCancel;
