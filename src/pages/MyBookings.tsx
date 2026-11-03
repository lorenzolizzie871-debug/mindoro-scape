
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IonContent,
  IonPage,
  IonSpinner,
  IonIcon,
} from '@ionic/react';

import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

import { auth, db } from '../firebase';

import {
  homeOutline,
  compassOutline,
  mapOutline,
  calendarOutline,
  heartOutline,
  personOutline,
  locationOutline,
  cardOutline,
  timeOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
} from 'ionicons/icons';

import './MyBookings.css';

type Booking = {
  id: string;
  userId?: string;
  referenceCode?: string;
  resortName?: string;
  accommodationName?: string;
  resortLocation?: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  pricing?: {
    total?: number;
    currency?: string;
  };
  createdAt?: {
    toDate?: () => Date;
  } | Date | null;
};

const money = (amount: number) =>
  `₱${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value?: string) => {
  if (!value) return 'Not specified';

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatStatus = (value?: string) => {
  if (!value) return 'Pending';

  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const MyBookings: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setBookings([]);
      setLoading(false);
      return;
    }

    const bookingsQuery = query(
      collection(db, 'reservations'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const results = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Booking[];

        results.sort((a, b) => {
          const dateA =
            a.createdAt && 'toDate' in a.createdAt &&
            typeof a.createdAt.toDate === 'function'
              ? a.createdAt.toDate().getTime()
              : 0;

          const dateB =
            b.createdAt && 'toDate' in b.createdAt &&
            typeof b.createdAt.toDate === 'function'
              ? b.createdAt.toDate().getTime()
              : 0;

          return dateB - dateA;
        });

        setBookings(results);
        setError('');
        setLoading(false);
      },
      (err) => {
        console.error('Unable to load bookings:', err);
        setError(
          'Unable to load your reservations. Please check your connection and try again.'
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const getBookingStatusClass = (status?: string) => {
    const value = (status || 'pending').toLowerCase();

    if (value === 'confirmed' || value === 'approved') {
      return 'booking-status confirmed';
    }

    if (value === 'cancelled' || value === 'declined' || value === 'rejected') {
      return 'booking-status cancelled';
    }

    if (value === 'completed') {
      return 'booking-status completed';
    }

    return 'booking-status pending';
  };

  const getPaymentStatusClass = (status?: string) => {
    const value = (status || '').toLowerCase();

    if (value === 'paid') return 'payment-status paid';

    if (value === 'unpaid' || value === 'pay_at_resort') {
      return 'payment-status unpaid';
    }

    return 'payment-status other';
  };

  const isActive = (path: string) => location.pathname === path;

  const navigationItems = [
    { label: 'Home', path: '/user/dashboard', icon: homeOutline },
    { label: 'Explore', path: '/user/explore', icon: compassOutline },
    { label: 'Map', path: '/user/map', icon: mapOutline },
    { label: 'Bookings', path: '/user/bookings', icon: calendarOutline },
    { label: 'Favorites', path: '/user/favorites', icon: heartOutline },
    { label: 'Profile', path: '/user/profile', icon: personOutline },
  ];

  return (
    <IonPage className="my-bookings-page">
      <IonContent fullscreen className="my-bookings-content">
        <div className="my-bookings-shell">

          {/* HEADER */}
          <header className="my-bookings-header">
            <button
              type="button"
              className="my-bookings-brand"
              onClick={() => navigate('/user/dashboard')}
              aria-label="Go to MINDORO SCAPE dashboard"
            >
              <img
                src="/assets/mindoro-scape-logo.png"
                alt="MINDORO SCAPE"
              />

              <span className="my-bookings-brand-copy">
                <strong>MINDORO SCAPE</strong>
                <small>
                  <IonIcon icon={locationOutline} />
                  ORIENTAL MINDORO
                </small>
              </span>
            </button>

            <button
              type="button"
              className="my-bookings-profile-button"
              onClick={() => navigate('/user/profile')}
              aria-label="Open profile"
            >
              <IonIcon icon={personOutline} />
            </button>
          </header>

          {/* PAGE INTRO */}
          <section className="my-bookings-intro">
            <div>
              <span className="my-bookings-eyebrow">
                YOUR TRAVEL ACTIVITY
              </span>

              <h1>My Bookings</h1>

              <p>
                Keep track of your resort reservations and booking updates
                in one place.
              </p>
            </div>

            <div className="my-bookings-count">
              <span>{bookings.length}</span>
              <small>
                {bookings.length === 1 ? 'Reservation' : 'Reservations'}
              </small>
            </div>
          </section>

          {/* BOOKING CONTENT */}
          <section className="my-bookings-list-section">
            <div className="my-bookings-section-heading">
              <div>
                <h2>Your Reservations</h2>
                <p>Review your booking details and payment status.</p>
              </div>
            </div>

            {loading ? (
              <div className="my-bookings-state">
                <IonSpinner name="crescent" />
                <p>Loading your reservations...</p>
              </div>
            ) : error ? (
              <div className="my-bookings-state error">
                <IonIcon icon={alertCircleOutline} />
                <h3>Something went wrong</h3>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                >
                  Try Again
                </button>
              </div>
            ) : bookings.length === 0 ? (
              <div className="my-bookings-empty">
                <div className="my-bookings-empty-icon">
                  <IonIcon icon={calendarOutline} />
                </div>

                <h2>No bookings yet</h2>

                <p>
                  You have not made any reservations. Start exploring
                  resorts and plan your next getaway.
                </p>

                <button
                  type="button"
                  onClick={() => navigate('/user/explore')}
                >
                  <IonIcon icon={compassOutline} />
                  Explore Resorts
                </button>
              </div>
            ) : (
              <div className="my-bookings-list">
                {bookings.map((booking) => (
                  <article
                    key={booking.id}
                    className="my-booking-card"
                  >
                    <div className="my-booking-card-top">
                      <div className="my-booking-title">
                        <span className="my-booking-reference">
                          BOOKING REFERENCE
                        </span>

                        <strong>
                          {booking.referenceCode || booking.id}
                        </strong>

                        <h3>
                          {booking.resortName || 'Resort'}
                        </h3>

                        <p className="my-booking-accommodation">
                          {booking.accommodationName || 'Accommodation'}
                        </p>
                      </div>

                      <span className={getBookingStatusClass(booking.status)}>
                        {formatStatus(booking.status)}
                      </span>
                    </div>

                    <div className="my-booking-details">
                      <div className="my-booking-detail">
                        <span className="my-booking-detail-icon">
                          <IonIcon icon={locationOutline} />
                        </span>

                        <div>
                          <small>Location</small>
                          <strong>
                            {booking.resortLocation || 'Not specified'}
                          </strong>
                        </div>
                      </div>

                      <div className="my-booking-detail">
                        <span className="my-booking-detail-icon">
                          <IonIcon icon={calendarOutline} />
                        </span>

                        <div>
                          <small>Booking Dates</small>
                          <strong>
                            {formatDate(booking.checkIn)}
                            <span className="booking-date-separator"> – </span>
                            {formatDate(booking.checkOut)}
                          </strong>
                        </div>
                      </div>

                      <div className="my-booking-detail">
                        <span className="my-booking-detail-icon">
                          <IonIcon icon={cardOutline} />
                        </span>

                        <div>
                          <small>Payment Method</small>
                          <strong>
                            {booking.paymentMethod
                              ? booking.paymentMethod.toUpperCase() === 'ONSITE'
                                ? 'Pay at the Resort'
                                : booking.paymentMethod.toUpperCase()
                              : 'Not specified'}
                          </strong>
                        </div>
                      </div>

                      <div className="my-booking-detail">
                        <span className="my-booking-detail-icon">
                          <IonIcon icon={timeOutline} />
                        </span>

                        <div>
                          <small>Payment Status</small>
                          <span className={getPaymentStatusClass(booking.paymentStatus)}>
                            {formatStatus(booking.paymentStatus)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="my-booking-card-footer">
                      <div className="my-booking-total">
                        <small>Total Amount</small>
                        <strong>
                          {money(booking.pricing?.total || 0)}
                        </strong>
                      </div>

                      <div className="my-booking-footer-note">
                        <IonIcon icon={checkmarkCircleOutline} />
                        <span>
                          {booking.status?.toLowerCase() === 'confirmed'
                            ? 'Your reservation is confirmed'
                            : 'Waiting for resort confirmation'}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* BOTTOM SPACE */}
          <div className="my-bookings-bottom-space" />
        </div>
      </IonContent>

      {/* BOTTOM NAVIGATION */}
      <nav className="my-bookings-bottom-nav" aria-label="Main navigation">
        {navigationItems.map((item) => {
          const active = isActive(item.path);

          return (
            <button
              key={item.path}
              type="button"
              className={`my-bookings-nav-item ${active ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              aria-current={active ? 'page' : undefined}
            >
              <IonIcon icon={item.icon} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </IonPage>
  );
};

export default MyBookings;
