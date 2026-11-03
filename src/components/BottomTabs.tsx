import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IonIcon } from '@ionic/react';

import {
  homeOutline,
  compassOutline,
  calendarOutline,
  heartOutline,
  personOutline,
} from 'ionicons/icons';

import './BottomTabs.css';

const tabs = [
  { label: 'Home', path: '/user/dashboard', icon: homeOutline },
  { label: 'Explore', path: '/user/explore', icon: compassOutline },
  { label: 'My Bookings', path: '/user/bookings', icon: calendarOutline },
  { label: 'Favorites', path: '/user/favorites', icon: heartOutline },
  { label: 'Profile', path: '/user/profile', icon: personOutline },
];

const BottomTabs: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="bottom-tabs-fixed" aria-label="Main navigation">
      {tabs.map((tab) => {
        const active =
          location.pathname === tab.path ||
          location.pathname.startsWith(`${tab.path}/`);

        return (
          <button
            key={tab.path}
            type="button"
            className={`bottom-tab ${active ? 'is-active' : ''}`}
            onClick={() => navigate(tab.path)}
            aria-current={active ? 'page' : undefined}
          >
            <IonIcon icon={tab.icon} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomTabs;