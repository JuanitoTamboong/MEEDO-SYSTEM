import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/stall-details.css';

export default function StallDetails() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const stallNumber = searchParams.get('stall');

  const [stall, setStall] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [currentPayment, setCurrentPayment] = useState<any>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  
  // Loading & Error States
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Vacate Modal State
  const [vacateModalOpen, setVacateModalOpen] = useState(false);

  useEffect(() => {
    if (!stallNumber) {
      navigate('/stall-monitoring');
      return;
    }
    fetchData();
  }, [stallNumber, navigate]);

  async function fetchData() {
    setIsLoading(true);
    setErrorMsg('');
    
    try {
      // 1. Fetch Stall Data
      const { data: stallData, error: stallError } = await supabase
        .from('stalls')
        .select('*')
        .eq('stall_number', stallNumber)
        .single();

      if (stallError || !stallData) {
        throw new Error("Stall not found. It may have been deleted.");
      }

      // 2. Fetch Section Data
      let sectionData = null;
      if (stallData.section_id) {
        const { data: secData } = await supabase
          .from('sections')
          .select('section_name, icon_class')
          .eq('id', stallData.section_id)
          .single();
        sectionData = secData;
      }

      setStall({ ...stallData, sections: sectionData });

      // 3. Fetch Active Tenant
      if (stallData.status === 'Occupied') {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('*')
          .eq('stall_id', stallData.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (tenantData) setTenant(tenantData);
      }

      // 4. Fetch Payment History
      const { data: historyData } = await supabase
        .from('payments')
        .select('*')
        .eq('stall_id', stallData.id)
        .order('month_covered', { ascending: false })
        .limit(10);
      
      if (historyData) setPaymentHistory(historyData);

      // 5. Fetch Current Month Payment
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      const { data: currentPayData } = await supabase
        .from('payments')
        .select('*')
        .eq('stall_id', stallData.id)
        .gte('month_covered', currentMonth)
        .lte('month_covered', currentMonth)
        .maybeSingle();
      
      if (currentPayData) setCurrentPayment(currentPayData);

    } catch (error: any) {
      console.error("Error loading stall details:", error);
      setErrorMsg(error.message || "Failed to load stall details.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleVacate = async () => {
    if (!stall || !tenant) return;

    try {
      await supabase.from('tenants').update({ status: 'inactive' }).eq('id', tenant.id);
      await supabase.from('stalls').update({ status: 'Vacant', tenant_name: null }).eq('id', stall.id);
      await recordAuditLog('Vacate Stall', `Vacated stall '${stall.stall_number}' (Tenant: ${tenant.full_name}).`, 'Stall', stall.id);
      navigate('/stall-monitoring');
    } catch (error: any) {
      alert("Error vacating stall: " + error.message);
    }
  };

  // ==========================================
  // BEAUTIFUL CENTERED LOADING SCREEN
  // ==========================================
  if (isLoading) {
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
          Loading stall details...
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

  // --- ERROR STATE ---
  if (errorMsg || !stall) {
    return (
      <div className="content-wrapper">
        <div className="alert alert-error" style={{ marginTop: '20px' }}>
          <i className="fa-solid fa-triangle-exclamation"></i> {errorMsg || "Stall not found."}
        </div>
        <Link to="/stall-monitoring" className="btn-secondary" style={{ marginTop: '10px' }}>
          <i className="fa-solid fa-arrow-left"></i> Back to Directory
        </Link>
      </div>
    );
  }

  // --- MAIN PAGE ---
  const paymentStatus = currentPayment?.status || 'Unpaid';
  const statusClass = paymentStatus.toLowerCase() === 'overdue' ? 'overdue' : (paymentStatus.toLowerCase() === 'paid' ? 'paid' : 'unpaid');

  return (
    <div className="content-wrapper">
      
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Stall Details</h1>
          <p>View tenant information, payment status, and history.</p>
        </div>
        <div className="header-tools">
          <Link to="/stall-monitoring" className="btn-secondary">
            <i className="fa-solid fa-arrow-left"></i> Back to Directory
          </Link>
        </div>
      </div>

      {/* Top Grid */}
      <div className="details-grid">
        
        {/* Stall Profile */}
        <div className="data-panel">
          <div className="data-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <div>
              <h2 style={{ fontSize: '24px', marginBottom: '4px' }}>{stall.stall_number}</h2>
              <span className={`status-badge ${stall.status.toLowerCase()}`}>{stall.status}</span>
            </div>
          </div>
          <div className="panel-body" style={{ padding: '24px' }}>
            <div className="info-row">
              <span className="info-label">Section</span>
              <span className="info-value"><i className={`fa-solid ${stall.sections?.icon_class || 'fa-store'}`}></i> {stall.sections?.section_name || 'Unassigned'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Monthly Rent</span>
              <span className="info-value" style={{ fontWeight: 600, color: '#0f172a' }}>₱{Number(stall.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Current Tenant</span>
              <span className="info-value">{tenant ? tenant.full_name : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None assigned</span>}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Business Name</span>
              <span className="info-value">{tenant?.business_name || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Contact Number</span>
              <span className="info-value">{tenant?.contact_number || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Date Occupied</span>
              <span className="info-value">{tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
            </div>
          </div>
        </div>

        {/* Payment Status */}
        <div className="data-panel">
          <div className="data-header">
            <h2>Payment Status</h2>
            <span className={`status-badge ${statusClass}`}>{paymentStatus}</span>
          </div>
          <div className="panel-body" style={{ padding: '24px' }}>
            <div className="info-row">
              <span className="info-label">Billing Cycle</span>
              <span className="info-value">1st of the month</span>
            </div>
            <div className="info-row">
              <span className="info-label">Current Period</span>
              <span className="info-value">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            </div>
            
            {currentPayment ? (
              <>
                <div className="info-row">
                  <span className="info-label">Amount Due</span>
                  <span className="info-value" style={{ fontWeight: 600 }}>₱{Number(currentPayment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Due Date</span>
                  <span className="info-value">{new Date(currentPayment.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {currentPayment.payment_date && (
                  <div className="info-row">
                    <span className="info-label">Date Paid</span>
                    <span className="info-value">{new Date(currentPayment.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="info-row">
                <span className="info-label">Amount Due</span>
                <span className="info-value" style={{ fontWeight: 600 }}>₱{Number(stall.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tenant Info */}
      {tenant && (
        <div className="data-panel" style={{ marginBottom: '24px' }}>
          <div className="data-header">
            <h2>Tenant Information</h2>
          </div>
          <div className="panel-body" style={{ padding: '24px' }}>
            <div className="grid-2-col">
              <div className="info-row">
                <span className="info-label">Full Name</span>
                <span className="info-value"><strong>{tenant.full_name}</strong></span>
              </div>
              <div className="info-row">
                <span className="info-label">Date of Birth</span>
                <span className="info-value">{tenant.date_of_birth ? new Date(tenant.date_of_birth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Contact Number</span>
                <span className="info-value">{tenant.contact_number || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Business Name</span>
                <span className="info-value">{tenant.business_name || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Address</span>
                <span className="info-value">
                  {[tenant.street, tenant.barangay, tenant.city].filter(Boolean).join(', ') || '—'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Status</span>
                <span className="info-value">
                  <span className={`status-badge ${tenant.status}`}>{tenant.status}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment History */}
      {paymentHistory.length > 0 && (
        <div className="data-panel">
          <div className="data-header">
            <h2>Payment History</h2>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Date Paid</th>
                  <th>Amount</th>
                  <th>Receipt #</th>
                  <th>Month Covered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                    <td>₱{Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{payment.receipt_number || '—'}</td>
                    <td>{payment.month_covered ? new Date(payment.month_covered).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}</td>
                    <td>
                      <span className={`status-badge ${payment.status?.toLowerCase() || 'paid'}`}>
                        {payment.status || 'Paid'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="action-bar">
        {stall.status === 'Vacant' ? (
          <Link to={`/register-tenant?stall=${stall.stall_number}`} className="btn-primary">
            <i className="fa-solid fa-user-plus"></i> Assign Tenant
          </Link>
        ) : (
          <>
            <Link to={`/pay-rent?stall=${stall.id}`} className="btn-primary">
              <i className="fa-solid fa-money-bill-wave"></i> Record Rent Payment
            </Link>
            <Link to={`/edit-tenant?id=${tenant?.id}`} className="btn-secondary">
              <i className="fa-solid fa-pen"></i> Edit Tenant
            </Link>
            <button className="btn-danger" onClick={() => setVacateModalOpen(true)}>
              <i className="fa-solid fa-user-slash"></i> Vacate Stall
            </button>
          </>
        )}
      </div>

      {/* Vacate Modal */}
      {vacateModalOpen && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setVacateModalOpen(false) }}>
          <div className="modal-box">
            <div className="modal-icon danger-icon">
              <i className="fa-solid fa-user-slash"></i>
            </div>
            <h3>Vacate this stall?</h3>
            <p>This will remove the current tenant from the stall. Rent history will be preserved.</p>
            <div className="modal-details">
              <div><strong>Stall:</strong> {stall.stall_number}</div>
              <div><strong>Tenant:</strong> {tenant?.full_name || 'Unknown'}</div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setVacateModalOpen(false)}>Cancel</button>
              <button className="btn-danger" onClick={handleVacate}>Vacate Stall</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}