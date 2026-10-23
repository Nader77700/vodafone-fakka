import { supabase } from '@/db/supabase';

export interface VipAccessStatus {
  is_owner: boolean;
  is_delegated: boolean;
  can_execute: boolean;
  block_reason?: 'not_authorized' | 'cooldown_active' | 'daily_limit_reached' | 'daily_mixes_limit_reached' | null;
  max_daily_cycles?: number;
  cycle_count_today?: number;
  cycles_remaining?: number;
  max_daily_mixes?: number;
  mixes_consumed_today?: number;
  mixes_remaining?: number;
  allowed_packages?: number[];
  allow_custom_amount?: boolean;
  max_concurrent_sessions?: number;
  cooldown_seconds?: number;
  min_cooldown_seconds?: number;
  cooldown_remaining?: number;
  last_cycle_at?: string | null;
  user_email?: string;
}

export interface DelegatedUser {
  id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  is_active: boolean;
  max_daily_cycles: number;
  cycle_count_today: number;
  max_daily_mixes?: number;
  mixes_consumed_today?: number;
  allowed_packages?: number[];
  allow_custom_amount?: boolean;
  max_concurrent_sessions?: number;
  cooldown_seconds?: number;
  min_cooldown_seconds: number;
  last_cycle_at?: string | null;
  assigned_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface VipExecutionLog {
  id: string;
  user_id: string;
  user_email?: string;
  session_id?: string;
  action_type: string;
  status: 'success' | 'failed' | 'cooldown_blocked' | 'limit_reached';
  owner_phone?: string;
  child_phone?: string;
  mixes_requested?: number;
  client_summary?: string;
  owner_technical_details?: Record<string, any>;
  execution_time_ms?: number;
  error_reason?: string;
  ip_address?: string;
  created_at: string;
}

export interface VipOwnerAnalytics {
  total_ops: number;
  success_ops: number;
  failed_ops: number;
  active_delegated_users: number;
  failure_reasons: Array<{ reason: string; count: number }>;
  recent_logs: Array<{
    id: string;
    user_id: string;
    user_email?: string;
    session_id?: string;
    status: string;
    mixes_requested?: number;
    client_summary?: string;
    error_reason?: string;
    execution_time_ms?: number;
    created_at: string;
  }>;
}

export interface SecurityTamperEvent {
  id: string;
  user_id?: string;
  user_email?: string;
  device_id?: string;
  event_type: string;
  details?: string;
  action_taken: string;
  created_at: string;
}

/**
 * فحص صلاحيات الوصول لقسم VIP من السيرفر (Zero-Trust)
 */
export async function checkVipAccessServer(userId: string): Promise<VipAccessStatus> {
  try {
    const { data, error } = await supabase.rpc('check_vip_access_server', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error checking server VIP access:', error);
      return {
        is_owner: false,
        is_delegated: false,
        can_execute: false,
        block_reason: 'not_authorized',
      };
    }

    return data as VipAccessStatus;
  } catch (err) {
    console.error('Unexpected checkVipAccessServer error:', err);
    return {
      is_owner: false,
      is_delegated: false,
      can_execute: false,
      block_reason: 'not_authorized',
    };
  }
}

/**
 * تسجيل دورة VIP من السيرفر مع فرض القيود الخادمية الصارمة
 */
export async function recordVipCycleServer(params: {
  userId: string;
  sessionId: string;
  ownerPhone: string;
  childPhone: string;
  mixes: number;
  status: 'success' | 'failed';
  clientSummary: string;
  ownerDetails?: Record<string, any>;
  durationMs: number;
  errorReason?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc('record_vip_cycle_server', {
      p_user_id: params.userId,
      p_session_id: params.sessionId,
      p_owner_phone: params.ownerPhone,
      p_child_phone: params.childPhone,
      p_mixes: params.mixes,
      p_status: params.status,
      p_client_summary: params.clientSummary,
      p_owner_details: params.ownerDetails || {},
      p_duration_ms: params.durationMs,
      p_error_reason: params.errorReason || null,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      success: true,
      message: data?.message || 'تمت العملية بنجاح',
    };
  } catch (err: any) {
    console.error('Error recording cycle on server:', err);
    throw err;
  }
}

/**
 * جلب إحصائيات وتقارير المالك الشاملة (للمالك فقط)
 */
export async function getVipOwnerAnalytics(): Promise<VipOwnerAnalytics | null> {
  try {
    const { data, error } = await supabase.rpc('get_vip_owner_analytics');
    if (error) {
      console.error('Error fetching VIP analytics:', error);
      return null;
    }
    return data as VipOwnerAnalytics;
  } catch (err) {
    console.error('getVipOwnerAnalytics exception:', err);
    return null;
  }
}

/**
 * جلب قائمة المستخدمين المفوضين (للمالك فقط)
 */
export async function getDelegatedVipUsers(): Promise<DelegatedUser[]> {
  const { data, error } = await supabase
    .from('vip_delegated_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching delegated users:', error);
    return [];
  }

  return (data as DelegatedUser[]) || [];
}

/**
 * إضافة أو تحديث تفويض مستخدم (للمالك فقط)
 */
export async function saveDelegatedUser(user: {
  user_id: string;
  user_email: string;
  user_name?: string;
  is_active: boolean;
  max_daily_cycles?: number;
  max_daily_mixes?: number;
  allowed_packages?: number[];
  allow_custom_amount?: boolean;
  max_concurrent_sessions?: number;
  cooldown_seconds?: number;
  min_cooldown_seconds?: number;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cooldown = user.cooldown_seconds || user.min_cooldown_seconds || 60;
    const { error } = await supabase.from('vip_delegated_users').upsert(
      {
        user_id: user.user_id,
        user_email: user.user_email,
        user_name: user.user_name || user.user_email.split('@')[0],
        is_active: user.is_active,
        max_daily_cycles: user.max_daily_cycles ?? 10,
        max_daily_mixes: user.max_daily_mixes ?? 200000,
        allowed_packages: user.allowed_packages ?? [50000, 200000],
        allow_custom_amount: user.allow_custom_amount ?? false,
        max_concurrent_sessions: user.max_concurrent_sessions ?? 1,
        cooldown_seconds: cooldown,
        min_cooldown_seconds: cooldown,
        notes: user.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * تفعيل أو تعطيل مستخدم مفوض فوراً
 */
export async function toggleDelegatedUserStatus(
  userId: string,
  isActive: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('vip_delegated_users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return !error;
}

/**
 * حذف تفويض مستخدم بالكامل
 */
export async function deleteDelegatedUser(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('vip_delegated_users')
    .delete()
    .eq('user_id', userId);

  return !error;
}

/**
 * جلب سجلات العمليات والجلسات لـ VIP (للمالك أو للمستخدم المصرح له)
 */
export async function getVipExecutionLogs(limit = 100): Promise<VipExecutionLog[]> {
  const { data, error } = await supabase
    .from('vip_execution_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching execution logs:', error);
    return [];
  }

  return (data as VipExecutionLog[]) || [];
}

/**
 * جلب أحداث كشف التلاعب (للمالك فقط)
 */
export async function getSecurityTamperEvents(limit = 100): Promise<SecurityTamperEvent[]> {
  const { data, error } = await supabase
    .from('security_tamper_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching security tamper events:', error);
    return [];
  }

  return (data as SecurityTamperEvent[]) || [];
}

export interface RegisteredAppUser {
  id: string;
  email: string;
  phone?: string;
  full_name?: string;
  username?: string;
  role?: string;
  is_active?: boolean;
  is_already_delegated?: boolean;
}

export interface UserAuditDetails {
  profile: {
    id: string;
    email: string;
    phone?: string;
    full_name?: string;
    username?: string;
    created_at?: string;
  };
  delegation: DelegatedUser | null;
  sessions: Array<{
    id: string;
    session_name: string;
    dial_number?: string;
    owner_email?: string;
    owner_password_revealed?: string;
    individual_email?: string;
    individual_password_revealed?: string;
    operation_state: string;
    worker_status: string;
    current_cycle: number;
    target_mix_balance: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
  logs: Array<{
    id: string;
    action_type: string;
    status: string;
    owner_phone?: string;
    child_phone?: string;
    mixes_requested?: number;
    client_summary?: string;
    error_reason?: string;
    execution_time_ms?: number;
    created_at: string;
  }>;
  stats: {
    total_ops: number;
    success_ops: number;
    failed_ops: number;
    success_rate: number;
  };
}

export async function searchRegisteredAppUsers(search = ''): Promise<RegisteredAppUser[]> {
  try {
    const { data, error } = await supabase.rpc('vip_search_registered_users', {
      p_search: search.trim(),
    });
    if (error) {
      console.error('searchRegisteredAppUsers error:', error);
      return [];
    }
    return (data as RegisteredAppUser[]) || [];
  } catch (err) {
    console.error('searchRegisteredAppUsers exception:', err);
    return [];
  }
}

export async function updateVipSessionCredentials(params: {
  sessionId: string;
  ownerEmail?: string;
  ownerPassword?: string;
  childEmail?: string;
  childPassword?: string;
  dialNumber?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc('vip_update_session_credentials', {
      p_session_id: params.sessionId,
      p_owner_email: params.ownerEmail || null,
      p_owner_password: params.ownerPassword || null,
      p_individual_email: params.childEmail || null,
      p_individual_password: params.childPassword || null,
      p_dial_number: params.dialNumber || null,
    });
    if (error) throw error;
    return data || { success: true, message: 'تم التحديث بنجاح' };
  } catch (err: any) {
    console.error('updateVipSessionCredentials error:', err);
    return { success: false, message: err.message || 'فشل التحديث' };
  }
}

export async function getUserAuditFull(userId: string): Promise<UserAuditDetails | null> {
  try {
    const { data, error } = await supabase.rpc('vip_get_user_audit_full', {
      p_user_id: userId,
    });
    if (error) {
      console.error('getUserAuditFull error:', error);
      return null;
    }
    return data as UserAuditDetails;
  } catch (err) {
    console.error('getUserAuditFull exception:', err);
    return null;
  }
}
