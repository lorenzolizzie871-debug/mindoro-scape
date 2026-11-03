import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonIcon, IonPage, IonSpinner } from '@ionic/react';
import {
  locationOutline,
  notificationsOutline,
  personOutline,
  heart,
  trashOutline,
  shareSocialOutline,
  star,
  calendarOutline,
  peopleOutline,
  checkmarkCircle,
  heartDislike,
  informationCircle,
  copy,
  alertCircleOutline,
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import BottomTabs from '../components/BottomTabs';
import './Favorites.css';

type FavoriteRecord = {
  id: string;
  userId?: string;
  resortId?: string;
  packageId?: string;
  accommodationId?: string;
  offerId?: string;
  bookingId?: string;
  resortName?: string;
  accommodationName?: string;
  resortLocation?: string;
  location?: string;
  savedAt?: unknown;
  source?: string;
  [key: string]: unknown;
};

type FavoriteCard = {
  id: string;
  favoriteDocId: string;
  resortId: string;
  name: string;
  location: string;
  municipality: string;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  tag: string;
  image: string;
  amenities: string[];
  raw: Record<string, unknown>;
};

const asText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const asNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
};

const getFirstImage = (data: Record<string, unknown>): string => {
  const direct = asText(
    data.imageUrl,
    data.coverImage,
    data.thumbnailUrl,
    data.photoURL,
    data.photoUrl,
    data.image,
  );
  if (direct) return direct;

  const imageUrls = data.imageUrls;
  if (Array.isArray(imageUrls)) {
    const first = imageUrls.find((item) => typeof item === 'string' && item.trim());
    if (typeof first === 'string') return first;
  }

  const images = data.images;
  if (Array.isArray(images)) {
    const first = images.find((item) => typeof item === 'string' && item.trim());
    if (typeof first === 'string') return first;
    const firstObject = images.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
    if (firstObject) return asText(firstObject.url, firstObject.imageUrl, firstObject.src);
  }

  return '';
};

const getPrice = (data: Record<string, unknown>): number | null => {
  const direct = asNumber(data.price, data.minimumPrice, data.startingPrice, data.pricePerNight);
  if (direct !== null) return direct;

  const pricingOptions = data.pricingOptions;
  if (Array.isArray(pricingOptions)) {
    const prices = pricingOptions
      .map((option) => {
        if (typeof option === 'number' || typeof option === 'string') return asNumber(option);
        if (option && typeof option === 'object') {
          const item = option as Record<string, unknown>;
          return asNumber(item.price, item.amount, item.rate, item.pricePerNight);
        }
        return null;
      })
      .filter((value): value is number => value !== null && value >= 0);
    if (prices.length) return Math.min(...prices);
  }

  return null;
};

const getAmenities = (data: Record<string, unknown>): string[] => {
  const value = data.amenities;
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return asText(record.name, record.label, record.title);
      }
      return '';
    })
    .filter(Boolean)
    .slice(0, 4);
};

