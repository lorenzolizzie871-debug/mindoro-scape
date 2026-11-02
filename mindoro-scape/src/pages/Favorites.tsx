import React, { useState } from 'react';
import { IonContent, IonIcon, IonPage } from '@ionic/react';
import {
  locationOutline,
  notificationsOutline,
  personOutline,
  heart,
  trashOutline,
  shareSocialOutline,
  star,
  calendarOutline,
  eyeOutline,
  peopleOutline,
  checkmarkCircle,
  heartDislike,
  informationCircle,
  copy
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BottomTabs from '../components/BottomTabs';
import './Favorites.css';

// --- MOCK DATA ---
const INITIAL_FAVORITES = [
  {
    id: 1,
    name: 'Infinity Resort & Spa',
    location: 'Talipanan, Puerto Galera',
    price: 7800,
    rating: 4.9,
    reviews: 128,
    tag: 'Beachfront • Luxury',
    locationGroup: 'puerto-galera',
    tagGroup: 'pool',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBTEh6GYQ2IciyOQgMNsvZpxBaUEP9CutWsk4go5ZGABvH1mqmiZk0K4CoQhmAs_dCouk7-DRQ35Ro-bfrdccyd61GXuFZPgv83_i3bRFw95XSG8La7GrbkLKaCyLKdty04sqveIjoqzfpw-G5R_opslkTkQuE4PrncpiH5wYADIqlFIkMPVJwFSUkLObEm_jM4_Z6GycD56UJDKYPCOcWDp9rUJFl-1fLFUZCm7CDMe7OJv_13veVA'
  },
  {
    id: 2,
    name: 'Southdrive Beach Resort',
    location: 'San Jose, Bulalacao',
    price: 3800,
    rating: 4.8,
    reviews: 88,
    tag: 'Island Hopping',
    locationGroup: 'bulalacao',
    tagGroup: 'island',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDMtNc0mcx8vXsBXVhN5NSM7mbGpej-de-rlFivCHkkhXyLGh_7aSWqqhz31qdGQ8Ybj0Lt4NimHLYXxl2birEytiObJqEdf2VM7P7091R_dQor0FwJaGYqeL_q42IHi7wThoXHywCoe8BdtsaJ_tNKH3RA_fD22xoxc1cjfUCNpDhaRHyHqFR6qtcJALI3qYXS1NDBPtt72yo88UvT_Wf3JavXyVOq4ERM93zkngrM4eJAvxo1anoU'
  },
  {
    id: 3,
    name: 'Fridays Puerto Galera',
    location: 'Boquete Island, Puerto Galera',
    price: 8500,
    rating: 4.9,
    reviews: 214,
    tag: 'Dive Center',
    locationGroup: 'puerto-galera',
    tagGroup: 'dive',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDV0VDuel-ggFjf-MVhmspg4vUljlvz1p_7YRn4zvheD38zurla4lVnsviPxHzIlHAoh2i5M43D2ihvsJffdiTGdixvrvxReUln_Z9NXkhi84FAFvgmz1Nv4DI3uUZlQ6HtndK5NtWkCM98ppg3groMYOVQL0OQtccyEfRVOeJnAW5BR9Vov8g0bX-EG4DllT26KHLQSIRTxA31jpsx_KjvmauUPtwmuinF_xPKkx_Gf463kWfCr463'
  }
];

const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(price);

const Favorites: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [favorites, setFavorites] = useState(INITIAL_FAVORITES);
  const [activeFilter, setActiveFilter] = useState('all');
  const [isPreviewEmpty, setIsPreviewEmpty] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string; icon: string }>({
    show: false,
    message: '',
    icon: '',
  });

  const showToast = (message: string, icon: string = checkmarkCircle) => {
    setToast({ show: true, message, icon });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2600);
  };

  const handleRemove = (id: number, name: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
    showToast(`${name} removed from favorites`, heartDislike);
  };

  const handleClearAll = () => {
    if (favorites.length === 0) {
      showToast('Wishlist is already empty', informationCircle);
      return;
    }
    setFavorites([]);
    showToast('All saved escapes cleared', trashOutline);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Mindoro Scape Wishlist',
        text: 'Take a look at my saved tropical retreats in Oriental Mindoro!',
        url: window.location.href,
      }).catch(() => {});
    } else {
      showToast('Wishlist link copied to clipboard', copy);
    }
  };

  const filteredFavorites = favorites.filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'puerto-galera') return item.locationGroup === 'puerto-galera';
    if (activeFilter === 'bulalacao') return item.locationGroup === 'bulalacao';
    if (activeFilter === 'pool') return item.tagGroup === 'pool';
    return true;
  });

  const showEmptyState = isPreviewEmpty || favorites.length === 0;

  return (
    <IonPage>
      <IonContent className="favorites-content">
        <div className="favorites-shell">
          
          {/* HEADER */}
          <header className="fav-header">
            <button className="fav-brand" onClick={() => navigate('/user/dashboard')}>
              <img
                alt="Mindoro Scape"
                src="/assets/mindoro-scape-logo.png"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              <div className="fav-brand-copy">
                <strong>Mindoro Scape</strong>
                <small>
                  <IonIcon icon={locationOutline} className="text-[12px]" />
                  ORIENTAL MINDORO
                </small>
              </div>
            </button>

            <div className="fav-header-actions">
              <button className="fav-icon-button" onClick={() => navigate('/user/dashboard')}>
                <IonIcon icon={notificationsOutline} className="text-[22px]" />
                <span className="fav-notification-dot"></span>
              </button>
              <button className="fav-profile-button" onClick={() => navigate('/user/profile')}>
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <IonIcon icon={personOutline} className="text-[20px]" />
                )}
              </button>
            </div>
          </header>

          {/* MAIN CONTENT */}
          <main className="fav-main">
            
            <div className="fav-title-row">
              <div>
                <p className="fav-eyebrow">CURATED COLLECTION</p>
                <h1>Saved Escapes</h1>
                <p className="fav-subtitle">
                  {favorites.length === 0 ? 'No sanctuaries saved yet' : `${favorites.length} ${favorites.length === 1 ? 'sanctuary' : 'sanctuaries'} saved for your next trip`}
                </p>
              </div>
              <button onClick={handleClearAll} className="btn-clear">
                <IonIcon icon={trashOutline} className="text-[14px]" />
                <span>Clear</span>
              </button>
            </div>

            {/* FILTER CHIPS */}
            <div className="fav-filters">
              {[
                { id: 'all', label: `All Saved (${favorites.length})` },
                { id: 'puerto-galera', label: 'Puerto Galera (2)' },
                { id: 'bulalacao', label: 'Bulalacao (1)' },
                { id: 'pool', label: 'Private Pool (1)' },
              ].map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setActiveFilter(chip.id)}
                  className={`chip ${activeFilter === chip.id ? 'is-active' : ''}`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* SHARE BANNER */}
            <div className="share-banner">
              <div className="flex items-center gap-3">
                <div className="share-icon-wrap">
                  <IonIcon icon={peopleOutline} className="text-[20px]" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="share-title">Traveling with friends?</span>
                  <span className="share-desc">Share your curated wishlist</span>
                </div>
              </div>
              <button onClick={handleShare} className="btn-share">
                <IonIcon icon={shareSocialOutline} className="text-[14px]" />
                <span>Share</span>
              </button>
            </div>

            {/* CARDS CONTAINER */}
            <div className={`fav-cards-container ${showEmptyState ? 'hidden' : ''}`}>
              {filteredFavorites.map((item) => (
                <div key={item.id} className="resort-card">
                  <div className="card-image-wrap">
                    <img src={item.image} alt={item.name} />
                    <div className="card-gradient"></div>
                    
                    <div className="card-badge">
                      <IonIcon icon={star} className="text-[#006685] text-[12px]" />
                      <span>{item.tag}</span>
                    </div>

                    <button onClick={() => handleRemove(item.id, item.name)} className="btn-heart">
                      <IonIcon icon={heart} className="text-[20px]" />
                    </button>

                    <div className="card-location">
                      <IonIcon icon={locationOutline} className="text-[14px]" />
                      <span>{item.location}</span>
                    </div>
                  </div>

                  <div className="card-details">
                    <div className="card-title-row">
                      <h2 className="card-title">{item.name}</h2>
                      <div className="card-rating">
                        <IonIcon icon={star} className="text-[12px] text-[#e89b19]" />
                        <span className="score">{item.rating}</span>
                        <span className="count">({item.reviews})</span>
                      </div>
                    </div>
                    
                    <div className="card-price-row">
                      <span className="card-price">{formatPrice(item.price)}</span>
                      <span className="card-price-suffix">/ night</span>
                    </div>

                    <div className="card-actions">
                      <button onClick={() => navigate(`/user/resort/${item.id}`)} className="btn-availability">
                        <span>Check Availability</span>
                        <IonIcon icon={calendarOutline} className="text-[18px]" />
                      </button>
                      <button onClick={handleShare} className="btn-share-card">
                        <IonIcon icon={shareSocialOutline} className="text-[20px]" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* EMPTY STATE */}
            <div className={`empty-state ${showEmptyState ? 'is-visible' : ''}`}>
              <div className="empty-icon-wrap">
                <IonIcon icon={heart} className="text-[32px]" />
              </div>
              <h3 className="empty-title">No saved retreats yet</h3>
              <p className="empty-desc">
                Tap the heart icon on any resort, cove, or villa to keep your dream Mindoro trip organized in one sanctuary.
              </p>
              <button onClick={() => navigate('/user/explore')} className="btn-discover">
                <IonIcon icon={locationOutline} className="text-[18px]" />
                <span>Discover Stays</span>
              </button>
            </div>

            {/* PREVIEW TOGGLE */}
            <div className="preview-toggle-wrap">
              <button onClick={() => setIsPreviewEmpty(!isPreviewEmpty)} className="preview-toggle-btn">
                <IonIcon icon={eyeOutline} className="text-[14px]" />
                <span>{isPreviewEmpty ? 'Restore saved resorts view' : 'Preview empty state view'}</span>
              </button>
              <p className="preview-footer-text">
                Curated exclusively for tropical voyagers in Oriental Mindoro.
              </p>
            </div>

          </main>
        </div>

        {/* TOAST NOTIFICATION */}
        <div className={`toast-container ${toast.show ? 'is-visible' : ''}`}>
          <div className="toast-content">
            <IonIcon icon={toast.icon as any} className="text-[18px] text-[#33c9ff]" />
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>

      </IonContent>
      
      {/* BottomTabs */}
      <BottomTabs />
    </IonPage>
  );
};

export default Favorites;