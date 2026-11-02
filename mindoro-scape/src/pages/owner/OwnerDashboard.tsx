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
  doc,
  addDoc,
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
import OwnerBookings from './OwnerBookings';
import OwnerVillas from './OwnerVillas';
import OwnerSettings from './OwnerSettings';
import type { OwnerVillaPackage } from './OwnerVillas';

// =========================================================
// TYPES
// =========================================================

type PricingUnit = 'person' | 'cottage' | 'hour' | 'day' | 'night' | 'package' | 'fixed';
type PricingOption = { id: string; unit: PricingUnit; price: number; durationHours?: number; minimumHours?: number; guestCapacity?: number; label?: string; includedAmenities?: string[] | string; additionalServices?: AddOnOption[] };
type AddOnOption = { id: string; name: string; price: number; unit: 'fixed' | 'per_person' | 'per_hour'; included: boolean };

type OwnerPackage = {
  id: string;
  ownerId: string;
  resortName: string;
  resortLocation: string;
  name: string;
  resortType?: 'Private Resort' | 'Public Resort' | 'Beach Resort' | 'Nature Resort' | 'Family Resort';
  category?: string;
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

type LocationSuggestion = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

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
  const [activeOwnerTab, setActiveOwnerTab] = useState<'overview' | 'bookings' | 'villas' | 'settings'>('overview');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Accommodation details and flexible pricing.
  const [pkgName, setPkgName] = useState('');
  const [pkgResortType, setPkgResortType] = useState<'Private Resort' | 'Public Resort' | 'Beach Resort' | 'Nature Resort' | 'Family Resort'>('Beach Resort');
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([{ id: 'rate-1', unit: 'night', price: 0, durationHours: 12, guestCapacity: 2 }]);


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

  // Coordinates
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [formError, setFormError] = useState('');

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
      alert('Unable to log out. Please try again.');
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
    setPricingOptions([{ id: `rate-${Date.now()}`, unit: 'night', price: 0, durationHours: 12, guestCapacity: 2 }]);


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

    setLatitude(null);
    setLongitude(null);

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
    setFormError('');
    setShowAddModal(true);
  };

  const handleDeletePackage = async (pkg: OwnerPackage) => {
    const confirmed = window.confirm(`Delete "${pkg.name}"? This action cannot be undone.`);
    if (!confirmed) return;
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || pkg.ownerId !== currentUser.uid) {
        alert('You are not allowed to delete this listing.');
        return;
      }
      await deleteDoc(doc(db, 'packages', pkg.id));
      alert('Accommodation deleted successfully.');
    } catch (error) {
      console.error('Error deleting accommodation:', error);
      alert('Unable to delete this accommodation. Please try again.');
    }
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
        alert('Accommodation updated successfully!');
      } else {
        await addDoc(collection(db, 'packages'), packagePayload);
        alert('Accommodation published successfully!');
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
              <button
                type="button"
                className="owner-icon-btn"
                aria-label="Notifications"
                title="Notifications"
              >
                <IonIcon icon={notificationsOutline} />
                <span className="owner-dot" />
              </button>

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
                      HOST CONCIERGE DESK
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
              activeOwnerTab === 'settings' ? (
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

              <button type="button" disabled title="Inquiries page is not available yet">
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

                    {/* LOCATION PICKER */}
                    <div className="owner-form-section">
                      <div className="owner-form-section-heading">
                        <span className="owner-form-step">03</span>

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
    </IonPage>
  );
};

export default OwnerDashboard;