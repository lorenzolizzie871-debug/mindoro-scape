import { IonContent, IonPage } from '@ionic/react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Palmtree,
  Images,
  Heart,
  MapPinned,
  MapPin,
  Compass,
  CalendarDays,
  ClipboardCheck,
  Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './FeaturePage.css';

type FeatureId = 'resorts' | 'location' | 'reservation';

type Highlight = {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

type FeatureInfo = {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  locationLabel: string;
  highlights: Highlight[];
  sectionTitle: string;
  sectionDescription: string;
};

const featureData: Record<FeatureId, FeatureInfo> = {
  resorts: {
    eyebrow: 'YOUR ISLAND ESCAPE STARTS HERE',
    title: 'Discover Beautiful Resorts in Oriental Mindoro',
    description:
      'Find your next getaway in Oriental Mindoro. Browse resort information, view photos, compare amenities and rates, and discover a place that suits your travel plans.',
    image:
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1400&q=85',
    alt: 'Tropical resort with a swimming pool surrounded by palm trees',
    locationLabel: 'ORIENTAL MINDORO',
    highlights: [
      {
        number: '01',
        title: 'Wide Selection of Resorts',
        description:
          'Explore beachfront, island, and nature-inspired resorts across Oriental Mindoro.',
        icon: Palmtree,
      },
      {
        number: '02',
        title: 'View Photos & Amenities',
        description:
          'See resort photos, amenities, and rates to help you choose the perfect stay.',
        icon: Images,
      },
      {
        number: '03',
        title: 'Save Your Favorites',
        description:
          'Create an account to save and revisit your preferred resorts.',
        icon: Heart,
      },
    ],
    sectionTitle: 'Your next getaway starts here',
    sectionDescription:
      'Explore your options and find a resort that matches your preferred experience.',
  },

  location: {
    eyebrow: 'FIND YOUR PLACE IN PARADISE',
    title: 'Explore Resort Locations Across Oriental Mindoro',
    description:
      'Discover where your next escape awaits. Explore resort locations around Oriental Mindoro, check their addresses, and plan how to reach your chosen destination.',
    image:
      'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=85',
    alt: 'Clear tropical ocean and coastline viewed from the shore',
    locationLabel: 'DISCOVER YOUR DESTINATION',
    highlights: [
      {
        number: '01',
        title: 'Explore Resort Locations',
        description:
          'Discover resorts in different areas of Oriental Mindoro and compare their locations.',
        icon: MapPinned,
      },
      {
        number: '02',
        title: 'Check Resort Addresses',
        description:
          'Review available location details to help you identify your preferred resort.',
        icon: MapPin,
      },
      {
        number: '03',
        title: 'Plan Your Visit',
        description:
          'Use location information and available map directions to plan your journey.',
        icon: Compass,
      },
    ],
    sectionTitle: 'Discover where your escape begins',
    sectionDescription:
      'Explore locations first, then choose a resort that fits your travel plans.',
  },

  reservation: {
    eyebrow: 'MAKE YOUR NEXT STAY A PLAN',
    title: 'Request Your Resort Reservation with Ease',
    description:
      'Planning a getaway should feel simple. Choose a resort, provide your preferred dates and guest details, then submit a reservation request and check its status through your account.',
    image:
      'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1400&q=85',
    alt: 'Resort swimming pool beside tropical accommodation',
    locationLabel: 'PLAN YOUR NEXT STAY',
    highlights: [
      {
        number: '01',
        title: 'Choose Your Resort',
        description:
          'Browse resort information before deciding where you would like to stay.',
        icon: Search,
      },
      {
        number: '02',
        title: 'Submit Your Request',
        description:
          'Provide your preferred travel dates and the required reservation details.',
        icon: CalendarDays,
      },
      {
        number: '03',
        title: 'Check Request Status',
        description:
          'Sign in to review the latest status of your reservation request.',
        icon: ClipboardCheck,
      },
    ],
    sectionTitle: 'A smoother way to plan your stay',
    sectionDescription:
      'Prepare your travel details and manage your reservation requests in one place.',
  },
};

const featureLinks: {
  id: FeatureId;
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: 'resorts',
    number: '01',
    title: 'Discover Beautiful Resorts',
    description: 'Browse resort photos, amenities, and rates.',
    icon: Palmtree,
  },
  {
    id: 'location',
    number: '02',
    title: 'Explore Resorts Location',
    description: 'Discover where resorts are located.',
    icon: MapPinned,
  },
  {
    id: 'reservation',
    number: '03',
    title: 'Request a Reservation',
    description: 'Learn how to submit a reservation request.',
    icon: CalendarDays,
  },
];

