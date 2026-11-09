import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  personOutline,
  locationOutline,
  closeCircleOutline,
  closeOutline,
  chevronBackOutline,
  chevronForwardOutline,
  eyeOutline,
  timeOutline,
  receiptOutline,
  mailOutline,
  callOutline,
  peopleOutline,
  informationCircleOutline,
  banOutline,
  expandOutline,
} from 'ionicons/icons';
import { db } from '../../firebase';
import './OwnerBookings.css';

type TimestampLike = { toDate?: () => Date } | Date | string | number | null;

type Booking = {
  id: string;
  ownerId?: string;
  userId?: string;
  resortId?: string;
  resortName?: string;
  accommodationName?: string;
  resortLocation?: string;
  referenceCode?: string;
  guest?: { fullName?: string; email?: string; phone?: string };
  checkIn?: string;
  checkOut?: string;
  bookingDate?: string;
  bookingSession?: {
    key?: string;
    label?: string;
    startTime?: string;
    endTime?: string;
  } | null;
  eventDetails?: {
    eventType?: string;
    eventDate?: string;
    startTime?: string;
    endTime?: string;
    expectedGuests?: number;
  } | null;
  usageType?: 'swimming' | 'event' | 'overnight' | string;
  reservationMode?: string;
  nights?: number;
  adults?: number;
  children?: number;
  guestCount?: number;
  quantity?: number;
  childAges?: number[];
  rate?: { label?: string; unit?: string; price?: number; durationHours?: number | null };
  pricing?: {
    baseSubtotal?: number;
    subtotal?: number;
    addOnTotal?: number;
    extensionTotal?: number;
    total?: number;
    currency?: string;
  };
  selectedAddOns?: Array<{
    name?: string;
    price?: number;
    total?: number;
    included?: boolean;
    unit?: string;
  }>;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentProvider?: string;
  paymentReference?: string;
  transactionId?: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paidAmount?: number;
  paidAt?: TimestampLike;
  paymentVerifiedBy?: string;
  receiptUrl?: string;
  paymentReceiptUrl?: string;
  receipt?: string | { url?: string; imageUrl?: string; fileUrl?: string; name?: string };
  paymentDetails?: Record<string, unknown>;
  transaction?: Record<string, unknown>;
  status?: string;
  refundStatus?: string;
  cancellationStatus?: string;
  cancellationReason?: string;
  cancellationType?: string;
  cancellationSource?: string;
  cancelledBy?: string;
  cancelledAt?: TimestampLike;
  autoCancelled?: boolean;
  autoCancelReason?: string;
  completedAt?: TimestampLike;
  autoCompleted?: boolean;
  notes?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  approvedAt?: TimestampLike;
  approvedBy?: string;
  [key: string]: unknown;
};

type Props = {
  ownerId: string;
  resortName: string;
  /** Kept optional for compatibility with the existing parent component. */
  onAddPackage?: () => void;
};

type Filter = 'current' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'paid' | 'unpaid';
type CalendarBooking = Booking & { calendarDate: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const money = (value: number) =>
  `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const asDate = (value?: TimestampLike): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const result = value.toDate();
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const result = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(result.getTime()) ? null : result;
};

const dateLabel = (value?: string) => {
  if (!value) return 'Date not set';
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const timestampLabel = (value?: TimestampLike) => {
  const parsed = asDate(value);
  return parsed
    ? parsed.toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not recorded';
};

const normalizedStatus = (booking: Booking) => String(booking.status || 'pending').toLowerCase();

const isCancelled = (booking: Booking) =>
  ['cancelled', 'declined', 'rejected', 'auto_cancelled', 'expired'].includes(normalizedStatus(booking));

const isCompleted = (booking: Booking) =>
  ['completed', 'complete', 'checked_out'].includes(normalizedStatus(booking));

const isConfirmed = (booking: Booking) =>
  ['confirmed', 'approved', 'checked_in'].includes(normalizedStatus(booking));

const isCurrent = (booking: Booking) => !isCancelled(booking) && !isCompleted(booking);

const paymentKind = (booking: Booking): 'pending' | 'cod' | 'paid' | 'other' => {
  const status = String(booking.paymentStatus || '').toLowerCase();
  const method = String(booking.paymentMethod || '').toLowerCase();

  if (['paid', 'succeeded', 'completed', 'captured'].includes(status)) return 'paid';
  if (
    ['onsite', 'cod', 'cash_on_arrival', 'pay_at_resort'].includes(method) ||
    status === 'pay_at_resort'
  ) return 'cod';
  if (['unpaid', 'pending', 'pending_payment', ''].includes(status)) return 'pending';
  return 'other';
};

const isOvernightBooking = (booking: Booking) =>
  String(booking.usageType || '').toLowerCase() === 'overnight' || booking.reservationMode === 'overnight_stay';

const isEventBooking = (booking: Booking) =>
  String(booking.usageType || '').toLowerCase() === 'event' || booking.reservationMode === 'event_booking';

const usageLabel = (booking: Booking) => {
  if (isEventBooking(booking)) return 'Event venue';
  if (isOvernightBooking(booking)) return 'Overnight stay';
  return 'Swimming / Day use';
};

const bookingDate = (booking: Booking) =>
  booking.eventDetails?.eventDate || booking.bookingDate || booking.checkIn || '';

const monthLabel = (date: Date) =>
  date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const bookingTotal = (booking: Booking) =>
  Number(booking.pricing?.total ?? booking.pricing?.subtotal ?? 0);

/** Parses "17:30" or "5:30 PM" into [hours, minutes]. Returns null if unreadable. */
const parseTime = (value?: string): [number, number] | null => {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return [hours, minutes];
};

/** The moment the booking is over (end time if known, otherwise the end of its last day). */
const bookingEndMoment = (booking: Booking): Date | null => {
  const day = isOvernightBooking(booking)
    ? booking.checkOut || bookingDate(booking)
    : bookingDate(booking);
  if (!day) return null;
  const end = new Date(`${day}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;

  let endTime: string | undefined;
  if (isEventBooking(booking)) endTime = booking.eventDetails?.endTime;
  else if (!isOvernightBooking(booking)) endTime = booking.bookingSession?.endTime;

  const parsed = parseTime(endTime);
  if (parsed) end.setHours(parsed[0], parsed[1], 0, 0);
  return end;
};

