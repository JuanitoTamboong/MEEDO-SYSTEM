import { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase/lib/supabase';
import Sidebar from './Sidebar';

export default function Layout() {
  const [userRole, setUserRole] = useState(''); 
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsAuthenticated(false);
      } else {
        setUserRole(session.user.user_metadata?.role || 'Treasury');
        setIsAuthenticated(true);
      }
    }
    checkAuth();
  }, []);

  if (isAuthenticated === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="dashboard-body">
      
      {/* RENDER BUTTON AT ROOT LEVEL USING PORTAL */}
      {createPortal(
        <button 
          className="mobile-menu-btn" 
          onClick={() => setIsMobileOpen(!isMobileOpen)}
        >
          <i className={`fa-solid ${isMobileOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
        </button>,
        document.body
      )}

      {isMobileOpen && (
        <div className="sidebar-overlay active" onClick={() => setIsMobileOpen(false)}></div>
      )}

      <Sidebar userRole={userRole} isMobileOpen={isMobileOpen} />

      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}