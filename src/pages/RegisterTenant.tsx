import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/register-tenants.css';

interface AvailableStall {
  id: number;
  stall_number: string;
  section_id: number;
  monthly_rent: number;
}

export default function RegisterTenant() {
  const [totalTenants, setTotalTenants] = useState(0);
  const [newThisMonth, setNewThisMonth] = useState(0);
  const [availableStalls, setAvailableStalls] = useState<AvailableStall[]>([]);

  const [formData, setFormData] = useState({
    full_name: '',
    date_of_birth: '',
    contact_number: '',
    street: '',
    barangay: '',
    city: '',
    stall_id: '',
    business_name: ''
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const { count: tenantsCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      setTotalTenants(tenantsCount || 0);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const { count: newCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('created_at', startOfMonth.toISOString());
      setNewThisMonth(newCount || 0);

      const { data: stallsData } = await supabase
        .from('stalls')
        .select('id, stall_number, section_id, monthly_rent')
        .eq('status', 'Vacant')
        .order('stall_number', { ascending: true });
      
      if (stallsData) setAvailableStalls(stallsData);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (!formData.full_name || !formData.contact_number || !formData.stall_id || !formData.business_name) {
      setErrorMsg("Please fill in all required fields.");
      setIsSubmitting(false);
      return;
    }

    try {
      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .ilike('full_name', formData.full_name.trim())
        .eq('status', 'active')
        .limit(1);

      if (existing && existing.length > 0) {
        throw new Error("An active tenant with this name already exists.");
      }

      const selectedStall = availableStalls.find(s => s.id === Number(formData.stall_id));
      if (!selectedStall) throw new Error("Selected stall is no longer available.");

      const today = new Date(); 
      const todayString = today.toISOString().split('T')[0];

      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .insert([{
          full_name: formData.full_name.trim(),
          date_of_birth: formData.date_of_birth || null,
          contact_number: formData.contact_number.trim(),
          street: formData.street.trim(),
          barangay: formData.barangay.trim(),
          city: formData.city.trim(),
          stall_id: selectedStall.id,
          business_name: formData.business_name.trim(),
          status: 'active',
          registration_date: todayString
        }])
        .select()
        .single();

      if (tenantError) throw tenantError;

      await supabase
        .from('stalls')
        .update({ status: 'Occupied', tenant_name: formData.full_name.trim() })
        .eq('id', selectedStall.id);

      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1); 
      const nextMonthString = nextMonth.toISOString().split('T')[0];

      const receiptNumber = `REG-${todayString.replace(/-/g, '')}-${tenantData.id}`;

      await supabase.from('payments').insert([{
        stall_id: selectedStall.id,
        tenant_name: formData.full_name.trim(),
        amount: selectedStall.monthly_rent,
        payment_date: todayString,
        due_date: nextMonthString,
        month_covered: `${todayString.slice(0, 7)}-01`, 
        status: 'Paid',
        receipt_number: receiptNumber,
        grace_period_days: 3
      }]);

      await recordAuditLog(
        'Register Tenant', 
        `Registered tenant '${formData.full_name}' to stall '${selectedStall.stall_number}'.`, 
        'Tenant', 
        tenantData.id
      );

      setSuccessMsg(`Tenant ${formData.full_name} registered successfully!`);
      
      setFormData({ full_name: '', date_of_birth: '', contact_number: '', street: '', barangay: '', city: '', stall_id: '', business_name: '' });
      
      fetchData(); 

    } catch (error: any) {
      setErrorMsg(error.message || "An error occurred while registering the tenant.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', width: '100%' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading form data...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      <div className="page-header">
        <div>
          <h1>Register Tenant</h1>
          <p>Add a new business to the market and assign a stall.</p>
        </div>
        <div className="header-actions">
          <Link to="/dashboard" className="btn-secondary">
            <i className="fa-solid fa-arrow-left"></i> Back
          </Link>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric-box">
          <div className="metric-icon blue"><i className="fa-solid fa-users"></i></div>
          <div className="metric-data">
            <div className="metric-label">Total Tenants</div>
            <div className="metric-value">{totalTenants}</div>
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-icon green"><i className="fa-solid fa-user-plus"></i></div>
          <div className="metric-data">
            <div className="metric-label">New This Month</div>
            <div className="metric-value">{newThisMonth}</div>
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-icon orange"><i className="fa-solid fa-store"></i></div>
          <div className="metric-data">
            <div className="metric-label">Available Stalls</div>
            <div className="metric-value">{availableStalls.length}</div>
          </div>
        </div>
      </div>

      <div className="form-container">
        
        <div className="form-header-bar">
          <div className="form-header-title">
            <i className="fa-solid fa-file-invoice"></i> Tenant Registration Form
          </div>
          <div className="form-header-help">
            All fields marked with <span style={{ color: '#dc2626' }}>*</span> are required.
          </div>
        </div>

        <div className="form-body">
          <form onSubmit={handleSubmit}>
            
            <div className="form-section">
              <div className="section-header">
                <div className="section-icon"><i className="fa-solid fa-user"></i></div>
                <h3>Personal Information</h3>
              </div>
              <div className="form-grid grid-3">
                <div className="input-group">
                  <label>Full Name <span className="required">*</span></label>
                  <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} placeholder="e.g., Maria Clara Santos" required />
                </div>
                <div className="input-group">
                  <label>Date of Birth</label>
                  <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} />
                </div>
                <div className="input-group">
                  <label>Contact Number <span className="required">*</span></label>
                  <input type="text" name="contact_number" value={formData.contact_number} onChange={handleChange} placeholder="e.g., 09123456789" required />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header">
                <div className="section-icon"><i className="fa-solid fa-location-dot"></i></div>
                <h3>Current Address</h3>
              </div>
              <div className="form-grid grid-2">
                <div className="input-group">
                  <label>Street / Purok</label>
                  <input type="text" name="street" value={formData.street} onChange={handleChange} placeholder="e.g., 123 Main St." />
                </div>
                <div className="input-group">
                  <label>Barangay</label>
                  <input type="text" name="barangay" value={formData.barangay} onChange={handleChange} placeholder="e.g., Poblacion" />
                </div>
                <div className="input-group">
                  <label>City / Municipality</label>
                  <input type="text" name="city" value={formData.city} onChange={handleChange} placeholder="e.g., Odiongan" />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header">
                <div className="section-icon"><i className="fa-solid fa-store"></i></div>
                <h3>Business Assignment</h3>
              </div>
              <div className="form-grid grid-2">
                <div className="input-group">
                  <label>Stall Assignment <span className="required">*</span></label>
                  <select name="stall_id" value={formData.stall_id} onChange={handleChange} required>
                    <option value="">Select an available stall...</option>
                    {availableStalls.map(stall => (
                      <option key={stall.id} value={stall.id}>
                        {stall.stall_number} — ₱{stall.monthly_rent.toLocaleString(undefined, { minimumFractionDigits: 2 })}/month
                      </option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Business Name <span className="required">*</span></label>
                  <input type="text" name="business_name" value={formData.business_name} onChange={handleChange} placeholder="e.g., Clara's Sari-Sari Store" required />
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={() => setFormData({ full_name: '', date_of_birth: '', contact_number: '', street: '', barangay: '', city: '', stall_id: '', business_name: '' })}>
                Clear Form
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                <i className="fa-solid fa-plus"></i> {isSubmitting ? 'Registering...' : 'Register Tenant'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {successMsg && (
        <div className="modal-backdrop active">
          <div className="modal-box" style={{ textAlign: 'center' }}>
            <div className="modal-icon success-icon" style={{ background: '#ecfdf5', color: '#059669', margin: '0 auto 16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-check" style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px' }}>Success!</h3>
            <p style={{ fontSize: '15px', marginTop: '8px' }}>{successMsg}</p>
            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button className="btn-primary" onClick={() => setSuccessMsg('')} style={{ width: '100%', justifyContent: 'center' }}>
                Register Another Tenant
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="modal-backdrop active">
          <div className="modal-box" style={{ textAlign: 'center' }}>
            <div className="modal-icon danger-icon" style={{ margin: '0 auto 16px', borderRadius: '50%' }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px' }}>Registration Failed</h3>
            <p style={{ fontSize: '15px', marginTop: '8px' }}>{errorMsg}</p>
            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button className="btn-outline" onClick={() => setErrorMsg('')} style={{ width: '100%', justifyContent: 'center' }}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}