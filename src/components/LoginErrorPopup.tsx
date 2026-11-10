import { useEffect } from 'react';

interface Props {
  message: string;
  onClose: () => void;
}

export default function LoginErrorPopup({ message, onClose }: Props) {
  // Allow closing with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ background: '#fff', borderRadius: '12px', minWidth: '320px', maxWidth: '520px', padding: '20px', boxShadow: '0 18px 45px rgba(0,0,0,.25)', fontFamily: 'Inter, sans-serif', color: '#111' }}>
        
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#fff5f5', border: '1px solid #ffd6d6', color: '#c53030', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flex: '0 0 48px' }}>
             {/* SVG Warning Icon */}
             <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
               <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#c53030" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
               <path d="M12 9v4" stroke="#c53030" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
               <path d="M12 17h.01" stroke="#c53030" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
             </svg>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '18px', marginTop: '2px', color: '#111' }}>Login Failed</div>
            <div style={{ color: '#374151', fontSize: '14px', marginTop: '8px', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {message}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
          <button onClick={onClose} style={{ border: 'none', borderRadius: '10px', background: '#111827', color: '#fff', padding: '9px 16px', fontWeight: 600, cursor: 'pointer' }}>
            OK
          </button>
        </div>

      </div>
    </div>
  );
}