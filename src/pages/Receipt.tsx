import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import '../css/receipt.css';

export default function Receipt() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Support both ?id=1 (single) and ?ids=1,2,3 (grouped)
  const idParam = searchParams.get('id');
  const idsParam = searchParams.get('ids');
  const paymentIds: number[] = idsParam
    ? idsParam.split(',').map(Number).filter(n => !isNaN(n))
    : idParam
      ? [Number(idParam)]
      : [];

  const [payments, setPayments] = useState<any[]>([]);
  const [stall, setStall] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchData() {
      if (paymentIds.length === 0) {
        setErrorMsg("No payment ID provided.");
        setIsLoading(false);
        return;
      }

      try {
        const { data: payData, error: payError } = await supabase
          .from('payments')
          .select('*')
          .in('id', paymentIds)
          .order('month_covered', { ascending: true });

        if (payError || !payData || payData.length === 0) {
          throw new Error("Receipt not found.");
        }

        setPayments(payData);

        const stallId = payData[0].stall_id;

        const { data: stallData } = await supabase
          .from('stalls').select('*').eq('id', stallId).single();
        if (stallData) setStall(stallData);

        const { data: tenantData } = await supabase
          .from('tenants').select('*').eq('stall_id', stallId).eq('status', 'active').maybeSingle();
        if (tenantData) setTenant(tenantData);

      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [idsParam, idParam]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading receipt details...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (errorMsg || payments.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fa-solid fa-triangle-exclamation"></i> {errorMsg || "Receipt not found."}
        </div>
        <button className="btn-secondary" style={{ marginTop: '20px' }} onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  // Aggregated values (works for both single and grouped)
  const receiptNumber = payments[0].receipt_number || 'N/A';
  const paymentDate = payments[0].payment_date;
  const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPenalty = payments.reduce((sum, p) => sum + Number(p.penalty || 0), 0);
  const grandTotal = totalAmount + totalPenalty;

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
          <div><strong>Receipt No:</strong> {receiptNumber}</div>
          <div><strong>Date Paid:</strong> {paymentDate ? new Date(paymentDate).toLocaleDateString() : 'N/A'}</div>
          <div><strong>Stall No:</strong> {stall?.stall_number}</div>
          <div><strong>Tenant:</strong> {tenant?.full_name || payments[0]?.tenant_name}</div>
          <div><strong>Business:</strong> {tenant?.business_name || '—'}</div>
        </div>

        <div className="receipt-divider"></div>

        <div className="receipt-details">
          <div className="receipt-row header">
            <span>Description</span>
            <span>Amount</span>
          </div>

          {payments.map(p => (
            <div className="receipt-row" key={p.id}>
              <span>
                Monthly Rent (
                {p.month_covered
                  ? new Date(String(p.month_covered).replace('-partial', '')).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : 'N/A'}
                {String(p.month_covered).includes('-partial') && (
                  <span style={{ fontSize: '11px', color: '#f97316', marginLeft: '6px', fontWeight: 600 }}>(Remainder)</span>
                )}
                )
              </span>
              <span>₱{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          ))}

          {totalPenalty > 0 && (
            <div className="receipt-row">
              <span>Penalty</span>
              <span>₱{totalPenalty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>

        <div className="receipt-divider"></div>

        <div className="receipt-total">
          <span>TOTAL PAID</span>
          <span>₱{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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