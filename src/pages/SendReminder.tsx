import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/reminder.css';

export default function SendReminder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const stallId = searchParams.get('stall');

  const [stall, setStall] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [payment, setPayment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!stallId) {
      navigate('/stall-monitoring');
      return;
    }
    fetchData();
  }, [stallId, navigate]);

  async function fetchData() {
    try {
      // 1. Fetch Stall
      const { data: stallData } = await supabase
        .from('stalls')
        .select('*')
        .eq('id', stallId)
        .single();
      setStall(stallData);

      // 2. Fetch Active Tenant
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('*')
        .eq('stall_id', stallId)
        .eq('status', 'active')
        .maybeSingle();
      setTenant(tenantData);

      // 3. Fetch Oldest Unpaid Payment
      const { data: paymentData } = await supabase
        .from('payments')
        .select('*')
        .eq('stall_id', stallId)
        .neq('status', 'Paid')
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (paymentData) setPayment(paymentData);

      // 4. Audit Log
      await recordAuditLog('Prepare Reminder', `Prepared a payment reminder for stall '${stallData?.stall_number}'.`, 'Stall', Number(stallId));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  const tenantName = tenant?.full_name || stall?.tenant_name || 'Valued Tenant';
  const stallNumber = stall?.stall_number || '';
  const monthlyRent = payment?.amount || stall?.monthly_rent || 0;
  const dueDate = payment?.due_date || new Date().toISOString().split('T')[0];
  const contactNumber = tenant?.contact_number || '';

  // Format WhatsApp Number
  let waNumber = contactNumber.replace(/\D/g, '');
  if (waNumber.length === 10 && waNumber.startsWith('9')) waNumber = '63' + waNumber;
  if (waNumber.length === 11 && waNumber.startsWith('0')) waNumber = '63' + waNumber.substring(1);

  const message = `Dear ${tenantName},\n\nThis is a friendly reminder from MEEDO - Odiongan Public Market that your monthly stall rental for Stall ${stallNumber} is due.\n\nAmount Due: PHP ${Number(monthlyRent).toLocaleString(undefined, {minimumFractionDigits: 2})}\nDue Date: ${new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n\nPlease settle your payment at the market office before the due date to avoid penalties.\n\nThank you for your continued support!\n\n- MEEDO Management`;

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (isLoading) return <div style={{padding: '40px'}}>Loading...</div>;

  return (
    <div className="content-wrapper">
      <div className="page-header">
        <div>
          <h1>Send Payment Reminder</h1>
          <p>Review the message below, then choose how you want to send it to the tenant.</p>
        </div>
        <div className="header-tools">
          <Link to="/stall-monitoring" className="btn-secondary">
            <i className="fa-solid fa-arrow-left"></i> Back
          </Link>
        </div>
      </div>

      <div className="form-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="info-grid">
          <div className="info-item"><span className="label">Tenant</span><span className="value">{tenantName}</span></div>
          <div className="info-item"><span className="label">Stall #</span><span className="value">{stallNumber}</span></div>
          <div className="info-item"><span className="label">Amount Due</span><span className="value">₱{Number(monthlyRent).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
          <div className="info-item"><span className="label">Due Date</span><span className="value">{new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
          <div className="info-item"><span className="label">Contact</span><span className="value">{contactNumber || '—'}</span></div>
        </div>

        <div className="form-body">
          <div className="message-preview-wrapper">
            <div className="message-preview">{message}</div>
          </div>

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
              >
                <i className="fa-brands fa-facebook-messenger"></i> Messenger
              </a>
            </div>
            <button className="btn-send btn-copy" onClick={handleCopy}>
              <i className="fa-regular fa-copy"></i> Copy Message to Clipboard
            </button>
          </div>
          
          {copied && (
            <div className="copy-feedback" style={{ display: 'block' }}>
              <i className="fa-solid fa-check-circle"></i> Message copied! You can now paste it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}