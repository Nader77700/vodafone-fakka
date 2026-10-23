import { supabase } from '@/db/supabase';

export interface VipAccessStatus {
  is_owner: boolean;
  is_delegated: boolean;
  can_execute: boolean;
  block_reason?: 'not_authorized' | 'cooldown_active' | 'daily_limit_reached' | null;
  max_daily_cycles?: number;
  cycle_count_today?: number;
  cycles_remaining?: number;
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
  ip_address?: string;
  created_at: string;
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
  max_daily_cycles: number;
  min_cooldown_seconds: number;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('vip_delegated_users').upsert(
      {
        user_id: user.user_id,
        user_email: user.user_email,
        user_name: user.user_name || user.user_email.split('@')[0],
        is_active: user.is_active,
        max_daily_cycles: user.max_daily_cycles,
        min_cooldown_seconds: user.min_cooldown_seconds,
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
