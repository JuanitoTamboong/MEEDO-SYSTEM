import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/contracts.css';

export default function Contracts() {
  const navigate = useNavigate();

  const [contracts, setContracts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [editDateModalOpen, setEditDateModalOpen] = useState(false);
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [payBalanceModalOpen, setPayBalanceModalOpen] = useState(false);

  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [contractDetails, setContractDetails] = useState<any[]>([]);

  const [newEndDate, setNewEndDate] = useState('');
  const [payAll, setPayAll] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const [payMonths, setPayMonths] = useState(1);

  const [isActionLoading, setIsActionLoading] = useState(false);

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchContracts();
  }, []);

  async function fetchContracts() {
    setIsLoading(true);
    try {
      const { data: tenantsData } = await supabase.from('tenants').select('*').eq('status', 'active');
      const { data: stallsData } = await supabase.from('stalls').select('*');
      const { data: paymentsData } = await supabase.from('payments').select('*');
      const { data: actualContracts } = await supabase.from('contracts').select('*');

      if (tenantsData) {
        const enriched = tenantsData.map(t => {
          const stall = stallsData?.find(s => s.id === t.stall_id);
          const existingContract = actualContracts?.find(c => c.tenant_id === t.id);

          let startDate = null;
          let endDateStr = null;
          let contractStatus = 'No Contract';
          let contractId = `temp-${t.id}`;

          if (existingContract) {
            startDate = existingContract.start_date;
            endDateStr = existingContract.end_date;
            contractStatus = existingContract.status;
            contractId = existingContract.id;
          }

          const stallPayments = paymentsData?.filter(p => p.stall_id === t.stall_id) || [];

          let validPayments = [];
          if (startDate && endDateStr) {
            const startMonth = startDate.slice(0, 7); 
            const endMonth = endDateStr.slice(0, 7);

            validPayments = stallPayments.filter(p => {
              if (!p.month_covered) return false;
              const baseMonth = String(p.month_covered).replace('-partial', '').slice(0, 7);
              
              return baseMonth >= startMonth && baseMonth <= endMonth;
            });
          } else {
            validPayments = stallPayments;
          }

          const paidTotal = validPayments.filter(p => p.status === 'Paid').reduce((sum, p) => sum + Number(p.amount), 0);
          const remainingTotal = validPayments.filter(p => p.status !== 'Paid').reduce((sum, p) => sum + Number(p.amount), 0);

          return {
            id: contractId,
            tenant_id: t.id,
            full_name: t.full_name,
            business_name: t.business_name,
            stall_id: t.stall_id,
            stall_number: stall?.stall_number || '—',
            monthly_rent: stall?.monthly_rent || 0,
            start_date: startDate,
            end_date: endDateStr,
            status: contractStatus,
            paid_total: paidTotal,
            remaining_total: remainingTotal,
            registration_date: t.registration_date,
            grace_period_days: t.grace_period_days || 3
          };
        });

        enriched.sort((a, b) => {
          if (!a.end_date) return 1;
          if (!b.end_date) return -1;
          return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
        });

        setContracts(enriched);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleViewDetails = async (contract: any) => {
    setSelectedContract(contract);
    setDetailsModalOpen(true);

    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('stall_id', contract.stall_id)
      .order('month_covered', { ascending: true });

    const start = contract.start_date ? contract.start_date.slice(0, 7) : null;
    const end = contract.end_date ? contract.end_date.slice(0, 7) : null;

    const filtered = (data || []).filter(p => {
      if (!p.month_covered) return false;
      const base = String(p.month_covered).replace('-partial', '').slice(0, 7);
      if (start && base < start) return false;
      if (end && base > end) return false;
      return true;
    });

    setContractDetails(filtered);
  };

  const handleExtendContract = async () => {
    if (!selectedContract) return;

    if (!newEndDate) {
      setErrorMsg("Please select a new end date before saving.");
      return;
    }

    if (selectedContract.end_date) {
      const currentEnd = new Date(selectedContract.end_date).setHours(0,0,0,0);
      const newEnd = new Date(newEndDate).setHours(0,0,0,0);

      if (newEnd <= currentEnd) {
        setErrorMsg("The new end date must be later than the current end date to extend the contract.");
        return;
      }
    }

    setIsActionLoading(true);

    try {
      let targetContractId = selectedContract.id;

      if (selectedContract.id.toString().startsWith('temp-')) {
        const { data: newContract, error: createError } = await supabase.from('contracts').insert([{
          tenant_id: selectedContract.tenant_id,
          stall_id: selectedContract.stall_id,
          start_date: selectedContract.start_date || new Date().toISOString().split('T')[0],
          end_date: newEndDate,
          status: 'Active'
        }]).select().single();

        if (createError) throw createError;
        targetContractId = newContract.id;
      } else {
        await supabase.from('contracts').update({ end_date: newEndDate, status: 'Active' }).eq('id', targetContractId);
        await supabase.from('contract_extensions').insert([{
          contract_id: targetContractId,
          previous_end_date: selectedContract.end_date,
          new_end_date: newEndDate,
          months: 0
        }]);
      }

      // Extract exact day (e.g., 13) from the date string to prevent timezone shifts
      const dateString = selectedContract.registration_date || selectedContract.start_date || new Date().toISOString().split('T')[0];
      const fixedDay = parseInt(dateString.split('-')[2], 10);

      let current = new Date(selectedContract.start_date || new Date());
      current.setDate(1); // Snap to the 1st of the month to loop safely
      current.setHours(0, 0, 0, 0);

      const end = new Date(newEndDate);
      const newPayments = [];
      const generatedMonths = new Set();

      while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const monthCovered = `${year}-${month}-01`;
        const monthKey = `${year}-${month}`;

        if (!generatedMonths.has(monthKey)) {
          // Cap the day to the last day of the month (e.g., Feb 28 instead of Feb 30)
          const daysInMonth = new Date(year, current.getMonth() + 1, 0).getDate();
          const actualDay = Math.min(fixedDay, daysInMonth);
          const day = String(actualDay).padStart(2, '0');
          
          // The due date is IN the same month it covers
          const dueDateStr = `${year}-${month}-${day}`;

          newPayments.push({
            stall_id: selectedContract.stall_id,
            tenant_name: selectedContract.full_name,
            amount: selectedContract.monthly_rent,
            due_date: dueDateStr,
            month_covered: monthCovered,
            status: 'Pending',
            grace_period_days: 3
          });

          generatedMonths.add(monthKey);
        }

        current.setMonth(current.getMonth() + 1);
      }

      if (newPayments.length > 0) {
        await supabase.from('payments').upsert(newPayments, {
          onConflict: 'stall_id,month_covered',
          ignoreDuplicates: true
        });
      }

      if (payAll && newPayments.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const monthsToPay = newPayments.map(p => p.month_covered);
        const sharedReceipt = `PAY-${todayStr.replace(/-/g, '')}-${Math.floor(Math.random() * 100000)}`;

        await supabase.from('payments')
          .update({
            status: 'Paid',
            payment_date: todayStr,
            penalty: 0,
            receipt_number: sharedReceipt
          })
          .eq('stall_id', selectedContract.stall_id)
          .eq('status', 'Pending')
          .in('month_covered', monthsToPay);
      }

      await recordAuditLog('Extend Contract', `Extended the contract for ${selectedContract.full_name} to ${newEndDate}.`, 'Contract', typeof targetContractId === 'number' ? targetContractId : undefined);

      setExtendModalOpen(false);
      setSuccessMsg(`Contract extended to ${new Date(newEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`);
      setPayAll(false);
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

      let targetContractId = selectedContract.id;

      if (selectedContract.id.toString().startsWith('temp-')) {
        const { data: newContract, error: createError } = await supabase.from('contracts').insert([{
          tenant_id: selectedContract.tenant_id,
          stall_id: selectedContract.stall_id,
          start_date: editStartDate,
          end_date: editEndDate,
          status: end < new Date() ? 'Expired' : 'Active'
        }]).select().single();

        if (createError) throw createError;
        targetContractId = newContract.id;
      } else {
        await supabase.from('contracts').update({ start_date: editStartDate, end_date: editEndDate, status: end < new Date() ? 'Expired' : 'Active' }).eq('id', targetContractId);
      }

      const endMonth = editEndDate.slice(0, 7) + '-01';
      await supabase.from('payments').delete()
        .eq('stall_id', selectedContract.stall_id)
        .neq('status', 'Paid')
        .gt('month_covered', endMonth);

      await recordAuditLog('Edit Contract', `Changed the contract dates for ${selectedContract.full_name} to ${editStartDate} - ${editEndDate}.`, 'Contract', typeof targetContractId === 'number' ? targetContractId : undefined);

      setEditDateModalOpen(false);
      setSuccessMsg('Contract dates updated.');
      fetchContracts();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUndoExtension = async () => {
    if (!selectedContract) return;

    setIsActionLoading(true);

    try {
      let previousEndDate: string | null = null;

      if (!selectedContract.id.toString().startsWith('temp-')) {
        const { data: extensions } = await supabase
          .from('contract_extensions')
          .select('*')
          .eq('contract_id', selectedContract.id)
          .order('id', { ascending: false })
          .limit(1);

        if (extensions && extensions.length > 0) {
          previousEndDate = extensions[0].previous_end_date;
        }
      }

      const { data: partialPaids } = await supabase
        .from('payments')
        .select('*')
        .eq('stall_id', selectedContract.stall_id)
        .like('receipt_number', 'PAY-%')
        .eq('status', 'Paid');

      if (partialPaids && partialPaids.length > 0) {
        const partialsByMonth = new Map<string, number>();
        for (const p of partialPaids) {
          const key = String(p.month_covered).replace('-partial', '');
          const existing = partialsByMonth.get(key) || 0;
          partialsByMonth.set(key, existing + Number(p.amount));
        }

        for (const [monthCovered, totalPaid] of partialsByMonth.entries()) {
          const { data: pendingBill } = await supabase
            .from('payments')
            .select('*')
            .eq('stall_id', selectedContract.stall_id)
            .eq('month_covered', monthCovered)
            .eq('status', 'Pending')
            .maybeSingle();

          if (pendingBill) {
            await supabase.from('payments')
              .update({ amount: Number(pendingBill.amount) + totalPaid })
              .eq('id', pendingBill.id);
          }
        }
      }

      if (previousEndDate) {
        const prevEndMonth = previousEndDate.slice(0, 7) + '-01';
        await supabase.from('payments').delete()
          .eq('stall_id', selectedContract.stall_id)
          .gt('month_covered', prevEndMonth)
          .or('status.eq.Pending,receipt_number.like.PAY-%');
      } else {
        await supabase.from('payments').delete()
          .eq('stall_id', selectedContract.stall_id)
          .or('status.eq.Pending,receipt_number.like.PAY-%');
      }

      if (!selectedContract.id.toString().startsWith('temp-')) {
        if (previousEndDate) {
          const { data: extensions } = await supabase
            .from('contract_extensions')
            .select('*')
            .eq('contract_id', selectedContract.id)
            .order('id', { ascending: false })
            .limit(1);

          if (extensions && extensions.length > 0) {
            const lastExt = extensions[0];
            await supabase.from('contract_extensions').delete().eq('id', lastExt.id);
            await supabase.from('contracts').update({
              end_date: lastExt.previous_end_date,
              status: lastExt.previous_end_date < new Date().toISOString().split('T')[0] ? 'Expired' : 'Active'
            }).eq('id', selectedContract.id);
          }
        } else {
          await supabase.from('contracts').delete().eq('id', selectedContract.id);
        }
      }

      await recordAuditLog('Undo Extension', `Undid the contract extension for ${selectedContract.full_name}, preserving initial paid registration.`, 'Contract', typeof selectedContract.id === 'number' ? selectedContract.id : undefined);

      setUndoModalOpen(false);
      setSuccessMsg('Extension undone. Created contract and extension bills deleted, initial payment preserved.');
      fetchContracts();

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePayBalance = async () => {
    if (!selectedContract) return;

    const monthlyRent = Number(selectedContract.monthly_rent);
    const amountToPay = payMonths * monthlyRent;

    if (amountToPay <= 0) {
      setErrorMsg("Please select a valid number of months.");
      return;
    }

    if (amountToPay > Number(selectedContract.remaining_total)) {
      setErrorMsg("Payment amount cannot exceed the outstanding balance.");
      return;
    }

    setIsActionLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      let remainingMonths = payMonths;
      const sharedReceiptNum = `PAY-${todayStr.replace(/-/g, '')}-${Math.floor(Math.random() * 100000)}`;

      const { data: unpaidBills } = await supabase
        .from('payments')
        .select('*')
        .eq('stall_id', selectedContract.stall_id)
        .neq('status', 'Paid')
        .order('month_covered', { ascending: true });

      if (!unpaidBills || unpaidBills.length === 0) {
        setErrorMsg("No unpaid bills found for this contract.");
        return;
      }

      const contractStart = selectedContract.start_date ? selectedContract.start_date.slice(0, 7) : null;
      const contractEnd = selectedContract.end_date ? selectedContract.end_date.slice(0, 7) : null;

      const relevantBills = unpaidBills.filter(b => {
        if (!b.month_covered) return false;
        const baseMonth = String(b.month_covered).replace('-partial', '').slice(0, 7);
        if (contractStart && baseMonth < contractStart) return false;
        if (contractEnd && baseMonth > contractEnd) return false;
        return true;
      });

      if (relevantBills.length === 0) {
        setErrorMsg("No unpaid bills found within the contract period.");
        return;
      }

      for (const bill of relevantBills) {
        if (remainingMonths <= 0) break;

        if (String(bill.month_covered).includes('-partial')) continue;

        const penaltyAmount = bill.status === 'Overdue' ? bill.penalty : 0;

        await supabase.from('payments').update({
          status: 'Paid',
          payment_date: todayStr,
          penalty: penaltyAmount,
          receipt_number: sharedReceiptNum
        }).eq('id', bill.id);

        remainingMonths -= 1;
      }

      await recordAuditLog(
        'Pay Balance',
        `Paid for ${payMonths} month(s) (₱${amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}) towards balance for ${selectedContract.full_name}.`,
        'Contract',
        typeof selectedContract.id === 'number' ? selectedContract.id : undefined
      );

      setPayBalanceModalOpen(false);
      setSuccessMsg(`Payment for ${payMonths} month(s) (₱${amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}) recorded successfully.`);
      fetchContracts();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

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
  
  const totalPaid = contracts.reduce((sum, c) => sum + c.paid_total, 0);
  const totalBalance = contracts.reduce((sum, c) => sum + c.remaining_total, 0);

  const maxMonthsCanPay = selectedContract ? Math.floor(Number(selectedContract.remaining_total) / Number(selectedContract.monthly_rent)) : 0;

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
      <div className="page-header">
        <div>
          <h1>Contracts</h1>
          <p>Manage tenant rental agreements and extensions.</p>
        </div>
        <div className="header-tools">
          <span className="badge-count"><i className="fa-regular fa-file-lines"></i> {contracts.length} Contracts</span>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric-box">
          <div className="metric-icon blue"><i className="fa-solid fa-file-signature"></i></div>
          <div className="metric-data"><div className="metric-label">Total Contracts</div><div className="metric-value">{contracts.length}</div></div>
        </div>
        <div className="metric-box">
          <div className="metric-icon green"><i className="fa-solid fa-circle-check"></i></div>
          <div className="metric-data"><div className="metric-label">Active</div><div className="metric-value">{activeCount}</div></div>
        </div>
        <div className="metric-box">
          <div className="metric-icon red"><i className="fa-solid fa-clock-rotate-left"></i></div>
          <div className="metric-data"><div className="metric-label">Expired</div><div className="metric-value">{expiredCount}</div></div>
        </div>
        
        {/* Total Paid Card */}
        <div className="metric-box">
          <div className="metric-icon" style={{ background: '#ecfdf5', color: '#059669' }}><i className="fa-solid fa-wallet"></i></div>
          <div className="metric-data">
            <div className="metric-label">Total Paid</div>
            <div className="metric-value" style={{ color: '#059669' }}>₱{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        {/* Total Balance Card */}
        <div className="metric-box">
          <div className="metric-icon orange"><i className="fa-solid fa-scale-balanced"></i></div>
          <div className="metric-data">
            <div className="metric-label">Total Balance</div>
            <div className="metric-value" style={{ color: '#dc2626' }}>₱{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

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
              <option value="no contract">No Contract</option>
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
                        {c.start_date && c.end_date ? (
                          <>
                            {new Date(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            <i className="fa-solid fa-arrow-right"></i>
                            {new Date(c.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No formal contract</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="financials-grid">
                        <div className="fin-row"><span className="fin-label">Monthly</span><span className="fin-value">₱{Number(c.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="fin-row"><span className="fin-label">Paid</span><span className="fin-value text-green">₱{Number(c.paid_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="fin-row"><span className="fin-label">Balance</span><span className="fin-value text-red">₱{Number(c.remaining_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${c.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      {c.status === 'Terminated' ? (
                        <span className="text-muted">View Only</span>
                      ) : (
                        <div className="action-buttons">
                          <button className="btn-extend" onClick={() => { setSelectedContract(c); setNewEndDate(''); setExtendModalOpen(true); }}>
                            <i className="fa-solid fa-calendar-plus"></i> Extend
                          </button>

                          {Number(c.remaining_total) > 0 && (
                            <button
                              className="btn-pay-balance"
                              title="Pay outstanding balance"
                              onClick={() => {
                                setSelectedContract(c);
                                setPayMonths(1);
                                setPayBalanceModalOpen(true);
                              }}
                            >
                              <i className="fa-solid fa-money-bill-wave"></i> Pay Balance
                            </button>
                          )}

                          <button className="btn-icon" title="View Payment History" onClick={() => handleViewDetails(c)}>
                            <i className="fa-solid fa-eye"></i>
                          </button>

                          <button className="btn-icon" onClick={() => { setSelectedContract(c); setEditStartDate(c.start_date || ''); setEditEndDate(c.end_date || ''); setEditDateModalOpen(true); }}>
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

      {extendModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setExtendModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '500px' }}>
            <div className="modal-icon info-icon"><i className="fa-solid fa-calendar-plus"></i></div>
            <h3>Extend Contract</h3>
            <p>Select the new end date for this contract. Months that are already paid will be skipped.</p>
            <div className="modal-details">
              <div><strong>Tenant:</strong> {selectedContract.full_name}</div>
              <div><strong>Stall:</strong> {selectedContract.stall_number}</div>
              <div><strong>Current End Date:</strong> {selectedContract.end_date ? new Date(selectedContract.end_date).toLocaleDateString() : 'No contract yet'}</div>
            </div>
            <div className="input-group" style={{ marginBottom: '16px' }}>
              <label>New End Date</label>
              <input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                min={
                  new Date(new Date().setMonth(new Date().getMonth() + 1))
                    .toISOString()
                    .split('T')[0]
                }
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={payAll} onChange={(e) => setPayAll(e.target.checked)} />
                Mark newly generated scheduled payments as Paid
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

      {undoModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setUndoModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <div className="modal-icon danger-icon"><i className="fa-solid fa-rotate-left"></i></div>
            <h3>Undo last extension?</h3>
            <p>This will remove the most recent extension and delete <strong>PAY-</strong> and <strong>PENDING</strong> bills generated by that extension. Your initial <strong>REG-</strong> payment will be kept safe.</p>
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

      {payBalanceModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setPayBalanceModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '500px' }}>
            <div className="modal-icon success-icon"><i className="fa-solid fa-money-bill-wave"></i></div>
            <h3>Pay Outstanding Balance</h3>
            <p>Select how many months to pay. The payment will be applied to the oldest unpaid months first.</p>

            <div className="modal-details">
              <div><strong>Tenant:</strong> {selectedContract.full_name}</div>
              <div><strong>Stall:</strong> {selectedContract.stall_number}</div>
              <div><strong>Monthly Rent:</strong> ₱{Number(selectedContract.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div style={{ marginTop: '8px', padding: '10px', background: '#fef2f2', borderRadius: '8px' }}>
                <strong style={{ color: '#dc2626' }}>Total Outstanding:</strong>{' '}
                <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '18px' }}>
                  ₱{Number(selectedContract.remaining_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="input-group" style={{ marginBottom: '16px', marginTop: '16px' }}>
              <label>Select Months to Pay</label>
              <select
                value={payMonths}
                onChange={(e) => setPayMonths(Number(e.target.value))}
                style={{
                  padding: '12px',
                  fontSize: '16px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  width: '100%',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                {Array.from({ length: maxMonthsCanPay }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {m} Month{m > 1 ? 's' : ''} (₱{(m * Number(selectedContract.monthly_rent)).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setPayBalanceModalOpen(false)} disabled={isActionLoading}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ background: '#059669', borderColor: '#059669', flex: 1, marginLeft: '8px' }}
                onClick={handlePayBalance}
                disabled={isActionLoading || maxMonthsCanPay === 0}
              >
                {isActionLoading ? 'Processing...' : `Pay ₱${(payMonths * Number(selectedContract.monthly_rent)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setDetailsModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '700px' }}>
            <div className="modal-icon info-icon"><i className="fa-solid fa-file-invoice"></i></div>
            <h3>Payment History: {selectedContract.full_name}</h3>
            <p>Contract Period: {selectedContract.start_date ? new Date(selectedContract.start_date).toLocaleDateString() : 'N/A'} to {selectedContract.end_date ? new Date(selectedContract.end_date).toLocaleDateString() : 'N/A'}</p>

            <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '20px' }}>
              <table style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Month Covered</th>
                    <th>Coverage Period</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Receipt #</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contractDetails.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No payments recorded for this contract period.</td></tr>
                  ) : (
                    contractDetails.map(p => {
                      // Calculate the coverage period display
                      const monthStr = p.month_covered ? String(p.month_covered).replace('-partial', '') : null;
                      let coverageDisplay = '—';
                      if (monthStr && p.due_date) {
                        const startObj = new Date(monthStr);
                        const dueObj = new Date(p.due_date);
                        const fixedDay = dueObj.getDate();
                        
                        // Set the start date to the actual registration day (e.g., 13)
                        startObj.setDate(fixedDay);
                        
                        const endObj = new Date(startObj);
                        endObj.setMonth(endObj.getMonth() + 1); // Add exactly 1 month
                        
                        // Handle end-of-month edge cases (e.g., Jan 31 + 1 month = Feb 28)
                        if (endObj.getDate() !== fixedDay) {
                          endObj.setDate(0); 
                        }

                        coverageDisplay = `${startObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      }

                      return (
                        <tr key={p.id}>
                          <td>
                            {p.month_covered
                              ? new Date(String(p.month_covered).replace('-partial', '')).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                              : '—'}
                            {String(p.month_covered).includes('-partial') && (
                              <span style={{ fontSize: '10px', color: '#f97316', marginLeft: '6px', fontWeight: 600 }}>(Remainder)</span>
                            )}
                          </td>
                          <td style={{ color: '#64748b', fontSize: '12px' }}>{coverageDisplay}</td>
                          <td>{p.due_date ? new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                          <td>₱{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td>{p.receipt_number || '—'}</td>
                          <td>
                            <span className={`status-badge ${p.status.toLowerCase()}`}>
                              {p.status}
                            </span>
                          </td>
                          <td>
                            {p.status === 'Paid' && p.receipt_number ? (
                              <button
                                className="btn-action"
                                title="Print Receipt"
                                onClick={() => navigate(`/receipt?id=${p.id}`)}
                                style={{ color: '#3b82f6' }}
                              >
                                <i className="fa-solid fa-print"></i>
                              </button>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setDetailsModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

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