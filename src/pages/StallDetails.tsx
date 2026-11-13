import React, { useEffect, useState } from 'react'; // Added React import
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/stall-details.css';

export default function StallDetails() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const stallNumber = searchParams.get('stall');

  const [userRole, setUserRole] = useState<string | null>(null);

  const [stall, setStall] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [currentPayment, setCurrentPayment] = useState<any>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [unpaidBills, setUnpaidBills] = useState<any[]>([]);

  // For expand/collapse of grouped receipts
  const [expandedReceipts, setExpandedReceipts] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [vacateModalOpen, setVacateModalOpen] = useState(false);
  const [deletePaymentModalOpen, setDeletePaymentModalOpen] = useState(false);
  const [payBalanceModalOpen, setPayBalanceModalOpen] = useState(false);

  const [selectedPaymentToDelete, setSelectedPaymentToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const [payMonths, setPayMonths] = useState(1);

  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isVacateSuccess, setIsVacateSuccess] = useState(false);

  const [showPermissionPopup, setShowPermissionPopup] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState('');

  useEffect(() => {
    async function getUserRole() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserRole(user?.user_metadata?.role || 'Treasury');
    }
    getUserRole();
  }, []);

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
      const { data: stallData, error: stallError } = await supabase
        .from('stalls').select('*').eq('stall_number', stallNumber).single();

      if (stallError || !stallData) throw new Error("Stall not found.");

      let sectionData = null;
      if (stallData.section_id) {
        const { data: secData } = await supabase.from('sections').select('section_name, icon_class').eq('id', stallData.section_id).single();
        sectionData = secData;
      }
      setStall({ ...stallData, sections: sectionData });

      let activeTenant = null;
      if (stallData.status === 'Occupied') {
        const { data: tenantData } = await supabase.from('tenants').select('*').eq('stall_id', stallData.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (tenantData) {
          activeTenant = tenantData;
          setTenant(tenantData);
        }
      }

      const { data: historyData } = await supabase
        .from('payments')
        .select('*')
        .eq('stall_id', stallData.id)
        .order('month_covered', { ascending: true });

      if (historyData) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const unpaid = historyData.filter((p: any) => p.status !== 'Paid' && !String(p.month_covered).includes('-partial'));
        const paid = historyData.filter((p: any) => p.status === 'Paid');

        const processedUnpaid = unpaid.map((bill: any) => {
          const dueDate = new Date(bill.due_date);
          const graceDays = bill.grace_period_days || 3;

          const penaltyStartDate = new Date(dueDate);
          penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);

          if (today > penaltyStartDate && bill.status === 'Pending') {
            const penaltyAmount = Number(bill.amount) * 0.25;
            return {
              ...bill,
              status: 'Overdue',
              penalty: penaltyAmount,
              total_due: Number(bill.amount) + penaltyAmount
            };
          }
          return { ...bill, total_due: Number(bill.amount) };
        });

        const unpaidTotal = processedUnpaid.reduce((sum, p) => sum + Number(p.total_due), 0);
        setTotalOutstanding(unpaidTotal);
        setUnpaidBills(processedUnpaid);

        const nextPending = processedUnpaid.find((p: any) => p.status === 'Pending' || p.status === 'Overdue');
        const latestPaid = [...paid].reverse().find((p: any) => true);

        if (nextPending) {
          setCurrentPayment(nextPending);
        } else if (latestPaid) {
          const regDate = activeTenant?.registration_date ? new Date(activeTenant.registration_date) : new Date();
          const nextDue = new Date();
          nextDue.setDate(regDate.getDate());

          if (nextDue <= new Date()) {
            nextDue.setMonth(nextDue.getMonth() + 1);
          }

          setCurrentPayment({
            ...latestPaid,
            status: 'Paid',
            amount: stallData.monthly_rent,
            month_covered: null,
            due_date: nextDue.toISOString().split('T')[0]
          });
        } else {
          setCurrentPayment(null);
        }

        setPaymentHistory([...paid].reverse());

      } else {
        setPaymentHistory([]);
        setCurrentPayment(null);
        setTotalOutstanding(0);
        setUnpaidBills([]);
      }

    } catch (error: any) {
      setErrorMsg(error.message || "Failed to load stall details.");
    } finally {
      setIsLoading(false);
    }
  }

  // --- Grouped receipts (real-data driven) ---
  const groupedReceipts = (() => {
    const groups: Record<string, any> = {};
    for (const p of paymentHistory) {
      const key = p.receipt_number || `solo-${p.id}`;
      if (!groups[key]) {
        groups[key] = {
          receipt_number: p.receipt_number || null,
          payment_date: p.payment_date,
          ids: [],
          months: [],
          total: 0,
          status: p.status
        };
      }
      groups[key].ids.push(p.id);
      groups[key].months.push(p.month_covered);
      groups[key].total += Number(p.amount);
    }
    return Object.values(groups);
  })();

  const toggleReceiptExpand = (key: string) => {
    setExpandedReceipts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleVacate = async () => {
    if (!stall || !tenant) return;

    if (userRole !== 'Administrator' && userRole !== 'Meedo Personnel') {
      setVacateModalOpen(false);
      setPermissionMessage("Only Administrators and Meedo Personnel can vacate a stall.");
      setShowPermissionPopup(true);
      return;
    }

    setIsDeleting(true);

    try {
      await supabase.from('payments').delete().eq('stall_id', stall.id);
      await supabase.from('contracts').delete().eq('tenant_id', tenant.id);
      await supabase.from('tenants').delete().eq('id', tenant.id);
      await supabase.from('stalls').update({ status: 'Vacant', tenant_name: null }).eq('id', stall.id);

      await recordAuditLog('Vacate & Delete', `Deleted tenant '${tenant.full_name}' and all their records from stall '${stall.stall_number}'.`, 'Stall', stall.id);

      setVacateModalOpen(false);
      setIsVacateSuccess(true);
      setSuccessMessage(`Tenant '${tenant.full_name}' and all their records have been successfully deleted.`);
      setShowSuccessPopup(true);

    } catch (error: any) {
      alert("Error vacating and deleting: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!selectedPaymentToDelete) return;
    setIsDeleting(true);

    try {
      await supabase.from('payments').delete().eq('id', selectedPaymentToDelete.id);

      await recordAuditLog(
        'Delete Payment',
        `Deleted payment record for ${new Date(selectedPaymentToDelete.month_covered).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`,
        'Payment',
        selectedPaymentToDelete.id
      );

      setSuccessMessage(`Payment for ${new Date(selectedPaymentToDelete.month_covered).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} has been deleted.`);
      setIsVacateSuccess(false);
      setShowSuccessPopup(true);

      setDeletePaymentModalOpen(false);
      setSelectedPaymentToDelete(null);

      fetchData();

    } catch (err: any) {
      alert("Error deleting payment: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePayBalance = async () => {
    if (!stall) return;

    const monthlyRent = Number(stall.monthly_rent);
    const amountToPay = payMonths * monthlyRent;

    if (amountToPay <= 0 || amountToPay > totalOutstanding) {
      alert("Invalid payment amount.");
      return;
    }

    setIsActionLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      let remainingMonths = payMonths;
      // Shared receipt for all bills paid in this batch
      const sharedReceiptNum = `PAY-${todayStr.replace(/-/g, '')}-${Math.floor(Math.random() * 100000)}`;

      for (const bill of unpaidBills) {
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
        `Paid for ${payMonths} month(s) (₱${amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}) towards balance for ${tenant?.full_name}.`,
        'Stall',
        stall.id
      );

      setPayBalanceModalOpen(false);
      setSuccessMessage(`Payment for ${payMonths} month(s) (₱${amountToPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}) recorded successfully.`);
      setIsVacateSuccess(false);
      setShowSuccessPopup(true);

      fetchData();
    } catch (err: any) {
      alert("Error processing payment: " + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCloseSuccessPopup = () => {
    setShowSuccessPopup(false);
    if (isVacateSuccess) {
      navigate('/stall-monitoring');
    }
  };

  const handleEditTenantClick = () => {
    if (userRole === 'Administrator' || userRole === 'Meedo Personnel') {
      navigate(`/edit-tenant?id=${tenant?.id}`);
    } else {
      setPermissionMessage("Only Administrators and Meedo Personnel can edit tenant details.");
      setShowPermissionPopup(true);
    }
  };

  const handleVacateClick = () => {
    if (userRole === 'Administrator' || userRole === 'Meedo Personnel') {
      setVacateModalOpen(true);
    } else {
      setPermissionMessage("Only Administrators and Meedo Personnel can vacate a stall.");
      setShowPermissionPopup(true);
    }
  };

  const handleAssignTenantClick = () => {
    if (userRole === 'Administrator' || userRole === 'Meedo Personnel') {
      navigate(`/register-tenant?stall=${stall.stall_number}`);
    } else {
      setPermissionMessage("Only Administrators and Meedo Personnel can assign tenants.");
      setShowPermissionPopup(true);
    }
  };

  const handlePayBalanceClick = () => {
    if (userRole === 'Administrator' || userRole === 'Meedo Personnel' || userRole === 'Treasury') {
      setPayMonths(1);
      setPayBalanceModalOpen(true);
    } else {
      setPermissionMessage("Only Administrators, Meedo Personnel, and Treasury can record payments.");
      setShowPermissionPopup(true);
    }
  };

  if (isLoading || userRole === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading stall details...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (errorMsg || !stall) {
    return (
      <div className="content-wrapper">
        <div className="alert alert-error" style={{ marginTop: '20px' }}><i className="fa-solid fa-triangle-exclamation"></i> {errorMsg || "Stall not found."}</div>
        <Link to="/stall-monitoring" className="btn-secondary" style={{ marginTop: '10px' }}><i className="fa-solid fa-arrow-left"></i> Back to Directory</Link>
      </div>
    );
  }

  const paymentStatus = currentPayment?.status || 'Unpaid';
  const statusClass = paymentStatus.toLowerCase() === 'overdue' ? 'overdue' : (paymentStatus.toLowerCase() === 'paid' ? 'paid' : 'unpaid');

  let billingCycleText = '1st of the month';
  if (tenant?.registration_date) {
    const day = new Date(tenant.registration_date).getDate();
    const suffix = ['th', 'st', 'nd', 'rd'][(day % 10 > 3 ? 0 : (day % 100 - day % 10 != 10 ? day % 10 : 0))] || 'th';
    billingCycleText = `${day}${suffix} of the month`;
  } else if (currentPayment?.due_date) {
    const day = new Date(currentPayment.due_date).getDate();
    const suffix = ['th', 'st', 'nd', 'rd'][(day % 10 > 3 ? 0 : (day % 100 - day % 10 != 10 ? day % 10 : 0))] || 'th';
    billingCycleText = `${day}${suffix} of the month`;
  }

  const maxMonthsCanPay = stall ? Math.floor(totalOutstanding / Number(stall.monthly_rent)) : 0;

  return (
    <div className="content-wrapper">

      <div className="page-header">
        <div>
          <h1>Stall Details</h1>
          <p>View tenant information, payment status, and history.</p>
        </div>
        <div className="header-tools">
          <Link to="/stall-monitoring" className="btn-secondary"><i className="fa-solid fa-arrow-left"></i> Back to Directory</Link>
        </div>
      </div>

      <div className="details-grid">
        <div className="data-panel">
          <div className="data-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <div>
              <h2 style={{ fontSize: '24px', marginBottom: '4px' }}>{stall.stall_number}</h2>
              <span className={`status-badge ${stall.status.toLowerCase()}`}>{stall.status}</span>
            </div>
          </div>
          <div className="panel-body" style={{ padding: '24px' }}>
            <div className="info-row"><span className="info-label">Section</span><span className="info-value"><i className={`fa-solid ${stall.sections?.icon_class || 'fa-store'}`}></i> {stall.sections?.section_name || 'Unassigned'}</span></div>
            <div className="info-row"><span className="info-label">Monthly Rent</span><span className="info-value" style={{ fontWeight: 600, color: '#0f172a' }}>₱{Number(stall.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            <div className="info-row"><span className="info-label">Current Tenant</span><span className="info-value">{tenant ? tenant.full_name : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None assigned</span>}</span></div>
            <div className="info-row"><span className="info-label">Business Name</span><span className="info-value">{tenant?.business_name || '—'}</span></div>
            <div className="info-row"><span className="info-label">Contact Number</span><span className="info-value">{tenant?.contact_number || '—'}</span></div>
            <div className="info-row"><span className="info-label">Date Occupied</span><span className="info-value">{tenant?.created_at ? new Date(tenant.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
          </div>
        </div>

        <div className="data-panel">
          <div className="data-header">
            <h2>Payment Status</h2>
            <span className={`status-badge ${statusClass}`}>{paymentStatus}</span>
          </div>
          <div className="panel-body" style={{ padding: '24px' }}>

            <div className="info-row">
              <span className="info-label">Monthly Due Date</span>
              <span className="info-value">{billingCycleText}</span>
            </div>

            <div className="info-row">
              <span className="info-label">Payment Covers</span>
              <span className="info-value">
                {unpaidBills.length > 1 
                  ? `Multiple Months (${unpaidBills.length})`
                  : (unpaidBills.length === 1 
                    ? new Date(String(unpaidBills[0].month_covered).replace('-partial', '')).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : (currentPayment?.month_covered
                      ? new Date(String(currentPayment.month_covered).replace('-partial', '')).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                      : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })))}
              </span>
            </div>

            {currentPayment ? (
              <>
                <div className="info-row">
                  <span className="info-label">{currentPayment.status === 'Paid' ? 'Amount Paid' : 'Amount Due'}</span>
                  <span className="info-value" style={{ fontWeight: 600 }}>
                    ₱{Number(currentPayment.status === 'Overdue' ? currentPayment.total_due : currentPayment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Next Due Date</span>
                  <span className="info-value">
                    {unpaidBills.length > 0 
                      ? new Date(unpaidBills[0].due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : new Date(currentPayment.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                {currentPayment.payment_date && (
                  <div className="info-row">
                    <span className="info-label">Date Paid</span>
                    <span className="info-value">
                      {new Date(currentPayment.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}
                {currentPayment.status === 'Paid' && currentPayment.receipt_number && (
                  <div className="info-row">
                    <span className="info-label">Receipt #</span>
                    <span className="info-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {currentPayment.receipt_number}
                      <button
                        className="btn-action"
                        title="Print Receipt"
                        onClick={() => navigate(`/receipt?id=${currentPayment.id}`)}
                        style={{ color: '#3b82f6' }}
                      >
                        <i className="fa-solid fa-print"></i>
                      </button>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="info-row">
                <span className="info-label">Amount Due</span>
                <span className="info-value" style={{ fontWeight: 600 }}>
                  ₱{Number(stall.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {tenant && (
        <div className="data-panel" style={{ marginBottom: '24px' }}>
          <div className="data-header"><h2>Tenant Information</h2></div>
          <div className="panel-body" style={{ padding: '24px' }}>
            <div className="grid-2-col">
              <div className="info-row"><span className="info-label">Full Name</span><span className="info-value"><strong>{tenant.full_name}</strong></span></div>
              <div className="info-row"><span className="info-label">Date of Birth</span><span className="info-value">{tenant.date_of_birth ? new Date(tenant.date_of_birth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
              <div className="info-row"><span className="info-label">Contact Number</span><span className="info-value">{tenant.contact_number || '—'}</span></div>
              <div className="info-row"><span className="info-label">Business Name</span><span className="info-value">{tenant.business_name || '—'}</span></div>
              <div className="info-row"><span className="info-label">Address</span><span className="info-value">{[tenant.street, tenant.barangay, tenant.city].filter(Boolean).join(', ') || '—'}</span></div>
              <div className="info-row"><span className="info-label">Status</span><span className="info-value"><span className={`status-badge ${tenant.status}`}>{tenant.status}</span></span></div>
            </div>
          </div>
        </div>
      )}

      {/* 🛑 NEW: Outstanding Balances Table (Clean Design) */}
      {unpaidBills.length > 0 && (
        <div className="data-panel" style={{ marginBottom: '24px' }}>
          <div className="data-header">
            <h2><i className="fa-solid fa-circle-exclamation" style={{ marginRight: '8px', color: '#dc2626' }}></i>Unpaid Balances</h2>
            <span className="badge-count" style={{ background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }}>
              Total: ₱{totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Month Covered</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Penalty</th>
                  <th>Total Due</th>
                </tr>
              </thead>
              <tbody>
                {unpaidBills.map(bill => (
                  <tr key={bill.id}>
                    <td><strong>{new Date(String(bill.month_covered).replace('-partial', '')).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong></td>
                    <td>{new Date(bill.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td>₱{Number(bill.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`status-badge ${bill.status.toLowerCase()}`}>{bill.status}</span>
                    </td>
                    <td style={{ color: bill.penalty > 0 ? '#dc2626' : 'inherit' }}>
                      {bill.penalty > 0 ? `+ ₱${Number(bill.penalty).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td><strong style={{ color: '#dc2626' }}>₱{Number(bill.total_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {groupedReceipts.length > 0 && (
        <div className="data-panel">
          <div className="data-header"><h2>Payment History</h2></div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Date Paid</th>
                  <th>Amount</th>
                  <th>Receipt #</th>
                  <th>Month Covered</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupedReceipts.map((group: any) => {
                  const key = group.receipt_number || `solo-${group.ids[0]}`;
                  const isExpanded = expandedReceipts.has(key);
                  const monthLabels = group.months.map((m: any) =>
                    m ? new Date(String(m).replace('-partial', '')).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'
                  );

                  return (
                    <React.Fragment key={key}>
                      <tr style={{ cursor: group.ids.length > 1 ? 'pointer' : 'default' }} onClick={() => group.ids.length > 1 && toggleReceiptExpand(key)}>
                        <td>{group.payment_date ? new Date(group.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                        <td>₱{Number(group.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>{group.receipt_number || '—'}</td>
                        <td>
                          {group.ids.length > 1 ? (
                            <>
                              <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} style={{ marginRight: '6px', fontSize: '11px' }}></i>
                              {monthLabels.join(', ')}
                            </>
                          ) : (
                            monthLabels[0]
                          )}
                        </td>
                        <td><span className={`status-badge ${group.status?.toLowerCase() || 'paid'}`}>{group.status || 'Paid'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button
                              className="btn-action"
                              title="Print Receipt"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(group.ids.length > 1
                                  ? `/receipt?ids=${group.ids.join(',')}`
                                  : `/receipt?id=${group.ids[0]}`
                                );
                              }}
                              style={{ color: '#3b82f6' }}
                            >
                              <i className="fa-solid fa-print"></i>
                            </button>

                            <button
                              className="btn-action danger"
                              title={group.ids.length > 1 ? "Delete full receipt" : "Delete Payment"}
                              onClick={(e) => {
                                e.stopPropagation();
                                // For single payments, keep existing modal flow
                                if (group.ids.length === 1) {
                                  const p = paymentHistory.find((x: any) => x.id === group.ids[0]);
                                  setSelectedPaymentToDelete(p);
                                  setDeletePaymentModalOpen(true);
                                } else {
                                  // Grouped: open modal for first item, or handle separately
                                  const p = paymentHistory.find((x: any) => x.id === group.ids[0]);
                                  setSelectedPaymentToDelete(p);
                                  setDeletePaymentModalOpen(true);
                                }
                              }}
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && group.ids.length > 1 && (
                        group.ids.map((id: number) => {
                          const p = paymentHistory.find((x: any) => x.id === id);
                          if (!p) return null;
                          return (
                            <tr key={`child-${id}`} style={{ background: '#f8fafc', fontSize: '12px' }}>
                              <td style={{ paddingLeft: '32px' }}>{p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                              <td>₱{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td>{p.receipt_number || '—'}</td>
                              <td>{p.month_covered ? new Date(String(p.month_covered).replace('-partial', '')).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}</td>
                              <td><span className={`status-badge ${p.status?.toLowerCase() || 'paid'}`}>{p.status || 'Paid'}</span></td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                  <button
                                    className="btn-action"
                                    title="Print this month"
                                    onClick={() => navigate(`/receipt?id=${p.id}`)}
                                    style={{ color: '#3b82f6' }}
                                  >
                                    <i className="fa-solid fa-print"></i>
                                  </button>
                                  <button
                                    className="btn-action danger"
                                    title="Delete this month"
                                    onClick={() => {
                                      setSelectedPaymentToDelete(p);
                                      setDeletePaymentModalOpen(true);
                                    }}
                                  >
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="action-bar">
        {stall.status === 'Vacant' ? (
          <button onClick={handleAssignTenantClick} className="btn-primary">
            <i className="fa-solid fa-user-plus"></i> Assign Tenant
          </button>
        ) : (
          <>
            {totalOutstanding > 0 ? (
              <button onClick={handlePayBalanceClick} className="btn-primary" style={{ background: '#059669', borderColor: '#059669' }}>
                <i className="fa-solid fa-money-bill-wave"></i> Pay Balance
              </button>
            ) : (
              <Link to={`/pay-rent?stall=${stall.id}`} className="btn-primary">
                <i className="fa-solid fa-money-bill-wave"></i> Record Rent Payment
              </Link>
            )}

            <button onClick={handleEditTenantClick} className="btn-secondary">
              <i className="fa-solid fa-pen"></i> Edit Tenant
            </button>
            <button onClick={handleVacateClick} className="btn-danger">
              <i className="fa-solid fa-user-slash"></i> Vacate Stall
            </button>
          </>
        )}
      </div>

      {vacateModalOpen && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setVacateModalOpen(false) }}>
          <div className="modal-box">
            <div className="modal-icon danger-icon"><i className="fa-solid fa-user-slash"></i></div>
            <h3>Vacate this stall?</h3>
            <p>This will <strong>permanently delete</strong> the tenant and all their payment history from the database. This cannot be undone.</p>
            <div className="modal-details">
              <div><strong>Stall:</strong> {stall.stall_number}</div>
              <div><strong>Tenant:</strong> {tenant?.full_name || 'Unknown'}</div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setVacateModalOpen(false)} disabled={isDeleting}>Cancel</button>
              <button className="btn-danger" onClick={handleVacate} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete & Vacate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletePaymentModalOpen && selectedPaymentToDelete && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setDeletePaymentModalOpen(false) }}>
          <div className="modal-box">
            <div className="modal-icon danger-icon"><i className="fa-solid fa-trash"></i></div>
            <h3>Delete Payment Record?</h3>
            <p>Are you sure you want to delete this payment? This action cannot be undone.</p>
            <div className="modal-details">
              <div><strong>Month:</strong> {new Date(selectedPaymentToDelete.month_covered).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
              <div><strong>Amount:</strong> ₱{Number(selectedPaymentToDelete.amount).toLocaleString()}</div>
              <div><strong>Status:</strong> {selectedPaymentToDelete.status}</div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeletePaymentModalOpen(false)} disabled={isDeleting}>Cancel</button>
              <button className="btn-danger" onClick={handleDeletePayment} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {payBalanceModalOpen && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setPayBalanceModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '500px' }}>
            <div className="modal-icon success-icon"><i className="fa-solid fa-money-bill-wave"></i></div>
            <h3>Pay Outstanding Balance</h3>
            <p>Select how many months to pay. The payment will be applied to the oldest unpaid months first.</p>

            <div className="modal-details">
              <div><strong>Tenant:</strong> {tenant?.full_name}</div>
              <div><strong>Stall:</strong> {stall.stall_number}</div>
              <div><strong>Monthly Rent:</strong> ₱{Number(stall.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div style={{ marginTop: '8px', padding: '10px', background: '#fef2f2', borderRadius: '8px' }}>
                <strong style={{ color: '#dc2626' }}>Total Outstanding:</strong>{' '}
                <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '18px' }}>
                  ₱{totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                    {m} Month{m > 1 ? 's' : ''} (₱{(m * Number(stall.monthly_rent)).toLocaleString(undefined, { minimumFractionDigits: 2 })})
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
                {isActionLoading ? 'Processing...' : `Pay ₱${(payMonths * Number(stall.monthly_rent)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessPopup && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) handleCloseSuccessPopup() }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div className="modal-icon info-icon" style={{ background: '#ecfdf5', color: '#059669', margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-check" style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Success</h3>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>{successMessage}</p>
            <div className="modal-actions">
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleCloseSuccessPopup}>Okay</button>
            </div>
          </div>
        </div>
      )}

      {showPermissionPopup && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setShowPermissionPopup(false) }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div className="modal-icon danger-icon" style={{ margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-lock" style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Access Denied</h3>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>{permissionMessage}</p>
            <div className="modal-actions">
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowPermissionPopup(false)}>Okay</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}