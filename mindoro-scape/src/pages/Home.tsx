import { IonContent, IonPage } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import {
  Palmtree,
  MapPinned,
  CalendarCheck,
  Compass,
  MapPin,
} from 'lucide-react';
import './Home.css';

const Home: React.FC = () => {
  const navigate = useNavigate();

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

                <div className="hero-feature-shortcuts">
                </div>
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
                  onClick={() => navigate('/signup')}
                >
                  <Compass size={19} strokeWidth={2} />
                  Get Started
                </button>

                <p className="login-prompt">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
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
