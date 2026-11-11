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
  const [isLoading, setIsLoading] = useState(true); // ADDED LOADING STATE

  useEffect(() => {
    async function loadData() {
      setIsLoading(true); // Start loading
      try {
        // 1. Fetch Stalls
        const { data: stallsData } = await supabase.from('stalls').select('status');
        
        // 2. Fetch Active Tenants
        const { count: tenantCount } = await supabase
          .from('tenants')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        // 3. Fetch Current Month Payments
        const currentMonth = new Date().toISOString().slice(0, 7) + '-01'; 
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('stall_id, status')
          .gte('month_covered', currentMonth)
          .lte('month_covered', currentMonth);
        
        // 4. Fetch Recent Stalls
        const { data: recent } = await supabase
          .from('stalls')
          .select('stall_number, status, tenant_name, sections(section_name)')
          .order('created_at', { ascending: false })
          .limit(5);
        
        // Calculate Metrics
        if (stallsData) {
          const occupied = stallsData.filter(s => s.status === 'Occupied').length;
          
          let paidCount = 0;
          let overdueCount = 0;
          
          if (paymentsData) {
            const paidStalls = new Set();
            const overdueStalls = new Set();
            
            paymentsData.forEach(p => {
              if (p.status === 'Paid') paidStalls.add(p.stall_id);
              if (p.status === 'Overdue') overdueStalls.add(p.stall_id);
            });
            
            paidCount = paidStalls.size;
            overdueCount = overdueStalls.size;
          }

          setOverview({
            stalls: stallsData.length,
            occupied: occupied,
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
        setIsLoading(false); // Stop loading
      }
    }
    loadData();
  }, []);

  // --- ADDED LOADING SCREEN ---
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', width: '100%' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading dashboard...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      <div className="header">
        <div>
          <h1>System Overview</h1>
          <p><i className="fa-regular fa-calendar"></i> {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      <div className="home">
        <div className="overview-intro">
          <div>
            <span className="eyebrow">Odiongan Public Market</span>
            <h1>Everything at a glance.</h1>
            <p>Monitor stalls, tenants, and rental collections from one place.</p>
          </div>
          <img src={logo} alt="MEEDO Logo" />
        </div>

        <div className="metrics">
          <Link className="metric-card metric-primary" to="/stall-monitoring">
            <span className="metric-icon"><i className="fa-solid fa-shop"></i></span>
            <span>
              <small>Total stalls</small>
              <strong>{overview.stalls}</strong>
              <em>{overview.occupied} occupied</em>
            </span>
          </Link>
          <Link className="metric-card" to="/manage-stalls">
            <span className="metric-icon"><i className="fa-solid fa-door-open"></i></span>
            <span>
              <small>Available</small>
              <strong>{overview.vacant}</strong>
              <em>ready for lease</em>
            </span>
          </Link>
          <Link className="metric-card" to="/register-tenant">
            <span className="metric-icon"><i className="fa-solid fa-users"></i></span>
            <span>
              <small>Active tenants</small>
              <strong>{overview.tenants}</strong>
              <em>registered businesses</em>
            </span>
          </Link>
          <Link className="metric-card" to="/financial-reports">
            <span className="metric-icon"><i className="fa-solid fa-peso-sign"></i></span>
            <span>
              <small>Paid this month</small>
              <strong>{overview.paid}</strong>
              <em>{overview.overdue} overdue</em>
            </span>
          </Link>
        </div>

        <div className="overview-columns">
          <section className="overview-panel activity-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Latest records</span><h2>Stall activity</h2></div>
              <Link to="/stall-monitoring">View all <i className="fa-solid fa-arrow-up-right-from-square"></i></Link>
            </div>
            
            {recentStalls.length > 0 ? (
              <div className="activity-list">
                {recentStalls.map((stall, index) => (
                  <Link key={index} className="activity-row" to={`/stall-details?stall=${stall.stall_number}`}>
                    <span className="activity-mark"><i className="fa-solid fa-store"></i></span>
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

          <section className="overview-panel quick-panel">
            <div className="panel-heading"><div><span className="eyebrow">Workspace</span><h2>Quick actions</h2></div></div>
            <Link className="quick-link" to="/manage-stalls"><i className="fa-solid fa-store"></i><span><strong>Manage stalls</strong><small>Organize sections and availability</small></span><i className="fa-solid fa-chevron-right"></i></Link>
            <Link className="quick-link" to="/register-tenant"><i className="fa-solid fa-user-plus"></i><span><strong>Register tenant</strong><small>Add a new market business</small></span><i className="fa-solid fa-chevron-right"></i></Link>
            <Link className="quick-link" to="/financial-reports"><i className="fa-solid fa-chart-column"></i><span><strong>Review finances</strong><small>Check collections and overdue rent</small></span><i className="fa-solid fa-chevron-right"></i></Link>
          </section>
        </div>
      </div>
    </div>
  );
}