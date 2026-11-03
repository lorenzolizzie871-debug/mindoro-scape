import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon, IonSpinner } from '@ionic/react';
import {
  collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import {
  calendarOutline, cashOutline, checkmarkCircleOutline, timeOutline,
  walletOutline, searchOutline, addCircleOutline, personOutline,
  locationOutline, closeCircleOutline,
} from 'ionicons/icons';
import { db } from '../../firebase';
import './OwnerBookings.css';

type Booking = {
  id: string;
  ownerId?: string;
  userId?: string;
  resortId?: string;
  resortName?: string;
  referenceCode?: string;
  guest?: { fullName?: string; email?: string; phone?: string };
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  adults?: number;
  children?: number;
  quantity?: number;
  rate?: { label?: string; unit?: string; price?: number };
  pricing?: { subtotal?: number; total?: number; currency?: string };
  paymentMethod?: string;
  paymentStatus?: string;
  status?: string;
  refundStatus?: string;
  cancellationStatus?: string;
  notes?: string;
  createdAt?: { toDate?: () => Date } | Date | string;
};

type Props = { ownerId: string; resortName: string; onAddPackage: () => void };
type Filter = 'all' | 'pending' | 'cod' | 'paid' | 'confirmed' | 'cancelled';

const money = (value: number) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value?: string) => {
  if (!value) return 'Date not set';
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};
const paymentKind = (booking: Booking): 'pending' | 'cod' | 'paid' | 'other' => {
  const status = String(booking.paymentStatus || '').toLowerCase();
  const method = String(booking.paymentMethod || '').toLowerCase();
  if (status === 'paid' || status === 'succeeded' || status === 'completed') return 'paid';
  if (['onsite', 'cod', 'cash_on_arrival', 'pay_at_resort'].includes(method) || status === 'pay_at_resort') return 'cod';
  if (['unpaid', 'pending', 'pending_payment', ''].includes(status)) return 'pending';
  return 'other';
};

