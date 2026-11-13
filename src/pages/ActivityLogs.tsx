import { useEffect, useState } from 'react';
import { supabase } from '../supabase/lib/supabase';
import '../css/logs.css';

const allowedRoles = ['Administrator', 'Meedo Personnel', 'Treasury'];

export default function ActivityLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [clearAllModalOpen, setClearAllModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Success/Error Popup
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(250);

      if (error) throw error;
      if (data) setLogs(data);

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const handleDeleteSingle = async () => {
    if (!selectedLog) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('audit_logs').delete().eq('id', selectedLog.id);
      if (error) throw error;

      setDeleteModalOpen(false);
      setSuccessMsg('Activity log deleted successfully.');
      fetchLogs();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearAll = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('audit_logs').delete().neq('id', 0);
      if (error) throw error;

      setClearAllModalOpen(false);
      setSuccessMsg('All activity logs have been cleared.');
      fetchLogs();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const search = searchQuery.toLowerCase();
    const matchesSearch = 
      log.action?.toLowerCase().includes(search) ||
      log.description?.toLowerCase().includes(search) ||
      log.username?.toLowerCase().includes(search) ||
      log.entity_type?.toLowerCase().includes(search) ||
      log.role?.toLowerCase().includes(search);
    const matchesRole = roleFilter === 'all' || log.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500 }}>Loading activity logs...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Activity Logs</h1>
          <p>Track all system changes and user actions.</p>
        </div>
        {logs.length > 0 && (
          <div className="header-tools">
            <button className="btn-danger" onClick={() => setClearAllModalOpen(true)}>
              <i className="fa-solid fa-broom"></i> Clear All Logs
            </button>
          </div>
        )}
      </div>

      {/* Table Panel */}
      <div className="data-panel">
        <div className="data-header">
          <h2>System Logs</h2>
          <div className="filters">
            <div className="input-with-icon">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input
                type="search"
                placeholder="Search actions, users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All roles</option>
              {allowedRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <i className="fa-regular fa-clipboard"></i>
            <h3>No activity logs found</h3>
            <p>Actions performed by users will appear here.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="logs-table">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Timestamp</th>
                  <th style={{ width: '200px' }}>User</th>
                  <th style={{ width: '150px' }}>Action</th>
                  <th>Details</th>
                  <th style={{ width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => {
                  // --- FIXED: Force Asia/Manila timezone ---
                  const logDate = new Date(log.created_at);
                  const dateStr = logDate.toLocaleDateString('en-US', { 
                    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' 
                  });
                  const timeStr = logDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' 
                  });

                  return (
                    <tr key={log.id}>
                      <td>
                        <div className="timestamp">{dateStr}</div>
                        <div className="timestamp-sub">{timeStr}</div>
                      </td>
                      <td>
                        <div className="user-name">{log.username}</div>
                        <div className={`role-badge ${log.role?.toLowerCase().replace(/\s+/g, '.')}`}>{log.role}</div>
                      </td>
                      <td>
                        <span className="action-badge">{log.action}</span>
                      </td>
                      <td>
                        <div className="log-description">{log.description}</div>
                        {log.entity_type && log.entity_id && (
                          <div className="log-entity">{log.entity_type} #{log.entity_id}</div>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn-icon danger"
                          title="Delete this log"
                          onClick={() => { setSelectedLog(log); setDeleteModalOpen(true); }}
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DELETE SINGLE MODAL */}
      {deleteModalOpen && selectedLog && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setDeleteModalOpen(false) }}>
          {/* FIX: Added inline maxWidth to prevent global stretching */}
          <div className="modal-box" style={{ maxWidth: '450px' }}>
            <div className="modal-icon danger-icon"><i className="fa-solid fa-trash"></i></div>
            <h3>Delete log #{selectedLog.id}?</h3>
            <p>This action cannot be undone. The log entry will be permanently removed.</p>
            <div className="modal-details">
              <div><strong>Action:</strong> {selectedLog.action}</div>
              <div><strong>User:</strong> {selectedLog.username}</div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>Cancel</button>
              <button className="btn-danger" onClick={handleDeleteSingle} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR ALL MODAL */}
      {clearAllModalOpen && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) setClearAllModalOpen(false) }}>
          {/* FIX: Added inline maxWidth to prevent global stretching */}
          <div className="modal-box" style={{ maxWidth: '450px' }}>
            <div className="modal-icon danger-icon"><i className="fa-solid fa-trash"></i></div>
            <h3>Delete ALL activity logs?</h3>
            <p>This will permanently wipe every log entry.</p>
            <div className="modal-details">
              <div style={{ color: '#b91c1c', fontWeight: 500 }}>
                <i className="fa-solid fa-triangle-exclamation"></i> There is no undo for this action.
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setClearAllModalOpen(false)} disabled={isDeleting}>Cancel</button>
              <button className="btn-danger" onClick={handleClearAll} disabled={isDeleting}>
                {isDeleting ? 'Clearing...' : 'Clear All Logs'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS / ERROR POPUP */}
      {(successMsg || errorMsg) && (
        <div className="modal-backdrop active" onClick={(e) => { if (e.target === e.currentTarget) { setSuccessMsg(''); setErrorMsg(''); } }}>
          <div className="modal-box" style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div className={`modal-icon ${errorMsg ? 'danger-icon' : 'info-icon'}`} style={{ margin: '0 auto 16px', borderRadius: '50%', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: errorMsg ? '#fef2f2' : '#ecfdf5', color: errorMsg ? '#dc2626' : '#059669' }}>
              <i className={`fa-solid ${errorMsg ? 'fa-triangle-exclamation' : 'fa-check'}`} style={{ fontSize: '24px' }}></i>
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>{errorMsg ? 'Error' : 'Success'}</h3>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>{errorMsg || successMsg}</p>
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setSuccessMsg(''); setErrorMsg(''); }}>Okay</button>
          </div>
        </div>
      )}

    </div>
  );
}