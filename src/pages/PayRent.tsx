import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/pay-rent.css';

export default function PayRent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const stallId = searchParams.get('stall');

  const [stall, setStall] = useState<any>(null);
  const [payment, setPayment] = useState<any>(null);
  const [tenantName, setTenantName] = useState('Tenant');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!stallId) {
      navigate('/stall-monitoring');
      return;
    }
    fetchPaymentData();
  }, [stallId, navigate]);

  async function fetchPaymentData() {
    setIsLoading(true);
    try {
      const { data: stallData, error: stallError } = await supabase
        .from('stalls').select('*').eq('id', stallId).single();

      if (stallError || !stallData || stallData.status !== 'Occupied') {
        throw new Error("Stall not found or is currently vacant.");
      }
      setStall(stallData);

      const { data: tenantData } = await supabase
        .from('tenants').select('full_name').eq('stall_id', stallId).eq('status', 'active').maybeSingle();
      
      const name = tenantData?.full_name || stallData.tenant_name || 'Tenant';
      setTenantName(name);

      const { data: unpaidPayments } = await supabase
        .from('payments').select('*').eq('stall_id', stallId).neq('status', 'Paid').order('due_date', { ascending: true }).limit(1);

      if (unpaidPayments && unpaidPayments.length > 0) {
        setPayment(unpaidPayments[0]);
      } else {
        const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
        const { data: newPayment, error: createError } = await supabase
          .from('payments')
          .upsert([{
            stall_id: Number(stallId),
            tenant_name: name,
            amount: stallData.monthly_rent,
            due_date: currentMonth,
            month_covered: currentMonth,
            status: 'Pending'
          }], { onConflict: 'stall_id,month_covered' })
          .select().single();

        if (createError) throw createError;
        setPayment(newPayment);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load payment data.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Mark payment as PAID
      const { error: updateError } = await supabase
        .from('payments')
        .update({ status: 'Paid', payment_date: today, penalty: 0 })
        .eq('id', payment.id);

      if (updateError) throw updateError;

      // 2. Generate NEXT month payment
      const nextMonthDate = new Date(payment.month_covered);
      nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
      const nextMonthStr = nextMonthDate.toISOString().slice(0, 7) + '-01';

      const { error: upsertError } = await supabase
        .from('payments')
        .upsert([{
          stall_id: Number(stallId),
          tenant_name: tenantName,
          amount: payment.amount,
          due_date: nextMonthStr,
          month_covered: nextMonthStr,
          status: 'Pending'
        }], { onConflict: 'stall_id,month_covered' });

      if (upsertError) throw upsertError;

      // 3. Audit Log
      await recordAuditLog(
        'Record Rent Payment', 
        `Recorded rent payment of ₱${payment.amount.toLocaleString(undefined, {minimumFractionDigits: 2})} for stall '${stall.stall_number}'.`, 
        'Payment', 
        payment.id
      );

      // 4. Show Success Popup
      setIsSuccess(true);

      // 5. Redirect after 1.5 seconds
      setTimeout(() => {
        navigate(`/stall-details?stall=${stall.stall_number}&payment=success`);
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to record payment.");
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="content-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading payment details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      <div className="page-header">
        <div>
          <h1>Record Rent Payment</h1>
          <p>Process a new rent payment for {tenantName}.</p>
        </div>
        <div className="header-tools">
          <Link to={`/stall-details?stall=${stall?.stall_number}`} className="btn-secondary">
            <i className="fa-solid fa-arrow-left"></i> Back
          </Link>
        </div>
      </div>

      <div className="form-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="form-header-bar">
          <div className="form-header-title">
            <i className="fa-solid fa-credit-card"></i> Payment Details
          </div>
        </div>

        <div className="form-body">
          {errorMsg && (
            <div className="alert alert-error">
              <i className="fa-solid fa-circle-exclamation"></i> {errorMsg}
            </div>
          )}

          {payment ? (
            <>
              <div className="payment-summary">
                <div className="summary-row">
                  <span className="summary-label">Stall</span>
                  <span className="summary-value">{stall.stall_number}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Month Covered</span>
                  <span className="summary-value">
                    {new Date(payment.month_covered).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div className="summary-row highlight">
                  <span className="summary-label">Amount Due</span>
                  <span className="summary-value amount">
                    ₱{Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <form onSubmit={handleConfirmPayment} className="enterprise-form">
                <div className="input-group">
                  <label>Amount Paid</label>
                  <input type="text" value={`₱${Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} readOnly />
                </div>

                <div className="input-group">
                  <label>Payment Date</label>
                  <input type="text" value={new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} readOnly />
                </div>

                <div className="form-actions">
                  <Link to={`/stall-details?stall=${stall.stall_number}`} className="btn-outline">Cancel</Link>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    <i className="fa-solid fa-check"></i> {isSubmitting ? 'Processing...' : 'Confirm Payment'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="alert alert-error" style={{ marginBottom: 0 }}>
              <i className="fa-solid fa-circle-exclamation"></i> There is no unpaid rent to record for this stall.
            </div>
          )}
        </div>
      </div>

      {/* ==========================================
          PROCESSING / SUCCESS POPUP MODAL
          ========================================== */}
      {(isSubmitting || isSuccess) && (
        <div className="modal-backdrop active">
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px' }}>
            
            {!isSuccess ? (
              <>
                <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Processing Payment...</h3>
                <p style={{ fontSize: '15px', color: '#64748b' }}>Please wait while we record the transaction.</p>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              </>
            ) : (
              <>
                <div className="modal-icon info-icon" style={{ background: '#ecfdf5', color: '#059669', margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-check" style={{ fontSize: '24px' }}></i>
                </div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Payment Successful!</h3>
                <p style={{ fontSize: '15px', color: '#64748b' }}>Redirecting to stall details...</p>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}