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
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [payBalanceModalOpen, setPayBalanceModalOpen] = useState(false);

  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [contractDetails, setContractDetails] = useState<any[]>([]);
  const [unpaidBillsList, setUnpaidBillsList] = useState<any[]>([]);

  const [newEndDate, setNewEndDate] = useState('');
  const [chargeRenewalFee, setChargeRenewalFee] = useState(false);
  const [renewalFeeAmount, setRenewalFeeAmount] = useState("100"); 
  const [extendOrNumber, setExtendOrNumber] = useState('');

  const [payMonths, setPayMonths] = useState(1);
  const [payOrNumber, setPayOrNumber] = useState('');

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
          
          let renewalFee = 0;
          let renewalFeePaid = false;
          let renewalFeeReceipt = null;
          let renewalFeeDate = null;

          if (existingContract) {
            startDate = existingContract.start_date || t.registration_date || new Date().toISOString().split('T')[0];
            endDateStr = existingContract.end_date;
            contractId = existingContract.id;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const endDate = endDateStr ? new Date(endDateStr) : null;

            if (endDate && endDate < today) {
              contractStatus = 'Expired';
              renewalFeePaid = false; 
            } else {
              contractStatus = existingContract.status;
              renewalFeePaid = existingContract.renewal_fee_paid || false;
            }

            renewalFee = Number(existingContract.renewal_fee) || 0;
            renewalFeeReceipt = existingContract.renewal_fee_receipt || null;
            renewalFeeDate = existingContract.updated_at || existingContract.created_at || new Date().toISOString();
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

          let paidTotal = validPayments.filter(p => p.status === 'Paid').reduce((sum, p) => sum + Number(p.amount), 0);
          
          let remainingTotal = validPayments
            .filter(p => p.status !== 'Paid')
            .reduce((sum, p) => {
              const alreadyPaid = Number(p.amount_paid) || 0;
              const baseAmount = Number(p.amount);
              const remainingBeforePenalty = Math.max(0, baseAmount - alreadyPaid);
              
              const fixedDay = t.registration_date ? new Date(t.registration_date).getDate() : 5;
              const startObj = new Date(p.month_covered);
              startObj.setDate(fixedDay);
              const endObj = new Date(startObj);
              endObj.setMonth(endObj.getMonth() + 1);
              
              const graceDays = p.grace_period_days || 3;
              const penaltyStartDate = new Date(endObj);
              penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
              
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              let computedPenalty = Number(p.penalty) || 0;

              if (today > penaltyStartDate && p.status === 'Pending' && computedPenalty === 0) {
                computedPenalty = remainingBeforePenalty * 0.25;
              } else if (p.status === 'Overdue' && computedPenalty === 0) {
                computedPenalty = remainingBeforePenalty * 0.25;
              }

              return sum + baseAmount + computedPenalty - alreadyPaid;
            }, 0);

          if (renewalFeePaid) {
            paidTotal += renewalFee;
          } else if (renewalFee > 0) {
            remainingTotal += renewalFee;
          }

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
            grace_period_days: t.grace_period_days || 3,
            renewal_fee: renewalFee,
            renewal_fee_paid: renewalFeePaid,
            renewal_fee_receipt: renewalFeeReceipt,
            renewal_fee_date: renewalFeeDate
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

  const openExtendModal = (contract: any) => {
    setSelectedContract(contract);
    setExtendOrNumber('');
    setChargeRenewalFee(false);
    setRenewalFeeAmount("100");

    const baseDate = contract.end_date ? new Date(contract.end_date) : new Date();
    baseDate.setFullYear(baseDate.getFullYear() + 5);
    setNewEndDate(baseDate.toISOString().split('T')[0]);

    setExtendModalOpen(true);
  };

  const handleExtendContract = async () => {
    if (!selectedContract) return;

    if (!newEndDate) {
      setErrorMsg("Please select a new end date before saving.");
      return;
    }

    if (selectedContract.end_date) {
      const currentEnd = new Date(selectedContract.end_date).setHours(0, 0, 0, 0);
      const newEnd = new Date(newEndDate).setHours(0, 0, 0, 0);
      if (newEnd <= currentEnd) {
        setErrorMsg("The new end date must be later than the current end date to extend the contract.");
        return;
      }
    }

    const trimmedOr = extendOrNumber.trim();
    const parsedFee = Number(renewalFeeAmount);

    if (chargeRenewalFee) {
      if (!trimmedOr) {
        setErrorMsg("Please enter the Official Receipt number to pay the renewal fee.");
        return;
      }
      if (!/^\d+$/.test(trimmedOr)) {
        setErrorMsg("Receipt number must contain numbers only (e.g., 000851).");
        return;
      }
      if (parsedFee <= 0) {
        setErrorMsg("Please enter a valid renewal fee amount.");
        return;
      }
    }

    setIsActionLoading(true);

    try {
      let targetContractId = selectedContract.id;
      const isTempContract = selectedContract.id.toString().startsWith('temp-');

      let finalStartDate = selectedContract.start_date;
      const todayStr = new Date().toISOString().split('T')[0];
      
      if (selectedContract.status === 'Expired' || !finalStartDate || finalStartDate >= newEndDate) {
        finalStartDate = todayStr;
      }

      if (isTempContract) {
        const { data: newContract, error: createError } = await supabase.from('contracts').insert([{
          tenant_id: selectedContract.tenant_id,
          stall_id: selectedContract.stall_id,
          start_date: finalStartDate,
          end_date: newEndDate,
          status: 'Active',
          renewal_fee: chargeRenewalFee ? parsedFee : 0,
          renewal_fee_paid: chargeRenewalFee,
          renewal_fee_receipt: chargeRenewalFee ? trimmedOr : null
        }]).select().single();

        if (createError) throw createError;
        targetContractId = newContract.id;
      } else {
        await supabase.from('contracts').update({ 
          start_date: finalStartDate,
          end_date: newEndDate, 
          status: 'Active',
          renewal_fee: chargeRenewalFee ? parsedFee : 0,
          renewal_fee_paid: chargeRenewalFee,
          renewal_fee_receipt: chargeRenewalFee ? trimmedOr : null
        }).eq('id', targetContractId);

        await supabase.from('contract_extensions').insert([{
          contract_id: targetContractId,
          previous_end_date: selectedContract.end_date,
          new_end_date: newEndDate,
          months: 0
        }]);
      }

      await recordAuditLog(
        'Extend Contract',
        `Extended contract for ${selectedContract.full_name} to ${newEndDate}.` +
          (chargeRenewalFee ? ` Collected renewal fee ₱${parsedFee} (OR #${trimmedOr}).` : ''),
        'Contract',
        typeof targetContractId === 'number' ? targetContractId : undefined
      );

      setExtendModalOpen(false);
      setSuccessMsg(
        `Contract extended to ${new Date(newEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.` +
        (chargeRenewalFee ? ` Renewal fee of ₱${parsedFee} recorded.` : '')
      );
      setNewEndDate('');
      setExtendOrNumber('');
      setChargeRenewalFee(false);
      setRenewalFeeAmount("100");
      fetchContracts();

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const openPayBalanceModal = async (contract: any) => {
    setSelectedContract(contract);
    setIsActionLoading(true);

    const { data: unpaid } = await supabase
      .from('payments')
      .select('*')
      .eq('stall_id', contract.stall_id)
      .neq('status', 'Paid')
      .order('month_covered', { ascending: true });

    const contractStart = contract.start_date ? contract.start_date.slice(0, 7) : null;
    const contractEnd = contract.end_date ? contract.end_date.slice(0, 7) : null;

    const relevantBills = (unpaid || []).filter(b => {
      if (!b.month_covered) return false;
      const baseMonth = String(b.month_covered).replace('-partial', '').slice(0, 7);
      if (contractStart && baseMonth < contractStart) return false;
      if (contractEnd && baseMonth > contractEnd) return false;
      return true;
    }).map(bill => {
      const alreadyPaid = Number(bill.amount_paid) || 0;
      const baseAmount = Number(bill.amount);
      const remainingBeforePenalty = Math.max(0, baseAmount - alreadyPaid);
      
      const fixedDay = contract.registration_date ? new Date(contract.registration_date).getDate() : 5;
      const startObj = new Date(bill.month_covered);
      startObj.setDate(fixedDay);
      const endObj = new Date(startObj);
      endObj.setMonth(endObj.getMonth() + 1);
      
      const graceDays = bill.grace_period_days || 3;
      const penaltyStartDate = new Date(endObj);
      penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let computedPenalty = Number(bill.penalty) || 0;
      let newStatus = bill.status;

      if (today > penaltyStartDate && bill.status === 'Pending' && computedPenalty === 0) {
        computedPenalty = remainingBeforePenalty * 0.25;
        newStatus = 'Overdue';
      } else if (bill.status === 'Overdue' && computedPenalty === 0) {
        computedPenalty = remainingBeforePenalty * 0.25;
      }

      return {
        ...bill,
        status: newStatus,
        penalty: computedPenalty,
        remaining: baseAmount + computedPenalty - alreadyPaid
      };
    });

    setUnpaidBillsList(relevantBills);
    setPayMonths(1);
    setPayOrNumber('');
    setPayBalanceModalOpen(true);
    setIsActionLoading(false);
  };

  const handlePayBalance = async () => {
    if (!selectedContract || unpaidBillsList.length === 0) return;

    const trimmedOr = payOrNumber.trim();
    if (!trimmedOr) {
      setErrorMsg("Please enter the Official Receipt number.");
      return;
    }
    if (!/^\d+$/.test(trimmedOr)) {
      setErrorMsg("Receipt number must contain numbers only (e.g., 000851).");
      return;
    }

    setIsActionLoading(true);
    try {
      const { data: existingOr } = await supabase
        .from('payments')
        .select('stall_id')
        .eq('receipt_number', trimmedOr)
        .neq('stall_id', selectedContract.stall_id)
        .limit(1);

      if (existingOr && existingOr.length > 0) {
        setErrorMsg(`Receipt number ${trimmedOr} is already used by another tenant. Please enter a unique OR.`);
        setIsActionLoading(false);
        return;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const billsToPay = unpaidBillsList.slice(0, payMonths);

      for (const bill of billsToPay) {
        if (String(bill.month_covered).includes('-partial')) continue;

        const penaltyAmount = bill.status === 'Overdue' ? bill.penalty : 0;
        const totalPaid = Number(bill.amount) + Number(penaltyAmount);

        await supabase.from('payments').update({
          status: 'Paid',
          payment_date: todayStr,
          penalty: penaltyAmount,
          amount_paid: totalPaid,
          receipt_number: trimmedOr
        }).eq('id', bill.id);
      }

      const actualTotalPaid = billsToPay.reduce((sum, b) => sum + Number(b.amount) + (b.status === 'Overdue' ? Number(b.penalty) : 0), 0);

      await recordAuditLog(
        'Pay Balance',
        `Paid for ${payMonths} month(s) (₱${actualTotalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}) towards balance for ${selectedContract.full_name} (OR #${trimmedOr}).`,
        'Contract',
        typeof selectedContract.id === 'number' ? selectedContract.id : undefined
      );

      setPayBalanceModalOpen(false);
      setPayOrNumber('');
      setSuccessMsg(`Payment for ${payMonths} month(s) (₱${actualTotalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}) recorded successfully.`);
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
      const isTempContract = selectedContract.id.toString().startsWith('temp-');

      if (!isTempContract) {
        const { data: extensions } = await supabase
          .from('contract_extensions')
          .select('*')
          .eq('contract_id', Number(selectedContract.id))
          .order('id', { ascending: false })
          .limit(1);

        if (extensions && extensions.length > 0) {
          previousEndDate = extensions[0].previous_end_date;
        }
      }

      if (!isTempContract) {
        if (previousEndDate) {
          const { data: extensions } = await supabase
            .from('contract_extensions')
            .select('*')
            .eq('contract_id', Number(selectedContract.id))
            .order('id', { ascending: false })
            .limit(1);

          if (extensions && extensions.length > 0) {
            const lastExt = extensions[0];
            await supabase.from('contract_extensions').delete().eq('id', lastExt.id);
            await supabase.from('contracts').update({
              end_date: lastExt.previous_end_date,
              status: lastExt.previous_end_date < new Date().toISOString().split('T')[0] ? 'Expired' : 'Active',
              renewal_fee: 0,
              renewal_fee_paid: false,
              renewal_fee_receipt: null
            }).eq('id', Number(selectedContract.id));
          }
        } else {
          await supabase.from('contracts').delete().eq('id', Number(selectedContract.id));
        }
      }

      await recordAuditLog(
        'Undo Extension', 
        `Undid the contract extension for ${selectedContract.full_name}.`, 
        'Contract', 
        !isTempContract ? Number(selectedContract.id) : undefined
      );

      setUndoModalOpen(false);
      setSuccessMsg('Extension undone successfully.');
      fetchContracts();

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

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
    }).map(payment => {
      const alreadyPaid = Number(payment.amount_paid) || 0;
      const baseAmount = Number(payment.amount);
      const remainingBeforePenalty = Math.max(0, baseAmount - alreadyPaid);
      
      const fixedDay = contract.registration_date ? new Date(contract.registration_date).getDate() : 5;
      const startObj = new Date(payment.month_covered);
      startObj.setDate(fixedDay);
      const endObj = new Date(startObj);
      endObj.setMonth(endObj.getMonth() + 1);
      
      const graceDays = payment.grace_period_days || 3;
      const penaltyStartDate = new Date(endObj);
      penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let computedPenalty = Number(payment.penalty) || 0;
      let currentStatus = payment.status;

      if (today > penaltyStartDate && payment.status === 'Pending' && computedPenalty === 0) {
        computedPenalty = remainingBeforePenalty * 0.25;
        currentStatus = 'Overdue';
      } else if (payment.status === 'Overdue' && computedPenalty === 0) {
        computedPenalty = remainingBeforePenalty * 0.25;
      }

      return {
        ...payment,
        status: currentStatus,
        penalty: computedPenalty
      };
    });

    const renewalRecord = [];
    if (contract.renewal_fee > 0) {
      renewalRecord.push({
        id: 'renewal',
        month_covered: contract.renewal_fee_date || new Date().toISOString(), 
        amount: contract.renewal_fee,
        receipt_number: contract.renewal_fee_receipt || '—',
        status: contract.renewal_fee_paid ? 'Paid' : 'Pending',
        penalty: 0,
        isRenewal: true
      });
    }

    setContractDetails([...renewalRecord, ...filtered]);
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

  const getCoverageString = (monthCovered: string, registrationDate: string | null) => {
    if (!monthCovered) return 'N/A';
    const fixedDay = registrationDate ? new Date(registrationDate).getDate() : new Date(monthCovered).getDate();
    
    const startObj = new Date(String(monthCovered).replace('-partial', ''));
    startObj.setDate(fixedDay);
    
    const endObj = new Date(startObj);
    endObj.setMonth(endObj.getMonth() + 1);
    if (endObj.getDate() !== fixedDay) {
      endObj.setDate(0); 
    }

    return `${startObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

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
    <div className="content-wrapper contracts-page">
      <div className="page-header">
        <div>
          <h1>Contracts</h1>
          <p>Manage tenant rental agreements and renewals.</p>
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

        <div className="metric-box">
          <div className="metric-icon" style={{ background: '#ecfdf5', color: '#059669' }}><i className="fa-solid fa-wallet"></i></div>
          <div className="metric-data">
            <div className="metric-label">Total Paid</div>
            <div className="metric-value" style={{ color: '#059669' }}>₱{totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

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
          <table className="contract-directory-table">
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
                      {c.renewal_fee > 0 && (
                        <div style={{ fontSize: '11px', marginTop: '4px', color: c.renewal_fee_paid ? '#059669' : '#dc2626' }}>
                          <i className={`fa-solid ${c.renewal_fee_paid ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                          {c.renewal_fee_paid ? ' Renewal Paid' : ' Renewal Unpaid'}
                        </div>
                      )}
                    </td>
                    <td>
                      {c.status === 'Terminated' ? (
                        <span className="text-muted">View Only</span>
                      ) : (
                        <div className="action-buttons">
                          <button className="btn-extend" onClick={() => openExtendModal(c)}>
                            <i className="fa-solid fa-calendar-plus"></i> Renew Contract
                          </button>

                          {Number(c.remaining_total) > 0 && (
                            <button
                              className="btn-pay-balance"
                              title="Pay outstanding balance"
                              onClick={() => openPayBalanceModal(c)}
                            >
                              <i className="fa-solid fa-money-bill-wave"></i> Pay Balance
                            </button>
                          )}

                          <button className="btn-icon" title="View Payment History" onClick={() => handleViewDetails(c)}>
                            <i className="fa-solid fa-eye"></i>
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
          <div className="modal-box" style={{ maxWidth: '500px', width: '100%' }}>
            <div className="modal-content-scroll">
              <div className="modal-icon info-icon"><i className="fa-solid fa-file-contract"></i></div>
              <h3>Renew Contract</h3>
              <p>Set the new expiration date for this contract and record the renewal fee.</p>
              <div className="modal-details">
                <div><strong>Tenant:</strong> {selectedContract.full_name}</div>
                <div><strong>Stall:</strong> {selectedContract.stall_number}</div>
                <div><strong>Current Expiration:</strong> {selectedContract.end_date ? new Date(selectedContract.end_date).toLocaleDateString() : 'No contract yet'}</div>
              </div>

              <div className="input-group" style={{ marginBottom: '16px', marginTop: '16px' }}>
                <label style={{ fontWeight: 600, color: '#334155' }}>New Expiration Date</label>
                <input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  style={{ padding: '12px', fontSize: '16px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Auto-set to 5 years from today/current end date.
                </small>
              </div>

              <div style={{ marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={chargeRenewalFee}
                    onChange={(e) => setChargeRenewalFee(e.target.checked)}
                  />
                  Charge 5-Year Contract Renewal Fee (₱100 - ₱300)
                </label>
                
                {chargeRenewalFee && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Renewal Fee Amount (₱)</label>
                    <input
                      type="number"
                      value={renewalFeeAmount}
                      onChange={(e) => setRenewalFeeAmount(e.target.value)}
                      min="1"
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', fontSize: '14px' }}
                    />
                  </div>
                )}
              </div>

              {chargeRenewalFee && (
                <div className="input-group" style={{ marginBottom: '16px' }}>
                  <label>Official Receipt No. <span style={{ color: '#dc2626' }}>*</span></label>
                  <input
                    type="text"
                    value={extendOrNumber}
                    onChange={(e) => setExtendOrNumber(e.target.value)}
                    placeholder="e.g., 000851"
                    autoComplete="off"
                    maxLength={12}
                    style={{ padding: '12px', fontSize: '16px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                    Enter the OR for the renewal fee.
                  </small>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setExtendModalOpen(false)} disabled={isActionLoading}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleExtendContract}
                disabled={isActionLoading || (chargeRenewalFee && !extendOrNumber.trim())}
              >
                {isActionLoading ? 'Saving...' : 'Save Renewal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {payBalanceModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setPayBalanceModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '450px', width: '100%' }}>
            <div className="modal-content-scroll">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#ecfdf5', color: '#059669', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="fa-solid fa-receipt" style={{ fontSize: '18px' }}></i>
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', margin: '0 0 2px 0', color: '#0f172a' }}>Pay Rent Balance</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Select the months to pay and enter the OR number.</p>
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>Tenant:</span>
                  <strong style={{ color: '#0f172a' }}>{selectedContract.full_name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>Stall:</span>
                  <strong style={{ color: '#0f172a' }}>{selectedContract.stall_number}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>Base Rent:</span>
                  <strong style={{ color: '#0f172a' }}>₱{Number(selectedContract.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '6px', fontSize: '13px' }}>
                  <strong style={{ color: '#dc2626' }}>Total Balance:</strong>
                  <strong style={{ color: '#dc2626' }}>₱{selectedContract.remaining_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: '#334155', marginBottom: '6px', display: 'block' }}>Select Months to Pay</label>
                <select
                  value={payMonths}
                  onChange={(e) => setPayMonths(Number(e.target.value))}
                  style={{
                    padding: '10px 12px',
                    fontSize: '14px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    width: '100%',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    outline: 'none',
                    appearance: 'auto'
                  }}
                >
                  {Array.from({ length: unpaidBillsList.length }, (_, i) => i + 1).map(m => {
                    let cost = 0;
                    for (let i = 0; i < m; i++) {
                      const bill = unpaidBillsList[i];
                      cost += Number(bill.amount);
                      if (bill.status === 'Overdue') cost += Number(bill.penalty);
                    }
                    return (
                      <option key={m} value={m}>
                        {m} Month{m > 1 ? 's' : ''} — Total: ₱{cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px', color: '#14532d' }}>
                  <span>Rent ({payMonths} month{payMonths > 1 ? 's' : ''}):</span>
                  <span>₱{unpaidBillsList.slice(0, payMonths).reduce((sum, b) => sum + Number(b.amount), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                
                {unpaidBillsList.slice(0, payMonths).reduce((sum, b) => sum + (b.status === 'Overdue' ? Number(b.penalty) : 0), 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px', color: '#dc2626' }}>
                    <span>Penalties Included:</span>
                    <span>+ ₱{unpaidBillsList.slice(0, payMonths).reduce((sum, b) => sum + (b.status === 'Overdue' ? Number(b.penalty) : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #86efac', paddingTop: '8px', marginTop: '6px' }}>
                  <strong style={{ fontSize: '14px', color: '#166534' }}>Total to Pay:</strong>
                  <strong style={{ fontSize: '16px', color: '#166534' }}>
                    ₱{unpaidBillsList.slice(0, payMonths).reduce((sum, b) => sum + Number(b.amount) + (b.status === 'Overdue' ? Number(b.penalty) : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: '#334155', marginBottom: '6px', display: 'block' }}>
                  Official Receipt No. <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={payOrNumber}
                  onChange={(e) => setPayOrNumber(e.target.value)}
                  placeholder="e.g., 000851"
                  autoComplete="off"
                  maxLength={12}
                  style={{ 
                    padding: '10px 12px', 
                    fontSize: '14px', 
                    borderRadius: '6px', 
                    border: '1px solid #cbd5e1',
                    width: '100%',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button 
                type="button"
                className="btn-cancel" 
                onClick={() => setPayBalanceModalOpen(false)} 
                disabled={isActionLoading}
                style={{ flex: 1, padding: '10px', borderRadius: '6px', fontWeight: 600, fontSize: '14px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ 
                  background: '#059669', 
                  borderColor: '#059669', 
                  flex: 2, 
                  padding: '10px', 
                  borderRadius: '6px', 
                  fontWeight: 600,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                onClick={handlePayBalance}
                disabled={isActionLoading || unpaidBillsList.length === 0 || !payOrNumber.trim()}
              >
                {isActionLoading ? (
                  <>Processing...</>
                ) : (
                  <>
                    <i className="fa-solid fa-check-circle"></i>
                    Pay ₱{unpaidBillsList.slice(0, payMonths).reduce((sum, b) => sum + Number(b.amount) + (b.status === 'Overdue' ? Number(b.penalty) : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {undoModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setUndoModalOpen(false) }}>
          <div className="modal-box" style={{ maxWidth: '440px', width: '100%' }}>
            <div className="modal-content-scroll">
              <div className="modal-icon danger-icon"><i className="fa-solid fa-rotate-left"></i></div>
              <h3>Undo last renewal?</h3>
              <p>This will revert the contract expiration date to its previous state and remove the renewal fee record.</p>
              <div className="modal-details">
                <div><strong>Tenant:</strong> {selectedContract.full_name}</div>
                <div><strong>Stall:</strong> {selectedContract.stall_number}</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setUndoModalOpen(false)} disabled={isActionLoading}>Cancel</button>
              <button className="btn-danger" onClick={handleUndoExtension} disabled={isActionLoading}>
                {isActionLoading ? 'Undoing...' : 'Undo Renewal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsModalOpen && selectedContract && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setDetailsModalOpen(false) }}>
          <div className="modal-box">
            <div className="modal-content-scroll">
              <div className="modal-icon info-icon"><i className="fa-solid fa-file-invoice"></i></div>
              <h3>Payment History: {selectedContract.full_name}</h3>
              <p>Contract Period: {selectedContract.start_date ? new Date(selectedContract.start_date).toLocaleDateString() : 'N/A'} to {selectedContract.end_date ? new Date(selectedContract.end_date).toLocaleDateString() : 'N/A'}</p>

              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Coverage Period</th>
                      <th>Amount</th>
                      <th>Penalty</th>
                      <th>Receipt #</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractDetails.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No rent payments recorded for this contract period.</td></tr>
                    ) : (
                      contractDetails.map(p => (
                        <tr key={p.id} style={{ background: p.isRenewal ? '#f0fdf4' : 'transparent' }}>
                          <td>
                            {p.isRenewal ? (
                              <div>
                                <strong style={{ color: '#059669' }}><i className="fa-solid fa-file-contract" style={{ marginRight: '6px' }}></i> Contract Renewal Fee</strong>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                  {selectedContract.start_date ? new Date(selectedContract.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'} - {selectedContract.end_date ? new Date(selectedContract.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                </div>
                              </div>
                            ) : p.month_covered ? (
                              <span>
                                {getCoverageString(p.month_covered, selectedContract.registration_date)}
                                {String(p.month_covered).includes('-partial') && (
                                  <span style={{ color: '#f97316', marginLeft: '4px', fontWeight: 600 }}>(Remainder)</span>
                                )}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ fontWeight: p.isRenewal ? 600 : 400 }}>
                            ₱{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ color: Number(p.penalty) > 0 ? '#dc2626' : 'inherit', fontWeight: Number(p.penalty) > 0 ? 600 : 400 }}>
                            {Number(p.penalty) > 0 ? `₱${Number(p.penalty).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                          </td>
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
                                title={p.isRenewal ? "Print Renewal Receipt" : "Print Receipt"}
                                onClick={() => {
                                  if (p.isRenewal) {
                                    navigate(`/receipt?contractId=${selectedContract.id}`);
                                  } else {
                                    navigate(`/receipt?id=${p.id}`);
                                  }
                                }}
                                style={{ color: '#3b82f6' }}
                              >
                                <i className="fa-solid fa-print"></i>
                              </button>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setDetailsModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {(successMsg || errorMsg) && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) { setSuccessMsg(''); setErrorMsg(''); } }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px', width: '100%' }}>
            <div className="modal-content-scroll">
              <div className={`modal-icon ${errorMsg ? 'danger-icon' : 'info-icon'}`} style={{ margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: errorMsg ? '#fef2f2' : '#ecfdf5', color: errorMsg ? '#dc2626' : '#059669' }}>
                <i className={`fa-solid ${errorMsg ? 'fa-triangle-exclamation' : 'fa-check'}`} style={{ fontSize: '24px' }}></i>
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>{errorMsg ? 'Error' : 'Success'}</h3>
              <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>{errorMsg || successMsg}</p>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'center', borderTop: 'none' }}>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setSuccessMsg(''); setErrorMsg(''); }}>Okay</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}