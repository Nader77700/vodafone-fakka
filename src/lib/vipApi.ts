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
 * Delete / Archive all active VIP sessions.
 */
export async function deleteAllVipSessions(): Promise<{ success: boolean; deleted_count: number; message: string }> {
  try {
    const { data, error } = await supabase.rpc('vip_delete_all_sessions');
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[vipApi] deleteAllVipSessions error:', err);
    throw err;
  }
}

/**
 * Get Arabic Plan Display Name matching etisalat_bot.py
 */
export function getVipPlanDisplayName(planId: string | null | undefined): string {
  if (!planId) return 'غير معروف';
  if (planId.includes('Parent_7') || planId.includes('270')) return 'حكاية ميكسات 270';
  if (planId.includes('Parent_6') || planId.includes('180') || planId.includes('951')) return 'حكاية ميكسات 180';
  if (planId.includes('Parent_5') || planId.includes('240')) return 'حكاية ميكسات 240';
  if (planId.includes('Parent_8') || planId.includes('52')) return 'حكاية ميكسات 52';
  return planId;
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
  config?: any;
  scripts?: any[];
  script?: any;
  logs?: VipExecutionLog[];
  cycle_number?: number;
  final_mix?: number;
  target_reached?: boolean;
  child_number?: string;
  current_plan?: string;
  remaining_mix?: number;
  owner_final_mix?: number;
  post_renew_balance?: number;
  status?: string;
  status_code?: number;
  latency_ms?: number;
  bridge_enabled?: boolean;
  bridge_url?: string;
  owner_ip?: string;
  child_ip?: string;
}

/**
 * Invoke the live EtisalatBot Edge Function executor directly with full auth headers.
 */
export async function invokeVipExecutor(
  action: string,
  payload: Record<string, any>
): Promise<VipExecutionResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vchmsnavyhripakyvzom.supabase.co';
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODc4NTUsImV4cCI6MjA5Nzg2Mzg1NX0.pnqdmg5BApYx3HAPWR2UFhuV5ewyayvKR_dZk8of4s8';

  let token = anonKey;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      token = data.session.access_token;
    }
  } catch {
    // fallback to anonKey
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/etisalat-vip-executor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || json.message || `خطأ استجابة الخادم (${res.status})`);
    }
    return json as VipExecutionResponse;
  } catch (err: any) {
    console.error('[vipApi] invokeVipExecutor error:', err);
    throw new Error(err?.message || 'حدث خطأ أثناء الاتصال بمحرك اتصالات المباشر');
  }
}

/**
 * Get default saved child credentials (email, password, dial).
 */
export async function getVipDefaultChildCredentials(): Promise<{
  success: boolean;
  child_email: string;
  child_password?: string;
  child_dial?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('vip_get_default_child_credentials');
    if (error) throw error;
    return data || { success: true, child_email: '', child_password: '', child_dial: '' };
  } catch (err) {
    console.error('[vipApi] getVipDefaultChildCredentials error:', err);
    return { success: false, child_email: '', child_password: '', child_dial: '' };
  }
}

// ══════════════════════════════════════════════════════════════════
// BRIDGE, PROXY & DYNAMIC SCRIPT CONFIGURATION APIs
// ══════════════════════════════════════════════════════════════════

export interface VipBridgeConfigData {
  id?: string;
  bridge_enabled: boolean;
  bridge_url: string;
  bridge_mode: string;
  bridge_auth?: string;
  owner_device_id: string;
  owner_model_type: string;
  owner_os_version: string;
  owner_user_agent: string;
  owner_simulated_ip: string;
  child_device_id: string;
  child_model_type: string;
  child_os_version: string;
  child_user_agent: string;
  child_simulated_ip: string;
  last_ping_status?: string;
  last_ping_ms?: number;
  last_ping_at?: string;
}

export interface VipBotScriptData {
  id: string;
  name: string;
  version: string;
  script_code: string;
  is_active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export async function getVipBridgeConfig(): Promise<VipBridgeConfigData> {
  const res = await invokeVipExecutor('get_bridge_config', {});
  return res.config || res.data;
}

export async function updateVipBridgeConfig(
  config: Partial<VipBridgeConfigData>
): Promise<VipBridgeConfigData> {
  const res = await invokeVipExecutor('update_bridge_config', config);
  return res.config || res.data;
}

export async function testVipBridgeConnection(): Promise<{
  success: boolean;
  status: string;
  status_code: number;
  latency_ms: number;
  bridge_enabled: boolean;
  bridge_url: string;
  owner_ip: string;
  child_ip: string;
}> {
  const res = await invokeVipExecutor('test_bridge', {});
  return res as any;
}

export async function getVipBotScripts(): Promise<VipBotScriptData[]> {
  const res = await invokeVipExecutor('get_bot_scripts', {});
  return res.scripts || [];
}

export async function saveVipBotScript(payload: {
  script_id?: string;
  name?: string;
  version?: string;
  script_code: string;
  is_active?: boolean;
  notes?: string;
}): Promise<VipBotScriptData> {
  const res = await invokeVipExecutor('save_bot_script', payload);
  return res.script || res.data;
}

/**
 * Save default child credentials (email, password, dial).
 */
export async function saveVipDefaultChildCredentials(
  email: string,
  password?: string,
  dial?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc('vip_save_default_child_credentials', {
      p_child_email: email.trim(),
      p_child_password: (password || '').trim(),
      p_child_dial: (dial || '').trim() || null,
    });
    if (error) throw error;
    return data;
  } catch (err: any) {
    console.error('[vipApi] saveVipDefaultChildCredentials error:', err);
    throw err;
  }
}

/**
 * Action 1: Live Status & Child Check
 */
export async function executeVipCheckStatus(
  sessionId: string,
  credentials?: {
    owner_email?: string;
    owner_password?: string;
    individual_email?: string;
    individual_password?: string;
  }
): Promise<VipExecutionResponse> {
  return invokeVipExecutor('check_status', {
    session_id: sessionId,
    ...credentials,
  });
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
