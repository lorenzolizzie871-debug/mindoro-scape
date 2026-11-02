import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IonContent, IonFooter, IonPage, IonSpinner } from '@ionic/react';
import {
  ArrowLeft, BadgeCheck, CalendarDays, Camera, ChevronDown, MapPin, Share2,
  UserRound, Users, Waves, Wifi, Car, Coffee, UtensilsCrossed, Wind,
  TreePine, Fish, Sailboat, Flower2, Sunrise, Building2, Fan, Headset,
  Wine, Umbrella, LocateFixed, Footprints, Bike, Navigation, Clock, ExternalLink
} from 'lucide-react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import './ResortDetail.css';

type PricingOption = {
  id?: string;
  unit: string;
  price: number;
  includedHours?: number;
  durationHours?: number;
  minimumHours?: number;
  guestCapacity?: number;
  label?: string;
  includedAmenities?: string[] | string;
  additionalServices?: {
    id?: string;
    name: string;
    price: number;
    unit: 'fixed' | 'per_person' | 'per_hour';
    included: boolean;
  }[];
};
type ResortDocument = {
  id: string;
  ownerId?: string;
  name?: string;
  resortName?: string;
  resortType?: string;
  category?: string;
  resortLocation?: string;
  locationLabel?: string;
  address?: string;
  description?: string;
  amenities?: string[];
  imageUrl?: string;
  imageUrls?: unknown;
  photos?: unknown;
  images?: unknown;
  gallery?: unknown;
  coverImage?: string;
  price?: number;
  priceUnit?: string;
  pricingOptions?: PricingOption[];
  latitude?: number;
  longitude?: number;
  availability?: string;
  childFreeUnderAge?: number | null;
  status?: string;
  // Legacy listing-level services from older Owner Dashboard versions.
  addOns?: {
    id?: string;
    name: string;
    price: number;
    unit: 'fixed' | 'per_person' | 'per_hour';
    included: boolean;
  }[];
};
type OwnerProfile = {
  resortName?: string;
  resortLocation?: string;
  fullName?: string;
};
type Coordinates = { latitude: number; longitude: number };
type TravelMode = 'walking' | 'transit' | 'driving';

const LOGO_PATH = '/assets/mindoro-scape-logo.png';
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=85';

const formatPrice = (value: unknown) => {
  const amount = Number(value);
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-PH')}`;
};
const formatUnit = (unit?: string) => {
  const labels: Record<string, string> = {
    night: 'per night', day: 'per day', hour: 'per hour',
    person: 'per person', cottage: 'per cottage', package: 'per package',
    fixed: 'one-time fee',
  };
  return unit ? labels[unit] || `per ${unit}` : 'per package';
};
const rateTitle = (rate: PricingOption, index: number) =>
  rate.label?.trim() || ({
    night: 'Overnight rate', day: 'Day rate', hour: 'Hourly rate',
    person: 'Per-person rate', cottage: 'Cottage rate',
    package: 'Package rate', fixed: 'Fixed rate',
  }[rate.unit] || `Rate ${index + 1}`);

