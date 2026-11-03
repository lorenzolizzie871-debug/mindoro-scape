import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, IonIcon, IonSpinner } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { 
  notificationsOutline, personOutline, shieldOutline, logOutOutline,
  businessOutline, peopleOutline, checkmarkCircleOutline, closeCircleOutline,
  documentTextOutline, warningOutline, eyeOutline
} from 'ionicons/icons';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'owners' | 'users'>('overview');
  const [owners, setOwners] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<any>(null); // Para sa modal viewing

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate('/login?role=admin');
        return;
      }
    });

    // Fetch Owners & Users real-time
    const qUsers = query(collection(db, 'users'));
    const unsubscribeData = onSnapshot(qUsers, (snapshot) => {
      const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setOwners(allUsers.filter(u => u.role === 'owner'));
      setUsers(allUsers.filter(u => u.role === 'user'));
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeData();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login?role=admin');
  };

  // Approve o Reject Owner
  const handleVerifyOwner = async (ownerId: string, status: 'approved' | 'rejected') => {
    try {
      const ownerRef = doc(db, 'users', ownerId);
      await updateDoc(ownerRef, { status });
      setSelectedOwner(null); // Isara ang modal
      alert(`Owner account has been ${status}.`);
    } catch (error) {
      console.error("Error updating owner:", error);
      alert('Failed to update owner status.');
    }
  };

  // Delete User (Violation)
  const handleDeleteUser = async (userId: string, userName: string) => {
    if (window.confirm(`Are you sure you want to remove ${userName}? This action cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        alert('User has been removed.');
      } catch (error) {
        console.error("Error deleting user:", error);
        alert('Failed to remove user.');
      }
    }
  };

  if (loading) {
    return (
      <IonPage>
        <IonContent className="admin-bg">
          <div className="admin-center"><IonSpinner name="crescent" /></div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonContent className="admin-bg">
        
        {/* HEADER */}
        <header className="admin-header">
          <div className="admin-header-brand">
            <div className="admin-icon-box">
              <IonIcon icon={shieldOutline} />
            </div>
            <div>
              <p className="admin-eyebrow">LGU Oversight • MIMAROPA</p>
              <h1>Executive Tourism</h1>
            </div>
          </div>
          <div className="admin-header-actions">
            <button className="admin-icon-btn relative">
              <IonIcon icon={notificationsOutline} />
              <span className="admin-dot"></span>
            </button>
            <button className="admin-logout-mini" onClick={handleLogout}>
              <IonIcon icon={logOutOutline} />
            </button>
          </div>
        </header>

        <main className="admin-main">
          
          {/* ================= TAB: OVERVIEW ================= */}
          {activeTab === 'overview' && (
            <section className="admin-tab-content">
              <div className="admin-welcome">
                <span className="admin-badge-live">Live Provincial Grid</span>
                <h2>Executive Dashboard</h2>
              </div>

              {/* KPI Cards */}
              <div className="admin-stats-grid">
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Total Users</span>
                  <h3 className="admin-stat-value">{users.length}</h3>
                  <span className="admin-stat-sub">Registered Travelers</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Total Partners</span>
                  <h3 className="admin-stat-value">{owners.length}</h3>
                  <span className="admin-stat-sub">Resort Owners</span>
                </div>
              </div>

              {/* Quick Alert Panel */}
              <div className="admin-alert-panel">
                <IonIcon icon={warningOutline} size="large" />
                <div>
                  <h3>Administrative Queue</h3>
                  <p>You have {owners.filter(o => o.status === 'pending').length} pending resort applications requiring review.</p>
                </div>
              </div>
            </section>
          )}

          {/* ================= TAB: OWNERS (RESORTS) ================= */}
          {activeTab === 'owners' && (
            <section className="admin-tab-content">
              <div className="admin-section-header">
                <h2>Resort Owners</h2>
                <span>{owners.length} Total</span>
              </div>
              
              <div className="admin-list">
                {owners.map(owner => (
                  <div className="admin-list-item" key={owner.id}>
                    <div className="admin-list-main">
                      <div className="admin-avatar bg-blue"><IonIcon icon={businessOutline} /></div>
                      <div>
                        <h4>{owner.resortName || 'Unnamed Resort'}</h4>
                        <p>{owner.fullName} • {owner.email}</p>
                      </div>
                    </div>
                    <div className="admin-list-actions">
                      <span className={`admin-status ${owner.status || 'pending'}`}>
                        {owner.status || 'pending'}
                      </span>
                      <button className="admin-btn-view" onClick={() => setSelectedOwner(owner)}>
                        <IonIcon icon={eyeOutline} /> View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ================= TAB: USERS ================= */}
          {activeTab === 'users' && (
            <section className="admin-tab-content">
              <div className="admin-section-header">
                <h2>Registered Travelers</h2>
                <span>{users.length} Total</span>
              </div>
              
              <div className="admin-list">
                {users.map(user => (
                  <div className="admin-list-item" key={user.id}>
                    <div className="admin-list-main">
                      <div className="admin-avatar bg-teal"><IonIcon icon={personOutline} /></div>
                      <div>
                        <h4>{user.fullName}</h4>
                        <p>{user.email}</p>
                      </div>
                    </div>
                    <div className="admin-list-actions">
                      <button className="admin-btn-delete" onClick={() => handleDeleteUser(user.id, user.fullName)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </main>

        {/* BOTTOM NAVIGATION FOR ADMIN */}
        <nav className="admin-bottom-nav">
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
            <IonIcon icon={shieldOutline} /><span>Overview</span>
          </button>
          <button className={activeTab === 'owners' ? 'active' : ''} onClick={() => setActiveTab('owners')}>
            <IonIcon icon={businessOutline} /><span>Resorts</span>
          </button>
          <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
            <IonIcon icon={peopleOutline} /><span>Users</span>
          </button>
        </nav>

        {/* ================= MODAL: VIEW OWNER DETAILS ================= */}
        {selectedOwner && (
          <div className="admin-modal-backdrop" onClick={() => setSelectedOwner(null)}>
            <div className="admin-modal" onClick={e => e.stopPropagation()}>
              <h3>Owner Application</h3>
              
              <div className="admin-modal-details">
                <p><strong>Resort:</strong> {selectedOwner.resortName}</p>
                <p><strong>Owner:</strong> {selectedOwner.fullName}</p>
                <p><strong>Location:</strong> {selectedOwner.resortLocation}</p>
                <p><strong>Permit ID:</strong> {selectedOwner.permitId}</p>
              </div>

              {selectedOwner.permitImageUrl && (
                <div className="admin-modal-image">
                  <p><IonIcon icon={documentTextOutline} /> Business Permit</p>
                  <img src={selectedOwner.permitImageUrl} alt="Permit" />
                </div>
              )}

              <div className="admin-modal-actions">
                <button className="admin-btn-reject" onClick={() => handleVerifyOwner(selectedOwner.id, 'rejected')}>
                  <IonIcon icon={closeCircleOutline} /> Reject
                </button>
                <button className="admin-btn-approve" onClick={() => handleVerifyOwner(selectedOwner.id, 'approved')}>
                  <IonIcon icon={checkmarkCircleOutline} /> Approve
                </button>
              </div>
            </div>
          </div>
        )}

      </IonContent>
    </IonPage>
  );
};

export default AdminDashboard;