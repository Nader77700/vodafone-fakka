import { supabase } from '@/db/supabase';
import type {
  VipDashboardData,
  VipOwnerSessionVerification,
  VipOperationRecord,
  VipSession,
  VipCycleRecord,
} from '@/types/vip';

/**
 * Server-side verification of whether current authenticated session is the authorized VIP owner.
 * Never trusts frontend variables alone; relies strictly on server-executed RPC.
 */
export async function verifyVipOwnerSession(): Promise<VipOwnerSessionVerification> {
  try {
    const { data, error } = await supabase.rpc('vip_verify_owner_session');
    if (error) {
      console.error('[vipApi] verifyVipOwnerSession error:', error);
      return { is_authorized: false, reason: error.message };
    }
    return data as VipOwnerSessionVerification;
  } catch (err: any) {
    console.error('[vipApi] verifyVipOwnerSession exception:', err);
    return { is_authorized: false, reason: err?.message || 'network_error' };
  }
}

/**
 * List all active VIP sessions.
 */
export async function listVipSessions(): Promise<VipSession[]> {
  try {
    const { data, error } = await supabase.rpc('vip_list_sessions');
    if (error) throw error;
    return (data?.sessions || []) as VipSession[];
  } catch (err) {
    console.error('[vipApi] listVipSessions error:', err);
    throw err;
  }
}

/**
 * Create a new isolated VIP session.
 */
