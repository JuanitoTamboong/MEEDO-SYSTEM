import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import '../css/receipt.css';

export default function Receipt() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = searchParams.get('id');

  const [payment, setPayment] = useState<any>(null);
  const [stall, setStall] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchData() {
      if (!paymentId) {
        setErrorMsg("No payment ID provided.");
        setIsLoading(false);
        return;
      }

      try {
        const { data: payData, error: payError } = await supabase.from('payments').select('*').eq('id', paymentId).single();
        
        if (payError || !payData) throw new Error("Receipt not found.");
        
        setPayment(payData);

        const { data: stallData } = await supabase.from('stalls').select('*').eq('id', payData.stall_id).single();
        if (stallData) setStall(stallData);

        const { data: tenantData } = await supabase.from('tenants').select('*').eq('stall_id', payData.stall_id).eq('status', 'active').maybeSingle();
        if (tenantData) setTenant(tenantData);

      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [paymentId]);

  const handlePrint = () => {
    window.print();
  };

  // --- ADDED LOADING SCREEN ---
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading receipt details...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (errorMsg || !payment) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fa-solid fa-triangle-exclamation"></i> {errorMsg || "Receipt not found."}
        </div>
        <button className="btn-secondary" style={{ marginTop: '20px' }} onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  return (
    <div className="receipt-page">
      <div className="receipt-container">
        
        <div className="receipt-header">
          <h2>ODIONGAN PUBLIC MARKET</h2>
          <p>Stall & Rental Monitoring System</p>
          <p>Odiongan, Romblon</p>
        </div>

        <div className="receipt-divider"></div>

        <div className="receipt-info">
          <div><strong>Receipt No:</strong> {payment.receipt_number || 'N/A'}</div>
          <div><strong>Date Paid:</strong> {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : 'N/A'}</div>
          <div><strong>Stall No:</strong> {stall?.stall_number}</div>
          <div><strong>Tenant:</strong> {tenant?.full_name || payment.tenant_name}</div>
          <div><strong>Business:</strong> {tenant?.business_name || '—'}</div>
        </div>

        <div className="receipt-divider"></div>

        <div className="receipt-details">
          <div className="receipt-row header">
            <span>Description</span>
            <span>Amount</span>
          </div>
          <div className="receipt-row">
            <span>Monthly Rent ({payment.month_covered ? new Date(payment.month_covered).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'})</span>
            <span>₱{Number(payment.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          {payment.penalty > 0 && (
            <div className="receipt-row">
              <span>Penalty</span>
              <span>₱{Number(payment.penalty).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>

        <div className="receipt-divider"></div>

        <div className="receipt-total">
          <span>TOTAL PAID</span>
          <span>₱{(Number(payment.amount) + Number(payment.penalty || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>

        <div className="receipt-divider"></div>

        <div className="receipt-footer">
          <p>Thank you for your payment!</p>
          <p>This is a system-generated receipt.</p>
        </div>

        <div className="receipt-actions">
          <button className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
          <button className="btn-primary" onClick={handlePrint}>Print Receipt</button>
        </div>
      </div>
    </div>
  );
}