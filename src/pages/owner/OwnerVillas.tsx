import React, { useEffect, useMemo, useState } from 'react';
import {
  IonIcon,
  IonModal,
  IonSpinner,
} from '@ionic/react';
import {
  bedOutline,
  chatbubbleEllipsesOutline,
  closeCircleOutline,
  createOutline,
  ellipsisHorizontal,
  locationOutline,
  peopleOutline,
  searchOutline,
  star,
  trashOutline,
  waterOutline,
  homeOutline,
  eyeOutline,
  closeOutline,
} from 'ionicons/icons';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import './OwnerVillas.css';

type VillaRate = {
  id?: string;
  unit?: string;
  price?: number | string;
  label?: string;
  guestCapacity?: number;
  includedAmenities?: string[] | string;
  durationHours?: number;
  minimumHours?: number;
  additionalServices?: VillaAddOn[];
};

type VillaAddOn = {
  id?: string;
  name: string;
  price: number | string;
  unit?: 'fixed' | 'per_person' | 'per_hour' | string;
  included?: boolean;
};

type VillaBookingSchedule = {
  availableDays?: string[];
  sessions?: {
    day?: { enabled?: boolean; startTime?: string; endTime?: string };
    night?: { enabled?: boolean; startTime?: string; endTime?: string };
  };
  extension?: { enabled?: boolean; feePerHour?: number; maxHours?: number };
};

export type OwnerVillaPackage = {
  id: string;
  ownerId?: string;
  name?: string;
  resortName?: string;
  resortLocation?: string;
  resortType?: string;
  category?: string;
  description?: string;
  price?: number | string;
  priceUnit?: string;
  pricingOptions?: VillaRate[];
  addOns?: VillaAddOn[];
  amenities?: string[] | string;
  usageType?: 'swimming' | 'event' | 'overnight' | string;
  eventTypes?: string[];
  reservationMode?: 'day_use' | 'event_booking' | 'overnight_stay' | string;
  bookingSchedule?: VillaBookingSchedule;
  childFreeUnderAge?: number | null;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  imageUrl?: string;
  imageUrls?: string[];
  availability?: 'available' | 'unavailable' | string;
  status?: string;
  createdAt?: unknown;
};

type VillaReview = {
  id: string;
  packageId?: string;
  villaId?: string;
  resortId?: string;
  ownerId?: string;
  userName?: string;
  reviewerName?: string;
  displayName?: string;
  userPhoto?: string;
  photoURL?: string;
  rating?: number | string;
  comment?: string;
  review?: string;
  createdAt?: { seconds?: number } | Date | string;
  reply?: string;
};

type Props = {
  ownerId: string;
  resortName: string;
  resortLocation?: string;
  /** Kept optional for compatibility with the existing OwnerDashboard call. Villas has no Add button. */
  onAddPackage?: () => void;
  onEditPackage: (pkg: OwnerVillaPackage) => void;
};

type FilterKey = 'all' | 'available' | 'unavailable';

