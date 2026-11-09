import { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  Search,
  SlidersHorizontal,
  Bell,
  MapPin,
  Heart,
  Star,
  Compass,
  UserRound,
  Waves,
  Umbrella,
  Trees,
  ArrowRight,
  Sailboat,
  Coffee,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import BottomTabs from '../components/BottomTabs';
import './UserDashboard.css';
import './UserDashboard.overrides.css';

const LOGO_PATH = '/assets/mindoro-scape-logo.png';

type Resort = {
  id: string;
  name: string;
  location: string;
  price: number;
  priceUnit: string;
  rating: string;
  reviews: number;
  category: string;
  resortType?: string;
  image: string;
  imageGallery: string[];
  municipality: string;
  badge: string;
  amenity: string;
  rateAmenities: string[];
  pricingOptions: Array<{ unit: string; price: number; guestCapacity?: number; label?: string; includedAmenities: string[] }>;
  guestCapacity?: number;
};

type PackageDocument = {
  name?: string;
  resortType?: string;
  category?: string;
  resortName?: string;
  resortLocation?: string;
  locationLabel?: string;
  address?: string;
  price?: number;
  priceUnit?: 'night' | 'day' | 'hour';
  pricingOptions?: Array<{
    unit: string;
    price: number;
    includedHours?: number;
    durationHours?: number;
    minimumHours?: number;
    guestCapacity?: number;
    label?: string;
    includedAmenities?: string[];
  }>;
  amenities?: string[];
  description?: string;
  imageUrl?: unknown;
  imageUrls?: unknown;
  photos?: unknown;
  images?: unknown;
  gallery?: unknown;
  coverImage?: unknown;
  availability?: 'available' | 'unavailable';
  status?: string;
};

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1000&q=85';

const collectPackageImages = (value: unknown): string[] => {
  if (typeof value === 'string') {
    const item = value.trim();
    if (!item) return [];

    if (item.startsWith('[') && item.endsWith(']')) {
      try {
        const parsed: unknown = JSON.parse(item);
        if (Array.isArray(parsed)) return parsed.flatMap(collectPackageImages);
      } catch {
        // A regular URL or data URL is handled below.
      }
    }

    return [item];
  }

  if (Array.isArray(value)) return value.flatMap(collectPackageImages);

  if (value && typeof value === 'object') {
    const image = value as Record<string, unknown>;
    const direct =
      image.url ??
      image.src ??
      image.downloadURL ??
      image.downloadUrl ??
      image.secure_url ??
      image.fileUrl ??
      image.dataUrl;

    if (typeof direct === 'string' && direct.trim()) {
      return collectPackageImages(direct);
    }

    if (typeof image.base64 === 'string' && image.base64.trim()) {
      const raw = image.base64.trim();
      return [raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`];
    }
  }

  return [];
};

const getMunicipalityName = (data: PackageDocument): string => {
  const sources = [data.resortLocation, data.locationLabel, data.address]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const ignored = /^(oriental mindoro|mimaropa|philippines|mindoro|region iv-b)$/i;

  for (const source of sources) {
    const parts = source
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) =>
        !ignored.test(part) &&
        !/^\d{4,6}$/.test(part) &&
        !/^barangay\s+/i.test(part)
      );

    if (parts.length > 0) return parts[0];
  }

  return '';
};

const getPackageCardData = (id: string, data: PackageDocument): Resort => {
  const validRates = Array.isArray(data.pricingOptions)
    ? data.pricingOptions.filter(
        (rate) =>
          rate &&
          Number.isFinite(Number(rate.price)) &&
          Number(rate.price) > 0
      )
    : [];

  const lowestRate = [...validRates].sort(
    (a, b) => Number(a.price) - Number(b.price)
  )[0];

  const price = lowestRate ? Number(lowestRate.price) : Number(data.price || 0);
  const priceUnit = lowestRate?.unit || data.priceUnit || 'night';
  const amenities = Array.isArray(data.amenities)
    ? data.amenities.filter(Boolean)
    : [];

  const searchableText = [
    data.name,
    data.resortName,
    data.description,
    ...amenities,
  ].filter(Boolean).join(' ').toLowerCase();

  const rawType = String(data.resortType || data.category || '').trim().toLowerCase();
  const categoryMap: Record<string, string> = {
    'private resort': 'Private Resorts',
    'private resorts': 'Private Resorts',
    'public resort': 'Public Resorts',
    'public resorts': 'Public Resorts',
    'beach resort': 'Beach Resorts',
    'beach resorts': 'Beach Resorts',
    'nature resort': 'Nature Resorts',
    'nature resorts': 'Nature Resorts',
    'family resort': 'Family Resorts',
    'family resorts': 'Family Resorts',
  };

  let category = categoryMap[rawType] || '';
  if (!category) {
    if (
      searchableText.includes('nature') ||
      searchableText.includes('forest') ||
      searchableText.includes('garden')
    ) {
      category = 'Nature Resorts';
    } else if (searchableText.includes('family')) {
      category = 'Family Resorts';
    } else if (searchableText.includes('private')) {
      category = 'Private Resorts';
    } else {
      category = 'Beach Resorts';
    }
  }

  const imageGallery = [
    ...collectPackageImages(data.imageUrls),
    ...collectPackageImages(data.photos),
    ...collectPackageImages(data.images),
    ...collectPackageImages(data.gallery),
    ...collectPackageImages(data.imageUrl),
    ...collectPackageImages(data.coverImage),
  ].filter((image, index, all) => all.indexOf(image) === index);

  const location =
    data.locationLabel?.trim() ||
    data.resortLocation?.trim() ||
    data.address?.trim() ||
    'Oriental Mindoro';

  return {
    id,
    name: data.name?.trim() || data.resortName?.trim() || 'Resort accommodation',
    location,
    municipality: getMunicipalityName(data),
    price: Number.isFinite(price) ? price : 0,
    priceUnit,
    rating: 'New',
    reviews: 0,
    category,
    resortType: data.resortType || data.category || category,
    image: imageGallery[0] || FALLBACK_IMAGE,
    imageGallery: imageGallery.length ? imageGallery : [FALLBACK_IMAGE],
    badge: category.toUpperCase(),
    amenity: [
      ...amenities,
      data.description || '',
    ].filter(Boolean).join(' · ') || 'Explore this accommodation',
    guestCapacity: lowestRate?.guestCapacity,
    rateAmenities: Array.isArray(lowestRate?.includedAmenities)
      ? lowestRate.includedAmenities.filter(Boolean)
      : [],
    pricingOptions: validRates.map((rate) => ({
      ...rate,
      price: Number(rate.price),
      includedAmenities: Array.isArray(rate.includedAmenities)
        ? rate.includedAmenities.filter(Boolean)
        : [],
    })),
  };
};
const categories = [
  { name: 'Private Resorts', icon: Waves },
  { name: 'Public Resorts', icon: Umbrella },
  { name: 'Beach Resorts', icon: Umbrella },
  { name: 'Nature Resorts', icon: Trees },
  { name: 'Family Resorts', icon: Coffee },
];

const formatPrice = (price: number) =>
  `₱${price.toLocaleString('en-PH')}`;

const UserDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [userName, setUserName] = useState('Explorer');
  const [userEmail, setUserEmail] = useState('');
  const [userLoading, setUserLoading] = useState(true);
  const [resorts, setResorts] = useState<Resort[]>([]);
  const [resortsLoading, setResortsLoading] = useState(true);
  const [resortsError, setResortsError] = useState('');

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] =
    useState('All Resorts');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteBusyIds, setFavoriteBusyIds] = useState<string[]>([]);
  const [favoriteMessage, setFavoriteMessage] = useState('');
  const [resortPhotoIndexes, setResortPhotoIndexes] = useState<Record<string, number>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [maxPrice, setMaxPrice] = useState('15000');
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    let isActive = true;
    let unsubscribePackages: (() => void) | undefined;
    let unsubscribeFavorites: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubscribePackages?.();
      unsubscribePackages = undefined;
      unsubscribeFavorites?.();
      unsubscribeFavorites = undefined;

      if (!user) {
        if (isActive) {
          setUserLoading(false);
          setResortsLoading(false);
          setFavorites([]);
        }
        navigate('/login', { replace: true });
        return;
      }

      setUserEmail(user.email ?? '');
      const authName = user.displayName?.trim();
      const emailName = user.email?.split('@')[0];
      setUserName(authName || emailName || 'Explorer');
      setUserLoading(true);
      setResortsLoading(true);
      setResortsError('');

      // Keep the heart state in sync with the Favorites tab through Firestore.
      const userFavoritesQuery = query(
        collection(db, 'userFavorites'),
        where('userId', '==', user.uid)
      );
      unsubscribeFavorites = onSnapshot(
        userFavoritesQuery,
        (favoriteSnapshot) => {
          if (!isActive) return;
          setFavorites(
            favoriteSnapshot.docs
              .map((favoriteDoc) => {
                const favoriteData = favoriteDoc.data();
                return String(
                  favoriteData.resortId ||
                  favoriteData.packageId ||
                  favoriteData.accommodationId ||
                  favoriteDoc.id
                );
              })
              .filter(Boolean)
          );
        },
        (favoriteError) => {
          console.error('Unable to sync favorites:', favoriteError);
          if (isActive) {
            setFavoriteMessage('Unable to sync favorites. Please check your connection and Firestore permissions.');
          }
        }
      );

      getDoc(doc(db, 'users', user.uid))
        .then((profileSnapshot) => {
          if (!isActive || !profileSnapshot.exists()) return;
          const profile = profileSnapshot.data();
          const fullName =
            typeof profile.fullName === 'string' ? profile.fullName.trim() : '';
          if (fullName) setUserName(fullName);
        })
        .catch((error) => {
          console.error('Unable to load user profile:', error);
        })
        .finally(() => {
          if (isActive) setUserLoading(false);
        });

      // Live connection to listings created by OwnerDashboard.
      const publishedPackagesQuery = query(
        collection(db, 'packages'),
        where('status', '==', 'published')
      );

      unsubscribePackages = onSnapshot(
        publishedPackagesQuery,
        (snapshot) => {
          if (!isActive) return;

          const liveListings = snapshot.docs
            .filter((packageDoc) => {
              const data = packageDoc.data() as PackageDocument;
              return data.availability !== 'unavailable';
            })
            .map((packageDoc) =>
              getPackageCardData(
                packageDoc.id,
                packageDoc.data() as PackageDocument
              )
            );

          setResorts(liveListings);
          setResortsLoading(false);
          setResortsError('');
        },
        (error) => {
          console.error('Unable to load published resort accommodations:', error);
          if (!isActive) return;
          setResorts([]);
          setResortsLoading(false);
          setResortsError(
            'Unable to load resort listings. Please check your internet connection and try again.'
          );
        }
      );
    });

    return () => {
      isActive = false;
      unsubscribeAuth();
      unsubscribePackages?.();
      unsubscribeFavorites?.();
    };
  }, [navigate]);

  const filteredResorts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return resorts.filter((resort) => {
      const matchesCategory =
        activeCategory === 'All Resorts' ||
        resort.category === activeCategory;

      const matchesSearch =
        !query ||
        resort.name.toLowerCase().includes(query) ||
        resort.location.toLowerCase().includes(query) ||
        resort.amenity.toLowerCase().includes(query);

      const matchesPrice = resort.price <= Number(maxPrice || 0);

      return matchesCategory && matchesSearch && matchesPrice;
    });
  }, [resorts, search, activeCategory, maxPrice]);

  const municipalities = useMemo(() => {
    const grouped = new Map<string, { name: string; stays: number; image: string }>();

    resorts.forEach((resort) => {
      const municipality = resort.municipality.trim();
      if (!municipality) return;

      const existing = grouped.get(municipality);
      if (existing) {
        existing.stays += 1;
      } else {
        grouped.set(municipality, {
          name: municipality,
          stays: 1,
          image: resort.imageGallery[0] || resort.image || FALLBACK_IMAGE,
        });
      }
    });

    return Array.from(grouped.values()).sort(
      (a, b) => b.stays - a.stays || a.name.localeCompare(b.name)
    );
  }, [resorts]);

  const changeResortPhoto = (resortId: string, direction: -1 | 1, imageCount: number) => {
    if (imageCount <= 1) return;

    setResortPhotoIndexes((current) => {
      const currentIndex = current[resortId] || 0;
      const nextIndex = (currentIndex + direction + imageCount) % imageCount;
      return { ...current, [resortId]: nextIndex };
    });
  };

  const toggleFavorite = async (resort: Resort) => {
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) {
      setFavoriteMessage('Please sign in to save accommodations to your favorites.');
      return;
    }

    const id = resort.id;
    if (favoriteBusyIds.includes(id)) return;

    const favoriteRef = doc(db, 'userFavorites', `${currentUser.uid}_${id}`);
    const alreadySaved = favorites.includes(id);

    setFavoriteBusyIds((current) => [...current, id]);
    setFavoriteMessage('');

    try {
      if (alreadySaved) {
        await deleteDoc(favoriteRef);
        setFavoriteMessage('Removed from your favorites.');
      } else {
        await setDoc(favoriteRef, {
          userId: currentUser.uid,
          resortId: id,
          packageId: id,
          resortName: resort.name,
          accommodationName: resort.name,
          resortLocation: resort.municipality || resort.location,
          location: resort.location,
          imageUrl: resort.image,
          imageUrls: resort.imageGallery,
          price: resort.price,
          priceUnit: resort.priceUnit,
          category: resort.category,
          source: 'available-accommodations',
          savedAt: serverTimestamp(),
        });
        setFavoriteMessage('Added to your favorites.');
      }
      // The onSnapshot listener above updates the heart and Favorites tab.
    } catch (favoriteError) {
      console.error('Unable to update favorite:', favoriteError);
      setFavoriteMessage('Could not update favorites. Please try again.');
    } finally {
      setFavoriteBusyIds((current) => current.filter((favoriteId) => favoriteId !== id));
    }
  };

  const goToExplore = () => {
    navigate('/user/explore');
  };

  const goToLocation = (location: string) => {
    setSearch(location);
    setActiveCategory('All Resorts');

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <IonPage>
      <IonContent
        fullscreen
        className="user-dashboard-content"
        scrollY
      >
        <div className="dashboard-shell">
          <header className="dashboard-header">
            <button
              type="button"
              className="dashboard-brand"
              onClick={() => navigate('/user/dashboard')}
              aria-label="MINDORO SCAPE home"
            >
              <img src={LOGO_PATH} alt="" />

              <span className="dashboard-brand-copy">
                <strong>Mindoro Scape</strong>
                <small>
                  <MapPin size={13} />
                  ORIENTAL MINDORO
                </small>
              </span>
            </button>

            <div className="dashboard-header-actions">
              <button
                type="button"
                className="dashboard-icon-button notification-trigger"
                aria-label="Notifications"
                onClick={() =>
                  setShowNotifications((value) => !value)
                }
              >
                <Bell size={21} />
                <span className="notification-dot" />
              </button>

              <button
                type="button"
                className="dashboard-profile-button"
                aria-label="Open profile"
                onClick={() => navigate('/user/profile')}
              >
                <UserRound size={20} />
              </button>
            </div>
          </header>

          {showNotifications && (
            <div className="dashboard-notification-panel">
              <div className="dashboard-notification-heading">
                <strong>Notifications</strong>
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  aria-label="Close notifications"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="dashboard-notification-empty">
                <Bell size={24} />
                <p>You’re all caught up!</p>
                <span>
                  New booking and account updates will appear here.
                </span>
              </div>
            </div>
          )}

          <main className="dashboard-main">
            <section className="dashboard-welcome">
              <div>
                <p className="dashboard-eyebrow">
                  YOUR ISLAND ADVENTURE
                </p>

                <h1>
                  Mabuhay, {userName.split(' ')[0]}! <span></span>
                </h1>

                <p className="dashboard-welcome-description">
                  {userLoading
                    ? 'Loading your account...'
                    : 'Where would you like to escape in Oriental Mindoro?'}
                </p>
              </div>
            </section>

            <section
              className="dashboard-search-section"
              aria-label="Search resorts"
            >
              <form
                className="dashboard-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  goToExplore();
                }}
              >
                <Search size={21} />

                <input
                  type="search"
                  placeholder="Search resorts, coves, destinations..."
                  aria-label="Search resorts and destinations"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                {search && (
                  <button
                    type="button"
                    className="dashboard-clear-search"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                  >
                    <X size={17} />
                  </button>
                )}
              </form>

              <button
                type="button"
                className={`dashboard-filter-button ${
                  showFilters ? 'is-active' : ''
                }`}
                aria-label="Open price filters"
                onClick={() => setShowFilters((value) => !value)}
              >
                <SlidersHorizontal size={21} />
              </button>
            </section>

            {showFilters && (
              <section className="dashboard-filter-panel">
                <label htmlFor="dashboard-max-price">
                  Maximum nightly budget
                </label>

                <select
                  id="dashboard-max-price"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                >
                  <option value="3000">Up to ₱3,000</option>
                  <option value="5000">Up to ₱5,000</option>
                  <option value="8000">Up to ₱8,000</option>
                  <option value="15000">
                    Any price up to ₱15,000
                  </option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setMaxPrice('15000');
                    setActiveCategory('All Resorts');
                  }}
                >
                  Reset filters
                </button>
              </section>
            )}

            <section className="dashboard-categories">
              <button
                type="button"
                className={`dashboard-category ${
                  activeCategory === 'All Resorts' ? 'active' : ''
                }`}
                onClick={() => setActiveCategory('All Resorts')}
              >
                <Compass size={17} />
                All Resorts
              </button>

              {categories.map(({ name, icon: CategoryIcon }) => (
                <button
                  type="button"
                  key={name}
                  className={`dashboard-category ${
                    activeCategory === name ? 'active' : ''
                  }`}
                  onClick={() => setActiveCategory(name)}
                >
                  <CategoryIcon size={17} />
                  {name}
                </button>
              ))}
            </section>

            <section className="dashboard-section">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Featured Escapes</h2>
                  <p>
                    Live accommodations published by resort owners
                  </p>
                </div>

                <button
                  type="button"
                  className="dashboard-see-all"
                  onClick={goToExplore}
                >
                  See All <ArrowRight size={16} />
                </button>
              </div>

              {resortsLoading ? (
                <div className="dashboard-empty-state">
                  <p>Loading available accommodations...</p>
                </div>
              ) : resortsError ? (
                <div className="dashboard-empty-state">
                  <p>{resortsError}</p>
                </div>
              ) : filteredResorts.length > 0 ? (
                <div className="dashboard-resort-grid">
                  {filteredResorts.map((resort) => {
                    const isFavorite = favorites.includes(resort.id);

                    return (
                      <article
                        className="dashboard-resort-card"
                        key={resort.id}
                      >
                        <div className="dashboard-resort-image-wrap">
                          <img
                            className="dashboard-resort-image"
                            src={resort.imageGallery[
                              (resortPhotoIndexes[resort.id] || 0) % resort.imageGallery.length
                            ] || resort.image}
                            alt={`${resort.name} photo ${(resortPhotoIndexes[resort.id] || 0) + 1}`}
                            loading="lazy"
                          />

                          {resort.imageGallery.length > 1 && (
                            <div className="dashboard-photo-controls" aria-label={`${resort.name} photos`}>
                              <button
                                type="button"
                                className="dashboard-photo-arrow"
                                aria-label="Previous resort photo"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  changeResortPhoto(resort.id, -1, resort.imageGallery.length);
                                }}
                              >
                                <ChevronLeft size={17} />
                              </button>
                              <span className="dashboard-photo-count">
                                {(resortPhotoIndexes[resort.id] || 0) + 1}/{resort.imageGallery.length}
                              </span>
                              <button
                                type="button"
                                className="dashboard-photo-arrow"
                                aria-label="Next resort photo"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  changeResortPhoto(resort.id, 1, resort.imageGallery.length);
                                }}
                              >
                                <ChevronRight size={17} />
                              </button>
                            </div>
                          )}

                          <span className="dashboard-resort-badge">
                            <Waves size={12} />
                            {resort.badge}
                          </span>

                          <button
                            type="button"
                            className={`dashboard-favorite-button ${
                              isFavorite ? 'is-favorite' : ''
                            }`}
                            aria-label={
                              isFavorite
                                ? `Remove ${resort.name} from favorites`
                                : `Add ${resort.name} to favorites`
                            }
                            aria-pressed={isFavorite}
                            onClick={() => void toggleFavorite(resort)}
                            disabled={favoriteBusyIds.includes(resort.id)}
                          >
                            <Heart
                              size={19}
                              fill={
                                isFavorite ? 'currentColor' : 'none'
                              }
                            />
                          </button>

                          <span className="dashboard-resort-location">
                            <MapPin size={14} />
                            {resort.location}
                          </span>
                        </div>

                        <div className="dashboard-resort-info">
                          <div className="dashboard-resort-title-row">
                            <h3>{resort.name}</h3>

                            <span className="dashboard-rating">
                              <Star
                                size={15}
                                fill="currentColor"
                              />
                              {resort.rating}
                              <small>({resort.reviews})</small>
                            </span>
                          </div>

                          <p className="dashboard-resort-amenity">
                            {resort.amenity}
                          </p>
                          {resort.guestCapacity && (
                            <p className="dashboard-resort-amenity">Up to {resort.guestCapacity} guests</p>
                          )}
                          {resort.pricingOptions.length > 0 && (
                            <div className="dashboard-rate-list" style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                              {resort.pricingOptions.map((rate, rateIndex) => (
                                <div key={`${resort.id}-rate-${rateIndex}`} className="dashboard-rate-item" style={{ padding: '9px 10px', borderRadius: 10, background: '#f6f9fc', border: '1px solid #e5edf4' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                    <strong style={{ fontSize: 12, color: '#12384f' }}>{rate.label || `Rate ${rateIndex + 1}`} · {rate.unit}</strong>
                                    <strong style={{ fontSize: 13, color: '#006685' }}>₱{rate.price.toLocaleString('en-PH')}</strong>
                                  </div>
                                  {rate.guestCapacity && <small style={{ display: 'block', marginTop: 3 }}>Up to {rate.guestCapacity} guests</small>}
                                  <div style={{ display: 'block', marginTop: 5, color: '#526779', fontSize: 11, lineHeight: 1.55, whiteSpace: 'normal' }}>
                                    {rate.includedAmenities.length > 0 ? (
                                      <><strong style={{ color: '#24465b' }}>Included in this rate:</strong> {rate.includedAmenities.join(' · ')}</>
                                    ) : (
                                      <span style={{ color: '#81909c', fontStyle: 'italic' }}>No included amenities specified for this rate.</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="dashboard-resort-bottom">
                            <p>
                              <strong>
                                {formatPrice(resort.price)}
                              </strong>
                              <span> / {resort.priceUnit}</span>
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/user/resort/${encodeURIComponent(resort.id)}` // ✅ INayos ang route papuntang details
                                )
                              }
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="dashboard-empty-state">
                  <Search size={28} />
                  <h3>No matching resorts found</h3>
                  <p>
                    Try another search term, category, or budget.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setActiveCategory('All Resorts');
                      setMaxPrice('15000');
                    }}
                  >
                    Clear search and filters
                  </button>
                </div>
              )}
            </section>

            <section className="dashboard-promo">
              <div className="dashboard-promo-content">
                <span className="dashboard-promo-label">
                  <Sailboat size={14} />
                  YOUR NEXT GETAWAY
                </span>

                <h2>Make room for island time.</h2>

                <p>
                  Discover peaceful beaches, tropical views, and
                  memorable resort stays across Oriental Mindoro.
                </p>

                <button type="button" onClick={goToExplore}>
                  Explore Resorts <ArrowRight size={17} />
                </button>
              </div>

              <div
                className="dashboard-promo-art"
                aria-hidden="true"
              >
                <Sailboat size={96} strokeWidth={1.1} />
              </div>
            </section>

            <section className="dashboard-section dashboard-destinations">
              <div className="dashboard-section-heading">
                <div>
                  <h2>Explore Municipalities</h2>
                  <p>Find your next favorite destination</p>
                </div>

                <button
                  type="button"
                  className="dashboard-see-all"
                  onClick={goToExplore}
                >
                  Explore All <ArrowRight size={16} />
                </button>
              </div>

              {resortsLoading ? (
                <div className="dashboard-empty-state">
                  <p>Loading destinations from published resort listings...</p>
                </div>
              ) : municipalities.length > 0 ? (
                <div className="dashboard-destination-grid">
                  {municipalities.map((destination) => (
                    <button
                      type="button"
                      className="dashboard-destination-card"
                      key={destination.name}
                      onClick={() => goToLocation(destination.name)}
                    >
                      <div className="dashboard-destination-image-wrap">
                        <img
                          src={destination.image}
                          alt={`${destination.name} destination`}
                          loading="lazy"
                        />
                        <span className="dashboard-stay-count">
                          {destination.stays} {destination.stays === 1 ? 'stay' : 'stays'}
                        </span>
                      </div>

                      <div className="dashboard-destination-info">
                        <h3>{destination.name}</h3>
                        <p>Explore available accommodations</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dashboard-empty-state">
                  <MapPin size={26} />
                  <h3>No destinations yet</h3>
                  <p>Municipalities will appear here when resort owners publish accommodations with a location.</p>
                </div>
              )}
            </section>



            <footer className="dashboard-footer">
              <span>MINDORO SCAPE</span>
              <span>MADE FOR YOUR NEXT MINDORO ADVENTURE</span>
            </footer>
          </main>

          {favoriteMessage && (
            <div
              role="status"
              aria-live="polite"
              onClick={() => setFavoriteMessage('')}
              style={{
                position: 'fixed',
                left: '50%',
                bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                width: 'min(92vw, 420px)',
                padding: '13px 16px',
                borderRadius: 14,
                background: '#12384f',
                color: '#fff',
                boxShadow: '0 10px 30px rgba(12, 38, 55, .22)',
                fontSize: 13,
                fontWeight: 650,
                textAlign: 'center',
                cursor: 'pointer'
              }}
            >
              {favoriteMessage}
            </div>
          )}
        </div>
      </IonContent>
      
      {/* ✅ Pinalitan ang custom nav ng iyong central BottomTabs component */}
      <BottomTabs />
      
    </IonPage>
  );
};

export default UserDashboard;