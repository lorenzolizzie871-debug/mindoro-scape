import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IonContent,
  IonIcon,
  IonPage,
  IonSpinner,
} from '@ionic/react';
import {
  searchOutline,
  optionsOutline,
  locationOutline,
  heartOutline,
  heart,
  closeOutline,
  navigateOutline,
  addOutline,
  removeOutline,
  businessOutline,
  notificationsOutline,
  personOutline,
} from 'ionicons/icons';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';

import { auth, db } from '../firebase';
import BottomTabs from '../components/BottomTabs';

import 'maplibre-gl/dist/maplibre-gl.css';
import './Explore.css';

type ResortListing = {
  id: string;
  resortName: string;
  accommodationName: string;
  municipality: string;
  location: string;
  latitude: number;
  longitude: number;
  price: number;
  imageUrl: string;
  category: string;
  amenities: string[];
  status: string;
  availability: string;
  ownerId: string;
};

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// A closer default camera focused on Oriental Mindoro.
const DEFAULT_CENTER: [number, number] = [121.35, 13.05];
const DEFAULT_ZOOM = 9.15;

// Approximate island-wide viewport: keeps Oriental Mindoro visible
// when there are multiple resorts instead of zooming out to the whole region.
const ORIENTAL_MINDORO_BOUNDS: [[number, number], [number, number]] = [
  [120.78, 12.18],
  [121.98, 13.55],
];

const MUNICIPALITIES = [
  'All',
  'Puerto Galera',
  'Calapan',
  'Bulalacao',
  'Bansud',
  'Bongabong',
  'Gloria',
  'Mansalay',
  'Naujan',
  'Pinamalayan',
  'Pola',
  'Roxas',
  'San Teodoro',
  'Socorro',
  'Victoria',
];

const textValue = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : fallback;

const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(price);

const normalizeListing = (
  id: string,
  data: Record<string, unknown>,
): ResortListing | null => {
  const latitude = numberValue(data.latitude ?? data.lat, NaN);
  const longitude = numberValue(data.longitude ?? data.lng ?? data.lon, NaN);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const pricingOptions = Array.isArray(data.pricingOptions)
    ? (data.pricingOptions as Record<string, unknown>[])
    : [];
  const firstRate = pricingOptions[0];

  const imageUrls = Array.isArray(data.imageUrls)
    ? data.imageUrls.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    id,
    resortName: textValue(
      data.resortName ??
        data.resort_name ??
        data.resortTitle ??
        data.businessName ??
        data.propertyName ??
        data.name,
      'Resort',
    ),
    accommodationName: textValue(data.name, 'Accommodation'),
    municipality: textValue(
      data.resortLocation ?? data.municipality ?? data.city,
      'Oriental Mindoro',
    ),
    location: textValue(
      data.locationLabel ?? data.location ?? data.address,
      'Oriental Mindoro',
    ),
    latitude,
    longitude,
    price: Math.max(
      0,
      numberValue(firstRate?.price ?? data.priceFrom ?? data.price, 0),
    ),
    imageUrl: textValue(data.imageUrl ?? imageUrls[0] ?? data.coverImage),
    category: textValue(
      data.resortType ?? data.category ?? data.type,
      'Resort',
    ),
    amenities: stringArray(data.amenities ?? data.features),
    status: textValue(data.status ?? data.approvalStatus).toLowerCase(),
    availability: textValue(data.availability).toLowerCase(),
    ownerId: textValue(data.ownerId),
  };
};

const isPubliclyAvailable = (listing: ResortListing) =>
  ['published', 'approved', 'active'].includes(listing.status) &&
  listing.availability === 'available';

