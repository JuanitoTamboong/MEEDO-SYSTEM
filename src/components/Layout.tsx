import { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import Sidebar from './Sidebar';

export default function Layout() {
  // Default to empty string, NOT Administrator
  const [userRole, setUserRole] = useState(''); 
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setIsAuthenticated(false);
      } else {
        // Read the role from metadata. If it's missing, force 'Treasury' (most restricted)
        const role = session.user.user_metadata?.role || 'Treasury';
        setUserRole(role);
        setIsAuthenticated(true);
      }
    }
    checkAuth();
  }, []);

  // ==========================================
  // BEAUTIFUL CENTERED LOADING SCREEN
  // ==========================================
  if (isAuthenticated === null) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh', 
        width: '100%',
        background: '#f8fafc' 
      }}>
        <div style={{ 
          width: '48px', 
          height: '48px', 
          border: '4px solid #e2e8f0', 
          borderTop: '4px solid #3b82f6', 
          borderRadius: '50%', 
          animation: 'spin 1s linear infinite' 
        }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
          Loading...
        </p>
        <style>{`
          @keyframes spin { 
            0% { transform: rotate(0deg); } 
            100% { transform: rotate(360deg); } 
          }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="dashboard-body">
      <Sidebar userRole={userRole} />
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}