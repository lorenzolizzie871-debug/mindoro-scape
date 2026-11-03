import { useState, type FormEvent } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { Eye, EyeOff, Check, X, UploadCloud } from 'lucide-react';
import imageCompression from 'browser-image-compression'; // ✅ Para sa image compression
import { auth, db } from '../firebase';
import './Signup.css';

const LOGO_PATH = '/assets/mindoro-scape-logo.png';
const MAX_ORIGINAL_SIZE = 5 * 1024 * 1024; // 5MB limit

const Signup: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const isOwner = searchParams.get('role') === 'owner';

  // Basic Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Owner Fields
  const [resortName, setResortName] = useState('');
  const [resortLocation, setResortLocation] = useState('');
  const [permitId, setPermitId] = useState('');
  const [permitImage, setPermitImage] = useState<File | null>(null); // ✅ Para sa image file

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const headingText = isOwner ? 'Partner with Us' : 'Join MINDORO SCAPE';
  const descText = isOwner 
    ? 'Register your resort and start receiving bookings from travelers.'
    : 'Create your account and start discovering resorts in Oriental Mindoro.';
  const btnText = isOwner ? 'Submit Application' : 'Create Account';

  const passwordRules = [
    { label: 'At least 10 characters', valid: password.length >= 10 },
    { label: 'One uppercase letter (A–Z)', valid: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a–z)', valid: /[a-z]/.test(password) },
    { label: 'One number (0–9)', valid: /\d/.test(password) },
    { label: 'One special character (!@#$...)', valid: /[^A-Za-z0-9]/.test(password) },
  ];

  const isStrongPassword = passwordRules.every((rule) => rule.valid);

  // ✅ Helper para gawing Base64 ang image
  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;
    setErrorMessage('');

    const trimmedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName || !normalizedEmail || !password || !confirmPassword) {
      setErrorMessage('Please complete all required fields.');
      return;
    }

    if (trimmedName.length < 2) {
      setErrorMessage('Please enter your complete name.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!isStrongPassword) {
      setErrorMessage('Your password must meet all the security requirements.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Your passwords do not match.');
      return;
    }

    // ✅ Validation para sa Owner (kasama ang Image)
    if (isOwner) {
      if (!resortName.trim() || !resortLocation.trim() || !permitId.trim() || !permitImage) {
        setErrorMessage('Please complete all resort information and upload your permit.');
        return;
      }
    }

    if (!agreedToTerms) {
      setErrorMessage('Please agree to the Terms and Conditions before signing up.');
      return;
    }

    setLoading(true);
    let accountCreated = false;
    let createdUserUid = '';

    try {
      // 1. Create Firebase Auth Account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      const user = userCredential.user;
      createdUserUid = user.uid;
      accountCreated = true;

      // 2. Update Display Name
      try {
        await updateProfile(user, { displayName: trimmedName });
      } catch (profileError) {
        console.error('Display name update failed:', profileError);
      }

      // 3. Sign out before redirecting
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.error('Sign-out failed:', signOutError);
      }

      // 4. Redirect immediately
      navigate(isOwner ? '/login?role=owner' : '/login', {
        replace: true,
        state: { signupSuccess: true, email: normalizedEmail },
      });

      // 5. I-prepare ang base data
      const userData: any = {
        uid: createdUserUid,
        fullName: trimmedName,
        email: normalizedEmail,
        role: isOwner ? 'owner' : 'user',
        acceptedTerms: true,
        termsAcceptedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      // 6. ✅ I-proseso ang Owner details at Image
      if (isOwner && permitImage) {
        let base64Image = '';
        try {
          // I-compress ang image bago i-convert
          const compressedFile = await imageCompression(permitImage, {
            maxSizeMB: 0.2, // 200KB limit para hindi sumobra sa Firestore 1MB limit
            maxWidthOrHeight: 800,
            useWebWorker: true,
            fileType: 'image/jpeg',
          });
          base64Image = await convertToBase64(compressedFile);
        } catch (imgError) {
          console.error('Image compression failed:', imgError);
        }

        userData.resortName = resortName.trim();
        userData.resortLocation = resortLocation.trim();
        userData.permitId = permitId.trim();
        userData.permitImageUrl = base64Image; // ✅ Naka-save na Base64
        userData.status = 'pending'; // Kailangan i-approve ng admin
      }

      void setDoc(doc(db, 'users', createdUserUid), userData).catch((firestoreError) => {
        console.error('Firestore profile save failed:', firestoreError);
      });

      return;
    } catch (error: unknown) {
      console.error('Signup error:', error);

      if (accountCreated) {
        try { await signOut(auth); } catch (e) { console.error(e); }
        navigate(isOwner ? '/login?role=owner' : '/login', {
          replace: true,
          state: { signupSuccess: true, email: normalizedEmail },
        });
        return;
      }

      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/email-already-in-use':
            setErrorMessage('This email is already registered. Please log in instead.');
            break;
          case 'auth/invalid-email':
            setErrorMessage('Please enter a valid email address.');
            break;
          case 'auth/weak-password':
            setErrorMessage('Firebase rejected this password. Please choose a stronger one.');
            break;
          default:
            setErrorMessage(`Registration failed: ${error.code}. Please try again.`);
        }
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file for the permit.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_ORIGINAL_SIZE) {
      setErrorMessage('The image is too large. Max size is 5MB.');
      e.target.value = '';
      return;
    }

    setPermitImage(file);
    setErrorMessage('');
  };

  return (
    <IonPage>
      <IonContent fullscreen className="signup-content">
        <main className="signup-layout">
          {/* LEFT BRAND PANEL */}
          <section className="signup-side-panel">
            <div className="signup-side-content">
              <img src={LOGO_PATH} alt="MINDORO SCAPE logo" className="signup-side-logo" />
              <p className="signup-side-eyebrow">
                {isOwner ? 'PARTNER WITH MINDORO SCAPE' : 'DISCOVER YOUR NEXT ESCAPE'}
              </p>
              <h2>
                {isOwner ? 'Grow your' : 'Your next'}
                <br />
                {isOwner ? 'island business.' : 'adventure starts here.'}
              </h2>
              <p className="signup-side-description">
                {isOwner 
                  ? 'Join the premier travel platform in Oriental Mindoro. List your resort and connect with thousands of travelers.'
                  : 'Explore beautiful resorts across Oriental Mindoro and plan your next relaxing getaway with MINDORO SCAPE.'}
              </p>
              <div className="signup-side-decoration" aria-hidden="true">
                <span /><span /><span />
              </div>
            </div>
          </section>

          {/* SIGNUP FORM PANEL */}
          <section className="signup-main-panel">
            <div className="signup-container">
              <button className="signup-back-button" type="button" onClick={() => navigate('/home')} disabled={loading}>
                Back to Home
              </button>

              <div className="signup-mobile-brand">
                <img src={LOGO_PATH} alt="MINDORO SCAPE logo" />
                <span>MINDORO SCAPE</span>
              </div>

              <div className="signup-heading">
                <p className="signup-brand">{isOwner ? 'OWNER APPLICATION' : 'CREATE YOUR ACCOUNT'}</p>
                <h1>{headingText}</h1>
                <p className="signup-description">{descText}</p>
              </div>

              <form onSubmit={handleSignup} noValidate>
                {/* FULL NAME */}
                <div className="signup-field">
                  <label htmlFor="signup-fullname">Full Name</label>
                  <input
                    id="signup-fullname"
                    type="text"
                    placeholder="Enter your full name"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setErrorMessage(''); }}
                    minLength={2}
                    required
                    disabled={loading}
                  />
                </div>

                {/* EMAIL */}
                <div className="signup-field">
                  <label htmlFor="signup-email">Email Address</label>
                  <input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrorMessage(''); }}
                    required
                    disabled={loading}
                  />
                </div>

                {/* ✅ OWNER SPECIFIC FIELDS */}
                {isOwner && (
                  <div className="owner-fields">
                    <p className="signup-rules-heading" style={{ marginTop: '10px', marginBottom: '5px', color: '#08758a' }}>
                      RESORT INFORMATION
                    </p>
                    
                    <div className="signup-field">
                      <label htmlFor="signup-resort-name">Resort / Business Name</label>
                      <input
                        id="signup-resort-name"
                        type="text"
                        placeholder="e.g. Infinity Resort & Spa"
                        value={resortName}
                        onChange={(e) => { setResortName(e.target.value); setErrorMessage(''); }}
                        required
                        disabled={loading}
                      />
                    </div>

                    <div className="signup-field">
                      <label htmlFor="signup-resort-location">Location (Municipality)</label>
                      <input
                        id="signup-resort-location"
                        type="text"
                        placeholder="e.g. Puerto Galera"
                        value={resortLocation}
                        onChange={(e) => { setResortLocation(e.target.value); setErrorMessage(''); }}
                        required
                        disabled={loading}
                      />
                    </div>

                    <div className="signup-field">
                      <label htmlFor="signup-permit">Business Permit ID</label>
                      <input
                        id="signup-permit"
                        type="text"
                        placeholder="Enter your DTI / Mayor's Permit No."
                        value={permitId}
                        onChange={(e) => { setPermitId(e.target.value); setErrorMessage(''); }}
                        required
                        disabled={loading}
                      />
                    </div>

                    {/* ✅ UPLOAD PERMIT IMAGE */}
                    <div className="signup-field">
                      <label>Upload Permit </label>
                      <div className="signup-file-upload">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleImageUpload}
                          disabled={loading}
                          id="permit-image-input"
                        />
                        <label htmlFor="permit-image-input" className="signup-file-label">
                          <UploadCloud size={20} />
                          <span>{permitImage ? permitImage.name : 'Choose an image...'}</span>
                        </label>
                      </div>
                      {permitImage && (
                        <p className="signup-match-message is-matched">
                          Image selected ({(permitImage.size / 1024).toFixed(0)} KB)
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* PASSWORD */}
                <div className="signup-field">
                  <label htmlFor="signup-password">Password</label>
                  <div className="signup-password-wrapper">
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a strong password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setErrorMessage(''); }}
                      required
                      disabled={loading}
                      aria-describedby="signup-password-rules"
                    />
                    <button className="signup-password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} disabled={loading}>
                      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>

                  <div className="signup-password-rules" id="signup-password-rules">
                    <p className="signup-rules-heading">Password security requirements</p>
                    {passwordRules.map((rule) => (
                      <div className={`signup-password-rule ${rule.valid ? 'is-valid' : ''}`} key={rule.label}>
                        <span className="signup-rule-icon">
                          {rule.valid ? <Check size={13} /> : <X size={13} />}
                        </span>
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CONFIRM PASSWORD */}
                <div className="signup-field">
                  <label htmlFor="signup-confirm-password">Confirm Password</label>
                  <div className="signup-password-wrapper">
                    <input
                      id="signup-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setErrorMessage(''); }}
                      required
                      disabled={loading}
                    />
                    <button className="signup-password-toggle" type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} disabled={loading}>
                      {showConfirmPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>
                  {confirmPassword && (
                    <p className={`signup-match-message ${password === confirmPassword ? 'is-matched' : 'is-unmatched'}`}>
                      {password === confirmPassword ? 'Passwords match.' : 'Passwords do not match.'}
                    </p>
                  )}
                </div>

                {/* TERMS AGREEMENT */}
                <div className="signup-agreement">
                  <input
                    id="signup-agree-terms"
                    className="signup-agreement-checkbox"
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => { setAgreedToTerms(e.target.checked); setErrorMessage(''); }}
                    disabled={loading}
                    required
                  />
                  <label htmlFor="signup-agree-terms">
                    I have read and agree to the{' '}
                    <button className="signup-terms-link" type="button" onClick={() => setShowTerms(true)} disabled={loading}>
                      Terms and Conditions
                    </button>{' '}
                    and understand the basic{' '}
                    <button className="signup-terms-link" type="button" onClick={() => setShowTerms(true)} disabled={loading}>
                      privacy information
                    </button>.
                  </label>
                </div>

                {/* ERROR MESSAGE */}
                {errorMessage && (
                  <div className="signup-error" role="alert">
                    <span className="signup-message-icon" aria-hidden="true">!</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* SUBMIT */}
                <button className="signup-submit" type="submit" disabled={loading || !agreedToTerms}>
                  {loading ? 'Submitting...' : btnText}
                </button>

                <p className="signup-terms-note">
                  Your account details will be used to provide your MINDORO SCAPE account and services.
                </p>
              </form>

              {/* LOGIN LINK */}
              <div className="signup-login">
                <span>Already have an account?</span>
                <button type="button" onClick={() => navigate(isOwner ? '/login?role=owner' : '/login')} disabled={loading}>
                  Login
                </button>
              </div>

              {/* ✅ SWITCH PORTAL LINK */}
              <div className="signup-portal-switch" style={{ marginTop: '15px', fontSize: '12px', textAlign: 'center' }}>
                {isOwner ? (
                  <span>Are you a traveler? <button type="button" onClick={() => navigate('/signup')} style={{ background: 'none', border: 'none', color: '#08758a', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>Sign up here</button></span>
                ) : (
                  <span>Want to list your resort? <button type="button" onClick={() => navigate('/signup?role=owner')} style={{ background: 'none', border: 'none', color: '#08758a', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>Register as Owner</button></span>
                )}
              </div>

              <footer className="signup-footer">
                <span className="signup-footer-brand">MINDORO SCAPE</span>
                <span className="signup-footer-tagline">MADE FOR YOUR NEXT MINDORO ADVENTURE</span>
              </footer>
            </div>
          </section>
        </main>

        {/* TERMS AND CONDITIONS MODAL */}
        {showTerms && (
          <div className="signup-terms-backdrop" role="presentation" onClick={() => setShowTerms(false)}>
            <section className="signup-terms-modal" role="dialog" aria-modal="true" aria-labelledby="signup-terms-title" onClick={(e) => e.stopPropagation()}>
              <p className="signup-brand">MINDORO SCAPE</p>
              <h2 id="signup-terms-title">Terms and Conditions</h2>
              <div className="signup-terms-content">
                <h3>Account Information</h3>
                <p>Provide accurate information when creating your account. Keep your password private and notify the service team if you suspect unauthorized access.</p>
                <h3>Responsible Use</h3>
                <p>Use the application respectfully and provide truthful information when using resort discovery, reviews, and reservation request features.</p>
                <h3>Personal Information</h3>
                <p>Your name, email, and account information are used to provide account-related features. Do not submit information that you do not have permission to share.</p>
                <h3>Reservations</h3>
                <p>A reservation request is not necessarily a confirmed booking. Follow the resort's confirmation process.</p>
                <p className="signup-terms-disclaimer">These are starter terms for this project. Review and replace them with the application's approved terms and privacy notice before public release.</p>
              </div>
              <button className="signup-submit" type="button" onClick={() => setShowTerms(false)}>Close</button>
            </section>
          </div>
        )}

        {/* LOGO-ONLY BREATHING LOADER */}
        {loading && (
          <div className="logo-only-loading" role="status" aria-live="polite" aria-label="Creating your account">
            <img src={LOGO_PATH} alt="" className="logo-only-loading-image" />
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Signup;