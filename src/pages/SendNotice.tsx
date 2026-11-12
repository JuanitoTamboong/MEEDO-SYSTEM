import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/reminder.css';

export default function SendNotice() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = searchParams.get('payment');

  const [payment, setPayment] = useState<any>(null);
  const [stall, setStall] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!paymentId) {
      navigate('/stall-monitoring');
      return;
    }
    fetchData();
  }, [paymentId, navigate]);

  async function fetchData() {
    try {
      // 1. Fetch Payment
      const { data: paymentData } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();
      setPayment(paymentData);

      if (paymentData) {
        // 2. Fetch Stall
        const { data: stallData } = await supabase
          .from('stalls')
          .select('*')
          .eq('id', paymentData.stall_id)
          .single();
        setStall(stallData);

        // 3. Fetch Active Tenant
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('*')
          .eq('stall_id', paymentData.stall_id)
          .eq('status', 'active')
          .maybeSingle();
        setTenant(tenantData);

        // 4. Audit Log
        await recordAuditLog('Prepare Overdue Notice', `Prepared an overdue notice for stall '${stallData?.stall_number}'.`, 'Payment', Number(paymentId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  const tenantName = tenant?.full_name || 'Valued Tenant';
  const stallNumber = stall?.stall_number || '';
  const amountDue = Number(payment?.amount || 0);
  
  // 🛑 FIX: Changed to 25%
  const penalty = Number(payment?.penalty || (amountDue * 0.25));
  const totalDue = amountDue + penalty;
  
  const dueDate = payment?.due_date || new Date().toISOString().split('T')[0];
  const graceDays = payment?.grace_period_days || 3;
  const contactNumber = tenant?.contact_number || '';

  // 🛑 FIX: Calculate Days Overdue ACCURATELY (ignoring time of day)
  const dueDateObj = new Date(dueDate);
  const penaltyStartDate = new Date(dueDateObj);
  penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
  penaltyStartDate.setHours(0, 0, 0, 0); // Reset time

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time

  const diffTime = today.getTime() - penaltyStartDate.getTime();
  const daysOverdue = diffTime > 0 ? Math.floor(diffTime / (1000 * 60 * 60 * 24)) : 0;

  // Format WhatsApp Number
  let waNumber = contactNumber.replace(/\D/g, '');
  if (waNumber.length === 10 && waNumber.startsWith('9')) waNumber = '63' + waNumber;
  if (waNumber.length === 11 && waNumber.startsWith('0')) waNumber = '63' + waNumber.substring(1);

  const message = `OFFICIAL NOTICE - OVERDUE ACCOUNT\n\nDear ${tenantName},\n\nThis is an official notice from MEEDO - Odiongan Public Market regarding your stall rental for Stall ${stallNumber}.\n\nAmount Due: PHP ${amountDue.toLocaleString(undefined, {minimumFractionDigits: 2})}\nPenalty (25%): PHP ${penalty.toLocaleString(undefined, {minimumFractionDigits: 2})}\nTotal Amount Due: PHP ${totalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}\nDays Overdue: ${daysOverdue} days\nOriginal Due Date: ${new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n\nPlease settle your account immediately at the market office to avoid further penalties or legal action.\n\nThank you for your prompt attention to this matter.\n\n- MEEDO Management`;

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

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
          Loading overdue notice...
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

  return (
    <div className="content-wrapper">
      <div className="page-header">
        <div>
          <h1>Send Overdue Notice</h1>
          <p>Review the official notice below before sending it to the tenant.</p>
        </div>
        <div className="header-tools">
          <Link to="/stall-monitoring" className="btn-secondary">
            <i className="fa-solid fa-arrow-left"></i> Back
          </Link>
        </div>
      </div>

      <div className="form-container" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '4px solid #ef4444' }}>
        <div className="info-grid">
          <div className="info-item"><span className="label">Tenant</span><span className="value">{tenantName}</span></div>
          <div className="info-item"><span className="label">Stall #</span><span className="value">{stallNumber}</span></div>
          <div className="info-item"><span className="label">Base Amount</span><span className="value">₱{amountDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
          <div className="info-item"><span className="label">Penalty (25%)</span><span className="value danger">+ ₱{penalty.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
          <div className="info-item"><span className="label">Total Due</span><span className="value danger" style={{ fontSize: '16px' }}>₱{totalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
          <div className="info-item"><span className="label">Days Overdue</span><span className="value danger">{daysOverdue} days</span></div>
        </div>

        <div className="form-body">
          <div className="message-preview-wrapper" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
            <div className="message-preview" style={{ fontFamily: "'Courier New', monospace" }}>{message}</div>
          </div>

          {!waNumber && (
            <div className="no-contact" style={{ marginBottom: '24px' }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '18px' }}></i>
              No valid contact number is on file. You can still copy the message below and send it manually.
            </div>
          )}

          <div className="send-options">
            <div className="send-row">
              <a 
                className={`btn-send btn-whatsapp ${!waNumber ? 'disabled' : ''}`} 
                href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`} 
                target="_blank" 
                rel="noreferrer"
                style={{ pointerEvents: waNumber ? 'auto' : 'none', opacity: waNumber ? 1 : 0.5 }}
              >
                <i className="fa-brands fa-whatsapp"></i> WhatsApp
              </a>
              <a 
                className="btn-send btn-messenger" 
                href="https://www.messenger.com/" 
                target="_blank" 
                rel="noreferrer"
                style={{ pointerEvents: waNumber ? 'auto' : 'none', opacity: waNumber ? 1 : 0.5 }}
              >
                <i className="fa-brands fa-facebook-messenger"></i> Messenger
              </a>
            </div>
            <button className="btn-send btn-copy" onClick={handleCopy}>
              <i className="fa-regular fa-copy"></i> Copy Notice to Clipboard
            </button>
          </div>
          
          {copied && (
            <div className="copy-feedback" style={{ display: 'block' }}>
              <i className="fa-solid fa-check-circle"></i> Notice copied! You can now paste it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}