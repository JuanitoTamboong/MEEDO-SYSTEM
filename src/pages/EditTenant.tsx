import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/register-tenants.css';

interface Stall {
  id: number;
  stall_number: string;
  monthly_rent: number;
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
    business_name: ''
  });
  
  const [originalStallId, setOriginalStallId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Popup States
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!tenantId) {
      navigate('/stall-monitoring');
      return;
    }
    fetchData();
  }, [tenantId, navigate]);

  async function fetchData() {
    try {
      // 1. Fetch Tenant Data
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (tenantError || !tenantData) {
        throw new Error("Tenant not found.");
      }

      // 2. Fetch Current Stall Info (for the Back button)
      if (tenantData.stall_id) {
        const { data: currentStall } = await supabase
          .from('stalls')
          .select('stall_number')
          .eq('id', tenantData.stall_id)
          .single();
        
        if (currentStall) setCurrentStallNumber(currentStall.stall_number);
        setOriginalStallId(tenantData.stall_id);
      }

      // 3. Pre-fill the form
      setFormData({
        full_name: tenantData.full_name || '',
        date_of_birth: tenantData.date_of_birth || '',
        contact_number: tenantData.contact_number || '',
        street: tenantData.street || '',
        barangay: tenantData.barangay || '',
        city: tenantData.city || '',
        stall_id: tenantData.stall_id ? tenantData.stall_id.toString() : '',
        business_name: tenantData.business_name || ''
      });

      // 4. Fetch Available Stalls + Current Stall
      const { data: stallsData } = await supabase
        .from('stalls')
        .select('id, stall_number, monthly_rent')
        .or(`status.eq.Vacant,id.eq.${tenantData.stall_id}`)
        .order('stall_number', { ascending: true });

      if (stallsData) setAvailableStalls(stallsData);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    try {
      const newStallId = Number(formData.stall_id);

      // 1. Check for duplicate active tenant (excluding this tenant)
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

      // 2. Update Tenant Record
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
          status: 'active'
        })
        .eq('id', tenantId);

      if (tenantError) throw tenantError;

      // 3. Update New Stall to Occupied
      await supabase
        .from('stalls')
        .update({ status: 'Occupied', tenant_name: formData.full_name.trim() })
        .eq('id', newStallId);

      // 4. If the stall changed, vacate the OLD stall
      if (originalStallId && originalStallId !== newStallId) {
        await supabase
          .from('stalls')
          .update({ status: 'Vacant', tenant_name: null })
          .eq('id', originalStallId);
      }

      // 5. Audit Log
      await recordAuditLog(
        'Edit Tenant', 
        `Updated tenant '${formData.full_name}' and assigned stall #${newStallId}.`, 
        'Tenant', 
        Number(tenantId)
      );

      // 6. Show Success Popup
      setShowSuccessModal(true);
      setOriginalStallId(newStallId);

    } catch (error: any) {
      setErrorMsg(error.message || "An error occurred while updating the tenant.");
      setShowErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // LOADING SCREEN
  // ==========================================
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', flexDirection: 'column', alignItems: 'center', 
        justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' 
      }}>
        <div style={{ 
          width: '48px', height: '48px', border: '4px solid #e2e8f0', 
          borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' 
        }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>
          Loading tenant data...
        </p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      
      {/* Header */}
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

      {/* Form Container */}
      <div className="form-container">
        
        <div className="form-header-bar">
          <div className="form-header-title">
            <i className="fa-solid fa-user-edit"></i> Update Information
          </div>
        </div>

        <div className="form-body">
          <form onSubmit={handleSubmit}>
            
            {/* Section 1: Personal Info */}
            <div className="form-section">
              <div className="section-header">
                <div className="section-icon"><i className="fa-solid fa-user"></i></div>
                <h3>Personal Information</h3>
              </div>
              <div className="form-grid grid-3">
                <div className="input-group">
                  <label>Full Name <span className="required">*</span></label>
                  <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} required />
                </div>
                <div className="input-group">
                  <label>Date of Birth</label>
                  <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} />
                </div>
                <div className="input-group">
                  <label>Contact Number <span className="required">*</span></label>
                  <input type="text" name="contact_number" value={formData.contact_number} onChange={handleChange} required />
                </div>
              </div>
            </div>

            {/* Section 2: Address */}
            <div className="form-section">
              <div className="section-header">
                <div className="section-icon"><i className="fa-solid fa-location-dot"></i></div>
                <h3>Current Address</h3>
              </div>
              <div className="form-grid grid-2">
                <div className="input-group">
                  <label>Street / Purok</label>
                  <input type="text" name="street" value={formData.street} onChange={handleChange} />
                </div>
                <div className="input-group">
                  <label>Barangay</label>
                  <input type="text" name="barangay" value={formData.barangay} onChange={handleChange} />
                </div>
                <div className="input-group">
                  <label>City / Municipality</label>
                  <input type="text" name="city" value={formData.city} onChange={handleChange} />
                </div>
              </div>
            </div>

            {/* Section 3: Business */}
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
                        {stall.stall_number} — ₱{Number(stall.monthly_rent).toLocaleString(undefined, { minimumFractionDigits: 2 })}/month
                      </option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Business Name <span className="required">*</span></label>
                  <input type="text" name="business_name" value={formData.business_name} onChange={handleChange} required />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="form-actions">
              <Link 
                to={currentStallNumber ? `/stall-details?stall=${currentStallNumber}` : '/stall-monitoring'} 
                className="btn-outline"
              >
                Cancel
              </Link>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                <i className="fa-solid fa-floppy-disk"></i> {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ==========================================
          SUCCESS POPUP MODAL (Centered)
          ========================================== */}
      {showSuccessModal && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setShowSuccessModal(false) }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div className="modal-icon info-icon" style={{ background: '#ecfdf5', color: '#059669', margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px' }}>
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

      {/* ==========================================
          ERROR POPUP MODAL (Centered)
          ========================================== */}
      {showErrorModal && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setShowErrorModal(false) }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div className="modal-icon danger-icon" style={{ margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px' }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Registration Failed</h3>
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