const amenityIcon = (label: string) => {
  const value = label.toLowerCase();
  if (value.includes('pool') || value.includes('swim')) return <Waves size={18} />;
  if (value.includes('wifi') || value.includes('internet')) return <Wifi size={18} />;
  if (value.includes('parking')) return <Car size={18} />;
  if (value.includes('breakfast') || value.includes('coffee')) return <Coffee size={18} />;
  if (value.includes('food') || value.includes('dining') || value.includes('kitchen')) return <UtensilsCrossed size={18} />;
  if (value.includes('aircon') || value.includes('air condition')) return <Wind size={18} />;
  if (value.includes('tree') || value.includes('garden') || value.includes('nature')) return <TreePine size={18} />;
  if (value.includes('beach') || value.includes('sea')) return <Umbrella size={18} />;
  if (value.includes('boat')) return <Sailboat size={18} />;
  if (value.includes('dive') || value.includes('snorkel')) return <Fish size={18} />;
  if (value.includes('spa')) return <Flower2 size={18} />;
  if (value.includes('fan')) return <Fan size={18} />;
  if (value.includes('tour')) return <Headset size={18} />;
  if (value.includes('bar')) return <Wine size={18} />;
  return <Sunrise size={18} />;
};
const distanceKm = (a: Coordinates, b: Coordinates) => {
  const rad = (n: number) => n * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) *
    Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const formatDuration = (hours: number) => {
  const mins = Math.max(1, Math.round(hours * 60));
  if (mins < 60) return `about ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `about ${h} hr ${m} min` : `about ${h} hr`;
};

const ResortDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [resort, setResort] = useState<ResortDocument | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [selectedRateIndex, setSelectedRateIndex] = useState(0);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState('');
  const [locating, setLocating] = useState(false);
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');

  useEffect(() => {
    if (!id) {
      setLoadError('The resort link is missing its listing ID.');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const listingRef = doc(db, 'packages', decodeURIComponent(id));
    const unsubscribe = onSnapshot(listingRef, (snapshot) => {
      if (!active) return;
      if (!snapshot.exists()) {
        setResort(null);
        setLoadError('This accommodation may have been removed or is no longer available.');
      } else {
        const data = snapshot.data() as Omit<ResortDocument, 'id'>;
        if (data.status && data.status !== 'published') {
          setResort(null);
          setLoadError('This accommodation has not been published by the resort owner.');
        } else {
          setResort({ ...data, id: snapshot.id });
          setPhotoIndex(0);
          setLoadError('');
        }
      }
      setLoading(false);
    }, (error) => {
      console.error('Unable to load resort details:', error);
      if (!active) return;
      setLoadError(error.code === 'permission-denied'
        ? 'You do not have permission to view this listing. Please check Firestore rules.'
        : 'We could not load this accommodation. Please check your connection and try again.');
      setResort(null);
      setLoading(false);
    });
    return () => { active = false; unsubscribe(); };
  }, [id]);

  // The resort's public brand name belongs to the owner profile (users/{ownerId}),
  // while packages/{listingId}.name is only the accommodation/package title.
  // Prefer the live owner profile, then the copied resortName on the listing.
  useEffect(() => {
    const ownerId = resort?.ownerId;
    if (!ownerId) {
      setOwnerProfile(null);
      return;
    }

    let active = true;
    getDoc(doc(db, 'users', ownerId))
      .then((snapshot) => {
        if (!active) return;
        setOwnerProfile(snapshot.exists() ? (snapshot.data() as OwnerProfile) : null);
      })
      .catch((error) => {
        console.warn('Unable to load resort owner profile:', error);
        if (active) setOwnerProfile(null);
      });

    return () => {
      active = false;
    };
  }, [resort?.ownerId]);

  const photos = useMemo(() => {
    if (!resort) return [FALLBACK_IMAGE];

    // imageUrls is the canonical gallery saved by OwnerDashboard.
    // imageUrl is only the cover-photo fallback and may duplicate imageUrls[0].
    const collectImages = (value: unknown): string[] => {
      if (typeof value === 'string') {
        const item = value.trim();
        if (!item) return [];

        // Support legacy JSON-stringified arrays.
        if (item.startsWith('[') && item.endsWith(']')) {
          try {
            const parsed: unknown = JSON.parse(item);
            if (Array.isArray(parsed)) return parsed.flatMap(collectImages);
          } catch {
            // Keep a valid URL/data URL as a single image.
          }
        }

        return [item];
      }

      if (Array.isArray(value)) {
        return value.flatMap(collectImages);
      }

      if (value && typeof value === 'object') {
        const image = value as Record<string, unknown>;
        return collectImages(
          image.url ?? image.src ?? image.downloadURL ?? image.dataUrl ?? image.base64
        );
      }

      return [];
    };

    const galleryImages = [
      ...collectImages(resort.imageUrls),
      ...collectImages(resort.photos),
      ...collectImages(resort.images),
      ...collectImages(resort.gallery),
      ...collectImages(resort.imageUrl),
      ...collectImages(resort.coverImage),
    ];

    // Remove only exact duplicates (e.g. imageUrl repeating imageUrls[0]),
    // while preserving the order of all distinct uploaded photos.
    const uniqueImages = galleryImages.filter(
      (image, index, all) => all.indexOf(image) === index
    );

    return uniqueImages.length > 0 ? uniqueImages : [FALLBACK_IMAGE];
  }, [resort]);

  const showPreviousPhoto = () => {
    setPhotoIndex((current) => (current - 1 + photos.length) % photos.length);
  };

  const showNextPhoto = () => {
    setPhotoIndex((current) => (current + 1) % photos.length);
  };

  const rates = useMemo<PricingOption[]>(() => {
    if (!resort) return [];

    const configured = Array.isArray(resort.pricingOptions)
      ? resort.pricingOptions.filter(
          (rate) => rate && Number.isFinite(Number(rate.price)) && Number(rate.price) > 0
        )
      : [];

    if (configured.length) {
      const legacyServices = Array.isArray(resort.addOns) ? resort.addOns : [];

      return configured.map((rate, index) => {
        const rateServices = Array.isArray(rate.additionalServices)
          ? rate.additionalServices.filter((service) => service && service.name?.trim())
          : [];

        // Older listings stored services at package level. Only apply that legacy
        // data automatically when there is exactly one rate; never duplicate it
        // across multiple rates because each rate must have its own services.
        const services = rateServices.length
          ? rateServices
          : configured.length === 1
            ? legacyServices.filter((service) => service && service.name?.trim())
            : [];

        return {
          ...rate,
          id: rate.id || `rate-${index}`,
          price: Number(rate.price),
          includedAmenities: Array.isArray(rate.includedAmenities)
            ? rate.includedAmenities.filter(
                (item): item is string => typeof item === 'string' && !!item.trim()
              )
            : typeof rate.includedAmenities === 'string'
              ? rate.includedAmenities
                  .split(',')
                  .map((item: string) => item.trim())
                  .filter((item: string) => item.length > 0)
              : [],
          additionalServices: services.map((service, serviceIndex) => ({
            ...service,
            id: service.id || `service-${index}-${serviceIndex}`,
            name: String(service.name || '').trim(),
            price: Number(service.price || 0),
            unit: service.unit || 'fixed',
            included: Boolean(service.included),
          })),
        };
      });
    }

    if (Number(resort.price) > 0) {
      return [{
        id: 'legacy-rate',
        unit: resort.priceUnit || 'night',
        price: Number(resort.price),
        guestCapacity: 0,
        includedAmenities: [],
        additionalServices: Array.isArray(resort.addOns)
          ? resort.addOns.filter((service) => service && service.name?.trim())
          : [],
      }];
    }

    return [];
  }, [resort]);

  useEffect(() => {
    if (rates.length === 0) {
      setSelectedRateIndex(0);
      return;
    }
    setSelectedRateIndex((current) => Math.min(current, rates.length - 1));
  }, [rates.length]);

  const selectedRate = rates[selectedRateIndex] || rates[0];

  useEffect(() => {
    if (!selectedRate) {
      setSelectedServiceIds([]);
      return;
    }
    const services = selectedRate.additionalServices || [];
    setSelectedServiceIds(
      services.filter(service => service.included).map((service, index) =>
        String(service.id || `service-${index}`)
      )
    );
  }, [selectedRateIndex, rates]);
  // Resort name = owner's registered resort/business name (e.g. "ResortKo").
  // Listing name = the specific villa, room, or package published by that resort.
  const resortName =
    ownerProfile?.resortName?.trim() ||
    resort?.resortName?.trim() ||
    'Resort';
  const accommodationName = resort?.name?.trim() || 'Accommodation';
  const address =
    resort?.locationLabel?.trim() ||
    ownerProfile?.resortLocation?.trim() ||
    resort?.resortLocation?.trim() ||
    resort?.address?.trim() ||
    'Location not provided';
  const resortType = resort?.resortType || resort?.category || 'Resort';
  const amenities = Array.isArray(resort?.amenities) ? resort.amenities.filter(Boolean) : [];
  const resortCoordinates = resort &&
    Number.isFinite(Number(resort.latitude)) &&
    Number.isFinite(Number(resort.longitude)) &&
    (Number(resort.latitude) !== 0 || Number(resort.longitude) !== 0)
    ? { latitude: Number(resort.latitude), longitude: Number(resort.longitude) }
    : null;

  const distance = currentLocation && resortCoordinates
    ? distanceKm(currentLocation, resortCoordinates)
    : null;
  // Straight-line distance is converted to a rough travel estimate, not a live road-route ETA.
  const roadFactor = travelMode === 'walking' ? 1.15 : 1.35;
  const averageSpeed = travelMode === 'walking' ? 4.5 : travelMode === 'transit' ? 22 : 30;
  const estimatedHours = distance === null ? null : (distance * roadFactor) / averageSpeed;
  const mapBounds = currentLocation && resortCoordinates ? {
    west: Math.min(currentLocation.longitude, resortCoordinates.longitude) - 0.015,
    east: Math.max(currentLocation.longitude, resortCoordinates.longitude) + 0.015,
    south: Math.min(currentLocation.latitude, resortCoordinates.latitude) - 0.015,
    north: Math.max(currentLocation.latitude, resortCoordinates.latitude) + 0.015,
  } : null;
  const mapSrc = resortCoordinates
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${mapBounds ? `${mapBounds.west}%2C${mapBounds.south}%2C${mapBounds.east}%2C${mapBounds.north}` : `${resortCoordinates.longitude - 0.01}%2C${resortCoordinates.latitude - 0.01}%2C${resortCoordinates.longitude + 0.01}%2C${resortCoordinates.latitude + 0.01}`}&layer=mapnik&marker=${resortCoordinates.latitude}%2C${resortCoordinates.longitude}`
    : '';
  const directionsUrl = resortCoordinates
    ? currentLocation
      ? `https://www.google.com/maps/dir/?api=1&origin=${currentLocation.latitude},${currentLocation.longitude}&destination=${resortCoordinates.latitude},${resortCoordinates.longitude}&travelmode=${travelMode === 'walking' ? 'walking' : 'driving'}`
      : `https://www.google.com/maps/dir/?api=1&destination=${resortCoordinates.latitude},${resortCoordinates.longitude}`
    : '';

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Your browser does not support location access.');
      return;
    }
    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      position => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
      },
      error => {
        setLocating(false);
        setLocationError(error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Enable location access in your browser settings and try again.'
          : 'Unable to get your location. Check your GPS or internet connection.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/user/dashboard', { replace: true });
  };
  const handleShare = async () => {
    if (!resort) return;
    try {
      if (navigator.share) await navigator.share({
        title: resortName,
        text: `Check out ${resortName} on Mindoro Scape`,
        url: window.location.href,
      });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        window.alert('Link copied!');
      }
    } catch { /* User cancelled sharing. */ }
  };
  const goToBooking = () => {
    if (!resort || !selectedRate || resort.availability === 'unavailable') return;

    // Pass ONE selected rate only. Reservation must not combine the other rates.
    const bookingRate = {
      ...selectedRate,
      price: Number(selectedRate.price),
      includedAmenities: [...(selectedRate.includedAmenities || [])],
      additionalServices: [...(selectedRate.additionalServices || [])],
    };

    navigate(`/user/reservation/${encodeURIComponent(resort.id)}?rate=${selectedRateIndex}`, {
      state: {
        resortId: resort.id,
        resortName,
        accommodationName,
        resortLocation: address,
        selectedRateIndex,
        selectedRateId: selectedRate.id || `rate-${selectedRateIndex}`,
        pricingOption: bookingRate,
        // Explicit selected-only fields for Reservation implementations that
        // prefer not to read the entire pricingOptions array.
        selectedPricingOption: bookingRate,
        selectedAdditionalServices: bookingRate.additionalServices,
        selectedAdditionalServiceIds: selectedServiceIds,
      },
    });
  };

  const header = (
    <header className="rd-header">
      <div className="rd-header-left">
        <button type="button" className="rd-icon-button" onClick={goBack} aria-label="Go back"><ArrowLeft size={22} /></button>
        <img className="rd-logo" src={LOGO_PATH} alt="Mindoro Scape" />
        <h1 className="rd-header-title">Resort Detail</h1>
      </div>
      <div className="rd-header-right">
        <button type="button" className="rd-icon-button rd-muted" onClick={handleShare} aria-label="Share"><Share2 size={20} /></button>
        <button type="button" className="rd-profile-button" onClick={() => navigate('/user/profile')} aria-label="Open profile"><UserRound size={18} /></button>
      </div>
    </header>
  );

  if (loading) return (
    <IonPage className="rd-page"><IonContent fullscreen className="rd-content">{header}
      <div className="rd-state"><IonSpinner name="crescent" /><h2>Loading resort details...</h2><p>Please wait while we get the latest listing.</p></div>
    </IonContent></IonPage>
  );
  if (!resort) return (
    <IonPage className="rd-page"><IonContent fullscreen className="rd-content">{header}
      <div className="rd-not-found"><MapPin size={34} /><h2>Resort not found</h2><p>{loadError || 'This resort may have been removed or the link is incorrect.'}</p>
        <button type="button" className="rd-primary-button" onClick={() => navigate('/user/dashboard', { replace: true })}>Back to Dashboard</button>
      </div>
    </IonContent></IonPage>
  );

  return (
    <IonPage className="rd-page">
      <IonContent fullscreen className="rd-content">
        <style>{`
          .rd-service-selectable {
            appearance: none; -webkit-appearance: none; width: 100%; text-align: left;
            display: flex; align-items: center; gap: 12px; cursor: pointer;
            border: 1px solid #eadfce; border-radius: 12px; background: #fff;
            padding: 13px 14px; color: inherit; font: inherit; transition: .18s ease;
            pointer-events: auto; position: relative; z-index: 1;
          }
          .rd-service-selectable + .rd-service-selectable { margin-top: 8px; }
          .rd-service-selectable.is-selected { border-color: #e99424; background: #fff7e9; box-shadow: 0 0 0 2px rgba(233,148,36,.12); }
          .rd-service-selectable .rd-service-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
          .rd-service-check { width: 25px; height: 25px; flex: 0 0 25px; border-radius: 50%; display: grid; place-items: center; background: #f4eee4; color: #8a5a18; font-weight: 800; }
          .rd-service-selectable.is-selected .rd-service-check { background: #ef9418; color: white; }
        `}</style>
        {header}
        <main className="rd-main">
          <section className="rd-gallery">
            <div className="rd-hero">
              <img className="rd-hero-image" src={photos[photoIndex] || FALLBACK_IMAGE}
                alt={`${resortName} photo ${photoIndex + 1}`}
                onError={(event) => {
                  const target = event.currentTarget;
                  if (target.src !== FALLBACK_IMAGE) target.src = FALLBACK_IMAGE;
                }}
              />
              <div className="rd-hero-scrim" />
              <div className="rd-hero-caption">
                <span className="rd-hero-kicker">DISCOVER ORIENTAL MINDORO</span>
                <h2>{resortName}</h2>
                <p><MapPin size={15} />{address}</p>
              </div>
              <div className="rd-verified-pill"><BadgeCheck size={16} /><span>Published Accommodation</span></div>
              <div className="rd-photo-counter">
                <Camera size={15} />
                <span>{photoIndex + 1} / {photos.length} PHOTOS</span>
              </div>
              {photos.length > 1 && (
                <div className="rd-photo-controls">
                  <button type="button" onClick={showPreviousPhoto} aria-label="Previous photo">‹</button>
                  <button type="button" onClick={showNextPhoto} aria-label="Next photo">›</button>
                </div>
              )}
            </div>
            {photos.length > 1 && (
              <div className="rd-gallery-strip" aria-label="Resort photo gallery">
                <div className="rd-gallery-strip-heading">
                  <strong>Photos</strong>
                  <span>{photos.length} uploaded photos</span>
                </div>
                <div className="rd-thumbs">
                  {photos.map((photo, index) => (
                    <button
                      type="button"
                      key={`resort-photo-${index}`}
                      className={`rd-thumb ${index === photoIndex ? 'active' : ''}`}
                      onClick={() => setPhotoIndex(index)}
                      aria-label={`Show photo ${index + 1}`}
                      aria-pressed={index === photoIndex}
                    >
                      <img
                        src={photo}
                        alt={`${resortName} thumbnail ${index + 1}`}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.parentElement?.classList.add('rd-thumb-error');
                        }}
                      />
                      <span>{index + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rd-section rd-title-section">
            <div className="rd-title-row"><span className="rd-eyebrow">{resortType}</span>
              <span className={`rd-live-status ${resort.availability === 'unavailable' ? 'is-unavailable' : ''}`}>{resort.availability === 'unavailable' ? 'Unavailable' : 'Available'}</span>
            </div>
            <h2 className="rd-resort-name">{resortName}</h2>
            {accommodationName && accommodationName !== resortName && (
              <p className="rd-accommodation-name">
                <Building2 size={15} />
                <span>{accommodationName}</span>
              </p>
            )}
            <div className="rd-address"><MapPin size={18} /><span>{address}</span>
              {resortCoordinates && <a href={`https://www.google.com/maps?q=${resortCoordinates.latitude},${resortCoordinates.longitude}`} target="_blank" rel="noreferrer">Map <ExternalLink size={13} /></a>}
            </div>
          </section>

          <section className="rd-section rd-facts">
            <div className="rd-fact"><span className="rd-fact-icon"><Building2 size={22} /></span><div><small>Resort Type</small><strong>{resortType}</strong></div></div>
            <div className="rd-fact"><span className="rd-fact-icon"><Users size={22} /></span><div><small>Guest Capacity</small><strong>{selectedRate?.guestCapacity ? `Up to ${selectedRate.guestCapacity} persons` : 'Not specified by owner'}</strong></div></div>
          </section>

          <section className="rd-section">
            <div className="rd-section-heading"><h3>About this Resort</h3><span className="rd-tag">Owner Listing</span></div>
            <div className="rd-card rd-about-card">
              <p className={aboutExpanded ? '' : 'rd-clamp'}>{resort.description?.trim() || 'The resort owner has not added a description yet.'}</p>
              {(resort.description?.length || 0) > 160 && <button type="button" className="rd-read-more" onClick={() => setAboutExpanded(v => !v)}><span>{aboutExpanded ? 'Show Less' : 'Read More'}</span><ChevronDown size={16} className={aboutExpanded ? 'rd-flip' : ''} /></button>}
            </div>
          </section>


          <section className="rd-section">
            <div className="rd-section-heading"><h3>Children Policy</h3></div>
            <div className="rd-card rd-about-card">
              {typeof resort.childFreeUnderAge === 'number' && resort.childFreeUnderAge > 0
                ? <p>Children under {resort.childFreeUnderAge} years old are free of charge.</p>
                : <p>No free-child age policy has been specified by the resort owner. Please confirm the child rate with the owner.</p>}
            </div>
          </section>

          <section className="rd-section">
            <div className="rd-section-heading"><h3>Choose Your Rate</h3><span className="rd-muted-text">Select one option for your booking</span></div>
            {rates.length ? <div className="rd-room-list">{rates.map((rate, index) => {
              const active = index === selectedRateIndex;
              // Normalize legacy comma-separated strings and arrays before rendering.
              const included: string[] = Array.isArray(rate.includedAmenities)
                ? rate.includedAmenities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
                : typeof rate.includedAmenities === 'string'
                  ? rate.includedAmenities.split(',').map((item: string) => item.trim()).filter((item: string) => item.length > 0)
                  : [];
              return (
                <article className={`rd-card rd-room ${active ? 'selected' : ''}`} key={`${rate.unit}-${index}`}>
                  <div className="rd-room-info">
                    <div className="rd-room-title-row"><h4>{rateTitle(rate, index)}</h4><span className="rd-tag">{formatUnit(rate.unit)}</span></div>
                    <div className="rd-rate-details">
                      {rate.includedHours ? <span>{rate.includedHours} included hours</span> : null}
                      {rate.durationHours ? <span>{rate.durationHours} hours duration</span> : null}
                      {rate.minimumHours ? <span>Minimum {rate.minimumHours} hour(s)</span> : null}
                      {rate.guestCapacity ? <span>Up to {rate.guestCapacity} guests</span> : <span>Guest capacity: confirm with owner</span>}
                    </div>
                    <div className="rd-included-block">
                      <strong>Included in this rate</strong>
                      {included.length ? <div className="rd-included-list">{included.map((item, i) => <span className="rd-included-chip" key={`${item}-${i}`}>{amenityIcon(item)}{item}</span>)}</div> : <p>No additional amenities specified for this rate.</p>}
                    </div>
                    <div className="rd-services-block">
                      <strong>Additional Services for this Rate</strong>
                      {rate.additionalServices?.length ? (
                        <div className="rd-services-list">
                          {rate.additionalServices.map((service, serviceIndex) => (
                            <button
                              type="button"
                              className={`rd-service-item rd-service-selectable ${selectedServiceIds.includes(String(service.id || `service-${index}-${serviceIndex}`)) ? 'is-selected' : ''}`}
                              key={service.id || `${service.name}-${serviceIndex}`}
                              aria-pressed={selectedServiceIds.includes(String(service.id || `service-${index}-${serviceIndex}`))}
                              onClick={() => {
                                const serviceId = String(service.id || `service-${index}-${serviceIndex}`);
                                setSelectedServiceIds(current =>
                                  current.includes(serviceId)
                                    ? current.filter(value => value !== serviceId)
                                    : [...current, serviceId]
                                );
                              }}
                            >
                              <span className="rd-service-check" aria-hidden="true">
                                {selectedServiceIds.includes(String(service.id || `service-${index}-${serviceIndex}`)) ? '✓' : '+'}
                              </span>
                              <div className="rd-service-copy">
                                <span className="rd-service-name">{service.name}</span>
                                <small>{service.included ? 'Included in this rate · Free' : service.unit === 'per_person' ? 'Per person' : service.unit === 'per_hour' ? 'Per hour' : 'One-time fee'}</small>
                              </div>
                              <strong className={service.included ? 'rd-service-free' : 'rd-service-price'}>
                                {service.included ? 'FREE' : formatPrice(service.price)}
                              </strong>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="rd-no-services">No additional services are listed for this rate.</p>
                      )}
                    </div>
                  </div>
                  <div className="rd-room-footer">
                    <div className="rd-price"><strong>{formatPrice(rate.price)}</strong><span>{formatUnit(rate.unit)}</span></div>
                    <button type="button" className={`rd-select-room ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => setSelectedRateIndex(index)}>{active ? '✓ Selected rate' : 'Select this rate'}</button>
                  </div>
                </article>
              );
            })}</div> : <div className="rd-card rd-empty-note">No pricing options are available for this listing yet.</div>}
          </section>

          {selectedRate && (
            <section className="rd-section rd-selected-booking-section">
              <div className="rd-section-heading"><h3>Your selected option</h3><span className="rd-tag">1 rate only</span></div>
              <div className="rd-card rd-selected-summary">
                <div>
                  <small>Selected accommodation rate</small>
                  <h4>{rateTitle(selectedRate, selectedRateIndex)}</h4>
                  <p>{formatPrice(selectedRate.price)} {formatUnit(selectedRate.unit)}</p>
                  <span>{selectedRate.guestCapacity ? `Up to ${selectedRate.guestCapacity} guests` : 'Guest capacity not specified'}</span>
                </div>
                <div className="rd-selected-summary-check">✓</div>
                <p className="rd-selected-summary-note">Only this rate and its own additional services will be sent to your reservation.</p>
              </div>
            </section>
          )}

          <section className="rd-section" id="rd-location">
            <div className="rd-section-heading"><h3>Location & Travel Guide</h3><span className="rd-muted-text">Distance estimate</span></div>
            <div className="rd-card rd-map-card">
              {resortCoordinates ? <>
                <div className="rd-location-panel"><MapPin size={22} /><strong>{address}</strong></div>
                <div className="rd-map-frame"><iframe title={`Map showing ${resortName}`} src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
                <div className="rd-travel-tools">
                  <button type="button" className="rd-primary-button" onClick={requestCurrentLocation} disabled={locating}>
                    <LocateFixed size={17} />{locating ? 'Getting location...' : currentLocation ? 'Refresh my location' : 'Use my current location'}
                  </button>
                  {locationError && <p className="rd-location-error">{locationError}</p>}
                  {currentLocation && distance !== null ? <>
                    <div className="rd-travel-mode">
                      <button type="button" className={travelMode === 'walking' ? 'active' : ''} onClick={() => setTravelMode('walking')}><Footprints size={17} /> Walk</button>
                      <button type="button" className={travelMode === 'transit' ? 'active' : ''} onClick={() => setTravelMode('transit')}><Bike size={17} /> Tricycle</button>
                      <button type="button" className={travelMode === 'driving' ? 'active' : ''} onClick={() => setTravelMode('driving')}><Car size={17} /> Car</button>
                    </div>
                    <div className="rd-distance-result">
                      <div><small>Approx. distance</small><strong>{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}</strong></div>
                      <div><small>Estimated travel time</small><strong><Clock size={16} />{estimatedHours !== null ? formatDuration(estimatedHours) : '—'}</strong></div>
                    </div>
                    <p className="rd-estimate-note">Estimate only, based on straight-line distance and average travel speeds. Actual road distance and travel time may vary, especially for tricycle routes and ferry crossings.</p>
                  </> : <p className="rd-estimate-note">Allow location access to estimate how far you are from this resort and your approximate travel time.</p>}
                  <a className="rd-directions-link" href={directionsUrl} target="_blank" rel="noreferrer"><Navigation size={17} /> Open directions in Google Maps <ExternalLink size={14} /></a>
                </div>
              </> : <div className="rd-location-panel"><MapPin size={24} /><strong>{address}</strong><p>The resort owner has not pinned exact map coordinates yet. Ask the resort owner to update the listing location.</p></div>}
            </div>
          </section>
          <div className="rd-bottom-space" />
        </main>
      </IonContent>

      {rates.length > 0 && <IonFooter className="rd-footer">
        <div className="rd-booking-bar">
          <div className="rd-booking-price"><small>{selectedRate ? rateTitle(selectedRate, selectedRateIndex) : 'No rate selected'}</small><div className="rd-price"><strong>{formatPrice(selectedRate?.price)}</strong><span>{formatUnit(selectedRate?.unit)}</span></div></div>
          <button type="button" className="rd-book-button" disabled={resort.availability === 'unavailable'} onClick={goToBooking}>
            <CalendarDays size={18} /><span>{resort.availability === 'unavailable' ? 'Currently Unavailable' : 'Book Now'}</span>
          </button>
        </div>
      </IonFooter>}
    </IonPage>
  );
};
export default ResortDetail;