const OwnerBookings: React.FC<Props> = ({ ownerId, resortName, onAddPackage }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!ownerId) { setBookings([]); setLoading(false); return; }
    const q = query(collection(db, 'reservations'), where('ownerId', '==', ownerId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Booking));
      rows.sort((a, b) => {
        const toTime = (v: Booking['createdAt']) => v && typeof v === 'object' && 'toDate' in v && typeof v.toDate === 'function' ? v.toDate().getTime() : new Date(String(v || 0)).getTime() || 0;
        return toTime(b.createdAt) - toTime(a.createdAt);
      });
      setBookings(rows); setLoadError(''); setLoading(false);
    }, (error) => {
      console.error('Owner bookings listener failed:', error);
      setLoadError('Unable to load bookings. Check Firestore permissions and the ownerId field.');
      setLoading(false);
    });
    return unsubscribe;
  }, [ownerId]);

  const counts = useMemo(() => ({
    all: bookings.length,
    pending: bookings.filter((b) => paymentKind(b) === 'pending' && !['cancelled', 'declined'].includes(String(b.status).toLowerCase())).length,
    cod: bookings.filter((b) => paymentKind(b) === 'cod' && !['cancelled', 'declined'].includes(String(b.status).toLowerCase())).length,
    paid: bookings.filter((b) => paymentKind(b) === 'paid').length,
    confirmed: bookings.filter((b) => ['confirmed', 'approved', 'checked_in', 'completed'].includes(String(b.status).toLowerCase())).length,
    cancelled: bookings.filter((b) => ['cancelled', 'declined'].includes(String(b.status).toLowerCase())).length,
  }), [bookings]);

  const revenue = bookings.filter((b) => paymentKind(b) === 'paid').reduce((sum, b) => sum + Number(b.pricing?.total ?? b.pricing?.subtotal ?? 0), 0);
  const visible = bookings.filter((b) => {
    const pay = paymentKind(b); const status = String(b.status || '').toLowerCase();
    const matchesFilter = filter === 'all' || (filter === 'pending' && pay === 'pending' && !['cancelled', 'declined'].includes(status)) || (filter === 'cod' && pay === 'cod' && !['cancelled', 'declined'].includes(status)) || (filter === 'paid' && pay === 'paid') || (filter === 'confirmed' && ['confirmed', 'approved', 'checked_in', 'completed'].includes(status)) || (filter === 'cancelled' && ['cancelled', 'declined'].includes(status));
    const haystack = [b.guest?.fullName, b.guest?.email, b.referenceCode, b.resortName, b.rate?.label].join(' ').toLowerCase();
    return matchesFilter && haystack.includes(search.toLowerCase().trim());
  });

  const markPaid = async (booking: Booking) => {
    if (paymentKind(booking) === 'paid' || ['cancelled', 'declined', 'refund_approved'].includes(String(booking.status || '').toLowerCase())) return;
    if (!window.confirm(`Confirm that ${booking.guest?.fullName || 'this guest'} has paid ${money(Number(booking.pricing?.total ?? booking.pricing?.subtotal ?? 0))}?`)) return;
    setBusyId(booking.id);
    try {
      await updateDoc(doc(db, 'reservations', booking.id), {
        paymentStatus: 'paid',
        paidAmount: Number(booking.pricing?.total ?? booking.pricing?.subtotal ?? 0),
        paidAt: serverTimestamp(),
        paymentVerifiedBy: ownerId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) { console.error(error); alert('Could not update payment status. Please check Firestore rules.'); }
    finally { setBusyId(''); }
  };

  const updateBookingStatus = async (booking: Booking, status: 'confirmed' | 'cancelled') => {
    const prompt = status === 'confirmed' ? 'Approve this reservation?' : 'Decline this reservation?';
    if (!window.confirm(prompt)) return;
    setBusyId(booking.id);
    try { await updateDoc(doc(db, 'reservations', booking.id), { status, updatedAt: serverTimestamp() }); }
    catch (error) { console.error(error); alert('Could not update reservation. Please check Firestore rules.'); }
    finally { setBusyId(''); }
  };

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all }, { id: 'pending', label: 'Pending Payment', count: counts.pending },
    { id: 'cod', label: 'Cash on Arrival', count: counts.cod }, { id: 'paid', label: 'Paid / Revenue', count: counts.paid },
    { id: 'confirmed', label: 'Confirmed', count: counts.confirmed }, { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ];

  return <section className="owner-bookings tab-fade-in">
    <div className="owner-page-heading"><div><span className="owner-section-kicker">RESERVATION MANAGEMENT</span><h2 className="owner-welcome-title">Bookings</h2><p className="owner-page-description">Manage guest reservations and verify payments for {resortName}.</p></div><div className="owner-icon-box-large approved-icon"><IonIcon icon={calendarOutline}/></div></div>
    <div className="ob-revenue-card"><div><span><IonIcon icon={cashOutline}/> VERIFIED REVENUE</span><strong>{money(revenue)}</strong><small>Paid reservations only · all recorded dates</small></div><div className="ob-revenue-icon"><IonIcon icon={walletOutline}/></div></div>
    <div className="ob-stat-grid"><article><small>Pending payment</small><strong>{counts.pending}</strong></article><article><small>Cash on arrival</small><strong>{counts.cod}</strong></article><article><small>Paid bookings</small><strong>{counts.paid}</strong></article><article><small>Confirmed</small><strong>{counts.confirmed}</strong></article></div>
    <div className="ob-toolbar"><label className="ob-search"><IonIcon icon={searchOutline}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, reference, accommodation..."/></label><button className="ob-add-package" type="button" onClick={onAddPackage}><IonIcon icon={addCircleOutline}/> Add Package</button></div>
    <div className="ob-tabs">{tabs.map((tab) => <button type="button" key={tab.id} className={filter === tab.id ? 'active' : ''} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}</div>
    {loading ? <div className="ob-state"><IonSpinner name="crescent"/><p>Loading reservations...</p></div> : loadError ? <div className="ob-state ob-error">{loadError}<small>New reservations must include ownerId to appear here.</small></div> : visible.length === 0 ? <div className="ob-empty"><span><IonIcon icon={calendarOutline}/></span><h3>No bookings yet</h3><p>New reservations for your resort will appear here automatically.</p><button type="button" onClick={onAddPackage}><IonIcon icon={addCircleOutline}/> Add an accommodation</button></div> : <div className="ob-list">{visible.map((booking) => {
      const pay = paymentKind(booking); const status = String(booking.status || 'pending').toLowerCase(); const total = Number(booking.pricing?.total ?? booking.pricing?.subtotal ?? 0);
      const badge = status === 'refund_approved' ? 'Refund Approved' : status === 'cancelled' ? 'Cancelled' : pay === 'paid' ? 'Paid' : pay === 'cod' ? 'Cash on Arrival' : pay === 'pending' ? 'Pending Payment' : status;
      return <article className="ob-booking-card" key={booking.id}><div className="ob-card-top"><div className="ob-guest"><span className="ob-avatar"><IonIcon icon={personOutline}/></span><div><strong>{booking.guest?.fullName || 'Guest'}</strong><small>{booking.referenceCode || booking.id}</small></div></div><span className={`ob-badge ${pay}`}>{badge}</span></div><div className="ob-booking-info"><div><strong>{booking.resortName || resortName}</strong><b>{money(total)}</b></div><p><span><IonIcon icon={calendarOutline}/>{dateLabel(booking.checkIn)} – {dateLabel(booking.checkOut)}</span><span>{booking.nights || 1} night(s) · {(booking.adults || 0) + (booking.children || 0)} guest(s)</span></p><small><IonIcon icon={locationOutline}/>{booking.rate?.label || booking.rate?.unit || 'Selected accommodation rate'} · {booking.paymentMethod || 'Payment method not specified'}</small></div>{booking.notes && <p className="ob-notes">Guest request: {booking.notes}</p>}<div className="ob-card-actions"><span className={`ob-status-text ${status}`}>{status === 'refund_approved' ? 'Refund approved · awaiting processing' : status.replace(/_/g, ' ')}</span><div>{pay !== 'paid' && pay !== 'other' && !['cancelled', 'declined', 'refund_approved', 'completed'].includes(status) && <button type="button" disabled={busyId === booking.id} className="ob-paid-btn" onClick={() => markPaid(booking)}>{busyId === booking.id ? 'Updating...' : 'Mark as Paid'}</button>}{!['confirmed','approved','checked_in','completed','cancelled','declined'].includes(status) && <button type="button" disabled={busyId === booking.id} className="ob-confirm-btn" onClick={() => updateBookingStatus(booking, 'confirmed')}>Approve</button>}{!['cancelled','declined','completed'].includes(status) && <button type="button" disabled={busyId === booking.id} className="ob-decline-btn" onClick={() => updateBookingStatus(booking, 'cancelled')}><IonIcon icon={closeCircleOutline}/> Decline</button>}</div></div></article>;
    })}</div>}
    <p className="ob-footnote"><IonIcon icon={checkmarkCircleOutline}/> A booking moves out of Pending Payment / Cash on Arrival only after its paymentStatus is updated to <strong>paid</strong>. Revenue is calculated from verified paid bookings.</p>
  </section>;
};
export default OwnerBookings;
