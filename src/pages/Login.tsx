import { useEffect, useState, type FormEvent } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { Eye, EyeOff, ArrowLeft, ShieldAlert, Mail, CheckCircle2 } from 'lucide-react';
import { auth, db } from '../firebase';
import './Login.css';

const LOGO_PATH = '/assets/mindoro-scape-logo.png';
const DEFAULT_SUSPENSION_MESSAGE =
  'Mindoro Scape is temporarily suspended. User and owner login are unavailable for now. Please try again later.';

type PortalRole = 'user' | 'owner' | 'admin';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const requestedRole = (searchParams.get('role') || 'user') as PortalRole;
  const roleParam: PortalRole = ['user', 'owner', 'admin'].includes(requestedRole)
    ? requestedRole
    : 'user';

  const isOwner = roleParam === 'owner';
  const isAdmin = roleParam === 'admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [platformSuspended, setPlatformSuspended] = useState(false);
  const [suspensionMessage, setSuspensionMessage] = useState(DEFAULT_SUSPENSION_MESSAGE);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const headingText = isAdmin
    ? 'Admin Portal'
    : isOwner
      ? 'Manage your resort'
      : 'Welcome Back';

  const descText = isAdmin
    ? 'Secure access for system administrators.'
    : isOwner
      ? 'Log in to manage your listings and bookings in Oriental Mindoro.'
      : 'Enter your account details to continue discovering beautiful resorts in Oriental Mindoro.';

  const btnText = isAdmin ? 'Login as Admin' : isOwner ? 'Login as Owner' : 'Login';

  // Live status keeps the login page notice current when the administrator
  // enables or removes platform suspension.
  useEffect(() => {
    const platformRef = doc(db, 'systemSettings', 'platformControl');

    const unsubscribe = onSnapshot(
      platformRef,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        const suspended = data.suspended === true;
        setPlatformSuspended(suspended);

        const message = String(data.message || data.suspensionMessage || '').trim();
        setSuspensionMessage(message || DEFAULT_SUSPENSION_MESSAGE);
      },
      (error) => {
        console.error('Platform suspension listener failed:', error);
      }
    );

    return unsubscribe;
  }, []);

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setErrorMessage('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      const signedInUser = credential.user;
      const profileRef = doc(db, 'users', signedInUser.uid);
      const [profileSnapshot, platformSnapshot] = await Promise.all([
        getDoc(profileRef),
        getDoc(doc(db, 'systemSettings', 'platformControl')),
      ]);

      // Never create a user/owner/admin profile automatically during login.
      // Roles must be assigned through the trusted registration/admin workflow.
      if (!profileSnapshot.exists()) {
        await signOut(auth);
        setErrorMessage(
          'Your account profile could not be found. Please contact the administrator.'
        );
        return;
      }

      const profile = profileSnapshot.data();
      const actualRole = String(profile.role || 'user').toLowerCase();
      const platformData = platformSnapshot.exists() ? platformSnapshot.data() : {};
      const suspended = platformData.suspended === true;

      const adminMessage = String(
        platformData.message || platformData.suspensionMessage || ''
      ).trim();

      if (actualRole !== roleParam) {
        await signOut(auth);
        setErrorMessage(
          actualRole === 'owner'
            ? 'This is an Owner account. Please use the Owner Portal.'
            : actualRole === 'admin'
              ? 'This is an Admin account. Please use the Admin Portal.'
              : 'This is a Traveler account. Please use the Traveler Portal.'
        );
        return;
      }

      // Only a verified admin profile may pass while the platform is suspended.
      if (suspended && actualRole !== 'admin') {
        await signOut(auth);
        setPlatformSuspended(true);
        setSuspensionMessage(adminMessage || DEFAULT_SUSPENSION_MESSAGE);
        setErrorMessage(adminMessage || DEFAULT_SUSPENSION_MESSAGE);
        return;
      }

      const accountSuspended =
        profile.suspended === true ||
        profile.isSuspended === true ||
        String(profile.accountStatus || '').toLowerCase() === 'suspended';

      if (accountSuspended && actualRole !== 'admin') {
        await signOut(auth);
        setErrorMessage(
          String(profile.suspensionReason || '').trim() ||
            'Your account is currently suspended. Please contact the administrator.'
        );
        return;
      }

      if (actualRole === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      } else if (actualRole === 'owner') {
        navigate('/owner/dashboard', { replace: true });
      } else {
        navigate('/user/dashboard', { replace: true });
      }
    } catch (error: unknown) {
      console.error('Login error:', error);

      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/invalid-email':
            setErrorMessage('Your email address is invalid.');
            break;
          case 'auth/user-not-found':
          case 'auth/invalid-credential':
          case 'auth/wrong-password':
            setErrorMessage('Incorrect email or password.');
            break;
          case 'auth/too-many-requests':
            setErrorMessage('Too many login attempts. Please try again later.');
            break;
          case 'auth/network-request-failed':
            setErrorMessage('Connection failed. Please check your internet.');
            break;
          case 'permission-denied':
            setErrorMessage('You do not have permission to access this account.');
            break;
          default:
            setErrorMessage('Unable to log in right now. Please try again.');
        }
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    setResetEmail(email.trim());
    setResetMessage('');
    setResetError('');
    setShowForgotPassword(true);
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resetLoading) return;

    const normalizedEmail = resetEmail.trim().toLowerCase();

    setResetMessage('');
    setResetError('');

    if (!validateEmail(normalizedEmail)) {
      setResetError('Please enter a valid email address.');
      return;
    }

    setResetLoading(true);

    try {
      // Firebase sends a secure password-reset email containing a one-time
      // action link/code. The password is changed only after that email action
      // is completed. This avoids insecure client-generated OTP verification.
      await sendPasswordResetEmail(auth, normalizedEmail);
      setResetMessage(
        'If an account exists for this email, Firebase has sent a password-reset email. Open the email and follow its secure link to choose a new password. Check your spam folder too.'
      );
    } catch (error: unknown) {
      console.error('Password reset request failed:', error);

      if (error instanceof FirebaseError) {
        if (error.code === 'auth/invalid-email') {
          setResetError('Please enter a valid email address.');
        } else if (error.code === 'auth/too-many-requests') {
          setResetError('Too many reset requests. Please wait before trying again.');
        } else if (error.code === 'auth/network-request-failed') {
          setResetError('Connection failed. Please check your internet.');
        } else {
          // Avoid revealing whether an email address is registered.
          setResetMessage(
            'If an account exists for this email, a password-reset email will be sent. Check your inbox and spam folder.'
          );
        }
      } else {
        setResetError('Unable to send the reset email right now. Please try again.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen className="login-content">
        <main className="login-layout">
          <section className="login-side-panel">
            <div className="login-side-content">
              <img src={LOGO_PATH} alt="Mindoro Scape logo" className="login-side-logo" />
              <p className="login-side-eyebrow">
                {isAdmin ? 'SYSTEM ADMINISTRATION' : isOwner ? 'PARTNER PORTAL' : 'YOUR NEXT ADVENTURE AWAITS'}
              </p>
              <h2>
                {isAdmin ? 'Secure access' : isOwner ? 'Manage your' : 'Welcome back'}
                <br />
                {isAdmin ? 'for administrators.' : isOwner ? 'island business.' : 'to your escape.'}
              </h2>
              <p className="login-side-description">
                {isAdmin
                  ? 'Manage users, resorts, and system settings for Mindoro Scape.'
                  : isOwner
                    ? 'Log in to update your resort details, manage bookings, and connect with travelers.'
                    : 'Log in to explore resorts, save your favorites, and plan your next getaway in Oriental Mindoro.'}
              </p>
              <div className="login-side-decoration" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </section>

          <section className="login-main-panel">
            <div className="login-container">
              <button
                className="login-back-button"
                type="button"
                onClick={() => navigate('/home')}
                disabled={loading || resetLoading}
              >
                <ArrowLeft size={16} />
                Back to Home
              </button>

              <div className="login-mobile-brand">
                <img src={LOGO_PATH} alt="Mindoro Scape logo" />
                <span>MINDORO SCAPE</span>
              </div>

              {platformSuspended && !isAdmin && (
                <section className="login-suspension-notice" role="alert">
                  <span className="login-suspension-icon">
                    <ShieldAlert size={21} />
                  </span>
                  <span>
                    <strong>Platform temporarily suspended</strong>
                    <small>{suspensionMessage}</small>
                    <small>User and Owner login are unavailable. Admin access remains available.</small>
                  </span>
                </section>
              )}

              {!showForgotPassword ? (
                <>
                  <div className="login-heading">
                    <p className="login-brand">
                      {isAdmin ? 'ADMIN PORTAL' : isOwner ? 'OWNER PORTAL' : 'WELCOME BACK'}
                    </p>
                    <h1>{headingText}</h1>
                    <p className="login-description">{descText}</p>
                  </div>

                  <form onSubmit={handleLogin} noValidate autoComplete="off">
                    <div className="login-field">
                      <label htmlFor="login-email">Email Address</label>
                      <input
                        id="login-email"
                        name="login-email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setErrorMessage('');
                        }}
                        required
                        disabled={loading}
                      />
                    </div>

                    <div className="login-field">
                      <label htmlFor="login-password">Password</label>
                      <div className="login-password-wrapper">
                        <input
                          id="login-password"
                          name="login-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter your password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(event) => {
                            setPassword(event.target.value);
                            setErrorMessage('');
                          }}
                          required
                          disabled={loading}
                        />
                        <button
                          className="login-password-toggle"
                          type="button"
                          onClick={() => setShowPassword((previous) => !previous)}
                          disabled={loading}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <EyeOff size={20} strokeWidth={2} />
                          ) : (
                            <Eye size={20} strokeWidth={2} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="login-forgot-row">
                      <button
                        type="button"
                        onClick={openForgotPassword}
                        disabled={loading}
                      >
                        Forgot password?
                      </button>
                    </div>

                    {errorMessage && (
                      <div className="login-error" role="alert">
                        <span className="login-error-icon" aria-hidden="true">!</span>
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    <button
                      className="login-submit"
                      type="submit"
                      disabled={loading || (platformSuspended && !isAdmin)}
                    >
                      {loading ? 'Logging in...' : btnText}
                    </button>
                  </form>

                  <div className="login-signup">
                    {isAdmin ? (
                      <span>Admin accounts are created manually by the system.</span>
                    ) : (
                      <>
                        <span>Don't have an account?</span>
                        <button
                          type="button"
                          onClick={() => navigate(isOwner ? '/signup?role=owner' : '/signup')}
                          disabled={loading || platformSuspended}
                        >
                          Create Account
                        </button>
                      </>
                    )}
                  </div>

                  <div className="login-portal-switch">
                    {roleParam === 'user' && (
                      <span>
                        Are you a resort owner?{' '}
                        <button type="button" onClick={() => navigate('/login?role=owner')}>
                          Login here
                        </button>
                      </span>
                    )}
                    {roleParam === 'owner' && (
                      <span>
                        Are you a traveler?{' '}
                        <button type="button" onClick={() => navigate('/login')}>
                          Login here
                        </button>
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <section className="login-reset-panel">
                  <button
                    type="button"
                    className="login-reset-back"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetMessage('');
                      setResetError('');
                    }}
                  >
                    <ArrowLeft size={15} />
                    Back to login
                  </button>

                  <span className="login-reset-icon">
                    <Mail size={25} />
                  </span>
                  <p className="login-brand">ACCOUNT RECOVERY</p>
                  <h1>Reset your password</h1>
                  <p className="login-description">
                    Enter the email address connected to your account. We will send a secure password-reset email.
                  </p>

                  <form onSubmit={handlePasswordReset} noValidate>
                    <div className="login-field">
                      <label htmlFor="reset-email">Email Address</label>
                      <input
                        id="reset-email"
                        name="reset-email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="off"
                        value={resetEmail}
                        onChange={(event) => {
                          setResetEmail(event.target.value);
                          setResetError('');
                          setResetMessage('');
                        }}
                        required
                        disabled={resetLoading}
                      />
                    </div>

                    {resetError && (
                      <div className="login-error" role="alert">
                        <span className="login-error-icon">!</span>
                        <span>{resetError}</span>
                      </div>
                    )}

                    {resetMessage && (
                      <div className="login-reset-success" role="status">
                        <CheckCircle2 size={19} />
                        <span>{resetMessage}</span>
                      </div>
                    )}

                    <button className="login-submit" type="submit" disabled={resetLoading}>
                      {resetLoading ? 'Sending email...' : 'Send Reset Email'}
                    </button>
                  </form>
                </section>
              )}

              <footer className="signup-footer">
                <span className="signup-footer-brand">MINDORO SCAPE</span>
                <span className="signup-footer-tagline">MADE FOR YOUR NEXT MINDORO ADVENTURE</span>
              </footer>
            </div>
          </section>
        </main>

        {loading && (
          <div className="logo-only-loading" role="status" aria-live="polite" aria-label="Logging in">
            <img src={LOGO_PATH} alt="" className="logo-only-loading-image" />
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Login;
