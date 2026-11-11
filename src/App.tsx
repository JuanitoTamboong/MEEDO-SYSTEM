import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { supabase } from './supabase/lib/supabase';

import Login from './pages/login';
import Dashboard from './pages/Dashboard';
import StallMonitoring from './pages/StallMonitoring'; 
import ManageStalls from './pages/ManageStalls';
import RegisterTenant from './pages/RegisterTenant';
import StallDetails from './pages/StallDetails';
import PayRent from './pages/PayRent'; 
import SendReminder from './pages/SendReminder';
import SendNotice from './pages/SendNotice';
import EditTenant from './pages/EditTenant';
import FinancialReports from './pages/FinancialReports';
import Contracts from './pages/Contracts';
import ActivityLogs from './pages/ActivityLogs';
import Layout from './components/Layout';

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("React crashed with error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#fee2e2', color: '#991b1b', fontFamily: 'monospace' }}>
          <h1>React Crashed! Here is the error:</h1>
          <pre>{this.state.error?.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Role Protection Component
function RoleProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser();
      setRole(user?.user_metadata?.role || '');
      setLoading(false);
    }
    checkRole();
  }, []);

  if (loading) return <div>Loading...</div>;

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          
          <Route element={<Layout />}>
            {/* Accessible by Everyone (Including Treasury) */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/stall-monitoring" element={<StallMonitoring />} /> 
            <Route path="/stall-details" element={<StallDetails />} /> 
            <Route path="/financial-reports" element={<FinancialReports />} /> 
            <Route path="/logs" element={<ActivityLogs />} /> 
            
            {/* Treasury CAN Access these */}
            <Route path="/pay-rent" element={<PayRent />} /> 
            <Route path="/send-reminder" element={<SendReminder />} /> 
            <Route path="/send-notice" element={<SendNotice />} /> 
            
            {/* Accessible ONLY by Admin and Meedo Personnel */}
            <Route path="/manage-stalls" element={
              <RoleProtectedRoute allowedRoles={['Administrator', 'Meedo Personnel']}>
                <ManageStalls />
              </RoleProtectedRoute>
            } /> 
            <Route path="/register-tenant" element={
              <RoleProtectedRoute allowedRoles={['Administrator', 'Meedo Personnel']}>
                <RegisterTenant />
              </RoleProtectedRoute>
            } /> 
            <Route path="/edit-tenant" element={
              <RoleProtectedRoute allowedRoles={['Administrator', 'Meedo Personnel']}>
                <EditTenant />
              </RoleProtectedRoute>
            } /> 
            <Route path="/contracts" element={
              <RoleProtectedRoute allowedRoles={['Administrator', 'Meedo Personnel']}>
                <Contracts />
              </RoleProtectedRoute>
            } /> 
          </Route>
          
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;