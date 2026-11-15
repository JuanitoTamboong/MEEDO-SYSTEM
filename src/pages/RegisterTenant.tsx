import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/register-tenants.css';

interface AvailableStall {
  id: number;
  stall_number: string;
  section_id: number;
  section_name?: string;
  icon_class?: string;
  monthly_rent: number;
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dueDateForMonth(year: number, monthIndex: number, anchorDay: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const day = Math.min(anchorDay, lastDay);
  return new Date(year, monthIndex, day);
}

function toDisplayDate(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
  return isoDate;
}

function toIsoDate(displayDate: string): string {
  const parts = displayDate.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[0]}-${parts[1]}`;
  return displayDate;
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
    business_name: '',
    registration_date: dateKey(new Date())
  });

  const [regDateDisplay, setRegDateDisplay] = useState(toDisplayDate(dateKey(new Date())));
  const [orNumber, setOrNumber] = useState('');
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
        .select(`
          id,
          stall_number,
          section_id,
          monthly_rent,
          sections (
            section_name,
            icon_class
          )
        `)
        .eq('status', 'Vacant')
        .order('stall_number', { ascending: true });

      if (stallsData) {
        const formattedStalls = stallsData.map((s: any) => ({
          id: s.id,
          stall_number: s.stall_number,
          section_id: s.section_id,
          monthly_rent: s.monthly_rent,
          section_name: s.sections?.section_name || 'Unassigned',
          icon_class: s.sections?.icon_class || 'fa-store'
        }));
        setAvailableStalls(formattedStalls);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, ''); 
    if (value.length > 8) value = value.slice(0, 8); 

    let formatted = '';
    if (value.length > 0) formatted += value.slice(0, 2);
    if (value.length > 2) formatted += '/' + value.slice(2, 4);
    if (value.length > 4) formatted += '/' + value.slice(4, 8);

    setRegDateDisplay(formatted);
    setFormData({ ...formData, registration_date: toIsoDate(formatted) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedOr = orNumber.trim();
    if (!trimmedOr) {
      setErrorMsg('Please enter the official receipt number from the treasury.');
      setIsSubmitting(false);
      return;
    }
    if (!/^\d+$/.test(trimmedOr)) {
      setErrorMsg('Receipt number must contain numbers only.');
      setIsSubmitting(false);
      return;
    }

    if (!formData.full_name || !formData.contact_number || !formData.stall_id || !formData.business_name) {
      setErrorMsg('Please fill in all required fields.');
      setIsSubmitting(false);
      return;
    }

    if (!formData.registration_date || regDateDisplay.length !== 10) {
      setErrorMsg('Please enter a valid Registration Date in MM/DD/YYYY format.');
      setIsSubmitting(false);
      return;
    }

    const regDateOnly = new Date(formData.registration_date + 'T00:00:00');
    
    if (isNaN(regDateOnly.getTime())) {
      setErrorMsg('Invalid date. Please use MM/DD/YYYY or use the calendar icon.');
      setIsSubmitting(false);
      return;
    }

    const todayOnly = new Date();
    todayOnly.setHours(0, 0, 0, 0);
    if (regDateOnly > todayOnly) {
      setErrorMsg('Registration date cannot be in the future.');
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
        throw new Error('An active tenant with this name already exists.');
      }

      const selectedStall = availableStalls.find(s => s.id === Number(formData.stall_id));
      if (!selectedStall) throw new Error('Selected stall is no longer available.');

      const { data: existingOr } = await supabase
        .from('payments')
        .select('stall_id')
        .eq('receipt_number', trimmedOr)
        .neq('stall_id', selectedStall.id)
        .limit(1);

      if (existingOr && existingOr.length > 0) {
        throw new Error(`Receipt number ${trimmedOr} is already used by another tenant. Please enter a unique OR.`);
      }

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
          registration_date: formData.registration_date
        }])
        .select()
        .single();

      if (tenantError) throw tenantError;

      await supabase
        .from('stalls')
        .update({ status: 'Occupied', tenant_name: formData.full_name.trim() })
        .eq('id', selectedStall.id);

      const today = new Date();
      const anchorDay = regDateOnly.getDate();
      const regMonthFirst = new Date(regDateOnly.getFullYear(), regDateOnly.getMonth(), 1);
      const currentMonthFirst = new Date(today.getFullYear(), today.getMonth(), 1);

      const firstPayment = {
        stall_id: selectedStall.id,
        tenant_name: formData.full_name.trim(),
        amount: selectedStall.monthly_rent,
        payment_date: dateKey(regDateOnly), // ✅ FIX: Uses manual registration date
        due_date: dateKey(regDateOnly),
        month_covered: monthKey(regMonthFirst),
        status: 'Paid',
        receipt_number: trimmedOr
      };

      const pendingBills: any[] = [];
      let cursor = new Date(regMonthFirst);
      cursor.setMonth(cursor.getMonth() + 1);

      while (cursor <= currentMonthFirst) {
        const due = dueDateForMonth(cursor.getFullYear(), cursor.getMonth(), anchorDay);
        pendingBills.push({
          stall_id: selectedStall.id,
          tenant_name: formData.full_name.trim(),
          amount: selectedStall.monthly_rent,
          payment_date: null,
          due_date: dateKey(due),
          month_covered: monthKey(cursor),
          status: 'Pending',
          receipt_number: null
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const { error: firstPayErr } = await supabase.from('payments').insert([firstPayment]);
      if (firstPayErr) throw firstPayErr;

      if (pendingBills.length > 0) {
        const { error: billErr } = await supabase.from('payments').insert(pendingBills);
        if (billErr) throw billErr;
      }

      const billSummary = pendingBills.length > 0
        ? ` + ${pendingBills.length} pending month(s) back-billed.`
        : ' No back-bills needed.';

      await recordAuditLog(
        'Register Tenant',
        `Registered tenant '${formData.full_name}' to stall '${selectedStall.stall_number}' ` +
        `(OR #${trimmedOr}, reg. date ${formData.registration_date}).${billSummary}`,
        'Tenant',
        tenantData.id
      );

