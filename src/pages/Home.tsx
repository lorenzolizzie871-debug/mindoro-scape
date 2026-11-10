import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonAlert } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Palmtree,
  MapPinned,
  CalendarCheck,
  Compass,
  MapPin,
  Ban,
} from 'lucide-react';
import { db } from '../firebase';
import './Home.css';

const PLATFORM_SUSPENDED_MESSAGE =
  'Mindoro Scape is temporarily suspended. Get Started and Log in are unavailable for now. Please try again later.';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [presentAlert] = useIonAlert();
  const [platformSuspended, setPlatformSuspended] = useState(false);
  const [suspensionMessage, setSuspensionMessage] = useState(
    PLATFORM_SUSPENDED_MESSAGE
  );

  useEffect(() => {
    const platformControlRef = doc(db, 'systemSettings', 'platformControl');

    const unsubscribe = onSnapshot(
      platformControlRef,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        const suspended = data.suspended === true;

        setPlatformSuspended(suspended);

        const adminMessage = String(
          data.message || data.suspensionMessage || ''
        ).trim();

        setSuspensionMessage(adminMessage || PLATFORM_SUSPENDED_MESSAGE);
      },
      (error) => {
        console.error('Unable to read platform suspension status:', error);
        // Fail open for browsing if the status cannot be read.
        // Booking and account restrictions must also be enforced by their own
        // protected flows and Firestore/backend rules.
        setPlatformSuspended(false);
      }
    );

    return unsubscribe;
  }, []);

  const showSuspensionAlert = () => {
    presentAlert({
      header: 'Platform Temporarily Suspended',
      message: suspensionMessage,
      buttons: [{ text: 'Okay', role: 'cancel' }],
      cssClass: 'platform-suspension-alert',
    });
  };

  const handleProtectedNavigation = (path: string) => {
    if (platformSuspended) {
      showSuspensionAlert();
      return;
    }

    navigate(path);
  };

  const features = [
    {
      id: 'resorts',
      icon: Palmtree,
      iconClass: 'resort-icon',
      title: 'Discover Beautiful Resorts',
      description: 'Browse resort photos, amenities, and rates in one place.',
    },
    {
      id: 'location',
      icon: MapPinned,
      iconClass: 'location-icon',
      title: 'Explore Resorts Location',
      description: 'Find resort locations and plan where to go.',
    },
    {
      id: 'reservation',
      icon: CalendarCheck,
      iconClass: 'booking-icon',
      title: 'Request a Reservation',
      description: 'Send a reservation request to your preferred resort.',
    },
  ];

  return (
    <IonPage>
      <IonContent fullscreen className="onboarding-content">
        <main className="onboarding-container">
          <header className="onboarding-header">
            <div className="header-spacer" aria-hidden="true" />
          </header>

          {platformSuspended && (
            <section
              className="platform-suspension-banner"
              role="alert"
              aria-live="polite"
            >
              <span className="platform-suspension-icon" aria-hidden="true">
                <Ban size={22} strokeWidth={1.9} />
              </span>

              <div className="platform-suspension-copy">
                <strong>Mindoro Scape is temporarily suspended</strong>
                <p>{suspensionMessage}</p>
                <small>
                  Get Started and Log in are temporarily unavailable.
                </small>
              </div>
            </section>
          )}

          <div className="onboarding-layout">
            {/* LEFT SIDE: HERO IMAGE */}
            <section className="hero-card">
              <img
                className="hero-image"
                src="https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1800&q=90"
                alt="Ocean waves along a tropical coastline"
              />

              <div className="hero-overlay" />

              <button
                type="button"
                className="hero-brand"
                onClick={() => navigate('/home')}
                aria-label="Go to MINDORO SCAPE home"
              >
                <img
                  src="/assets/mindoro-scape-logo.png"
                  alt=""
                  className="hero-brand-logo"
                />

                <span className="hero-brand-text">
                  <strong>MINDORO SCAPE</strong>
                  <small>YOUR ISLAND ESCAPE</small>
                </span>
              </button>

              <div className="hero-caption">
                <p className="hero-caption-label">
                  EXPLORE ORIENTAL MINDORO
                </p>

                <h2>Find your own piece of paradise.</h2>

                <p className="hero-caption-description">
                  Beautiful resorts. Unforgettable escapes.
                </p>

                <p className="hero-location-note">
                  <MapPin size={16} strokeWidth={2} aria-hidden="true" />
                  Oriental Mindoro, Philippines
                </p>

                <div className="hero-feature-shortcuts" />
              </div>
            </section>

            {/* RIGHT SIDE: WELCOME AND FEATURES */}
            <div className="onboarding-main-content">
              <section className="welcome-section">
                <p className="eyebrow">
                  YOUR ISLAND ADVENTURE STARTS HERE
                </p>

                <h1>
                  Discover Your Next Escape in{' '}
                  <span>Oriental Mindoro</span>
                </h1>

                <p className="welcome-description">
                  Explore beautiful resorts, discover hidden gems,
                  and find the perfect place for your next getaway.
                </p>
              </section>

              <section
                className="feature-list"
                aria-label="MINDORO SCAPE features"
              >
                {features.map((feature) => {
                  const FeatureIcon = feature.icon;

                  return (
                    <button
                      key={feature.id}
                      type="button"
                      className="feature-card"
                      onClick={() => navigate(`/feature/${feature.id}`)}
                    >
                      <span
                        className={`feature-icon ${feature.iconClass}`}
                        aria-hidden="true"
                      >
                        <FeatureIcon size={25} strokeWidth={1.8} />
                      </span>

                      <span className="feature-text">
                        <span className="feature-title">
                          {feature.title}
                        </span>

                        <span className="feature-description">
                          {feature.description}
                        </span>
                      </span>

                      <span className="feature-arrow" aria-hidden="true">
                        <span className="feature-arrow-line" />
                      </span>
                    </button>
                  );
                })}
              </section>

              <section className="onboarding-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => handleProtectedNavigation('/signup')}
                  aria-disabled={platformSuspended}
                >
                  <Compass size={19} strokeWidth={2} />
                  Get Started
                </button>

                <p className="login-prompt">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => handleProtectedNavigation('/login')}
                    aria-disabled={platformSuspended}
                  >
                    Log in
                  </button>
                </p>
              </section>
            </div>
          </div>

          <footer className="onboarding-footer">
            <span className="footer-brand">MINDORO SCAPE</span>
            <span>MADE FOR YOUR NEXT MINDORO ADVENTURE</span>
          </footer>
        </main>
      </IonContent>
    </IonPage>
  );
};

export default Home;
