import { useState, type FormEvent } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'; // ✅ Idinagdag ang setDoc at serverTimestamp
import { FirebaseError } from 'firebase/app';
import { Eye, EyeOff } from 'lucide-react';
import { auth, db } from '../firebase';
import './Login.css';

const LOGO_PATH = '/assets/mindoro-scape-logo.png';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // ✅ Alamin kung anong portal ang binuksan base sa URL
  const searchParams = new URLSearchParams(location.search);
  const roleParam = searchParams.get('role') || 'user';
  
  const isOwner = roleParam === 'owner';
  const isAdmin = roleParam === 'admin';

  // Dynamic texts base sa role
  const headingText = isAdmin ? 'Admin Portal' : isOwner ? 'Owner Portal' : 'Welcome Back';
  const titleText = isAdmin ? 'Sign in as Administrator' : isOwner ? 'Manage your resort' : 'Login to your account';
  const descText = isAdmin 
    ? 'Secure access for system administrators.' 
    : isOwner 
      ? 'Log in to manage your listings and bookings in Oriental Mindoro.' 
      : 'Enter your account details to continue discovering beautiful resorts in Oriental Mindoro.';
  const btnText = isAdmin ? 'Login as Admin' : isOwner ? 'Login as Owner' : 'Login';

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;
    setErrorMessage('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    try {
      setLoading(true);

      // 1. Login sa Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;

      // 2. Kunin ang role sa Firestore
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      
      let actualRole = roleParam; // Default natin sa role ng URL parameter (e.g. user, owner)

      // ✅ KUNG WALA SA FIRESTORE, GAWAN NATIN NG RECORD
      if (!docSnap.exists()) {
        console.log('User not found in Firestore, creating record automatically...');
        
        // Gagawin nating 'owner' kung nasa owner portal siya, kung hindi 'user'
        const newRole = roleParam === 'owner' ? 'owner' : (roleParam === 'admin' ? 'admin' : 'user');
        
        await setDoc(docRef, {
          uid: user.uid,
          email: normalizedEmail,
          fullName: user.displayName || 'Explorer',
          role: newRole,
          createdAt: serverTimestamp(),
        });
        
        actualRole = newRole;
      } else {
        actualRole = docSnap.data().role || 'user';
      }

      // 3. Security Check: Kung User portal, dapat 'user' ang role
      if (roleParam === 'user' && actualRole !== 'user') {
        setErrorMessage('This is not a Traveler account. Please use the correct portal.');
        await auth.signOut();
        setLoading(false);
        return;
      }

      // Kung Owner portal, dapat 'owner' ang role
      if (roleParam === 'owner' && actualRole !== 'owner') {
        setErrorMessage('This is not an Owner account. Please use the correct portal.');
        await auth.signOut();
        setLoading(false);
        return;
      }

      // Kung Admin portal, dapat 'admin' ang role
      if (roleParam === 'admin' && actualRole !== 'admin') {
        setErrorMessage('This is not an Admin account.');
        await auth.signOut();
        setLoading(false);
        return;
      }

      // 4. Redirect base sa totoong role
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
            setErrorMessage('No account was found with this email address.');
            break;
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            setErrorMessage('Incorrect email or password.');
            break;
          case 'auth/too-many-requests':
            setErrorMessage('Too many login attempts. Please try again later.');
            break;
          case 'auth/network-request-failed':
            setErrorMessage('Connection failed. Please check your internet.');
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
                disabled={loading}
              >
                Back to Home
              </button>

              <div className="login-mobile-brand">
                <img src={LOGO_PATH} alt="Mindoro Scape logo" />
                <span>MINDORO SCAPE</span>
              </div>

              <div className="login-heading">
                <p className="login-brand">{isAdmin ? 'ADMIN PORTAL' : isOwner ? 'OWNER PORTAL' : 'WELCOME BACK'}</p>
                <h1>{titleText}</h1>
                <p className="login-description">{descText}</p>
              </div>

              <form onSubmit={handleLogin} noValidate>
                <div className="login-field">
                  <label htmlFor="login-email">Email Address</label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
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
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      autoComplete="current-password"
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
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={loading}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={19} strokeWidth={2} /> : <Eye size={19} strokeWidth={2} />}
                    </button>
                  </div>
                </div>

                {errorMessage && (
                  <div className="login-error" role="alert">
                    <span className="login-error-icon" aria-hidden="true">!</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button className="login-submit" type="submit" disabled={loading}>
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
                      disabled={loading}
                    >
                      Create Account
                    </button>
                  </>
                )}
              </div>

              <div className="login-portal-switch" style={{ marginTop: '20px', fontSize: '12px', textAlign: 'center' }}>
                {roleParam === 'user' && (
                  <span>Are you a resort owner? <button type="button" onClick={() => navigate('/login?role=owner')} style={{ background: 'none', border: 'none', color: '#08758a', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>Login here</button></span>
                )}
                {roleParam === 'owner' && (
                  <span>Are you a traveler? <button type="button" onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: '#08758a', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>Login here</button></span>
                )}
              </div>

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