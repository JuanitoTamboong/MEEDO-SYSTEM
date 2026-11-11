// src/supabase/lib/audit.ts
import { supabase } from './supabase';

export async function recordAuditLog(
  action: string, 
  description: string, 
  entityType: string | null = null, 
  entityId: number | null = null
) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) return;

    const { error } = await supabase.from('audit_logs').insert([
      {
        user_id: user.id,
        username: user.email || 'Unknown User',
        role: user.user_metadata?.role || 'Unknown',
        action,
        description,
        entity_type: entityType,
        entity_id: entityId,
        ip_address: null,
      }
    ]);

    if (error) console.error("Failed to save audit log:", error.message);
  } catch (err) {
    console.error("Audit Log Error:", err);
  }
}

export async function deleteAuditLog(logId: number) {
  const { error } = await supabase
    .from('audit_logs')
    .delete()
    .eq('id', logId);

  return !error;
}

export async function deleteAuditLogsBulk(logIds: number[]) {
  if (logIds.length === 0) return 0;

  const { error, count } = await supabase
    .from('audit_logs')
    .delete()
    .in('id', logIds);

  return error ? 0 : count;
}

export async function clearAuditLogs() {
  const { error, count } = await supabase
    .from('audit_logs')
    .delete()
    .neq('id', 0); 

  return error ? 0 : count;
}