import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import {
  Eye,
  EyeOff,
  Check,
  X,
  UploadCloud,
  FileCheck2,
  ShieldCheck,
  Phone,
  ArrowLeft,
} from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { auth, db } from '../firebase';
import './Signup.css';

const LOGO_PATH = '/assets/mindoro-scape-logo.png';
const MAX_ORIGINAL_SIZE = 5 * 1024 * 1024;
const PH_PHONE_DIGITS = 10; // Philippine mobile number after +63, e.g. 9171234567

const Signup: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isOwner = searchParams.get('role') === 'owner';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  const [resortName, setResortName] = useState('');
  const [resortLocation, setResortLocation] = useState('');
  const [businessPermitImage, setBusinessPermitImage] = useState<File | null>(null);
  const [validIdImage, setValidIdImage] = useState<File | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPasswordRules, setShowPasswordRules] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [emailError, setEmailError] = useState('');

  const headingText = isOwner ? 'Partner with Us' : 'Join MINDORO SCAPE';
  const descText = isOwner
    ? 'Register your resort and start receiving bookings from travelers.'
    : 'Create your account and start discovering resorts in Oriental Mindoro.';
  const btnText = isOwner ? 'Submit Application' : 'Create Account';

  const passwordRules = useMemo(
    () => [
      { label: 'At least 10 characters', valid: password.length >= 10 },
      { label: 'One uppercase letter (A–Z)', valid: /[A-Z]/.test(password) },
      { label: 'One lowercase letter (a–z)', valid: /[a-z]/.test(password) },
      { label: 'One number (0–9)', valid: /\d/.test(password) },
      { label: 'One special character (!@#$...)', valid: /[^A-Za-z0-9]/.test(password) },
    ],
    [password]
  );
  const isStrongPassword = passwordRules.every((rule) => rule.valid);

  const normalizedPhone = contactNumber.replace(/\D/g, '');
  const isValidPhilippineMobile =
    normalizedPhone.length === PH_PHONE_DIGITS &&
    /^[9]\d{9}$/.test(normalizedPhone);

  const convertToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Unable to read the selected ID image.'));
    });

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    let digits = event.target.value.replace(/\D/g, '');

    // Accept pasted numbers in either 09XXXXXXXXX, 63XXXXXXXXXX, or +63XXXXXXXXXX format.
    if (digits.startsWith('63')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, PH_PHONE_DIGITS);

    setContactNumber(digits);
    setErrorMessage('');
  };

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
    setEmailError('');
    setErrorMessage('');
  };

  const handleDocumentUpload = (
    event: ChangeEvent<HTMLInputElement>,
    documentType: 'id' | 'businessPermit'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const documentLabel = documentType === 'id' ? 'Valid ID' : 'Business Permit';

    if (!allowedTypes.includes(file.type)) {
      setErrorMessage(`Please upload your ${documentLabel} as a JPG, PNG, or WEBP image.`);
      event.target.value = '';
      return;
    }

    if (file.size > MAX_ORIGINAL_SIZE) {
      setErrorMessage(`The ${documentLabel} image is too large. Please upload an image up to 5MB.`);
      event.target.value = '';
      return;
    }

    if (documentType === 'id') setValidIdImage(file);
    else setBusinessPermitImage(file);

    setErrorMessage('');
  };

  const compressDocumentToBase64 = async (file: File): Promise<string> => {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.2,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      fileType: 'image/jpeg',
    });
    return convertToBase64(compressed);
  };

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setErrorMessage('');
    setEmailError('');

    const trimmedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName || !normalizedEmail || !password || !confirmPassword || !contactNumber) {
      setErrorMessage('Please complete all required fields.');
      return;
    }

    if (trimmedName.length < 2) {
      setErrorMessage('Please enter your complete name.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    if (!isValidPhilippineMobile) {
      setErrorMessage('Enter a valid Philippine mobile number, for example +63 917 123 4567.');
      return;
    }

    if (!isStrongPassword) {
      setShowPasswordRules(true);
      setErrorMessage('Your password must meet all the security requirements.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Your passwords do not match.');
      return;
    }

    if (isOwner && (!resortName.trim() || !resortLocation.trim() || !businessPermitImage || !validIdImage)) {
      setErrorMessage('Please complete your resort details and upload both the Business Permit and Valid Government-Issued ID.');
      return;
    }

    if (!agreedToTerms) {
      setErrorMessage('Please agree to the Terms and Conditions before signing up.');
      return;
    }

    setLoading(true);
    let accountCreated = false;
    let createdUid = '';

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      const user = credential.user;
      createdUid = user.uid;
      accountCreated = true;

      await updateProfile(user, { displayName: trimmedName });

      let validIdBase64 = '';
      let businessPermitBase64 = '';

      if (isOwner && validIdImage && businessPermitImage) {
        [validIdBase64, businessPermitBase64] = await Promise.all([
          compressDocumentToBase64(validIdImage),
          compressDocumentToBase64(businessPermitImage),
        ]);
      }

      const userData: Record<string, unknown> = {
        uid: user.uid,
        fullName: trimmedName,
        email: normalizedEmail,
        contactNumber: `+63${normalizedPhone}`,
        role: isOwner ? 'owner' : 'user',
        acceptedTerms: true,
        termsAcceptedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      if (isOwner) {
        userData.resortName = resortName.trim();
        userData.resortLocation = resortLocation.trim();
        userData.validIdImage = validIdBase64;
        userData.validIdFileName = validIdImage?.name || '';
        userData.businessPermitImage = businessPermitBase64;
        userData.businessPermitFileName = businessPermitImage?.name || '';
        userData.status = 'pending';
        userData.accountStatus = 'pending';
      }

      // Save profile first. Do not redirect before Firestore confirms the write.
      await setDoc(doc(db, 'users', user.uid), userData);

      await signOut(auth);

      navigate(isOwner ? '/login?role=owner' : '/login', {
        replace: true,
        state: { signupSuccess: true, email: normalizedEmail },
      });
    } catch (error: unknown) {
      console.error('Signup error:', error);

      if (accountCreated) {
        // Do not leave a newly-created account silently signed in if profile
        // setup failed. Auth account cleanup requires a trusted backend.
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error('Sign-out after registration failure:', signOutError);
        }
        setErrorMessage(
          'Your authentication account was created, but we could not finish saving your profile. Please contact support before trying to register again.'
        );
      } else if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/email-already-in-use':
            setEmailError('Email is already in use. Please log in or use another email address.');
            setErrorMessage('This email is already registered. Please log in or use a different email.');
            break;
          case 'auth/invalid-email':
            setEmailError('Please enter a valid email address.');
            break;
          case 'auth/weak-password':
            setErrorMessage('Please choose a stronger password that meets all the requirements.');
            break;
          case 'auth/network-request-failed':
            setErrorMessage('Connection failed. Please check your internet connection.');
            break;
          default:
            setErrorMessage('Registration failed. Please try again.');
        }
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen className="signup-content">
        <main className="signup-layout">
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
                  ? 'Join the travel platform in Oriental Mindoro. List your resort and connect with travelers.'
                  : 'Explore beautiful resorts across Oriental Mindoro and plan your next relaxing getaway.'}
              </p>
              <div className="signup-side-decoration" aria-hidden="true">
                <span /><span /><span />
              </div>
            </div>
          </section>

          <section className="signup-main-panel">
            <div className="signup-container">
              <button className="signup-back-button" type="button" onClick={() => navigate('/home')} disabled={loading}>
                <ArrowLeft size={16} />
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

              <form onSubmit={handleSignup} noValidate autoComplete="off">
                <div className="signup-field">
                  <label htmlFor="signup-fullname">Full Name</label>
                  <input
                    id="signup-fullname"
                    name="signup-fullname"
                    type="text"
                    placeholder="Enter your full name"
                    autoComplete="off"
                    value={fullName}
                    onChange={(event) => { setFullName(event.target.value); setErrorMessage(''); }}
                    minLength={2}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="signup-field">
                  <label htmlFor="signup-email">Email Address</label>
                  <input
                    id="signup-email"
                    name="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={handleEmailChange}
                    required
                    disabled={loading}
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? 'signup-email-error' : undefined}
                  />
                  {emailError && (
                    <p className="signup-inline-error" id="signup-email-error" role="alert">
                      {emailError}
                    </p>
                  )}
                </div>

                <div className="signup-field">
                  <label htmlFor="signup-contact">Contact Number</label>
                  <div className="signup-phone-input">
                    <span className="signup-phone-prefix"><Phone size={15} /> +63</span>
                    <input
                      id="signup-contact"
                      name="signup-contact"
                      type="tel"
                      inputMode="numeric"
                      placeholder="917 123 4567"
                      autoComplete="off"
                      value={contactNumber}
                      onChange={handlePhoneChange}
                      required
                      disabled={loading}
                      maxLength={10}
                    />
                  </div>
                  <small className="signup-field-hint">Philippine mobile number · 10 digits after +63</small>
                </div>

                {isOwner && (
                  <section className="owner-fields">
                    <div className="signup-section-heading">
                      <span className="signup-section-icon"><ShieldCheck size={18} /></span>
                      <span>
                        <strong>Resort information</strong>
                        <small>Provide details for your owner application.</small>
                      </span>
                    </div>

                    <div className="signup-field">
                      <label htmlFor="signup-resort-name">Resort / Business Name</label>
                      <input
                        id="signup-resort-name"
                        name="resort-name"
                        type="text"
                        placeholder="e.g. Infinity Resort & Spa"
                        autoComplete="organization"
                        value={resortName}
                        onChange={(event) => { setResortName(event.target.value); setErrorMessage(''); }}
                        required
                        disabled={loading}
                      />
                    </div>

                    <div className="signup-field">
                      <label htmlFor="signup-resort-location">Location (Municipality)</label>
                      <input
                        id="signup-resort-location"
                        name="resort-location"
                        type="text"
                        placeholder="e.g. Puerto Galera"
                        value={resortLocation}
                        onChange={(event) => { setResortLocation(event.target.value); setErrorMessage(''); }}
                        required
                        disabled={loading}
                      />
                    </div>

                    <div className="signup-field">
                      <label htmlFor="business-permit-upload">Business Permit Document</label>
                      <div className={`signup-id-upload ${businessPermitImage ? 'has-file' : ''}`}>
                        <input
                          id="business-permit-upload"
                          name="business-permit-upload"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) => handleDocumentUpload(event, 'businessPermit')}
                          disabled={loading}
                        />
                        <label htmlFor="business-permit-upload" className="signup-id-upload-label">
                          <span className="signup-upload-icon">
                            {businessPermitImage ? <FileCheck2 size={23} /> : <UploadCloud size={23} />}
                          </span>
                          <span className="signup-upload-copy">
                            <strong>{businessPermitImage ? businessPermitImage.name : 'Upload a photo of your Business Permit'}</strong>
                            <small>{businessPermitImage ? `${(businessPermitImage.size / 1024).toFixed(0)} KB · Selected` : 'JPG, PNG or WEBP · Maximum 5MB'}</small>
                          </span>
                          <span className="signup-upload-action">{businessPermitImage ? 'Change' : 'Browse'}</span>
                        </label>
                      </div>
                      <small className="signup-field-hint">Upload a clear image of your current business permit.</small>
                    </div>

                    <div className="signup-field">
                      <label htmlFor="valid-id-upload">Valid Government-Issued ID</label>
                      <div className={`signup-id-upload ${validIdImage ? 'has-file' : ''}`}>
                        <input
                          id="valid-id-upload"
                          name="valid-id-upload"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) => handleDocumentUpload(event, 'id')}
                          disabled={loading}
                        />
                        <label htmlFor="valid-id-upload" className="signup-id-upload-label">
                          <span className="signup-upload-icon">
                            {validIdImage ? <FileCheck2 size={23} /> : <UploadCloud size={23} />}
                          </span>
                          <span className="signup-upload-copy">
                            <strong>{validIdImage ? validIdImage.name : 'Upload a clear photo of your valid ID'}</strong>
                            <small>{validIdImage ? `${(validIdImage.size / 1024).toFixed(0)} KB · Selected` : 'JPG, PNG or WEBP · Maximum 5MB'}</small>
                          </span>
                          <span className="signup-upload-action">{validIdImage ? 'Change' : 'Browse'}</span>
                        </label>
                      </div>
                      <small className="signup-field-hint">Upload a clear image of your valid government-issued ID.</small>
                    </div>
                  </section>
                )}

                <div className="signup-field">
                  <div className="signup-label-row">
                    <label htmlFor="signup-password">Password</label>
                    <button
                      className="signup-rules-toggle"
                      type="button"
                      onClick={() => setShowPasswordRules((previous) => !previous)}
                      aria-expanded={showPasswordRules}
                      aria-controls="signup-password-rules"
                    >
                      {showPasswordRules ? 'Hide requirements' : 'View requirements'}
                    </button>
                  </div>
                  <div className="signup-password-wrapper">
                    <input
                      id="signup-password"
                      name="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a strong password"
                      autoComplete="new-password"
                      value={password}
                      onFocus={() => setShowPasswordRules(true)}
                      onChange={(event) => { setPassword(event.target.value); setErrorMessage(''); }}
                      required
                      disabled={loading}
                      aria-describedby="signup-password-rules"
                    />
                    <button
                      className="signup-password-toggle"
                      type="button"
                      onClick={() => setShowPassword((previous) => !previous)}
                      disabled={loading}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  {showPasswordRules && (
                    <div className="signup-password-rules" id="signup-password-rules">
                      <div className="signup-rules-top">
                        <strong>Password requirements</strong>
                        <button type="button" onClick={() => setShowPasswordRules(false)} aria-label="Hide password requirements">
                          <X size={16} />
                        </button>
                      </div>
                      <div className="signup-rules-progress">
                        <span style={{ width: `${(passwordRules.filter((rule) => rule.valid).length / passwordRules.length) * 100}%` }} />
                      </div>
                      <div className="signup-rules-list">
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
                  )}
                </div>

                <div className="signup-field">
                  <label htmlFor="signup-confirm-password">Confirm Password</label>
                  <div className="signup-password-wrapper">
                    <input
                      id="signup-confirm-password"
                      name="signup-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => { setConfirmPassword(event.target.value); setErrorMessage(''); }}
                      required
                      disabled={loading}
                    />
                    <button
                      className="signup-password-toggle"
                      type="button"
                      onClick={() => setShowConfirmPassword((previous) => !previous)}
                      disabled={loading}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {confirmPassword && (
                    <p className={`signup-match-message ${password === confirmPassword ? 'is-matched' : 'is-unmatched'}`}>
                      {password === confirmPassword ? 'Passwords match.' : 'Passwords do not match.'}
                    </p>
                  )}
                </div>

                <div className="signup-agreement">
                  <input
                    id="signup-agree-terms"
                    className="signup-agreement-checkbox"
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(event) => { setAgreedToTerms(event.target.checked); setErrorMessage(''); }}
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

                {errorMessage && (
                  <div className="signup-error" role="alert">
                    <span className="signup-message-icon">!</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button className="signup-submit" type="submit" disabled={loading || !agreedToTerms}>
                  {loading ? 'Creating account...' : btnText}
                </button>

                <p className="signup-terms-note">
                  Your information will be used to provide your MINDORO SCAPE account and services.
                </p>
              </form>

              <div className="signup-login">
                <span>Already have an account?</span>
                <button type="button" onClick={() => navigate(isOwner ? '/login?role=owner' : '/login')} disabled={loading}>
                  Login
                </button>
              </div>

              <div className="signup-portal-switch">
                {isOwner ? (
                  <span>Are you a traveler? <button type="button" onClick={() => navigate('/signup')}>Sign up here</button></span>
                ) : (
                  <span>Want to list your resort? <button type="button" onClick={() => navigate('/signup?role=owner')}>Register as Owner</button></span>
                )}
              </div>

              <footer className="signup-footer">
                <span className="signup-footer-brand">MINDORO SCAPE</span>
                <span className="signup-footer-tagline">MADE FOR YOUR NEXT MINDORO ADVENTURE</span>
              </footer>
            </div>
          </section>
        </main>

        {showTerms && (
          <div className="signup-terms-backdrop" role="presentation" onClick={() => setShowTerms(false)}>
            <section
              className="signup-terms-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="signup-terms-title"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="signup-brand">MINDORO SCAPE</p>
              <h2 id="signup-terms-title">Terms and Conditions</h2>
              <div className="signup-terms-content">
                <h3>Account Information</h3>
                <p>Provide accurate information when creating your account. Keep your password private and notify the service team if you suspect unauthorized access.</p>
                <h3>Responsible Use</h3>
                <p>Use the application respectfully and provide truthful information when using resort discovery, reviews, and reservation request features.</p>
                <h3>Personal Information</h3>
                <p>Your name, email, contact number, and account information are used to provide account-related features. Owner applicants also submit a Business Permit document and a valid government-issued ID for verification.</p>
                <h3>Reservations</h3>
                <p>A reservation request is not necessarily a confirmed booking. Follow the resort's confirmation process.</p>
                <p className="signup-terms-disclaimer">These are starter terms for this project. Review and replace them with the application's approved terms and privacy notice before public release.</p>
              </div>
              <button className="signup-submit" type="button" onClick={() => setShowTerms(false)}>Close</button>
            </section>
          </div>
        )}

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
