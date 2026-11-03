
import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon, IonSpinner } from '@ionic/react';

import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

import {
  calendarOutline,
  cashOutline,
  checkmarkCircleOutline,
  walletOutline,
  searchOutline,
  addCircleOutline,
  personOutline,
  locationOutline,
  closeCircleOutline,
  alertCircleOutline,
  cardOutline,
  receiptOutline,
} from 'ionicons/icons';

import { db } from '../../firebase';
import './OwnerBookings.css';

// ==================================================
// TYPES
// ==================================================

type Booking = {
  id: string;
  ownerId?: string;
  userId?: string;
  resortId?: string;
  resortName?: string;
  referenceCode?: string;

  guest?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };

  checkIn?: string;
  checkOut?: string;
  nights?: number;
  adults?: number;
  children?: number;
  quantity?: number;

  rate?: {
    label?: string;
    unit?: string;
    price?: number;
  };

  accommodationName?: string;

  pricing?: {
    subtotal?: number;
    total?: number;
    currency?: string;
  };

  paymentMethod?: string;
  paymentStatus?: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  receipt?: {
    receiptNumber?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    amount?: number;
    currency?: string;
    transactionId?: string | null;
    orderId?: string;
    payerEmail?: string;
    issuedAt?: {
      toDate?: () => Date;
    } | Date | string;
    issuedBy?: string;
  };

  status?: string;
  notes?: string;

  createdAt?: {
    toDate?: () => Date;
  } | Date | string;
};

type Props = {
  ownerId: string;
  resortName: string;
  onAddPackage: () => void;
};

type Filter =
  | 'all'
  | 'pending'
  | 'cod'
  | 'paid'
  | 'confirmed'
  | 'cancelled';

type PaymentKind = 'pending' | 'cod' | 'paid' | 'other';

// ==================================================
// HELPERS
// ==================================================

const normalize = (value?: string) =>
  String(value || '').trim().toLowerCase();

