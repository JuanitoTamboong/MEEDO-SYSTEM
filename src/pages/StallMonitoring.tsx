import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import '../css/stall-monitoring.css';

interface Stall {
  id: number;
  stall_number: string;
  status: string;
  monthly_rent: number;
  tenant_name: string | null;
  contact_number: string | null;
  section_name: string | null;
  payment_status: string;
  due_date: string | null;
}

interface OverduePayment {
  id: number;
  stall_number: string;
  tenant_name: string | null;
  section_name: string | null;
  amount: number;
  due_date: string;
  penalty: number;
}

export default function StallMonitoring() {
  const navigate = useNavigate();

  const [stalls, setStalls] = useState<Stall[]>([]);
  const [overdueList, setOverdueList] = useState<OverduePayment[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  
  const [totalStalls, setTotalStalls] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const { data: stallsData } = await supabase.from('stalls').select('*');
      const { data: tenantsData } = await supabase.from('tenants').select('*').eq('status', 'active');
      const { data: sectionsData } = await supabase.from('sections').select('*');
      
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .order('due_date', { ascending: false }); 

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (stallsData) {
        const mappedStalls: Stall[] = stallsData.map((s) => {
          const activeTenant = tenantsData?.find((t) => t.stall_id === s.id);
          const stallPayments = paymentsData?.filter((p) => p.stall_id === s.id) || [];
          
          const latestPaid = stallPayments.find(p => p.status === 'Paid');
          let latestPending = stallPayments.find(p => p.status === 'Pending' || p.status === 'Overdue');
          
          if (latestPending) {
            const dueDate = new Date(latestPending.due_date);
            const graceDays = latestPending.grace_period_days || 3;
            const penaltyStartDate = new Date(dueDate);
            penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
            penaltyStartDate.setHours(0, 0, 0, 0);

            if (today > penaltyStartDate) {
              latestPending = { ...latestPending, status: 'Overdue' };
            }
          }

          const currentRecord = latestPaid || latestPending;
          const section = sectionsData?.find((sec) => sec.id === s.section_id);
          
          let pStatus = 'Available';
          if (s.status === 'Occupied' && activeTenant) {
            pStatus = latestPending ? latestPending.status : (currentRecord ? currentRecord.status : 'Pending');
          }

          return {
            id: s.id,
            stall_number: s.stall_number,
            status: s.status,
            monthly_rent: s.monthly_rent,
            tenant_name: activeTenant?.full_name || null,
            contact_number: activeTenant?.contact_number || null,
            section_name: section?.section_name || null,
            payment_status: pStatus,
            due_date: latestPending?.due_date || currentRecord?.due_date || null
          };
        });

        setStalls(mappedStalls);
        setTotalStalls(mappedStalls.length);
        setPaidCount(mappedStalls.filter(s => s.payment_status === 'Paid').length);
        setUnpaidCount(mappedStalls.filter(s => s.payment_status === 'Pending').length);
        setOverdueCount(mappedStalls.filter(s => s.payment_status === 'Overdue').length);
      }

      if (paymentsData) {
        const dynamicOverdue = paymentsData.filter((p) => {
          if (p.status === 'Paid') return false;
          const dueDate = new Date(p.due_date);
          const graceDays = p.grace_period_days || 3;
          const penaltyStartDate = new Date(dueDate);
          penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
          penaltyStartDate.setHours(0, 0, 0, 0);
          return today > penaltyStartDate;
        });

        const mappedOverdue = dynamicOverdue.map((o) => {
          const stall = stallsData?.find(s => s.id === o.stall_id);
          const section = sectionsData?.find(sec => sec.id === stall?.section_id);
          
          return {
            id: o.id,
            stall_number: stall?.stall_number || '—',
            tenant_name: o.tenant_name,
            section_name: section?.section_name || null,
            amount: o.amount,
            due_date: o.due_date,
            penalty: o.penalty || 0
          };
        });
        setOverdueList(mappedOverdue);
      }

      if (sectionsData) {
        setSections([...new Set(sectionsData.map((s) => s.section_name))]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredStalls = stalls.filter(stall => {
    const matchesSearch = 
      (stall.tenant_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      stall.stall_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSection = sectionFilter === 'all' || stall.section_name === sectionFilter;
    const matchesStatus = statusFilter === 'all' || stall.status === statusFilter;
    return matchesSearch && matchesSection && matchesStatus;
  });

  const exportTable = () => {
    const headers = ['Stall #', 'Tenant', 'Section', 'Contact', 'Monthly Rent', 'Status'];
    const csvRows = [headers.join(',')];
    
    filteredStalls.forEach(s => {
      const row = [
        s.stall_number, s.tenant_name || '—', s.section_name || '—',
        s.contact_number || '—', s.monthly_rent, s.payment_status
      ];
      csvRows.push(row.map(v => `"${v}"`).join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stall-monitoring-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="content-wrapper">
      
      <div className="page-header">
        <div>
          <h1>Stall Monitoring</h1>
          <p>Monitor rent payments and stall statuses.</p>
        </div>
        <div className="header-tools">
          <div className="input-with-icon">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input 
              type="text" 
              placeholder="Search tenant or stall..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={exportTable}>
            <i className="fa-solid fa-download"></i> Export
          </button>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric-box">
          <div className="metric-icon blue"><i className="fa-solid fa-store"></i></div>
          <div className="metric-data">
            <div className="metric-label">Total Stalls</div>
            <div className="metric-value">{totalStalls}</div>
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-icon green"><i className="fa-solid fa-check-circle"></i></div>
          <div className="metric-data">
            <div className="metric-label">Paid</div>
            <div className="metric-value">{paidCount}</div>
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-icon orange"><i className="fa-solid fa-clock"></i></div>
          <div className="metric-data">
            <div className="metric-label">Unpaid</div>
            <div className="metric-value">{unpaidCount}</div>
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-icon red"><i className="fa-solid fa-exclamation-triangle"></i></div>
          <div className="metric-data">
            <div className="metric-label">Overdue</div>
            <div className="metric-value">{overdueCount}</div>
          </div>
        </div>
      </div>

      <div className="data-panel">
        <div className="data-header">
          <h2>Stall Directory</h2>
          <div className="filters">
            <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
              <option value="all">All Sections</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="Occupied">Occupied</option>
              <option value="Vacant">Available</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
              <div style={{ 
                width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', 
                borderRadius: '50%', animation: 'spin 1s linear infinite' 
              }}></div>
              <p style={{ marginTop: '16px', color: '#64748b', fontSize: '14px' }}>Loading stalls...</p>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <table id="stallsTable">
              <thead>
                <tr>
                  <th>Stall #</th>
                  <th>Tenant</th>
                  <th>Section</th>
                  <th>Contact</th>
                  <th>Monthly Rent</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStalls.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No stalls found.</td></tr>
                ) : (
                  filteredStalls.map(stall => {
                    let badgeClass = 'status-available';
                    if (stall.payment_status === 'Paid') badgeClass = 'status-paid';
                    if (stall.payment_status === 'Overdue') badgeClass = 'status-overdue';
                    if (stall.payment_status === 'Pending') badgeClass = 'status-pending';

                    return (
                      <tr key={stall.id}>
                        <td><strong>{stall.stall_number}</strong></td>
                        <td>{stall.tenant_name || '—'}</td>
                        <td>{stall.section_name || '—'}</td>
                        <td>{stall.contact_number || '—'}</td>
                        <td>₱{stall.monthly_rent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>
                          <span className={`status-badge ${badgeClass}`}>{stall.payment_status}</span>
                          {stall.status === 'Occupied' && stall.payment_status !== 'Paid' && stall.due_date && (
                            <div className="sub-text">Due: {new Date(stall.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button 
                              className="btn-action" 
                              title="View"
                              onClick={() => navigate(`/stall-details?stall=${stall.stall_number}`)}
                            >
                              <i className="fa-solid fa-eye"></i>
                            </button>
                            
                            {stall.tenant_name && stall.payment_status === 'Pending' && (
                              <button 
                                className="btn-action reminder" 
                                title="Send Reminder" 
                                onClick={() => navigate(`/send-reminder?stall=${stall.id}`)}
                              >
                                <i className="fa-solid fa-bell"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!isLoading && overdueList.length > 0 && (
        <div className="data-panel" style={{ marginTop: '24px' }}>
          <div className="data-header" style={{ borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-exclamation-triangle"></i> Overdue Accounts (25% Penalty Applied)
            </h2>
          </div>
          <div className="table-responsive">
            {/* 🛑 FIX: Added className="overdue-table" to target exactly 8 columns */}
            <table className="overdue-table">
              <thead>
                <tr>
                  <th>Stall #</th>
                  <th>Tenant</th>
                  <th>Section</th>
                  <th>Amount Due</th>
                  <th>Days Overdue</th>
                  <th>Penalty</th>
                  <th>Total Due</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {overdueList.map(overdue => {
                  const dueDate = new Date(overdue.due_date);
                  const graceDays = 3; 
                  const penaltyStartDate = new Date(dueDate);
                  penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
                  penaltyStartDate.setHours(0, 0, 0, 0); 

                  const todayForCalc = new Date();
                  todayForCalc.setHours(0, 0, 0, 0); 

                  const diffTime = todayForCalc.getTime() - penaltyStartDate.getTime();
                  const daysOverdue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

                  const penalty = overdue.amount * 0.25;
                  const totalDue = overdue.amount + penalty;

                  return (
                    <tr key={overdue.id}>
                      <td><strong style={{ color: '#dc2626' }}>{overdue.stall_number}</strong></td>
                      <td>{overdue.tenant_name || '—'}</td>
                      <td>{overdue.section_name || '—'}</td>
                      <td>₱{overdue.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td>{daysOverdue} days</td>
                      <td style={{ color: '#dc2626' }}>+ ₱{penalty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td><strong style={{ color: '#dc2626' }}>₱{totalDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="btn-action" 
                            title="View"
                            onClick={() => navigate(`/stall-details?stall=${overdue.stall_number}`)}
                          >
                            <i className="fa-solid fa-eye"></i>
                          </button>
                          <button 
                            className="btn-action reminder" 
                            title="Send Notice" 
                            onClick={() => navigate(`/send-notice?payment=${overdue.id}`)}
                          >
                            <i className="fa-solid fa-envelope"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}