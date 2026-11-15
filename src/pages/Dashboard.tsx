import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import logo from '../assets/images/meedo-logo.png'; 
import '../css/dashboard.css';

export default function Dashboard() {
  const [overview, setOverview] = useState({
    stalls: 0, occupied: 0, vacant: 0, tenants: 0, paid: 0, overdue: 0
  });
  const [recentStalls, setRecentStalls] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [userName, setUserName] = useState('Admin');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const name = user.user_metadata?.full_name || user.user_metadata?.role || user.email?.split('@')[0] || 'Admin';
        setUserName(name.charAt(0).toUpperCase() + name.slice(1));
      }
    }
    getUser();
  }, []);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        // Fetch all necessary data at once
        const [
          { data: stallsData },
          { data: tenantsData },
          { count: tenantCount },
          { data: paymentsData },
          { data: recent }
        ] = await Promise.all([
          supabase.from('stalls').select('*'),
          supabase.from('tenants').select('*').eq('status', 'active'),
          supabase.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('payments').select('*').order('due_date', { ascending: true }),
          supabase.from('stalls').select('stall_number, status, tenant_name, sections(section_name)').order('created_at', { ascending: false }).limit(5)
        ]);

        if (stallsData) {
          const occupied = stallsData.filter(s => s.status === 'Occupied').length;
          
          let paidCount = 0;
          let overdueCount = 0;
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Replicate the exact logic from Stall Monitoring to calculate accurate metrics
          stallsData.forEach((stall) => {
            const activeTenant = tenantsData?.find(t => t.stall_id === stall.id);
            const stallPayments = (paymentsData || []).filter(p => p.stall_id === stall.id);
            
            // Only calculate payment status for occupied stalls with a tenant
            if (stall.status === 'Occupied' && activeTenant) {
              const currentDueBill = stallPayments.find(p => {
                if (p.status === 'Paid') return false;
                const dueDate = new Date(p.due_date);
                dueDate.setHours(0, 0, 0, 0);
                return dueDate <= today;
              });

              const nextBill = stallPayments.find(p => {
                if (p.status === 'Paid') return false;
                const dueDate = new Date(p.due_date);
                dueDate.setHours(0, 0, 0, 0);
                return dueDate > today;
              });

              const activeBill = currentDueBill || nextBill;

              if (!activeBill) {
                paidCount++;
              } else {
                const dueDate = new Date(activeBill.due_date);
                const graceDays = activeBill.grace_period_days || 3;
                const penaltyStartDate = new Date(dueDate);
                penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
                penaltyStartDate.setHours(0, 0, 0, 0);

                if (today > penaltyStartDate) {
                  overdueCount++;
                }
              }
            }
          });

          setOverview({
            stalls: stallsData.length,
            occupied,
            vacant: stallsData.length - occupied,
            tenants: tenantCount || 0,
            paid: paidCount,
            overdue: overdueCount,
          });
        }

        if (recent) setRecentStalls(recent);
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="content-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading MEEDO Command Center...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      
      {/* Header */}
      <div className="header">
        <div>
          <h1>{greeting}, {userName} 👋</h1>
          <p><i className="fa-regular fa-calendar"></i> {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="home">
        
        {/* Hero Banner */}
        <div className="overview-intro">
          <div>
            <span className="eyebrow">Odiongan Public Market</span>
            <h1>MEEDO Command Center</h1>
            <p>Monitor your stalls, tenants, and financial collections from one centralized dashboard.</p>
          </div>
          <img src={logo} alt="MEEDO Logo" />
        </div>

        {/* Metrics Grid */}
        <div className="metrics">
          <Link className="metric-card metric-primary" to="/stall-monitoring">
            <div className="metric-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><i className="fa-solid fa-shop"></i></div>
            <span>
              <small>Total Stalls</small>
              <strong>{overview.stalls}</strong>
              <em>{overview.occupied} occupied · {overview.vacant} vacant</em>
            </span>
          </Link>
          
          <Link className="metric-card metric-success" to="/register-tenant">
            <div className="metric-icon" style={{ background: '#ecfdf5', color: '#10b981' }}><i className="fa-solid fa-users"></i></div>
            <span>
              <small>Active Tenants</small>
              <strong>{overview.tenants}</strong>
              <em>Registered businesses</em>
            </span>
          </Link>

          <Link className="metric-card metric-primary" to="/stall-monitoring">
            <div className="metric-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><i className="fa-solid fa-receipt"></i></div>
            <span>
              <small>Paid Accounts</small>
              <strong>{overview.paid}</strong>
              <em>Current month</em>
            </span>
          </Link>

          <Link className="metric-card metric-danger" to="/stall-monitoring">
            <div className="metric-icon" style={{ background: '#fef2f2', color: '#ef4444' }}><i className="fa-solid fa-triangle-exclamation"></i></div>
            <span>
              <small>Overdue Accounts</small>
              <strong>{overview.overdue}</strong>
              <em>Require attention</em>
            </span>
          </Link>
        </div>

        {/* Columns */}
        <div className="overview-columns">
          
          {/* Recent Activity */}
          <section className="overview-panel activity-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Latest Records</span>
                <h2>Stall Activity</h2>
              </div>
              <Link to="/stall-monitoring">View all <i className="fa-solid fa-arrow-right"></i></Link>
            </div>
            
            {recentStalls.length > 0 ? (
              <div className="activity-list">
                {recentStalls.map((stall, index) => (
                  <Link key={index} className="activity-row" to={`/stall-details?stall=${stall.stall_number}`}>
                    <div className="activity-mark" style={{ background: '#e0f2fe', color: '#0284c7' }}><i className="fa-solid fa-store"></i></div>
                    <span className="activity-copy">
                      <strong>{stall.stall_number}</strong>
                      <small>{stall.sections?.section_name || 'Unassigned'} {stall.tenant_name && `· ${stall.tenant_name}`}</small>
                    </span>
                    <span className={`status-pill status-${stall.status.toLowerCase()}`}>{stall.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="no-data">No stall records available.</p>
            )}
          </section>

          {/* Quick Actions */}
          <section className="overview-panel quick-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Workspace</span>
                <h2>Quick Actions</h2>
              </div>
            </div>
            
            <Link className="quick-link" to="/manage-stalls">
              <div className="quick-link-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><i className="fa-solid fa-store"></i></div>
              <span>
                <strong>Manage Stalls</strong>
                <small>Organize sections and availability</small>
              </span>
              <i className="fa-solid fa-chevron-right" style={{ color: '#cbd5e1' }}></i>
            </Link>

            <Link className="quick-link" to="/register-tenant">
              <div className="quick-link-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><i className="fa-solid fa-user-plus"></i></div>
              <span>
                <strong>Register Tenant</strong>
                <small>Add a new market business</small>
              </span>
              <i className="fa-solid fa-chevron-right" style={{ color: '#cbd5e1' }}></i>
            </Link>

            <Link className="quick-link" to="/contracts">
              <div className="quick-link-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><i className="fa-solid fa-file-signature"></i></div>
              <span>
                <strong>Review Contracts</strong>
                <small>Manage agreements and extensions</small>
              </span>
              <i className="fa-solid fa-chevron-right" style={{ color: '#cbd5e1' }}></i>
            </Link>

            <Link className="quick-link" to="/financial-reports">
              <div className="quick-link-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><i className="fa-solid fa-chart-column"></i></div>
              <span>
                <strong>Financial Reports</strong>
                <small>Check collections and overdue rent</small>
              </span>
              <i className="fa-solid fa-chevron-right" style={{ color: '#cbd5e1' }}></i>
            </Link>
          </section>

        </div>
      </div>
    </div>
  );
}