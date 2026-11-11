import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import logo from '../assets/images/meedo-logo.png';
import '../css/sidebar.css';

interface SidebarProps {
  userRole: string;
  isMobileOpen: boolean; 
}

export default function Sidebar({ userRole, isMobileOpen }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Automatically un-collapse when switching to mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setIsCollapsed(false);
      }
    };

    // Run once on mount
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path ? 'active' : '';

  return (
    <>
      <div className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
        
        <div className="sidebar-header">
          <div className="logo">
            <img src={logo} alt="MEEDO Logo" />
            <h2>MEEDO</h2> 
          </div>
          <button 
            type="button" 
            className="sidebar-toggle" 
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <i className={`fa-solid ${isCollapsed ? 'fa-angles-right' : 'fa-angles-left'}`}></i>
          </button>
        </div>

        <ul>
          <li className={isActive('/dashboard')}>
            <Link to="/dashboard">
              <div className="active-line"></div>
              <i className="fa-solid fa-table-cells-large"></i>
              <span>Home</span>
            </Link>
          </li>
          <li className={isActive('/stall-monitoring')}>
            <Link to="/stall-monitoring">
              <div className="active-line"></div>
              <i className="fa-solid fa-shop"></i>
              <span>Stall Monitoring</span>
            </Link>
          </li>
          
          {(userRole === 'Administrator' || userRole === 'Meedo Personnel') && (
            <>
              <li className={isActive('/manage-stalls')}>
                <Link to="/manage-stalls">
                  <div className="active-line"></div>
                  <i className="fa-solid fa-store"></i>
                  <span>Manage Stalls</span>
                </Link>
              </li>
              <li className={isActive('/register-tenant')}>
                <Link to="/register-tenant">
                  <div className="active-line"></div>
                  <i className="fa-regular fa-user"></i>
                  <span>Register Tenant</span>
                </Link>
              </li>
            </>
          )}

          <li className={isActive('/financial-reports')}>
            <Link to="/financial-reports">
              <div className="active-line"></div>
              <i className="fa-regular fa-clipboard"></i>
              <span>Financial Reports</span>
            </Link>
          </li>

          {(userRole === 'Administrator' || userRole === 'Meedo Personnel') && (
            <li className={isActive('/contracts')}>
              <Link to="/contracts">
                <div className="active-line"></div>
                <i className="fa-solid fa-file-contract"></i>
                <span>Contracts</span>
              </Link>
            </li>
          )}

          <li className={isActive('/logs')}>
            <Link to="/logs">
              <div className="active-line"></div>
              <i className="fa-solid fa-clock-rotate-left"></i>
              <span>Activity Logs</span>
            </Link>
          </li>
        </ul>

        <div className="admin">
          <i className="fa-solid fa-user"></i>
          <div>
            <h4>{userRole}</h4>
            <span>{new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <button className="logout-btn" onClick={() => setShowLogoutModal(true)}>
          <i className="fa-solid fa-arrow-right-from-bracket"></i>
          <span>Logout</span>
        </button>
      </div>

      {showLogoutModal && (
        <div className="logout-modal show" onClick={(e) => { if(e.target === e.currentTarget) setShowLogoutModal(false) }}>
          <div className="logout-modal-content">
            <div className="logout-modal-icon">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h3>Confirm Logout</h3>
            <p>Are you sure you want to logout?</p>
            <div className="logout-modal-buttons">
              <button className="btn-cancel" onClick={() => setShowLogoutModal(false)}>Cancel</button>
              <button className="btn-confirm" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}