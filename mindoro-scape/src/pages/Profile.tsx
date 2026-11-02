import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import {
  onAuthStateChanged,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import { FirebaseError } from 'firebase/app';
import {
  ArrowLeft,
  UserRound,
  Mail,
  ShieldCheck,
  LogOut,
  Save,
  Camera,
  ImagePlus,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';

import { auth, db } from '../firebase';
import BottomTabs from '../components/BottomTabs';
import './Profile.css';

const LOGO_PATH = '/assets/mindoro-scape-logo.png';
const MAX_ORIGINAL_SIZE = 10 * 1024 * 1024; // 10 MB

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uid, setUid] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('customer');
  const [photoURL, setPhotoURL] = useState('');
  const [previewURL, setPreviewURL] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (active) {
          setLoading(false);
          navigate('/login', { replace: true });
        }
        return;
      }

      if (!active) return;

      setUid(user.uid);
      setEmail(user.email ?? '');
      setFullName(user.displayName ?? '');
      setPhotoURL(user.photoURL ?? '');

      try {
        const profileSnapshot = await getDoc(doc(db, 'users', user.uid));

        if (!active) return;

        if (profileSnapshot.exists()) {
          const data = profileSnapshot.data();

          if (typeof data.fullName === 'string') setFullName(data.fullName);
          if (typeof data.email === 'string') setEmail(data.email);
          if (typeof data.role === 'string') setRole(data.role);
          
          // Prioritize Firestore photoURL (Base64) over Auth photoURL
          if (typeof data.photoURL === 'string' && data.photoURL) {
            setPhotoURL(data.photoURL);
          }
        }
      } catch (error) {
        console.error('Unable to load profile:', error);
        if (active) {
          setErrorMessage(
            'Your account is signed in, but some profile details could not be loaded.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (previewURL.startsWith('blob:')) {
        URL.revokeObjectURL(previewURL);
      }
    };
  }, [previewURL]);

  const handleChoosePhoto = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage('');
    setErrorMessage('');

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_ORIGINAL_SIZE) {
      setErrorMessage('The original image must be 10 MB or smaller.');
      event.target.value = '';
      return;
    }

    if (previewURL.startsWith('blob:')) {
      URL.revokeObjectURL(previewURL);
    }

    const newPreviewURL = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewURL(newPreviewURL);
  };

  const handleCancelPhoto = () => {
    if (previewURL.startsWith('blob:')) {
      URL.revokeObjectURL(previewURL);
    }
    setSelectedFile(null);
    setPreviewURL('');
    setMessage('');
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Helper function para gawing Base64 string ang image
  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const user = auth.currentUser;
    const normalizedName = fullName.trim();

    if (!user || !uid || user.uid !== uid) {
      setErrorMessage('Please log in again to update your profile.');
      return;
    }

    if (normalizedName.length < 2) {
      setErrorMessage('Please enter a name with at least 2 characters.');
      return;
    }

    setSaving(true);
    setMessage('');
    setErrorMessage('');

    try {
      let updatedPhotoURL = photoURL;

      if (selectedFile) {
        // I-compress muna para maliit lang ang Base64 string
        const compressedFile = await imageCompression(selectedFile, {
          maxSizeMB: 0.1, // 100KB limit para iwas Firestore document limits
          maxWidthOrHeight: 400,
          useWebWorker: true,
          fileType: 'image/jpeg',
          initialQuality: 0.8,
        });

        updatedPhotoURL = await convertToBase64(compressedFile);
      }

      // 1. UPDATE FIREBASE AUTH (DisplayName lang, walang photoURL para iwas error)
      await updateProfile(user, {
        displayName: normalizedName,
      });

      // 2. UPDATE FIRESTORE (Dito natin ise-save ang Base64 image)
      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          fullName: normalizedName,
          email: user.email ?? email,
          photoURL: updatedPhotoURL,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setFullName(normalizedName);
      setEmail(user.email ?? email);
      setPhotoURL(updatedPhotoURL);
      setSelectedFile(null);
      setPreviewURL('');

      if (fileInputRef.current) fileInputRef.current.value = '';

      setMessage('Your profile and profile picture have been saved successfully.');
    } catch (error: unknown) {
      console.error('Profile update error:', error);

      if (error instanceof FirebaseError) {
        if (error.code === 'permission-denied') {
          setErrorMessage(
            'Firestore denied the operation. Check your Firestore security rules.'
          );
        } else {
          setErrorMessage(
            `Unable to save your profile (${error.code}). Please try again.`
          );
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(
          'Unable to save your profile. Please check your connection and try again.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    setErrorMessage('');
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout error:', error);
      setErrorMessage('Unable to log out. Please try again.');
      setLoggingOut(false);
    }
  };

  const displayedPhoto = previewURL || photoURL;
  const displayedName = fullName.trim() || 'MINDORO SCAPE Explorer';
  const busy = saving || loggingOut;

  if (loading) {
    return (
      <IonPage>
        <IonContent className="profile-content">
          <div className="profile-loading" role="status">
            <img src={LOGO_PATH} alt="MINDORO SCAPE" />
            <p>Loading your profile...</p>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonContent fullscreen className="profile-content">
        <div className="profile-shell">
          <header className="profile-header">
            <button
              type="button"
              className="profile-back-button"
              onClick={() => navigate('/user/dashboard')}
              disabled={busy}
            >
              <ArrowLeft size={18} />
              Dashboard
            </button>

            <button
              type="button"
              className="profile-header-brand"
              onClick={() => navigate('/user/dashboard')}
              aria-label="Go to MINDORO SCAPE dashboard"
            >
              <img src={LOGO_PATH} alt="" />
              <span>MINDORO SCAPE</span>
            </button>
          </header>

          <main className="profile-main">
            <section className="profile-hero">
              <div className="profile-avatar-wrap">
                <button
                  type="button"
                  className="profile-avatar"
                  onClick={handleChoosePhoto}
                  aria-label="Change profile picture"
                  disabled={busy}
                >
                  {displayedPhoto ? (
                    <img
                      src={displayedPhoto}
                      alt="Your profile"
                      className="profile-avatar-image"
                    />
                  ) : (
                    <UserRound size={48} strokeWidth={1.5} />
                  )}

                  <span className="profile-camera-badge">
                    <Camera size={17} />
                  </span>
                </button>
              </div>

              <h1>{displayedName}</h1>

              <p className="profile-hero-email">
                <Mail size={15} />
                {email || 'No email address'}
              </p>

              <span className="profile-role-badge">
                <ShieldCheck size={14} />
                {role === 'customer'
                  ? 'Verified Explorer'
                  : `${role.charAt(0).toUpperCase()}${role.slice(1)} Account`}
              </span>

              <p className="profile-hero-description">
                Your account, your adventures. Keep your information up to date.
              </p>
            </section>

            <section className="profile-card">
              <div className="profile-card-heading">
                <div>
                  <p className="profile-eyebrow">YOUR ACCOUNT</p>
                  <h2>Personal Information</h2>
                  <p>Manage your profile details and picture.</p>
                </div>

                <span className="profile-heading-icon">
                  <UserRound size={21} />
                </span>
              </div>

              <div className="profile-photo-editor">
                <div className="profile-photo-preview">
                  {displayedPhoto ? (
                    <img src={displayedPhoto} alt="Profile preview" />
                  ) : (
                    <UserRound size={30} />
                  )}
                </div>

                <div className="profile-photo-copy">
                  <strong>Profile picture</strong>
                  <p>
                    Images are automatically converted to JPEG and compressed.
                  </p>

                  <div className="profile-photo-actions">
                    <button
                      type="button"
                      className="profile-photo-button"
                      onClick={handleChoosePhoto}
                      disabled={busy}
                    >
                      <ImagePlus size={16} />
                      {selectedFile ? 'Choose Another' : 'Change Photo'}
                    </button>

                    {selectedFile && (
                      <button
                        type="button"
                        className="profile-photo-cancel"
                        onClick={handleCancelPhoto}
                        disabled={busy}
                      >
                        <X size={15} />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                className="profile-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handlePhotoSelection}
                aria-label="Choose a profile picture"
                disabled={busy}
              />

              {selectedFile && (
                <div className="profile-selected-file">
                  <CheckCircle2 size={16} />
                  <span>{selectedFile.name}</span>
                  <span>{(selectedFile.size / 1024).toFixed(0)} KB original</span>
                </div>
              )}

              <form className="profile-form" onSubmit={handleSaveProfile}>
                <div className="profile-field">
                  <label htmlFor="profile-full-name">Full Name</label>

                  <div className="profile-input-wrap">
                    <UserRound size={18} />
                    <input
                      id="profile-full-name"
                      type="text"
                      value={fullName}
                      onChange={(event) => {
                        setFullName(event.target.value);
                        setMessage('');
                      }}
                      placeholder="Enter your full name"
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                      required
                      disabled={busy}
                    />
                  </div>
                </div>

                <div className="profile-field">
                  <label htmlFor="profile-email">Email Address</label>

                  <div className="profile-input-wrap profile-readonly">
                    <Mail size={18} />
                    <input
                      id="profile-email"
                      type="email"
                      value={email}
                      readOnly
                      autoComplete="email"
                    />
                    <ShieldCheck size={16} />
                  </div>

                  <small className="profile-field-note">
                    Your sign-in email is managed by Firebase Authentication.
                  </small>
                </div>

                {message && (
                  <div className="profile-success" role="status">
                    <CheckCircle2 size={17} />
                    <span>{message}</span>
                  </div>
                )}

                {errorMessage && (
                  <div className="profile-error" role="alert">
                    <AlertCircle size={17} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button
                  className="profile-save-button"
                  type="submit"
                  disabled={busy}
                >
                  {saving ? (
                    <>
                      <LoaderCircle
                        size={17}
                        className="profile-button-spinner"
                      />
                      Saving changes...
                    </>
                  ) : (
                    <>
                      <Save size={17} />
                      Save Changes
                    </>
                  )}
                </button>
              </form>
            </section>

            <section className="profile-account-actions">
              <div className="profile-account-icon">
                <ShieldCheck size={22} />
              </div>

              <div className="profile-account-copy">
                <h3>Account &amp; Security</h3>
                <p>
                  Your account is connected to Firebase Authentication.
                  Sign out when using a shared device.
                </p>
              </div>

              <button
                type="button"
                className="profile-logout-button"
                onClick={handleLogout}
                disabled={busy}
              >
                <LogOut size={17} />
                {loggingOut ? 'Logging Out...' : 'Log Out'}
              </button>
            </section>

            <footer className="profile-footer" style={{ marginBottom: '80px' }}>
              <strong>MINDORO SCAPE</strong>
              <span>MADE FOR YOUR NEXT MINDORO ADVENTURE</span>
            </footer>
          </main>
        </div>

        {busy && (
          <div
            className="profile-loading-overlay"
            role="status"
            aria-live="polite"
          >
            <div className="profile-loading-card">
              <div className="profile-loading-logo-wrap">
                <img src={LOGO_PATH} alt="" />
              </div>

              <h2>
                {loggingOut
                  ? 'Signing you out'
                  : 'Saving your profile'}
              </h2>

              <p>Please wait a moment.</p>
            </div>
          </div>
        )}
      </IonContent>

      {/* ✅ Idinagdag ang BottomTabs sa labas ng IonContent */}
      {!busy && <BottomTabs />}
    </IonPage>
  );
};

export default Profile;