const normalizeFavorite = (
  favorite: FavoriteRecord,
  packageData: Record<string, unknown> | null,
): FavoriteCard => {
  const packageRecord = packageData || {};
  const municipality = asText(
    packageRecord.resortLocation,
    packageRecord.municipality,
    packageRecord.city,
    favorite.resortLocation,
  );
  const location = asText(
    packageRecord.locationLabel,
    packageRecord.location,
    packageRecord.address,
    favorite.location,
    municipality,
    packageRecord.barangay,
  );
  const resortName = asText(
    packageRecord.resortName,
    packageRecord.name,
    packageRecord.title,
    packageRecord.packageName,
    favorite.resortName,
    favorite.accommodationName,
  ) || 'Unnamed resort';

  const accommodationName = asText(favorite.accommodationName);
  const price = getPrice(packageRecord) ?? getPrice(favorite);
  const rating = asNumber(packageRecord.averageRating, packageRecord.rating, favorite.averageRating, favorite.rating);
  const reviews = asNumber(packageRecord.reviewCount, packageRecord.reviewsCount, favorite.reviewCount);
  const amenities = getAmenities(packageRecord).length ? getAmenities(packageRecord) : getAmenities(favorite);

  return {
    id: favorite.resortId || favorite.packageId || favorite.accommodationId || favorite.id,
    favoriteDocId: favorite.id,
    resortId: favorite.resortId || favorite.packageId || '',
    name: accommodationName ? `${resortName} — ${accommodationName}` : resortName,
    location,
    municipality,
    price,
    rating,
    reviews,
    tag: asText(packageRecord.category, packageRecord.type, packageRecord.tag, favorite.source) || 'Resort',
    image: getFirstImage(packageRecord) || getFirstImage(favorite),
    amenities,
    // Keep the resolved package document as the raw resort data.
    // `data` is not defined in this function; using it caused the runtime ReferenceError.
    raw: packageRecord,
  };
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(price);

const Favorites: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [favorites, setFavorites] = useState<FavoriteCard[]>([]);
  const [favoriteRecords, setFavoriteRecords] = useState<FavoriteRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ show: boolean; message: string; icon: string }>({
    show: false,
    message: '',
    icon: '',
  });

  const showToast = (message: string, icon: string = checkmarkCircle) => {
    setToast({ show: true, message, icon });
    window.setTimeout(() => setToast((previous) => ({ ...previous, show: false })), 2600);
  };

  useEffect(() => {
    if (!user?.uid) {
      setFavorites([]);
      setFavoriteRecords([]);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    const favoritesQuery = query(
      collection(db, 'userFavorites'),
      where('userId', '==', user.uid),
    );

    let active = true;
    const unsubscribe = onSnapshot(
      favoritesQuery,
      async (snapshot) => {
        const records: FavoriteRecord[] = snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<FavoriteRecord, 'id'>),
        }));
        setFavoriteRecords(records);

        try {
          const cards = await Promise.all(
            records.map(async (favorite) => {
              const packageId = favorite.resortId || favorite.packageId;
              if (!packageId) return normalizeFavorite(favorite, null);

              try {
                const packageSnapshot = await getDoc(doc(db, 'packages', packageId));
                const packageData = packageSnapshot.exists()
                  ? (packageSnapshot.data() as Record<string, unknown>)
                  : null;
                return normalizeFavorite(favorite, packageData);
              } catch (packageError) {
                console.warn(`Unable to load package ${packageId}:`, packageError);
                return normalizeFavorite(favorite, null);
              }
            }),
          );

          if (!active) return;
          cards.sort((a, b) => {
            const aRecord = records.find((record) => record.id === a.favoriteDocId);
            const bRecord = records.find((record) => record.id === b.favoriteDocId);
            const aTime = (aRecord?.savedAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
            const bTime = (bRecord?.savedAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
            return bTime - aTime;
          });
          setFavorites(cards);
          setError('');
          setLoading(false);
        } catch (loadError) {
          console.error('Unable to load favorite package details:', loadError);
          if (!active) return;
          setError('Some saved resort details could not be loaded. Please try again.');
          setLoading(false);
        }
      },
      (snapshotError) => {
        console.error('Unable to load favorites:', snapshotError);
        if (!active) return;
        setError('Unable to load your favorites. Please check your connection and Firestore rules.');
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user?.uid]);

  const locationFilters = useMemo(() => {
    const locations = new Map<string, string>();
    favorites.forEach((item) => {
      const label = item.municipality || item.location.split(',').map((part) => part.trim()).filter(Boolean).slice(-1)[0];
      if (label) {
        const key = label.toLowerCase();
        if (!locations.has(key)) locations.set(key, label);
      }
    });
    return Array.from(locations.entries()).map(([id, label]) => ({ id, label }));
  }, [favorites]);

  const filteredFavorites = useMemo(() => {
    if (activeFilter === 'all') return favorites;
    return favorites.filter((item) => {
      const municipality = item.municipality || item.location.split(',').map((part) => part.trim()).filter(Boolean).slice(-1)[0];
      return municipality?.toLowerCase() === activeFilter;
    });
  }, [favorites, activeFilter]);

  useEffect(() => {
    if (activeFilter !== 'all' && !locationFilters.some((filter) => filter.id === activeFilter)) {
      setActiveFilter('all');
    }
  }, [activeFilter, locationFilters]);

  const handleRemove = async (item: FavoriteCard) => {
    if (!user?.uid || removingId) return;
    setRemovingId(item.favoriteDocId);
    try {
      await deleteDoc(doc(db, 'userFavorites', item.favoriteDocId));
      showToast(`${item.name} removed from favorites`, heartDislike);
      // The onSnapshot listener updates the UI after Firestore confirms deletion.
    } catch (removeError) {
      console.error('Unable to remove favorite:', removeError);
      showToast('Unable to remove this favorite. Please try again.', alertCircleOutline);
    } finally {
      setRemovingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!user?.uid || clearing || favoriteRecords.length === 0) {
      if (favoriteRecords.length === 0) showToast('Your wishlist is already empty', informationCircle);
      return;
    }

    setClearing(true);
    try {
      // Firestore batches support up to 500 writes per batch.
      for (let index = 0; index < favoriteRecords.length; index += 450) {
        const batch = writeBatch(db);
        favoriteRecords.slice(index, index + 450).forEach((favorite) => {
          batch.delete(doc(db, 'userFavorites', favorite.id));
        });
        await batch.commit();
      }
      showToast('All saved resorts removed', trashOutline);
    } catch (clearError) {
      console.error('Unable to clear favorites:', clearError);
      showToast('Unable to clear favorites. Please try again.', alertCircleOutline);
    } finally {
      setClearing(false);
    }
  };

  const handleShare = async () => {
    const shareText = favorites.length
      ? `My saved resorts in Oriental Mindoro:\n${favorites.map((item) => `${item.name}${item.location ? ` — ${item.location}` : ''}`).join('\n')}`
      : 'Take a look at my saved resorts in Oriental Mindoro!';

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mindoro Scape Favorites',
          text: shareText,
          url: window.location.href,
        });
      } catch {
        // The user may close the native share sheet; no error toast is needed.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
      showToast('Wishlist details copied to clipboard', copy);
    } catch {
      showToast('Sharing is not available in this browser', alertCircleOutline);
    }
  };

  const showEmptyState = !loading && !error && favorites.length === 0;

  return (
    <IonPage>
      <IonContent className="favorites-content">
        <div className="favorites-shell">
          <header className="fav-header">
            <button className="fav-brand" onClick={() => navigate('/user/dashboard')}>
              <img
                alt="Mindoro Scape"
                src="/assets/mindoro-scape-logo.png"
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
              />
              <div className="fav-brand-copy">
                <strong>Mindoro Scape</strong>
                <small>
                  <IonIcon icon={locationOutline} />
                  ORIENTAL MINDORO
                </small>
              </div>
            </button>

            <div className="fav-header-actions">
              <button className="fav-icon-button" onClick={() => navigate('/user/dashboard')} aria-label="Notifications">
                <IonIcon icon={notificationsOutline} />
                <span className="fav-notification-dot" />
              </button>
              <button className="fav-profile-button" onClick={() => navigate('/user/profile')} aria-label="Open profile">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <IonIcon icon={personOutline} />
                )}
              </button>
            </div>
          </header>

          <main className="fav-main">
            <div className="fav-title-row">
              <div>
                <p className="fav-eyebrow">YOUR COLLECTION</p>
                <h1>Saved Resorts</h1>
                <p className="fav-subtitle">
                  {loading
                    ? 'Loading your saved resorts...'
                    : `${favorites.length} ${favorites.length === 1 ? 'resort' : 'resorts'} saved to your wishlist`}
                </p>
              </div>
              <button
                onClick={() => void handleClearAll()}
                className="btn-clear"
                disabled={loading || clearing || favorites.length === 0}
              >
                <IonIcon icon={trashOutline} />
                <span>{clearing ? 'Clearing...' : 'Clear all'}</span>
              </button>
            </div>

            {locationFilters.length > 0 && (
              <div className="fav-filters">
                <button
                  className={`chip ${activeFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setActiveFilter('all')}
                >
                  All Saved ({favorites.length})
                </button>
                {locationFilters.map((filter) => {
                  const count = favorites.filter((item) => {
                    const municipality = item.municipality || item.location.split(',').map((part) => part.trim()).filter(Boolean).slice(-1)[0];
                    return municipality?.toLowerCase() === filter.id;
                  }).length;
                  return (
                    <button
                      key={filter.id}
                      className={`chip ${activeFilter === filter.id ? 'is-active' : ''}`}
                      onClick={() => setActiveFilter(filter.id)}
                    >
                      {filter.label} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="share-banner">
              <div className="share-banner-copy">
                <div className="share-icon-wrap">
                  <IonIcon icon={peopleOutline} />
                </div>
                <div className="share-text-wrap">
                  <span className="share-title">Planning a trip with friends?</span>
                  <span className="share-desc">Share your saved resorts with them</span>
                </div>
              </div>
              <button onClick={() => void handleShare()} className="btn-share" disabled={favorites.length === 0}>
                <IonIcon icon={shareSocialOutline} />
                <span>Share</span>
              </button>
            </div>

            {loading && (
              <div className="fav-state">
                <IonSpinner name="crescent" />
                <span>Loading your favorites...</span>
              </div>
            )}

            {!loading && error && (
              <div className="fav-state fav-error-state">
                <IonIcon icon={alertCircleOutline} />
                <h3>Unable to load favorites</h3>
                <p>{error}</p>
              </div>
            )}

            {!loading && !error && filteredFavorites.length > 0 && (
              <div className="fav-cards-container">
                {filteredFavorites.map((item) => (
                  <article key={item.favoriteDocId} className="resort-card">
                    <div className="card-image-wrap">
                      {item.image ? (
                        <img src={item.image} alt={item.name} loading="lazy" />
                      ) : (
                        <div className="fav-image-placeholder">
                          <IonIcon icon={locationOutline} />
                          <span>Resort image unavailable</span>
                        </div>
                      )}
                      <div className="card-gradient" />
                      <div className="card-badge">
                        <IonIcon icon={star} />
                        <span>{item.tag}</span>
                      </div>
                      <button
                        onClick={() => void handleRemove(item)}
                        className="btn-heart"
                        disabled={removingId === item.favoriteDocId}
                        aria-label={`Remove ${item.name} from favorites`}
                      >
                        <IonIcon icon={heart} />
                      </button>
                      {item.location && (
                        <div className="card-location">
                          <IonIcon icon={locationOutline} />
                          <span>{item.location}</span>
                        </div>
                      )}
                    </div>

                    <div className="card-details">
                      <div className="card-title-row">
                        <h2 className="card-title">{item.name}</h2>
                        {(item.rating !== null || item.reviews !== null) && (
                          <div className="card-rating">
                            <IonIcon icon={star} />
                            {item.rating !== null && <span className="score">{item.rating.toFixed(1)}</span>}
                            {item.reviews !== null && <span className="count">({item.reviews})</span>}
                          </div>
                        )}
                      </div>

                      {item.amenities.length > 0 && (
                        <div className="fav-amenities">
                          {item.amenities.map((amenity, index) => <span key={`${amenity}-${index}`}>{amenity}</span>)}
                        </div>
                      )}

                      <div className="card-price-row">
                        {item.price !== null ? (
                          <>
                            <span className="card-price">{formatPrice(item.price)}</span>
                            <span className="card-price-suffix">starting price</span>
                          </>
                        ) : (
                          <span className="fav-price-unavailable">Price not provided</span>
                        )}
                      </div>

                      <div className="card-actions">
                        <button
                          onClick={() => item.resortId && navigate(`/user/resort/${item.resortId}`)}
                          className="btn-availability"
                          disabled={!item.resortId}
                        >
                          <span>View Resort</span>
                          <IonIcon icon={calendarOutline} />
                        </button>
                        <button onClick={() => void handleShare()} className="btn-share-card" aria-label="Share wishlist">
                          <IonIcon icon={shareSocialOutline} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {showEmptyState && (
              <div className="empty-state is-visible">
                <div className="empty-icon-wrap">
                  <IonIcon icon={heart} />
                </div>
                <h3 className="empty-title">No saved resorts yet</h3>
                <p className="empty-desc">
                  Save resorts from Explore or from your completed bookings. They will appear here automatically.
                </p>
                <button onClick={() => navigate('/user/explore')} className="btn-discover">
                  <IonIcon icon={locationOutline} />
                  <span>Explore Resorts</span>
                </button>
              </div>
            )}

            {!loading && !error && favorites.length > 0 && filteredFavorites.length === 0 && (
              <div className="fav-state">
                <IonIcon icon={informationCircle} />
                <span>No saved resorts in this location.</span>
                <button onClick={() => setActiveFilter('all')}>Show all saved resorts</button>
              </div>
            )}

            {!user && (
              <div className="fav-state">
                <IonIcon icon={informationCircle} />
                <span>Please sign in to view your saved resorts.</span>
                <button onClick={() => navigate('/login')}>Sign in</button>
              </div>
            )}
          </main>
        </div>

        <div className={`toast-container ${toast.show ? 'is-visible' : ''}`}>
          <div className="toast-content">
            <IonIcon icon={toast.icon as any} />
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      </IonContent>
      <BottomTabs />
    </IonPage>
  );
};

export default Favorites;