const FeaturePage: React.FC = () => {
  const navigate = useNavigate();
  const { featureId } = useParams<{ featureId: string }>();

  const validFeatureId: FeatureId =
    featureId === 'location' || featureId === 'reservation'
      ? featureId
      : 'resorts';

  const overview = featureData[validFeatureId];

  return (
    <IonPage>
      <IonContent fullscreen className="feature-content">
        <main className="feature-page">
          <div className="feature-background-shape" aria-hidden="true" />

          <header className="feature-header">
            <button
              type="button"
              className="feature-brand"
              onClick={() => navigate('/home')}
              aria-label="Go to MINDORO SCAPE home"
            >
              <img
                src="/assets/mindoro-scape-logo.png"
                alt=""
              />

              <span className="feature-brand-text">
                <strong>MINDORO SCAPE</strong>
                <small>YOUR ISLAND ESCAPE</small>
              </span>
            </button>

            <button
              type="button"
              className="feature-home-button"
              onClick={() => navigate('/home')}
            >
              Home
            </button>
          </header>

          <section className="feature-hero">
            <div className="feature-copy">
              <p className="feature-eyebrow">
                <span className="feature-eyebrow-dot" />
                {overview.eyebrow}
              </p>

              <h1>
                {validFeatureId === 'resorts' ? (
                  <>
                    Discover Beautiful Resorts in{' '}
                    <span>Oriental Mindoro</span>
                  </>
                ) : (
                  overview.title
                )}
              </h1>

              <p className="feature-description">
                {overview.description}
              </p>

              <div className="feature-highlights">
                {overview.highlights.map((item) => {
                  const HighlightIcon = item.icon;

                  return (
                    <article
                      className="feature-highlight"
                      key={item.number}
                    >
                      <div
                        className="feature-highlight-icon"
                        aria-hidden="true"
                      >
                        <HighlightIcon
                          size={24}
                          strokeWidth={1.8}
                        />
                      </div>

                      <div className="feature-highlight-copy">
                        <h2>{item.title}</h2>
                        <p>{item.description}</p>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="feature-actions">
                <button
                  type="button"
                  className="feature-create-button"
                  onClick={() => navigate('/signup')}
                >
                  Create an Account
                </button>

                <button
                  type="button"
                  className="feature-login-button"
                  onClick={() => navigate('/login')}
                >
                  Log In
                </button>
              </div>

              <p className="feature-note">
                Sign in or create an account to access available app features.
              </p>
            </div>

            <div className="feature-visual">
              <div className="feature-photo">
                <img
                  src={overview.image}
                  alt={overview.alt}
                  loading="eager"
                />

                <div className="feature-photo-overlay" />

                <div className="feature-photo-label">
                  <span
                    className="feature-location-symbol"
                    aria-hidden="true"
                  >
                    {validFeatureId === 'location' ? (
                      <MapPinned size={22} strokeWidth={1.8} />
                    ) : validFeatureId === 'reservation' ? (
                      <CalendarDays size={22} strokeWidth={1.8} />
                    ) : (
                      <MapPin size={22} strokeWidth={1.8} />
                    )}
                  </span>

                  <span>
                    <strong>{overview.locationLabel}</strong>
                    <small>ORIENTAL MINDORO, PHILIPPINES</small>
                  </span>
                </div>
              </div>

              <div className="feature-photo-note">
                <span
                  className="feature-photo-note-mark"
                  aria-hidden="true"
                >
                  <Compass size={21} strokeWidth={1.8} />
                </span>

                <div>
                  <strong>
                    {validFeatureId === 'resorts'
                      ? 'Find your own piece of paradise'
                      : validFeatureId === 'location'
                        ? 'Explore places worth discovering'
                        : 'Make room for your next getaway'}
                  </strong>

                  <p>
                    {validFeatureId === 'location'
                      ? 'Discover resort locations throughout the province.'
                      : 'Your next Oriental Mindoro adventure starts here.'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="feature-overview">
            <div className="feature-section-heading">
              <div>
                <p className="feature-section-eyebrow">
                  EXPLORE MINDORO SCAPE
                </p>

                <h2>{overview.sectionTitle}</h2>

                <p>{overview.sectionDescription}</p>
              </div>

              <span
                className="feature-section-number"
                aria-hidden="true"
              >
                0
                {featureLinks.findIndex(
                  (item) => item.id === validFeatureId,
                ) + 1}
              </span>
            </div>

            <nav
              className="feature-navigation"
              aria-label="Explore MINDORO SCAPE features"
            >
              {featureLinks.map((item) => {
                const isActive = item.id === validFeatureId;
                const NavigationIcon = item.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`feature-navigation-card ${
                      isActive ? 'is-active' : ''
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => navigate(`/feature/${item.id}`)}
                  >
                    <span
                      className="feature-navigation-icon"
                      aria-hidden="true"
                    >
                      <NavigationIcon
                        size={24}
                        strokeWidth={1.8}
                      />
                    </span>

                    <span className="feature-navigation-copy">
                      <small>FEATURE {item.number}</small>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </span>

                    <span
                      className="feature-navigation-status"
                      aria-hidden="true"
                    >
                      {isActive ? 'Selected' : 'Explore'}
                    </span>
                  </button>
                );
              })}
            </nav>
          </section>

          {/* FOOTER — SAME SIMPLE STYLE AS HOMEPAGE */}
          <footer className="feature-footer">
            <div className="feature-footer-brand">
              <strong>MINDORO SCAPE</strong>
              <span>MADE FOR YOUR NEXT MINDORO ADVENTURE</span>
            </div>
          </footer>
        </main>
      </IonContent>
    </IonPage>
  );
};

export default FeaturePage;
