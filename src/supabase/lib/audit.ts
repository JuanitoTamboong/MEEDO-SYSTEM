// src/lib/audit.ts
import { supabase } from './supabase';

/**
 * Records an action into the audit_logs table
 */
export async function recordAuditLog(
  action: string, 
  description: string, 
  entityType: string | null = null, 
  entityId: number | null = null
) {
  // 1. Get the current logged-in user from Supabase Auth
  const { data: { user } } = await supabase.auth.getUser();

  // 2. Get their role/username from user metadata (you set this up during Auth)
  // If you don't have metadata, you might need to fetch from your 'login' table
  const username = user?.email?.split('@')[0] || 'Unknown';
  const role = user?.user_metadata?.role || 'Unknown';
  const userId = user?.id || null;

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
      ip_address: null, // Browsers cannot easily get the user's IP address. Supabase Edge functions can, but for now we leave it null.
    }
  ]);

  if (error) {
    console.error("Failed to save audit log:", error.message);
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

  return !error; // Returns true if successful, false if error
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
  // In Postgres, you can't just do DELETE without a filter unless you use .neq('id', 0)
  const { error, count } = await supabase
    .from('audit_logs')
    .delete()
    .neq('id', 0); 

  return error ? 0 : count;
}