export async function createVipSession(params: {
  session_name?: string;
  owner_email: string;
  owner_password: string;
  individual_email: string;
  individual_password: string;
  target_balance?: number;
  cycle_delay_seconds?: number;
  description?: string;
}): Promise<{ success: boolean; session?: VipSession; message: string }> {
  try {
    const { data, error } = await supabase.rpc('vip_create_session', {
      p_session_name: params.session_name?.trim() || null,
      p_owner_email: params.owner_email.trim(),
      p_owner_password: params.owner_password.trim(),
      p_individual_email: params.individual_email.trim(),
      p_individual_password: params.individual_password.trim(),
      p_target_balance: params.target_balance || 50000,
      p_cycle_delay_seconds: params.cycle_delay_seconds !== undefined ? params.cycle_delay_seconds : 20,
      p_description: params.description?.trim() || null,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[vipApi] createVipSession error:', err);
    throw err;
  }
}

/**
 * Update an existing VIP session configuration.
 */
export async function updateVipSession(params: {
  session_id: string;
  session_name: string;
  owner_identifier: string;
  individual_identifier: string;
  description?: string;
}): Promise<{ success: boolean; session?: VipSession; message: string }> {
  try {
    const { data, error } = await supabase.rpc('vip_update_session', {
      p_session_id: params.session_id,
      p_session_name: params.session_name,
      p_owner_identifier: params.owner_identifier || null,
      p_individual_identifier: params.individual_identifier || null,
      p_description: params.description || null,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[vipApi] updateVipSession error:', err);
    throw err;
  }
}

/**
 * Delete / Archive a VIP session.
 */
export async function deleteVipSession(
  sessionId: string
): Promise<{ success: boolean; session_id: string; message: string }> {
  try {
    const { data, error } = await supabase.rpc('vip_delete_session', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[vipApi] deleteVipSession error:', err);
    throw err;
  }
}

/**
 * Fetch detailed state for a specific session.
 */
export async function getVipSessionDetails(
  sessionId = 'default'
): Promise<VipDashboardData | null> {
  try {
    const { data, error } = await supabase.rpc('vip_get_session_details', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return data as VipDashboardData;
  } catch (err) {
    console.error('[vipApi] getVipSessionDetails error:', err);
    throw err;
  }
}

/**
 * Fetch complete VIP dashboard state securely from server for a specific session (defaults to 'default').
 */
export async function getVipDashboardData(sessionId = 'default'): Promise<VipDashboardData | null> {
  return getVipSessionDetails(sessionId);
}

/**
 * Save VIP accounts setup identifiers (Owner & Individual).
 */
export async function saveVipAccountSetup(
  ownerIdentifier: string,
  individualIdentifier: string
): Promise<{ success: boolean; owner_identifier?: string; individual_identifier?: string }> {
  const { data, error } = await supabase.rpc('vip_save_account_setup', {
    p_owner_identifier: ownerIdentifier || null,
    p_individual_identifier: individualIdentifier || null,
  });

  if (error) throw error;
  return data;
}

/**
 * Submit a manual VIP operation for a specific session.
 * Phase 1 & 2 Safety Rule: Registers operation in database with 'pending_integration' state.
 * No carrier changes are simulated or executed until carrier script integration.
 */
export async function submitVipManualOperation(
  operationType: string,
  requestedAction: string,
  planId?: string,
  amount?: number,
  sessionId = 'default'
): Promise<{ success: boolean; operation_id: string; session_id?: string; status: string; message: string }> {
  const { data, error } = await supabase.rpc('vip_submit_manual_operation', {
    p_operation_type: operationType,
    p_requested_action: requestedAction,
    p_plan_id: planId || null,
    p_amount: amount !== undefined && amount !== null ? amount : null,
    p_session_id: sessionId,
  });

  if (error) throw error;
  return data;
}

/**
 * Update VIP automation settings for a specific session.
 */
export async function updateVipAutomationSettings(
  enabled: boolean,
  targetBalance: number,
  customBalance?: number | null,
  action: 'save' | 'pause' | 'stop' = 'save',
  sessionId = 'default',
  cycleDelaySeconds = 20
): Promise<{ success: boolean; session_id?: string; automation_enabled: boolean; operation_state: string; target_balance: number; cycle_delay_seconds?: number }> {
  const { data, error } = await supabase.rpc('vip_update_automation_settings', {
    p_enabled: enabled,
    p_target_balance: targetBalance,
    p_custom_target: customBalance || null,
    p_action: action,
    p_session_id: sessionId,
    p_cycle_delay_seconds: cycleDelaySeconds,
  });

  if (error) throw error;
  return data;
}

/**
 * Save VIP session account credentials securely.
 */
export async function saveVipSessionCredentials(
  sessionId: string,
  credentials: {
    owner_email?: string;
    owner_password?: string;
    individual_email?: string;
    individual_password?: string;
    cycle_delay_seconds?: number;
  }
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc('vip_save_session_credentials', {
    p_session_id: sessionId,
    p_owner_email: credentials.owner_email || null,
    p_owner_password: credentials.owner_password || null,
    p_individual_email: credentials.individual_email || null,
    p_individual_password: credentials.individual_password || null,
    p_cycle_delay_seconds: credentials.cycle_delay_seconds || null,
  });

  if (error) throw error;
  return data;
}

/**
 * Fetch full operation history, optionally filtered by session.
 */
export async function getVipOperationHistory(
  sessionId?: string,
  limit = 50
): Promise<VipOperationRecord[]> {
  let query = supabase
    .from('vip_operation_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as VipOperationRecord[];
}

/**
 * Fetch cycle history for a specific session.
 */
export async function getVipCycleHistory(
  sessionId = 'default',
  limit = 30
): Promise<VipCycleRecord[]> {
  const { data, error } = await supabase
    .from('vip_cycle_history')
    .select('*')
    .eq('session_id', sessionId)
    .order('cycle_number', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as VipCycleRecord[];
}


// ══════════════════════════════════════════════════════════════════
// REAL ETISALAT BOT EXECUTOR INTEGRATION (MAB API ENGINE)
// ══════════════════════════════════════════════════════════════════

export interface VipExecutionLog {
  time: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface VipExecutionResponse {
  success: boolean;
  error?: string;
  message?: string;
  data?: any;
  logs?: VipExecutionLog[];
  cycle_number?: number;
  final_mix?: number;
  target_reached?: boolean;
  child_number?: string;
  current_plan?: string;
  remaining_mix?: number;
  owner_final_mix?: number;
  post_renew_balance?: number;
}

/**
 * Invoke the live EtisalatBot Edge Function executor.
 */
export async function invokeVipExecutor(
  action: string,
  payload: Record<string, any>
): Promise<VipExecutionResponse> {
  const { data, error } = await supabase.functions.invoke('etisalat-vip-executor', {
    body: { action, ...payload },
  });

  if (error) {
    throw new Error(error.message || 'حدث خطأ أثناء الاتصال بمحرك اتصالات المباشر');
  }

  return data as VipExecutionResponse;
}

/**
 * Action 1: Live Status & Child Check
 */
export async function executeVipCheckStatus(sessionId: string): Promise<VipExecutionResponse> {
  return invokeVipExecutor('check_status', { session_id: sessionId });
}

/**
 * Action 2: Add Child with Automatic Child Login Confirmation
 */
export async function executeVipAddChild(
  sessionId: string,
  childNumber: string
): Promise<VipExecutionResponse> {
  return invokeVipExecutor('add_child', {
    session_id: sessionId,
    child_number: childNumber,
  });
}

/**
 * Action 3: Renew Bundle (270 for Parent 7 or 180 for Parent 6)
 */
export async function executeVipRenewBundle(sessionId: string): Promise<VipExecutionResponse> {
  return invokeVipExecutor('renew_bundle', { session_id: sessionId });
}

/**
 * Action 4: Transfer Mixes to Child Line
 */
export async function executeVipTransferToChild(
  sessionId: string,
  amount?: number
): Promise<VipExecutionResponse> {
  return invokeVipExecutor('transfer_to_child', {
    session_id: sessionId,
    amount,
  });
}

/**
 * Action 5: Change Plan (Migrate Parent 7 <-> Parent 6)
 */
export async function executeVipChangePlan(
  sessionId: string,
  targetPlan?: '6' | '7'
): Promise<VipExecutionResponse> {
  return invokeVipExecutor('change_plan', {
    session_id: sessionId,
    target_plan: targetPlan,
  });
}

/**
 * Action 6: Return Child Mixes to Owner
 */
export async function executeVipReturnChildMixes(sessionId: string): Promise<VipExecutionResponse> {
  return invokeVipExecutor('return_child_mixes', { session_id: sessionId });
}

/**
 * Action 7: Execute Full Single Cycle of Script
 */
export async function executeVipRunSingleCycle(sessionId: string): Promise<VipExecutionResponse> {
  return invokeVipExecutor('run_single_cycle', { session_id: sessionId });
}
