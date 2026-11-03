import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IonIcon, IonSpinner } from '@ionic/react';
import {
  arrowBackOutline,
  chatbubbleEllipsesOutline,
  paperPlaneOutline,
  personCircleOutline,
  refreshOutline,
  timeOutline,
} from 'ionicons/icons';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import './OwnerInquiries.css';

type ChatRecord = {
  id: string;
  bookingId?: string;
  reservationId?: string;
  userId: string;
  ownerId: string;
  resortId?: string;
  resortName?: string;
  referenceCode?: string;
  guestName?: string;
  guestEmail?: string;
  accommodationName?: string;
  lastMessage?: string;
  updatedAt?: any;
  requestType?: 'refund' | 'cancellation' | string;
  requestStatus?: 'pending' | 'approved' | 'declined' | string;
  participantIds?: string[];
  unreadForOwner?: number;
  unreadForUser?: number;
  lastReadByOwnerAt?: any;
};

type ChatMessage = {
  id: string;
  senderId: string;
  senderRole?: 'user' | 'owner' | string;
  senderName?: string;
  type?: 'text' | 'refund_request' | 'cancellation_request' | string;
  text?: string;
  createdAt?: any;
};

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatTime = (value: any) => {
  const ms = toMillis(value);
  if (!ms) return 'Just now';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(ms));
};


type OwnerInquiriesProps = {
  initialChatId?: string | null;
  onInitialChatHandled?: () => void;
};

const getProfileDisplayName = (profile: Record<string, any>): string => {
  const directName = String(
    profile.fullName || profile.displayName || profile.name || ''
  ).trim();

  if (directName) return directName;

  const composedName = [
    String(profile.firstName || '').trim(),
    String(profile.lastName || '').trim(),
  ].filter(Boolean).join(' ');

  if (composedName) return composedName;

  if (typeof profile.email === 'string' && profile.email.includes('@')) {
    return profile.email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  }

  return '';
};