const money = (amount: number) =>
  `₱${Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

const unitLabel = (unit?: string) => {
  const labels: Record<string, string> = {
    person: 'person',
    cottage: 'cottage',
    hour: 'hour',
    day: 'day',
    night: 'night',
    package: 'package',
    fixed: 'one-time',
  };
  return labels[unit || ''] || unit || 'rate';
};

const toList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return [];
};

const ratesFor = (villa: OwnerVillaPackage): VillaRate[] => {
  if (Array.isArray(villa.pricingOptions) && villa.pricingOptions.length) {
    return villa.pricingOptions.filter((rate) => Number(rate.price) > 0);
  }
  return Number(villa.price) > 0
    ? [{ price: villa.price, unit: villa.priceUnit || 'night' }]
    : [];
};

const getUsageType = (villa: OwnerVillaPackage): 'swimming' | 'event' | 'overnight' => {
  if (villa.usageType === 'event' || villa.reservationMode === 'event_booking') return 'event';
  if (villa.usageType === 'overnight' || villa.reservationMode === 'overnight_stay') return 'overnight';
  return 'swimming';
};

const usageLabel = (villa: OwnerVillaPackage) => {
  const usage = getUsageType(villa);
  if (usage === 'event') return 'Event venue';
  if (usage === 'overnight') return 'Overnight accommodation';
  return 'Swimming / Day use';
};

const formatTime = (value?: string) => {
  if (!value) return 'Not set';
  const [hourText, minuteText = '00'] = value.split(':');
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return value;
  return `${hour % 12 || 12}:${minuteText} ${hour >= 12 ? 'PM' : 'AM'}`;
};

const serviceUnitLabel = (unit?: string) => {
  if (unit === 'per_person') return 'per guest';
  if (unit === 'per_hour') return 'per hour';
  return 'one-time';
};

const startingRate = (villa: OwnerVillaPackage) => {
  const rates = ratesFor(villa)
    .map((rate) => Number(rate.price))
    .filter((price) => price > 0 && Number.isFinite(price));
  return rates.length ? Math.min(...rates) : 0;
};

const isUnavailable = (villa: OwnerVillaPackage) =>
  villa.availability === 'unavailable' ||
  villa.status === 'unavailable' ||
  villa.status === 'draft' ||
  villa.status === 'archived';

const dateLabel = (value: VillaReview['createdAt']) => {
  if (!value) return '';
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'string') date = new Date(value);
  else if (typeof value === 'object' && 'seconds' in value && value.seconds) {
    date = new Date(value.seconds * 1000);
  }
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
};


const OwnerVillas: React.FC<Props> = ({
  ownerId,
  resortName,
  resortLocation,
  onEditPackage,
}) => {
  const [villas, setVillas] = useState<OwnerVillaPackage[]>([]);
  const [reviewsByVilla, setReviewsByVilla] = useState<Record<string, VillaReview[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedVilla, setSelectedVilla] = useState<OwnerVillaPackage | null>(null);
  const [reviewVilla, setReviewVilla] = useState<OwnerVillaPackage | null>(null);
  const [deletingId, setDeletingId] = useState('');
  const [availabilityBusyId, setAvailabilityBusyId] = useState('');
  const [menuVillaId, setMenuVillaId] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [appMessage, setAppMessage] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (!ownerId) {
      setVillas([]);
      setLoading(false);
      setError('Please sign in again to view your accommodations.');
      return;
    }

    setLoading(true);
    const ownerQuery = query(collection(db, 'packages'), where('ownerId', '==', ownerId));
    const unsubscribe = onSnapshot(
      ownerQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as OwnerVillaPackage[];
        rows.sort((a, b) => {
          const aTime = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          const bTime = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          return bTime - aTime;
        });
        setVillas(rows);
        setError('');
        setLoading(false);
      },
      (err) => {
        console.error('Owner Villas loading error:', err);
        setError('Could not load your villas. Please check your connection and Firestore permissions.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [ownerId]);

  // Reviews are read per accommodation so each villa only displays its own guest feedback.
  useEffect(() => {
    if (!villas.length) {
      setReviewsByVilla({});
      return;
    }
    const unsubscribers = villas.map((villa) => {
      const reviewQuery = query(
        collection(db, 'reviews'),
        where('packageId', '==', villa.id)
      );
      return onSnapshot(
        reviewQuery,
        (snapshot) => {
          const rows = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as VillaReview[];
          rows.sort((a, b) => {
            const aDate = dateLabel(a.createdAt);
            const bDate = dateLabel(b.createdAt);
            return new Date(bDate).getTime() - new Date(aDate).getTime();
          });
          setReviewsByVilla((current) => ({ ...current, [villa.id]: rows }));
        },
        (err) => {
          // Missing review indexes/permissions should not prevent the villa inventory from rendering.
          console.warn(`Could not load reviews for ${villa.id}:`, err);
          setReviewsByVilla((current) => ({ ...current, [villa.id]: [] }));
        }
      );
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [villas]);

  const availableCount = villas.filter((villa) => !isUnavailable(villa)).length;
  const unavailableCount = villas.length - availableCount;

  const visibleVillas = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return villas.filter((villa) => {
      const unavailable = isUnavailable(villa);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'available' && !unavailable) ||
        (filter === 'unavailable' && unavailable);
      const haystack = [
        villa.name,
        villa.resortType,
        villa.category,
        villa.description,
        villa.resortLocation,
        ...toList(villa.amenities),
      ].filter(Boolean).join(' ').toLowerCase();
      return matchesFilter && (!keyword || haystack.includes(keyword));
    });
  }, [villas, search, filter]);

  const toggleVillaAvailability = async (villa: OwnerVillaPackage) => {
    const currentlyUnavailable = isUnavailable(villa);
    const nextAvailability = currentlyUnavailable ? 'available' : 'unavailable';
    setAvailabilityBusyId(villa.id);
    try {
      await updateDoc(doc(db, 'packages', villa.id), {
        availability: nextAvailability,
        availabilityUpdatedAt: serverTimestamp(),
        availabilityUpdatedBy: ownerId,
      });
      setMenuVillaId('');
      setSelectedVilla((current) =>
        current?.id === villa.id
          ? { ...current, availability: nextAvailability }
          : current
      );
    } catch (err) {
      console.error('Villa availability update failed:', err);
      setAppMessage({ title: 'Update failed', message: 'Unable to update accommodation availability. Please check your Firestore permissions and try again.' });
    } finally {
      setAvailabilityBusyId('');
    }
  };

  const removeVilla = async (villa: OwnerVillaPackage) => {
    setDeletingId(villa.id);
    try {
      await deleteDoc(doc(db, 'packages', villa.id));
      setMenuVillaId('');
      if (selectedVilla?.id === villa.id) setSelectedVilla(null);
      if (reviewVilla?.id === villa.id) setReviewVilla(null);
    } catch (err) {
      console.error('Villa deletion failed:', err);
      setAppMessage({ title: 'Delete failed', message: 'Unable to delete this accommodation. Please try again.' });
    } finally {
      setDeletingId('');
    }
  };

  const requestVillaAvailabilityChange = (villa: OwnerVillaPackage) => {
    const currentlyUnavailable = isUnavailable(villa);
    setMenuVillaId('');
    setConfirmDialog({
      title: currentlyUnavailable ? 'Make accommodation available?' : 'Temporarily unavailable?',
      message: currentlyUnavailable
        ? 'Guests will be able to see and reserve this accommodation again, subject to its booking schedule.'
        : 'Guests will no longer be able to make new reservations for this accommodation while it is unavailable.',
      confirmText: currentlyUnavailable ? 'Make available' : 'Set unavailable',
      onConfirm: async () => {
        setConfirmDialog(null);
        await toggleVillaAvailability(villa);
      },
    });
  };

  const requestDeleteVilla = (villa: OwnerVillaPackage) => {
    setMenuVillaId('');
    setConfirmDialog({
      title: 'Delete accommodation?',
      message: `Are you sure you want to delete "${villa.name || 'this accommodation'}"? This will permanently remove its listing from your inventory.`,
      confirmText: 'Delete accommodation',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        await removeVilla(villa);
      },
    });
  };

  const getRating = (reviews: VillaReview[]) => {
    if (!reviews.length) return 0;
    const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return total / reviews.length;
  };

  const renderReviewList = (villa: OwnerVillaPackage) => {
    const reviews = reviewsByVilla[villa.id] || [];
    if (!reviews.length) {
      return (
        <div className="ov-reviews-empty">
          <div className="ov-review-empty-icon"><IonIcon icon={chatbubbleEllipsesOutline} /></div>
          <strong>No reviews yet</strong>
          <span>Guest reviews for this accommodation will appear here once submitted.</span>
        </div>
      );
    }
    return (
      <div className="ov-review-list">
        {reviews.map((review) => {
          const reviewer = review.userName || review.reviewerName || review.displayName || 'Guest';
          const rating = Math.max(0, Math.min(5, Number(review.rating || 0)));
          return (
            <article className="ov-review-item" key={review.id}>
              <div className="ov-review-top">
                <div className="ov-review-person">
                  {review.userPhoto || review.photoURL ? (
                    <img src={review.userPhoto || review.photoURL} alt="" />
                  ) : (
                    <span>{reviewer.slice(0, 1).toUpperCase()}</span>
                  )}
                  <div><strong>{reviewer}</strong><small>{dateLabel(review.createdAt) || 'Guest review'}</small></div>
                </div>
                <div className="ov-review-rating" aria-label={`${rating} out of 5 stars`}>
                  <IonIcon icon={star} /> {rating.toFixed(1)}
                </div>
              </div>
              <p>{review.comment || review.review || 'No written comment provided.'}</p>
              {review.reply && <div className="ov-review-reply"><b>Your response</b><span>{review.reply}</span></div>}
            </article>
          );
        })}
      </div>
    );
  };

  return (
    <section className="ov-page">
      <div className="ov-property-heading">
        <div className="ov-property-avatar"><IonIcon icon={homeOutline} /></div>
        <div className="ov-property-title">
          <span className="ov-kicker">PROPERTY MANAGEMENT</span>
          <h1>Villas & Accommodations</h1>
          <p>{resortName || 'Your resort'}{resortLocation ? ` · ${resortLocation}` : ''}</p>
        </div>
      </div>

      <section className="ov-inventory-pulse">
        <div className="ov-pulse-heading">
          <span><i /> LIVE INVENTORY</span>
          <small>{villas.length} total listings</small>
        </div>
        <div className="ov-pulse-numbers">
          <strong>{villas.length}</strong>
          <span>Accommodations</span>
        </div>
        <div className="ov-pulse-bar" aria-label={`${availableCount} of ${villas.length} available`}>
          <span style={{ width: `${villas.length ? (availableCount / villas.length) * 100 : 0}%` }} />
        </div>
        <div className="ov-pulse-legend">
          <div><small>Available</small><strong>{availableCount}</strong></div>
          <div><small>Unavailable</small><strong>{unavailableCount}</strong></div>
          <div><small>Guest reviews</small><strong>{Object.values(reviewsByVilla).reduce((n, rows) => n + rows.length, 0)}</strong></div>
        </div>
      </section>

      <div className="ov-section-heading">
        <div><span className="ov-kicker">YOUR PROPERTY</span><h2>All accommodations</h2></div>
        <span className="ov-total-pill">{villas.length} listings</span>
      </div>

      <label className="ov-search">
        <IonIcon icon={searchOutline} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search villas, suites, cottages..."
          aria-label="Search accommodations"
        />
      </label>

      <div className="ov-filter-row" role="group" aria-label="Filter accommodations">
        {([
          ['all', 'All Villas', villas.length],
          ['available', 'Available', availableCount],
          ['unavailable', 'Unavailable', unavailableCount],
        ] as [FilterKey, string, number][]).map(([key, label, count]) => (
          <button
            type="button"
            key={key}
            className={`ov-filter-chip ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label} <span>{count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ov-state"><IonSpinner name="crescent" /><span>Loading your accommodations...</span></div>
      ) : error ? (
        <div className="ov-state ov-error"><IonIcon icon={closeCircleOutline} /><strong>{error}</strong></div>
      ) : visibleVillas.length === 0 ? (
        <div className="ov-empty">
          <IonIcon icon={bedOutline} />
          <strong>{villas.length ? 'No matching accommodations' : 'No accommodations yet'}</strong>
          <span>{villas.length ? 'Try a different search or filter.' : 'Your published villas and packages will appear here.'}</span>
        </div>
      ) : (
        <div className="ov-villa-list">
          {visibleVillas.map((villa) => {
            const rates = ratesFor(villa);
            const minRate = startingRate(villa);
            const minRateOption = rates.find((rate) => Number(rate.price) === minRate);
            const image = villa.imageUrls?.[0] || villa.imageUrl || '';
            const unavailable = isUnavailable(villa);
            const amenities = toList(villa.amenities);
            const capacity = rates.reduce((max, rate) => Math.max(max, Number(rate.guestCapacity || 0)), 0);
            const reviews = reviewsByVilla[villa.id] || [];
            const rating = getRating(reviews);
            return (
              <article className={`ov-villa-card ${unavailable ? 'is-unavailable' : ''}`} key={villa.id}>
                <button className="ov-villa-image" type="button" onClick={() => setSelectedVilla(villa)} aria-label={`View ${villa.name || 'accommodation'} details`}>
                  {image ? <img src={image} alt={villa.name || 'Villa'} loading="lazy" /> : <span className="ov-no-image"><IonIcon icon={homeOutline} /> No accommodation photo</span>}
                  <span className={`ov-status-badge ${unavailable ? 'off' : 'on'}`}><i />{unavailable ? 'Unavailable' : 'Available'}</span>
                  {minRate > 0 && <span className="ov-price-badge"><b>{money(minRate)}</b><small>/ {unitLabel(minRateOption?.unit || villa.priceUnit)}</small></span>}
                  <span className="ov-image-shade" />
                  <span className="ov-image-title">
                    <small>{usageLabel(villa)} · {villa.resortType || villa.category || 'ACCOMMODATION'}</small>
                    <strong>{villa.name || 'Untitled accommodation'}</strong>
                  </span>
                  <span className="ov-view-hint"><IonIcon icon={eyeOutline} /> View</span>
                </button>

                <div className="ov-villa-content">
                  <div className="ov-villa-facts">
                    {capacity > 0 && <span><IonIcon icon={peopleOutline} /> Up to {capacity} guests</span>}
                    {rates.length > 0 && <span><IonIcon icon={bedOutline} /> {rates.length} rate{rates.length > 1 ? 's' : ''}</span>}
                    {amenities.length > 0 && <span><IonIcon icon={waterOutline} /> {amenities.length} amenities</span>}
                  </div>

                  <div className="ov-review-summary">
                    <div className="ov-stars">
                      {[1, 2, 3, 4, 5].map((value) => <IonIcon key={value} icon={star} className={value <= Math.round(rating) ? 'filled' : ''} />)}
                    </div>
                    <strong>{reviews.length ? rating.toFixed(1) : 'New'}</strong>
                    <button type="button" onClick={() => setReviewVilla(villa)}>
                      {reviews.length} review{reviews.length === 1 ? '' : 's'} <span>· View</span>
                    </button>
                  </div>

                  {amenities.length > 0 && (
                    <div className="ov-amenity-tags">
                      {amenities.slice(0, 3).map((amenity) => <span key={amenity}>{amenity}</span>)}
                      {amenities.length > 3 && <span>+{amenities.length - 3}</span>}
                    </div>
                  )}

                  <div className="ov-card-footer">
                    <button type="button" className="ov-edit-button" onClick={() => onEditPackage(villa)}>
                      <IonIcon icon={createOutline} /> Edit
                    </button>
                    <button type="button" className="ov-reviews-button" onClick={() => setReviewVilla(villa)}>
                      <IonIcon icon={chatbubbleEllipsesOutline} /> Reviews
                    </button>
                    <button
                      type="button"
                      className="ov-more-button"
                      onClick={() => setMenuVillaId(menuVillaId === villa.id ? '' : villa.id)}
                      aria-label="More villa actions"
                      aria-expanded={menuVillaId === villa.id}
                    >
                      <IonIcon icon={ellipsisHorizontal} />
                    </button>
                  </div>
                  {menuVillaId === villa.id && (
                    <div className="ov-more-menu">
                      <button type="button" onClick={() => { setSelectedVilla(villa); setMenuVillaId(''); }}>
                        <IonIcon icon={eyeOutline} /> View details
                      </button>
                      <button
                        type="button"
                        className={unavailable ? 'availability-action make-available' : 'availability-action make-unavailable'}
                        disabled={availabilityBusyId === villa.id}
                        onClick={() => requestVillaAvailabilityChange(villa)}
                      >
                        {availabilityBusyId === villa.id
                          ? <IonSpinner name="crescent" />
                          : <IonIcon icon={unavailable ? homeOutline : closeCircleOutline} />}
                        {availabilityBusyId === villa.id
                          ? 'Updating availability…'
                          : unavailable ? 'Make available' : 'Temporarily unavailable'}
                      </button>
                      <button type="button" className="danger" disabled={deletingId === villa.id || availabilityBusyId === villa.id} onClick={() => requestDeleteVilla(villa)}>
                        {deletingId === villa.id ? <IonSpinner name="crescent" /> : <IonIcon icon={trashOutline} />}
                        Delete accommodation
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <IonModal isOpen={!!selectedVilla} onDidDismiss={() => setSelectedVilla(null)} className="ov-detail-modal">
        {selectedVilla && (
          <div className="ov-modal-sheet">
            <div className="ov-modal-header">
              <div><span className="ov-kicker">ACCOMMODATION DETAILS</span><h2>{selectedVilla.name || 'Villa details'}</h2></div>
              <button type="button" onClick={() => setSelectedVilla(null)} aria-label="Close details"><IonIcon icon={closeOutline} /></button>
            </div>
            {(selectedVilla.imageUrls?.length || selectedVilla.imageUrl) ? (
              <div className="ov-detail-gallery">
                {(selectedVilla.imageUrls?.length ? selectedVilla.imageUrls : [selectedVilla.imageUrl!]).slice(0, 5).map((url, index) => <img key={`${url}-${index}`} src={url} alt={`${selectedVilla.name || 'Villa'} ${index + 1}`} />)}
              </div>
            ) : null}
            <p className="ov-detail-description">{selectedVilla.description || 'No description provided.'}</p>
            <div className="ov-detail-location"><IonIcon icon={locationOutline} /> {selectedVilla.locationLabel || selectedVilla.resortLocation || resortLocation || resortName}</div>
            <div className="ov-reservation-summary">
              <span className="ov-kicker">RESERVATION SETUP</span>
              <strong>{usageLabel(selectedVilla)}</strong>
              {getUsageType(selectedVilla) === 'event' && (
                <div className="ov-event-tags">
                  {(selectedVilla.eventTypes?.length ? selectedVilla.eventTypes : ['Event types not specified']).map((eventType) => (
                    <span key={eventType}>{eventType}</span>
                  ))}
                </div>
              )}
              {getUsageType(selectedVilla) === 'overnight' && (
                <small>Guests reserve an overnight stay with check-in and check-out dates.</small>
              )}
              {getUsageType(selectedVilla) === 'swimming' && (
                <small>Guests reserve a day-use or night swimming session.</small>
              )}
            </div>

            <h3>Pricing options</h3>
            <div className="ov-detail-rates">
              {ratesFor(selectedVilla).length ? ratesFor(selectedVilla).map((rate, index) => (
                <div className="ov-detail-rate-item" key={rate.id || index}>
                  <div className="ov-detail-rate-main">
                    <span>{rate.label || `Per ${unitLabel(rate.unit)}`}</span>
                    <strong>{money(Number(rate.price))} <small>/ {unitLabel(rate.unit)}</small></strong>
                  </div>
                  {(rate.guestCapacity || rate.durationHours || rate.minimumHours) ? (
                    <small className="ov-rate-meta">
                      {rate.guestCapacity ? `Capacity: ${rate.guestCapacity} guests` : ''}
                      {rate.durationHours ? ` · Included: ${rate.durationHours} hours` : ''}
                      {rate.minimumHours ? ` · Minimum: ${rate.minimumHours} hours` : ''}
                    </small>
                  ) : null}
                  {toList(rate.includedAmenities).length > 0 && (
                    <div className="ov-event-tags">{toList(rate.includedAmenities).map((item) => <span key={item}>{item}</span>)}</div>
                  )}
                  {(rate.additionalServices || []).length > 0 && (
                    <div className="ov-rate-services">
                      <b>Additional services</b>
                      {(rate.additionalServices || []).map((service, serviceIndex) => (
                        <span key={service.id || `${index}-${serviceIndex}`}>
                          {service.name} · {service.included ? 'Included' : `${money(Number(service.price) || 0)} ${serviceUnitLabel(service.unit)}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )) : <span>No pricing options added.</span>}
            </div>

            <h3>Booking schedule</h3>
            <div className="ov-schedule-details">
              <div><small>Available days</small><strong>{selectedVilla.bookingSchedule?.availableDays?.length ? selectedVilla.bookingSchedule.availableDays.map((day) => day.slice(0, 3)).join(', ') : 'All days (default)'}</strong></div>
              <div><small>Day session</small><strong>{selectedVilla.bookingSchedule?.sessions?.day?.enabled === false ? 'Disabled' : `${formatTime(selectedVilla.bookingSchedule?.sessions?.day?.startTime || '08:00')} – ${formatTime(selectedVilla.bookingSchedule?.sessions?.day?.endTime || '17:00')}`}</strong></div>
              <div><small>Night session</small><strong>{selectedVilla.bookingSchedule?.sessions?.night?.enabled === false ? 'Disabled' : `${formatTime(selectedVilla.bookingSchedule?.sessions?.night?.startTime || '18:00')} – ${formatTime(selectedVilla.bookingSchedule?.sessions?.night?.endTime || '00:00')}`}</strong></div>
              <div><small>Extension</small><strong>{selectedVilla.bookingSchedule?.extension?.enabled ? `${money(Number(selectedVilla.bookingSchedule.extension.feePerHour || 0))} / hour · up to ${selectedVilla.bookingSchedule.extension.maxHours || 4} hours` : 'Not offered'}</strong></div>
            </div>
            <h3>Guest policy</h3>
            <div className="ov-policy-detail">
              {selectedVilla.childFreeUnderAge !== null && selectedVilla.childFreeUnderAge !== undefined
                ? `Children under ${selectedVilla.childFreeUnderAge} years old are free.`
                : 'No free-child age policy set.'}
            </div>
            <h3>Amenities</h3>
            <div className="ov-detail-amenities">
              {toList(selectedVilla.amenities).length ? toList(selectedVilla.amenities).map((item) => <span key={item}>{item}</span>) : <small>No amenities listed.</small>}
            </div>
            <button type="button" className="ov-modal-edit" onClick={() => { const villa = selectedVilla; setSelectedVilla(null); onEditPackage(villa); }}>
              <IonIcon icon={createOutline} /> Edit accommodation
            </button>
          </div>
        )}
      </IonModal>

      <IonModal isOpen={!!reviewVilla} onDidDismiss={() => setReviewVilla(null)} className="ov-review-modal">
        {reviewVilla && (
          <div className="ov-modal-sheet">
            <div className="ov-modal-header">
              <div><span className="ov-kicker">GUEST FEEDBACK</span><h2>{reviewVilla.name || 'Villa reviews'}</h2></div>
              <button type="button" onClick={() => setReviewVilla(null)} aria-label="Close reviews"><IonIcon icon={closeOutline} /></button>
            </div>
            <div className="ov-review-modal-summary">
              <strong>{getRating(reviewsByVilla[reviewVilla.id] || []).toFixed(1)}</strong>
              <div><div className="ov-stars">{[1,2,3,4,5].map((v) => <IonIcon key={v} icon={star} className={v <= Math.round(getRating(reviewsByVilla[reviewVilla.id] || [])) ? 'filled' : ''} />)}</div><small>{(reviewsByVilla[reviewVilla.id] || []).length} guest reviews</small></div>
            </div>
            {renderReviewList(reviewVilla)}
          </div>
        )}
      </IonModal>

      {confirmDialog && (
        <div className="ov-app-dialog-backdrop" role="presentation" onClick={() => setConfirmDialog(null)}>
          <section
            className="ov-app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ov-app-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`ov-app-dialog-icon ${confirmDialog.danger ? 'danger' : ''}`}>
              <IonIcon icon={confirmDialog.danger ? trashOutline : closeCircleOutline} />
            </div>
            <h2 id="ov-app-dialog-title">{confirmDialog.title}</h2>
            <p>{confirmDialog.message}</p>
            <div className="ov-app-dialog-actions">
              <button type="button" className="ov-dialog-cancel" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button
                type="button"
                className={`ov-dialog-confirm ${confirmDialog.danger ? 'danger' : ''}`}
                onClick={() => void confirmDialog.onConfirm()}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </section>
        </div>
      )}

      {appMessage && (
        <div className="ov-app-dialog-backdrop" role="presentation" onClick={() => setAppMessage(null)}>
          <section className="ov-app-dialog ov-app-message" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="ov-app-dialog-icon"><IonIcon icon={closeCircleOutline} /></div>
            <h2>{appMessage.title}</h2>
            <p>{appMessage.message}</p>
            <div className="ov-app-dialog-actions">
              <button type="button" className="ov-dialog-confirm" onClick={() => setAppMessage(null)}>Got it</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default OwnerVillas;
