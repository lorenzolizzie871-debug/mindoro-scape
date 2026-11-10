import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IonContent,
  IonPage,
  IonSpinner,
  IonIcon,
} from '@ionic/react';
import {
  addDoc,
  collection,
  deleteDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  increment,
  runTransaction,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  homeOutline,
  compassOutline,
  calendarOutline,
  heartOutline,
  personOutline,
  locationOutline,
  cardOutline,
  timeOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  alertCircleOutline,
  eyeOutline,
  receiptOutline,
  chatbubbleEllipsesOutline,
  sendOutline,
  arrowBackOutline,
  closeOutline,
  walletOutline,
  refreshOutline,
  calendarClearOutline,
  personCircleOutline,
  heart,
  star,
  starOutline,
} from 'ionicons/icons';
import './MyBookings.css';
type TimestampLike = {
  toDate?: () => Date;
  seconds?: number;
};
type Receipt = {
  receiptNumber?: string;
  referenceCode?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  amount?: number | string;
  currency?: string;
  transactionId?: string;
  captureId?: string;
  orderId?: string;
  payerEmail?: string | null;
  issuedAt?: TimestampLike | Date | string | null;
  [key: string]: unknown;
};
type Booking = {
  id: string;
  userId?: string;
  ownerId?: string;
  resortId?: string;
  referenceCode?: string;
  resortName?: string;
  accommodationName?: string;
  resortLocation?: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  cancellationType?: string;
  cancellationReason?: string;
  autoCancelledAt?: TimestampLike | Date | string | null;
  paymentMethod?: string;
  paymentStatus?: string;
  pricing?: {
    total?: number;
    currency?: string;
  };
  guest?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
  receipt?: Receipt | null;
  cashReceipt?: Receipt | null;
  createdAt?: TimestampLike | Date | string | null;
  updatedAt?: TimestampLike | Date | string | null;
  reviewed?: boolean;
  reviewSubmitted?: boolean;
  offerId?: string;
  accommodationId?: string;
  [key: string]: unknown;
};
type Chat = {
  id: string;
  bookingId: string;
  reservationId?: string;
  userId: string;
  ownerId: string;
  resortId?: string;
  resortName?: string;
  referenceCode?: string;
  participantIds?: string[];
  lastMessage?: string;
  lastMessageSenderId?: string;
  lastMessageAt?: TimestampLike | Date | string | null;
  lastReadByUserAt?: TimestampLike | Date | string | null;
  updatedAt?: TimestampLike | Date | string | null;
  createdAt?: TimestampLike | Date | string | null;
  requestType?: string;
  requestStatus?: string;
  unreadForUser?: number;
};
type ChatMessage = {
  id: string;
  senderId: string;
  senderRole: 'user' | 'owner';
  type?: 'text' | 'refund_request' | 'cancellation_request';
  text: string;
  createdAt?: TimestampLike | Date | string | null;
};
const money = (amount: number | string | undefined, currency = 'PHP') => {
  const value = Number(amount || 0);
  return `${currency.toUpperCase() === 'PHP' ? '₱' : `${currency} `}${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
const toDate = (value?: TimestampLike | Date | string | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
};
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
const formatDateTime = (value?: TimestampLike | Date | string | null) => {
  const date = toDate(value);
  if (!date) return 'Not available';
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};
const formatStatus = (value?: string) => {
  if (!value) return 'Pending';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};
// Keep the booking footer message consistent with the reservation's actual status.
const getBookingFooterMessage = (booking: Booking) => {
  const status = String(booking.status || 'pending').trim().toLowerCase();
  if (status === 'confirmed' || status === 'approved') {
    return 'Your reservation is confirmed';
  }
  if (status === 'completed') {
    return 'Your stay is completed — share your experience';
  }
  if (status === 'cancelled') {
    if (booking.cancellationType === 'system_auto_cancel') {
      return 'Automatically cancelled — resort owner did not confirm before check-in';
    }
    return booking.cancellationReason || 'This reservation has been cancelled';
  }
  if (status === 'declined' || status === 'rejected') {
    return 'Your reservation was declined by the resort owner';
  }
  if (status === 'refund_approved') {
    return 'Refund approved — awaiting processing';
  }
  if (status === 'refunded') {
    return 'Your payment has been refunded';
  }
  return 'Waiting for resort confirmation';
};
const getBookingFooterIcon = (booking: Booking) => {
  const status = String(booking.status || 'pending').trim().toLowerCase();
  if (status === 'cancelled' || status === 'declined' || status === 'rejected') {
    return closeCircleOutline;
  }
  return checkmarkCircleOutline;
};
const paymentMethodLabel = (method?: string) => {
  const value = (method || '').toLowerCase();
  if (value === 'onsite' || value === 'cash' || value === 'pay_at_resort') return 'Cash / Pay at Resort';
  if (value === 'paypal') return 'PayPal';
  return method ? formatStatus(method) : 'Not specified';
};
const getTimestamp = (value?: TimestampLike | Date | string | null) =>
  toDate(value)?.getTime() || 0;
// Returns YYYY-MM-DD without shifting date-only booking values across time zones.
const getBookingDateKey = (value?: string) => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const getLocalTodayKey = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const MyBookings: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = auth.currentUser;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [receiptBooking, setReceiptBooking] = useState<Booking | null>(null);
  const [showInbox, setShowInbox] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [notice, setNotice] = useState('');
  const [bookingView, setBookingView] = useState<'current' | 'history'>('current');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [profileName, setProfileName] = useState(user?.displayName || '');
  const [profilePhotoURL, setProfilePhotoURL] = useState(user?.photoURL || '');
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        setProfileName(String(data.fullName || user.displayName || ''));
        setProfilePhotoURL(String(data.photoURL || user.photoURL || ''));
      },
      (err) => console.warn('Unable to load profile avatar:', err)
    );
    return () => unsubscribe();
  }, [user?.uid]);
  useEffect(() => {
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
        results.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
        setBookings(results);
        setError('');
        setLoading(false);
      },
      (err) => {
        console.error('Unable to load bookings:', err);
        setError('Unable to load your reservations. Please check your connection and try again.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user?.uid]);
  // Expire unconfirmed reservations once their check-in date has started.
  // This client-side safeguard runs when the bookings page is opened/active.
  // For guaranteed background execution, deploy the scheduled Cloud Function
  // described after the code delivery.
  useEffect(() => {
    if (!user || bookings.length === 0) return;
    const todayKey = getLocalTodayKey();
    const expiredPendingBookings = bookings.filter((booking) => {
      const status = String(booking.status || 'pending').toLowerCase();
      const checkInKey = getBookingDateKey(booking.checkIn);
      const isAwaitingOwner =
        status === 'pending' ||
        status === 'unconfirmed' ||
        status === 'awaiting_confirmation' ||
        status === 'pending_confirmation';
      return isAwaitingOwner && Boolean(checkInKey) && checkInKey <= todayKey;
    });
    expiredPendingBookings.forEach((booking) => {
      const bookingRef = doc(db, 'reservations', booking.id);
      void runTransaction(db, async (transaction) => {
        const freshSnapshot = await transaction.get(bookingRef);
        if (!freshSnapshot.exists()) return;
        const fresh = freshSnapshot.data();
        const freshStatus = String(fresh.status || 'pending').toLowerCase();
        const freshCheckIn = getBookingDateKey(
          typeof fresh.checkIn === 'string' ? fresh.checkIn : ''
        );
        const stillAwaitingOwner =
          freshStatus === 'pending' ||
          freshStatus === 'unconfirmed' ||
          freshStatus === 'awaiting_confirmation' ||
          freshStatus === 'pending_confirmation';
        if (stillAwaitingOwner && freshCheckIn && freshCheckIn <= todayKey) {
          transaction.update(bookingRef, {
            status: 'cancelled',
            cancellationReason: 'Automatically cancelled because the owner did not confirm before the check-in date.',
            cancellationType: 'system_auto_cancel',
            autoCancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }).catch((err) => {
        console.error(`Unable to auto-cancel expired booking ${booking.id}:`, err);
      });
    });
  }, [user?.uid, bookings]);
  useEffect(() => {
    if (!user) {
      setChats([]);
      return;
    }
    const chatsQuery = query(
      collection(db, 'bookingChats'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Chat[];
        items.sort((a, b) => getTimestamp(b.updatedAt || b.lastMessageAt) - getTimestamp(a.updatedAt || a.lastMessageAt));
        setChats(items);
      },
      (err) => {
        console.error('Unable to load chat inbox:', err);
        setChatError('Unable to load your chat inbox. Please try again.');
      }
    );
    return () => unsubscribe();
  }, [user?.uid]);
  useEffect(() => {
    if (!user) {
      setFavoriteIds([]);
      return;
    }
    const favoritesQuery = query(
      collection(db, 'userFavorites'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(favoritesQuery, (snapshot) => {
      // Store Firestore document IDs so checking/removing uses the exact same key.
      setFavoriteIds(snapshot.docs.map((item) => item.id));
    }, (err) => {
      console.error('Unable to load favorites:', err);
    });
    return () => unsubscribe();
  }, [user?.uid]);
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }
    const messagesQuery = query(
      collection(db, 'bookingChats', selectedChat.id, 'messages')
    );
    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as ChatMessage[];
        items.sort((a, b) => getTimestamp(a.createdAt) - getTimestamp(b.createdAt));
        setMessages(items);
      },
      (err) => {
        console.error('Unable to load chat messages:', err);
        setChatError('Unable to load this conversation.');
      }
    );
    return () => unsubscribe();
  }, [selectedChat?.id]);
  // The owner side must increment unreadForUser by one for each new owner message.
  // Opening a conversation resets that chat's unread counter to zero.
  const unreadChatCount = useMemo(
    () => chats.reduce((total, chat) => total + Math.max(0, Number(chat.unreadForUser || 0)), 0),
    [chats]
  );
  const isArchivedBooking = (booking: Booking) =>
    ['completed', 'cancelled', 'declined', 'rejected', 'refund_approved', 'refunded'].includes(
      String(booking.status || '').toLowerCase()
    );
  const currentBookings = bookings.filter((booking) => !isArchivedBooking(booking));
  const archivedBookings = bookings.filter(isArchivedBooking);
  const displayedBookings = bookingView === 'current' ? currentBookings : archivedBookings;
  const isActive = (path: string) => location.pathname === path;
  const navigationItems = [
    { label: 'Home', path: '/user/dashboard', icon: homeOutline },
    { label: 'Explore', path: '/user/explore', icon: compassOutline },
    { label: 'Bookings', path: '/user/bookings', icon: calendarOutline },
    { label: 'Favorites', path: '/user/favorites', icon: heartOutline },
    { label: 'Profile', path: '/user/profile', icon: personOutline },
  ];
  const getBookingStatusClass = (status?: string) => {
    const value = (status || 'pending').toLowerCase();
    if (value === 'confirmed' || value === 'approved') return 'booking-status confirmed';
    if (value === 'cancelled' || value === 'declined' || value === 'rejected') return 'booking-status cancelled';
    if (value === 'completed') return 'booking-status completed';
    if (value === 'refund_approved') return 'booking-status pending';
    return 'booking-status pending';
  };
  const getPaymentStatusClass = (status?: string) => {
    const value = (status || '').toLowerCase();
    if (value === 'paid') return 'payment-status paid';
    if (value === 'unpaid' || value === 'pay_at_resort') return 'payment-status unpaid';
    return 'payment-status other';
  };
  const refundWindowOpen = (booking: Booking) => {
    const created = toDate(booking.createdAt);
    if (!created) return false;
    const age = Date.now() - created.getTime();
    return age >= 0 && age <= 24 * 60 * 60 * 1000;
  };
  const canRequestRefund = (booking: Booking) =>
    (booking.paymentStatus || '').toLowerCase() === 'paid' &&
    refundWindowOpen(booking) &&
    !['cancelled', 'completed'].includes((booking.status || '').toLowerCase());
  const openBookingChat = async (booking: Booking) => {
    if (!user) {
      setChatError('Please sign in again to contact the resort owner.');
      return;
    }
    if (!booking.ownerId) {
      setChatError('This reservation does not have an ownerId. Please update the reservation creation code to save the resort owner UID before starting a chat.');
      setShowInbox(true);
      return;
    }
    const chatId = `booking_${booking.id}`;
    const chatRef = doc(db, 'bookingChats', chatId);
    const chatData = {
      bookingId: booking.id,
      reservationId: booking.id,
      userId: user.uid,
      ownerId: booking.ownerId,
      resortId: booking.resortId || '',
      resortName: booking.resortName || 'Resort',
      referenceCode: booking.referenceCode || booking.id,
      participantIds: [user.uid, booking.ownerId],
      unreadForUser: 0,
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(chatRef, {
        ...chatData,
        createdAt: serverTimestamp(),
      }, { merge: true });
      setChatError('');
      setActiveBooking(null);
      setShowInbox(true);
      setSelectedChat({
        id: chatId,
        ...chatData,
        lastReadByUserAt: new Date(),
      } as Chat);
      await updateDoc(chatRef, { unreadForUser: 0, lastReadByUserAt: serverTimestamp() }).catch((err) => {
        console.warn('Could not reset chat unread counter:', err);
      });
    } catch (err) {
      console.error('Unable to open booking chat:', err);
      setChatError('Unable to start this conversation. Please check your Firestore security rules.');
      setShowInbox(true);
    }
  };
  const sendMessage = async (textOverride?: string, type: ChatMessage['type'] = 'text') => {
    if (!user || !selectedChat || sending) return;
    const text = (textOverride ?? messageText).trim();
    if (!text) return;
    setSending(true);
    setChatError('');
    try {
      const chatRef = doc(db, 'bookingChats', selectedChat.id);
      await addDoc(collection(db, 'bookingChats', selectedChat.id, 'messages'), {
        senderId: user.uid,
        senderRole: 'user',
        type: type || 'text',
        text,
        createdAt: serverTimestamp(),
      });
      await setDoc(chatRef, {
        lastMessage: text,
        lastMessageSenderId: user.uid,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadForOwner: increment(1),
        ...(type === 'refund_request' ? {
          requestType: 'refund',
          requestStatus: 'pending',
        } : {}),
        ...(type === 'cancellation_request' ? {
          requestType: 'cancellation',
          requestStatus: 'pending',
        } : {}),
      }, { merge: true });
      setMessageText('');
    } catch (err) {
      console.error('Unable to send chat message:', err);
      setChatError('Message was not sent. Please try again.');
    } finally {
      setSending(false);
    }
  };
  const requestRefund = async () => {
    if (!selectedChat) return;
    const booking = bookings.find((item) => item.id === selectedChat.bookingId);
    if (!booking || !canRequestRefund(booking)) {
      setChatError('Refund requests are available only within 24 hours of making a paid reservation.');
      return;
    }
    await sendMessage(
      `REFUND REQUEST\nPlease review my refund request for the following reservation:\n\nBooking Reference: ${booking.referenceCode || booking.id}\nResort: ${booking.resortName || 'Not specified'}\nAccommodation: ${booking.accommodationName || 'Not specified'}\nCheck-in: ${formatDate(booking.checkIn)}\nCheck-out: ${formatDate(booking.checkOut)}\nTotal Amount: ${money(booking.pricing?.total, booking.pricing?.currency || 'PHP')}\nPayment Method: ${paymentMethodLabel(booking.paymentMethod)}\nPayment Status: ${formatStatus(booking.paymentStatus)}\n\nPlease review and advise on the next steps.`,
      'refund_request'
    );
  };
  const requestCancellation = async () => {
    if (!selectedChat) return;
    const booking = bookings.find((item) => item.id === selectedChat.bookingId);
    if (!booking || ['cancelled', 'completed'].includes((booking.status || '').toLowerCase())) {
      setChatError('A cancellation request is not available for this reservation.');
      return;
    }
    await sendMessage(
      `CANCELLATION REQUEST\nPlease review my cancellation request for the following reservation:\n\nBooking Reference: ${booking.referenceCode || booking.id}\nResort: ${booking.resortName || 'Not specified'}\nAccommodation: ${booking.accommodationName || 'Not specified'}\nCheck-in: ${formatDate(booking.checkIn)}\nCheck-out: ${formatDate(booking.checkOut)}\nTotal Amount: ${money(booking.pricing?.total, booking.pricing?.currency || 'PHP')}\nPayment Method: ${paymentMethodLabel(booking.paymentMethod)}\nPayment Status: ${formatStatus(booking.paymentStatus)}\n\nPlease review and confirm the cancellation process.`,
      'cancellation_request'
    );
  };
  // Use one deterministic Firestore document ID for the same saved listing.
  // resortId is the packages/{packageId} document ID in MINDORO SCAPE.
  const favoriteDocumentId = (booking: Booking) =>
    `${user?.uid}_${booking.resortId || booking.accommodationId || booking.offerId || booking.id}`;

  const toggleFavorite = async (booking: Booking) => {
    if (!user) {
      setNotice('Please sign in to manage your favorites.');
      return;
    }

    if (String(booking.status || '').toLowerCase() !== 'completed') {
      setNotice('You can save a booking to Favorites after it is completed.');
      return;
    }

    const favoriteId = favoriteDocumentId(booking);
    const favoriteRef = doc(db, 'userFavorites', favoriteId);
    const isSaved = favoriteIds.includes(favoriteId);

    try {
      if (isSaved) {
        await deleteDoc(favoriteRef);
      } else {
        await setDoc(favoriteRef, {
          userId: user.uid,
          resortId: booking.resortId || '',
          packageId: booking.resortId || '',
          resortName: booking.resortName || '',
          accommodationId: booking.accommodationId || booking.offerId || booking.id,
          offerId: booking.offerId || booking.accommodationId || booking.id,
          accommodationName: booking.accommodationName || '',
          resortLocation: booking.resortLocation || '',
          savedAt: serverTimestamp(),
          source: 'booking',
        });
      }
      // favoriteIds is updated by the userFavorites onSnapshot listener.
    } catch (err) {
      console.error('Unable to update favorite:', err);
      alert('Unable to update Favorites. Please check Firestore rules.');
    }
  };
  const submitReview = async () => {
    if (!user || !reviewBooking || reviewRating < 1 || reviewRating > 5) return;
    setReviewSaving(true);
    try {
      const reviewId = `review_${reviewBooking.id}`;
      const reviewRef = doc(db, 'reviews', reviewId);
      await setDoc(reviewRef, {
        userId: user.uid,
        userName: reviewBooking.guest?.fullName || user.displayName || 'Guest',
        resortId: reviewBooking.resortId || '',
        resortName: reviewBooking.resortName || '',
        accommodationId: reviewBooking.accommodationId || reviewBooking.offerId || '',
        accommodationName: reviewBooking.accommodationName || '',
        bookingId: reviewBooking.id,
        rating: reviewRating,
        comment: reviewComment.trim(),
        createdAt: serverTimestamp(),
        status: 'published',
      });
      await updateDoc(doc(db, 'reservations', reviewBooking.id), {
        reviewed: true,
        reviewSubmitted: true,
        reviewId: reviewRef.id,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setBookings((items) => items.map((item) => item.id === reviewBooking.id
        ? { ...item, reviewed: true, reviewSubmitted: true, reviewId: reviewRef.id }
        : item));
      setReviewBooking(null);
      setReviewRating(0);
      setReviewComment('');
      alert('Thank you! Your review has been submitted.');
    } catch (err) {
      console.error('Unable to submit review:', err);
      alert('Unable to submit review. Please check Firestore permissions.');
    } finally {
      setReviewSaving(false);
    }
  };
  const showReceipt = (booking: Booking) => {
    setReceiptBooking(booking);
  };
  const currentReceipt = receiptBooking?.receipt || receiptBooking?.cashReceipt || null;
  const receiptIsOfficial = Boolean(currentReceipt);
  const receiptPaid = (receiptBooking?.paymentStatus || '').toLowerCase() === 'paid';
  return (
    <IonPage className="my-bookings-page">
      <IonContent fullscreen className="my-bookings-content">
        <div className="my-bookings-shell">
          <header className="my-bookings-header">
            <button
              type="button"
              className="my-bookings-brand"
              onClick={() => navigate('/user/dashboard')}
              aria-label="Go to MINDORO SCAPE dashboard"
            >
              <img src="/assets/mindoro-scape-logo.png" alt="MINDORO SCAPE" />
              <span className="my-bookings-brand-copy">
                <strong>Mindoro Scape</strong>
                <small><IonIcon icon={locationOutline} /> ORIENTAL MINDORO</small>
              </span>
            </button>
            <div className="my-bookings-header-actions">
              <button
                type="button"
                className="my-bookings-inbox-button"
                onClick={() => {
                  setSelectedChat(null);
                  setChatError('');
                  setShowInbox(true);
                }}
              >
                <IonIcon icon={chatbubbleEllipsesOutline} />
                <span>Inbox</span>
                {unreadChatCount > 0 && <i>{unreadChatCount}</i>}
              </button>
              <button
                type="button"
                className="my-bookings-profile-button"
                onClick={() => navigate('/user/profile')}
                aria-label="Open profile"
              >
                {profilePhotoURL
                  ? <img className="my-bookings-profile-avatar" src={profilePhotoURL} alt="Profile" />
                  : <IonIcon icon={personOutline} />}
              </button>
            </div>
          </header>
          <section className="my-bookings-intro">
            <div>
              <span className="my-bookings-eyebrow">YOUR TRAVEL ACTIVITY</span>
              <h1>My Bookings</h1>
              <p>Manage your reservations, payment records, receipts, and conversations with resort owners.</p>
            </div>
          </section>
          {notice && <p className="booking-inline-notice" role="status">{notice}</p>}
          <section className="my-bookings-list-section">
            <div className="my-bookings-section-heading">
              <div>
                <h2>{bookingView === 'current' ? 'Current Reservations' : 'Booking History'}</h2>
                <p>{bookingView === 'current' ? 'Only reservations that are still active are shown here.' : 'Completed, cancelled, and refunded reservations are kept here.'}</p>
              </div>
              <div className="booking-view-tabs">
                <button type="button" className={bookingView === 'current' ? 'active' : ''} onClick={() => setBookingView('current')}>Current <span>{currentBookings.length}</span></button>
                <button type="button" className={bookingView === 'history' ? 'active' : ''} onClick={() => setBookingView('history')}>History <span>{archivedBookings.length}</span></button>
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
                <button type="button" onClick={() => window.location.reload()}>Try Again</button>
              </div>
            ) : bookings.length === 0 ? (
              <div className="my-bookings-empty">
                <div className="my-bookings-empty-icon"><IonIcon icon={calendarOutline} /></div>
                <h2>No bookings yet</h2>
                <p>You have not made any reservations. Start exploring resorts and plan your next getaway.</p>
                <button type="button" onClick={() => navigate('/user/explore')}>
                  <IonIcon icon={compassOutline} /> Explore Resorts
                </button>
              </div>
            ) : (
              <div className="my-bookings-list">
                {displayedBookings.map((booking) => (
                  <article key={booking.id} className="my-booking-card">
                    <div className="my-booking-card-top">
                      <div className="my-booking-title">
                        <span className="my-booking-reference">BOOKING REFERENCE</span>
                        <strong>{booking.referenceCode || booking.id}</strong>
                        <h3>{booking.resortName || 'Resort'}</h3>
                        <p className="my-booking-accommodation">{booking.accommodationName || 'Accommodation'}</p>
                      </div>
                      <span className={getBookingStatusClass(booking.status)}>{formatStatus(booking.status)}</span>
                    </div>
                    <div className="my-booking-details">
                      <div className="my-booking-detail">
                        <span className="my-booking-detail-icon"><IonIcon icon={locationOutline} /></span>
                        <div><small>Location</small><strong>{booking.resortLocation || 'Not specified'}</strong></div>
                      </div>
                      <div className="my-booking-detail">
                        <span className="my-booking-detail-icon"><IonIcon icon={calendarOutline} /></span>
                        <div>
                          <small>Booking Dates</small>
                          <strong>{formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}</strong>
                        </div>
                      </div>
                      <div className="my-booking-detail">
                        <span className="my-booking-detail-icon"><IonIcon icon={cardOutline} /></span>
                        <div><small>Payment Method</small><strong>{paymentMethodLabel(booking.paymentMethod)}</strong></div>
                      </div>
                      <div className="my-booking-detail">
                        <span className="my-booking-detail-icon"><IonIcon icon={timeOutline} /></span>
                        <div>
                          <small>Payment Status</small>
                          <span className={getPaymentStatusClass(booking.paymentStatus)}>{formatStatus(booking.paymentStatus)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="my-booking-card-footer">
                      <div className="my-booking-total">
                        <small>Total Amount</small>
                        <strong>{money(booking.pricing?.total, booking.pricing?.currency || 'PHP')}</strong>
                      </div>
                      <div
                        className={`my-booking-footer-note ${
                          ['cancelled', 'declined', 'rejected'].includes(
                            String(booking.status || '').trim().toLowerCase()
                          )
                            ? 'is-cancelled'
                            : ''
                        }`}
                      >
                        <IonIcon
                          icon={getBookingFooterIcon(booking)}
                          color={
                            ['cancelled', 'declined', 'rejected'].includes(
                              String(booking.status || '').trim().toLowerCase()
                            )
                              ? 'danger'
                              : undefined
                          }
                        />
                        <span>{getBookingFooterMessage(booking)}</span>
                      </div>
                    </div>
                    <div className="my-booking-actions">
                      <button type="button" className="booking-action-primary" onClick={() => setActiveBooking(booking)}>
                        <IonIcon icon={eyeOutline} /> View Booking
                      </button>
                      <button type="button" className="booking-action-secondary" onClick={() => showReceipt(booking)}>
                        <IonIcon icon={receiptOutline} /> View Receipt
                      </button>
                      <button type="button" className="booking-action-secondary" onClick={() => openBookingChat(booking)}>
                        <IonIcon icon={chatbubbleEllipsesOutline} /> Chat with Owner
                      </button>
                      {String(booking.status || '').toLowerCase() === 'completed' && (
                        <button
                          type="button"
                          className={`booking-action-secondary favorite-booking-button ${favoriteIds.includes(favoriteDocumentId(booking)) ? 'is-favorite' : ''}`}
                          onClick={() => void toggleFavorite(booking)}
                          aria-label="Save this completed accommodation to favorites"
                        >
                          <IonIcon icon={favoriteIds.includes(favoriteDocumentId(booking)) ? heart : heartOutline} />
                          {favoriteIds.includes(favoriteDocumentId(booking)) ? 'Saved' : 'Add to Favorites'}
                        </button>
                      )}
                      {String(booking.status || '').toLowerCase() === 'completed' && (
                        <button
                          type="button"
                          className="booking-action-primary"
                          disabled={Boolean(booking.reviewed || booking.reviewSubmitted)}
                          onClick={() => { setReviewBooking(booking); setReviewRating(0); setReviewComment(''); }}
                        >
                          <IonIcon icon={star} /> {(booking.reviewed || booking.reviewSubmitted) ? 'Reviewed' : 'Write a Review'}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <div className="my-bookings-bottom-space" />
        </div>
      </IonContent>
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
      {activeBooking && (
        <div className="booking-modal-backdrop" role="presentation" onClick={() => setActiveBooking(null)}>
          <section className="booking-modal booking-details-modal" role="dialog" aria-modal="true" aria-labelledby="booking-details-title" onClick={(event) => event.stopPropagation()}>
            <div className="booking-modal-header">
              <div><span>RESERVATION DETAILS</span><h2 id="booking-details-title">View Booking</h2></div>
              <button type="button" className="modal-close-button" onClick={() => setActiveBooking(null)} aria-label="Close"><IonIcon icon={closeOutline} /></button>
            </div>
            <div className="booking-modal-body">
              <div className="booking-detail-highlight">
                <span>Booking reference</span>
                <strong>{activeBooking.referenceCode || activeBooking.id}</strong>
                <span className={getBookingStatusClass(activeBooking.status)}>{formatStatus(activeBooking.status)}</span>
              </div>
              <div className="booking-detail-grid">
                <div><small>Resort</small><strong>{activeBooking.resortName || 'Resort'}</strong></div>
                <div><small>Accommodation</small><strong>{activeBooking.accommodationName || 'Not specified'}</strong></div>
                <div><small>Location</small><strong>{activeBooking.resortLocation || 'Not specified'}</strong></div>
                <div><small>Check-in</small><strong>{formatDate(activeBooking.checkIn)}</strong></div>
                <div><small>Check-out</small><strong>{formatDate(activeBooking.checkOut)}</strong></div>
                <div><small>Payment method</small><strong>{paymentMethodLabel(activeBooking.paymentMethod)}</strong></div>
                <div><small>Payment status</small><strong>{formatStatus(activeBooking.paymentStatus)}</strong></div>
                <div><small>Reservation created</small><strong>{formatDateTime(activeBooking.createdAt)}</strong></div>
                <div><small>Guest name</small><strong>{activeBooking.guest?.fullName || 'Not specified'}</strong></div>
                <div><small>Guest email</small><strong>{activeBooking.guest?.email || 'Not specified'}</strong></div>
                <div><small>Guest phone</small><strong>{activeBooking.guest?.phone || 'Not specified'}</strong></div>
                <div><small>Total amount</small><strong>{money(activeBooking.pricing?.total, activeBooking.pricing?.currency || 'PHP')}</strong></div>
              </div>
              <div className="booking-modal-actions">
                <button type="button" className="booking-action-primary" onClick={() => showReceipt(activeBooking)}><IonIcon icon={receiptOutline} /> View Receipt</button>
                <button type="button" className="booking-action-secondary" onClick={() => openBookingChat(activeBooking)}><IonIcon icon={chatbubbleEllipsesOutline} /> Chat with Owner</button>
              </div>
            </div>
          </section>
        </div>
      )}
      {receiptBooking && (
        <div className="booking-modal-backdrop" role="presentation" onClick={() => setReceiptBooking(null)}>
          <section className="booking-modal receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title" onClick={(event) => event.stopPropagation()}>
            <div className="booking-modal-header">
              <div><span>PAYMENT RECORD</span><h2 id="receipt-title">{receiptIsOfficial ? 'Payment Receipt' : 'Transaction Summary'}</h2></div>
              <button type="button" className="modal-close-button" onClick={() => setReceiptBooking(null)} aria-label="Close"><IonIcon icon={closeOutline} /></button>
            </div>
            <div className="receipt-paper">
              <div className="receipt-brand"><img src="/assets/mindoro-scape-logo.png" alt="" /><strong>MINDORO SCAPE</strong><small>ORIENTAL MINDORO</small></div>
              <div className={`receipt-payment-state ${receiptPaid ? 'is-paid' : 'is-unpaid'}`}>{receiptPaid ? 'PAYMENT PAID' : 'PAYMENT NOT YET CONFIRMED'}</div>
              <h3>{receiptIsOfficial ? 'OFFICIAL PAYMENT RECEIPT' : 'RESERVATION PAYMENT RECORD'}</h3>
              <div className="receipt-line"><span>Receipt number</span><strong>{currentReceipt?.receiptNumber || 'Pending owner / payment confirmation'}</strong></div>
              <div className="receipt-line"><span>Booking reference</span><strong>{receiptBooking.referenceCode || receiptBooking.id}</strong></div>
              <div className="receipt-line"><span>Resort</span><strong>{receiptBooking.resortName || 'Resort'}</strong></div>
              <div className="receipt-line"><span>Accommodation</span><strong>{receiptBooking.accommodationName || 'Not specified'}</strong></div>
              <div className="receipt-line"><span>Guest</span><strong>{receiptBooking.guest?.fullName || 'Not specified'}</strong></div>
              <div className="receipt-line"><span>Payment method</span><strong>{currentReceipt?.paymentMethod || paymentMethodLabel(receiptBooking.paymentMethod)}</strong></div>
              <div className="receipt-line"><span>Payment date</span><strong>{formatDateTime(currentReceipt?.issuedAt || receiptBooking.updatedAt || receiptBooking.createdAt)}</strong></div>
              <div className="receipt-line"><span>Transaction ID</span><strong>{String(currentReceipt?.transactionId || currentReceipt?.captureId || currentReceipt?.orderId || 'Not available')}</strong></div>
              {currentReceipt?.payerEmail && <div className="receipt-line"><span>PayPal account</span><strong>{String(currentReceipt.payerEmail)}</strong></div>}
              <div className="receipt-total"><span>{receiptPaid ? 'Amount paid' : 'Reservation amount'}</span><strong>{money(currentReceipt?.amount ?? receiptBooking.pricing?.total, String(currentReceipt?.currency || receiptBooking.pricing?.currency || 'PHP'))}</strong></div>
              {!receiptIsOfficial && (
                <p className="receipt-notice">
                  {receiptPaid
                    ? 'The payment is marked as paid, but an official receipt record has not yet been attached. Please contact the resort owner through the booking chat.'
                    : 'This is a reservation payment summary, not proof of payment. For cash payments, the owner must confirm receipt of payment before an official receipt can be issued.'}
                </p>
              )}
              <p className="receipt-thank-you">Thank you for choosing MINDORO SCAPE.</p>
            </div>
            <div className="receipt-modal-actions">
              <button type="button" className="booking-action-primary" onClick={() => window.print()}>Print / Save PDF</button>
              <button type="button" className="booking-action-secondary" onClick={() => setReceiptBooking(null)}>Close</button>
            </div>
          </section>
        </div>
      )}
      {reviewBooking && (
        <div className="booking-modal-backdrop review-backdrop" role="presentation" onClick={() => setReviewBooking(null)}>
          <section className="booking-modal review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(event) => event.stopPropagation()}>
            <div className="booking-modal-header">
              <div><span>SHARE YOUR EXPERIENCE</span><h2 id="review-title">Review {reviewBooking.resortName || 'Your Stay'}</h2></div>
              <button type="button" className="modal-close-button" onClick={() => setReviewBooking(null)} aria-label="Close"><IonIcon icon={closeOutline} /></button>
            </div>
            <div className="review-form">
              <p>How was your experience at {reviewBooking.resortName || 'this resort'}?</p>
              <div className="review-stars" role="radiogroup" aria-label="Rating from 1 to 5 stars">
                {[1, 2, 3, 4, 5].map((starValue) => (
                  <button key={starValue} type="button" className={reviewRating >= starValue ? 'selected' : ''} onClick={() => setReviewRating(starValue)} aria-label={`${starValue} star${starValue > 1 ? 's' : ''}`}>
                    <IonIcon icon={reviewRating >= starValue ? star : starOutline} />
                  </button>
                ))}
              </div>
              <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Write about your stay (optional)..." maxLength={1500} rows={5} />
              <div className="review-form-actions">
                <button type="button" className="booking-action-secondary" onClick={() => setReviewBooking(null)}>Cancel</button>
                <button type="button" className="booking-action-primary" disabled={reviewRating === 0 || reviewSaving} onClick={() => void submitReview()}>
                  {reviewSaving ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {showInbox && (
        <div className="booking-modal-backdrop inbox-backdrop" role="presentation" onClick={() => { setShowInbox(false); setSelectedChat(null); }}>
          <section className={`booking-modal inbox-modal ${selectedChat ? 'has-selected-chat' : ''}`} role="dialog" aria-modal="true" aria-labelledby="inbox-title" onClick={(event) => event.stopPropagation()}>
            <div className="booking-modal-header inbox-header">
              <div>
                {selectedChat && <button type="button" className="inbox-back-button" onClick={() => { setSelectedChat(null); setChatError(''); }}><IonIcon icon={arrowBackOutline} /> Inbox</button>}
                <span>MESSAGES ABOUT YOUR RESERVATIONS</span>
                <h2 id="inbox-title">{selectedChat ? selectedChat.resortName || 'Chat with Owner' : 'Chat Inbox'}</h2>
                {selectedChat && <small>Booking: {selectedChat.referenceCode || selectedChat.bookingId}</small>}
              </div>
              <button type="button" className="modal-close-button" onClick={() => { setShowInbox(false); setSelectedChat(null); }} aria-label="Close"><IonIcon icon={closeOutline} /></button>
            </div>
            {chatError && <div className="chat-inline-error"><IonIcon icon={alertCircleOutline} />{chatError}</div>}
            {!selectedChat ? (
              <div className="chat-inbox-list">
                {chats.length === 0 ? (
                  <div className="chat-empty-state">
                    <IonIcon icon={chatbubbleEllipsesOutline} />
                    <h3>No conversations yet</h3>
                    <p>Open a booking and choose “Chat with Owner” to start a conversation about that reservation.</p>
                  </div>
                ) : chats.map((chat) => (
                  <button
                    type="button"
                    className={`chat-inbox-item ${Number(chat.unreadForUser || 0) > 0 ? 'has-unread' : ''}`}
                    aria-label={`${chat.resortName || 'Resort owner'}${Number(chat.unreadForUser || 0) > 0 ? ', unread message' : ''}`}
                    key={chat.id}
                    onClick={() => {
                    setSelectedChat({
                      ...chat,
                      unreadForUser: 0,
                      lastReadByUserAt: new Date(),
                    });
                    setChatError('');
                    updateDoc(doc(db, 'bookingChats', chat.id), {
                      unreadForUser: 0,
                      lastReadByUserAt: serverTimestamp(),
                    }).catch((err) => console.warn('Could not mark chat as read:', err));
                  }}>
                    <span className="chat-avatar">
                      {profilePhotoURL ? <img src={profilePhotoURL} alt="" /> : <IonIcon icon={personCircleOutline} />}
                    </span>
                    <span className="chat-inbox-copy">
                      <strong>{chat.resortName || 'Resort Owner'}</strong>
                      <small>Booking: {chat.referenceCode || chat.bookingId}</small>
                      <span>{chat.lastMessage || 'Conversation started. Send a message to the owner.'}</span>
                      {Number(chat.unreadForUser || 0) > 0 && (
                        <small className="chat-new-label">
                          {Number(chat.unreadForUser) > 1 ? `${chat.unreadForUser} NEW MESSAGES` : 'NEW MESSAGE'}
                        </small>
                      )}
                    </span>
                    <small className="chat-inbox-date">{formatDateTime(chat.lastMessageAt || chat.updatedAt)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="chat-booking-context">
                  <div className="chat-context-heading">
                    <strong>{selectedChat.resortName || 'Resort'}</strong>
                    <span className="chat-context-you">{profileName || user?.displayName || 'Guest'}</span>
                  </div>
                  <span>Conversation with {selectedChat.resortName || 'the resort owner'}</span>
                  <span>Reference: {selectedChat.referenceCode || selectedChat.bookingId}</span>
                </div>
                <div className="chat-message-list">
                  {messages.length === 0 ? (
                    <div className="chat-empty-thread"><IonIcon icon={chatbubbleEllipsesOutline} /><p>Start the conversation with the resort owner.</p></div>
                  ) : messages.map((message) => (
                    <div
                      key={message.id}
                      className={`chat-message-row ${message.senderId === user?.uid ? 'mine' : 'theirs'} ${
                        Number(selectedChat.unreadForUser || 0) > 0 &&
                        message.senderId !== user?.uid &&
                        message.id === messages.filter((item) => item.senderId !== user?.uid).slice(-1)[0]?.id
                          ? 'is-new-message'
                          : ''
                      }`}
                    >
                      <div className={`chat-message-bubble ${message.type && message.type !== 'text' ? 'request-message' : ''}`}>
                        {message.type === 'refund_request' && <strong>REFUND REQUEST</strong>}
                        {message.type === 'cancellation_request' && <strong>CANCELLATION REQUEST</strong>}
                        <p>{message.text}</p>
                        <small>{formatDateTime(message.createdAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="chat-request-actions">
                  <button type="button" disabled={!canRequestRefund(bookings.find((item) => item.id === selectedChat.bookingId) || { id: selectedChat.bookingId }) || sending} onClick={requestRefund}>
                    <IonIcon icon={walletOutline} /> Request Refund
                  </button>
                  <button type="button" disabled={['cancelled', 'completed'].includes((bookings.find((item) => item.id === selectedChat.bookingId)?.status || '').toLowerCase()) || sending} onClick={requestCancellation}>
                    <IonIcon icon={calendarClearOutline} /> Request Cancellation
                  </button>
                </div>
                {(() => {
                  const relatedBooking = bookings.find((item) => item.id === selectedChat.bookingId);
                  const eligible = relatedBooking ? canRequestRefund(relatedBooking) : false;
                  return (
                    <p className="refund-policy-note">
                      {eligible
                        ? 'Refund request is available within 24 hours of reservation creation. The owner must review and approve it.'
                        : 'Refund request is unavailable: it is limited to paid reservations within 24 hours of creation. You may still contact the owner.'}
                    </p>
                  );
                })()}
                <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
                  <input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a message to the resort owner..." maxLength={2000} />
                  <button type="submit" disabled={!messageText.trim() || sending} aria-label="Send message">
                    {sending ? <IonSpinner name="crescent" /> : <IonIcon icon={sendOutline} />}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </IonPage>
  );
};
export default MyBookings;
