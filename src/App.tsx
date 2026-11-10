import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Component, type ErrorInfo, type ReactNode } from 'react';
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
import ActivityLogs from './pages/ActivityLogs'; // 1. Import ActivityLogs
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

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          
          {/* Protected Routes inside Layout */}
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/stall-monitoring" element={<StallMonitoring />} /> 
            <Route path="/manage-stalls" element={<ManageStalls />} /> 
            <Route path="/register-tenant" element={<RegisterTenant />} /> 
            <Route path="/stall-details" element={<StallDetails />} /> 
            <Route path="/pay-rent" element={<PayRent />} /> 
            <Route path="/send-reminder" element={<SendReminder />} /> 
            <Route path="/send-notice" element={<SendNotice />} /> 
            <Route path="/edit-tenant" element={<EditTenant />} /> 
            <Route path="/financial-reports" element={<FinancialReports />} /> 
            <Route path="/contracts" element={<Contracts />} /> 
            {/* 2. Add the ActivityLogs route here */}
            <Route path="/logs" element={<ActivityLogs />} /> 
          </Route>
          
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;