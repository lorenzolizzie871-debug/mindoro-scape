
import React, { useEffect, useState, useContext } from 'react';
import {
  Navigate,
  Route,
  useLocation,
} from 'react-router-dom';

import {
  IonApp,
  IonRouterOutlet,
  setupIonicReact,
} from '@ionic/react';

import { IonReactRouter } from '@ionic/react-router';

import {
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

import { auth } from './firebase';
import { AuthContext } from './contexts/AuthContext';

// USER & PUBLIC PAGES
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import FeaturePage from './pages/FeaturePage';
import UserDashboard from './pages/UserDashboard';
import Explore from './pages/Explore';
import ResortDetail from './pages/ResortDetail';
import Reservation from './pages/Reservation';
import Profile from './pages/Profile';
import Favorites from './pages/Favorites';
import MyBookings from './pages/MyBookings';

// OWNER & ADMIN PAGES
import OwnerDashboard from './pages/owner/OwnerDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';

// PAYPAL PAGES
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancel from './pages/PaymentCancel';

// IONIC CSS
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/palettes/dark.system.css';

import './theme/variables.css';

setupIonicReact();

// ==========================================
// LOADING SCREEN
// ==========================================

const LoadingScreen: React.FC = () => (
  <div className="app-loading-screen">
    <img
      src="/assets/mindoro-scape-logo.png"
      alt="MINDORO SCAPE"
    />

    <span>Loading your account...</span>

    <style>
      {`
        .app-loading-screen {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          color: #07516b;
          font-family: Arial, sans-serif;
          background: #f3f8fb;
        }

        .app-loading-screen img {
          width: 64px;
          height: 64px;
          object-fit: contain;
          animation: app-logo-breathe 1.5s ease-in-out infinite;
        }

        .app-loading-screen span {
          font-size: 13px;
          font-weight: 600;
        }

        @keyframes app-logo-breathe {
          0%, 100% {
            opacity: 0.45;
            transform: scale(0.96);
          }

          50% {
            opacity: 1;
            transform: scale(1.04);
          }
        }
      `}
    </style>
  </div>
);

// ==========================================
// APP ROUTES
// ==========================================

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const { user, authReady } = useContext(AuthContext);

  if (!authReady) {
    return <LoadingScreen />;
  }

  // PROTECTED ROUTE HELPER
  const protectedElement = (element: React.ReactElement) => {
    return user ? (
      element
    ) : (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  };

  return (
    <IonRouterOutlet>

      {/* =====================================
          PUBLIC ROUTES
      ===================================== */}

      <Route
        path="/home"
        element={<Home />}
      />

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/signup"
        element={<Signup />}
      />

      {/* =====================================
          PAYPAL RETURN ROUTES
      ===================================== */}

      <Route
        path="/payment/success"
        element={protectedElement(<PaymentSuccess />)}
      />

      <Route
        path="/payment/cancel"
        element={protectedElement(<PaymentCancel />)}
      />

      {/* =====================================
          USER DASHBOARD
      ===================================== */}

      <Route
        path="/user/dashboard"
        element={protectedElement(<UserDashboard />)}
      />

      {/* =====================================
          EXPLORE PAGE
          Map and resort listings are now
          combined in one page.
      ===================================== */}

      <Route
        path="/user/explore"
        element={protectedElement(<Explore />)}
      />

      {/* OLD MAP ROUTE
          Redirect users to the new Explore page.
      */}

      <Route
        path="/user/map"
        element={
          <Navigate
            to="/user/explore"
            replace
          />
        }
      />

      {/* =====================================
          USER FEATURES
      ===================================== */}

      <Route
        path="/user/favorites"
        element={protectedElement(<Favorites />)}
      />

      <Route
        path="/user/bookings"
        element={protectedElement(<MyBookings />)}
      />

      <Route
        path="/user/profile"
        element={protectedElement(<Profile />)}
      />

      {/* =====================================
          RESORT & RESERVATION
      ===================================== */}

      <Route
        path="/user/resort/:id"
        element={protectedElement(<ResortDetail />)}
      />

      <Route
        path="/user/reservation/:id"
        element={protectedElement(<Reservation />)}
      />

      {/* =====================================
          OLD RESERVATION ROUTE
          Redirect to My Bookings.
      ===================================== */}

      <Route
        path="/feature/reservations"
        element={
          <Navigate
            to="/user/bookings"
            replace
          />
        }
      />

      {/* =====================================
          OTHER FEATURE PAGES
      ===================================== */}

      <Route
        path="/feature/:featureId"
        element={protectedElement(<FeaturePage />)}
      />

      {/* =====================================
          OWNER ROUTES
      ===================================== */}

      <Route
        path="/owner/dashboard"
        element={protectedElement(<OwnerDashboard />)}
      />

      {/* =====================================
          ADMIN ROUTES
      ===================================== */}

      <Route
        path="/admin/dashboard"
        element={protectedElement(<AdminDashboard />)}
      />

      {/* =====================================
          DEFAULT ROUTES
      ===================================== */}

      <Route
        path="/"
        element={
          <Navigate
            to="/home"
            replace
          />
        }
      />

      {/* UNKNOWN ROUTES */}

      <Route
        path="*"
        element={
          <Navigate
            to={
              location.pathname.startsWith('/user/')
                ? '/user/dashboard'
                : '/home'
            }
            replace
          />
        }
      />

    </IonRouterOutlet>
  );
};

// ==========================================
// MAIN APP
// ==========================================

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setAuthReady(true);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <IonApp>
      <AuthContext.Provider
        value={{
          user,
          authReady,
        }}
      >
        <IonReactRouter>
          {!authReady ? (
            <LoadingScreen />
          ) : (
            <AppRoutes />
          )}
        </IonReactRouter>
      </AuthContext.Provider>
    </IonApp>
  );
};

export default App;
