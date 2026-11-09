import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  IonContent, IonPage, IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../firebase';
import { onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'firebase/auth';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import {
  shieldOutline, logOutOutline, businessOutline, peopleOutline, cloudOutline,
  sunnyOutline, rainyOutline, thunderstormOutline, partlySunnyOutline,
  refreshOutline, locationOutline, waterOutline, speedometerOutline,
  thermometerOutline, alertCircleOutline, checkmarkCircleOutline,
  timeOutline, settingsOutline, searchOutline, closeOutline, warningOutline,
  calendarOutline, banOutline, informationCircleOutline,
  starOutline, chatbubbleEllipsesOutline, sendOutline, personOutline,
  eyeOutline, pauseCircleOutline, playCircleOutline, lockClosedOutline,
  notificationsOutline, checkmarkDoneOutline,
} from 'ionicons/icons';
import './AdminDashboard.css';

type AdminTab = 'overview' | 'resorts' | 'users' | 'system';
type Row = { id: string; [key: string]: any };
type AdminNotification = {
  id: string;
  kind: 'user' | 'owner' | 'review' | 'weather';
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
};
type WeatherData = {
  location?: string; temperature?: number; temp?: number; feelsLike?: number;
  feels_like?: number; condition?: string; description?: string;
  humidity?: number; windSpeed?: number; wind_speed?: number;
};
type ConfirmState =
  | { kind: 'booking'; enabled: boolean }
  | { kind: 'platform'; suspended: boolean }
  | { kind: 'resort'; id: string; suspended: boolean; name: string }
  | { kind: 'user'; id: string; suspended: boolean; name: string }
  | { kind: 'ownerApproval'; id: string; approved: boolean; name: string }
  | null;

const WEATHER_API_BASE = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const DEFAULT_LOCATION = 'Victoria, Oriental Mindoro, PH';
const BOOKING_REF = doc(db, 'systemSettings', 'bookingAvailability');
const PLATFORM_REF = doc(db, 'systemSettings', 'platformControl');
const MAPTILER_KEY = (import.meta as any).env?.VITE_MAPTILER_KEY as string | undefined;
const RESORT_MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
  : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const textOf = (...values: any[]) => values.find(v => typeof v === 'string' && v.trim())?.trim() || '';
const isSuspended = (row: Row) =>
  row.suspended === true || row.isSuspended === true ||
  row.accountStatus === 'suspended' || row.status === 'suspended';

const isPendingOwner = (owner: Row) => {
  const status = textOf(owner.status, owner.approvalStatus, 'pending').toLowerCase();
  return owner.role === 'owner' && !isSuspended(owner) && !['approved', 'rejected', 'verified'].includes(status);
};

const detailLabel = (key: string) => ({
  fullName: 'Owner name', name: 'Name', email: 'Email address', phone: 'Contact number',
  businessName: 'Business name', resortName: 'Business name', permitId: 'Business permit number',
  address: 'Business address', resortLocation: 'Business location', municipality: 'Municipality',
  city: 'City', province: 'Province', status: 'Verification status', approvalStatus: 'Approval status',
  role: 'Account type', description: 'Description', location: 'Location', category: 'Category',
  price: 'Price', amenities: 'Amenities', capacity: 'Capacity', rejectionReason: 'Rejection reason',
  suspensionReason: 'Suspension reason',
} as Record<string, string>)[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

const displayDetailValue = (value: any): string => {
  if (value == null || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.map(item => {
      if (item == null) return '';
      if (typeof item === 'object') {
        return textOf(item.name, item.title, item.label, item.type,
          ...Object.values(item).filter(v => typeof v === 'string' || typeof v === 'number'));
      }
      return String(item);
    }).filter(Boolean).join(' · ') || 'Not provided';
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
    return Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null && typeof v !== 'function')
      .map(([k, v]) => `${detailLabel(k)}: ${displayDetailValue(v)}`)
      .join(' · ') || 'Not provided';
  }
  return String(value);
};

const getResortCoordinates = (row: Row): [number, number] | null => {
  const nested = row.coordinates || row.locationCoords || row.locationCoordinates || {};
  const longitude = Number(row.longitude ?? row.lng ?? row.lon ?? nested.longitude ?? nested.lng);
  const latitude = Number(row.latitude ?? row.lat ?? nested.latitude ?? nested.lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
};

const getReservationResortId = (booking: Row) =>
  textOf(booking.resortId, booking.packageId, booking.accommodationId);

const hiddenDetailKeys = new Set([
  'id', 'uid', 'ownerId', 'userId', 'permitImageUrl', 'businessPermitUrl', 'imageUrl',
  'imageUrls', 'photoURL', 'photoUrl', 'profileImage', 'profileImageUrl', 'createdAt',
  'updatedAt', 'reviewedAt', 'reviewedBy', 'suspendedAt', 'suspendedBy', 'adminCommentBy',
  'password', 'token', 'coordinates', 'locationCoords', 'locationCoordinates',
  'availabilityUpdatedBy', 'availabilityUpdatedAt', 'createdBy', 'updatedBy',
  'adminCommentAt', 'adminCommentBy', 'permitImageUrl', 'businessPermitUrl',
  'imageUrl', 'imageUrls', 'latitude', 'longitude', 'lat', 'lng', 'ownerEmail',
]);

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [users, setUsers] = useState<Row[]>([]);
  const [resorts, setResorts] = useState<Row[]>([]);
  const [reviews, setReviews] = useState<Row[]>([]);
  const [reservations, setReservations] = useState<Row[]>([]);
  const [dataError, setDataError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [resortSearch, setResortSearch] = useState('');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [toast, setToast] = useState('');
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const unreadNotifications = notifications.filter(item => !item.read).length;
  const addNotification = useCallback((item: Omit<AdminNotification, 'id' | 'createdAt' | 'read'>) => {
    setNotifications(current => [{
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      read: false,
    }, ...current].slice(0, 50));
  }, []);
  const [selectedDetails, setSelectedDetails] = useState<{ type: 'resort' | 'user'; item: Row } | null>(null);
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('');
  const [adminNewEmail, setAdminNewEmail] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [weatherUpdated, setWeatherUpdated] = useState<Date | null>(null);
  const [weatherRefresh, setWeatherRefresh] = useState(0);

  const [bookingEnabled, setBookingEnabled] = useState(true);
  const [bookingMessage, setBookingMessage] = useState('');
  const [bookingLoading, setBookingLoading] = useState(true);
  const [platformSuspended, setPlatformSuspended] = useState(false);
  const [platformMessage, setPlatformMessage] = useState('');
  const [platformLoading, setPlatformLoading] = useState(true);
  const [systemSaving, setSystemSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('mindoroAdminNotifications');
      if (saved) setNotifications(JSON.parse(saved));
    } catch (error) {
      console.warn('Unable to restore admin notifications:', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('mindoroAdminNotifications', JSON.stringify(notifications));
    } catch (error) {
      console.warn('Unable to save admin notifications:', error);
    }
  }, [notifications]);

  const owners = useMemo(() => users.filter(u => u.role === 'owner'), [users]);
  const travelers = useMemo(() => users.filter(u => u.role === 'user' || u.role === 'traveler'), [users]);
  const pendingOwners = useMemo(() => owners.filter(isPendingOwner), [owners]);
  const approvedOwners = useMemo(() => owners.filter(u => u.status === 'approved'), [owners]);
  const locationForWeather = useMemo(() => {
    const resort = resorts.find(r => textOf(r.city, r.municipality, r.location, r.address));
    const owner = approvedOwners.find(u => textOf(u.resortLocation, u.city, u.municipality, u.address));
    return textOf(resort?.city, resort?.municipality, resort?.location, resort?.address,
      owner?.resortLocation, owner?.city, owner?.municipality, DEFAULT_LOCATION);
  }, [resorts, approvedOwners]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async user => {
      if (!user) { navigate('/login?role=admin', { replace: true }); return; }
      try {
        const { getDoc } = await import('firebase/firestore');
        const profile = await getDoc(doc(db, 'users', user.uid));
        if (!profile.exists() || profile.data().role !== 'admin') {
          await signOut(auth);
          navigate('/login?role=admin', { replace: true });
        }
      } catch (e) {
        console.error('Admin role verification failed:', e);
        setDataError('Unable to verify administrator access. Check your account profile and Firestore rules.');
      }
    });
    let usersFirstSnapshot = true;
    const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!usersFirstSnapshot) {
        snap.docChanges().filter(change => change.type === 'added').forEach(change => {
          const data = change.doc.data() as Row;
          if (data.role === 'admin') return;
          const owner = data.role === 'owner';
          addNotification({
            kind: owner ? 'owner' : 'user',
            title: owner ? 'New owner registration' : 'New user registered',
            message: `${textOf(data.fullName, data.name, data.email, 'A new account')} ${owner ? 'submitted an owner application for verification.' : 'created an account.'}`,
          });
        });
      }
      usersFirstSnapshot = false;
      setUsers(rows);
      setLoading(false); setDataError('');
    }, e => {
      console.error(e); setDataError('Unable to load accounts. Check Firestore permissions.'); setLoading(false);
    });
    const unsubResorts = onSnapshot(collection(db, 'packages'), snap => {
      setResorts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => { console.error(e); setDataError(v => v || 'Unable to load resort listings.'); });
    // Platform reviews are saved by the Traveler Profile page in this exact collection.
    let reviewsFirstSnapshot = true;
    const unsubReviews = onSnapshot(collection(db, 'platformReviews'), snap => {
      if (!reviewsFirstSnapshot) {
        snap.docChanges().filter(change => change.type === 'added').forEach(change => {
          const data = change.doc.data() as Row;
          addNotification({
            kind: 'review',
            title: 'New platform review',
            message: `${textOf(data.userName, data.email, 'A platform member')} submitted a ${Number(data.rating || 0)}-star review.`,
          });
        });
      }
      reviewsFirstSnapshot = false;
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => {
      console.error(e);
      setDataError(v => v || 'Unable to load platform reviews. Check permissions for the platformReviews collection.');
    });
    const unsubReservations = onSnapshot(collection(db, 'reservations'), snap => {
      setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => {
      console.error('Unable to load reservations:', e);
      setDataError(v => v || 'Unable to load reservation counts. Check permissions for the reservations collection.');
    });
    const unsubBooking = onSnapshot(BOOKING_REF, snap => {
      const data = snap.exists() ? snap.data() : {};
      setBookingEnabled(data.bookingsEnabled !== false);
      setBookingMessage(typeof data.message === 'string' ? data.message : '');
      setBookingLoading(false);
    }, e => { console.error(e); setBookingLoading(false); });
    const unsubPlatform = onSnapshot(PLATFORM_REF, snap => {
      const data = snap.exists() ? snap.data() : {};
      setPlatformSuspended(data.suspended === true);
      setPlatformMessage(typeof data.message === 'string' ? data.message : '');
      setPlatformLoading(false);
    }, e => { console.error(e); setPlatformLoading(false); });
    return () => { unsubAuth(); unsubUsers(); unsubResorts(); unsubReviews(); unsubReservations(); unsubBooking(); unsubPlatform(); };
  }, [navigate, addNotification]);

  const loadWeather = useCallback(async (signal?: AbortSignal) => {
    setWeatherLoading(true); setWeatherError('');
    try {
      const params = new URLSearchParams({ city: locationForWeather });
      const response = await fetch(`${WEATHER_API_BASE}/api/weather/current?${params}`, signal ? { signal } : undefined);
      const result = await response.json();
      if (!response.ok || result?.success !== true || !result?.data) throw new Error(result?.message || 'Weather service is unavailable.');
      setWeather(result.data); setWeatherUpdated(new Date());
    } catch (e) {
      if (signal?.aborted) return;
      setWeather(null); setWeatherError(e instanceof Error ? e.message : 'Unable to retrieve weather.');
    } finally { if (!signal?.aborted) setWeatherLoading(false); }
  }, [locationForWeather]);

  useEffect(() => {
    if (activeTab !== 'overview') return;
    const controller = new AbortController();
    void loadWeather(controller.signal);
    return () => controller.abort();
  }, [activeTab, loadWeather, weatherRefresh]);

  useEffect(() => {
    if (activeTab !== 'overview') return;
    const timer = window.setInterval(() => setWeatherRefresh(v => v + 1), 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [activeTab]);

  const weatherText = `${weather?.condition || ''} ${weather?.description || ''}`.toLowerCase();
  const weatherCaution = ['thunder', 'storm', 'heavy rain', 'extreme'].some(s => weatherText.includes(s));
  const weatherIcon = weatherText.includes('thunder') || weatherText.includes('storm') ? thunderstormOutline
    : weatherText.includes('rain') || weatherText.includes('drizzle') ? rainyOutline
    : weatherText.includes('cloud') ? partlySunnyOutline
    : weatherText.includes('clear') || weatherText.includes('sun') ? sunnyOutline : cloudOutline;

  const lastWeatherNotice = useRef('');
  useEffect(() => {
    if (!weather || !weatherCaution) return;
    const signature = `${weather.location || locationForWeather}|${weather.condition || weather.description || ''}`;
    if (signature && signature !== lastWeatherNotice.current) {
      lastWeatherNotice.current = signature;
      addNotification({
        kind: 'weather',
        title: 'Weather advisory',
        message: `${weather.location || locationForWeather}: ${weather.description || weather.condition || 'Potentially severe weather conditions'}. Check official PAGASA advisories.`,
      });
    }
  }, [weather, weatherCaution, locationForWeather, addNotification]);

  const filteredResorts = useMemo(() => resorts.filter(r => {
    const haystack = `${textOf(r.name, r.resortName)} ${textOf(r.location, r.address, r.municipality, r.city)}`.toLowerCase();
    return haystack.includes(resortSearch.toLowerCase());
  }), [resorts, resortSearch]);
  const filteredUsers = useMemo(() => users.filter(u => u.role !== 'admin' && (u.role === 'owner' || u.role === 'user' || u.role === 'traveler')).filter(u => {
    const haystack = `${textOf(u.fullName, u.name, u.email)} ${u.role || ''}`.toLowerCase();
    return haystack.includes(userSearch.toLowerCase());
  }), [users, userSearch]);
  const filteredReviews = useMemo(() => reviews.filter(r => {
    const haystack = `${textOf(r.comment, r.userName, r.email, r.category, r.role)}`.toLowerCase();
    return haystack.includes(reviewSearch.toLowerCase());
  }).sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0; const tb = b.createdAt?.toMillis?.() || 0;
    return tb - ta;
  }), [reviews, reviewSearch]);

  const bookingCounts = useMemo(() => {
    const counts: Record<string, { total: number; pending: number; confirmed: number; cancelled: number }> = {};
    reservations.forEach(booking => {
      const resortId = getReservationResortId(booking);
      if (!resortId) return;
      if (!counts[resortId]) counts[resortId] = { total: 0, pending: 0, confirmed: 0, cancelled: 0 };
      counts[resortId].total += 1;
      const status = textOf(booking.status, booking.bookingStatus).toLowerCase();
      if (status.includes('pending')) counts[resortId].pending += 1;
      if (status.includes('confirm') || status === 'approved') counts[resortId].confirmed += 1;
      if (status.includes('cancel') || status.includes('reject')) counts[resortId].cancelled += 1;
    });
    return counts;
  }, [reservations]);

  const handleLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try { await signOut(auth); navigate('/login?role=admin', { replace: true }); }
    catch (e) { console.error(e); setToast('Unable to sign out. Please try again.'); setLogoutBusy(false); }
  };

  const saveSystemSetting = async () => {
    setSystemSaving(true);
    try {
      if (confirm?.kind === 'booking') {
        await setDoc(BOOKING_REF, {
          bookingsEnabled: confirm.enabled, emergencyMode: !confirm.enabled,
          message: bookingMessage.trim(), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || '',
        }, { merge: true });
        setToast(confirm.enabled ? 'New bookings have been enabled.' : 'New bookings have been disabled globally.');
      } else if (confirm?.kind === 'platform') {
        await setDoc(PLATFORM_REF, {
          suspended: confirm.suspended, message: platformMessage.trim(),
          updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || '',
        }, { merge: true });
        setToast(confirm.suspended ? 'Platform suspension activated.' : 'Platform suspension lifted.');
      } else if (confirm?.kind === 'resort') {
        await updateDoc(doc(db, 'packages', confirm.id), {
          isSuspended: confirm.suspended, suspended: confirm.suspended,
          status: confirm.suspended ? 'suspended' : 'active',
          suspensionReason: confirm.suspended ? reason.trim() : '',
          suspendedAt: confirm.suspended ? serverTimestamp() : null,
          suspendedBy: confirm.suspended ? auth.currentUser?.uid || '' : '',
          updatedAt: serverTimestamp(),
        });
        setToast(confirm.suspended ? 'Accommodation suspended.' : 'Accommodation suspension lifted.');
      } else if (confirm?.kind === 'ownerApproval') {
        await updateDoc(doc(db, 'users', confirm.id), {
          status: confirm.approved ? 'approved' : 'rejected',
          approvalStatus: confirm.approved ? 'approved' : 'rejected',
          reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser?.uid || '',
          rejectionReason: confirm.approved ? '' : reason.trim(), updatedAt: serverTimestamp(),
        });
        setToast(confirm.approved ? 'Owner application approved. Owner can now publish accommodations.' : 'Owner application rejected.');
      } else if (confirm?.kind === 'user') {
        await updateDoc(doc(db, 'users', confirm.id), {
          suspended: confirm.suspended, isSuspended: confirm.suspended,
          accountStatus: confirm.suspended ? 'suspended' : 'active',
          suspensionReason: confirm.suspended ? reason.trim() : '',
          suspendedAt: confirm.suspended ? serverTimestamp() : null,
          suspendedBy: confirm.suspended ? auth.currentUser?.uid || '' : '',
          updatedAt: serverTimestamp(),
        });
        setToast(confirm.suspended ? 'Account suspended.' : 'Account suspension lifted.');
      }
      setConfirm(null); setReason('');
    } catch (e) {
      console.error('Admin action failed:', e);
      setToast('Action could not be saved. Check Firestore rules and document fields.');
    } finally { setSystemSaving(false); }
  };

  const updateAdminAccount = async (kind: 'email' | 'password') => {
    const current = auth.currentUser;
    if (!current || !current.email) { setToast('Admin session is unavailable. Please sign in again.'); return; }
    if (!adminCurrentPassword.trim()) { setToast('Enter your current password to verify your identity.'); return; }
    if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminNewEmail.trim())) { setToast('Enter a valid new email address.'); return; }
    if (kind === 'password' && adminNewPassword.length < 6) { setToast('New password must be at least 6 characters.'); return; }
    setAccountSaving(true);
    try {
      const credential = EmailAuthProvider.credential(current.email, adminCurrentPassword);
      await reauthenticateWithCredential(current, credential);
      if (kind === 'email') { const nextEmail = adminNewEmail.trim(); await updateEmail(current, nextEmail); await updateDoc(doc(db, 'users', current.uid), { email: nextEmail, updatedAt: serverTimestamp() }); setToast('Admin email updated. Please use the new email next time you sign in.'); setAdminNewEmail(''); }
      else { await updatePassword(current, adminNewPassword); setToast('Admin password updated successfully.'); setAdminNewPassword(''); }
      setAdminCurrentPassword('');
    } catch (e: any) {
      console.error('Admin credential update failed:', e);
      setToast(e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential' ? 'Current password is incorrect.' : e?.code === 'auth/requires-recent-login' ? 'Please sign out and sign in again, then retry.' : e?.message || 'Unable to update admin account.');
    } finally { setAccountSaving(false); }
  };

  const postReviewComment = async (review: Row) => {
    const comment = (reviewComment[review.id] || '').trim();
    if (!comment) { setToast('Write a reply before sending.'); return; }
    setBusyId(review.id);
    try {
      await updateDoc(doc(db, 'platformReviews', review.id), {
        adminComment: comment, adminCommentBy: auth.currentUser?.uid || '',
        adminCommentAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setReviewComment(v => ({ ...v, [review.id]: '' }));
      setToast('Admin reply posted.');
    } catch (e) {
      console.error(e); setToast('Unable to post reply. Check review document permissions.');
    } finally { setBusyId(''); }
  };

  const markNotificationRead = (id: string) => {
    setNotifications(current => current.map(item => item.id === id ? { ...item, read: true } : item));
  };
  const markAllNotificationsRead = () => {
    setNotifications(current => current.map(item => ({ ...item, read: true })));
  };

  const refreshAll = (event: CustomEvent) => {
    setWeatherRefresh(v => v + 1);
    window.setTimeout(() => event.detail.complete(), 350);
  };

  if (loading) return <IonPage><IonContent className="admin-bg"><div className="admin-center"><IonSpinner name="crescent" /><span>Loading Admin Console...</span></div></IonContent></IonPage>;

  return (
    <IonPage>
      <IonContent className="admin-bg" fullscreen>
        <IonRefresher slot="fixed" onIonRefresh={refreshAll}><IonRefresherContent pullingText="Pull to refresh" /></IonRefresher>
        <header className="admin-header">
          <div className="admin-header-brand">
            <img className="admin-logo" src="/assets/mindoro-scape-logo.png" alt="Mindoro Scape logo" />
            <div><p className="admin-eyebrow">MINDORO SCAPE • ADMINISTRATION</p><h1>Admin Console</h1></div>
          </div>
          <div className="admin-header-actions"><span className="admin-live-indicator"><i /> Online</span>
            <div className="admin-notification-wrap">
              <button className="admin-notification-button" type="button" onClick={() => setNotificationOpen(v => !v)} aria-label={`Notifications, ${unreadNotifications} unread`}>
                <IonIcon icon={notificationsOutline} />
                {unreadNotifications > 0 && <span className="admin-notification-badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
              </button>
              {notificationOpen && <div className="admin-notification-panel">
                <div className="admin-notification-heading"><div><strong>Notifications</strong><small>{unreadNotifications} unread</small></div>
                  <button type="button" onClick={markAllNotificationsRead} disabled={unreadNotifications === 0}><IonIcon icon={checkmarkDoneOutline} /> Mark all read</button>
                </div>
                {notifications.length === 0 ? <div className="admin-notification-empty">You're all caught up. New registrations, reviews, and weather advisories will appear here.</div> :
                  <div className="admin-notification-list">{notifications.map(item => <button type="button" key={item.id} className={`admin-notification-item ${item.read ? 'read' : 'unread'}`} onClick={() => { markNotificationRead(item.id); if (item.kind === 'review') setActiveTab('overview'); else if (item.kind === 'owner' || item.kind === 'user') setActiveTab('users'); else setActiveTab('overview'); setNotificationOpen(false); }}>
                    <span className={`admin-notification-dot ${item.kind}`} />
                    <span className="admin-notification-copy"><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.createdAt).toLocaleString()}</small></span>
                    {!item.read && <i className="admin-notification-unread" />}
                  </button>)}</div>}
              </div>}
            </div>
            <button className="admin-logout-mini" type="button" onClick={handleLogout} disabled={logoutBusy} aria-label="Sign out">
              {logoutBusy ? <IonSpinner name="crescent" /> : <IonIcon icon={logOutOutline} />}
            </button>
          </div>
        </header>

        <main className="admin-main">
          {dataError && <div className="admin-inline-error"><IonIcon icon={alertCircleOutline} />{dataError}</div>}

          {activeTab === 'overview' && <section className="admin-tab-content">
            <div className="admin-welcome"><span className="admin-badge-live">LIVE PLATFORM OVERVIEW</span><h2>Good day, Administrator</h2><p>Monitor the Mindoro Scape community, partner resorts, reviews, and local weather.</p></div>
            <div className="admin-section-heading"><div><span className="admin-section-kicker">PLATFORM SUMMARY</span><h3>At a glance</h3></div><span className="admin-sync-label"><i /> Real-time data</span></div>
            <div className="admin-stats-grid">
              <Stat label="Travelers" value={travelers.length} icon={peopleOutline} />
              <Stat label="Resort owners" value={owners.length} icon={businessOutline} />
              <Stat label="Accommodations" value={resorts.length} icon={businessOutline} />
              <Stat label="Platform reviews" value={reviews.length} icon={chatbubbleEllipsesOutline} />
            </div>

            <section className={`admin-storm-card ${weatherCaution ? 'is-caution' : ''}`}>
              <div className="admin-weather-header"><div className="admin-weather-title"><span className="admin-weather-icon"><IonIcon icon={weatherCaution ? warningOutline : cloudOutline} /></span><div><span className="admin-section-kicker">WEATHER MONITOR</span><h3>Mindoro Conditions</h3><p><IonIcon icon={locationOutline} /> {weather?.location || locationForWeather}</p></div></div>
                <button className="admin-weather-refresh" type="button" onClick={() => setWeatherRefresh(v => v + 1)} disabled={weatherLoading}><IonIcon icon={refreshOutline} /></button>
              </div>
              {weatherLoading ? <div className="admin-weather-state"><IonSpinner name="crescent" /> Fetching current weather...</div>
                : weatherError ? <div className="admin-weather-error"><IonIcon icon={alertCircleOutline} /><div><strong>Weather unavailable</strong><span>{weatherError}</span></div><button onClick={() => setWeatherRefresh(v => v + 1)}>Retry</button></div>
                : weather && <>
                  <div className="admin-weather-current"><div className="admin-weather-condition-icon"><IonIcon icon={weatherIcon} /></div><div className="admin-weather-temperature"><strong>{Math.round(Number(weather.temperature ?? weather.temp ?? 0))}°</strong><span>{weather.description || weather.condition || 'Current conditions'}</span></div><div className="admin-weather-feels"><span>Feels like</span><strong>{Math.round(Number(weather.feelsLike ?? weather.feels_like ?? 0))}°C</strong></div></div>
                  <div className="admin-weather-metrics"><div><IonIcon icon={waterOutline} /><span>Humidity</span><strong>{Number(weather.humidity ?? 0)}%</strong></div><div><IonIcon icon={speedometerOutline} /><span>Wind</span><strong>{Number(weather.windSpeed ?? weather.wind_speed ?? 0)} m/s</strong></div><div><IonIcon icon={thermometerOutline} /><span>Temperature</span><strong>{Math.round(Number(weather.temperature ?? weather.temp ?? 0))}°C</strong></div></div>
                  <div className={`admin-weather-advisory ${weatherCaution ? 'warning' : 'normal'}`}><IonIcon icon={weatherCaution ? alertCircleOutline : checkmarkCircleOutline} /><div><strong>{weatherCaution ? 'Weather caution' : 'No severe condition detected in current weather data'}</strong><span>{weatherCaution ? 'Review resort operations and check official PAGASA bulletins.' : 'Continue monitoring. This is not an official storm warning.'}</span></div></div>
                  <div className="admin-weather-footer"><span>Updated {weatherUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>Check PAGASA for official alerts</span></div>
                </>}
            </section>

            <div className="admin-section-heading"><div><span className="admin-section-kicker">COMMUNITY FEEDBACK</span><h3>Platform Reviews</h3></div><span className="admin-sync-label">{reviews.length} total</span></div>
            <div className="admin-search"><IonIcon icon={searchOutline} /><input value={reviewSearch} onChange={e => setReviewSearch(e.target.value)} placeholder="Search review, name, or resort..." /></div>
            {filteredReviews.length === 0 ? <Empty icon={chatbubbleEllipsesOutline} title="No platform reviews found" detail="Reviews submitted by travelers or resort owners will appear here when saved in Firestore." /> :
              <div className="admin-review-list">{filteredReviews.map(review => {
                const author = textOf(review.userName, review.ownerName, review.fullName, review.authorName, review.email, 'Platform member');
                const body = textOf(review.comment, 'No written comment');
                const rating = Number(review.rating ?? review.stars ?? 0);
                const role = textOf(review.role, 'traveler').replace(/^traveler$/i, 'Traveler').replace(/^owner$/i, 'Resort Owner');
                return <article className="admin-review-card" key={review.id}>
                  <div className="admin-review-top"><div className="admin-directory-avatar user"><IonIcon icon={personOutline} /></div><div className="admin-directory-info"><h3>{author}</h3><p>{role} · {textOf(review.category, 'Platform review')}{review.createdAt?.toDate ? ` · ${review.createdAt.toDate().toLocaleDateString()}` : ''}</p></div>
                    {rating > 0 && <span className="admin-rating"><IonIcon icon={starOutline} /> {rating.toFixed(1)}</span>}</div>
                  <p className="admin-review-body">{body}</p>
                  {review.adminComment && <div className="admin-admin-reply"><strong>Admin response</strong><p>{review.adminComment}</p></div>}
                  <label className="admin-field-label" htmlFor={`reply-${review.id}`}>Reply to this review</label>
                  <textarea id={`reply-${review.id}`} rows={2} value={reviewComment[review.id] || ''} onChange={e => setReviewComment(v => ({ ...v, [review.id]: e.target.value }))} placeholder="Write an official response..." />
                  <button className="admin-primary-button admin-review-send" type="button" disabled={busyId === review.id} onClick={() => void postReviewComment(review)}>{busyId === review.id ? <IonSpinner name="crescent" /> : <IonIcon icon={sendOutline} />} Post response</button>
                </article>;
              })}</div>}
          </section>}

          {activeTab === 'resorts' && <section className="admin-tab-content">
            <div className="admin-page-heading"><span className="admin-badge-live">RESORT DIRECTORY</span><h2>Resorts & Accommodations</h2><p>Review live listings and suspend accommodations with documented violations.</p></div>
            <div className="admin-user-summary"><div><strong>{resorts.length}</strong><span>All listings</span></div><div><strong>{resorts.filter(isSuspended).length}</strong><span>Suspended listings</span></div></div>
            <section className="admin-verification-panel"><div className="admin-section-heading"><div><span className="admin-section-kicker">OWNER VERIFICATION</span><h3>Business permit & owner approval</h3><p>Open an application to inspect the submitted business information and permit before approving the owner.</p></div><span className="admin-sync-label">{pendingOwners.length} pending</span></div>
            {pendingOwners.length === 0 ? <Empty icon={checkmarkCircleOutline} title="No pending applications" detail="New owner applications awaiting business permit review will appear here." /> :
              <div className="admin-directory-list">{pendingOwners.map(owner => <article className="admin-directory-card" key={`pending-${owner.id}`}>
                <div className="admin-directory-avatar"><IonIcon icon={businessOutline} /></div>
                <div className="admin-directory-info"><h3>{textOf(owner.fullName, owner.name, owner.email, 'Unnamed owner')}</h3><p>{textOf(owner.resortName, 'Business name not provided')}</p><small>Permit ID: {textOf(owner.permitId, 'Not provided')}</small><span className="admin-status-pill offline">Pending review</span></div>
                <div className="admin-card-actions"><button className="admin-view-button" type="button" onClick={() => setSelectedDetails({ type: 'user', item: owner })}><IonIcon icon={eyeOutline} /> View documents</button><button className="admin-enable-button" type="button" onClick={() => { setReason(''); setConfirm({ kind: 'ownerApproval', id: owner.id, approved: true, name: textOf(owner.resortName, owner.fullName, 'owner') }); }}><IonIcon icon={checkmarkCircleOutline} /> Approve</button><button className="admin-danger-button" type="button" onClick={() => { setReason(''); setConfirm({ kind: 'ownerApproval', id: owner.id, approved: false, name: textOf(owner.resortName, owner.fullName, 'owner') }); }}>Reject</button></div>
              </article>)}</div>}
            </section>
            <div className="admin-section-heading admin-map-heading"><div><span className="admin-section-kicker">GEOGRAPHIC OVERVIEW</span><h3>Resort Map</h3><p>Explore accommodation locations across Oriental Mindoro.</p></div><span className="admin-sync-label">{resorts.filter(r => getResortCoordinates(r)).length} mapped</span></div>
            <ResortMap resorts={resorts} bookingCounts={bookingCounts} onViewDetails={(resort) => setSelectedDetails({ type: 'resort', item: resort })} />
            <div className="admin-search"><IonIcon icon={searchOutline} /><input value={resortSearch} onChange={e => setResortSearch(e.target.value)} placeholder="Search resort or location..." /></div>
            <div className="admin-list-heading"><strong>Accommodation directory</strong><span>{filteredResorts.length} listings</span></div>
            {filteredResorts.length === 0 ? <Empty icon={businessOutline} title="No accommodations found" detail="Resort listings from Firestore will appear here." /> :
              <div className="admin-directory-list">{filteredResorts.map(resort => {
                const owner = users.find(u => u.id === resort.ownerId);
                const name = textOf(resort.name, resort.resortName, resort.title, 'Unnamed accommodation');
                const place = textOf(resort.location, resort.address, resort.municipality, resort.city, owner?.resortLocation, 'Location not provided');
                const suspended = isSuspended(resort);
                return <article className="admin-directory-card admin-resort-card" key={resort.id}>
                  <div className="admin-directory-avatar"><IonIcon icon={businessOutline} /></div>
                  <div className="admin-directory-info"><h3>{name}</h3><p><IonIcon icon={locationOutline} />{place}</p><small>Owner: {textOf(owner?.fullName, owner?.name, owner?.email, 'Not linked')}</small>
                    <small className="admin-booking-count">Bookings: {bookingCounts[resort.id]?.total || 0}</small>
                    {resort.suspensionReason && <small className="admin-reason">Reason: {resort.suspensionReason}</small>}<span className={`admin-status-pill ${suspended ? 'offline' : 'online'}`}>{suspended ? 'Suspended' : textOf(resort.status, 'Active')}</span></div>
                  <div className="admin-card-actions">
                    <button className="admin-view-button" type="button" onClick={() => setSelectedDetails({ type: 'resort', item: resort })}><IonIcon icon={eyeOutline} /> View details</button>
                    <button className={suspended ? 'admin-enable-button' : 'admin-danger-button'} type="button" onClick={() => { setReason(''); setConfirm({ kind: 'resort', id: resort.id, suspended: !suspended, name }); }}>
                      <IonIcon icon={suspended ? playCircleOutline : pauseCircleOutline} /> {suspended ? 'Restore' : 'Suspend'}
                    </button></div>
                </article>;
              })}</div>}
          </section>}

          {activeTab === 'users' && <section className="admin-tab-content">
            <div className="admin-page-heading"><span className="admin-badge-live">COMMUNITY & PARTNERS</span><h2>Users & Resort Owners</h2><p>Manage account access and document policy violations.</p></div>
            <div className="admin-user-summary"><div><strong>{travelers.length}</strong><span>Travelers</span></div><div><strong>{owners.length}</strong><span>Resort owners</span></div></div>
            <div className="admin-search"><IonIcon icon={searchOutline} /><input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search name, email, or role..." /></div>
            <div className="admin-list-heading"><strong>Registered accounts</strong><span>{filteredUsers.length} accounts</span></div>
            {filteredUsers.length === 0 ? <Empty icon={peopleOutline} title="No accounts found" detail="Registered accounts will appear here." /> :
              <div className="admin-directory-list">{filteredUsers.map(user => {
                const suspended = isSuspended(user);
                const name = textOf(user.fullName, user.name, user.displayName, user.email, 'Unnamed account');
                return <article className="admin-directory-card" key={user.id}>
                  <div className="admin-directory-avatar user"><IonIcon icon={peopleOutline} /></div>
                  <div className="admin-directory-info"><h3>{name}</h3><p>{textOf(user.email, 'No email provided')}</p><small>{textOf(user.role, 'Unspecified role')} {user.role === 'owner' ? ` • ${textOf(user.status, 'pending')}` : ''} {user.suspensionReason ? ` • ${user.suspensionReason}` : ''}</small><span className={`admin-status-pill ${suspended ? 'offline' : 'online'}`}>{suspended ? 'Suspended' : 'Active'}</span></div>
                  <div className="admin-card-actions"><button className="admin-view-button" type="button" onClick={() => setSelectedDetails({ type: 'user', item: user })}><IonIcon icon={eyeOutline} /> View details</button>
                    <button className={suspended ? 'admin-enable-button' : 'admin-danger-button'} type="button" onClick={() => { setReason(''); setConfirm({ kind: 'user', id: user.id, suspended: !suspended, name }); }}>
                      <IonIcon icon={suspended ? playCircleOutline : lockClosedOutline} /> {suspended ? 'Restore' : 'Suspend'}
                    </button></div>
                </article>;
              })}</div>}
          </section>}

          {activeTab === 'system' && <section className="admin-tab-content">
            <div className="admin-page-heading"><span className="admin-badge-live">PLATFORM SAFETY</span><h2>System Controls</h2><p>Pause platform access or stop new reservations during emergencies and maintenance.</p></div>
            <div className={`admin-emergency-card ${platformSuspended ? 'disabled' : ''}`}>
              <div className="admin-emergency-top"><span className="admin-emergency-icon"><IonIcon icon={platformSuspended ? lockClosedOutline : shieldOutline} /></span><span className={`admin-status-pill ${platformSuspended ? 'offline' : 'online'}`}>{platformSuspended ? 'Platform suspended' : 'Platform operational'}</span></div>
              <h3>Platform Suspension</h3><p>Turns on a global maintenance/suspension flag. Your app's route guards and login flow must read this setting to block access consistently.</p>
              <label className="admin-field-label" htmlFor="platform-message">Message shown to users</label>
              <textarea id="platform-message" rows={3} value={platformMessage} onChange={e => setPlatformMessage(e.target.value)} placeholder="Example: Mindoro Scape is temporarily unavailable while we address a platform-wide issue." />
              <button className={platformSuspended ? 'admin-enable-button' : 'admin-danger-button'} type="button" disabled={platformLoading || systemSaving} onClick={() => setConfirm({ kind: 'platform', suspended: !platformSuspended })}>
                <IonIcon icon={platformSuspended ? playCircleOutline : banOutline} /> {platformSuspended ? 'Lift platform suspension' : 'Suspend platform'}
              </button>
              {platformLoading && <p className="admin-control-loading"><IonSpinner name="crescent" /> Loading platform setting...</p>}
            </div>
            <div className={`admin-emergency-card ${!bookingEnabled ? 'disabled' : ''}`}>
              <div className="admin-emergency-top"><span className="admin-emergency-icon"><IonIcon icon={bookingEnabled ? checkmarkDoneOutline : banOutline} /></span><span className={`admin-status-pill ${bookingEnabled ? 'online' : 'offline'}`}>{bookingEnabled ? 'Bookings enabled' : 'Bookings disabled'}</span></div>
              <h3>Global Booking Availability</h3><p>Disable all new reservations during typhoons, severe weather, or other emergencies. Existing reservations are not deleted.</p>
              <label className="admin-field-label" htmlFor="booking-message">Booking notice</label>
              <textarea id="booking-message" rows={3} value={bookingMessage} onChange={e => setBookingMessage(e.target.value)} placeholder="Explain why new bookings are temporarily unavailable..." />
              <button className={bookingEnabled ? 'admin-danger-button' : 'admin-enable-button'} type="button" disabled={bookingLoading || systemSaving} onClick={() => setConfirm({ kind: 'booking', enabled: !bookingEnabled })}>
                <IonIcon icon={bookingEnabled ? banOutline : checkmarkCircleOutline} /> {bookingEnabled ? 'Disable all new bookings' : 'Re-enable new bookings'}
              </button>
              {bookingLoading && <p className="admin-control-loading"><IonSpinner name="crescent" /> Loading booking setting...</p>}
            </div>
            <div className="admin-emergency-card">
              <h3>Administrator Account</h3><p>Update the signed-in administrator email or password. Firebase requires your current password to verify these changes.</p>
              <label className="admin-field-label" htmlFor="admin-current-password">Current password</label><input className="admin-account-input" id="admin-current-password" type="password" autoComplete="current-password" value={adminCurrentPassword} onChange={e => setAdminCurrentPassword(e.target.value)} placeholder="Enter current password" />
              <label className="admin-field-label" htmlFor="admin-new-email">New email address</label><input className="admin-account-input" id="admin-new-email" type="email" autoComplete="email" value={adminNewEmail} onChange={e => setAdminNewEmail(e.target.value)} placeholder={auth.currentUser?.email || 'admin@example.com'} />
              <button className="admin-primary-button" type="button" disabled={accountSaving || !adminCurrentPassword || !adminNewEmail.trim()} onClick={() => void updateAdminAccount('email')}>{accountSaving ? <IonSpinner name="crescent" /> : 'Update email'}</button>
              <label className="admin-field-label" htmlFor="admin-new-password">New password</label><input className="admin-account-input" id="admin-new-password" type="password" autoComplete="new-password" value={adminNewPassword} onChange={e => setAdminNewPassword(e.target.value)} placeholder="At least 6 characters" />
              <button className="admin-primary-button" type="button" disabled={accountSaving || !adminCurrentPassword || adminNewPassword.length < 6} onClick={() => void updateAdminAccount('password')}>{accountSaving ? <IonSpinner name="crescent" /> : 'Update password'}</button>
            </div>
            <div className="admin-system-info"><h3>Live configuration</h3>
              <div><span>Platform</span><strong>{platformLoading ? 'Loading' : platformSuspended ? 'Suspended' : 'Operational'}</strong></div>
              <div><span>New bookings</span><strong>{bookingLoading ? 'Loading' : bookingEnabled ? 'Enabled' : 'Disabled'}</strong></div>
              <div><span>Reviews loaded</span><strong>{reviews.length}</strong></div>
              <div><span>Platform control document</span><strong>systemSettings/platformControl</strong></div>
              <div><span>Booking control document</span><strong>systemSettings/bookingAvailability</strong></div>
            </div>
            <p className="admin-emergency-note"><IonIcon icon={informationCircleOutline} /> Existing reservations remain unchanged. Suspending a user in Firestore must also be enforced in Login and Firestore Security Rules; this dashboard alone cannot revoke Firebase Authentication credentials.</p>
          </section>}
        </main>

        <nav className="admin-bottom-nav" aria-label="Admin navigation">
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')} type="button"><IonIcon icon={shieldOutline} /><span>Overview</span></button>
          <button className={activeTab === 'resorts' ? 'active' : ''} onClick={() => setActiveTab('resorts')} type="button"><IonIcon icon={businessOutline} /><span>Resorts</span></button>
          <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')} type="button"><IonIcon icon={peopleOutline} /><span>Users</span></button>
          <button className={activeTab === 'system' ? 'active' : ''} onClick={() => setActiveTab('system')} type="button"><IonIcon icon={settingsOutline} /><span>System</span></button>
        </nav>

        {confirm && <div className="admin-modal-backdrop" onClick={() => !systemSaving && setConfirm(null)} role="presentation">
          <div className="admin-confirm-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <button className="admin-modal-close" type="button" onClick={() => setConfirm(null)} disabled={systemSaving}><IonIcon icon={closeOutline} /></button>
            <span className="admin-confirm-icon"><IonIcon icon={warningOutline} /></span>
            <h3>{(confirm.kind === 'user' || confirm.kind === 'resort') && confirm.suspended ? 'Confirm suspension' : confirm.kind === 'booking' ? (confirm.enabled ? 'Re-enable bookings?' : 'Disable all bookings?')
              : confirm.kind === 'platform' ? (confirm.suspended ? 'Suspend the platform?' : 'Lift platform suspension?')
              : confirm.kind === 'ownerApproval' ? (confirm.approved ? `Approve ${confirm.name}?` : `Reject ${confirm.name}?`)
              : confirm.kind === 'resort' ? (confirm.suspended ? `Suspend ${confirm.name}?` : `Restore ${confirm.name}?`)
              : (confirm.suspended ? `Suspend ${confirm.name}?` : `Restore ${confirm.name}?`)}</h3>
            <p>{confirm.kind === 'user' && confirm.suspended
              ? `Are you sure you want to suspend ${confirm.name}? They will lose access to their account once suspension is enforced by the app.`
              : confirm.kind === 'resort' && confirm.suspended
                ? `Are you sure you want to suspend ${confirm.name}? This accommodation will be marked as suspended.`
                : confirm.kind === 'platform' && confirm.suspended
                  ? 'Are you sure you want to suspend the platform? Users will be blocked only when the app checks this platform setting.'
                  : confirm.kind === 'booking' && !confirm.enabled
                    ? 'Are you sure you want to disable new bookings across the platform?'
                    : confirm.kind === 'ownerApproval' && confirm.approved
                      ? `Are you sure you want to approve ${confirm.name}? The owner will be allowed to publish accommodations.`
                      : confirm.kind === 'ownerApproval'
                        ? `Are you sure you want to reject ${confirm.name}’s application?`
                        : 'Are you sure you want to proceed with this change?'}</p>
            {(confirm.kind === 'resort' || confirm.kind === 'user') && confirm.suspended && <>
              <label className="admin-field-label" htmlFor="suspension-reason">Reason for suspension</label>
              <textarea id="suspension-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Describe the policy violation..." />
            </>}
            {confirm.kind === 'ownerApproval' && !confirm.approved && <><label className="admin-field-label" htmlFor="owner-rejection-reason">Reason for rejection</label><textarea id="owner-rejection-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain what document or information needs correction..." /></>}
            <div className="admin-confirm-actions"><button className="admin-cancel-button" type="button" onClick={() => setConfirm(null)} disabled={systemSaving}>Cancel</button>
              <button className="admin-danger-button" type="button" disabled={systemSaving || ((confirm.kind === 'resort' || confirm.kind === 'user') && confirm.suspended && !reason.trim()) || (confirm.kind === 'ownerApproval' && !confirm.approved && !reason.trim())} onClick={() => void saveSystemSetting()}>
                {systemSaving ? <IonSpinner name="crescent" /> : 'Confirm'}
              </button></div>
          </div>
        </div>}
        {selectedDetails && <div className="admin-modal-backdrop" onClick={() => setSelectedDetails(null)} role="presentation"><div className="admin-detail-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
          <button className="admin-modal-close" type="button" onClick={() => setSelectedDetails(null)}><IonIcon icon={closeOutline} /></button>
          <span className="admin-badge-live">{selectedDetails.type === 'resort' ? 'ACCOMMODATION DETAILS' : 'USER DETAILS'}</span>
          <h3>{textOf(selectedDetails.item.name, selectedDetails.item.resortName, selectedDetails.item.fullName, selectedDetails.item.email, 'Details')}</h3>
          <div className="admin-detail-list">{Object.entries(selectedDetails.item)
            .filter(([key, value]) => !hiddenDetailKeys.has(key) && value !== undefined && value !== null && typeof value !== 'function')
            .filter(([key]) => !/(url|image|photo|avatar|password|token|secret|credential|^id$)/i.test(key))
            .map(([key, value]) => <div className="admin-detail-row" key={key}><span>{detailLabel(key)}</span><strong>{displayDetailValue(value)}</strong></div>)}
          </div>
          {selectedDetails.type === 'resort' && <div className="admin-booking-summary">
            <h4>Reservation activity</h4>
            <div><strong>{bookingCounts[selectedDetails.item.id]?.total || 0}</strong><span>Total bookings</span></div>
            <div><strong>{bookingCounts[selectedDetails.item.id]?.pending || 0}</strong><span>Pending</span></div>
            <div><strong>{bookingCounts[selectedDetails.item.id]?.confirmed || 0}</strong><span>Confirmed</span></div>
            <div><strong>{bookingCounts[selectedDetails.item.id]?.cancelled || 0}</strong><span>Cancelled</span></div>
          </div>}
          {selectedDetails.type === 'user' && selectedDetails.item.role === 'owner' && <div className="admin-permit-preview">
            <h4>Submitted Business Permit</h4><p>Permit number: {textOf(selectedDetails.item.permitId, 'Not provided')}</p>
            {textOf(selectedDetails.item.permitImageUrl, selectedDetails.item.businessPermitUrl) ? <img src={textOf(selectedDetails.item.permitImageUrl, selectedDetails.item.businessPermitUrl)} alt="Submitted business permit" /> : <div className="admin-no-document">No business permit image has been submitted.</div>}
          </div>}
          {selectedDetails.type === 'resort' && (selectedDetails.item.imageUrl || selectedDetails.item.imageUrls?.[0]) && <div className="admin-permit-preview"><h4>Accommodation photo</h4><img src={selectedDetails.item.imageUrl || selectedDetails.item.imageUrls[0]} alt="Accommodation" /></div>}
          <button className="admin-primary-button" type="button" onClick={() => setSelectedDetails(null)}>Close</button>
        </div></div>}
        {toast && <div className="admin-toast" role="status"><span>{toast}</span><button type="button" onClick={() => setToast('')}><IonIcon icon={closeOutline} /></button></div>}
      </IonContent>
    </IonPage>
  );
};


type ResortMapProps = {
  resorts: Row[];
  bookingCounts: Record<string, { total: number; pending: number; confirmed: number; cancelled: number }>;
  onViewDetails: (resort: Row) => void;
};

const ResortMap: React.FC<ResortMapProps> = ({ resorts, bookingCounts, onViewDetails }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
const mapRef = useRef<maplibregl.Map | null>(null);
const markersRef = useRef<maplibregl.Marker[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const mappedResorts = useMemo(
    () => resorts.map(resort => ({ resort, coordinates: getResortCoordinates(resort) }))
      .filter((item): item is { resort: Row; coordinates: [number, number] } => !!item.coordinates),
    [resorts]
  );

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: RESORT_MAP_STYLE,
      center: [121.35, 13.40],
      zoom: 8.2,
      minZoom: 7,
      maxZoom: 17,
      attributionControl: {
  compact: true,
},
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    mapRef.current = map;
    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    mappedResorts.forEach(({ resort, coordinates }) => {
      const markerElement = document.createElement('button');
      markerElement.type = 'button';
      markerElement.className = `admin-map-marker ${isSuspended(resort) ? 'suspended' : ''}`;
      markerElement.setAttribute('aria-label', `View ${textOf(resort.name, resort.resortName, 'resort')}`);
      markerElement.innerHTML = '<span class="admin-map-marker-pin"><span></span></span>';
      markerElement.addEventListener('click', () => {
        setSelected(resort);
        map.flyTo({ center: coordinates, zoom: 14, speed: 1.1, curve: 1.35, essential: true });
      });
      const marker = new maplibregl.Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat(coordinates)
        .addTo(map);
      markersRef.current.push(marker);
    });
    if (mappedResorts.length > 0) {
      if (mappedResorts.length === 1) {
        map.flyTo({ center: mappedResorts[0].coordinates, zoom: 10, duration: 700 });
      } else {
        const bounds = new maplibregl.LngLatBounds();
        mappedResorts.forEach(item => bounds.extend(item.coordinates));
        map.fitBounds(bounds, { padding: 58, maxZoom: 9.5, duration: 700 });
      }
    }
  }, [mappedResorts]);

  const selectedCoordinates = selected ? getResortCoordinates(selected) : null;
  const selectedBookings = selected ? bookingCounts[selected.id] : undefined;

  return <section className="admin-resort-map-card">
    <div className="admin-resort-map" ref={mapContainer} aria-label="Map of resorts in Oriental Mindoro" />
    <div className="admin-map-legend"><span><i className="available" /> Active listing</span><span><i className="suspended" /> Suspended listing</span><span className="admin-map-region">Oriental Mindoro, Philippines</span></div>
    {mappedResorts.length === 0 && <div className="admin-map-empty">No resort coordinates found. Add numeric latitude and longitude fields to each package to show its marker on the map.</div>}
    {selected && <div className="admin-map-selected">
      <button type="button" className="admin-map-selected-close" onClick={() => setSelected(null)} aria-label="Close resort preview">×</button>
      <span className="admin-section-kicker">SELECTED RESORT</span>
      <h4>{textOf(selected.name, selected.resortName, selected.title, 'Unnamed resort')}</h4>
      <p>{textOf(selected.locationLabel, selected.resortLocation, selected.location, selected.address, selected.municipality, selected.city, 'Location not provided')}</p>
      <div className="admin-map-bookings"><strong>{selectedBookings?.total || 0}</strong><span>Total bookings</span><strong>{selectedBookings?.pending || 0}</strong><span>Pending</span></div>
      {selectedCoordinates && <small>{selectedCoordinates[1].toFixed(5)}, {selectedCoordinates[0].toFixed(5)}</small>}
      <button type="button" className="admin-primary-button" onClick={() => onViewDetails(selected)}>View resort information</button>
    </div>}
  </section>;
};

const Stat: React.FC<{ label: string; value: number; icon: string }> = ({ label, value, icon }) =>
  <article className="admin-stat-card"><div className="admin-stat-top"><span className="admin-stat-label">{label}</span><span className="admin-stat-icon"><IonIcon icon={icon} /></span></div><h3 className="admin-stat-value">{value.toLocaleString()}</h3><span className="admin-stat-sub">Live Firestore records</span></article>;

const Empty: React.FC<{ icon: string; title: string; detail: string }> = ({ icon, title, detail }) =>
  <div className="admin-empty"><IonIcon icon={icon} /><strong>{title}</strong><span>{detail}</span></div>;

export default AdminDashboard;
