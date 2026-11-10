// src/supabase/lib/audit.ts
import { supabase } from './supabase'; // CORRECT: Same folder

/**
 * Records an action into the audit_logs table
 */
export async function recordAuditLog(
  action: string, 
  description: string, 
  entityType: string | null = null, 
  entityId: number | null = null
) {
  try {
    // 1. Get the current logged-in user from Supabase Auth
    const { data: { user } } = await supabase.auth.getUser();

    // If no user is logged in, don't try to save a log
    if (!user) return;

    // 2. Get their role/username from user metadata
    const username = user?.email?.split('@')[0] || 'Unknown';
    const role = user?.user_metadata?.role || 'Unknown';
    const userId = user?.id; // This is a UUID string

    // 3. Insert the log
    const { error } = await supabase.from('audit_logs').insert([
      {
        user_id: userId,
        username: username,
        role: role,
        action: action,
        description: description,
        entity_type: entityType,
        entity_id: entityId,
        ip_address: null,
      }
    ]);

    if (error) {
      console.error("Failed to save audit log:", error.message);
    }
  } catch (err) {
    console.error("Audit Log Error:", err);
  }
}

/**
 * Delete a single log
 */
export async function deleteAuditLog(logId: number) {
  const { error } = await supabase
    .from('audit_logs')
    .delete()
    .eq('id', logId);

  return !error;
}

/**
 * Delete multiple logs
 */
export async function deleteAuditLogsBulk(logIds: number[]) {
  if (logIds.length === 0) return 0;

  const { error, count } = await supabase
    .from('audit_logs')
    .delete()
    .in('id', logIds);

  return error ? 0 : count;
}

/**
 * Clear ALL logs
 */
export async function clearAuditLogs() {
  const { error, count } = await supabase
    .from('audit_logs')
    .delete()
    .neq('id', 0); 

  return error ? 0 : count;
}