const Explore: React.FC = () => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const selectedMarkerRef = useRef<MapLibreMarker | null>(null);
  const userLocationMarkerRef = useRef<MapLibreMarker | null>(null);

  const [listings, setListings] = useState<ResortListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [search, setSearch] = useState('');
  const [municipality, setMunicipality] = useState('All');
  const [selectedId, setSelectedId] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState(20000);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [imageErrors, setImageErrors] = useState<string[]>([]);

  const user = auth.currentUser;

  // Keep the Explore heart buttons synchronized with the signed-in user's Firestore favorites.
  useEffect(() => {
    if (!user?.uid) {
      setFavorites([]);
      return;
    }

    const favoritesQuery = query(
      collection(db, 'userFavorites'),
      where('userId', '==', user.uid),
    );

    const unsubscribe = onSnapshot(
      favoritesQuery,
      (snapshot) => {
        const savedPackageIds = snapshot.docs
          .map((item) => {
            const data = item.data();
            return String(data.resortId || data.packageId || '');
          })
          .filter(Boolean);

        setFavorites(Array.from(new Set(savedPackageIds)));
      },
      (error) => {
        console.error('Unable to load user favorites:', error);
      },
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // Load published, available resort packages from Firestore.
  useEffect(() => {
    setLoading(true);
    setDataError('');

    const unsubscribe = onSnapshot(
      collection(db, 'packages'),
      (snapshot) => {
        const available = snapshot.docs
          .map((item) =>
            normalizeListing(
              item.id,
              item.data() as Record<string, unknown>,
            ),
          )
          .filter((item): item is ResortListing => item !== null)
          .filter(isPubliclyAvailable);

        setListings(available);
        setLoading(false);
        setDataError('');
      },
      (error) => {
        console.error('Unable to load available packages:', error);
        setDataError(
          'Unable to load resorts. Please check your connection and Firestore read permissions.',
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const filteredListings = useMemo(() => {
    const term = search.trim().toLowerCase();

    return listings.filter((item) => {
      const matchesSearch =
        !term ||
        item.resortName.toLowerCase().includes(term) ||
        item.accommodationName.toLowerCase().includes(term) ||
        item.municipality.toLowerCase().includes(term) ||
        item.location.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term) ||
        item.amenities.some((amenity) => amenity.toLowerCase().includes(term));

      const matchesMunicipality =
        municipality === 'All' ||
        item.municipality.toLowerCase().includes(municipality.toLowerCase());

      const matchesPrice = item.price === 0 || item.price <= maxPrice;

      return matchesSearch && matchesMunicipality && matchesPrice;
    });
  }, [listings, search, municipality, maxPrice]);

  const selectedListing = useMemo(
    () => filteredListings.find((item) => item.id === selectedId) ?? null,
    [filteredListings, selectedId],
  );

  const selectListing = useCallback((listing: ResortListing, flyTo = true) => {
    setSelectedId(listing.id);

    if (flyTo && mapRef.current) {
      mapRef.current.flyTo({
        center: [listing.longitude, listing.latitude],
        zoom: 12.4,
        duration: 700,
      });
    }
  }, []);

  // Create the map once and keep it visible on the Explore page.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let map: MapLibreMap | null = null;

    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: 8.2,
        maxZoom: 18,
        attributionControl: {},
      });

      mapRef.current = map;

      map.addControl(
        new maplibregl.NavigationControl({
          showCompass: false,
          showZoom: false,
        }),
        'top-right',
      );

      map.on('load', () => {
        setMapReady(true);
        setMapError('');
        map?.resize();
        // Keep the initial view focused on Oriental Mindoro.
        map?.fitBounds(ORIENTAL_MINDORO_BOUNDS, {
          padding: { top: 34, right: 34, bottom: 34, left: 34 },
          maxZoom: DEFAULT_ZOOM,
          duration: 0,
        });
      });

      map.on('error', (event) => {
        console.error('MapLibre error:', event.error);
        setMapError(
          'The map could not load. Check your internet connection and map tile service.',
        );
      });
    } catch (error) {
      console.error('Map initialization failed:', error);
      setMapError('Unable to initialize the map.');
    }

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      selectedMarkerRef.current?.remove();
      selectedMarkerRef.current = null;
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Add a marker for every filtered available listing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    filteredListings.forEach((listing) => {
      const markerElement = document.createElement('button');
      markerElement.type = 'button';
      markerElement.className = 'explore-map-marker';
      markerElement.setAttribute(
        'aria-label',
        `View ${listing.resortName}`,
      );
      const markerName = document.createElement('span');
      markerName.className = 'explore-map-marker-name';
      markerName.textContent = listing.resortName || 'Resort';
      markerName.title = listing.resortName || 'Resort';

      const markerPin = document.createElement('span');
      markerPin.className = 'explore-map-marker-pin';
      markerPin.setAttribute('aria-hidden', 'true');

      markerElement.append(markerName, markerPin);

      markerElement.addEventListener('click', (event) => {
        event.stopPropagation();
        selectListing(listing, true);
      });

      const marker = new maplibregl.Marker({
        element: markerElement,
        anchor: 'bottom',
      })
        .setLngLat([listing.longitude, listing.latitude])
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (!selectedId) {
      if (filteredListings.length === 1) {
        // A single resort gets a close-up view of its exact coordinates.
        map.flyTo({
          center: [filteredListings[0].longitude, filteredListings[0].latitude],
          zoom: 12.4,
          duration: 700,
          essential: true,
        });
      } else {
        // Multiple resorts (or no matches) keep the whole Oriental Mindoro
        // island in view. Do not fit only the pins, which can zoom too far out.
        map.fitBounds(ORIENTAL_MINDORO_BOUNDS, {
          padding: { top: 42, right: 42, bottom: 42, left: 42 },
          maxZoom: DEFAULT_ZOOM,
          duration: 650,
        });
      }
    }
  }, [filteredListings, mapReady, selectListing, selectedId]);

  useEffect(() => {
    if (mapReady) {
      const timeout = window.setTimeout(() => mapRef.current?.resize(), 150);
      return () => window.clearTimeout(timeout);
    }
  }, [mapReady]);

  const toggleFavorite = async (listing: ResortListing) => {
    if (!user?.uid) {
      window.alert('Please sign in to save resorts to your Favorites.');
      navigate('/login');
      return;
    }

    const favoriteId = `${user.uid}_${listing.id}`;
    const favoriteRef = doc(db, 'userFavorites', favoriteId);
    const isSaved = favorites.includes(listing.id);

    try {
      if (isSaved) {
        await deleteDoc(favoriteRef);
      } else {
        await setDoc(favoriteRef, {
          userId: user.uid,
          resortId: listing.id,
          packageId: listing.id,
          resortName: listing.resortName,
          accommodationName: listing.accommodationName,
          resortLocation: listing.municipality,
          location: listing.location,
          imageUrl: listing.imageUrl,
          price: listing.price,
          category: listing.category,
          amenities: listing.amenities,
          ownerId: listing.ownerId,
          savedAt: serverTimestamp(),
          source: 'explore',
        });
      }
      // The onSnapshot listener updates the heart state after Firestore confirms the change.
    } catch (error) {
      console.error('Unable to update resort favorite:', error);
      window.alert('Unable to update Favorites. Please check your connection and Firestore rules.');
    }
  };

  const openDetails = (listing: ResortListing) => {
    navigate(`/user/resort/${listing.id}`);
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setMapError('Location is not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates: [number, number] = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        const map = mapRef.current;

        if (map) {
          map.flyTo({
            center: coordinates,
            zoom: 13.5,
            duration: 900,
            essential: true,
          });

          // Replace the previous blue location dot if the user locates again.
          userLocationMarkerRef.current?.remove();

          const locationElement = document.createElement('div');
          locationElement.className = 'explore-user-location-marker';
          locationElement.setAttribute('role', 'img');
          locationElement.setAttribute('aria-label', 'Your current location');

          userLocationMarkerRef.current = new maplibregl.Marker({
            element: locationElement,
            anchor: 'center',
          })
            .setLngLat(coordinates)
            .addTo(map);
        }

        setMapError('');
      },
      (error) => {
        console.error('Location error:', error);
        setMapError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. You can still browse all available resorts.'
            : 'Unable to get your location. You can still browse all available resorts.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const resetFilters = () => {
    setSearch('');
    setMunicipality('All');
    setMaxPrice(20000);
    setSelectedId('');
  };

  return (
    <IonPage className="explore-page">
      <IonContent fullscreen className="explore-content">
        <div className="explore-shell">
          <header className="explore-header">
            <button
              type="button"
              className="explore-brand"
              onClick={() => navigate('/user/dashboard')}
              aria-label="Go to dashboard"
            >
              <img src="/assets/mindoro-scape-logo.png" alt="Mindoro Scape" />
              <span>
                <strong>Mindoro Scape</strong>
                <small>
                  <IonIcon icon={locationOutline} />
                  ORIENTAL MINDORO
                </small>
              </span>
            </button>

            <div className="explore-header-actions">
              <button
                type="button"
                className="explore-header-icon"
                aria-label="Notifications"
                onClick={() => navigate('/user/dashboard')}
              >
                <IonIcon icon={notificationsOutline} />
              </button>
              <button
                type="button"
                className="explore-avatar"
                aria-label="Open profile"
                onClick={() => navigate('/user/profile')}
              >
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" />
                ) : (
                  <IonIcon icon={personOutline} />
                )}
              </button>
            </div>
          </header>

          <section className="explore-intro">
            <div>
              <span className="explore-eyebrow">DISCOVER YOUR NEXT GETAWAY</span>
              <h1>Explore Resorts</h1>
              <p>Find available resorts across Oriental Mindoro using the map or browse the listings below.</p>
            </div>
            <div className="explore-result-count">
              <strong>{filteredListings.length}</strong>
              <span>available listings</span>
            </div>
          </section>

          <section className="explore-search-row">
            <div className="explore-search-box">
              <IonIcon icon={searchOutline} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search resort, location, or amenity..."
                aria-label="Search available resorts"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                >
                  <IonIcon icon={closeOutline} />
                </button>
              )}
            </div>
            <button
              type="button"
              className={`explore-filter-button ${filterOpen ? 'active' : ''}`}
              onClick={() => setFilterOpen((open) => !open)}
              aria-expanded={filterOpen}
            >
              <IonIcon icon={optionsOutline} />
              <span>Filters</span>
            </button>
          </section>

          <nav className="explore-municipalities" aria-label="Filter by municipality">
            {MUNICIPALITIES.map((item) => (
              <button
                type="button"
                key={item}
                className={municipality === item ? 'active' : ''}
                onClick={() => setMunicipality(item)}
              >
                {item}
              </button>
            ))}
          </nav>

          {filterOpen && (
            <section className="explore-filter-panel">
              <div className="explore-filter-heading">
                <strong>Maximum price</strong>
                <span>{formatPrice(maxPrice)}</span>
              </div>
              <input
                type="range"
                min="500"
                max="20000"
                step="500"
                value={maxPrice}
                onChange={(event) => setMaxPrice(Number(event.target.value))}
                aria-label="Maximum price"
              />
              <button type="button" onClick={resetFilters}>
                Reset filters
              </button>
            </section>
          )}

          <section className="explore-map-section">
            <div className="explore-section-heading">
              <div>
                <span>INTERACTIVE MAP</span>
                <h2>Available resorts near you</h2>
              </div>
              <span className="explore-live-label">
                <i />
                Live listings
              </span>
            </div>

            <div className="explore-map-frame">
              <div
                ref={mapContainerRef}
                className="explore-map-canvas"
                aria-label="Map showing available resorts in Oriental Mindoro"
              />

              {!mapReady && !mapError && (
                <div className="explore-map-loading">
                  <IonSpinner name="crescent" />
                  <span>Loading resort map...</span>
                </div>
              )}

              {mapError && (
                <div className="explore-map-error" role="status">
                  {mapError}
                </div>
              )}

              <div className="explore-map-controls">
                <button type="button" onClick={locateMe} aria-label="My location">
                  <IonIcon icon={navigateOutline} />
                </button>
                <button
                  type="button"
                  onClick={() => mapRef.current?.zoomIn()}
                  aria-label="Zoom in"
                >
                  <IonIcon icon={addOutline} />
                </button>
                <button
                  type="button"
                  onClick={() => mapRef.current?.zoomOut()}
                  aria-label="Zoom out"
                >
                  <IonIcon icon={removeOutline} />
                </button>
              </div>

              {selectedListing && (
                <article className="explore-map-preview">
                  <button
                    type="button"
                    className="explore-preview-close"
                    onClick={() => setSelectedId('')}
                    aria-label="Close resort preview"
                  >
                    <IonIcon icon={closeOutline} />
                  </button>
                  <div className="explore-preview-image">
                    {selectedListing.imageUrl &&
                    !imageErrors.includes(selectedListing.id) ? (
                      <img
                        src={selectedListing.imageUrl}
                        alt={selectedListing.resortName}
                        onError={() =>
                          setImageErrors((items) => [...items, selectedListing.id])
                        }
                      />
                    ) : (
                      <IonIcon icon={businessOutline} />
                    )}
                  </div>
                  <div className="explore-preview-copy">
                    <small>{selectedListing.category}</small>
                    <strong>{selectedListing.resortName}</strong>
                    <span>{selectedListing.accommodationName}</span>
                    <span className="explore-preview-location">
                      <IonIcon icon={locationOutline} />
                      {selectedListing.location}
                    </span>
                    <b>
                      {selectedListing.price > 0
                        ? `${formatPrice(selectedListing.price)} starting price`
                        : 'Contact for price'}
                    </b>
                    <button
                      type="button"
                      onClick={() => openDetails(selectedListing)}
                    >
                      View details
                    </button>
                  </div>
                </article>
              )}
            </div>
            <p className="explore-map-caption">
              Select a map marker to preview a resort. Select View Details to see its full information.
            </p>
          </section>

          <section className="explore-list-section">
            <div className="explore-section-heading">
              <div>
                <span>BROWSE LISTINGS</span>
                <h2>Resorts you can book</h2>
              </div>
              <strong>{filteredListings.length} found</strong>
            </div>

            {loading ? (
              <div className="explore-state">
                <IonSpinner name="crescent" />
                <p>Loading available resorts...</p>
              </div>
            ) : dataError ? (
              <div className="explore-state explore-error-state">
                <IonIcon icon={businessOutline} />
                <p>{dataError}</p>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="explore-empty">
                <IonIcon icon={locationOutline} />
                <h3>No available resorts found</h3>
                <p>Try another search or municipality, or reset your filters.</p>
                <button type="button" onClick={resetFilters}>Reset filters</button>
              </div>
            ) : (
              <div className="explore-list-grid">
                {filteredListings.map((listing) => (
                  <article className="explore-resort-card" key={listing.id}>
                    <button
                      type="button"
                      className="explore-card-image"
                      onClick={() => selectListing(listing)}
                      aria-label={`Show ${listing.resortName} on map`}
                    >
                      {listing.imageUrl &&
                      !imageErrors.includes(listing.id) ? (
                        <img
                          src={listing.imageUrl}
                          alt={listing.resortName}
                          loading="lazy"
                          onError={() =>
                            setImageErrors((items) => [...items, listing.id])
                          }
                        />
                      ) : (
                        <span className="explore-image-placeholder">
                          <IonIcon icon={businessOutline} />
                          Resort image
                        </span>
                      )}
                      <span className="explore-available-badge">Available</span>
                    </button>

                    <button
                      type="button"
                      className={`explore-card-favorite ${
                        favorites.includes(listing.id) ? 'is-favorite' : ''
                      }`}
                      onClick={() => void toggleFavorite(listing)}
                      aria-label="Toggle favorite"
                    >
                      <IonIcon
                        icon={
                          favorites.includes(listing.id) ? heart : heartOutline
                        }
                      />
                    </button>

                    <div className="explore-card-body">
                      <span className="explore-card-category">{listing.category}</span>
                      <h3>{listing.resortName}</h3>
                      <p className="explore-card-accommodation">
                        {listing.accommodationName}
                      </p>
                      <p className="explore-card-location">
                        <IonIcon icon={locationOutline} />
                        {listing.municipality}
                      </p>

                      {listing.amenities.length > 0 && (
                        <div className="explore-card-amenities">
                          {listing.amenities.slice(0, 3).map((amenity) => (
                            <span key={amenity}>{amenity}</span>
                          ))}
                        </div>
                      )}

                      <div className="explore-card-footer">
                        <div>
                          <small>Starting price</small>
                          <strong>
                            {listing.price > 0
                              ? formatPrice(listing.price)
                              : 'Contact for price'}
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => openDetails(listing)}
                        >
                          View details
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </IonContent>

      <BottomTabs />
    </IonPage>
  );
};

export default Explore;