const money = (value: number) =>
  `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateLabel = (value?: string) => {
  if (!value) return 'Date not set';

  const parsed = new Date(`${value}T12:00:00`);

  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
};

const isCancelled = (booking: Booking) =>
  ['cancelled', 'declined'].includes(normalize(booking.status));

const isConfirmed = (booking: Booking) =>
  ['confirmed', 'approved', 'checked_in', 'completed'].includes(
    normalize(booking.status)
  );

const paymentKind = (booking: Booking): PaymentKind => {
  const status = normalize(booking.paymentStatus);
  const method = normalize(booking.paymentMethod);

  if (['paid', 'succeeded', 'completed'].includes(status)) {
    return 'paid';
  }

  if (
    ['onsite', 'cod', 'cash_on_arrival', 'pay_at_resort'].includes(method) ||
    status === 'pay_at_resort'
  ) {
    return 'cod';
  }

  if (
    ['unpaid', 'pending', 'pending_payment', ''].includes(status)
  ) {
    return 'pending';
  }

  return 'other';
};

const getBookingDate = (value: Booking['createdAt']): number => {
  if (!value) return 0;

  if (
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate().getTime();
  }

  const date = new Date(value as string | Date);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const getTotal = (booking: Booking) =>
  Number(
    booking.pricing?.total ??
    booking.pricing?.subtotal ??
    0
  );

const getPaymentLabel = (booking: Booking) => {
  const method = normalize(booking.paymentMethod);

  if (method === 'paypal') return 'PayPal';

  if (
    ['onsite', 'cod', 'cash_on_arrival', 'pay_at_resort'].includes(method)
  ) {
    return 'Cash on Arrival';
  }

  return booking.paymentMethod || 'Not specified';
};

// ==================================================
// COMPONENT
// ==================================================

const OwnerBookings: React.FC<Props> = ({
  ownerId,
  resortName,
  onAddPackage,
}) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Booking | null>(null);

  // ==================================================
  // FIRESTORE REAL-TIME LISTENER
  // ==================================================

  useEffect(() => {
    if (!ownerId) {
      setBookings([]);
      setLoading(false);
      setLoadError('Owner account could not be identified.');
      return;
    }

    setLoading(true);
    setLoadError('');

    const bookingsQuery = query(
      collection(db, 'reservations'),
      where('ownerId', '==', ownerId)
    );

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const rows: Booking[] = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        } as Booking));

        rows.sort(
          (a, b) =>
            getBookingDate(b.createdAt) -
            getBookingDate(a.createdAt)
        );

        setBookings(rows);
        setLoadError('');
        setLoading(false);
      },
      (error) => {
        console.error('Owner bookings listener failed:', error);

        setLoadError(
          'Unable to load bookings. Check Firestore permissions and the ownerId field.'
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [ownerId]);

  // ==================================================
  // BOOKING COUNTS
  // ==================================================

  const counts = useMemo(() => {
    const activeBookings = bookings.filter(
      (booking) => !isCancelled(booking)
    );

    return {
      all: bookings.length,

      pending: activeBookings.filter(
        (booking) => paymentKind(booking) === 'pending'
      ).length,

      cod: activeBookings.filter(
        (booking) => paymentKind(booking) === 'cod'
      ).length,

      paid: activeBookings.filter(
        (booking) => paymentKind(booking) === 'paid'
      ).length,

      confirmed: bookings.filter(isConfirmed).length,

      cancelled: bookings.filter(isCancelled).length,
    };
  }, [bookings]);

  // ==================================================
  // VERIFIED REVENUE
  // ==================================================

  const revenue = useMemo(() => {
    return bookings
      .filter(
        (booking) =>
          paymentKind(booking) === 'paid' &&
          !isCancelled(booking)
      )
      .reduce((sum, booking) => sum + getTotal(booking), 0);
  }, [bookings]);

  // ==================================================
  // FILTER AND SEARCH
  // ==================================================

  const visibleBookings = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return bookings.filter((booking) => {
      const pay = paymentKind(booking);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'pending' &&
          pay === 'pending' &&
          !isCancelled(booking)) ||
        (filter === 'cod' &&
          pay === 'cod' &&
          !isCancelled(booking)) ||
        (filter === 'paid' &&
          pay === 'paid' &&
          !isCancelled(booking)) ||
        (filter === 'confirmed' && isConfirmed(booking)) ||
        (filter === 'cancelled' && isCancelled(booking));

      const searchableText = [
        booking.guest?.fullName,
        booking.guest?.email,
        booking.guest?.phone,
        booking.referenceCode,
        booking.resortName,
        booking.rate?.label,
        booking.accommodationName,
        booking.paymentMethod,
        booking.id,
      ]
        .join(' ')
        .toLowerCase();

      return (
        matchesFilter &&
        searchableText.includes(searchValue)
      );
    });
  }, [bookings, filter, search]);

  // ==================================================
  // MARK CASH / ONSITE PAYMENT AS PAID
  // ==================================================

  const markPaid = async (booking: Booking) => {
    const method = normalize(booking.paymentMethod);
    const pay = paymentKind(booking);

    // PayPal must be verified by the backend.
    if (method === 'paypal') {
      alert(
        'PayPal payments must be verified by the PayPal backend. Manual verification is not allowed.'
      );
      return;
    }

    // Only Cash on Arrival can be manually verified.
    if (pay !== 'cod') {
      alert(
        'Manual payment verification is only available for Cash on Arrival bookings.'
      );
      return;
    }

    if (isCancelled(booking)) {
      alert('Cancelled reservations cannot be marked as paid.');
      return;
    }

    const amount = getTotal(booking);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Invalid reservation amount.');
      return;
    }

    const confirmed = window.confirm(
      `Confirm that ${booking.guest?.fullName || 'this guest'} has actually paid ${money(amount)} at the resort?`
    );

    if (!confirmed) return;

    setBusyId(booking.id);
    setActionError('');

    try {
      await updateDoc(doc(db, 'reservations', booking.id), {
        paymentStatus: 'paid',
        paidAmount: amount,
        paidAt: serverTimestamp(),
        paymentVerifiedBy: ownerId,
        paymentVerificationMethod: 'owner_manual_cash',
        receipt: {
          receiptNumber: `MS-${(booking.referenceCode || booking.id).slice(-8).toUpperCase()}`,
          paymentMethod: 'Cash on Arrival',
          paymentStatus: 'paid',
          amount,
          currency: 'PHP',
          transactionId: null,
          issuedAt: serverTimestamp(),
          issuedBy: ownerId,
        },
        updatedAt: serverTimestamp(),
      });

      alert('Cash payment successfully verified!');
    } catch (error) {
      console.error('Mark payment as paid failed:', error);

      setActionError(
        'Could not update payment status. Check your Firestore security rules.'
      );
    } finally {
      setBusyId('');
    }
  };

  // ==================================================
  // APPROVE / DECLINE BOOKING
  // ==================================================

  const updateBookingStatus = async (
    booking: Booking,
    newStatus: 'confirmed' | 'cancelled'
  ) => {
    if (isCancelled(booking)) {
      alert('This reservation has already been cancelled.');
      return;
    }

    if (newStatus === 'confirmed' && isConfirmed(booking)) {
      return;
    }

    const prompt =
      newStatus === 'confirmed'
        ? 'Approve this reservation?'
        : 'Decline this reservation?';

    if (!window.confirm(prompt)) return;

    setBusyId(booking.id);
    setActionError('');

    try {
      await updateDoc(doc(db, 'reservations', booking.id), {
        status: newStatus,
        ...(newStatus === 'cancelled'
          ? {
              cancelledAt: serverTimestamp(),
              cancelledBy: ownerId,
            }
          : {
              confirmedAt: serverTimestamp(),
              confirmedBy: ownerId,
            }),
        updatedAt: serverTimestamp(),
      });

      alert(
        newStatus === 'confirmed'
          ? 'Reservation approved successfully!'
          : 'Reservation declined successfully!'
      );
    } catch (error) {
      console.error('Booking status update failed:', error);

      setActionError(
        'Could not update reservation status. Check your Firestore security rules.'
      );
    } finally {
      setBusyId('');
    }
  };

  // ==================================================
  // FILTER TABS
  // ==================================================

  const tabs: {
    id: Filter;
    label: string;
    count: number;
  }[] = [
    { id: 'all', label: 'All', count: counts.all },
    {
      id: 'pending',
      label: 'Pending Payment',
      count: counts.pending,
    },
    {
      id: 'cod',
      label: 'Cash on Arrival',
      count: counts.cod,
    },
    {
      id: 'paid',
      label: 'Paid / Revenue',
      count: counts.paid,
    },
    {
      id: 'confirmed',
      label: 'Confirmed',
      count: counts.confirmed,
    },
    {
      id: 'cancelled',
      label: 'Cancelled',
      count: counts.cancelled,
    },
  ];

  // ==================================================
  // RENDER
  // ==================================================

  return (
    <section className="owner-bookings tab-fade-in">

      {/* PAGE HEADER */}
      <div className="owner-page-heading">
        <div>
          <span className="owner-section-kicker">
            RESERVATION MANAGEMENT
          </span>

          <h2 className="owner-welcome-title">
            Bookings
          </h2>

          <p className="owner-page-description">
            Manage guest reservations and verify payments for{' '}
            {resortName}.
          </p>
        </div>

        <div className="owner-icon-box-large approved-icon">
          <IonIcon icon={calendarOutline} />
        </div>
      </div>

      {/* REVENUE */}
      <div className="ob-revenue-card">
        <div>
          <span>
            <IonIcon icon={cashOutline} />
            VERIFIED REVENUE
          </span>

          <strong>{money(revenue)}</strong>

          <small>
            Paid reservations only · excluding cancelled bookings
          </small>
        </div>

        <div className="ob-revenue-icon">
          <IonIcon icon={walletOutline} />
        </div>
      </div>

      {/* STATISTICS */}
      <div className="ob-stat-grid">
        <article>
          <small>Pending payment</small>
          <strong>{counts.pending}</strong>
        </article>

        <article>
          <small>Cash on arrival</small>
          <strong>{counts.cod}</strong>
        </article>

        <article>
          <small>Paid bookings</small>
          <strong>{counts.paid}</strong>
        </article>

        <article>
          <small>Confirmed</small>
          <strong>{counts.confirmed}</strong>
        </article>
      </div>

      {/* SEARCH AND ADD PACKAGE */}
      <div className="ob-toolbar">
        <label className="ob-search">
          <IonIcon icon={searchOutline} />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search guest, reference, accommodation..."
          />
        </label>

        <button
          className="ob-add-package"
          type="button"
          onClick={onAddPackage}
        >
          <IonIcon icon={addCircleOutline} />
          Add Package
        </button>
      </div>

      {/* FILTER TABS */}
      <div className="ob-tabs">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={filter === tab.id ? 'active' : ''}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
            <span>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ACTION ERROR */}
      {actionError && (
        <div className="ob-error">
          <IonIcon icon={alertCircleOutline} />
          {actionError}
        </div>
      )}

      {/* LOADING AND ERROR STATES */}
      {loading ? (
        <div className="ob-state">
          <IonSpinner name="crescent" />
          <p>Loading reservations...</p>
        </div>
      ) : loadError ? (
        <div className="ob-state ob-error">
          {loadError}
          <small>
            Reservations must contain the correct ownerId field.
          </small>
        </div>
      ) : visibleBookings.length === 0 ? (
        <div className="ob-empty">
          <span>
            <IonIcon icon={calendarOutline} />
          </span>

          <h3>No bookings found</h3>

          <p>
            New reservations for your resort will appear here automatically.
          </p>

          <button
            type="button"
            onClick={onAddPackage}
          >
            <IonIcon icon={addCircleOutline} />
            Add an accommodation
          </button>
        </div>
      ) : (

        /* BOOKING LIST */
        <div className="ob-list">
          {visibleBookings.map((booking) => {
            const pay = paymentKind(booking);
            const status = normalize(booking.status || 'pending');
            const total = getTotal(booking);

            const method = normalize(booking.paymentMethod);
            const isPayPal = method === 'paypal';
            const isBusy = busyId === booking.id;

            const badge =
              pay === 'paid'
                ? 'Paid'
                : pay === 'cod'
                  ? 'Cash on Arrival'
                  : pay === 'pending'
                    ? 'Pending Payment'
                    : status;

            return (
              <article
                className="ob-booking-card"
                key={booking.id}
              >

                {/* CARD HEADER */}
                <div className="ob-card-top">
                  <div className="ob-guest">
                    <span className="ob-avatar">
                      <IonIcon icon={personOutline} />
                    </span>

                    <div>
                      <strong>
                        {booking.guest?.fullName || 'Guest'}
                      </strong>

                      <small>
                        {booking.referenceCode || booking.id}
                      </small>
                    </div>
                  </div>

                  <span className={`ob-badge ${pay}`}>
                    {badge}
                  </span>
                </div>

                {/* BOOKING DETAILS */}
                <div className="ob-booking-info">
                  <div>
                    <strong>
                      {booking.resortName || resortName}
                    </strong>

                    <b>{money(total)}</b>
                  </div>

                  <p>
                    <span>
                      <IonIcon icon={calendarOutline} />
                      {dateLabel(booking.checkIn)} –{' '}
                      {dateLabel(booking.checkOut)}
                    </span>

                    <span>
                      {(booking.nights || 1)} night(s) ·{' '}
                      {(booking.adults || 0) +
                        (booking.children || 0)}{' '}
                      guest(s)
                    </span>
                  </p>

                  <small>
                    <IonIcon icon={locationOutline} />
                    {booking.accommodationName ||
                      booking.rate?.label ||
                      booking.rate?.unit ||
                      'Selected accommodation'}
                  </small>

                  <small>
                    <IonIcon icon={cardOutline} />
                    Payment method: {getPaymentLabel(booking)}
                  </small>

                  {isPayPal && booking.paypalOrderId && (
                    <small>
                      PayPal order: {booking.paypalOrderId}
                    </small>
                  )}

                  {isPayPal && booking.paypalCaptureId && (
                    <small>
                      PayPal capture: {booking.paypalCaptureId}
                    </small>
                  )}
                </div>

                {/* GUEST NOTES */}
                {booking.notes && (
                  <p className="ob-notes">
                    Guest request: {booking.notes}
                  </p>
                )}

                {/* ACTIONS */}
                <div className="ob-card-actions">
                  <span className={`ob-status-text ${status}`}>
                    {status.replace('_', ' ')}
                  </span>

                  <div>

                    {/* VIEW RECEIPT */}
                    {pay === 'paid' && booking.receipt && (
                      <button
                        type="button"
                        className="ob-confirm-btn"
                        onClick={() => setSelectedReceipt(booking)}
                      >
                        <IonIcon icon={receiptOutline} />
                        View Receipt
                      </button>
                    )}

                    {/* CASH / ONSITE PAYMENT */}
                    {pay === 'cod' && !isCancelled(booking) && (
                      <button
                        type="button"
                        disabled={isBusy}
                        className="ob-paid-btn"
                        onClick={() => markPaid(booking)}
                      >
                        {isBusy ? 'Updating...' : 'Mark Cash as Paid'}
                      </button>
                    )}

                    {/* PAYPAL PAYMENT */}
                    {isPayPal && pay !== 'paid' && !isCancelled(booking) && (
                      <span className="ob-status-text pending">
                        Awaiting PayPal verification
                      </span>
                    )}

                    {/* APPROVE */}
                    {!isConfirmed(booking) &&
                      !isCancelled(booking) && (
                        <button
                          type="button"
                          disabled={isBusy}
                          className="ob-confirm-btn"
                          onClick={() =>
                            updateBookingStatus(booking, 'confirmed')
                          }
                        >
                          {isBusy ? 'Updating...' : 'Approve'}
                        </button>
                      )}

                    {/* DECLINE */}
                    {!isCancelled(booking) &&
                      status !== 'completed' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          className="ob-decline-btn"
                          onClick={() =>
                            updateBookingStatus(booking, 'cancelled')
                          }
                        >
                          <IonIcon icon={closeCircleOutline} />
                          Decline
                        </button>
                      )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* PAYMENT RECEIPT MODAL */}
      {selectedReceipt?.receipt && (
        <div
          role="presentation"
          onClick={() => setSelectedReceipt(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.58)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ob-receipt-title"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 460,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 18,
              padding: 24,
              color: '#1f2937',
              boxShadow: '0 20px 60px rgba(0,0,0,.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <small style={{ color: '#64748b', letterSpacing: 1 }}>
                  MINDORO SCAPE
                </small>
                <h2 id="ob-receipt-title" style={{ margin: '6px 0' }}>
                  Payment Receipt
                </h2>
                <small style={{ color: '#64748b' }}>
                  {selectedReceipt.receipt.receiptNumber || selectedReceipt.referenceCode || selectedReceipt.id}
                </small>
              </div>
              <button
                type="button"
                aria-label="Close receipt"
                onClick={() => setSelectedReceipt(null)}
                style={{
                  border: 0,
                  background: '#f1f5f9',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ×
              </button>
            </div>

            <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '18px 0' }} />

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <small style={{ color: '#64748b' }}>Received from</small>
                <strong style={{ display: 'block' }}>
                  {selectedReceipt.guest?.fullName || 'Guest'}
                </strong>
                <small>{selectedReceipt.guest?.email || ''}</small>
              </div>

              <div>
                <small style={{ color: '#64748b' }}>Resort / accommodation</small>
                <strong style={{ display: 'block' }}>
                  {selectedReceipt.resortName || resortName}
                </strong>
                <small>
                  {selectedReceipt.accommodationName || 'Selected accommodation'}
                </small>
              </div>

              <div>
                <small style={{ color: '#64748b' }}>Booking reference</small>
                <strong style={{ display: 'block' }}>
                  {selectedReceipt.referenceCode || selectedReceipt.id}
                </strong>
              </div>

              <div>
                <small style={{ color: '#64748b' }}>Payment method</small>
                <strong style={{ display: 'block' }}>
                  {selectedReceipt.receipt.paymentMethod || getPaymentLabel(selectedReceipt)}
                </strong>
              </div>

              {selectedReceipt.receipt.transactionId && (
                <div>
                  <small style={{ color: '#64748b' }}>Transaction ID</small>
                  <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {selectedReceipt.receipt.transactionId}
                  </strong>
                </div>
              )}

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
                borderRadius: 12,
                padding: 14,
              }}>
                <strong>Amount paid</strong>
                <strong style={{ fontSize: 22, color: '#16834a' }}>
                  {money(Number(selectedReceipt.receipt.amount ?? getTotal(selectedReceipt)))}
                </strong>
              </div>

              <small style={{ color: '#64748b' }}>
                Payment status: {selectedReceipt.receipt.paymentStatus || 'paid'}
              </small>
              <small style={{ color: '#64748b' }}>
                Issued by the resort through Mindoro Scape. This is a booking payment receipt, not a tax invoice.
              </small>
            </div>

            <button
              type="button"
              className="ob-confirm-btn"
              onClick={() => window.print()}
              style={{ marginTop: 18, width: '100%' }}
            >
              Print Receipt
            </button>
          </section>
        </div>
      )}

      {/* FOOTNOTE */}
      <p className="ob-footnote">
        <IonIcon icon={checkmarkCircleOutline} />

        PayPal payments are verified automatically by the backend.
        Cash on Arrival payments may be manually verified by the resort
        owner. Revenue includes paid, non-cancelled reservations only.
      </p>
    </section>
  );
};

export default OwnerBookings;