const OwnerInquiries: React.FC<OwnerInquiriesProps> = ({
  initialChatId = null,
  onInitialChatHandled,
}) => {
  const ownerId = auth.currentUser?.uid || '';
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      setError('Please sign in again to view guest inquiries.');
      return;
    }

    const chatsQuery = query(collection(db, 'bookingChats'), where('ownerId', '==', ownerId));
    const unsubscribe = onSnapshot(chatsQuery, async (snapshot) => {
      const rawRows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as ChatRecord[];

      const rows = await Promise.all(rawRows.map(async (chat) => {
        if (chat.guestName?.trim()) return chat;

        let guestName = '';

        try {
          if (chat.userId) {
            const profileSnapshot = await getDoc(doc(db, 'users', chat.userId));
            if (profileSnapshot.exists()) {
              guestName = getProfileDisplayName(profileSnapshot.data());
            }
          }

          if (!guestName && chat.bookingId) {
            const bookingSnapshot = await getDoc(doc(db, 'reservations', chat.bookingId));
            if (bookingSnapshot.exists()) {
              const booking = bookingSnapshot.data();
              guestName = String(
                booking.guest?.fullName ||
                booking.guest?.name ||
                booking.guestName ||
                ''
              ).trim();
            }
          }

          if (guestName) {
            await updateDoc(doc(db, 'bookingChats', chat.id), {
              guestName,
            }).catch((writeError) => {
              console.warn('Could not save guest name to chat:', writeError);
            });
          }
        } catch (nameError) {
          console.warn(`Could not resolve guest name for ${chat.id}:`, nameError);
        }

        return { ...chat, guestName: guestName || chat.guestName };
      }));

      rows.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      setChats(rows);
      setLoading(false);
      setError('');
      setSelectedChat((current) => current ? rows.find((row) => row.id === current.id) || null : null);
    }, (err) => {
      console.error('Owner inquiries listener failed:', err);
      setError('Unable to load guest conversations. Check your Firestore access rules.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [ownerId]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    const messagesQuery = query(
      collection(db, 'bookingChats', selectedChat.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as ChatMessage[]);
      setMessagesLoading(false);
    }, (err) => {
      console.error('Chat messages listener failed:', err);
      setMessagesLoading(false);
      setError('Unable to load messages for this conversation.');
    });
    return () => unsubscribe();
  }, [selectedChat?.id]);

  useEffect(() => {
    const node = messageListRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, selectedChat?.id]);

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return chats;
    return chats.filter((chat) =>
      [chat.guestName, chat.resortName, chat.accommodationName, chat.referenceCode, chat.lastMessage]
        .filter(Boolean).join(' ').toLowerCase().includes(term)
    );
  }, [chats, search]);

  const openChat = async (chat: ChatRecord) => {
    setError('');
    setSelectedChat({ ...chat, lastReadByOwnerAt: new Date() });
    try {
      await updateDoc(doc(db, 'bookingChats', chat.id), {
        unreadForOwner: 0,
        lastReadByOwnerAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Could not mark owner chat as read:', err);
    }
  };

  useEffect(() => {
    if (!initialChatId || loading) return;

    const chatToOpen = chats.find((chat) => chat.id === initialChatId);
    if (chatToOpen) {
      void openChat(chatToOpen);
      onInitialChatHandled?.();
    } else if (chats.length > 0) {
      onInitialChatHandled?.();
    }
  }, [initialChatId, loading, chats]);

  const sendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    const owner = auth.currentUser;
    if (!text || !selectedChat || !owner || sending) return;
    if (selectedChat.ownerId !== owner.uid) {
      setError('You are not authorized to reply to this conversation.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const chatRef = doc(db, 'bookingChats', selectedChat.id);
      const messageRef = doc(collection(db, 'bookingChats', selectedChat.id, 'messages'));
      await runTransaction(db, async (transaction) => {
        const chatSnapshot = await transaction.get(chatRef);
        if (!chatSnapshot.exists()) throw new Error('This conversation no longer exists.');
        const chatData = chatSnapshot.data();
        if (chatData.ownerId !== owner.uid) throw new Error('You are not authorized to reply to this conversation.');
        transaction.set(messageRef, {
          senderId: owner.uid,
          senderRole: 'owner',
          senderName: selectedChat.resortName || 'Resort Owner',
          type: 'text',
          text,
          createdAt: serverTimestamp(),
        });
        transaction.update(chatRef, {
          lastMessage: text,
          lastMessageSenderId: owner.uid,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          unreadForUser: increment(1),
        });
      });
      setDraft('');
    } catch (err) {
      console.error('Unable to send owner message:', err);
      setError('Message was not sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const sendRequestResponse = async (message: ChatMessage, decision: 'approved' | 'declined') => {
    const owner = auth.currentUser;
    if (!selectedChat || !owner || selectedChat.ownerId !== owner.uid) {
      setError('You are not authorized to process this request.');
      return;
    }
    const isRefund = message.type === 'refund_request';
    const isCancellation = message.type === 'cancellation_request';
    if (!isRefund && !isCancellation) return;
    if (!selectedChat.bookingId) {
      setError('This chat is missing its booking reference. The reservation cannot be updated.');
      return;
    }

    const bookingRef = doc(db, 'reservations', selectedChat.bookingId);
    const chatRef = doc(db, 'bookingChats', selectedChat.id);
    const label = isRefund ? 'Refund request' : 'Cancellation request';
    setError('');
    try {
      await runTransaction(db, async (transaction) => {
        const bookingSnapshot = await transaction.get(bookingRef);
        const chatSnapshot = await transaction.get(chatRef);
        if (!bookingSnapshot.exists()) throw new Error('The linked reservation could not be found.');
        const booking = bookingSnapshot.data();
        const chatData = chatSnapshot.data();
        if (booking.ownerId !== owner.uid || chatData?.ownerId !== owner.uid) {
          throw new Error('You are not authorized to update this reservation.');
        }

        const currentStatus = String(booking.status || '').toLowerCase();
        const currentPaymentStatus = String(booking.paymentStatus || '').toLowerCase();

        if (decision === 'approved') {
          if (isCancellation) {
            if (['cancelled', 'completed', 'refund_approved'].includes(currentStatus)) {
              throw new Error(`This reservation is already ${currentStatus.replace(/_/g, ' ')}.`);
            }
            transaction.update(bookingRef, {
              status: 'cancelled',
              cancellationStatus: 'approved',
              cancellationApprovedAt: serverTimestamp(),
              cancellationApprovedBy: owner.uid,
              cancellationRequestMessageId: message.id,
              updatedAt: serverTimestamp(),
            });
          } else {
            if (currentStatus === 'completed' || currentStatus === 'cancelled') {
              throw new Error('A completed or cancelled reservation cannot be approved for a refund.');
            }
            if (!['paid', 'succeeded', 'completed'].includes(currentPaymentStatus)) {
              throw new Error('This reservation is not marked as paid. Verify payment before approving a refund.');
            }
            transaction.update(bookingRef, {
              status: 'refund_approved',
              refundStatus: 'approved_pending_processing',
              refundApprovedAt: serverTimestamp(),
              refundApprovedBy: owner.uid,
              refundRequestMessageId: message.id,
              updatedAt: serverTimestamp(),
            });
          }
        } else if (isRefund) {
          transaction.update(bookingRef, {
            refundStatus: 'declined',
            refundDeclinedAt: serverTimestamp(),
            refundDeclinedBy: owner.uid,
            updatedAt: serverTimestamp(),
          });
        } else {
          transaction.update(bookingRef, {
            cancellationStatus: 'declined',
            cancellationDeclinedAt: serverTimestamp(),
            cancellationDeclinedBy: owner.uid,
            updatedAt: serverTimestamp(),
          });
        }

        const response = `${label} ${decision} by the resort owner.${isRefund && decision === 'approved' ? ' Refund is approved and awaiting actual payment-provider/manual processing.' : ''}`;
        transaction.update(chatRef, {
          lastMessage: response,
          lastMessageSenderId: owner.uid,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          requestType: isRefund ? 'refund' : 'cancellation',
          requestStatus: decision,
          requestDecisionAt: serverTimestamp(),
          requestDecisionBy: owner.uid,
          unreadForUser: (Number(chatData?.unreadForUser) || 0) + 1,
        });
        const responseRef = doc(collection(db, 'bookingChats', selectedChat.id, 'messages'));
        transaction.set(responseRef, {
          senderId: owner.uid,
          senderRole: 'owner',
          senderName: selectedChat.resortName || 'Resort Owner',
          type: 'text',
          text: response,
          relatedRequestMessageId: message.id,
          createdAt: serverTimestamp(),
        });
      });
      setError('');
    } catch (err: any) {
      console.error('Unable to process booking request:', err);
      setError(err?.message || 'Unable to update the reservation. Please try again.');
    }
  };

  if (selectedChat) {
    const resortTitle = selectedChat.resortName || 'Resort';
    const guestTitle = selectedChat.guestName || 'Guest account';
    const readAt = toMillis(selectedChat.lastReadByOwnerAt);
    return (
      <section className="oi-page oi-chat-page">
        <div className="oi-chat-topbar">
          <button className="oi-back-button" type="button" onClick={() => setSelectedChat(null)}>
            <IonIcon icon={arrowBackOutline} /> Back to inquiries
          </button>
          <div className="oi-chat-title">
            <span className="oi-kicker">BOOKING CONVERSATION</span>
            <h2>{guestTitle}</h2>
            <p>{resortTitle} · {selectedChat.accommodationName || 'Accommodation'}{selectedChat.referenceCode ? ` · ${selectedChat.referenceCode}` : ''}</p>
          </div>
        </div>

        <div className="oi-chat-card">
          <div className="oi-chat-context">
            <div className="oi-context-avatar"><IonIcon icon={personCircleOutline} /></div>
            <div className="oi-context-details">
              <strong>{guestTitle}</strong>
              <span>{resortTitle} · {selectedChat.accommodationName || 'Booking inquiry'}</span>
              <small>Messages about this reservation appear here.</small>
            </div>
            <span className="oi-live-pill">Booking chat</span>
          </div>

          <div className="oi-message-list" ref={messageListRef}>
            {messagesLoading ? <div className="oi-loading"><IonSpinner name="crescent" /></div> : messages.length === 0 ? (
              <div className="oi-empty-inline">No messages yet. Send a message to start the conversation.</div>
            ) : messages.map((message) => {
              const isOwner = message.senderId === ownerId || message.senderRole === 'owner';
              const isRequest = message.type === 'refund_request' || message.type === 'cancellation_request';
              const isNew = !isOwner && toMillis(message.createdAt) > readAt;
              return (
                <div className={`oi-message-row ${isOwner ? 'is-owner' : 'is-guest'} ${isNew ? 'is-new-message' : ''}`} key={message.id}>
                  <div className="oi-message-bubble">
                    <span className="oi-sender-name">{isOwner ? resortTitle : guestTitle}</span>
                    {isNew && <span className="oi-new-label">NEW REPLY</span>}
                    {isRequest && <span className="oi-request-label">{message.type === 'refund_request' ? 'REFUND REQUEST' : 'CANCELLATION REQUEST'}</span>}
                    <p>{message.text || '(No message text)'}</p>
                    <time>{formatTime(message.createdAt)}</time>
                    {isRequest && !isOwner && selectedChat.requestStatus && selectedChat.requestStatus !== 'pending' && (
                      <span className="oi-request-label">REQUEST {selectedChat.requestStatus.toUpperCase()}</span>
                    )}
                    {isRequest && !isOwner && (!selectedChat.requestStatus || selectedChat.requestStatus === 'pending') && (
                      <div className="oi-request-actions">
                        <button type="button" onClick={() => sendRequestResponse(message, 'approved')}>Approve request</button>
                        <button type="button" className="oi-decline" onClick={() => sendRequestResponse(message, 'declined')}>Decline request</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <form className="oi-composer" onSubmit={sendMessage}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type your reply..."
              aria-label="Message"
              maxLength={3000}
            />
            <button type="submit" disabled={!draft.trim() || sending}>
              {sending ? <IonSpinner name="crescent" /> : <IonIcon icon={paperPlaneOutline} />}
              <span>Send</span>
            </button>
          </form>
          {error && <p className="oi-error">{error}</p>}
          <p className="oi-security-note">Approving a refund records approval only. Actual PayPal or cash refund processing must still be completed separately.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="oi-page">
      <div className="oi-page-heading oi-list-heading">
        <div>
          <span className="oi-kicker">HOST CONCIERGE DESK</span>
          <h2>Guest Inquiries</h2>
          <p>Manage booking conversations and see recent reservation activity.</p>
        </div>
        <div className="oi-heading-actions">
          <div className="oi-count"><strong>{chats.length}</strong><span>Conversations</span></div>
        </div>
      </div>

      <div className="oi-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guest, booking, or message..." aria-label="Search inquiries" />
        <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><IonIcon icon={refreshOutline} /></button>
      </div>

      {error && <p className="oi-error">{error}</p>}
      {loading ? (
        <div className="oi-loading"><IonSpinner name="crescent" /><span>Loading inquiries...</span></div>
      ) : filteredChats.length === 0 ? (
        <div className="oi-empty">
          <div className="oi-empty-icon"><IonIcon icon={chatbubbleEllipsesOutline} /></div>
          <h3>No guest conversations yet</h3>
          <p>When a guest opens Chat with Resort Owner from their booking, the conversation will appear here automatically.</p>
        </div>
      ) : (
        <div className="oi-conversation-list">
          {filteredChats.map((chat) => (
            <button className={`oi-conversation-card ${Number(chat.unreadForOwner || 0) > 0 ? 'has-unread' : ''}`} type="button" key={chat.id} onClick={() => void openChat(chat)}>
              <div className="oi-avatar"><IonIcon icon={personCircleOutline} /></div>
              <div className="oi-conversation-main">
                <div className="oi-conversation-top">
                  <strong>{chat.guestName || 'Guest account'}</strong>
                  <time><IonIcon icon={timeOutline} /> {formatTime(chat.updatedAt)}</time>
                </div>
                <span className="oi-booking-meta">{chat.resortName || 'Resort'} · {chat.accommodationName || 'Booking inquiry'}{chat.referenceCode ? ` · ${chat.referenceCode}` : ''}</span>
                <p>{chat.lastMessage || 'Conversation started. Send a message to your guest.'}</p>
                {Number(chat.unreadForOwner || 0) > 0 && <span className="oi-unread-badge">{Number(chat.unreadForOwner || 0)} new</span>}
              </div>
              <span className="oi-open-chevron">›</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default OwnerInquiries;
