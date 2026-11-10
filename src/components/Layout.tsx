import { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import Sidebar from './Sidebar';

export default function Layout() {
  const [userRole, setUserRole] = useState('Loading...');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsAuthenticated(false);
      } else {
        setUserRole(session.user.user_metadata?.role || 'Administrator');
        setIsAuthenticated(true);
      }
    }
    checkAuth();
  }, []);

  if (isAuthenticated === null) return <div>Loading...</div>;
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