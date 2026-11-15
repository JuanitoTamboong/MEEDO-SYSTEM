import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/register-tenants.css';

interface Stall {
  id: number;
  stall_number: string;
  monthly_rent: number;
  section_name?: string;
  icon_class?: string;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export default function EditTenant() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tenantId = searchParams.get('id');

  const [availableStalls, setAvailableStalls] = useState<Stall[]>([]);
  const [currentStallNumber, setCurrentStallNumber] = useState('');
  
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

  const [regDateDisplay, setRegDateDisplay] = useState('');
  const [originalStallId, setOriginalStallId] = useState<number | null>(null);
  const [originalDate, setOriginalDate] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [isDateChanged, setIsDateChanged] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      navigate('/stall-monitoring');
      return;
    }
    fetchData();
  }, [tenantId, navigate]);

  async function fetchData() {
    try {
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (tenantError || !tenantData) {
        throw new Error("Tenant not found.");
      }

      if (tenantData.stall_id) {
        const { data: currentStall } = await supabase
          .from('stalls')
          .select('stall_number')
          .eq('id', tenantData.stall_id)
          .single();
        
        if (currentStall) setCurrentStallNumber(currentStall.stall_number);
        setOriginalStallId(tenantData.stall_id);
      }

      const regDate = tenantData.registration_date || dateKey(new Date());
      setRegDateDisplay(toDisplayDate(regDate));
      setOriginalDate(regDate);

      setFormData({
        full_name: tenantData.full_name || '',
        date_of_birth: tenantData.date_of_birth || '',
        contact_number: tenantData.contact_number || '',
        street: tenantData.street || '',
        barangay: tenantData.barangay || '',
        city: tenantData.city || '',
        stall_id: tenantData.stall_id ? tenantData.stall_id.toString() : '',
        business_name: tenantData.business_name || '',
        registration_date: regDate
      });

      const { data: stallsData } = await supabase
        .from('stalls')
        .select(`
          id,
          stall_number,
          monthly_rent,
          section_id,
          sections (
            section_name,
            icon_class
          )
        `)
        .or(`status.eq.Vacant,id.eq.${tenantData.stall_id}`)
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
      setErrorMsg(err.message || "Failed to load tenant data.");
      setShowErrorModal(true);
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

    const isoDate = toIsoDate(formatted);
    setRegDateDisplay(formatted);
    setFormData({ ...formData, registration_date: isoDate });

    if (isoDate !== originalDate) {
      setIsDateChanged(true);
    } else {
      setIsDateChanged(false);
      setConfirmReset(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isDateChanged && !confirmReset) {
      setErrorMsg("Please check the confirmation box to proceed with resetting the billing cycle.");
      setShowErrorModal(true);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setShowErrorModal(false);
    setShowSuccessModal(false);

    if (!formData.full_name || !formData.contact_number || !formData.stall_id || !formData.business_name) {
      setErrorMsg("Please fill in all required fields.");
      setShowErrorModal(true);
      setIsSubmitting(false);
      return;
    }

    if (!formData.registration_date || regDateDisplay.length !== 10) {
      setErrorMsg('Please enter a valid Registration Date in MM/DD/YYYY format.');
      setShowErrorModal(true);
      setIsSubmitting(false);
      return;
    }

    try {
      const newStallId = Number(formData.stall_id);

      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .ilike('full_name', formData.full_name.trim())
        .eq('status', 'active')
        .neq('id', tenantId)
        .limit(1);

      if (existing && existing.length > 0) {
        throw new Error("An active tenant with this name already exists.");
      }

      const { error: tenantError } = await supabase
        .from('tenants')
        .update({
          full_name: formData.full_name.trim(),
          date_of_birth: formData.date_of_birth || null,
          contact_number: formData.contact_number.trim(),
          street: formData.street.trim(),
          barangay: formData.barangay.trim(),
          city: formData.city.trim(),
          stall_id: newStallId,
          business_name: formData.business_name.trim(),
          status: 'active',
          registration_date: formData.registration_date
        })
        .eq('id', tenantId);

      if (tenantError) throw tenantError;

      await supabase
        .from('stalls')
        .update({ status: 'Occupied', tenant_name: formData.full_name.trim() })
        .eq('id', newStallId);

      if (originalStallId && originalStallId !== newStallId) {
        await supabase
          .from('stalls')
          .update({ status: 'Vacant', tenant_name: null })
          .eq('id', originalStallId);
      }

      if (isDateChanged) {
        const regDateOnly = new Date(formData.registration_date + 'T00:00:00');
        const newAnchorDay = regDateOnly.getDate();
        const newRegMonthStr = `${regDateOnly.getFullYear()}-${String(regDateOnly.getMonth() + 1).padStart(2, '0')}-01`;

        const { data: oldBills } = await supabase
          .from('payments')
          .select('*')
          .eq('stall_id', newStallId);

        let existingOr = '000000';
        let latestPaidAmount = selectedStallDetails?.monthly_rent || 0;

        if (oldBills && oldBills.length > 0) {
          for (const bill of oldBills) {
            if (bill.status === 'Paid' && bill.receipt_number && bill.receipt_number !== '000000') {
              existingOr = bill.receipt_number;
              latestPaidAmount = bill.amount;
            }
          }
        }

        await supabase.from('payments').delete().eq('stall_id', newStallId);

        await supabase.from('payments').insert([{
          stall_id: newStallId,
          tenant_name: formData.full_name.trim(),
          amount: latestPaidAmount,
          payment_date: formData.registration_date,
          due_date: formData.registration_date,
          month_covered: newRegMonthStr,
          status: 'Paid',
          receipt_number: existingOr
        }]);

        let cursor = new Date(regDateOnly.getFullYear(), regDateOnly.getMonth(), 1);
        cursor.setMonth(cursor.getMonth() + 1);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentMonthFirst = new Date(today.getFullYear(), today.getMonth(), 1);

        const newPendingBills: any[] = [];

        while (cursor <= currentMonthFirst) {
          const y = cursor.getFullYear();
          const m = String(cursor.getMonth() + 1).padStart(2, '0');
          const monthStr = `${y}-${m}-01`;

          const daysInMonth = new Date(y, cursor.getMonth() + 1, 0).getDate();
          const actualDay = Math.min(newAnchorDay, daysInMonth);
          const dueDateStr = `${y}-${m}-${String(actualDay).padStart(2, '0')}`;

          const dueDateObj = new Date(dueDateStr + 'T00:00:00');
          const penaltyStartDate = new Date(dueDateObj);
          penaltyStartDate.setDate(penaltyStartDate.getDate() + 3);

          let billStatus = 'Pending';
          let penaltyAmount = 0;

          if (today > penaltyStartDate) {
            billStatus = 'Overdue';
            penaltyAmount = latestPaidAmount * 0.25;
          }

          newPendingBills.push({
            stall_id: newStallId,
            tenant_name: formData.full_name.trim(),
            amount: latestPaidAmount,
            payment_date: null,
            due_date: dueDateStr,
            month_covered: monthStr,
            status: billStatus,
            penalty: penaltyAmount,
            grace_period_days: 3
          });

          cursor.setMonth(cursor.getMonth() + 1);
        }

        if (newPendingBills.length > 0) {
          await supabase.from('payments').insert(newPendingBills);
        }
      }

      await recordAuditLog(
        'Edit Tenant', 
        `Updated tenant '${formData.full_name}' and assigned stall #${newStallId}.`, 
        'Tenant', 
        Number(tenantId)
      );

      setShowSuccessModal(true);
      setOriginalStallId(newStallId);
      setOriginalDate(formData.registration_date);
      setIsDateChanged(false);
      setConfirmReset(false);

    } catch (error: any) {
      setErrorMsg(error.message || "An error occurred while updating the tenant.");
      setShowErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedStallDetails = availableStalls.find(s => s.id === Number(formData.stall_id));

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading tenant data...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      <div className="page-header">
        <div>
          <h1>Edit Tenant</h1>
          <p>Update the details for {formData.full_name || 'Tenant'}.</p>
        </div>
        <div className="header-tools">
          <Link to={currentStallNumber ? `/stall-details?stall=${currentStallNumber}` : '/stall-monitoring'} className="btn-secondary">
            <i className="fa-solid fa-arrow-left"></i> Back to Stall
          </Link>
        </div>
      </div>

      <div className="form-container">
        <div className="form-header-bar">
          <div className="form-header-title">
            <i className="fa-solid fa-user-edit"></i> Update Information
          </div>
          <div className="form-header-help">
            All fields marked with <span style={{ color: '#dc2626' }}>*</span> are required.
          </div>
        </div>

        <div className="form-body">
          <form onSubmit={handleSubmit}>
            
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 6px 0', color: '#991b1b', fontSize: '15px' }}>Important Note on Date Changes</h4>
                  <p style={{ margin: 0, color: '#b91c1c', fontSize: '13px', lineHeight: '1.5' }}>
                    Changing the **Registration Date** will automatically **delete all existing payment history** and generate a new billing cycle based on the new date. This action cannot be undone.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', cursor: 'pointer', fontSize: '14px', color: '#7f1d1d', fontWeight: 600 }}>
                    <input 
                      type="checkbox" 
                      checked={confirmReset} 
                      onChange={(e) => setConfirmReset(e.target.checked)} 
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    I understand and want to reset the billing cycle
                  </label>
                </div>
              </div>
            </div>

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
                <h3>Business Assignment</h3>
              </div>
              <div className="form-grid grid-2">
                <div className="input-group">
                  <label>Stall Assignment <span className="required">*</span></label>
                  <select name="stall_id" value={formData.stall_id} onChange={handleChange} required>
                    {availableStalls.map(stall => (
                      <option key={stall.id} value={stall.id}>
                        [{stall.section_name}] {stall.stall_number} — ₱{Number(stall.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}/month
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
                        
                        if (e.target.value !== originalDate) {
                          setIsDateChanged(true);
                        } else {
                          setIsDateChanged(false);
                          setConfirmReset(false);
                        }
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
              </div>
            </div>

            <div className="form-actions">
              <Link 
                to={currentStallNumber ? `/stall-details?stall=${currentStallNumber}` : '/stall-monitoring'} 
                className="btn-outline"
              >
                Cancel
              </Link>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={isSubmitting || (isDateChanged && !confirmReset)}
              >
                <i className="fa-solid fa-floppy-disk"></i> {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showSuccessModal && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setShowSuccessModal(false) }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div className="modal-icon info-icon" style={{ background: '#ecfdf5', color: '#059669', margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-check" style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Success!</h3>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>
              Tenant information updated successfully.
            </p>
            <div className="modal-actions">
              <button 
                className="btn-primary" 
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setShowSuccessModal(false)}
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}

      {showErrorModal && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setShowErrorModal(false) }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div className="modal-icon danger-icon" style={{ margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Update Failed</h3>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>
              {errorMsg}
            </p>
            <div className="modal-actions">
              <button 
                className="btn-outline" 
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setShowErrorModal(false)}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}