const getReceiptLinks = (booking: Booking) => {
  const candidates: Array<{ label: string; url: string }> = [];
  const receiptObject = booking.receipt && typeof booking.receipt === 'object' ? booking.receipt : null;
  const values: Array<[string, unknown]> = [
    ['Payment receipt', booking.paymentReceiptUrl],
    ['Receipt', booking.receiptUrl],
    ['Receipt file', receiptObject?.url || receiptObject?.imageUrl || receiptObject?.fileUrl],
  ];
  values.forEach(([label, value]) => {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      candidates.push({ label, url: value });
    }
  });
  return candidates;
};

const badgeClass = (booking: Booking) =>
  isCancelled(booking) ? 'cancelled' : isCompleted(booking) ? 'completed' : isConfirmed(booking) ? 'confirmed' : 'pending';

const cancellationText = (booking: Booking) =>
  booking.autoCancelled || booking.cancellationType === 'auto'
    ? booking.autoCancelReason || booking.cancellationReason || 'Automatically cancelled by the system.'
    : booking.cancellationReason || 'No cancellation reason was recorded.';

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const OwnerBookings: React.FC<Props> = ({ ownerId, resortName }) => {
  const [rawBookings, setRawBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<Filter>('current');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => dateKey(new Date()));
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const autoCompletedRef = useRef<Set<string>>(new Set());

  /* Re-evaluate "date already passed" every minute. */
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /* Live reservations listener. */
  useEffect(() => {
    if (!ownerId) {
      setRawBookings([]);
      setLoading(false);
      return;
    }

    const reservationsQuery = query(collection(db, 'reservations'), where('ownerId', '==', ownerId));

    const unsubscribe = onSnapshot(
      reservationsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Booking));
        rows.sort((a, b) => (asDate(b.createdAt)?.getTime() || 0) - (asDate(a.createdAt)?.getTime() || 0));
        setRawBookings(rows);
        setLoadError('');
        setLoading(false);
      },
      (error) => {
        console.error('Owner bookings listener failed:', error);
        setLoadError('Unable to load bookings. Check Firestore permissions and the ownerId field.');
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [ownerId]);

  /**
   * Effective bookings: a booking that is PAID, not cancelled, and whose date/time
   * has already passed is treated as completed — the owner does not need to press
   * "Mark completed".
   */
  const bookings = useMemo<Booking[]>(() => {
    return rawBookings.map((booking) => {
      if (isCancelled(booking) || isCompleted(booking)) return booking;
      if (paymentKind(booking) !== 'paid') return booking;
      const end = bookingEndMoment(booking);
      if (end && end.getTime() < now) {
        return { ...booking, status: 'completed', autoCompleted: true };
      }
      return booking;
    });
  }, [rawBookings, now]);

  /* Save the automatic completion to Firestore once, so the guest app sees it too. */
  useEffect(() => {
    bookings.forEach((booking) => {
      if (!booking.autoCompleted) return;
      const original = rawBookings.find((item) => item.id === booking.id);
      if (!original || isCompleted(original) || autoCompletedRef.current.has(booking.id)) return;
      autoCompletedRef.current.add(booking.id);
      updateDoc(doc(db, 'reservations', booking.id), {
        status: 'completed',
        autoCompleted: true,
        completedAt: serverTimestamp(),
        completedBy: 'system',
        updatedAt: serverTimestamp(),
      }).catch((error) => {
        // Display still shows it as completed; the write can be retried on next load.
        console.warn('Auto-complete could not be saved:', error);
        autoCompletedRef.current.delete(booking.id);
      });
    });
  }, [bookings, rawBookings]);

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedId) || null,
    [bookings, selectedId],
  );
  const cancelTarget = useMemo(
    () => bookings.find((booking) => booking.id === cancelTargetId) || null,
    [bookings, cancelTargetId],
  );

  /* Lock page scroll + Escape key while any dialog is open. */
  const anyModalOpen = Boolean(selectedBooking || cancelTarget || calendarExpanded);
  useEffect(() => {
    if (!anyModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (cancelTargetId) setCancelTargetId(null);
      else if (selectedId) setSelectedId(null);
      else setCalendarExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [anyModalOpen, cancelTargetId, selectedId]);

  /* ----------------------------- derived data ---------------------------- */

  const counts = useMemo(() => ({
    current: bookings.filter(isCurrent).length,
    pending: bookings.filter((b) => isCurrent(b) && !isConfirmed(b)).length,
    confirmed: bookings.filter((b) => isCurrent(b) && isConfirmed(b)).length,
    completed: bookings.filter(isCompleted).length,
    cancelled: bookings.filter(isCancelled).length,
    paid: bookings.filter((b) => isCurrent(b) && paymentKind(b) === 'paid').length,
    unpaid: bookings.filter((b) => isCurrent(b) && paymentKind(b) !== 'paid').length,
  }), [bookings]);

  const revenue = useMemo(
    () => bookings
      .filter((booking) => paymentKind(booking) === 'paid' && !isCancelled(booking))
      .reduce((sum, booking) => sum + Number(booking.paidAmount ?? bookingTotal(booking)), 0),
    [bookings],
  );

  const activeCalendarBookings = useMemo<CalendarBooking[]>(() => {
    const entries: CalendarBooking[] = [];
    bookings.filter(isCurrent).forEach((booking) => {
      const start = bookingDate(booking);
      if (!start) return;
      if (isOvernightBooking(booking) && booking.checkOut && booking.checkOut > start) {
        // Occupy each night from check-in up to, but not including, check-out.
        const cursor = new Date(`${start}T12:00:00`);
        const checkout = new Date(`${booking.checkOut}T12:00:00`);
        let guard = 0;
        while (cursor < checkout && guard < 60) {
          entries.push({ ...booking, calendarDate: dateKey(cursor) });
          cursor.setDate(cursor.getDate() + 1);
          guard += 1;
        }
      } else {
        entries.push({ ...booking, calendarDate: start });
      }
    });
    return entries;
  }, [bookings]);

  const calendarBookingsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarBooking[]>();
    activeCalendarBookings.forEach((booking) => {
      const list = grouped.get(booking.calendarDate) || [];
      list.push(booking);
      grouped.set(booking.calendarDate, list);
    });
    return grouped;
  }, [activeCalendarBookings]);

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const startOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - startOffset + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return null;
      return { key: dateKey(new Date(year, month, dayNumber)), day: dayNumber };
    });
  }, [calendarMonth]);

  const selectedDateBookings = calendarBookingsByDate.get(selectedCalendarDate) || [];
  const todayKey = dateKey(new Date(now));

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bookings.filter((booking) => {
      const current = isCurrent(booking);
      const pay = paymentKind(booking);
      const matchesFilter =
        (filter === 'current' && current) ||
        (filter === 'pending' && current && !isConfirmed(booking)) ||
        (filter === 'confirmed' && current && isConfirmed(booking)) ||
        (filter === 'completed' && isCompleted(booking)) ||
        (filter === 'cancelled' && isCancelled(booking)) ||
        (filter === 'paid' && current && pay === 'paid') ||
        (filter === 'unpaid' && current && pay !== 'paid');
      const haystack = [
        booking.guest?.fullName,
        booking.guest?.email,
        booking.guest?.phone,
        booking.referenceCode,
        booking.resortName,
        booking.accommodationName,
        booking.rate?.label,
        booking.eventDetails?.eventType,
        booking.cancellationReason,
      ].join(' ').toLowerCase();
      return matchesFilter && haystack.includes(term);
    });
  }, [bookings, filter, search]);

  /* ------------------------------- actions ------------------------------- */

  const updateBookingStatus = async (booking: Booking, status: 'confirmed' | 'completed') => {
    const prompt = status === 'confirmed'
      ? 'Approve this reservation? It will remain on the calendar until it is completed or cancelled.'
      : 'Mark this reservation as completed? It will be removed from the active calendar but kept in booking history.';
    if (!window.confirm(prompt)) return;

    setBusyId(booking.id);
    try {
      await updateDoc(doc(db, 'reservations', booking.id), {
        status,
        ...(status === 'confirmed'
          ? { approvedAt: serverTimestamp(), approvedBy: ownerId }
          : { completedAt: serverTimestamp(), completedBy: ownerId }),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Booking status update failed:', error);
      window.alert('Could not update this reservation. Please check Firestore rules.');
    } finally {
      setBusyId('');
    }
  };

  const cancelBooking = async () => {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (reason.length < 5) {
      window.alert('Please enter a cancellation reason with at least 5 characters.');
      return;
    }

    const booking = cancelTarget;
    setBusyId(booking.id);
    try {
      await updateDoc(doc(db, 'reservations', booking.id), {
        status: 'cancelled',
        cancellationReason: reason,
        cancellationType: 'owner_declined',
        cancellationSource: 'owner',
        cancelledBy: ownerId,
        cancelledAt: serverTimestamp(),
        autoCancelled: false,
        updatedAt: serverTimestamp(),
      });
      setCancelTargetId(null);
      setCancelReason('');
      setSelectedId(null);
    } catch (error) {
      console.error('Booking cancellation failed:', error);
      window.alert('Could not cancel this reservation. Please check Firestore rules.');
    } finally {
      setBusyId('');
    }
  };

  const markPaid = async (booking: Booking) => {
    if (paymentKind(booking) === 'paid' || isCancelled(booking)) return;
    const amount = bookingTotal(booking);
    if (!window.confirm(
      `Confirm that ${booking.guest?.fullName || 'this guest'} has paid ${money(amount)}? Only mark as paid after you have received the actual payment.`,
    )) return;

    setBusyId(booking.id);
    try {
      await updateDoc(doc(db, 'reservations', booking.id), {
        paymentStatus: 'paid',
        paidAmount: amount,
        paidAt: serverTimestamp(),
        paymentVerifiedBy: ownerId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Payment update failed:', error);
      window.alert('Could not update payment status. Please check Firestore rules.');
    } finally {
      setBusyId('');
    }
  };

  const openCancel = (booking: Booking) => {
    setCancelTargetId(booking.id);
    setCancelReason('');
  };

  const openFullCalendar = (key?: string) => {
    if (key) setSelectedCalendarDate(key);
    setCalendarExpanded(true);
  };

  const shiftMonth = (delta: number) =>
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  const tabs: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'current', label: 'Current bookings', count: counts.current },
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'confirmed', label: 'Confirmed', count: counts.confirmed },
    { id: 'completed', label: 'Completed history', count: counts.completed },
    { id: 'cancelled', label: 'Cancelled history', count: counts.cancelled },
    { id: 'paid', label: 'Paid', count: counts.paid },
    { id: 'unpaid', label: 'Unpaid / On-site', count: counts.unpaid },
  ];

  /* ------------------------------ renderers ------------------------------ */

  const canMarkPaid = (booking: Booking) => isCurrent(booking) && paymentKind(booking) !== 'paid';

  const renderCalendar = (full: boolean) => (
    <div className={`ob-calendar ${full ? 'is-full' : 'is-compact'}`}>
      <div className="ob-calendar-head">
        <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <IonIcon icon={chevronBackOutline} />
        </button>
        <strong>{monthLabel(calendarMonth)}</strong>
        <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <IonIcon icon={chevronForwardOutline} />
        </button>
      </div>
      <div className="ob-calendar-grid ob-calendar-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="ob-calendar-grid">
        {calendarCells.map((cell, index) => {
          if (!cell) return <span className="ob-calendar-blank" key={`blank-${index}`} />;
          const dayBookings = calendarBookingsByDate.get(cell.key) || [];
          const hasPending = dayBookings.some((booking) => !isConfirmed(booking));
          const hasConfirmed = dayBookings.some(isConfirmed);
          const selected = full && selectedCalendarDate === cell.key;
          const today = cell.key === todayKey;
          return (
            <button
              type="button"
              key={cell.key}
              className={`ob-calendar-day ${selected ? 'selected' : ''} ${today ? 'today' : ''} ${dayBookings.length ? 'has-bookings' : ''}`}
              onClick={() => (full ? setSelectedCalendarDate(cell.key) : openFullCalendar(cell.key))}
              aria-label={`${cell.key}, ${dayBookings.length} active booking(s)`}
            >
              <span>{cell.day}</span>
              {dayBookings.length > 0 && (
                <span className="ob-calendar-dots">
                  {hasPending && <i className="pending-dot" />}
                  {hasConfirmed && <i className="confirmed-dot" />}
                </span>
              )}
              {full && dayBookings.length > 0 && <small>{dayBookings.length}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderLegend = () => (
    <div className="ob-calendar-legend">
      <span><i className="pending-dot" /> Pending</span>
      <span><i className="confirmed-dot" /> Confirmed</span>
    </div>
  );

  const renderBookingCard = (booking: Booking) => {
    const status = normalizedStatus(booking);
    const pay = paymentKind(booking);
    const total = bookingTotal(booking);
    const isEvent = isEventBooking(booking);
    const isOvernight = isOvernightBooking(booking);
    const busy = busyId === booking.id;
    const when = bookingDate(booking);
    const overdueUnpaid = isCurrent(booking) && pay !== 'paid' && (bookingEndMoment(booking)?.getTime() || Infinity) < now;

    return (
      <article className="ob-booking-card" key={booking.id}>
        <div className="ob-card-top">
          <div className="ob-guest">
            <span className="ob-avatar"><IonIcon icon={personOutline} /></span>
            <div>
              <strong>{booking.guest?.fullName || 'Guest'}</strong>
              <small>{booking.referenceCode || booking.id}</small>
            </div>
          </div>
          <span className={`ob-badge ${badgeClass(booking)}`}>{status.replace(/_/g, ' ')}</span>
        </div>

        <div className="ob-booking-info">
          <div>
            <strong>{booking.accommodationName || booking.resortName || resortName}</strong>
            <b>{money(total)}</b>
          </div>
          <p>
            <span><IonIcon icon={calendarOutline} />{dateLabel(when)}</span>
            <span><IonIcon icon={peopleOutline} />{booking.guestCount ?? ((booking.adults || 0) + (booking.children || 0))} guest(s)</span>
          </p>
          <small><IonIcon icon={informationCircleOutline} />{usageLabel(booking)} · {booking.rate?.label || booking.rate?.unit || 'Rate not specified'}</small>
          {isEvent && booking.eventDetails && (
            <small><IonIcon icon={timeOutline} />{booking.eventDetails.eventType || 'Event'} · {booking.eventDetails.startTime || 'Time TBC'}–{booking.eventDetails.endTime || 'Time TBC'}</small>
          )}
          {isOvernight && (
            <small><IonIcon icon={calendarOutline} />Check-in {dateLabel(booking.checkIn)} · Check-out {dateLabel(booking.checkOut)} · {booking.nights || 1} night(s)</small>
          )}
          {!isEvent && !isOvernight && booking.bookingSession && (
            <small><IonIcon icon={timeOutline} />{booking.bookingSession.label || 'Swimming session'} · {booking.bookingSession.startTime || ''}–{booking.bookingSession.endTime || ''}</small>
          )}
          <small><IonIcon icon={cashOutline} />{booking.paymentMethod || 'Payment method not specified'} · {pay === 'paid' ? 'Paid' : pay === 'cod' ? 'Pay at resort' : booking.paymentStatus || 'Unpaid'}</small>
        </div>

        {booking.notes && <p className="ob-notes">Guest request: {booking.notes}</p>}

        {overdueUnpaid && (
          <p className="ob-muted-note">
            The date of this reservation has passed but it is still unpaid. Mark it as paid once payment is received and it will move to Completed history automatically.
          </p>
        )}

        {isCompleted(booking) && booking.autoCompleted && (
          <p className="ob-auto-note"><IonIcon icon={checkmarkCircleOutline} /> Automatically completed — paid and the reservation date has passed.</p>
        )}

        {isCancelled(booking) && (
          <div className="ob-cancellation-note">
            <strong><IonIcon icon={banOutline} /> Cancellation details</strong>
            <p>{cancellationText(booking)}</p>
            <small>
              {booking.autoCancelled || booking.cancellationType === 'auto'
                ? 'Cancelled automatically by the system'
                : `Cancelled by ${booking.cancelledBy === ownerId ? 'owner' : booking.cancelledBy || 'recorded user'}`}
              {' · '}{timestampLabel(booking.cancelledAt)}
            </small>
          </div>
        )}

        <div className="ob-card-actions">
          <span className={`ob-status-text ${pay === 'paid' ? 'confirmed' : ''}`}>
            {pay === 'paid' ? 'Payment verified' : pay === 'cod' ? 'Pay at resort' : 'Payment not verified'}
          </span>
          <div>
            <button type="button" className="ob-view-btn" onClick={() => setSelectedId(booking.id)}>
              <IonIcon icon={eyeOutline} /> View details
            </button>
            {canMarkPaid(booking) && (
              <button type="button" disabled={busy} className="ob-paid-btn" onClick={() => markPaid(booking)}>
                {busy ? 'Updating…' : 'Mark as paid'}
              </button>
            )}
            {isCurrent(booking) && !isConfirmed(booking) && (
              <button type="button" disabled={busy} className="ob-confirm-btn" onClick={() => updateBookingStatus(booking, 'confirmed')}>
                {busy ? 'Updating…' : 'Approve'}
              </button>
            )}
            {isCurrent(booking) && isConfirmed(booking) && (
              <button type="button" disabled={busy} className="ob-complete-btn" onClick={() => updateBookingStatus(booking, 'completed')}>
                {busy ? 'Updating…' : 'Mark completed'}
              </button>
            )}
            {isCurrent(booking) && (
              <button type="button" disabled={busy} className="ob-decline-btn" onClick={() => openCancel(booking)}>
                <IonIcon icon={closeCircleOutline} /> Cancel
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  const renderDetailsModal = (booking: Booking) => {
    const busy = busyId === booking.id;
    const receipts = getReceiptLinks(booking);
    return (
      <div className="ob-modal-backdrop ob-details-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
        <section className="ob-details-modal" role="dialog" aria-modal="true" aria-labelledby="ob-details-title">
          <div className="ob-modal-head">
            <div>
              <span className="ob-eyebrow">RESERVATION RECORD</span>
              <h3 id="ob-details-title">Booking details</h3>
              <small>{booking.referenceCode || booking.id}</small>
            </div>
            <button type="button" aria-label="Close details" onClick={() => setSelectedId(null)}><IonIcon icon={closeOutline} /></button>
          </div>
          <div className="ob-details-scroll">
            <div className="ob-detail-highlight">
              <div><small>Guest</small><strong>{booking.guest?.fullName || 'Guest'}</strong></div>
              <div><small>Total amount</small><strong>{money(bookingTotal(booking))}</strong></div>
              <span className={`ob-badge ${badgeClass(booking)}`}>{normalizedStatus(booking).replace(/_/g, ' ')}</span>
            </div>

            <div className="ob-detail-grid">
              <div><small><IonIcon icon={mailOutline} /> Email</small><strong>{booking.guest?.email || 'Not provided'}</strong></div>
              <div><small><IonIcon icon={callOutline} /> Phone</small><strong>{booking.guest?.phone || 'Not provided'}</strong></div>
              <div><small><IonIcon icon={informationCircleOutline} /> Booking type</small><strong>{usageLabel(booking)}</strong></div>
              <div><small><IonIcon icon={locationOutline} /> Accommodation</small><strong>{booking.accommodationName || booking.resortName || resortName}</strong></div>
              <div><small><IonIcon icon={calendarOutline} /> Start / event date</small><strong>{dateLabel(bookingDate(booking))}</strong></div>
              <div><small><IonIcon icon={calendarOutline} /> Check-out</small><strong>{isOvernightBooking(booking) ? dateLabel(booking.checkOut) : 'Not applicable'}</strong></div>
              <div><small><IonIcon icon={peopleOutline} /> Guests</small><strong>{booking.guestCount ?? ((booking.adults || 0) + (booking.children || 0))} total · {booking.adults || 0} adults · {booking.children || 0} children</strong></div>
              <div><small><IonIcon icon={cashOutline} /> Rate</small><strong>{booking.rate?.label || booking.rate?.unit || 'Not specified'} · {money(Number(booking.rate?.price || 0))}</strong></div>
              <div>
                <small><IonIcon icon={timeOutline} /> Event / session time</small>
                <strong>
                  {booking.eventDetails
                    ? `${booking.eventDetails.eventType || 'Event'} · ${booking.eventDetails.startTime || ''}–${booking.eventDetails.endTime || ''}`
                    : booking.bookingSession
                      ? `${booking.bookingSession.label || ''} · ${booking.bookingSession.startTime || ''}–${booking.bookingSession.endTime || ''}`
                      : 'Not applicable'}
                </strong>
              </div>
              <div><small><IonIcon icon={calendarOutline} /> Submitted</small><strong>{timestampLabel(booking.createdAt)}</strong></div>
            </div>

            {booking.notes && <div className="ob-detail-block"><strong>Guest notes / special requests</strong><p>{booking.notes}</p></div>}

            <div className="ob-detail-block">
              <strong>Price breakdown</strong>
              <div className="ob-breakdown-row"><span>Base amount</span><b>{money(Number(booking.pricing?.baseSubtotal ?? booking.pricing?.subtotal ?? 0))}</b></div>
              <div className="ob-breakdown-row"><span>Additional services</span><b>{money(Number(booking.pricing?.addOnTotal || 0))}</b></div>
              <div className="ob-breakdown-row"><span>Extension</span><b>{money(Number(booking.pricing?.extensionTotal || 0))}</b></div>
              <div className="ob-breakdown-row total"><span>Total</span><b>{money(bookingTotal(booking))}</b></div>
            </div>

            {Array.isArray(booking.selectedAddOns) && booking.selectedAddOns.length > 0 && (
              <div className="ob-detail-block">
                <strong>Selected additional services</strong>
                {booking.selectedAddOns.map((service, index) => (
                  <div className="ob-breakdown-row" key={`${service.name || 'service'}-${index}`}>
                    <span>{service.name || 'Additional service'}{service.included ? ' · Included' : ''}</span>
                    <b>{service.included ? 'FREE' : money(Number(service.total ?? service.price ?? 0))}</b>
                  </div>
                ))}
              </div>
            )}

            <div className="ob-detail-block">
              <strong><IonIcon icon={receiptOutline} /> Payment / transaction</strong>
              <div className="ob-breakdown-row"><span>Payment method</span><b>{booking.paymentMethod || 'Not recorded'}</b></div>
              <div className="ob-breakdown-row"><span>Payment status</span><b>{booking.paymentStatus || 'Not recorded'}</b></div>
              <div className="ob-breakdown-row"><span>Paid amount</span><b>{money(Number(booking.paidAmount || 0))}</b></div>
              <div className="ob-breakdown-row"><span>Paid at</span><b>{timestampLabel(booking.paidAt)}</b></div>
              <div className="ob-breakdown-row"><span>Transaction ID</span><b>{booking.transactionId || booking.paymentReference || booking.paypalCaptureId || 'Not recorded'}</b></div>
              <div className="ob-breakdown-row"><span>PayPal order ID</span><b>{booking.paypalOrderId || 'Not recorded'}</b></div>
              <div className="ob-breakdown-row"><span>Payment verified by</span><b>{booking.paymentVerifiedBy || 'Not recorded'}</b></div>
              {receipts.length > 0 ? (
                receipts.map((receipt) => (
                  <a className="ob-receipt-link" key={receipt.url} href={receipt.url} target="_blank" rel="noreferrer">
                    <IonIcon icon={receiptOutline} /> View {receipt.label}
                  </a>
                ))
              ) : (
                <p className="ob-muted-note">No receipt file or receipt URL is saved in this reservation record. A transaction ID or payment status alone is not a receipt.</p>
              )}
            </div>

            {isCompleted(booking) && booking.autoCompleted && (
              <p className="ob-auto-note"><IonIcon icon={checkmarkCircleOutline} /> Automatically completed — paid and the reservation date has passed.</p>
            )}

            {isCancelled(booking) && (
              <div className="ob-cancellation-note in-modal">
                <strong><IonIcon icon={banOutline} /> Cancellation information</strong>
                <p>{cancellationText(booking)}</p>
                <small>Type: {booking.cancellationType || (booking.autoCancelled ? 'auto' : 'not recorded')} · Source: {booking.cancellationSource || 'not recorded'}</small>
                <small>Cancelled at: {timestampLabel(booking.cancelledAt)}</small>
              </div>
            )}
          </div>
          <div className="ob-modal-actions">
            {canMarkPaid(booking) && (
              <button type="button" className="ob-paid-btn" disabled={busy} onClick={() => markPaid(booking)}>
                {busy ? 'Updating…' : 'Mark as paid'}
              </button>
            )}
            {isCurrent(booking) && !isConfirmed(booking) && (
              <button type="button" className="ob-confirm-btn" disabled={busy} onClick={() => updateBookingStatus(booking, 'confirmed')}>Approve reservation</button>
            )}
            {isCurrent(booking) && isConfirmed(booking) && (
              <button type="button" className="ob-complete-btn" disabled={busy} onClick={() => updateBookingStatus(booking, 'completed')}>Mark completed</button>
            )}
            {isCurrent(booking) && (
              <button type="button" className="ob-decline-btn" disabled={busy} onClick={() => openCancel(booking)}>Cancel reservation</button>
            )}
            <button type="button" className="ob-view-btn" onClick={() => setSelectedId(null)}>Close</button>
          </div>
        </section>
      </div>
    );
  };

  /* -------------------------------- render -------------------------------- */

  return (
    <section className="owner-bookings tab-fade-in">
      <div className="owner-page-heading">
        <div>
          <span className="owner-section-kicker">RESERVATION MANAGEMENT</span>
          <h2 className="owner-welcome-title">Bookings</h2>
          <p className="owner-page-description">Manage current reservations, calendar schedules, guest details, and payment records for {resortName}.</p>
        </div>
      </div>

      <div className="ob-revenue-card">
        <div>
          <span><IonIcon icon={cashOutline} /> VERIFIED REVENUE</span>
          <strong>{money(revenue)}</strong>
          <small>Based on paid, non-cancelled reservations</small>
        </div>
        <div className="ob-revenue-icon"><IonIcon icon={walletOutline} /></div>
      </div>

      <div className="ob-stat-grid">
        <article><small>Pending approval</small><strong>{counts.pending}</strong></article>
        <article><small>Confirmed</small><strong>{counts.confirmed}</strong></article>
        <article><small>Completed</small><strong>{counts.completed}</strong></article>
        <article><small>Cancelled</small><strong>{counts.cancelled}</strong></article>
      </div>

      {/* Compact calendar — tapping it opens the full calendar */}
      <section className="ob-calendar-section">
        <div className="ob-section-heading">
          <div>
            <span className="ob-eyebrow">LIVE BOOKING SCHEDULE</span>
            <h3>Reservation Calendar</h3>
            <p>Only current pending and confirmed reservations appear here. Completed and cancelled reservations are removed from the calendar.</p>
          </div>
          <div className="ob-calendar-tools">
            {renderLegend()}
            <button type="button" className="ob-calendar-expand-btn" onClick={() => openFullCalendar()}>
              <IonIcon icon={expandOutline} /> View full calendar
            </button>
          </div>
        </div>
        {renderCalendar(false)}
        <p className="ob-calendar-hint">Tap a date to open the full calendar.</p>
      </section>

      <div className="ob-toolbar">
        <label className="ob-search">
          <IonIcon icon={searchOutline} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guest, reference, event, or cancellation reason…" />
        </label>
      </div>

      <div className="ob-tabs">
        {tabs.map((tab) => (
          <button type="button" key={tab.id} className={filter === tab.id ? 'active' : ''} onClick={() => setFilter(tab.id)}>
            {tab.label}<span>{tab.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ob-state"><IonSpinner name="crescent" /><p>Loading reservations…</p></div>
      ) : loadError ? (
        <div className="ob-state ob-error">{loadError}<small>New reservations must include ownerId to appear here.</small></div>
      ) : visible.length === 0 ? (
        <div className="ob-empty">
          <span><IonIcon icon={calendarOutline} /></span>
          <h3>No bookings found</h3>
          <p>Your active reservations appear here. Cancelled and completed bookings are kept in their separate history tabs.</p>
        </div>
      ) : (
        <div className="ob-list">{visible.map(renderBookingCard)}</div>
      )}

      <p className="ob-footnote">
        <IonIcon icon={checkmarkCircleOutline} />
        Paid reservations whose date has passed move to Completed history automatically. Completed and cancelled reservations are removed from the active calendar but stay in booking history and can still be opened for details.
      </p>

      {/* Dialogs are rendered into document.body so they always appear on top of the screen,
          never inside the page container (no scrolling down to find them). */}
      {typeof document !== 'undefined' && createPortal(
        <>
          {calendarExpanded && (
            <div className="ob-modal-backdrop ob-calendar-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCalendarExpanded(false); }}>
              <section className="ob-calendar-modal" role="dialog" aria-modal="true" aria-labelledby="ob-calendar-title">
                <div className="ob-modal-head">
                  <div>
                    <span className="ob-eyebrow">LIVE BOOKING SCHEDULE</span>
                    <h3 id="ob-calendar-title">Reservation Calendar</h3>
                    {renderLegend()}
                  </div>
                  <button type="button" aria-label="Close calendar" onClick={() => setCalendarExpanded(false)}><IonIcon icon={closeOutline} /></button>
                </div>
                <div className="ob-details-scroll">
                  {renderCalendar(true)}
                  <div className="ob-calendar-day-list">
                    <div className="ob-day-list-heading">
                      <strong>{dateLabel(selectedCalendarDate)}</strong>
                      <span>{selectedDateBookings.length} active booking(s)</span>
                    </div>
                    {selectedDateBookings.length ? (
                      <div className="ob-day-bookings">
                        {selectedDateBookings.map((booking) => (
                          <button type="button" className="ob-day-booking" key={`${booking.id}-${booking.calendarDate}`} onClick={() => setSelectedId(booking.id)}>
                            <span className={isConfirmed(booking) ? 'confirmed-bar' : 'pending-bar'} />
                            <span>
                              <strong>{booking.guest?.fullName || 'Guest'} · {usageLabel(booking)}</strong>
                              <small>{booking.eventDetails?.eventType || booking.bookingSession?.label || booking.rate?.label || booking.referenceCode || booking.id}</small>
                            </span>
                            <IonIcon icon={eyeOutline} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="ob-no-day-bookings">No active reservations for this date.</p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}

          {selectedBooking && renderDetailsModal(selectedBooking)}

          {cancelTarget && (
            <div className="ob-modal-backdrop ob-cancel-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCancelTargetId(null); }}>
              <section className="ob-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="ob-cancel-title">
                <div className="ob-modal-head">
                  <div>
                    <span className="ob-eyebrow">CANCELLATION RECORD</span>
                    <h3 id="ob-cancel-title">Cancel reservation</h3>
                    <small>{cancelTarget.referenceCode || cancelTarget.id}</small>
                  </div>
                  <button type="button" aria-label="Close cancellation" onClick={() => setCancelTargetId(null)}><IonIcon icon={closeOutline} /></button>
                </div>
                <p>Enter the reason so the guest and owner can see why this reservation was cancelled.</p>
                <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={4} placeholder="Example: Requested date is no longer available, incomplete details, or guest requested cancellation." />
                <div className="ob-modal-actions">
                  <button type="button" className="ob-view-btn" onClick={() => setCancelTargetId(null)}>Go back</button>
                  <button type="button" className="ob-decline-btn" disabled={busyId === cancelTarget.id || cancelReason.trim().length < 5} onClick={cancelBooking}>
                    {busyId === cancelTarget.id ? 'Saving…' : 'Confirm cancellation'}
                  </button>
                </div>
              </section>
            </div>
          )}
        </>,
        document.body,
      )}
    </section>
  );
};

export default OwnerBookings;
