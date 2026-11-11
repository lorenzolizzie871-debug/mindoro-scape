import React, { useEffect, useRef, useState } from 'react';
import {
  IonContent,
  IonPage,
  IonIcon,
  IonSpinner,
} from '@ionic/react';

import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

import {
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

import imageCompression from 'browser-image-compression';

import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';

import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// Configure MapLibre's worker for Vite.
setWorkerUrl(mapLibreWorkerUrl);

import {
  logOutOutline,
  timeOutline,
  addCircleOutline,
  documentTextOutline,
  notificationsOutline,
  bedOutline,
  checkmarkCircleOutline,
  closeOutline,
  imagesOutline,
  gridOutline,
  calendarOutline,
  chatbubbleOutline,
  optionsOutline,
  cloudUploadOutline,
  locationOutline,
  sparklesOutline,
  informationCircleOutline,
  mapOutline,
} from 'ionicons/icons';

import './OwnerDashboard.css';
import './OwnerNotifications.css';
import OwnerBookings from './OwnerBookings';
import OwnerVillas from './OwnerVillas';
import OwnerSettings from './OwnerSettings';
import OwnerInquiries from './OwnerInquiries';
import type { OwnerVillaPackage } from './OwnerVillas';

// =========================================================
// TYPES
// =========================================================

type PricingUnit = 'person' | 'cottage' | 'hour' | 'day' | 'night' | 'package' | 'fixed';
type PricingOption = { id: string; unit: PricingUnit; price: number; durationHours?: number; minimumHours?: number; guestCapacity?: number; label?: string; includedAmenities?: string[] | string; additionalServices?: AddOnOption[] };
type AddOnOption = { id: string; name: string; price: number; unit: 'fixed' | 'per_person' | 'per_hour'; included: boolean };

type BookingSessionKey = 'day' | 'night';
type BookingSessionConfig = {
  enabled: boolean;
  startTime: string;
  endTime: string;
};
type BookingSchedule = {
  availableDays: string[];
  sessions: {
    day: BookingSessionConfig;
    night: BookingSessionConfig;
  };
  extension: {
    enabled: boolean;
    feePerHour: number;
    maxHours: number;
  };
};

const BOOKING_DAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

const DEFAULT_BOOKING_SCHEDULE: BookingSchedule = {
  availableDays: BOOKING_DAYS.map((day) => day.value),
  sessions: {
    day: { enabled: true, startTime: '08:00', endTime: '17:00' },
    night: { enabled: true, startTime: '18:00', endTime: '00:00' },
  },
  extension: { enabled: false, feePerHour: 0, maxHours: 4 },
};

const normalizeBookingSchedule = (value?: Partial<BookingSchedule> | null): BookingSchedule => {
  const source = value || {};
  const days = Array.isArray(source.availableDays)
    ? source.availableDays.filter((day): day is string =>
        BOOKING_DAYS.some((valid) => valid.value === String(day).toLowerCase())
      ).map((day) => String(day).toLowerCase())
    : [...DEFAULT_BOOKING_SCHEDULE.availableDays];

  return {
    availableDays: [...new Set(days)],
    sessions: {
      day: {
        ...DEFAULT_BOOKING_SCHEDULE.sessions.day,
        ...(source.sessions?.day || {}),
      },
      night: {
        ...DEFAULT_BOOKING_SCHEDULE.sessions.night,
        ...(source.sessions?.night || {}),
      },
    },
    extension: {
      ...DEFAULT_BOOKING_SCHEDULE.extension,
      ...(source.extension || {}),
      feePerHour: Math.max(0, Number(source.extension?.feePerHour ?? DEFAULT_BOOKING_SCHEDULE.extension.feePerHour) || 0),
      maxHours: Math.min(12, Math.max(1, Number(source.extension?.maxHours ?? DEFAULT_BOOKING_SCHEDULE.extension.maxHours) || 4)),
    },
  };
};


type OwnerPackage = {
  id: string;
  ownerId: string;
  resortName: string;
  resortLocation: string;
  name: string;
  resortType?: 'Private Resort' | 'Public Resort' | 'Beach Resort' | 'Nature Resort' | 'Family Resort';
  category?: string;
  usageType?: 'swimming' | 'event' | 'overnight';
  eventTypes?: string[];
  reservationMode?: 'day_use' | 'event_booking' | 'overnight_stay';
  price: number;
  description?: string;
  amenities?: string[];
  imageUrl?: string;
  imageUrls?: string[];
  priceUnit?: PricingUnit;
  pricingOptions?: PricingOption[];
  addOns?: AddOnOption[];
  childFreeUnderAge?: number | null;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  availability?: 'available' | 'unavailable';
  bookingSchedule?: BookingSchedule;
  status?: string;
  createdAt?: unknown;
};

type OwnerUser = {
  fullName?: string;
  resortName?: string;
  resortLocation?: string;
  status?: string;
  permitId?: string;
  permitImageUrl?: string;
};


type OwnerNotification = {
  id: string;
  ownerId?: string;
  type?: string;
  bookingId?: string;
  guestName?: string;
  resortName?: string;
  accommodationName?: string;
  referenceCode?: string;
  checkIn?: string;
  checkOut?: string;
  createdAt?: any;
  read?: boolean;
};

type OwnerChatNotice = {
  id: string;
  userId?: string;
  bookingId?: string;
  guestName?: string;
  resortName?: string;
  accommodationName?: string;
  lastMessage?: string;
  unreadForOwner?: number;
};

type LocationSuggestion = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

type ListingUsageType = 'swimming' | 'event' | 'overnight';

const LISTING_USAGE_OPTIONS: Array<{
  value: ListingUsageType;
  label: string;
  description: string;
}> = [
  {
    value: 'swimming',
    label: 'Swimming / Day Use',
    description: 'For guests who will swim or use the resort facilities without overnight stay.',
  },
  {
    value: 'event',
    label: 'Event Venue',
    description: 'For birthdays, weddings, reunions, team building, and other private events.',
  },
  {
    value: 'overnight',
    label: 'Overnight Accommodation',
    description: 'For guests booking rooms, villas, cottages, or overnight stays.',
  },
];

const EVENT_TYPE_OPTIONS = [
  'Birthday Party',
  'Debut',
  'Wedding',
  'Anniversary',
  'Family Reunion',
  'Team Building',
  'Company Event',
  'Other Private Event',
];

// Convert a compressed image into a Base64 data URL for Firestore.
const convertImageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.readAsDataURL(file);

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to convert the image.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Unable to read the selected image.'));
    };
  });
};

// =========================================================
// COMPONENT
// =========================================================

const OwnerDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<OwnerUser | null>(null);
  const [packages, setPackages] = useState<OwnerPackage[]>([]);
  const [showAllListings, setShowAllListings] = useState(false);
  const [activeOwnerTab, setActiveOwnerTab] = useState<'overview' | 'bookings' | 'villas' | 'inquiries' | 'settings'>('overview');
  const [ownerNotifications, setOwnerNotifications] = useState<OwnerNotification[]>([]);
  const [ownerChatNotices, setOwnerChatNotices] = useState<OwnerChatNotice[]>([]);
  const [showOwnerNotifications, setShowOwnerNotifications] = useState(false);
  const [pendingInquiryChatId, setPendingInquiryChatId] = useState<string | null>(null);


  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Accommodation details and flexible pricing.
  const [pkgName, setPkgName] = useState('');
  const [pkgResortType, setPkgResortType] = useState<'Private Resort' | 'Public Resort' | 'Beach Resort' | 'Nature Resort' | 'Family Resort'>('Beach Resort');
  const [usageType, setUsageType] = useState<ListingUsageType>('swimming');
  const [eventTypes, setEventTypes] = useState<string[]>(['Birthday Party']);
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([{ id: 'rate-1', unit: 'person', price: 0, guestCapacity: 1 }]);


  const [pkgDesc, setPkgDesc] = useState('');

  // Multiple accommodation photos
  const [pkgImages, setPkgImages] = useState<File[]>([]);
  const [pkgImagePreviews, setPkgImagePreviews] = useState<string[]>([]);

  // Children policy
  const [freeKidsEnabled, setFreeKidsEnabled] = useState(true);
  const [freeKidsUnderAge, setFreeKidsUnderAge] = useState('4');

  // Location search
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<
    LocationSuggestion[]
  >([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [selectedLocationLabel, setSelectedLocationLabel] = useState('');

  // Availability
  const [pkgAvailability, setPkgAvailability] = useState<
    'available' | 'unavailable'
  >('available');

  // Owner-controlled weekly booking schedule, session hours, and extension fees.
  const [bookingSchedule, setBookingSchedule] = useState<BookingSchedule>(() => ({
    ...DEFAULT_BOOKING_SCHEDULE,
    availableDays: [...DEFAULT_BOOKING_SCHEDULE.availableDays],
  }));

  const updateBookingSession = (
    session: BookingSessionKey,
    changes: Partial<BookingSessionConfig>
  ) => {
    setBookingSchedule((current) => ({
      ...current,
      sessions: {
        ...current.sessions,
        [session]: { ...current.sessions[session], ...changes },
      },
    }));
  };

  // Coordinates
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Weather is fetched live from the selected accommodation coordinates.
  const [accommodationWeather, setAccommodationWeather] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [weatherRefresh, setWeatherRefresh] = useState(0);
  const weatherApiBase =
    (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';

  const [formError, setFormError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState<{
    title: string;
    message: string;
    variant: 'success' | 'error' | 'confirm';
    confirmLabel?: string;
    onConfirm?: () => void | Promise<void>;
  } | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  // Map references
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const searchRequestRef = useRef(0);

  // =========================================================
  // AUTHENTICATION AND REALTIME OWNER DATA
  // =========================================================

  useEffect(() => {
    let isMounted = true;

    let unsubscribeOwner: (() => void) | undefined;
    let unsubscribePackages: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeOwner?.();
      unsubscribePackages?.();

      unsubscribeOwner = undefined;
      unsubscribePackages = undefined;

      if (!user) {
        setUserData(null);
        setPackages([]);
        setLoading(false);

        navigate('/login?role=owner', { replace: true });
        return;
      }

      setLoading(true);

      unsubscribeOwner = onSnapshot(
        doc(db, 'users', user.uid),

        (ownerSnapshot) => {
          if (!isMounted) return;

          if (!ownerSnapshot.exists()) {
            setUserData(null);
            setPackages([]);
            setLoading(false);
            return;
          }

          const owner = ownerSnapshot.data() as OwnerUser;

          setUserData(owner);

          // Only approved resort owners can publish.
          if (owner.status !== 'approved') {
            unsubscribePackages?.();
            unsubscribePackages = undefined;

            setPackages([]);
            setLoading(false);
            return;
          }

          const packagesQuery = query(
            collection(db, 'packages'),
            where('ownerId', '==', user.uid)
          );

          if (!unsubscribePackages) {
            unsubscribePackages = onSnapshot(
              packagesQuery,

              (snapshot) => {
                if (!isMounted) return;

                const packageList = snapshot.docs.map((packageDoc) => ({
                  id: packageDoc.id,
                  ...packageDoc.data(),
                })) as OwnerPackage[];

                setPackages(packageList);
                setLoading(false);
              },

              (error) => {
                console.error(
                  'Error loading owner packages:',
                  error
                );

                if (isMounted) setLoading(false);
              }
            );
          } else {
            setLoading(false);
          }
        },

        (error) => {
          console.error('Error loading owner profile:', error);

          if (isMounted) setLoading(false);
        }
      );
    });

    return () => {
      isMounted = false;

      unsubscribeAuth();
      unsubscribeOwner?.();
      unsubscribePackages?.();
    };
  }, [navigate]);

  // =========================================================
  // GLOBAL OWNER NOTIFICATIONS (AVAILABLE ON EVERY OWNER TAB)
  // =========================================================

  useEffect(() => {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId || userData?.status !== 'approved') {
      setOwnerNotifications([]);
      setOwnerChatNotices([]);
      return;
    }

    const notificationsQuery = query(
      collection(db, 'ownerNotifications'),
      where('ownerId', '==', ownerId)
    );
    const unsubscribeNotifications = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as OwnerNotification[];
        rows.sort((a, b) => {
          const getTime = (value: any) => value?.toDate ? value.toDate().getTime() : new Date(value || 0).getTime();
          return getTime(b.createdAt) - getTime(a.createdAt);
        });
        setOwnerNotifications(rows);
      },
      (error) => console.error('Owner notifications listener failed:', error)
    );

    const chatsQuery = query(
      collection(db, 'bookingChats'),
      where('ownerId', '==', ownerId)
    );
    const unsubscribeChats = onSnapshot(
      chatsQuery,
      async (snapshot) => {
        const rawChats = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as OwnerChatNotice[];

        // Resolve missing guest names from the guest profile/reservation.
        // This keeps the header notification from displaying a generic "Guest".
        const resolvedChats = await Promise.all(rawChats.map(async (chat) => {
          if (chat.guestName?.trim()) return chat;

          let resolvedName = '';

          try {
            if (chat.userId) {
              const guestProfile = await getDoc(doc(db, 'users', chat.userId));
              if (guestProfile.exists()) {
                const profile = guestProfile.data() as Record<string, any>;
                resolvedName =
                  String(profile.fullName || profile.displayName || profile.name || '').trim();

                if (!resolvedName) {
                  resolvedName = [
                    String(profile.firstName || '').trim(),
                    String(profile.lastName || '').trim(),
                  ].filter(Boolean).join(' ');
                }

                if (!resolvedName && typeof profile.email === 'string') {
                  resolvedName = profile.email.split('@')[0].replace(/[._-]+/g, ' ').trim();
                }
              }
            }

            if (!resolvedName && chat.bookingId) {
              const reservation = await getDoc(doc(db, 'reservations', chat.bookingId));
              if (reservation.exists()) {
                const booking = reservation.data();
                resolvedName = String(
                  booking.guest?.fullName ||
                  booking.guest?.name ||
                  booking.guestName ||
                  ''
                ).trim();
              }
            }

            if (resolvedName) {
              await updateDoc(doc(db, 'bookingChats', chat.id), {
                guestName: resolvedName,
              }).catch((writeError) => {
                console.warn('Could not save resolved guest name:', writeError);
              });
            }
          } catch (nameError) {
            console.warn(`Could not resolve guest name for chat ${chat.id}:`, nameError);
          }

          return { ...chat, guestName: resolvedName || chat.guestName };
        }));

        setOwnerChatNotices(resolvedChats);
      },
      (error) => console.error('Owner chat notification listener failed:', error)
    );

    return () => {
      unsubscribeNotifications();
      unsubscribeChats();
    };
  }, [userData?.status]);

  const unreadOwnerNotifications = ownerNotifications.filter((item) => !item.read);
  const unreadOwnerChats = ownerChatNotices.filter((item) => Number(item.unreadForOwner || 0) > 0);
  const ownerNotificationCount =
    unreadOwnerNotifications.length +
    unreadOwnerChats.reduce((total, item) => total + Number(item.unreadForOwner || 0), 0);

  const markOwnerNotificationRead = async (notification: OwnerNotification) => {
    try {
      await updateDoc(doc(db, 'ownerNotifications', notification.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Unable to mark notification as read:', error);
    }
  };

  const markAllOwnerNotificationsRead = async () => {
    await Promise.all([
      ...unreadOwnerNotifications.map((item) =>
        markOwnerNotificationRead(item)
      ),
      ...unreadOwnerChats.map((chat) =>
        updateDoc(doc(db, 'bookingChats', chat.id), {
          unreadForOwner: 0,
          lastReadByOwnerAt: serverTimestamp(),
        }).catch((error) => console.error('Unable to clear chat unread count:', error))
      ),
    ]);
  };

  const openOwnerNotification = async (notification: OwnerNotification) => {
    await markOwnerNotificationRead(notification);
    setShowOwnerNotifications(false);
    setActiveOwnerTab('bookings');
    setShowAllListings(false);
  };

  const openOwnerChatNotification = (chat: OwnerChatNotice) => {
    setShowOwnerNotifications(false);
    setPendingInquiryChatId(chat.id);
    setActiveOwnerTab('inquiries');
  };

  // =========================================================
  // MAP LOCATION PICKER - MAPLIBRE
  // =========================================================

  useEffect(() => {
    if (!showAddModal || !mapContainerRef.current) return;

    const mapInstance = new MapLibreMap({
      container: mapContainerRef.current,

      style: {
        version: 8,

        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },

        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },

      center: [121.1, 13.0],
      zoom: 8,
    });

    mapRef.current = mapInstance;

    mapInstance.addControl(
      new NavigationControl(),
      'top-right'
    );

    // Restore selected coordinates if present.
    if (latitude !== null && longitude !== null) {
      markerRef.current = new Marker({
        color: '#ef9418',
      })
        .setLngLat([longitude, latitude])
        .addTo(mapInstance);

      mapInstance.setCenter([longitude, latitude]);
      mapInstance.setZoom(14);
    }

    // Click map to select exact accommodation location.
    mapInstance.on('click', (event) => {
      const selectedLatitude = event.lngLat.lat;
      const selectedLongitude = event.lngLat.lng;

      setLatitude(selectedLatitude);
      setLongitude(selectedLongitude);

      setSelectedLocationLabel(
        `Map pin: ${selectedLatitude.toFixed(5)}, ${selectedLongitude.toFixed(5)}`
      );

      if (!markerRef.current) {
        markerRef.current = new Marker({
          color: '#ef9418',
        });
      }

      markerRef.current
        .setLngLat([
          selectedLongitude,
          selectedLatitude,
        ])
        .addTo(mapInstance);
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;

      mapInstance.remove();
      mapRef.current = null;
    };
  }, [showAddModal]);


  // =========================================================
  // LIVE WEATHER FOR THE OWNER DASHBOARD OVERVIEW
  // =========================================================

  useEffect(() => {
    if (!userData || userData.status !== 'approved' || activeOwnerTab !== 'overview') {
      return;
    }

    const controller = new AbortController();

    const loadDashboardWeather = async () => {
      setWeatherLoading(true);
      setWeatherError('');

      try {
        const locatedPackage = packages.find(
          (item) =>
            typeof item.latitude === 'number' &&
            Number.isFinite(item.latitude) &&
            typeof item.longitude === 'number' &&
            Number.isFinite(item.longitude)
        );

        const params = new URLSearchParams();

        if (locatedPackage) {
          params.set('lat', String(locatedPackage.latitude));
          params.set('lon', String(locatedPackage.longitude));
        } else if (userData.resortLocation?.trim()) {
          params.set('city', userData.resortLocation.trim());
        } else {
          throw new Error(
            'No resort location is available. Add a resort location in your owner profile or save an accommodation with a map pin.'
          );
        }

        const response = await fetch(
          `${weatherApiBase}/api/weather/current?${params.toString()}`,
          { signal: controller.signal }
        );
        const result = await response.json();

        if (!response.ok || result?.success !== true || !result?.data) {
          throw new Error(
            result?.message || 'Weather information is currently unavailable.'
          );
        }

        setAccommodationWeather(result.data);
      } catch (error) {
        if (controller.signal.aborted) return;
        setAccommodationWeather(null);
        setWeatherError(
          error instanceof Error
            ? error.message
            : 'Unable to retrieve current weather.'
        );
      } finally {
        if (!controller.signal.aborted) setWeatherLoading(false);
      }
    };

    void loadDashboardWeather();

    return () => controller.abort();
  }, [
    userData,
    activeOwnerTab,
    packages,
    weatherRefresh,
    weatherApiBase,
  ]);

  const getAccommodationWeatherAdvisory = (weather: any) => {
    const condition = String(weather?.condition || '').toLowerCase();
    const description = String(weather?.description || '').toLowerCase();
    const wind = Number(weather?.windSpeed || 0);
    const rain = Number(weather?.rain || 0);

    if (
      condition.includes('thunderstorm') ||
      description.includes('thunderstorm') ||
      rain >= 7.5 ||
      wind >= 13.9
    ) {
      return {
        level: 'warning',
        title: 'Severe Weather Caution',
        message: 'Thunderstorms, heavy rainfall, or strong winds may affect outdoor activities. Monitor official PAGASA advisories and assess resort operations.',
      };
    }

    if (
      condition.includes('rain') ||
      condition.includes('drizzle') ||
      description.includes('rain') ||
      wind >= 10 ||
      rain >= 2.5
    ) {
      return {
        level: 'caution',
        title: 'Weather Advisory',
        message: 'Rain or stronger winds may affect swimming and outdoor events. Review the conditions before confirming guest activities.',
      };
    }

    return {
      level: 'normal',
      title: 'No Significant Weather Concern Detected',
      message: 'Current weather data does not indicate a significant concern. Continue checking official weather updates.',
    };
  };

  // =========================================================
  // LOGOUT
  // =========================================================

  const handleLogout = async () => {
    try {
      await signOut(auth);

      navigate('/login?role=owner', {
        replace: true,
      });
    } catch (error) {
      console.error('Logout failed:', error);
      setFeedbackModal({
        title: 'Logout failed',
        message: 'Unable to log out. Please try again.',
        variant: 'error',
      });
    }
  };

  // =========================================================
  // FORM HELPERS
  // =========================================================

  const resetPackageForm = () => {
    pkgImagePreviews.forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });

    setPkgName('');
    setPkgResortType('Beach Resort');
    setUsageType('swimming');
    setEventTypes(['Birthday Party']);
    setPricingOptions([{ id: `rate-${Date.now()}`, unit: 'person', price: 0, guestCapacity: 1 }]);


    setPkgDesc('');

    setPkgImages([]);
    setPkgImagePreviews([]);
    setExistingImageUrls([]);
    setEditingPackageId(null);

    setFreeKidsEnabled(true);
    setFreeKidsUnderAge('4');

    setLocationQuery('');
    setLocationSuggestions([]);
    setSelectedLocationLabel('');

    setPkgAvailability('available');
    setBookingSchedule({
      ...DEFAULT_BOOKING_SCHEDULE,
      availableDays: [...DEFAULT_BOOKING_SCHEDULE.availableDays],
    });

    setLatitude(null);
    setLongitude(null);
    setAccommodationWeather(null);
    setWeatherError('');

    setFormError('');
  };

  const openAddModal = () => {
    resetPackageForm();
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    if (isSubmitting) return;

    setShowAddModal(false);
    resetPackageForm();
  };

  // =========================================================
  // IMAGE UPLOAD PREVIEW (UP TO FOUR PHOTOS)
  // =========================================================

  const handleImageChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    setFormError('');

    const remainingSlots = 4 - existingImageUrls.length - pkgImages.length;

    if (files.length > remainingSlots) {
      setFormError(
        `You can upload up to 4 photos only. You can add ${remainingSlots} more.`
      );

      event.target.value = '';
      return;
    }

    const invalidFile = files.find(
      (file) => !file.type.startsWith('image/')
    );

    if (invalidFile) {
      setFormError('Please select valid image files only.');
      event.target.value = '';
      return;
    }

    const oversizedFile = files.find(
      (file) => file.size > 5 * 1024 * 1024
    );

    if (oversizedFile) {
      setFormError('Each image must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    const nextFiles = [...pkgImages, ...files].slice(0, Math.max(0, 4 - existingImageUrls.length));

    // Revoke old previews before replacing them.
    pkgImagePreviews.forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });

    setPkgImages(nextFiles);

    setPkgImagePreviews([
      ...existingImageUrls,
      ...nextFiles.map((file) => URL.createObjectURL(file)),
    ]);

    event.target.value = '';
  };

  const removeSelectedImage = (index: number) => {
    const existingCount = existingImageUrls.length;
    if (index < existingCount) {
      setExistingImageUrls((items) => items.filter((_, i) => i !== index));
    } else {
      const fileIndex = index - existingCount;
      const removedPreview = pkgImagePreviews[index];
      if (removedPreview?.startsWith('blob:')) URL.revokeObjectURL(removedPreview);
      setPkgImages((items) => items.filter((_, i) => i !== fileIndex));
    }
    setPkgImagePreviews((items) => items.filter((_, i) => i !== index));
  };

  // =========================================================
  // LOCATION SEARCH - OPENSTREETMAP NOMINATIM
  // =========================================================

  useEffect(() => {
    if (!showAddModal || locationQuery.trim().length < 3) {
      setLocationSuggestions([]);
      setIsSearchingLocation(false);
      return;
    }

    const requestId = ++searchRequestRef.current;

    const timer = window.setTimeout(async () => {
      setIsSearchingLocation(true);

      try {
        const params = new URLSearchParams({
          format: 'jsonv2',
          addressdetails: '1',
          limit: '5',
          countrycodes: 'ph',
          q: locationQuery.trim(),
        });

        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error('Location search is unavailable.');
        }

        const results = await response.json();

        if (requestId === searchRequestRef.current) {
          setLocationSuggestions(
            Array.isArray(results) ? results : []
          );
        }
      } catch (error) {
        console.error('Location search error:', error);

        if (requestId === searchRequestRef.current) {
          setLocationSuggestions([]);
        }
      } finally {
        if (requestId === searchRequestRef.current) {
          setIsSearchingLocation(false);
        }
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [locationQuery, showAddModal]);

  const selectLocationSuggestion = (
    place: LocationSuggestion
  ) => {
    const selectedLatitude = Number(place.lat);
    const selectedLongitude = Number(place.lon);

    if (
      !Number.isFinite(selectedLatitude) ||
      !Number.isFinite(selectedLongitude)
    ) {
      return;
    }

    setLatitude(selectedLatitude);
    setLongitude(selectedLongitude);

    setSelectedLocationLabel(place.display_name);
    setLocationQuery(place.display_name);
    setLocationSuggestions([]);

    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [selectedLongitude, selectedLatitude],
        zoom: 15,
        essential: true,
      });

      if (!markerRef.current) {
        markerRef.current = new Marker({
          color: '#ef9418',
        });
      }

      markerRef.current
        .setLngLat([
          selectedLongitude,
          selectedLatitude,
        ])
        .addTo(mapRef.current);
    }
  };

  const handleLocationSearchEnter = async () => {
    if (locationSuggestions.length > 0) {
      selectLocationSuggestion(locationSuggestions[0]);
      return;
    }

    const searchText = locationQuery.trim();

    if (searchText.length < 3) return;

    setIsSearchingLocation(true);

    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        addressdetails: '1',
        limit: '5',
        countrycodes: 'ph',
        q: searchText,
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Location search is unavailable.');
      }

      const results = await response.json();

      if (Array.isArray(results) && results.length > 0) {
        selectLocationSuggestion(results[0]);
      } else {
        setFormError(
          'No matching location found. Try a more specific barangay, town, or address, or pin it manually on the map.'
        );
      }
    } catch (error) {
      console.error('Location search error:', error);

      setFormError(
        'Unable to search this location right now. You can still pin it manually on the map.'
      );
    } finally {
      setIsSearchingLocation(false);
    }
  };
    const openEditPackage = (pkg: OwnerPackage) => {
    resetPackageForm();
    setEditingPackageId(pkg.id);
    setPkgName(pkg.name || '');
    setPkgResortType((pkg.resortType || pkg.category || 'Beach Resort') as typeof pkgResortType);
    setUsageType(pkg.usageType || (pkg.reservationMode === 'event_booking' ? 'event' : pkg.reservationMode === 'overnight_stay' ? 'overnight' : 'swimming'));
    setEventTypes(Array.isArray(pkg.eventTypes) && pkg.eventTypes.length ? pkg.eventTypes : ['Birthday Party']);
    const rates = pkg.pricingOptions?.length ? pkg.pricingOptions : [{ id: `legacy-${Date.now()}`, unit: (pkg.priceUnit || 'night') as PricingUnit, price: Number(pkg.price || 0), durationHours: 12, guestCapacity: 2 }];
    const legacyServices = Array.isArray(pkg.addOns) ? pkg.addOns : [];
    setPricingOptions(rates.map((rate, index) => ({
      ...rate,
      id: rate.id || `edit-rate-${index}-${Date.now()}`,
      // Migrate legacy listing-level services into each rate so old listings
      // remain visible while the owner transitions to rate-specific services.
      additionalServices: Array.isArray(rate.additionalServices)
        ? rate.additionalServices.map((item, serviceIndex) => ({
            ...item,
            id: item.id || `edit-service-${index}-${serviceIndex}-${Date.now()}`,
          }))
        : legacyServices.map((item, serviceIndex) => ({
            ...item,
            id: `legacy-service-${index}-${serviceIndex}-${Date.now()}`,
          })),
    })));
    setPkgDesc(pkg.description || '');
    const photos = pkg.imageUrls?.length ? pkg.imageUrls : (pkg.imageUrl ? [pkg.imageUrl] : []);
    setExistingImageUrls(photos.slice(0, 4));
    setPkgImages([]);
    setPkgImagePreviews(photos.slice(0, 4));
    setFreeKidsEnabled(pkg.childFreeUnderAge !== null && pkg.childFreeUnderAge !== undefined);
    setFreeKidsUnderAge(String(pkg.childFreeUnderAge ?? 4));
    setLocationQuery(pkg.locationLabel || pkg.resortLocation || '');
    setSelectedLocationLabel(pkg.locationLabel || pkg.resortLocation || '');
    setLatitude(typeof pkg.latitude === 'number' ? pkg.latitude : null);
    setLongitude(typeof pkg.longitude === 'number' ? pkg.longitude : null);
    setPkgAvailability(pkg.availability || 'available');
    setBookingSchedule(normalizeBookingSchedule(pkg.bookingSchedule));
    setFormError('');
    setShowAddModal(true);
  };

  const deletePackageNow = async (pkg: OwnerPackage) => {
    setFeedbackBusy(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || pkg.ownerId !== currentUser.uid) {
        setFeedbackModal({
          title: 'Unable to delete listing',
          message: 'You are not allowed to delete this listing.',
          variant: 'error',
        });
        return;
      }

      await deleteDoc(doc(db, 'packages', pkg.id));
      setFeedbackModal({
        title: 'Accommodation deleted',
        message: `${pkg.name || 'The accommodation'} has been successfully deleted.`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Error deleting accommodation:', error);
      setFeedbackModal({
        title: 'Delete failed',
        message: 'Unable to delete this accommodation. Please check your connection and try again.',
        variant: 'error',
      });
    } finally {
      setFeedbackBusy(false);
    }
  };

  const handleDeletePackage = (pkg: OwnerPackage) => {
    setFeedbackModal({
      title: 'Delete accommodation?',
      message: `Are you sure you want to delete "${pkg.name}"? This action cannot be undone.`,
      variant: 'confirm',
      confirmLabel: 'Delete accommodation',
      onConfirm: () => deletePackageNow(pkg),
    });
  };

  // =========================================================
  // ADD ACCOMMODATION
  // =========================================================

  const handleAddPackage = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setFormError('');

    const name = pkgName.trim();

    const validPricingOptions = pricingOptions.map((option) => ({
      ...option,
      price: Number(option.price),
      includedAmenities: (Array.isArray(option.includedAmenities)
        ? option.includedAmenities
        : String(option.includedAmenities || '').split(',')
      ).map((item) => String(item).trim()).filter(Boolean),
      additionalServices: (option.additionalServices || [])
        .filter((service) => service.name.trim())
        .map((service) => ({
          ...service,
          name: service.name.trim(),
          price: service.included ? 0 : Number(service.price),
        })),
    }));

    const currentUser = auth.currentUser;

    if (!currentUser) {
      setFormError('Your session has expired. Please log in again.');

      navigate('/login?role=owner', {
        replace: true,
      });

      return;
    }

    // Check initial resort account approval.
    if (userData?.status !== 'approved') {
      setFormError(
        'Your resort account must be approved before publishing accommodations.'
      );

      return;
    }

    if (!name) {
      setFormError('Enter a villa or accommodation name.');
      return;
    }

    if (usageType === 'event' && eventTypes.length === 0) {
      setFormError('Select at least one event type accepted by this venue.');
      return;
    }

    if (validPricingOptions.length === 0) {
      setFormError('Add at least one accommodation pricing option.');
      return;
    }

    const invalidPrice = validPricingOptions.find(
      (option) => !Number.isFinite(option.price) || option.price <= 0
    );

    if (invalidPrice) {
      setFormError('Enter a valid price greater than zero for every enabled pricing option.');
      return;
    }

    const invalidService = validPricingOptions.some((option) =>
      (option.additionalServices || []).some((service) =>
        !service.included && (!Number.isFinite(Number(service.price)) || Number(service.price) < 0)
      )
    );
    if (invalidService) {
      setFormError('Enter a valid price for every paid additional service, or mark it as included in the rate.');
      return;
    }

    const invalidCapacity = validPricingOptions.find((option) =>
      option.guestCapacity !== undefined && (!Number.isInteger(option.guestCapacity) || option.guestCapacity < 1 || option.guestCapacity > 100)
    );
    if (invalidCapacity) { setFormError('Guest capacity must be between 1 and 100 persons.'); return; }


    if (bookingSchedule.availableDays.length === 0) {
      setFormError('Select at least one available day for this accommodation.');
      return;
    }

    if (!bookingSchedule.sessions.day.enabled && !bookingSchedule.sessions.night.enabled) {
      setFormError('Enable at least one booking session: Day or Night.');
      return;
    }

    const enabledSessions = (['day', 'night'] as BookingSessionKey[])
      .filter((session) => bookingSchedule.sessions[session].enabled);

    const invalidSession = enabledSessions.find((session) => {
      const config = bookingSchedule.sessions[session];
      return !/^([01]\d|2[0-3]):[0-5]\d$/.test(config.startTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(config.endTime) ||
        config.startTime === config.endTime;
    });

    if (invalidSession) {
      setFormError(`Set a valid start and end time for the ${invalidSession === 'day' ? 'Day' : 'Night'} session.`);
      return;
    }

    if (bookingSchedule.extension.enabled) {
      if (!Number.isFinite(Number(bookingSchedule.extension.feePerHour)) || bookingSchedule.extension.feePerHour <= 0) {
        setFormError('Enter an extension fee greater than zero, or disable the extension option.');
        return;
      }
      if (!Number.isInteger(bookingSchedule.extension.maxHours) || bookingSchedule.extension.maxHours < 1 || bookingSchedule.extension.maxHours > 12) {
        setFormError('Maximum extension must be between 1 and 12 hours.');
        return;
      }
    }

    // Keep legacy price fields so existing customer/admin screens continue to work.
    const lowestRate = [...validPricingOptions].sort((a, b) => a.price - b.price)[0];

    if (pkgImages.length + existingImageUrls.length === 0) {
      setFormError('Please upload at least one accommodation photo.');
      return;
    }

    if (
      freeKidsEnabled &&
      (
        !Number.isInteger(Number(freeKidsUnderAge)) ||
        Number(freeKidsUnderAge) < 1 ||
        Number(freeKidsUnderAge) > 17
      )
    ) {
      setFormError(
        'Enter a valid child age from 1 to 17, or turn off the free-children policy.'
      );

      return;
    }

    if (latitude === null || longitude === null) {
      setFormError(
        'Please select the exact accommodation location on the map.'
      );

      return;
    }

    if (!userData.resortName || !userData.resortLocation) {
      setFormError(
        'Your resort name or location is missing from your owner profile.'
      );

      return;
    }

    setIsSubmitting(true);

    try {
      // Compress up to four photos and store them as Base64 in Firestore.
      // Keep each photo small to stay within Firestore's 1 MiB document limit.
      const uploadedImageUrls = await Promise.all(
        pkgImages.map(async (image) => {
          const compressedFile = await imageCompression(image, {
            maxSizeMB: 0.08,
            maxWidthOrHeight: 900,
            useWebWorker: true,
            fileType: 'image/jpeg',
            initialQuality: 0.65,
          });

          return convertImageToBase64(compressedFile);
        })
      );

      const imageUrls = [...existingImageUrls, ...uploadedImageUrls].slice(0, 4);
      const totalImageCharacters = imageUrls.reduce(
        (total, image) => total + image.length,
        0
      );

      if (totalImageCharacters > 650000) {
        throw new Error(
          'The selected photos are still too large. Please choose smaller images or upload fewer photos.'
        );
      }

      // Publish accommodation directly.
      // No Firebase Storage upload or additional admin approval is needed.
      const packagePayload = {
        ownerId: currentUser.uid,

        resortName: userData.resortName,
        resortLocation: userData.resortLocation,

        name,
        resortType: pkgResortType,
        category: pkgResortType,

        // Reservation routing metadata used by guest-side reservation screens.
        usageType,
        eventTypes: usageType === 'event' ? [...eventTypes] : [],
        reservationMode:
          usageType === 'event'
            ? 'event_booking'
            : usageType === 'overnight'
              ? 'overnight_stay'
              : 'day_use',

        // Full pricing structure for the customer-facing accommodation details.
        pricingOptions: validPricingOptions,



        // Backward-compatible fields for screens that still read price/priceUnit.
        price: lowestRate.price,
        priceUnit: lowestRate.unit,
        pricingLabel: `From ₱${lowestRate.price.toLocaleString('en-PH')} / ${lowestRate.unit}`,

        childFreeUnderAge: freeKidsEnabled
          ? Number(freeKidsUnderAge || 4)
          : null,

        description: pkgDesc.trim(),


        // First image is the cover photo.
        imageUrl: imageUrls[0],
        imageUrls,

        locationLabel:
          selectedLocationLabel || userData.resortLocation,

        latitude,
        longitude,

        availability: pkgAvailability,

        // Weekly availability and session rules shown to guests during booking.
        bookingSchedule: {
          availableDays: [...bookingSchedule.availableDays],
          sessions: {
            day: { ...bookingSchedule.sessions.day },
            night: { ...bookingSchedule.sessions.night },
          },
          extension: {
            enabled: bookingSchedule.extension.enabled,
            feePerHour: Number(bookingSchedule.extension.feePerHour || 0),
            maxHours: Number(bookingSchedule.extension.maxHours || 4),
          },
        },

        // Owner's resort account has already been approved.
        // Individual accommodation posts do not need admin approval.
        status: 'published',

        ...(editingPackageId ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      };

      if (editingPackageId) {
        const existingPackage = packages.find((item) => item.id === editingPackageId);
        if (!existingPackage || existingPackage.ownerId !== currentUser.uid) {
          throw new Error('You are not allowed to edit this listing.');
        }
        await updateDoc(doc(db, 'packages', editingPackageId), packagePayload);
        setFeedbackModal({
          title: 'Changes saved',
          message: 'Your accommodation details have been updated successfully.',
          variant: 'success',
        });
      } else {
        await addDoc(collection(db, 'packages'), packagePayload);
        setFeedbackModal({
          title: 'Listing published',
          message: 'Your accommodation is now published and available according to its availability settings.',
          variant: 'success',
        });
      }

      setShowAddModal(false);
      resetPackageForm();
    } catch (error) {
      console.error('Error publishing accommodation:', error);

      setFormError(
        error instanceof Error
          ? error.message
          : 'Failed to publish your accommodation. Check your internet connection and Firestore permissions.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================
  // DISPLAY HELPERS
  // =========================================================

  const formatPrice = (price: number, unit?: string) =>
    `₱${Number(price || 0).toLocaleString('en-PH')} / ${unit || 'night'}`;

  const getPackagePricingOptions = (pkg: OwnerPackage): PricingOption[] => {
    if (pkg.pricingOptions?.length) return pkg.pricingOptions;
    // Support older listings created before multiple pricing was added.
    return [{ id: 'legacy', unit: (pkg.priceUnit as PricingUnit) || 'night', price: Number(pkg.price || 0) }];
  };

  const formatPackagePricing = (pkg: OwnerPackage) =>
    getPackagePricingOptions(pkg)
      .map((option) => {
        const duration = option.durationHours ? ` (${option.durationHours} hrs)` : '';
        const guests = option.guestCapacity ? ` · up to ${option.guestCapacity} guests` : '';
        return `${formatPrice(option.price, option.unit)}${duration}${guests}`;
      })
      .join(' · ');

  const firstName =
    String(userData?.fullName || 'Host')
      .trim()
      .split(/\s+/)[0] || 'Host';

  const availableCount = packages.filter(
    (pkg) => pkg.availability !== 'unavailable'
  ).length;

  // =========================================================
  // LOADING SCREEN
  // =========================================================

  if (loading) {
    return (
      <IonPage>
        <IonContent className="owner-bg">
          <div className="owner-loading-screen">
            <div className="owner-loading-logo">
              <img
                src="/assets/mindoro-scape-logo.png"
                alt="Mindoro Scape"
              />
            </div>

            <IonSpinner name="crescent" />

            <p>Preparing your host dashboard...</p>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  // =========================================================
  // MISSING OWNER PROFILE
  // =========================================================

  if (!userData) {
    return (
      <IonPage>
        <IonContent className="owner-bg">
          <div className="owner-loading-screen">
            <div className="owner-empty-icon">
              <IonIcon icon={informationCircleOutline} />
            </div>

            <h2>Owner profile not found</h2>

            <p>Please sign in again or contact support.</p>

            <button
              className="btn-primary"
              onClick={() =>
                navigate('/login?role=owner', {
                  replace: true,
                })
              }
            >
              Return to Login
            </button>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  // =========================================================
  // MAIN DASHBOARD
  // =========================================================

  return (
    <IonPage>
      <IonContent className="owner-bg" fullscreen>
        <div className="owner-app-shell">

          {/* HEADER */}
          <header className="owner-header">
            <div className="owner-header-brand">
              <img
                src="/assets/mindoro-scape-logo.png"
                alt="Mindoro Scape"
                className="owner-logo-img"
              />

              <div className="owner-brand-copy">
                <p className="owner-eyebrow">
                  MINDORO SCAPE · HOST PORTAL
                </p>

                <h1>
                  {userData.resortName || 'Owner Dashboard'}
                </h1>

                <span className="owner-header-location">
                  <IonIcon icon={locationOutline} />

                  {userData.resortLocation || 'Resort location not set'}
                </span>
              </div>
            </div>

            <div className="owner-header-actions">
              <div className="owner-notification-wrap">
                <button
                  type="button"
                  className={`owner-icon-btn ${ownerNotificationCount > 0 ? 'has-unread' : ''}`}
                  aria-label={`Notifications${ownerNotificationCount ? `, ${ownerNotificationCount} unread` : ''}`}
                  title="Notifications"
                  aria-expanded={showOwnerNotifications}
                  onClick={() => setShowOwnerNotifications((value) => !value)}
                >
                  <IonIcon icon={notificationsOutline} />
                  {ownerNotificationCount > 0 && (
                    <span className="owner-notification-badge">
                      {ownerNotificationCount > 99 ? '99+' : ownerNotificationCount}
                    </span>
                  )}
                </button>

                {showOwnerNotifications && (
                  <div className="owner-notification-panel">
                    <div className="owner-notification-panel-head">
                      <div>
                        <strong>Notifications</strong>
                        <small>Bookings and guest messages</small>
                      </div>
                      <button type="button" onClick={() => setShowOwnerNotifications(false)} aria-label="Close notifications">
                        <IonIcon icon={closeOutline} />
                      </button>
                    </div>

                    {(unreadOwnerNotifications.length > 0 || unreadOwnerChats.length > 0) ? (
                      <div className="owner-notification-items">
                        {unreadOwnerNotifications.map((item) => (
                          <button
                            type="button"
                            className="owner-notification-item"
                            key={item.id}
                            onClick={() => void openOwnerNotification(item)}
                          >
                            <span className="owner-notification-item-icon"><IonIcon icon={calendarOutline} /></span>
                            <span className="owner-notification-item-copy">
                              <strong>New booking received</strong>
                              <small>{item.guestName || 'Guest'} · {item.resortName || userData.resortName || 'Your resort'}</small>
                              <small>{item.accommodationName || 'Accommodation'} · {item.referenceCode || item.bookingId || ''}</small>
                            </span>
                            <span className="owner-notification-unread-dot" />
                          </button>
                        ))}
                        {unreadOwnerChats.map((chat) => (
                          <button
                            type="button"
                            className="owner-notification-item"
                            key={chat.id}
                            onClick={() => void openOwnerChatNotification(chat)}
                          >
                            <span className="owner-notification-item-icon"><IonIcon icon={chatbubbleOutline} /></span>
                            <span className="owner-notification-item-copy">
                              <strong>New message from {chat.guestName || 'Guest account'}</strong>
                              <small>{chat.lastMessage || 'Open the conversation to view the message.'}</small>
                              <small>{chat.resortName || userData.resortName || 'Your resort'}</small>
                            </span>
                            <span className="owner-notification-count">{chat.unreadForOwner}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="owner-notification-empty">
                        <IonIcon icon={notificationsOutline} />
                        <strong>You're all caught up</strong>
                        <span>New bookings and guest messages will appear here.</span>
                      </div>
                    )}

                    {ownerNotificationCount > 0 && (
                      <button type="button" className="owner-notification-mark-all" onClick={() => void markAllOwnerNotificationsRead()}>
                        Mark all as read
                      </button>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="owner-logout-mini"
                onClick={handleLogout}
                aria-label="Log out"
                title="Log out"
              >
                <IonIcon icon={logOutOutline} />
              </button>
            </div>
          </header>

          {/* DASHBOARD CONTENT */}
          <main className="owner-main">

            {/* PENDING OWNER ACCOUNT */}
            {userData.status === 'pending' ? (
              <section className="owner-locked-state tab-fade-in">
                <div className="owner-page-heading">
                  <div>
                    <span className="owner-section-kicker">
                      Owner
                    </span>

                    <h2 className="owner-welcome-title">
                      Mabuhay, {firstName}!
                    </h2>

                    <p className="owner-page-description">
                      Your property application is being reviewed.
                    </p>
                  </div>

                  <div className="owner-icon-box-large pending-icon">
                    <IonIcon icon={timeOutline} />
                  </div>
                </div>

                <div className="owner-card pending-card">
                  <span className="owner-status-badge pending-badge">
                    <span className="owner-status-dot" />
                    Under review
                  </span>

                  <h3>Application Under Review</h3>

                  <p>
                    Our team is currently verifying the business permit
                    for <strong>{userData.resortName}</strong>. You will
                    be able to publish accommodations once your account
                    is approved.
                  </p>

                  <div className="owner-permit-box">
                    <div className="permit-header">
                      <IonIcon icon={documentTextOutline} />
                      <span>Submitted Permit</span>
                    </div>

                    <p className="owner-permit-id">
                      Permit ID: {userData.permitId || 'Pending'}
                    </p>

                    {userData.permitImageUrl && (
                      <img
                        src={userData.permitImageUrl}
                        alt="Submitted business permit"
                      />
                    )}
                  </div>
                </div>
              </section>

            ) : userData.status === 'approved' ? (
              activeOwnerTab === 'inquiries' ? (
                <OwnerInquiries
                  initialChatId={pendingInquiryChatId}
                  onInitialChatHandled={() => setPendingInquiryChatId(null)}
                />
              ) : activeOwnerTab === 'settings' ? (
                <OwnerSettings
                  resortName={userData.resortName || ''}
                  resortLocation={userData.resortLocation || ''}
                  onSignOut={handleLogout}
                />
              ) : activeOwnerTab === 'bookings' ? (
                <OwnerBookings
                  ownerId={auth.currentUser?.uid || ''}
                  resortName={userData.resortName || 'Your Resort'}
                  onAddPackage={openAddModal}
                />
              ) : activeOwnerTab === 'villas' ? (
                <OwnerVillas
                  ownerId={auth.currentUser?.uid || ''}
                  resortName={userData.resortName || 'Your Resort'}
                  resortLocation={userData.resortLocation || ''}
                  onAddPackage={openAddModal}
                  onEditPackage={(villa: OwnerVillaPackage) => {
                    const existingPackage = packages.find((item) => item.id === villa.id);
                    if (existingPackage) openEditPackage(existingPackage);
                  }}
                />
              ) : (
              <section className="owner-approved-state tab-fade-in">

                {/* WELCOME */}
                <div className="owner-page-heading">
                  <div>
                    <span className="owner-section-kicker">
                      HOST CONCIERGE DESK
                    </span>

                    <h2 className="owner-welcome-title">
                      Mabuhay, {firstName}!
                    </h2>

                    <p className="owner-page-description">
                      Here's an overview of your resort accommodations.
                    </p>
                  </div>

                  <div className="owner-icon-box-large approved-icon">
                    <IonIcon icon={checkmarkCircleOutline} />
                  </div>
                </div>

                {/* PROPERTY SUMMARY */}
                <div className="owner-property-pill">
                  <div className="owner-prop-info">
                    <div className="owner-prop-icon">
                      <IonIcon icon={bedOutline} />
                    </div>

                    <div className="owner-prop-copy">
                      <h4>{userData.resortName}</h4>

                      <p>
                        <IonIcon icon={locationOutline} />
                        {userData.resortLocation}
                      </p>

                      <span className="owner-verified-label">
                        <IonIcon icon={checkmarkCircleOutline} />
                        Verified host
                      </span>
                    </div>
                  </div>

                  <div className="owner-status-live">
                    <span className="dot-green" />
                    Approved
                  </div>
                </div>

                {/* STATISTICS */}
                <div className="owner-stats-grid">
                  <article className="owner-stat-card">
                    <div className="owner-stat-top">
                      <span className="stat-label">Your listings</span>

                      <span className="owner-stat-icon">
                        <IonIcon icon={bedOutline} />
                      </span>
                    </div>

                    <h3 className="stat-value">
                      {packages.length}
                    </h3>

                    <span className="stat-trend">
                      Villas and accommodations
                    </span>
                  </article>

                  <article className="owner-stat-card">
                    <div className="owner-stat-top">
                      <span className="stat-label">Available</span>

                      <span className="owner-stat-icon revenue-icon">
                        <IonIcon icon={checkmarkCircleOutline} />
                      </span>
                    </div>

                    <h3 className="stat-value">
                      {availableCount}
                    </h3>

                    <span className="stat-sub">
                      Accommodations available to guests
                    </span>
                  </article>
                </div>

                {/* OWNER DASHBOARD WEATHER */}
                <section className="owner-weather-card owner-dashboard-weather">
                  <div className="owner-weather-heading">
                    <div className="owner-weather-heading-icon">
                      <IonIcon icon={sparklesOutline} />
                    </div>
                    <div>
                      <span className="owner-weather-kicker">LOCAL WEATHER</span>
                      <h4>Weather at your resort</h4>
                      <p>Current weather conditions based on your resort location.</p>
                    </div>
                    <button
                      type="button"
                      className="owner-weather-refresh"
                      onClick={() => setWeatherRefresh((value) => value + 1)}
                      disabled={weatherLoading}
                      aria-label="Refresh weather"
                    >
                      <IonIcon icon={timeOutline} />
                    </button>
                  </div>

                  {weatherLoading ? (
                    <div className="owner-weather-placeholder">
                      <IonSpinner name="crescent" />
                      <strong>Checking resort weather...</strong>
                      <span>Retrieving the latest available conditions.</span>
                    </div>
                  ) : weatherError ? (
                    <div className="owner-weather-error" role="status">
                      <IonIcon icon={informationCircleOutline} />
                      <div>
                        <strong>Weather service unavailable</strong>
                        <span>{weatherError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWeatherRefresh((value) => value + 1)}
                      >
                        Retry
                      </button>
                    </div>
                  ) : accommodationWeather ? (
                    <>
                      <div className="owner-weather-current">
                        <div className="owner-weather-current-main">
                          {accommodationWeather.icon && (
                            <img
                              src={`https://openweathermap.org/img/wn/${accommodationWeather.icon}@2x.png`}
                              alt={accommodationWeather.description || 'Weather icon'}
                            />
                          )}
                          <div>
                            <strong>{Math.round(Number(accommodationWeather.temperature || 0))}°C</strong>
                            <span>{accommodationWeather.description || accommodationWeather.condition}</span>
                          </div>
                        </div>
                        <div className="owner-weather-location">
                          <IonIcon icon={locationOutline} />
                          {accommodationWeather.location || userData?.resortLocation || 'Your resort'}
                        </div>
                      </div>

                      <div className="owner-weather-stats">
                        <div>
                          <span>Feels like</span>
                          <strong>{Math.round(Number(accommodationWeather.feelsLike || 0))}°C</strong>
                        </div>
                        <div>
                          <span>Humidity</span>
                          <strong>{Number(accommodationWeather.humidity || 0)}%</strong>
                        </div>
                        <div>
                          <span>Wind speed</span>
                          <strong>{Number(accommodationWeather.windSpeed || 0)} m/s</strong>
                        </div>
                        <div>
                          <span>Rainfall</span>
                          <strong>{Number(accommodationWeather.rain || 0)} mm</strong>
                        </div>
                      </div>

                      {(() => {
                        const advisory = getAccommodationWeatherAdvisory(accommodationWeather);
                        return (
                          <div className={`owner-weather-advisory ${advisory.level}`}>
                            <IonIcon
                              icon={
                                advisory.level === 'warning'
                                  ? informationCircleOutline
                                  : advisory.level === 'caution'
                                    ? timeOutline
                                    : checkmarkCircleOutline
                              }
                            />
                            <div>
                              <strong>{advisory.title}</strong>
                              <span>{advisory.message}</span>
                            </div>
                          </div>
                        );
                      })()}

                      <small className="owner-weather-disclaimer">
                        Informational weather conditions only. This is not an official storm warning.
                        Follow PAGASA for official warnings and safety instructions.
                      </small>
                    </>
                  ) : (
                    <div className="owner-weather-placeholder">
                      <IonIcon icon={locationOutline} />
                      <strong>Weather is not available yet</strong>
                      <span>Check your resort location and try refreshing.</span>
                    </div>
                  )}
                </section>

                {/* QUICK ACTION */}
                <div className="owner-section-heading">
                  <div>
                    <span className="owner-section-kicker">
                      QUICK ACTIONS
                    </span>

                    <h3>Manage your property</h3>
                  </div>
                </div>

                <button
                  type="button"
                  className="owner-action-banner"
                  onClick={openAddModal}
                >
                  <span className="owner-action-banner-icon">
                    <IonIcon icon={addCircleOutline} />
                  </span>

                  <span className="owner-action-banner-copy">
                    <strong>Add a new accommodation</strong>

                    <small>
                      Add photos, rates, included amenities for each rate, and exact location.
                    </small>
                  </span>

                  <span className="owner-action-arrow">+</span>
                </button>

                {/* RECENT LISTINGS / ALL VILLAS */}
                <div className="owner-section-heading owner-list-heading">
                  <div>
                    <span className="owner-section-kicker">
                      YOUR PROPERTY
                    </span>

                    <h3>{showAllListings ? 'All accommodations' : 'Recent listings'}</h3>
                  </div>

                  {packages.length > 3 && (
                    <button
                      type="button"
                      className="owner-text-button"
                      onClick={() => setShowAllListings((current) => !current)}
                      aria-expanded={showAllListings}
                    >
                      {showAllListings ? 'Show less' : 'View all'}
                    </button>
                  )}
                </div>

                {packages.length === 0 ? (
                  <div className="owner-empty-packages">
                    <div className="owner-empty-icon">
                      <IonIcon icon={imagesOutline} />
                    </div>

                    <h4>Your listings start here</h4>

                    <p>
                      Add your first accommodation to show travelers
                      what your resort offers.
                    </p>

                    <button
                      type="button"
                      className="btn-primary"
                      onClick={openAddModal}
                    >
                      <IonIcon icon={addCircleOutline} />
                      Create first listing
                    </button>
                  </div>
                ) : (
                  <div className="owner-package-list">
                    {packages.slice(0, showAllListings ? packages.length : 3).map((pkg) => (
                      <article
                        className="owner-package-card"
                        key={pkg.id}
                      >
                        {(pkg.imageUrls?.length
                          ? pkg.imageUrls[0]
                          : pkg.imageUrl) ? (
                          <img
                            src={pkg.imageUrls?.[0] || pkg.imageUrl}
                            alt={pkg.name}
                          />
                        ) : (
                          <div className="pkg-img-placeholder">
                            <IonIcon icon={imagesOutline} />
                          </div>
                        )}

                        <div className="pkg-details">
                          <h4>{pkg.name}</h4>
                          <small className="owner-package-category">{pkg.resortType || pkg.category || 'Beach Resort'}</small>

                          <p className="owner-package-pricing">
                            {formatPackagePricing(pkg)}
                          </p>


                          {pkg.description && (
                            <small>{pkg.description}</small>
                          )}

                          <span
                            className="owner-verified-label"
                            style={{
                              color:
                                pkg.availability === 'unavailable'
                                  ? '#b45309'
                                  : '#15803d',
                              marginTop: '6px',
                            }}
                          >
                            {pkg.availability === 'unavailable'
                              ? 'Currently unavailable'
                              : 'Available to guests'}
                          </span>
                          <div className="owner-package-actions">
                            <button type="button" className="owner-package-edit-btn" onClick={() => openEditPackage(pkg)}>
                              <IonIcon icon={documentTextOutline} /> Edit
                            </button>
                            <button type="button" className="owner-package-delete-btn" onClick={() => handleDeletePackage(pkg)}>
                              <IonIcon icon={closeOutline} /> Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              )
            ) : userData.status === 'rejected' ? (
              <section className="owner-card">
                <h2>Application not approved</h2>

                <p>
                  Your resort account application was not approved.
                  Please contact the administrator for assistance.
                </p>
              </section>

            ) : (
              <section className="owner-card">
                <h2>Account status unavailable</h2>

                <p>
                  Your owner account does not have a recognized approval
                  status. Please contact the administrator.
                </p>
              </section>
            )}
          </main>
                    {/* BOTTOM NAVIGATION */}
          {userData.status === 'approved' && (
            <nav
              className="owner-bottom-nav"
              aria-label="Owner navigation"
            >
              <button
                type="button"
                className={activeOwnerTab === 'overview' ? 'active' : ''}
                onClick={() => { setActiveOwnerTab('overview'); setShowAllListings(false); }}
                aria-current={activeOwnerTab === 'overview' ? 'page' : undefined}
              >
                <IonIcon icon={gridOutline} />
                <span>Overview</span>
              </button>

              <button type="button" className={activeOwnerTab === 'bookings' ? 'active' : ''} onClick={() => setActiveOwnerTab('bookings')} aria-current={activeOwnerTab === 'bookings' ? 'page' : undefined}>
                <IonIcon icon={calendarOutline} />
                <span>Bookings</span>
              </button>

              <button
                type="button"
                className={activeOwnerTab === 'villas' ? 'active' : ''}
                onClick={() => { setActiveOwnerTab('villas'); setShowAllListings(true); }}
                aria-current={activeOwnerTab === 'villas' ? 'page' : undefined}
              >
                <IonIcon icon={bedOutline} />
                <span>Villas</span>
              </button>

              <button
                type="button"
                className={activeOwnerTab === 'inquiries' ? 'active' : ''}
                onClick={() => { setActiveOwnerTab('inquiries'); setShowAllListings(false); }}
                aria-current={activeOwnerTab === 'inquiries' ? 'page' : undefined}
              >
                <IonIcon icon={chatbubbleOutline} />
                <span>Inquiries</span>
              </button>

              <button
                type="button"
                className={activeOwnerTab === 'settings' ? 'active' : ''}
                onClick={() => {
                  setActiveOwnerTab('settings');
                  setShowAllListings(false);
                }}
                aria-current={activeOwnerTab === 'settings' ? 'page' : undefined}
                aria-label="Open owner settings"
              >
                <IonIcon icon={optionsOutline} />
                <span>Settings</span>
              </button>
            </nav>
          )}

          {/* ADD ACCOMMODATION MODAL */}
          {showAddModal && (
            <div
              className="owner-modal-backdrop"
              onClick={closeAddModal}
              role="presentation"
            >
              <section
                className="owner-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="owner-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="owner-modal-header">
                  <div className="owner-modal-title-wrap">
                    <span className="owner-modal-kicker">
                      <IonIcon icon={sparklesOutline} />
                      PROPERTY LISTING
                    </span>

                    <h3 id="owner-modal-title">
                      {editingPackageId ? 'Edit accommodation' : 'Add a new accommodation'}
                    </h3>

                    <p>
                      Share the details guests need to choose their stay.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={closeAddModal}
                    disabled={isSubmitting}
                    aria-label="Close form"
                  >
                    <IonIcon icon={closeOutline} />
                  </button>
                </header>

                <form
                  onSubmit={handleAddPackage}
                  className="owner-form"
                >
                  <div className="owner-modal-body">

                    {/* ACCOMMODATION PHOTOS */}
                    <div className="owner-form-section">
                      <div className="owner-form-section-heading">
                        <span className="owner-form-step">01</span>

                        <div>
                          <h4>Accommodation photos</h4>

                          <p>
                            Upload up to four clear photos of your accommodation.
                          </p>
                        </div>
                      </div>

                      <div className="owner-file-upload">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          id="pkg-images"
                          multiple
                          onChange={handleImageChange}
                          disabled={
                            isSubmitting || pkgImages.length + existingImageUrls.length >= 4
                          }
                        />

                        <label
                          htmlFor="pkg-images"
                          className="owner-upload-label"
                        >
                          <span className="owner-upload-empty">
                            <span className="owner-upload-icon">
                              <IonIcon icon={cloudUploadOutline} />
                            </span>

                            <strong>
                              {pkgImages.length + existingImageUrls.length >= 4
                                ? 'Maximum of 4 photos selected'
                                : 'Click to add photos'}
                            </strong>

                            <small>
                              JPG, PNG, or WebP · Maximum 5 MB each ·{' '}
                              {pkgImages.length + existingImageUrls.length}/4 selected
                            </small>
                          </span>
                        </label>

                        {pkgImagePreviews.length > 0 && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns:
                                'repeat(2, minmax(0, 1fr))',
                              gap: '10px',
                              marginTop: '12px',
                            }}
                          >
                            {pkgImagePreviews.map((preview, index) => (
                              <div
                                key={`${preview}-${index}`}
                                style={{
                                  position: 'relative',
                                  borderRadius: '12px',
                                  overflow: 'hidden',
                                  minHeight: '120px',
                                }}
                              >
                                <img
                                  src={preview}
                                  alt={`Accommodation photo ${index + 1}`}
                                  style={{
                                    width: '100%',
                                    height: '130px',
                                    objectFit: 'cover',
                                    display: 'block',
                                  }}
                                />

                                <span
                                  style={{
                                    position: 'absolute',
                                    left: '8px',
                                    top: '8px',
                                    background: 'rgba(0,0,0,.65)',
                                    color: '#fff',
                                    padding: '3px 8px',
                                    borderRadius: '20px',
                                    fontSize: '11px',
                                  }}
                                >
                                  {index === 0
                                    ? 'Cover photo'
                                    : `Photo ${index + 1}`}
                                </span>

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeSelectedImage(index)
                                  }
                                  disabled={isSubmitting}
                                  aria-label={`Remove photo ${index + 1}`}
                                  style={{
                                    position: 'absolute',
                                    right: '7px',
                                    top: '7px',
                                    border: 0,
                                    borderRadius: '50%',
                                    width: '28px',
                                    height: '28px',
                                    background: '#fff',
                                    color: '#b91c1c',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* LISTING DETAILS */}
                    <div className="owner-form-section">
                      <div className="owner-form-section-heading">
                        <span className="owner-form-step">02</span>

                        <div>
                          <h4>Listing details</h4>

                          <p>
                            Add the accommodation name, price basis,
                            guest policy, and details.
                          </p>
                        </div>
                      </div>

                      <div className="owner-form-grid">

                        {/* ACCOMMODATION NAME */}
                        <div className="form-group owner-field-full">
                          <label htmlFor="pkg-name">
                            Villa / Accommodation Name <span>*</span>
                          </label>

                          <input
                            id="pkg-name"
                            type="text"
                            placeholder="e.g. Deluxe Ocean Villa"
                            value={pkgName}
                            onChange={(event) =>
                              setPkgName(event.target.value)
                            }
                            maxLength={100}
                            required
                            disabled={isSubmitting}
                          />
                        </div>

                        {/* RESORT TYPE / CATEGORY */}
                        <div className="form-group owner-field-full">
                          <label htmlFor="pkg-resort-type">Resort Type <span>*</span></label>
                          <small className="owner-field-hint">Choose the category guests will see when browsing resorts.</small>
                          <select
                            id="pkg-resort-type"
                            className="owner-resort-type-select"
                            value={pkgResortType}
                            onChange={(event) => setPkgResortType(event.target.value as typeof pkgResortType)}
                            disabled={isSubmitting}
                            required
                          >
                            <option value="Private Resort">Private Resort</option>
                            <option value="Public Resort">Public Resort</option>
                            <option value="Beach Resort">Beach Resort</option>
                            <option value="Nature Resort">Nature Resort</option>
                            <option value="Family Resort">Family Resort</option>
                          </select>
                        </div>

                        {/* LISTING PURPOSE / RESERVATION TYPE */}
                        <div className="form-group owner-field-full">
                          <label>What will guests reserve? <span>*</span></label>
                          <small className="owner-field-hint">
                            This determines which reservation flow should be shown to guests.
                          </small>

                          <div className="owner-usage-type-grid">
                            {LISTING_USAGE_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`owner-usage-option ${usageType === option.value ? 'is-selected' : ''}`}
                                onClick={() => {
                                  setUsageType(option.value);
                                  setPricingOptions((current) => {
                                    if (current.length !== 1 || Number(current[0].price) > 0) return current;
                                    const nextUnit: PricingUnit =
                                      option.value === 'overnight'
                                        ? 'night'
                                        : option.value === 'event'
                                          ? 'package'
                                          : 'person';
                                    return [{
                                      ...current[0],
                                      unit: nextUnit,
                                      durationHours: nextUnit === 'night' ? 12 : undefined,
                                      guestCapacity: nextUnit === 'person' ? 1 : undefined,
                                      minimumHours: undefined,
                                    }];
                                  });
                                }}
                                disabled={isSubmitting}
                                aria-pressed={usageType === option.value}
                              >
                                <strong>{option.label}</strong>
                                <span>{option.description}</span>
                              </button>
                            ))}
                          </div>

                          {usageType === 'event' && (
                            <div className="owner-event-types">
                              <label>Events accepted by this venue <span>*</span></label>
                              <small className="owner-field-hint">
                                Select all events that guests may request.
                              </small>
                              <div className="owner-event-type-grid">
                                {EVENT_TYPE_OPTIONS.map((eventType) => (
                                  <label
                                    key={eventType}
                                    className={`owner-event-type-option ${eventTypes.includes(eventType) ? 'is-selected' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={eventTypes.includes(eventType)}
                                      onChange={(event) => setEventTypes((current) =>
                                        event.target.checked
                                          ? [...current, eventType]
                                          : current.filter((item) => item !== eventType)
                                      )}
                                      disabled={isSubmitting}
                                    />
                                    <span>{eventType}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="owner-event-hint">
                                Guests choosing this listing can identify their event type, event date,
                                expected guests, and preferred event schedule in the reservation flow.
                              </div>
                            </div>
                          )}

                          {usageType === 'swimming' && (
                            <div className="owner-usage-hint">
                              <strong>Day-use reservation</strong>
                              <span>
                                Guests reserve a swimming visit by date, session, number of swimmers,
                                and selected entrance or cottage rates. Overnight details are not required.
                              </span>
                            </div>
                          )}

                          {usageType === 'overnight' && (
                            <div className="owner-usage-hint">
                              <strong>Overnight reservation</strong>
                              <span>
                                Guests reserve a stay using check-in and check-out dates, number of guests,
                                and the selected room or accommodation rate.
                              </span>
                            </div>
                          )}
                        </div>

                        {/* FLEXIBLE PRICING OPTIONS */}
                        <div className="form-group owner-field-full">
                          <div className="owner-flex-pricing-heading"><div><label>Accommodation Rates <span>*</span></label><small className="owner-field-hint">Add every way guests can pay. Resort type does not limit pricing choices.</small></div><button type="button" className="owner-add-rate-btn" onClick={() => setPricingOptions((items) => [...items, { id: `rate-${Date.now()}-${items.length}`, unit: 'person', price: 0 }])} disabled={isSubmitting}>+ Add rate</button></div>
                          {pricingOptions.map((option, index) => <div className="owner-flex-rate-card" key={option.id}>
                            <div className="owner-flex-rate-top"><strong>Rate {index + 1}</strong>{pricingOptions.length > 1 && <button type="button" className="owner-remove-rate" onClick={() => setPricingOptions((items) => items.filter((item) => item.id !== option.id))} disabled={isSubmitting}>Remove</button>}</div>
                            <div className="owner-flex-rate-grid">
                              <div><label>Pricing basis</label><select value={option.unit} onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id ? { ...item, unit: event.target.value as PricingUnit, durationHours: ['person','cottage','package','day','night'].includes(event.target.value) ? (item.durationHours || (event.target.value === 'night' ? 12 : 8)) : undefined, minimumHours: event.target.value === 'hour' ? (item.minimumHours || 1) : undefined } : item))} disabled={isSubmitting}><option value="person">Per Person</option><option value="cottage">Per Cottage</option><option value="hour">Per Hour</option><option value="day">Per Day</option><option value="night">Per Night</option><option value="package">Per Package</option><option value="fixed">Fixed / One-time</option></select></div>
                              <div><label>Price (₱)</label><input type="number" min="1" step="1" value={option.price || ''} placeholder="e.g. 500" onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id ? { ...item, price: Number(event.target.value) } : item))} disabled={isSubmitting} /></div>
                              {['person','cottage','hour','day','night','package'].includes(option.unit) && <div><label>{option.unit === 'hour' ? 'Minimum hours' : 'Duration (hours)'}</label><input type="number" min="1" max="24" value={option.unit === 'hour' ? option.minimumHours || 1 : option.durationHours || ''} onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id ? (item.unit === 'hour' ? { ...item, minimumHours: Number(event.target.value) } : { ...item, durationHours: Number(event.target.value) }) : item))} disabled={isSubmitting} /></div>}
                              {['person','cottage','package'].includes(option.unit) && <div><label>{option.unit === 'person' ? 'Guests (optional)' : option.unit === 'cottage' ? 'Cottage capacity' : 'Guests included'}</label><input type="number" min="1" max="100" value={option.guestCapacity || ''} placeholder="e.g. 5" onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id ? { ...item, guestCapacity: event.target.value ? Number(event.target.value) : undefined } : item))} disabled={isSubmitting} /></div>}
                              {option.unit === 'cottage' && <div><label>Cottage name (optional)</label><input type="text" value={option.label || ''} placeholder="e.g. Small Cottage" onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item))} disabled={isSubmitting} /></div>}
                            </div>
                            <div className="owner-rate-amenities-field">
                              <label>Included amenities for this rate (optional)</label>
                              <input
                                type="text"
                                value={Array.isArray(option.includedAmenities) ? option.includedAmenities.join(', ') : option.includedAmenities || ''}
                                placeholder="e.g. Pool access, Wi-Fi, parking, free breakfast"
                                onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id ? { ...item, includedAmenities: event.target.value } : item))}
                                disabled={isSubmitting}
                              />
                              <small className="owner-field-hint">Separate each amenity with a comma. These apply only to Rate {index + 1}.</small>
                            </div>
                            <div className="owner-rate-services">
                              <div className="owner-flex-pricing-heading">
                                <div>
                                  <label>Additional Services for Rate {index + 1}</label>
                                  <small className="owner-field-hint">Optional services available only when this rate is selected.</small>
                                </div>
                                <button
                                  type="button"
                                  className="owner-add-rate-btn"
                                  onClick={() => setPricingOptions((items) => items.map((item) => item.id === option.id
                                    ? { ...item, additionalServices: [...(item.additionalServices || []), { id: `service-${Date.now()}-${(item.additionalServices || []).length}`, name: '', price: 0, unit: 'fixed', included: false }] }
                                    : item
                                  ))}
                                  disabled={isSubmitting}
                                >+ Add service</button>
                              </div>
                              {(option.additionalServices || []).map((service, serviceIndex) => (
                                <div className="owner-flex-rate-card owner-service-card" key={service.id}>
                                  <div className="owner-flex-rate-top">
                                    <strong>Service {serviceIndex + 1}</strong>
                                    <button
                                      type="button"
                                      className="owner-remove-rate"
                                      onClick={() => setPricingOptions((items) => items.map((item) => item.id === option.id
                                        ? { ...item, additionalServices: (item.additionalServices || []).filter((entry) => entry.id !== service.id) }
                                        : item
                                      ))}
                                      disabled={isSubmitting}
                                    >Remove</button>
                                  </div>
                                  <div className="owner-flex-rate-grid">
                                    <div>
                                      <label>Service name</label>
                                      <input value={service.name} placeholder="e.g. Videoke rental" onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id
                                        ? { ...item, additionalServices: (item.additionalServices || []).map((entry) => entry.id === service.id ? { ...entry, name: event.target.value } : entry) }
                                        : item
                                      ))} disabled={isSubmitting} />
                                    </div>
                                    <div>
                                      <label>Charge basis</label>
                                      <select value={service.unit} onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id
                                        ? { ...item, additionalServices: (item.additionalServices || []).map((entry) => entry.id === service.id ? { ...entry, unit: event.target.value as AddOnOption['unit'] } : entry) }
                                        : item
                                      ))} disabled={isSubmitting}>
                                        <option value="fixed">Fixed fee</option>
                                        <option value="per_person">Per person</option>
                                        <option value="per_hour">Per hour</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label>Price (₱)</label>
                                      <input type="number" min="0" value={service.included ? 0 : service.price || ''} onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id
                                        ? { ...item, additionalServices: (item.additionalServices || []).map((entry) => entry.id === service.id ? { ...entry, price: Number(event.target.value) } : entry) }
                                        : item
                                      ))} disabled={isSubmitting || service.included} />
                                    </div>
                                  </div>
                                  <label className="owner-addon-included">
                                    <input type="checkbox" checked={service.included} onChange={(event) => setPricingOptions((items) => items.map((item) => item.id === option.id
                                      ? { ...item, additionalServices: (item.additionalServices || []).map((entry) => entry.id === service.id ? { ...entry, included: event.target.checked, price: event.target.checked ? 0 : entry.price } : entry) }
                                      : item
                                    ))} disabled={isSubmitting} />
                                    Included in this rate (free)
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>)}
                          <small className="owner-field-hint">Example: ₱50 per person entrance + ₱450 per cottage + ₱200 per hour. Each rate can have different included amenities.</small>
                        </div>


                        {/* CHILDREN POLICY */}
                        <div
                          className="form-group owner-field-full"
                          style={{
                            padding: '14px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '12px',
                            background: '#fff',
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '9px',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={freeKidsEnabled}
                              onChange={(event) =>
                                setFreeKidsEnabled(event.target.checked)
                              }
                              disabled={isSubmitting}
                            />

                            Children below a certain age stay free
                          </label>

                          {freeKidsEnabled && (
                            <div style={{ marginTop: '12px' }}>
                              <label htmlFor="free-kids-age">
                                Free for children under
                              </label>

                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                }}
                              >
                                <input
                                  id="free-kids-age"
                                  type="number"
                                  min="1"
                                  max="17"
                                  value={freeKidsUnderAge}
                                  onChange={(event) =>
                                    setFreeKidsUnderAge(event.target.value)
                                  }
                                  disabled={isSubmitting}
                                  style={{ maxWidth: '110px' }}
                                />

                                <span>years old</span>
                              </div>

                              <small className="owner-field-hint">
                                Example: Children under 4 years old are free.
                              </small>
                            </div>
                          )}
                        </div>

                        {/* DESCRIPTION */}
                        <div className="form-group owner-field-full">
                          <label htmlFor="pkg-description">
                            Description
                          </label>

                          <textarea
                            id="pkg-description"
                            placeholder="Describe the accommodation, experience, or inclusions..."
                            value={pkgDesc}
                            onChange={(event) =>
                              setPkgDesc(event.target.value)
                            }
                            rows={4}
                            maxLength={1200}
                            disabled={isSubmitting}
                          />

                          <small className="owner-character-count">
                            {pkgDesc.length}/1200 characters
                          </small>
                        </div>

                        {/* AVAILABILITY */}
                        <div className="form-group owner-field-full">
                          <label>Listing availability</label>
                          <div className="owner-availability-choices">
                            <label className={`owner-availability-choice available-choice ${pkgAvailability === 'available' ? 'is-selected' : ''}`}>
                              <input
                                type="radio"
                                name="pkg-availability"
                                value="available"
                                checked={pkgAvailability === 'available'}
                                onChange={() => setPkgAvailability('available')}
                                disabled={isSubmitting}
                              />
                              <span className="owner-availability-copy">
                                <strong>Available for booking</strong>
                                <small>Guests can see this listing and send booking requests.</small>
                              </span>
                              <span className="owner-availability-state">ACTIVE</span>
                            </label>
                            <label className={`owner-availability-choice unavailable-choice ${pkgAvailability === 'unavailable' ? 'is-selected' : ''}`}>
                              <input
                                type="radio"
                                name="pkg-availability"
                                value="unavailable"
                                checked={pkgAvailability === 'unavailable'}
                                onChange={() => setPkgAvailability('unavailable')}
                                disabled={isSubmitting}
                              />
                              <span className="owner-availability-copy">
                                <strong>Temporarily unavailable</strong>
                                <small>Hide this listing until you are ready to accept guests.</small>
                              </span>
                              <span className="owner-availability-state">HIDDEN</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* BOOKING SCHEDULE & AVAILABILITY */}
                    <div className="owner-form-section">
                      <div className="owner-form-section-heading">
                        <span className="owner-form-step">03</span>
                        <div>
                          <h4>Booking Schedule & Availability</h4>
                          <p>Set the days and time sessions guests can choose when requesting a reservation.</p>
                        </div>
                      </div>

                      <div className="owner-schedule-panel">
                        <div className="owner-schedule-block">
                          <div className="owner-schedule-heading">
                            <strong>Available days</strong>
                            <small>Select all days when this accommodation accepts bookings.</small>
                          </div>
                          <div className="owner-day-picker">
                            {BOOKING_DAYS.map((day) => {
                              const checked = bookingSchedule.availableDays.includes(day.value);
                              return (
                                <button
                                  type="button"
                                  className={`owner-day-option ${checked ? 'is-selected' : 'is-closed'}`}
                                  key={day.value}
                                  aria-pressed={checked}
                                  disabled={isSubmitting}
                                  onClick={() => setBookingSchedule((current) => {
                                    const isOpen = current.availableDays.includes(day.value);
                                    return {
                                      ...current,
                                      availableDays: isOpen
                                        ? current.availableDays.filter((value) => value !== day.value)
                                        : BOOKING_DAYS
                                            .map((item) => item.value)
                                            .filter((value) => value === day.value || current.availableDays.includes(value)),
                                    };
                                  })}
                                >
                                  <span>{day.label.slice(0, 3)}</span>
                                  <small>{checked ? 'Open' : 'Closed'}</small>
                                </button>
                              );
                            })}
                          </div>
                          <small className="owner-field-hint">
                            {bookingSchedule.availableDays.length
                              ? `${bookingSchedule.availableDays.length} day(s) open. Tap a day to open or close it.`
                              : 'No days selected. Guests will not be able to request a booking.'}
                          </small>
                        </div>

                        <div className="owner-schedule-sessions">
                          <article className={`owner-session-config ${bookingSchedule.sessions.day.enabled ? 'is-enabled' : ''}`}>
                            <label className="owner-session-toggle">
                              <input
                                type="checkbox"
                                checked={bookingSchedule.sessions.day.enabled}
                                onChange={(event) => updateBookingSession('day', { enabled: event.target.checked })}
                                disabled={isSubmitting}
                              />
                              <span><strong>Day session</strong><small>Default: 8:00 AM – 5:00 PM</small></span>
                            </label>
                            {bookingSchedule.sessions.day.enabled && (
                              <div className="owner-session-times">
                                <div>
                                  <label>Start time</label>
                                  <input type="time" value={bookingSchedule.sessions.day.startTime}
                                    onChange={(event) => updateBookingSession('day', { startTime: event.target.value })}
                                    disabled={isSubmitting} />
                                </div>
                                <div>
                                  <label>End time</label>
                                  <input type="time" value={bookingSchedule.sessions.day.endTime}
                                    onChange={(event) => updateBookingSession('day', { endTime: event.target.value })}
                                    disabled={isSubmitting} />
                                </div>
                              </div>
                            )}
                          </article>

                          <article className={`owner-session-config ${bookingSchedule.sessions.night.enabled ? 'is-enabled' : ''}`}>
                            <label className="owner-session-toggle">
                              <input
                                type="checkbox"
                                checked={bookingSchedule.sessions.night.enabled}
                                onChange={(event) => updateBookingSession('night', { enabled: event.target.checked })}
                                disabled={isSubmitting}
                              />
                              <span><strong>Night session</strong><small>Default: 6:00 PM – 12:00 AM</small></span>
                            </label>
                            {bookingSchedule.sessions.night.enabled && (
                              <div className="owner-session-times">
                                <div>
                                  <label>Start time</label>
                                  <input type="time" value={bookingSchedule.sessions.night.startTime}
                                    onChange={(event) => updateBookingSession('night', { startTime: event.target.value })}
                                    disabled={isSubmitting} />
                                </div>
                                <div>
                                  <label>End time</label>
                                  <input type="time" value={bookingSchedule.sessions.night.endTime}
                                    onChange={(event) => updateBookingSession('night', { endTime: event.target.value })}
                                    disabled={isSubmitting} />
                                </div>
                              </div>
                            )}
                          </article>
                        </div>

                        <div className="owner-extension-config">
                          <label className="owner-session-toggle">
                            <input
                              type="checkbox"
                              checked={bookingSchedule.extension.enabled}
                              onChange={(event) => setBookingSchedule((current) => ({
                                ...current,
                                extension: { ...current.extension, enabled: event.target.checked },
                              }))}
                              disabled={isSubmitting}
                            />
                            <span><strong>Allow session extension</strong><small>Guests may request extra hours beyond the selected session.</small></span>
                          </label>
                          {bookingSchedule.extension.enabled && (
                            <div className="owner-session-times owner-extension-fields">
                              <div>
                                <label>Extension fee per hour (₱)</label>
                                <input
                                  type="number" min="1" step="1"
                                  value={bookingSchedule.extension.feePerHour || ''}
                                  placeholder="e.g. 150"
                                  onChange={(event) => setBookingSchedule((current) => ({
                                    ...current,
                                    extension: { ...current.extension, feePerHour: Number(event.target.value) },
                                  }))}
                                  disabled={isSubmitting}
                                />
                              </div>
                              <div>
                                <label>Maximum extension hours</label>
                                <input
                                  type="number" min="1" max="12" step="1"
                                  value={bookingSchedule.extension.maxHours}
                                  onChange={(event) => setBookingSchedule((current) => ({
                                    ...current,
                                    extension: { ...current.extension, maxHours: Number(event.target.value) },
                                  }))}
                                  disabled={isSubmitting}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* LOCATION PICKER */}
                    <div className="owner-form-section">
                      <div className="owner-form-section-heading">
                        <span className="owner-form-step">04</span>

                        <div>
                          <h4>Accommodation location</h4>

                          <p>
                            Option 1: search for a place and choose a
                            suggestion. Option 2: click directly on the
                            map to drop your own pin.
                          </p>
                        </div>
                      </div>

                      {/* LOCATION SEARCH INPUT */}
                      <div
                        className="form-group owner-field-full"
                        style={{
                          position: 'relative',
                          marginBottom: '14px',
                        }}
                      >
                        <label htmlFor="location-search">
                          Search location / address
                        </label>

                        <input
                          id="location-search"
                          type="search"
                          value={locationQuery}
                          onChange={(event) =>
                            setLocationQuery(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleLocationSearchEnter();
                            }
                          }}
                          placeholder="Type resort name, barangay, municipality, or address..."
                          disabled={isSubmitting}
                          autoComplete="off"
                        />

                        {isSearchingLocation && (
                          <small className="owner-field-hint">
                            Searching locations...
                          </small>
                        )}

                        {/* LOCATION SUGGESTIONS */}
                        {locationSuggestions.length > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              zIndex: 30,
                              top: '100%',
                              left: 0,
                              right: 0,
                              background: '#fff',
                              border: '1px solid #d1d5db',
                              borderRadius: '10px',
                              boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                              maxHeight: '230px',
                              overflowY: 'auto',
                            }}
                          >
                            {locationSuggestions.map((place) => (
                              <button
                                key={place.place_id}
                                type="button"
                                onClick={() =>
                                  selectLocationSuggestion(place)
                                }
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '11px 13px',
                                  border: 0,
                                  borderBottom: '1px solid #eee',
                                  background: '#fff',
                                  color: '#273444',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                              >
                                <IonIcon
                                  icon={locationOutline}
                                  style={{
                                    marginRight: '7px',
                                    verticalAlign: 'middle',
                                  }}
                                />

                                {place.display_name}
                              </button>
                            ))}
                          </div>
                        )}

                        <small className="owner-field-hint">
                          Choose one of the suggested results. Press Enter
                          to select the first result.
                        </small>
                      </div>

                      {/* MANUAL MAP OPTION */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          margin: '10px 0',
                          color: '#64748b',
                          fontSize: '13px',
                        }}
                      >
                        <span
                          style={{
                            height: '1px',
                            flex: 1,
                            background: '#e2e8f0',
                          }}
                        />

                        OR PIN MANUALLY

                        <span
                          style={{
                            height: '1px',
                            flex: 1,
                            background: '#e2e8f0',
                          }}
                        />
                      </div>

                      <div
                        ref={mapContainerRef}
                        style={{
                          width: '100%',
                          height: '300px',
                          borderRadius: '14px',
                          overflow: 'hidden',
                          border: '1px solid #d9e1e8',
                        }}
                      />

                      <div
                        className="owner-form-note"
                        style={{ marginTop: '12px' }}
                      >
                        <IonIcon icon={mapOutline} />

                        <p>
                          {latitude !== null && longitude !== null
                            ? `Selected: ${
                                selectedLocationLabel ||
                                `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
                              }`
                            : 'No location selected yet. Select a search result or click directly on the map to drop a pin.'}
                        </p>
                      </div>



                      {latitude !== null && longitude !== null && (
                        <button
                          type="button"
                          className="owner-text-button"
                          onClick={() => {
                            setLatitude(null);
                            setLongitude(null);
                            setSelectedLocationLabel('');
                            setLocationQuery('');

                            markerRef.current?.remove();
                            markerRef.current = null;
                          }}
                          disabled={isSubmitting}
                        >
                          Clear selected location
                        </button>
                      )}
                    </div>

                    {/* INFORMATION */}
                    <div className="owner-form-note">
                      <IonIcon icon={informationCircleOutline} />

                      <p>
                        Your listing will be saved under{' '}
                        <strong>{userData.resortName}</strong>. Once
                        published, it will not need another admin approval.
                      </p>
                    </div>

                    {/* ERROR */}
                    {formError && (
                      <div
                        className="owner-form-error"
                        role="alert"
                      >
                        <IonIcon icon={informationCircleOutline} />
                        <span>{formError}</span>
                      </div>
                    )}
                  </div>

                  {/* MODAL FOOTER */}
                  <footer className="owner-modal-footer">
                    <button
                      type="button"
                      className="owner-cancel-button"
                      onClick={closeAddModal}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="btn-submit-pkg"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <IonSpinner name="crescent" />
                          <span>{editingPackageId ? 'Saving changes...' : 'Publishing...'}</span>
                        </>
                      ) : (
                        <>
                          <IonIcon icon={checkmarkCircleOutline} />
                          <span>{editingPackageId ? 'Save changes' : 'Publish listing'}</span>
                        </>
                      )}
                    </button>
                  </footer>
                </form>
              </section>
            </div>
          )}
        </div>
      </IonContent>

      {feedbackModal && (
        <div className="owner-feedback-backdrop" role="presentation">
          <section
            className={`owner-feedback-modal is-${feedbackModal.variant}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="owner-feedback-title"
            aria-describedby="owner-feedback-message"
          >
            <div className="owner-feedback-icon" aria-hidden="true">
              {feedbackModal.variant === 'success' ? (
                <IonIcon icon={checkmarkCircleOutline} />
              ) : feedbackModal.variant === 'confirm' ? (
                <IonIcon icon={informationCircleOutline} />
              ) : (
                <IonIcon icon={closeOutline} />
              )}
            </div>
            <h2 id="owner-feedback-title">{feedbackModal.title}</h2>
            <p id="owner-feedback-message">{feedbackModal.message}</p>
            <div className="owner-feedback-actions">
              {feedbackModal.variant === 'confirm' ? (
                <>
                  <button
                    type="button"
                    className="owner-feedback-cancel"
                    onClick={() => setFeedbackModal(null)}
                    disabled={feedbackBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="owner-feedback-confirm"
                    onClick={async () => {
                      const action = feedbackModal.onConfirm;
                      setFeedbackModal(null);
                      if (action) await action();
                    }}
                    disabled={feedbackBusy}
                  >
                    {feedbackModal.confirmLabel || 'Confirm'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="owner-feedback-confirm"
                  onClick={() => setFeedbackModal(null)}
                >
                  Okay
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </IonPage>
  );
};

export default OwnerDashboard;
