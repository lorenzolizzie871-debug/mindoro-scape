import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IonIcon,
  IonModal,
  IonSpinner,
} from '@ionic/react';
import {
  cameraOutline, // ✅ FIXED IMPORT
  alertCircleOutline,
  apertureOutline,
  checkmarkCircleOutline,
  chevronForwardOutline,
  closeOutline,
  cloudDoneOutline,
  createOutline,
  imageOutline,
  locationOutline,
  logOutOutline,
  pauseCircleOutline,
  personCircleOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  businessOutline,
  starOutline,
  flashOutline,
  saveOutline,
} from 'ionicons/icons';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { auth, db, storage } from '../../firebase';
import './OwnerSettings.css';

type OwnerSettingsProps = {
  resortName?: string;
  resortLocation?: string;
  onSwitchToTraveler?: () => void;
  onSignOut?: () => void;
};

type OwnerProfile = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  resortName: string;
  resortLocation: string;
  resortPhotoURL: string;
  role?: string;
};

type LiveSettings = {
  propertyAvailable: boolean;
  instantBooking: boolean;
};

const DEFAULT_LIVE_SETTINGS: LiveSettings = {
  propertyAvailable: true,
  instantBooking: false,
};

const OwnerSettings: React.FC<OwnerSettingsProps> = ({
  resortName: initialResortName = '',
  resortLocation: initialLocation = '',
  onSwitchToTraveler,
  onSignOut,
}) => {
  const [uid, setUid] = useState('');
  const [profile, setProfile] = useState<OwnerProfile>({
    uid: '',
    displayName: '',
    email: '',
    photoURL: '',
    resortName: initialResortName,
    resortLocation: initialLocation,
    resortPhotoURL: '',
  });
  const [liveSettings, setLiveSettings] = useState<LiveSettings>(DEFAULT_LIVE_SETTINGS);
  const [packageCount, setPackageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState<'owner' | 'resort' | ''>('');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [resortModalOpen, setResortModalOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftResortName, setDraftResortName] = useState('');
  const [draftLocation, setDraftLocation] = useState('');
  const [savingLive, setSavingLive] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewCategory, setReviewCategory] = useState('Overall Experience');
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const ownerPhotoInput = useRef<HTMLInputElement>(null);
  const resortPhotoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUid('');
        setLoading(false);
        setError('You are signed out. Please sign in again to manage your owner settings.');
        return;
      }
      setUid(user.uid);
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const data = userSnap.exists() ? userSnap.data() : {};
        const nextProfile: OwnerProfile = {
          uid: user.uid,
          displayName: user.displayName || data.displayName || data.fullName || data.name || '',
          email: user.email || data.email || '',
          photoURL: user.photoURL || data.photoURL || data.profilePicture || '',
          resortName: data.resortName || data.businessName || initialResortName || '',
          resortLocation: data.resortLocation || data.location || initialLocation || '',
          resortPhotoURL: data.resortPhotoURL || data.coverPhotoURL || data.businessPhotoURL || '',
          role: data.role,
        };
        setProfile(nextProfile);
        setDraftName(nextProfile.displayName);
        setDraftResortName(nextProfile.resortName);
        setDraftLocation(nextProfile.resortLocation);
        const settings = data.ownerSettings || {};
        setLiveSettings({
          propertyAvailable: typeof settings.propertyAvailable === 'boolean' ? settings.propertyAvailable : DEFAULT_LIVE_SETTINGS.propertyAvailable,
          instantBooking: typeof settings.instantBooking === 'boolean' ? settings.instantBooking : DEFAULT_LIVE_SETTINGS.instantBooking,
        });
      } catch (err) {
        console.error('Owner settings profile load failed:', err);
        setError('Unable to load your profile information. Check your Firestore rules and try again.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [initialResortName, initialLocation]);

  useEffect(() => {
    if (!uid) return;
    const packagesQuery = query(collection(db, 'packages'), where('ownerId', '==', uid));
    const unsubscribe = onSnapshot(packagesQuery, (snapshot) => {
      setPackageCount(snapshot.size);
    }, (err) => {
      console.warn('Could not count owner packages:', err);
    });
    return () => unsubscribe();
  }, [uid]);

  const resortInitials = useMemo(() => {
    const name = profile.resortName.trim();
    return name ? name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() : 'MS';
  }, [profile.resortName]);

  const showNotice = (message: string) => {
    setNotice(message);
    setError('');
    window.setTimeout(() => setNotice(''), 3500);
  };

  const uploadImage = async (file: File, kind: 'owner' | 'resort') => {
    if (!uid) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5 MB or smaller.');
      return;
    }
    setUploading(kind);
    setError('');
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = kind === 'owner'
        ? `ownerProfiles/${uid}/profile-${Date.now()}.${extension}`
        : `ownerResorts/${uid}/resort-${Date.now()}.${extension}`;
      const imageRef = ref(storage, storagePath);
      await uploadBytes(imageRef, file, { contentType: file.type });
      const imageURL = await getDownloadURL(imageRef);

      if (kind === 'owner') {
        await updateProfile(auth.currentUser!, { photoURL: imageURL });
        await setDoc(doc(db, 'users', uid), {
          photoURL: imageURL,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        setProfile((current) => ({ ...current, photoURL: imageURL }));
        showNotice('Profile picture updated.');
      } else {
        await setDoc(doc(db, 'users', uid), {
          resortPhotoURL: imageURL,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        setProfile((current) => ({ ...current, resortPhotoURL: imageURL }));
        showNotice('Resort photo updated.');
      }
    } catch (err) {
      console.error('Image upload failed:', err);
      setError('Image upload failed. Check Firebase Storage rules and try again.');
    } finally {
      setUploading('');
    }
  };

  const saveOwnerProfile = async () => {
    if (!uid || !draftName.trim()) {
      setError('Please enter your owner name.');
      return;
    }
    setSavingProfile(true);
    setError('');
    try {
      const cleanName = draftName.trim();
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: cleanName });
      await setDoc(doc(db, 'users', uid), {
        displayName: cleanName,
        fullName: cleanName,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setProfile((current) => ({ ...current, displayName: cleanName }));
      setProfileModalOpen(false);
      showNotice('Owner profile saved.');
    } catch (err) {
      console.error('Owner profile update failed:', err);
      setError('Could not save your owner profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveResortProfile = async () => {
    if (!uid || !draftResortName.trim()) {
      setError('Please enter your resort name.');
      return;
    }
    setSavingProfile(true);
    setError('');
    try {
      const cleanName = draftResortName.trim();
      const cleanLocation = draftLocation.trim();
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), {
        resortName: cleanName,
        resortLocation: cleanLocation,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const packageQuery = query(collection(db, 'packages'), where('ownerId', '==', uid));
      const packageSnapshot = await getDocs(packageQuery);
      packageSnapshot.docs.forEach((packageDoc) => {
        batch.update(packageDoc.ref, {
          resortName: cleanName,
          resortLocation: cleanLocation,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      setProfile((current) => ({ ...current, resortName: cleanName, resortLocation: cleanLocation }));
      setResortModalOpen(false);
      showNotice('Resort name and location updated across your villa listings.');
    } catch (err) {
      console.error('Resort profile update failed:', err);
      setError('Could not save resort details. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const persistLiveSetting = async (key: keyof LiveSettings, value: boolean) => {
    if (!uid) return;
    const previous = liveSettings;
    setLiveSettings((current) => ({ ...current, [key]: value }));
    setSavingLive(true);
    setError('');
    try {
      await setDoc(doc(db, 'users', uid), {
        ownerSettings: { [key]: value },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showNotice(key === 'propertyAvailable'
        ? (value ? 'Property availability turned on.' : 'Property availability turned off.')
        : (value ? 'Instant booking enabled.' : 'Instant booking disabled.'));
    } catch (err) {
      console.error('Owner setting update failed:', err);
      setLiveSettings(previous);
      setError('Could not save this setting. Please try again.');
    } finally {
      setSavingLive(false);
    }
  };

  const pauseAllListings = async () => {
    if (!uid) return;
    const confirmed = window.confirm(
      `Pause all ${packageCount} villa listings? This updates their availability to unavailable. Existing confirmed bookings are not changed.`
    );
    if (!confirmed) return;
    setPausing(true);
    setError('');
    try {
      const packagesQuery = query(collection(db, 'packages'), where('ownerId', '==', uid));
      const snapshot = await getDocs(packagesQuery);
      const batch = writeBatch(db);
      snapshot.docs.forEach((packageDoc) => {
        batch.update(packageDoc.ref, { availability: 'unavailable', updatedAt: serverTimestamp() });
      });
      await batch.commit();
      await persistLiveSetting('propertyAvailable', false);
      showNotice(`All ${snapshot.size} listings have been paused.`);
    } catch (err) {
      console.error('Pause listings failed:', err);
      setError('Unable to pause listings. Check your Firestore permissions.');
    } finally {
      setPausing(false);
    }
  };

  const resumeAllListings = async () => {
    if (!uid) return;
    const confirmed = window.confirm('Turn property availability back on? This will mark all your villas as available.');
    if (!confirmed) return;
    setPausing(true);
    try {
      const packagesQuery = query(collection(db, 'packages'), where('ownerId', '==', uid));
      const snapshot = await getDocs(packagesQuery);
      const batch = writeBatch(db);
      snapshot.docs.forEach((packageDoc) => {
        batch.update(packageDoc.ref, { availability: 'available', updatedAt: serverTimestamp() });
      });
      await batch.commit();
      await persistLiveSetting('propertyAvailable', true);
      showNotice('Your listings are available again.');
    } catch (err) {
      console.error('Resume listings failed:', err);
      setError('Unable to reopen listings. Please try again.');
    } finally {
      setPausing(false);
    }
  };

  const submitPlatformReview = async () => {
    if (!uid) {
      setError('Please sign in again before submitting your review.');
      return;
    }
    const cleanComment = reviewComment.trim();
    if (!cleanComment) {
      setError('Please enter a comment about your experience.');
      return;
    }
    if (cleanComment.length < 5) {
      setError('Please write at least 5 characters so we can understand your feedback.');
      return;
    }

    setSubmittingReview(true);
    setError('');
    setNotice('');
    try {
      const currentUser = auth.currentUser;
      const reviewRef = doc(db, 'platformReviews', uid);
      await setDoc(reviewRef, {
        userId: uid,
        userName: profile.displayName || currentUser?.displayName || 'Business Owner',
        email: profile.email || currentUser?.email || '',
        role: 'owner',
        rating: reviewRating,
        category: reviewCategory,
        comment: cleanComment,
        status: 'published',
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }, { merge: true });

      setReviewComment('');
      setReviewRating(5);
      setReviewCategory('Overall Experience');
      showNotice('Thank you! Your platform review has been submitted.');
    } catch (err) {
      console.error('Owner platform review submission failed:', err);
      setError('We could not submit your review. Please check your connection and try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSignOut = async () => {
    if (onSignOut) {
      onSignOut();
      return;
    }
    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) return;
    try {
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
    } catch (err) {
      console.error('Sign out failed:', err);
      setError('Could not sign out. Please try again.');
    }
  };

  const SettingRow = ({
    icon,
    title,
    subtitle,
    badge,
    onClick,
  }: {
    icon: string;
    title: string;
    subtitle: string;
    badge?: string;
    onClick: () => void;
  }) => (
    <button type="button" className="os-setting-row" onClick={onClick}>
      <span className="os-row-icon"><IonIcon icon={icon as any} /></span>
      <span className="os-row-copy"><strong>{title}</strong><small>{subtitle}</small></span>
      {badge && <span className="os-row-badge">{badge}</span>}
      <IonIcon className="os-chevron" icon={chevronForwardOutline} />
    </button>
  );

  if (loading) {
    return <div className="os-loading"><IonSpinner name="crescent" /><span>Loading owner settings...</span></div>;
  }

  return (
    <main className="os-page">
      <input ref={ownerPhotoInput} type="file" accept="image/*" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void uploadImage(file, 'owner');
        event.currentTarget.value = '';
      }} />
      <input ref={resortPhotoInput} type="file" accept="image/*" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void uploadImage(file, 'resort');
        event.currentTarget.value = '';
      }} />

      <section className="os-profile-card">
        <div className="os-accreditation-row">
          <span className="os-accreditation"><IonIcon icon={shieldCheckmarkOutline} /> OWNER PROFILE</span>
          <span className="os-region">Mindoro, Philippines</span>
        </div>
        <div className="os-resort-profile">
          <button type="button" className="os-resort-photo" onClick={() => resortPhotoInput.current?.click()} aria-label="Change resort photo">
            {profile.resortPhotoURL
              ? <img src={profile.resortPhotoURL} alt="Resort" />
              : <span>{resortInitials}</span>}
            <i><IonIcon icon={cameraOutline} /></i> {/* ✅ FIXED */}
            {uploading === 'resort' && <span className="os-photo-loading"><IonSpinner name="crescent" /></span>}
          </button>
          <div className="os-resort-copy">
            <h2>{profile.resortName || 'Your Resort Name'}</h2>
            <p><IonIcon icon={locationOutline} /> {profile.resortLocation || 'Add your resort location'}</p>
            <span className="os-profile-email">{profile.email || 'Owner account'}</span>
          </div>
          <button className="os-icon-action" type="button" onClick={() => {
            setDraftResortName(profile.resortName);
            setDraftLocation(profile.resortLocation);
            setResortModalOpen(true);
          }} aria-label="Edit resort profile"><IonIcon icon={createOutline} /></button>
        </div>
        <div className="os-owner-strip">
          <button type="button" className="os-owner-avatar" onClick={() => ownerPhotoInput.current?.click()} aria-label="Change owner profile picture">
            {profile.photoURL ? <img src={profile.photoURL} alt="Owner profile" /> : <span>{(profile.displayName || 'O').slice(0, 1).toUpperCase()}</span>}
            <i><IonIcon icon={cameraOutline} /></i> {/* ✅ FIXED */}
            {uploading === 'owner' && <span className="os-avatar-loading"><IonSpinner name="crescent" /></span>}
          </button>
          <div className="os-owner-copy">
            <strong>{profile.displayName || 'Owner Name'}</strong>
            <small>Resort Owner / Manager</small>
          </div>
          <button type="button" className="os-manage-button" onClick={() => {
            setDraftName(profile.displayName);
            setProfileModalOpen(true);
          }}>Edit Profile</button>
        </div>
      </section>

      {notice && <div className="os-feedback success"><IonIcon icon={checkmarkCircleOutline} />{notice}</div>}
      {error && <div className="os-feedback error"><IonIcon icon={alertCircleOutline} />{error}</div>}

      <section className="os-section">
        <div className="os-section-label"><span>LIVE OPERATIONS</span><small><i /> Settings sync to your account</small></div>
        <div className="os-card os-toggle-card">
          <div className="os-toggle-row">
            <span className="os-row-icon"><IonIcon icon={cloudDoneOutline} /></span>
            <span className="os-row-copy"><strong>Property Availability</strong><small>{liveSettings.propertyAvailable ? 'Your listings can receive new reservations' : 'Your listings are currently paused'}</small></span>
            <button type="button" role="switch" aria-checked={liveSettings.propertyAvailable} disabled={savingLive} className={`os-switch ${liveSettings.propertyAvailable ? 'on' : ''}`} onClick={() => void persistLiveSetting('propertyAvailable', !liveSettings.propertyAvailable)}><i /></button>
          </div>
          <div className="os-divider" />
          <div className="os-toggle-row">
            <span className="os-row-icon"><IonIcon icon={flashOutline} /></span>
            <span className="os-row-copy"><strong>Instant Booking Mode</strong><small>{liveSettings.instantBooking ? 'Reservations can be auto-confirmed' : 'Reservations require owner confirmation'}</small></span>
            <button type="button" role="switch" aria-checked={liveSettings.instantBooking} disabled={savingLive} className={`os-switch ${liveSettings.instantBooking ? 'on' : ''}`} onClick={() => void persistLiveSetting('instantBooking', !liveSettings.instantBooking)}><i /></button>
          </div>
          {savingLive && <div className="os-saving"><IonSpinner name="crescent" /> Saving setting...</div>}
        </div>
      </section>

      <section className="os-section">
        <div className="os-section-label"><span>PROPERTY DETAILS & MEDIA</span></div>
        <div className="os-card os-list-card">
          <SettingRow icon={businessOutline} title="Resort Information" subtitle="Update resort name, location and profile photo" badge="EDIT" onClick={() => {
            setDraftResortName(profile.resortName);
            setDraftLocation(profile.resortLocation);
            setResortModalOpen(true);
          }} />
          <div className="os-divider" />
          <SettingRow icon={imageOutline} title="Resort Profile Photo" subtitle="Upload a new resort or property image" onClick={() => resortPhotoInput.current?.click()} />
          <div className="os-divider" />
          <SettingRow icon={personCircleOutline} title="Owner Profile" subtitle="Change your name and profile picture" onClick={() => {
            setDraftName(profile.displayName);
            setProfileModalOpen(true);
          }} />
        </div>
      </section>

      <section className="os-section">
        <div className="os-section-label"><span>YOUR FEEDBACK</span><small><i /> Help us improve</small></div>
        <div className="os-card os-review-card">
          <div className="os-review-intro">
            <span className="os-row-icon"><IonIcon icon={starOutline} /></span>
            <div className="os-review-intro-copy">
              <strong>Rate Mindoro Scape</strong>
              <small>Share your experience as a resort owner. Your feedback will be visible to the platform administrator.</small>
            </div>
          </div>

          <div className="os-review-stars" role="group" aria-label="Rate Mindoro Scape from one to five stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`os-review-star ${star <= reviewRating ? 'active' : ''}`}
                onClick={() => setReviewRating(star)}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                aria-pressed={reviewRating === star}
              >
                <IonIcon icon={starOutline} />
              </button>
            ))}
          </div>
          <p className="os-review-rating-label">
            {reviewRating === 5 ? 'Excellent' : reviewRating === 4 ? 'Very good' : reviewRating === 3 ? 'Good' : reviewRating === 2 ? 'Needs improvement' : 'Poor'} · {reviewRating} out of 5
          </p>

          <label className="os-review-field">
            <span>Review category</span>
            <select value={reviewCategory} onChange={(event) => setReviewCategory(event.target.value)}>
              <option>Overall Experience</option>
              <option>Ease of Use</option>
              <option>Features and Services</option>
              <option>Platform Performance</option>
              <option>Support for Resort Owners</option>
            </select>
          </label>

          <label className="os-review-field">
            <span>Your comments</span>
            <textarea
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value.slice(0, 1000))}
              placeholder="Tell us what you like about Mindoro Scape or what we can improve..."
              maxLength={1000}
              rows={4}
            />
            <small className="os-review-counter">{reviewComment.length}/1000 characters</small>
          </label>

          <p className="os-review-note">Your review is submitted under your Owner account and can be viewed by the Mindoro Scape administrator.</p>
          <button
            type="button"
            className="os-review-submit"
            disabled={submittingReview || !reviewComment.trim()}
            onClick={() => void submitPlatformReview()}
          >
            {submittingReview ? <IonSpinner name="crescent" /> : <IonIcon icon={starOutline} />}
            {submittingReview ? 'Submitting review...' : 'Submit Platform Review'}
          </button>
        </div>
      </section>

      <section className="os-section">
        <div className="os-section-label"><span>ACCOUNT & SECURITY</span></div>
        <div className="os-card os-list-card">
          <SettingRow icon={shieldCheckmarkOutline} title="Account Email" subtitle={profile.email || 'No email address available'} onClick={() => showNotice('To change your login email, use your account security or re-authentication flow.')} />
          <div className="os-divider" />
          <SettingRow icon={refreshOutline} title="Refresh Account Data" subtitle="Reload the latest profile information" onClick={() => window.location.reload()} />
          <div className="os-divider" />
          <SettingRow icon={logOutOutline} title="Sign Out" subtitle="Securely sign out of your owner account" onClick={() => void handleSignOut()} />
        </div>
      </section>

      <section className="os-danger-card">
        <div className="os-danger-top">
          <span className="os-danger-icon"><IonIcon icon={pauseCircleOutline} /></span>
          <div><strong>{liveSettings.propertyAvailable ? 'Temporarily Pause Listings' : 'Listings Are Paused'}</strong><p>{liveSettings.propertyAvailable
            ? `Stop accepting new reservations for all ${packageCount} listings. Existing confirmed bookings are not automatically cancelled.`
            : 'Your listings are currently marked unavailable. You can reopen them when you are ready.'}</p></div>
        </div>
        <button type="button" disabled={pausing || packageCount === 0} onClick={() => liveSettings.propertyAvailable ? void pauseAllListings() : void resumeAllListings()}>
          {pausing ? <IonSpinner name="crescent" /> : <IonIcon icon={liveSettings.propertyAvailable ? pauseCircleOutline : checkmarkCircleOutline} />}
          {pausing ? 'Updating listings...' : liveSettings.propertyAvailable ? `Pause All ${packageCount} Villas` : 'Re-open All Listings'}
        </button>
      </section>

      <footer className="os-footer">
        <div><IonIcon icon={apertureOutline} /> MINDORO SCAPE PARTNER SUITE</div>
        <small>Owner Settings · {profile.resortName || 'Your Resort'}</small>
      </footer>

      <IonModal isOpen={profileModalOpen} onDidDismiss={() => setProfileModalOpen(false)} className="os-modal">
        <div className="os-modal-content">
          <div className="os-modal-heading"><div><span>OWNER ACCOUNT</span><h2>Edit Owner Profile</h2></div><button type="button" onClick={() => setProfileModalOpen(false)}><IonIcon icon={closeOutline} /></button></div>
          <button type="button" className="os-large-avatar" onClick={() => ownerPhotoInput.current?.click()}>
            {profile.photoURL ? <img src={profile.photoURL} alt="Owner profile" /> : <span>{(profile.displayName || 'O').slice(0, 1).toUpperCase()}</span>}
            <i><IonIcon icon={cameraOutline} /></i> {/* ✅ FIXED */}
          </button>
          <small className="os-upload-caption">{uploading === 'owner' ? 'Uploading image...' : 'Tap the photo to change your profile picture (max 5 MB)'}</small>
          <label className="os-field"><span>Owner full name</span><input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Enter your name" /></label>
          <label className="os-field"><span>Email address</span><input value={profile.email} readOnly /></label>
          <button type="button" className="os-save-button" disabled={savingProfile || !draftName.trim()} onClick={() => void saveOwnerProfile()}>
            {savingProfile ? <IonSpinner name="crescent" /> : <IonIcon icon={saveOutline} />} Save Profile
          </button>
        </div>
      </IonModal>

      <IonModal isOpen={resortModalOpen} onDidDismiss={() => setResortModalOpen(false)} className="os-modal">
        <div className="os-modal-content">
          <div className="os-modal-heading"><div><span>PROPERTY PROFILE</span><h2>Edit Resort Details</h2></div><button type="button" onClick={() => setResortModalOpen(false)}><IonIcon icon={closeOutline} /></button></div>
          <button type="button" className="os-resort-preview" onClick={() => resortPhotoInput.current?.click()}>
            {profile.resortPhotoURL ? <img src={profile.resortPhotoURL} alt="Resort profile" /> : <span>{resortInitials}</span>}
            <i><IonIcon icon={cameraOutline} /></i> {/* ✅ FIXED */}
          </button>
          <small className="os-upload-caption">{uploading === 'resort' ? 'Uploading image...' : 'Tap the image to change resort photo (max 5 MB)'}</small>
          <label className="os-field"><span>Resort / Business name</span><input value={draftResortName} onChange={(event) => setDraftResortName(event.target.value)} placeholder="Enter resort name" /></label>
          <label className="os-field"><span>Resort location</span><input value={draftLocation} onChange={(event) => setDraftLocation(event.target.value)} placeholder="e.g. Talipanan, Puerto Galera" /></label>
          <button type="button" className="os-save-button" disabled={savingProfile || !draftResortName.trim()} onClick={() => void saveResortProfile()}>
            {savingProfile ? <IonSpinner name="crescent" /> : <IonIcon icon={saveOutline} />} Save Resort Details
          </button>
        </div>
      </IonModal>
    </main>
  );
};

export { OwnerSettings };
export default OwnerSettings;