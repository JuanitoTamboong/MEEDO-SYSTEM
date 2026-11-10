import { useEffect, useState } from 'react';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/contracts.css';

export default function Contracts() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [editDateModalOpen, setEditDateModalOpen] = useState(false);
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);

  // Form States
  const [newEndDate, setNewEndDate] = useState('');
  const [payAll, setPayAll] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  // Action Loading State
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Success/Error Popup
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchContracts();
  }, []);

  async function fetchContracts() {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('contracts').update({ status: 'Expired' }).lt('end_date', today).eq('status', 'Active');

      const { data: contractsData } = await supabase.from('contracts').select('*');
      const { data: tenantsData } = await supabase.from('tenants').select('*');
      const { data: stallsData } = await supabase.from('stalls').select('*');
      const { data: paymentsData } = await supabase.from('payments').select('*');

      if (contractsData) {
        const enriched = contractsData.map(c => {
          const tenant = tenantsData?.find(t => t.id === c.tenant_id);
          const stall = stallsData?.find(s => s.id === c.stall_id);
          
          const contractPayments = paymentsData?.filter(p => 
            p.stall_id === c.stall_id && 
            p.month_covered >= c.start_date.slice(0, 7) + '-01' && 
            p.month_covered < c.end_date.slice(0, 7) + '-01'
          ) || [];

          const paidTotal = contractPayments.filter(p => p.status === 'Paid').reduce((sum, p) => sum + Number(p.amount), 0);
          const remainingTotal = contractPayments.filter(p => p.status !== 'Paid').reduce((sum, p) => sum + Number(p.amount), 0);

          return {
            ...c,
            full_name: tenant?.full_name || 'Unknown',
            business_name: tenant?.business_name || '—',
            stall_number: stall?.stall_number || '—',
            monthly_rent: stall?.monthly_rent || 0,
            paid_total: paidTotal,
            remaining_total: remainingTotal
          };
        });

        enriched.sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime());
        setContracts(enriched);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // --- ACTIONS ---

  const handleExtendContract = async () => {
    if (!selectedContract) return;
    setIsActionLoading(true);
    
    try {
      await supabase.from('contracts').update({ end_date: newEndDate, status: 'Active' }).eq('id', selectedContract.id);

      await supabase.from('contract_extensions').insert([{
        contract_id: selectedContract.id,
        previous_end_date: selectedContract.end_date,
        new_end_date: newEndDate,
        months: 0
      }]);

      const endDate = new Date(newEndDate);
      const current = new Date(selectedContract.end_date);
      
      const newPayments = [];
      while (current < endDate) {
        const monthCovered = current.toISOString().slice(0, 7) + '-01';
        newPayments.push({
          stall_id: selectedContract.stall_id,
          tenant_name: selectedContract.full_name,
          amount: selectedContract.monthly_rent,
          due_date: monthCovered,
          month_covered: monthCovered,
          status: 'Pending'
        });
        current.setMonth(current.getMonth() + 1);
      }

      if (newPayments.length > 0) {
        await supabase.from('payments').upsert(newPayments, { onConflict: 'stall_id,month_covered' });
      }

      if (payAll) {
        const startMonth = selectedContract.start_date.slice(0, 7) + '-01';
        const endMonth = newEndDate.slice(0, 7) + '-01';
        await supabase.from('payments').update({ status: 'Paid', payment_date: new Date().toISOString().split('T')[0], penalty: 0 })
          .eq('stall_id', selectedContract.stall_id)
          .neq('status', 'Paid')
          .gte('month_covered', startMonth)
          .lt('month_covered', endMonth);
      }

      await recordAuditLog('Extend Contract', `Extended the contract for ${selectedContract.full_name} to ${newEndDate}.`, 'Contract', selectedContract.id);

      setExtendModalOpen(false);
      setSuccessMsg(`Contract extended to ${newEndDate}.`);
      fetchContracts();
      
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEditDates = async () => {
    if (!selectedContract) return;
    setIsActionLoading(true);
    
    try {
      const start = new Date(editStartDate);
      const end = new Date(editEndDate);
      
      if (end <= start) throw new Error("The end date must be after the start date.");

      await supabase.from('contracts').update({ start_date: editStartDate, end_date: editEndDate, status: end < new Date() ? 'Expired' : 'Active' }).eq('id', selectedContract.id);

      const endMonth = editEndDate.slice(0, 7) + '-01';
      await supabase.from('payments').delete()
        .eq('stall_id', selectedContract.stall_id)
        .neq('status', 'Paid')
        .gt('month_covered', endMonth);

      await recordAuditLog('Edit Contract', `Changed the contract dates for contract #${selectedContract.id} to ${editStartDate} - ${editEndDate}.`, 'Contract', selectedContract.id);

      setEditDateModalOpen(false);
      setSuccessMsg('Contract dates updated.');
      fetchContracts();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // OPTIMIZED UNDO
  const handleUndoExtension = async () => {
    if (!selectedContract) return;
    setIsActionLoading(true);
    
    try {
      // 1. Get the last extension record
      const { data: extensions } = await supabase
        .from('contract_extensions')
        .select('*')
        .eq('contract_id', selectedContract.id)
        .order('id', { ascending: false })
        .limit(1);

      if (!extensions || extensions.length === 0) {
        throw new Error("No contract extension is available to undo.");
      }

      const lastExt = extensions[0];
      const restoreMonth = lastExt.previous_end_date.slice(0, 7) + '-01';
      const currentMonth = selectedContract.end_date.slice(0, 7) + '-01';
      
      // 2. Bulk delete payments created during the extension
      await supabase.from('payments').delete()
        .eq('stall_id', selectedContract.stall_id)
        .gte('month_covered', restoreMonth)
        .lt('month_covered', currentMonth);

      // 3. Delete the extension record
      await supabase.from('contract_extensions').delete().eq('id', lastExt.id);

      // 4. Restore the contract end date
      await supabase.from('contracts').update({ 
        end_date: lastExt.previous_end_date, 
        status: lastExt.previous_end_date < new Date().toISOString().split('T')[0] ? 'Expired' : 'Active' 
      }).eq('id', selectedContract.id);

      // 5. Log it
      await recordAuditLog('Undo Extension', `Undid the most recent extension for contract #${selectedContract.id}.`, 'Contract', selectedContract.id);

      // 6. Close modal and show success
      setUndoModalOpen(false);
      setSuccessMsg('The extension was successfully undone.');
      fetchContracts();
      
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- FILTERS ---
  const filteredContracts = contracts.filter(c => {
    const search = searchQuery.toLowerCase();
    const matchesSearch = c.full_name.toLowerCase().includes(search) || 
                          c.business_name.toLowerCase().includes(search) || 
                          c.stall_number.toLowerCase().includes(search);
    const matchesStatus = statusFilter === 'all' || c.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = contracts.filter(c => c.status === 'Active').length;
  const expiredCount = contracts.filter(c => c.status === 'Expired').length;
  const totalOutstanding = contracts.reduce((sum, c) => sum + c.remaining_total, 0);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading contracts...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Contracts</h1>
          <p>Manage tenant rental agreements and extensions.</p>
        </div>
        <div className="header-tools">
          <span className="badge-count"><i className="fa-regular fa-file-lines"></i> {contracts.length} Contracts</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="metric-row">
        <div className="metric-box">
          <div className="metric-icon blue"><i className="fa-solid fa-file-signature"></i></div>
          <div className="metric-data">
            <div className="metric-label">Total Contracts</div>
            <div className="metric-value">{contracts.length}</div>
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-icon green"><i className="fa-solid fa-circle-check"></i></div>
          <div className="metric-data">
            <div className="metric-label">Active</div>
            <div className="metric-value">{activeCount}</div>
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-icon red"><i className="fa-solid fa-clock-rotate-left"></i></div>
          <div className="metric-data">
            <div className="metric-label">Expired</div>
            <div className="metric-value">{expiredCount}</div>
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-icon orange"><i className="fa-solid fa-coins"></i></div>
          <div className="metric-data">
            <div className="metric-label">Outstanding</div>
            <div className="metric-value">₱{totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="data-panel">
        <div className="data-header">
          <h2>Contract Directory</h2>
          <div className="filters">
            <div className="input-with-icon">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input type="search" placeholder="Search tenant, business, or stall..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Tenant & Business</th>
                <th>Stall</th>
                <th>Contract Period</th>
                <th>Financials</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No contracts found.</td></tr>
              ) : (
                filteredContracts.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="tenant-name">{c.full_name}</div>
                      <div className="tenant-business">{c.business_name}</div>
                    </td>
                    <td><span className="stall-badge">{c.stall_number}</span></td>
                    <td>
                      <div className="date-range">
                        {new Date(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 
                        <i className="fa-solid fa-arrow-right"></i> 
                        {new Date(c.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </td>
                    <td>
                      <div className="financials-grid">
                        <div className="fin-row"><span className="fin-label">Monthly</span><span className="fin-value">₱{Number(c.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="fin-row"><span className="fin-label">Paid</span><span className="fin-value text-green">₱{Number(c.paid_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="fin-row"><span className="fin-label">Balance</span><span className="fin-value text-red">₱{Number(c.remaining_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                      </div>
                    </td>
                    <td><span className={`status-badge ${c.status.toLowerCase()}`}>{c.status}</span></td>
                    <td>
                      {c.status === 'Terminated' ? (
                        <span className="text-muted">View Only</span>
                      ) : (
                        <div className="action-buttons">
                          <button className="btn-extend" onClick={() => { setSelectedContract(c); setNewEndDate(c.end_date); setExtendModalOpen(true); }}>
                            <i className="fa-solid fa-calendar-plus"></i> Extend
                          </button>
                          <button className="btn-icon" onClick={() => { setSelectedContract(c); setEditStartDate(c.start_date); setEditEndDate(c.end_date); setEditDateModalOpen(true); }}>
                            <i className="fa-solid fa-pen"></i>
                          </button>
                          <button className="btn-icon danger" onClick={() => { setSelectedContract(c); setUndoModalOpen(true); }}>
                            <i className="fa-solid fa-rotate-left"></i>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EXTEND MODAL */}
      {extendModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setExtendModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '500px' }}>
            <div className="modal-icon info-icon"><i className="fa-solid fa-calendar-plus"></i></div>
            <h3>Extend Contract</h3>
            <p>Select the new end date for this contract.</p>
            <div className="modal-details">
              <div><strong>Tenant:</strong> {selectedContract.full_name}</div>
              <div><strong>Stall:</strong> {selectedContract.stall_number}</div>
              <div><strong>Current End Date:</strong> {new Date(selectedContract.end_date).toLocaleDateString()}</div>
            </div>
            <div className="input-group" style={{ marginBottom: '16px' }}>
              <label>New End Date</label>
              <input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={payAll} onChange={(e) => setPayAll(e.target.checked)} />
                Mark all scheduled payments as Paid
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setExtendModalOpen(false)} disabled={isActionLoading}>Cancel</button>
              <button className="btn-primary" onClick={handleExtendContract} disabled={isActionLoading}>
                {isActionLoading ? 'Saving...' : 'Save & Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT DATES MODAL */}
      {editDateModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setEditDateModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '500px' }}>
            <div className="modal-icon info-icon"><i className="fa-regular fa-pen-to-square"></i></div>
            <h3>Edit Contract Dates</h3>
            <p>Select the exact start and end date for this contract.</p>
            <div className="modal-details">
              <div><strong>Tenant:</strong> {selectedContract.full_name}</div>
              <div><strong>Stall:</strong> {selectedContract.stall_number}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div className="input-group">
                <label>Start Date</label>
                <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
              </div>
              <div className="input-group">
                <label>End Date</label>
                <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setEditDateModalOpen(false)} disabled={isActionLoading}>Cancel</button>
              <button className="btn-primary" onClick={handleEditDates} disabled={isActionLoading}>
                {isActionLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNDO MODAL */}
      {undoModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setUndoModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <div className="modal-icon danger-icon"><i className="fa-solid fa-rotate-left"></i></div>
            <h3>Undo last extension?</h3>
            <p>This will remove the most recent extension and delete any unpaid OR paid records created by it.</p>
            <div className="modal-details">
              <div><strong>Tenant:</strong> {selectedContract.full_name}</div>
              <div><strong>Stall:</strong> {selectedContract.stall_number}</div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setUndoModalOpen(false)} disabled={isActionLoading}>Cancel</button>
              <button className="btn-danger" onClick={handleUndoExtension} disabled={isActionLoading}>
                {isActionLoading ? 'Undoing...' : 'Undo Extension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS / ERROR POPUP */}
      {(successMsg || errorMsg) && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) { setSuccessMsg(''); setErrorMsg(''); } }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div className={`modal-icon ${errorMsg ? 'danger-icon' : 'info-icon'}`} style={{ margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: errorMsg ? '#fef2f2' : '#ecfdf5', color: errorMsg ? '#dc2626' : '#059669' }}>
              <i className={`fa-solid ${errorMsg ? 'fa-triangle-exclamation' : 'fa-check'}`} style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>{errorMsg ? 'Error' : 'Success'}</h3>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>{errorMsg || successMsg}</p>
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setSuccessMsg(''); setErrorMsg(''); }}>Okay</button>
          </div>
        </div>
      )}

    </div>
  );
}