      setSuccessMsg(
        `Tenant ${formData.full_name} registered successfully!` +
        (pendingBills.length > 0
          ? ` ${pendingBills.length} unpaid month(s) have been automatically billed.`
          : '')
      );

      setFormData({
        full_name: '',
        date_of_birth: '',
        contact_number: '',
        street: '',
        barangay: '',
        city: '',
        stall_id: '',
        business_name: '',
        registration_date: dateKey(new Date())
      });
      setRegDateDisplay(toDisplayDate(dateKey(new Date())));
      setOrNumber('');

      fetchData();

    } catch (error: any) {
      setErrorMsg(error.message || 'An error occurred while registering the tenant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedStallDetails = availableStalls.find(s => s.id === Number(formData.stall_id));

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
                  <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} placeholder="Full Name" required />
                </div>
                <div className="input-group">
                  <label>Date of Birth</label>
                  <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} />
                </div>
                <div className="input-group">
                  <label>Contact Number <span className="required">*</span></label>
                  <input type="text" name="contact_number" value={formData.contact_number} onChange={handleChange} placeholder="Contact Number" required />
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
                  <input type="text" name="street" value={formData.street} onChange={handleChange} placeholder="Street" />
                </div>
                <div className="input-group">
                  <label>Barangay</label>
                  <input type="text" name="barangay" value={formData.barangay} onChange={handleChange} placeholder="Barangay" />
                </div>
                <div className="input-group">
                  <label>City / Municipality</label>
                  <input type="text" name="city" value={formData.city} onChange={handleChange} placeholder="City" />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header">
                <div className="section-icon"><i className="fa-solid fa-store"></i></div>
                <h3>Business & Payment Assignment</h3>
              </div>
              <div className="form-grid grid-2">
                <div className="input-group">
                  <label>Stall Assignment <span className="required">*</span></label>
                  <select name="stall_id" value={formData.stall_id} onChange={handleChange} required>
                    <option value="">Select an available stall...</option>
                    {availableStalls.map(stall => (
                      <option key={stall.id} value={stall.id}>
                        [{stall.section_name}] {stall.stall_number} — ₱{stall.monthly_rent.toLocaleString(undefined, { minimumFractionDigits: 2 })}/month
                      </option>
                    ))}
                  </select>

                  {selectedStallDetails && (
                    <div style={{ marginTop: '8px', padding: '8px 12px', background: '#eaf1ec', borderRadius: '6px', fontSize: '13px', color: '#217346', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #d5dfd8' }}>
                      <i className={`fa-solid ${selectedStallDetails.icon_class}`}></i>
                      <span>Section: <strong>{selectedStallDetails.section_name}</strong></span>
                    </div>
                  )}
                </div>

                <div className="input-group">
                  <label>Business Name <span className="required">*</span></label>
                  <input type="text" name="business_name" value={formData.business_name} onChange={handleChange} placeholder="Business Name" required />
                </div>

                <div className="input-group">
                  <label>Registration Date <span className="required">*</span></label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      name="registration_date"
                      value={regDateDisplay}
                      onChange={handleRegDateChange}
                      placeholder="MM/DD/YYYY"
                      maxLength={10}
                      required
                      style={{ width: '100%', paddingRight: '40px' }}
                    />
                    
                    <i
                      className="fa-regular fa-calendar"
                      style={{
                        position: 'absolute',
                        right: '14px',
                        color: '#64748b',
                        cursor: 'pointer',
                        fontSize: '16px'
                      }}
                      onClick={() => {
                        const hiddenInput = document.getElementById('hidden-date-picker') as HTMLInputElement;
                        if (hiddenInput) {
                          if (hiddenInput.showPicker) hiddenInput.showPicker();
                          else hiddenInput.click();
                        }
                      }}
                      title="Open Calendar"
                    ></i>

                    <input
                      id="hidden-date-picker"
                      type="date"
                      value={formData.registration_date}
                      onChange={(e) => {
                        setFormData({ ...formData, registration_date: e.target.value });
                        setRegDateDisplay(toDisplayDate(e.target.value));
                      }}
                      max={dateKey(new Date())}
                      style={{
                        position: 'absolute',
                        opacity: 0,
                        width: 0,
                        height: 0,
                        border: 'none',
                        padding: 0,
                        pointerEvents: 'none'
                      }}
                      tabIndex={-1}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label>Official Receipt No. <span className="required">*</span></label>
                  <input
                    type="text"
                    value={orNumber}
                    onChange={(e) => setOrNumber(e.target.value)}
                    placeholder="Enter OR number from treasury"
                    autoComplete="off"
                    maxLength={12}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={() => {
                setFormData({
                  full_name: '', date_of_birth: '', contact_number: '',
                  street: '', barangay: '', city: '', stall_id: '',
                  business_name: '', registration_date: dateKey(new Date())
                });
                setRegDateDisplay(toDisplayDate(dateKey(new Date())));
                setOrNumber('');
              }}>
                Clear Form
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting || !orNumber.trim()}>
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