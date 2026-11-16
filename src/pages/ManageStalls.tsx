import { useEffect, useState } from 'react';
import { supabase } from '../supabase/lib/supabase';
import { recordAuditLog } from '../supabase/lib/audit';
import '../css/manage-stalls.css';

interface Section {
  id: number;
  section_name: string;
  icon_class: string;
  display_order: number;
}

interface Stall {
  id: number;
  stall_number: string;
  section_id: number;
  tenant_name: string | null;
  status: 'Occupied' | 'Vacant';
  monthly_rent: number;
}

const icon_list = {
  'Meat': 'fa-drumstick-bite', 'Fish': 'fa-fish', 'Vegetables': 'fa-leaf',
  'Fruits': 'fa-apple-whole', 'Eggs': 'fa-egg', 'Poultry': 'fa-drumstick-bite',
  'Rice & Grains': 'fa-bowl-rice', 'Grocery': 'fa-store', 'Bakery': 'fa-bread-slice',
  'Spices & Condiments': 'fa-pepper', 'Seafood': 'fa-fish', 'Dry Goods': 'fa-box',
  'Cooked Foods': 'fa-utensils', 'Beverages': 'fa-mug-saucer', 'Household Supplies': 'fa-soap'
};

const getIconClass = (iconName: string) => {
  return icon_list[iconName as keyof typeof icon_list] || 'fa-store';
};

export default function ManageStalls() {
  const [sections, setSections] = useState<Section[]>([]);
  const [stalls, setStalls] = useState<Stall[]>([]);
  
  const [newSection, setNewSection] = useState({ name: '', icon: '' });
  const [newStall, setNewStall] = useState({ sectionId: '', rent: '2000' });
  
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, type: 'section' | 'stall', id: number, name: string, extra?: string } | null>(null);
  const [editRentModal, setEditRentModal] = useState<{ isOpen: boolean, stallId: number, stallNumber: string, currentRent: number } | null>(null);
  const [editRentValue, setEditRentValue] = useState('');

  // 🛑 STATES PARA SA LOADING, SUCCESS AT ERROR
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: sectionsData } = await supabase.from('sections').select('*').order('display_order', { ascending: true });
    const { data: stallsData } = await supabase.from('stalls').select('*').order('stall_number', { ascending: true });

    if (sectionsData) setSections(sectionsData);
    if (stallsData) setStalls(stallsData);
  }

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSection.name || !newSection.icon) return alert("Please fill in all fields");

    const exists = sections.find(s => s.section_name.toLowerCase() === newSection.name.toLowerCase());
    if (exists) return alert("Section already exists!");

    setIsActionLoading(true);

    try {
      const nextOrder = sections.length > 0 ? Math.max(...sections.map(s => s.display_order)) + 1 : 0;

      const { data, error } = await supabase.from('sections').insert([{
        section_name: newSection.name,
        icon_class: newSection.icon,
        display_order: nextOrder
      }]).select();

      if (error) throw error;
      
      await recordAuditLog('Add Section', `Added market section '${newSection.name}'.`, 'Section', data[0].id);
      setNewSection({ name: '', icon: '' });
      fetchData();
      setSuccessMsg(`Section "${newSection.name}" has been successfully created.`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAddStall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStall.sectionId) return alert("Please select a section");

    setIsActionLoading(true);

    try {
      const sectionIdNum = Number(newStall.sectionId);
      const prefix = `S${sectionIdNum}`;
      
      const existingStalls = stalls.filter(s => s.section_id === sectionIdNum);
      let nextNum = 1;
      let stallNumber = '';
      while (true) {
        stallNumber = `${prefix}-${String(nextNum).padStart(3, '0')}`;
        if (!existingStalls.find(s => s.stall_number === stallNumber)) break;
        nextNum++;
      }

      const { data, error } = await supabase.from('stalls').insert([{
        stall_number: stallNumber,
        section_id: sectionIdNum,
        status: 'Vacant',
        monthly_rent: Number(newStall.rent)
      }]).select();

      if (error) throw error;

      await recordAuditLog('Add Stall', `Added vacant stall '${stallNumber}'.`, 'Stall', data[0].id);
      setNewStall({ ...newStall, sectionId: '' });
      fetchData();
      setSuccessMsg(`Stall "${stallNumber}" has been successfully created.`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEditRent = async () => {
    if (!editRentModal) return;
    const rent = Number(editRentValue);
    if (rent <= 0) return;

    setIsActionLoading(true);

    try {
      const { error } = await supabase.from('stalls').update({ monthly_rent: rent }).eq('id', editRentModal.stallId);
      if (error) throw error;

      await supabase.from('payments').update({ amount: rent })
        .eq('stall_id', editRentModal.stallId)
        .neq('status', 'Paid');

      await recordAuditLog('Edit Stall Rent', `Updated monthly rent for stall #${editRentModal.stallId} to ₱${rent.toFixed(2)}.`, 'Stall', editRentModal.stallId);
      setEditRentModal(null);
      fetchData();
      setSuccessMsg(`Rent for stall "${editRentModal.stallNumber}" has been updated to ₱${rent.toFixed(2)}.`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const executeDelete = async () => {
    if (!confirmModal) return;
    setIsActionLoading(true);

    try {
      if (confirmModal.type === 'section') {
        const { data: sectionStalls } = await supabase.from('stalls').select('id').eq('section_id', confirmModal.id);
        
        if (sectionStalls) {
          for (const stall of sectionStalls) {
            const { data: tenants } = await supabase.from('tenants').select('id').eq('stall_id', stall.id);
            
            if (tenants) {
              for (const t of tenants) {
                await supabase.from('payments').delete().eq('stall_id', stall.id);
                await supabase.from('contracts').delete().eq('tenant_id', t.id);
                await supabase.from('tenants').delete().eq('id', t.id);
              }
            }
          }
          await supabase.from('stalls').delete().eq('section_id', confirmModal.id);
        }

        await supabase.from('sections').delete().eq('id', confirmModal.id);
        await recordAuditLog('Delete Section', `Deleted section #${confirmModal.id} and all connected records.`, 'Section', confirmModal.id);
      } else {
        const { data: tenants } = await supabase.from('tenants').select('id').eq('stall_id', confirmModal.id);

        if (tenants) {
          for (const t of tenants) {
            await supabase.from('payments').delete().eq('stall_id', confirmModal.id);
            await supabase.from('contracts').delete().eq('tenant_id', t.id);
            await supabase.from('tenants').delete().eq('id', t.id);
          }
        }

        await supabase.from('stalls').delete().eq('id', confirmModal.id);
        await recordAuditLog('Delete Stall', `Deleted stall #${confirmModal.id} and all connected records.`, 'Stall', confirmModal.id);
      }

      await fetchData();
      setConfirmModal(null);
      setSuccessMsg(`Successfully deleted ${confirmModal.type === 'section' ? 'Section' : 'Stall'} and all related records.`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to delete. Please check console for errors.");
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="content-wrapper">
      
      <div className="page-header">
        <div>
          <h1>Manage Stalls</h1>
          <p>Configure market sections, stalls, and base rental rates.</p>
        </div>
        <div className="header-tools">
          <button className="btn-secondary">
            <i className="fa-solid fa-download"></i> Export
          </button>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric-box">
          <div className="metric-icon green"><i className="fa-solid fa-door-open"></i></div>
          <div className="metric-data">
            <div className="metric-label">Available Stalls</div>
            <div className="metric-value">{stalls.filter(s => s.status === 'Vacant').length}</div>
          </div>
        </div>
        <div className="metric-box">
          <div className="metric-icon blue"><i className="fa-solid fa-store"></i></div>
          <div className="metric-data">
            <div className="metric-label">Occupied Stalls</div>
            <div className="metric-value">{stalls.filter(s => s.status === 'Occupied').length}</div>
          </div>
        </div>
      </div>

      <div className="config-grid">
        <div className="config-panel">
          <div className="config-header">
            <h3><i className="fa-solid fa-layer-group"></i> Create Section</h3>
          </div>
          <form onSubmit={handleAddSection} className="enterprise-form">
            <div className="input-group" style={{ flex: 2 }}>
              <label>Section Name</label>
              <input 
                type="text" 
                placeholder="e.g., Meat Section" 
                value={newSection.name}
                onChange={e => setNewSection({ ...newSection, name: e.target.value })}
                required
              />
            </div>
            <div className="input-group" style={{ flex: 2 }}>
              <label>Icon Category</label>
              <select 
                value={newSection.icon}
                onChange={e => setNewSection({ ...newSection, icon: e.target.value })}
                required
              >
                <option value="">Select Icon</option>
                {Object.keys(icon_list).map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={isActionLoading}>
              {isActionLoading ? 'Adding...' : <><i className="fa-solid fa-plus"></i> Add</>}
            </button>
          </form>
        </div>

        <div className="config-panel">
          <div className="config-header">
            <h3><i className="fa-solid fa-store"></i> Create Stall</h3>
            <span className="helper-text">Auto-generates stall number</span>
          </div>
          <form onSubmit={handleAddStall} className="enterprise-form">
            <div className="input-group" style={{ flex: 2 }}>
              <label>Assign to Section</label>
              <select 
                value={newStall.sectionId}
                onChange={e => setNewStall({ ...newStall, sectionId: e.target.value })}
                required
              >
                <option value="">Select Section...</option>
                {sections.map(sec => <option key={sec.id} value={sec.id}>{sec.section_name}</option>)}
              </select>
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label>Rent (₱)</label>
              <input 
                type="number" 
                value={newStall.rent}
                onChange={e => setNewStall({ ...newStall, rent: e.target.value })}
                step="0.01" required 
              />
            </div>
            <button type="submit" className="btn-primary outline" disabled={isActionLoading}>
              {isActionLoading ? 'Adding...' : <><i className="fa-solid fa-plus"></i> Add</>}
            </button>
          </form>
        </div>
      </div>

      <div className="data-panel">
        <div className="data-header">
          <h2>Stall Directory</h2>
        </div>

        {sections.length === 0 ? (
          <div className="empty-state"><i className="fa-solid fa-store"></i><p>No sections found. Add your first section above.</p></div>
        ) : (
          sections.map(section => {
            const sectionStalls = stalls.filter(s => s.section_id === section.id);
            const available = sectionStalls.filter(s => s.status === 'Vacant').length;
            const occupied = sectionStalls.filter(s => s.status === 'Occupied').length;
            
            return (
              <div key={section.id} className="section-block">
                <div className="section-toolbar">
                  <div className="section-identity">
                    <div className="section-icon"><i className={`fa-solid ${getIconClass(section.icon_class)}`}></i></div>
                    <div>
                      <h3>{section.section_name}</h3>
                      <div className="section-stats">
                        <span>{sectionStalls.length} total</span> &middot; 
                        <span className="text-green"> {available} available</span> &middot; 
                        <span className="text-orange"> {occupied} occupied</span>
                      </div>
                    </div>
                  </div>
                  <div className="section-controls">
                    <button 
                      className="btn-control danger" 
                      onClick={() => setConfirmModal({ isOpen: true, type: 'section', id: section.id, name: section.section_name, extra: `${sectionStalls.length} stalls will also be deleted.` })}
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>

                <div className="stall-container">
                  <div className="stall-grid">
                    {sectionStalls.length === 0 ? (
                      <div className="empty-row">No stalls added to this section yet.</div>
                    ) : (
                      sectionStalls.map(stall => (
                        <div key={stall.id} className={`stall-item ${stall.status.toLowerCase()}`}>
                          <div className="stall-top">
                            <div className="stall-id">{stall.stall_number}</div>
                            <div className={`status-badge ${stall.status.toLowerCase()}`}>
                              <i className={`fa-solid ${stall.status === 'Occupied' ? 'fa-circle-check' : 'fa-circle'}`}></i>
                              {stall.status === 'Occupied' ? 'Occupied' : 'Available'}
                            </div>
                          </div>
                          <div className="stall-middle">
                            <div className={`stall-tenant ${!stall.tenant_name ? 'vacant-text' : ''}`}>
                              <i className="fa-solid fa-user-circle"></i>
                              {stall.tenant_name || 'No Tenant Assigned'}
                            </div>
                            <div className="stall-price">₱{stall.monthly_rent.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span>/mo</span></div>
                          </div>
                          <div className="stall-bottom">
                            <button 
                              className="btn-text" 
                              onClick={() => { setEditRentModal({ isOpen: true, stallId: stall.id, stallNumber: stall.stall_number, currentRent: stall.monthly_rent }); setEditRentValue(stall.monthly_rent.toString()); }}
                            >
                              <i className="fa-solid fa-pen"></i> Edit Rent
                            </button>
                            <button 
                              className="btn-text danger"
                              onClick={() => setConfirmModal({ isOpen: true, type: 'stall', id: stall.id, name: stall.stall_number, extra: 'WARNING: Deleting this will also wipe out the tenant, contract, and payment history connected to this stall.' })}
                            >
                              <i className="fa-solid fa-trash"></i> Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {confirmModal && confirmModal.isOpen && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget && !isActionLoading) setConfirmModal(null) }}>
          <div className="modal-box">
            <div className="modal-icon danger-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
            <h3>Delete {confirmModal.type === 'section' ? 'Section' : 'Stall'}</h3>
            <p>Are you sure you want to delete this {confirmModal.type}? This action cannot be undone.</p>
            <div className="modal-details" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
              <strong>{confirmModal.name}</strong><br/>
              {confirmModal.extra}
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmModal(null)} disabled={isActionLoading}>Cancel</button>
              <button className="btn-danger" onClick={executeDelete} disabled={isActionLoading}>
                {isActionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editRentModal && editRentModal.isOpen && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setEditRentModal(null) }}>
          <div className="modal-box">
            <div className="modal-icon info-icon"><i className="fa-solid fa-pen"></i></div>
            <h3>Edit Monthly Rent</h3>
            <p>Update the base rent price for this stall.</p>
            <div className="modal-details">
              Stall: <strong>{editRentModal.stallNumber}</strong>
            </div>
            <div className="input-group" style={{ marginBottom: '24px' }}>
              <label>Monthly Rent (₱)</label>
              <input 
                type="number" 
                step="0.01" 
                min="0.01" 
                value={editRentValue}
                onChange={(e) => setEditRentValue(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setEditRentModal(null)} disabled={isActionLoading}>Cancel</button>
              <button className="btn-primary" onClick={handleEditRent} disabled={isActionLoading}>
                {isActionLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setSuccessMsg('') }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px', width: '100%' }}>
            <div className="modal-icon info-icon" style={{ margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ecfdf5', color: '#059669' }}>
              <i className="fa-solid fa-check" style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Success</h3>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>{successMsg}</p>
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setSuccessMsg('')}>Okay</button>
          </div>
        </div>
      )}

    </div>
  );
}