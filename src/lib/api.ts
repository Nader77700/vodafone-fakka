// طبقة وصول البيانات — جميع استدعاءات Supabase
import { supabase } from '@/db/supabase';
import type {
  Profile, LicenseKey, Subscription, Favorite,
  Operation, Notification, SystemLog, PaginatedResult, UserStatistics
} from '@/types/types';

const DEVICE_HEADERS: Record<string, string> = {
  'User-Agent': 'okhttp/4.12.0',
  'Connection': 'Keep-Alive',
  // ❌ لا نضع Accept-Encoding: gzip يدوياً — OkHttp/CapacitorHttp يضيفه تلقائياً
  // ويفك الضغط تلقائياً. لو حددناه يدوياً تعطّل فك الضغط التلقائي (OkHttp documented behaviour)
  // مما يُرجع binary data بدل JSON → parseError = Binary Data Detected
  'x-dynatrace': 'MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21317_157',
  'x-agent-operatingsystem': '13',
  'clientId': 'AnaVodafoneAndroid',
  'Accept-Language': 'ar',
  'x-agent-device': 'LENOVO TB310XU',
  'x-agent-version': '2026.4.1',
  'x-agent-build': '1139',
  'digitalId': '25ZQ6VBSZPI1V',
  'device-id': 'e21f808017c900f3',
};

const PAGE_SIZE = 20;

// ==========================================
// الملف الشخصي
// ==========================================
export async function getProfile(userId: string): Promise<{ data: Profile | null; error: unknown | null }> {
  try {
    // استخدام دالة SECURITY DEFINER تتجاوز RLS بالكامل لضمان قراءة آمنة دائماً
    const { data, error } = await supabase.rpc('get_own_profile', { uid: userId });
    if (error) {
      console.error('[getProfile] RPC error:', error);
      return { data: null, error };
    }
    // rpc returns array — take first row
    const profile = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
    return { data: profile as Profile | null, error: null };
  } catch (e) {
    console.error('[getProfile] unexpected error:', e);
    return { data: null, error: e };
  }
}

export async function updateProfile(userId: string, updates: Partial<Pick<Profile, 'username' | 'full_name' | 'phone' | 'avatar_url'>>) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  return { error };
}

// ==========================================
// الاشتراك
// ==========================================
// ── getUserSubscription: يجلب الاشتراك ويحسب الحالة الفعلية دائماً ──────────
// لا يعتمد على القيمة المخزنة في حقل status فقط:
// - إذا كان status='active' لكن expires_at < الآن → ينتهي تلقائياً ويحدّث DB
// - إذا كانت الحصة نفدت (BY_USAGE) → ينتهي تلقائياً
// - إذا كان status='expired' لكن expires_at لا يزال مستقبلياً → يُصلح تلقائياً (timezone bug fix)
export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const now = Date.now();

  // ══ إصلاح timezone bug: status='expired' لكن expires_at مستقبلي ══
  // السبب الحقيقي: عملية إدارية أو مزامنة أخطأت في ضبط الحالة
  if (data.status === 'expired' && data.expires_at) {
    const expiresAt = new Date(data.expires_at).getTime();
    const opsExhausted = data.ops_limit != null && (data.ops_count ?? 0) >= data.ops_limit;
    if (expiresAt > now && !opsExhausted) {
      // الاشتراك لا يزال صالحاً — إصلاح DB فوراً
      await supabase.from('subscriptions').update({
        status: 'active',
        in_grace_period: false,
        grace_started_at: null,
        grace_ends_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', data.id);
      await insertSystemLog({
        user_id: userId, level: 'warning',
        action: 'auto_fix_expired_status',
        message: `إصلاح تلقائي: status=expired مع expires_at مستقبلي (${data.expires_at}) — تم إرجاعه إلى active`,
      });
      return { ...data, status: 'active', in_grace_period: false, grace_started_at: null, grace_ends_at: null };
    }
  }

  // ── فحص انتهاء الوقت: إذا status='active' لكن expires_at مضى ──
  if (data.status === 'active' && data.expires_at) {
    const expiresAt = new Date(data.expires_at).getTime();
    if (expiresAt < now) {
      // الاشتراك انتهى — أصلح DB وابدأ فترة السماح إن لم تكن بدأت
      const graceEnds = new Date(now + 60 * 60 * 1000);
      await supabase.from('subscriptions').update({
        status: 'expired',
        in_grace_period: !data.in_grace_period,
        grace_started_at: data.in_grace_period ? data.grace_started_at : new Date().toISOString(),
        grace_ends_at: data.in_grace_period ? data.grace_ends_at : graceEnds.toISOString(),
      }).eq('id', data.id);

      await syncHistoryStatus(userId, 'expired', 'duration_finished');

      return {
        ...data,
        status: 'expired',
        in_grace_period: true,
        grace_started_at: data.grace_started_at ?? new Date().toISOString(),
        grace_ends_at: data.grace_ends_at ?? graceEnds.toISOString(),
      };
    }
  }

  return data;
}

// ── validateAndSyncSubscription: محرك التحقق الشامل من صحة الاشتراك ─────────
// يُستدعى: عند فتح التطبيق، الرجوع من الخلفية، كل دقيقة، بعد كل عملية
// يفحص: انتهاء الوقت + نفاد الحصة + توافق الحالة المخزنة مع الواقع
export async function validateAndSyncSubscription(userId: string): Promise<Subscription | null> {
  // getUserSubscription تُصلح تلقائياً انتهاء الوقت
  const sub = await getUserSubscription(userId);
  if (!sub) return null;

  // إذا كانت فترة السماح انتهت → انتقل للتفعيل
  if (sub.in_grace_period && sub.grace_ends_at) {
    const graceExpired = new Date(sub.grace_ends_at).getTime() < Date.now();
    if (graceExpired && sub.status !== 'expired') {
      await supabase.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id);
      return { ...sub, status: 'expired' };
    }
  }

  return sub;
}

export interface DeviceFingerprintOptions {
  deviceFp?: string | null;
  hardwareHash?: string | null;
  nativeId?: string | null;
  adminOverride?: boolean;
}

export async function activateLicenseKey(
  userId: string,
  code: string,
  options?: DeviceFingerprintOptions,
): Promise<{ success: boolean; error?: string; errorCode?: string; isTrial?: boolean; blockerUsername?: string }> {
  // ── قبل التفعيل: احفظ الأيام المتبقية ثم سجّل الاشتراك القديم كـ replaced ──
  const { data: oldSub } = await supabase
    .from('subscriptions')
    .select('id, expires_at, duration_days')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (oldSub?.id && oldSub.expires_at) {
    const msLeft = Math.max(0, new Date(oldSub.expires_at).getTime() - Date.now());
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    await supabase.from('subscriptions')
      .update({ days_remaining: daysLeft, status: 'replaced', updated_at: new Date().toISOString() })
      .eq('id', oldSub.id);
  }
  await syncHistoryStatus(userId, 'replaced', 'replaced_by_new_subscription');

  // ── كل التفعيل يتم عبر RPC مع SECURITY DEFINER (يتجاوز RLS تمامًا) ──
  const { data, error } = await supabase.rpc('activate_license_key_v2', {
    p_user_id:        userId,
    p_code:           code,
    p_device_fp:      options?.deviceFp ?? null,
    p_hardware_hash:  options?.hardwareHash ?? null,
    p_native_id:      options?.nativeId ?? null,
    p_admin_override: options?.adminOverride ?? false,
  });
  if (error) {
    return { success: false, error: 'حدث خطأ في الاتصال — يُرجى المحاولة مجدداً', errorCode: 'SERVER_ERROR' };
  }
  const result = typeof data === 'string' ? JSON.parse(data) : data;
  return {
    success:         !!result?.success,
    error:           result?.error,
    errorCode:       result?.errorCode,
    isTrial:         !!result?.isTrial,
    blockerUsername: result?.blockerUsername,
  };
}

/** تسجيل بصمة الجهاز للمستخدم الحالي عند بدء التطبيق */
export async function registerDeviceFingerprint(userId: string, deviceFp: string): Promise<void> {
  try {
    await supabase
      .from('profiles')
      .update({ device_fp: deviceFp })
      .eq('id', userId);
  } catch { /* صامت */ }
}

// ==========================================
// فترة السماح — تعيين grace period ساعة واحدة
// ==========================================
export async function startGracePeriod(userId: string): Promise<void> {
  const now = new Date();
  const graceEnds = new Date(now.getTime() + 60 * 60 * 1000); // ساعة واحدة
  await supabase.from('subscriptions').update({
    in_grace_period: true,
    grace_started_at: now.toISOString(),
    grace_ends_at: graceEnds.toISOString(),
  }).eq('user_id', userId);
}

export async function checkGracePeriod(userId: string): Promise<{
  inGrace: boolean;
  graceEndsAt: string | null;
  graceExpired: boolean;
}> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('in_grace_period, grace_ends_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!sub?.in_grace_period) return { inGrace: false, graceEndsAt: null, graceExpired: false };
  const graceExpired = sub.grace_ends_at ? new Date(sub.grace_ends_at) < new Date() : false;
  return { inGrace: true, graceEndsAt: sub.grace_ends_at, graceExpired };
}

// ==========================================
// ==========================================
// نظام التسجيل الشامل — Logging System
// ==========================================

export type LogCategory =
  | 'activation'
  | 'subscription'
  | 'recharge'
  | 'gift'
  | 'admin'
  | 'session'
  | 'operation'
  | 'system';

export async function insertSystemLog(payload: {
  user_id?: string;
  level?: 'info' | 'warning' | 'error' | 'debug';
  action: string;
  message?: string;
  metadata?: Record<string, unknown>;
  category?: LogCategory;
}): Promise<void> {
  await supabase.from('system_logs').insert({
    user_id:    payload.user_id ?? null,
    level:      payload.level ?? 'info',
    action:     payload.action,
    message:    payload.message ?? null,
    metadata:   payload.metadata ?? null,
  }).then();
}

// ==========================================
// فحص واستهلاك العمليات — للكل (trial + paid + gift)
// ==========================================

export interface OpsCheckResult {
  allowed: boolean;          // هل مسموح بالعملية؟
  isTrial: boolean;
  exhausted: boolean;
  opsUsed: number;
  opsLimit: number | null;   // null = unlimited
  remaining: number | null;  // null = unlimited
  codeType: string;
}

export async function checkAndConsumeOperation(userId: string): Promise<OpsCheckResult> {
  // ── Atomic RPC — يحل مشكلة Race Condition نهائياً ──
  // يستخدم PostgreSQL FOR UPDATE داخل transaction واحدة
  // لا يمكن لمستخدمين في نفس الوقت استهلاك نفس العملية مرتين
  const { data, error } = await supabase.rpc('atomic_consume_operation', { p_user_id: userId });

  if (error || !data) {
    // fallback آمن عند فشل RPC
    await insertSystemLog({ user_id: userId, level: 'error', action: 'ops_consume_rpc_failed',
      message: `atomic_consume_operation فشل: ${error?.message ?? 'no data'}`, metadata: {} });
    return { allowed: false, isTrial: false, exhausted: false, opsUsed: 0, opsLimit: 0, remaining: 0, codeType: 'rpc_error' };
  }

  const r = data as {
    allowed: boolean; exhausted: boolean; ops_used: number;
    ops_limit: number | null; remaining: number | null;
    code_type: string; is_trial: boolean;
  };

  // تحقق من BY_USAGE وإنهاء الاشتراك إذا نفدت العمليات (side-effect خارج الـ RPC)
  if (r.allowed && r.exhausted) {
    // تشغيل grace period بشكل async — لا يؤخر العملية
    void (async () => {
      const { data: sub } = await supabase
        .from('subscriptions').select('id, status, license_key_id').eq('user_id', userId).eq('status', 'active').maybeSingle();
      if (!sub) return;
      const { data: key } = await supabase
        .from('license_keys').select('expiration_mode, code_type').eq('id', sub.license_key_id).maybeSingle();
      if (key?.expiration_mode !== 'BY_USAGE') return;
      const graceEnds = new Date(Date.now() + 60 * 60 * 1000);
      await supabase.from('subscriptions').update({
        status: 'expired', in_grace_period: true,
        grace_started_at: new Date().toISOString(), grace_ends_at: graceEnds.toISOString(),
      }).eq('id', sub.id);
      const endReason = r.is_trial ? 'trial_finished' : 'operations_finished';
      await syncHistoryStatus(userId, 'expired', endReason);
      await supabase.from('notifications').insert({
        user_id: userId, title: '⏳ انتهت حصتك من العمليات',
        body: 'استنفدت عدد العمليات المتاحة. لديك مهلة ساعة لتجديد اشتراكك قبل تسجيل الخروج.',
        type: 'subscription_renewal', is_read: false, is_global: false,
      });
    })();
  }

  const opsLimit: number | null = r.ops_limit === 0 ? null : r.ops_limit;
  await insertSystemLog({ user_id: userId, level: r.allowed ? 'info' : 'warning',
    action: r.allowed ? 'ops_consumed_atomic' : 'ops_exhausted',
    message: r.allowed ? `عملية مستهلكة atomically (${r.ops_used}/${opsLimit ?? '∞'})` : 'الحصة نفدت',
    metadata: { ops_used: r.ops_used, ops_limit: opsLimit, code_type: r.code_type } });

  return {
    allowed:   r.allowed,
    isTrial:   r.is_trial,
    exhausted: r.exhausted,
    opsUsed:   r.ops_used,
    opsLimit,
    remaining: r.remaining,
    codeType:  r.code_type,
  };
}

// التحقق من استهلاك الحصة التجريبية
// ==========================================
export async function checkAndIncrementTrialOps(userId: string): Promise<{
  isTrial: boolean;
  exhausted: boolean;
  opsUsed: number;
  maxOps: number;
}> {
  const result = await checkAndConsumeOperation(userId);
  return {
    isTrial:   result.isTrial,
    exhausted: result.exhausted || !result.allowed,
    opsUsed:   result.opsUsed,
    maxOps:    result.opsLimit ?? 999999,
  };
}

export async function getTrialUsageForUser(userId: string): Promise<{ opsUsed: number; maxOps: number; isTrial: boolean } | null> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('license_key_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!sub?.license_key_id) return null;

  const { data: key } = await supabase
    .from('license_keys')
    .select('code_type, max_ops_per_user')
    .eq('id', sub.license_key_id)
    .maybeSingle();
  if (!key || key.code_type !== 'trial') return null;

  const { data: usage } = await supabase
    .from('trial_usage')
    .select('ops_used')
    .eq('key_id', sub.license_key_id)
    .eq('user_id', userId)
    .maybeSingle();

  return {
    isTrial: true,
    opsUsed: usage?.ops_used ?? 0,
    maxOps: key.max_ops_per_user === 0 ? null : (key.max_ops_per_user ?? null),
  };
}



export function calcDaysRemaining(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const diff = new Date(expiresAt).getTime() - Date.now();
  // Math.floor للتوحيد مع القيمة التي تحسبها قاعدة البيانات — يمنع اختلاف 26 vs 27
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// PHASE 2: Countdown حقيقي — من expiry_date - now
export interface TimeRemaining {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  label: string;      // عرض مبسّط: "3 أيام"، "23 ساعة"، "45 دقيقة"
  labelFull: string;  // عرض كامل: "3 أيام 14 ساعة 22 دقيقة"
  expired: boolean;
}

export function calcTimeRemaining(expiresAt: string | null): TimeRemaining {
  if (!expiresAt) return { totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, label: 'Expired', labelFull: 'Expired', expired: true };
  const totalMs = new Date(expiresAt).getTime() - Date.now();
  if (totalMs <= 0) return { totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, label: 'Expired', labelFull: 'Expired', expired: true };

  const days    = Math.floor(totalMs / 86400000);
  const hours   = Math.floor((totalMs % 86400000) / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);

  // Smart label — English, hierarchical: never shows "Expired" unless truly done
  let label: string;
  if (days >= 1)       label = `${days} Day${days !== 1 ? 's' : ''}`;
  else if (hours >= 1) label = `${hours} Hour${hours !== 1 ? 's' : ''}`;
  else if (minutes >= 1) label = `${minutes} Min`;
  else                   label = `${seconds} Sec`;

  const parts: string[] = [];
  if (days > 0)    parts.push(`${days}d`);
  if (hours > 0)   parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${seconds}s`);

  return { totalMs, days, hours, minutes, seconds, label, labelFull: parts.join(' '), expired: false };
}

// ==========================================
// المفضلة
// ==========================================
export async function getFavorites(userId: string): Promise<Favorite[]> {
  const { data } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  return Array.isArray(data) ? data : [];
}

export async function addFavorite(userId: string, payload: { name?: string; phone_number: string; notes?: string }) {
  const { error } = await supabase.from('favorites').insert({ user_id: userId, ...payload });
  return { error };
}

export async function updateFavorite(id: string, payload: { name?: string; phone_number?: string; notes?: string }) {
  const { error } = await supabase.from('favorites').update(payload).eq('id', id);
  return { error };
}

export async function deleteFavorite(id: string) {
  const { error } = await supabase.from('favorites').delete().eq('id', id);
  return { error };
}

// ==========================================
// العمليات
// ==========================================
export async function getUserOperations(userId: string, page = 1): Promise<PaginatedResult<Operation>> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count } = await supabase
    .from('operations')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('performed_at', { ascending: false })
    .range(from, to);
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function insertOperation(
  payload: Omit<Operation, 'id' | 'created_at' | 'operation_number'> & { duration_ms?: number | null; api_response?: string | null; operation_source?: string | null }
): Promise<{ error: unknown; data: Operation | null }> {
  const { data, error } = await supabase
    .from('operations')
    .insert(payload as Record<string, unknown>)
    .select('*')
    .maybeSingle();
  return { error, data: data as Operation | null };
}

// ==========================================
// استرداد عملية مخصومة عند فشل التسجيل
// ==========================================
export async function refundOperation(userId: string): Promise<boolean> {
  // ── Atomic Refund — يستخدم نفس قفل FOR UPDATE لمنع Race Condition ──
  const { error } = await supabase.rpc('atomic_refund_operation', { p_user_id: userId });
  if (!error) {
    await insertSystemLog({ user_id: userId, level: 'warning', action: 'ops_refunded', message: 'تم استرداد العملية atomically بسبب فشل التسجيل' });
  }
  return !error;
}

// ==========================================
// الإشعارات
// ==========================================
export async function getUserNotifications(userId: string, userCreatedAt?: string): Promise<Notification[]> {
  // فلتر: نعرض فقط الإشعارات التي أُنشئت بعد تسجيل المستخدم — يمنع ظهور إشعارات قديمة لمستخدمين جدد
  const sinceDate = userCreatedAt ?? new Date(0).toISOString();
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .or(`user_id.eq.${userId},is_global.eq.true`)
    .is('deleted_at', null)
    .gte('created_at', sinceDate)
    .order('created_at', { ascending: false })
    .limit(100);
  return Array.isArray(data) ? data : [];
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

export async function markAllNotificationsRead(userId: string) {
  await supabase.rpc('mark_all_notifications_read', { p_user_id: userId });
  return { error: null };
}

export async function softDeleteNotification(id: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

export async function softDeleteAllNotifications(userId: string) {
  await supabase.rpc('soft_delete_all_notifications', { p_user_id: userId });
  return { error: null };
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { data } = await supabase.rpc('get_unread_notifications_count', { p_user_id: userId });
  return (data as number) ?? 0;
}

// التحقق من إرسال إشعار تحذير انتهاء الاشتراك اليوم مسبقاً
export async function getExpiryNotificationSentToday(userId: string): Promise<boolean> {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'subscription_renewal')
    .ilike('title', '%ينتهي اشتراكك%')
    .gte('created_at', todayStart.toISOString())
    .lte('created_at', todayEnd.toISOString())
    .maybeSingle();
  return !!data;
}

// ==========================================
// الإحصائيات
// ==========================================
export async function getUserStatistics(userId: string): Promise<UserStatistics> {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

  // جلب جميع العمليات للمستخدم (بحد أقصى 500)
  const { data: allOps } = await supabase
    .from('operations')
    .select('id, performed_at, status, amount, phone_number, card_type, category, operation_number, created_at, card_data, error_message, user_id, duration_ms, api_response')
    .eq('user_id', userId)
    .order('performed_at', { ascending: false })
    .limit(500);

  const ops: Operation[] = Array.isArray(allOps) ? (allOps as unknown as Operation[]) : [];

  // إصلاح الإحصائيات: العمليات الفاشلة لا تدخل في الإجماليات
  const successOps = ops.filter(o => o.status === 'success');
  const total_operations = ops.length;
  const total_cards = successOps.length;
  const total_amount = successOps.reduce((s, o) => s + (o.amount ?? 0), 0);
  const unique_phones = new Set(ops.map(o => o.phone_number)).size;
  const today_operations = ops.filter(o => new Date(o.performed_at) >= todayStart).length;
  const week_operations = ops.filter(o => new Date(o.performed_at) >= weekStart).length;
  const month_operations = ops.filter(o => new Date(o.performed_at) >= monthStart).length;
  const last_operation = ops[0] ?? null;

  // بيانات الرسم البياني اليومي (آخر 7 أيام)
  const daily_chart: { date: string; count: number; amount: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dayOps = ops.filter(o => {
      const t = new Date(o.performed_at);
      return t >= d && t < next;
    });
    daily_chart.push({
      date: d.toLocaleDateString('en-GB', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      count: dayOps.length,
      amount: dayOps.reduce((s, o) => s + (o.amount ?? 0), 0),
    });
  }

  return { total_operations, total_cards, total_amount, unique_phones, today_operations, week_operations, month_operations, last_operation, daily_chart };
}
export async function getAllProfiles(page = 1, search = ''): Promise<PaginatedResult<Profile>> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (search) query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`);
  const { data, count } = await query;
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function updateUserRole(userId: string, role: string) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  return { error };
}

export async function toggleUserActive(userId: string, is_active: boolean) {
  const { error } = await supabase.from('profiles').update({ is_active }).eq('id', userId);
  return { error };
}

// ==========================================
// سجل الاشتراكات التاريخي
// ==========================================
export interface SubscriptionHistoryEntry {
  id: string;
  user_id: string;
  license_key_id: string | null;
  code: string | null;
  code_type: string;
  duration_days: number;
  days_before: number;
  days_after: number;
  activated_at: string;
  expires_at: string;
  notes: string | null;
  created_at: string;
  // حقول الحالة الجديدة
  status: 'active' | 'expired' | 'cancelled' | 'replaced' | 'pending' | 'suspended';
  end_reason: 'operations_finished' | 'duration_finished' | 'cancelled_by_admin' | 'replaced_by_new_subscription' | 'manual_cancel' | 'trial_finished' | null;
  // PHASE 32: حقول العمليات الاحترافية
  operation_type?: string | null;
  suspend_reason?: string | null;
  cancel_reason?:  string | null;
  replace_reason?: string | null;
  performed_by?:   string | null;
  performed_by_name?: string | null;
  days_remaining_at_end?: number | null;
}

export async function getSubscriptionHistory(userId: string): Promise<SubscriptionHistoryEntry[]> {
  const { data } = await supabase
    .from('subscription_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return Array.isArray(data) ? data : [];
}

// ── مساعد داخلي: تحديث حالة كل سجلات التاريخ النشطة لمستخدم ─────────────────────
async function syncHistoryStatus(
  userId: string,
  newStatus: SubscriptionHistoryEntry['status'],
  endReason: SubscriptionHistoryEntry['end_reason'],
): Promise<void> {
  await supabase
    .from('subscription_history')
    .update({ status: newStatus, end_reason: endReason })
    .eq('user_id', userId)
    .eq('status', 'active');
}

/**
 * syncHistoryOnLoad — تُستدعى عند فتح صفحة سجل الاشتراكات.
 * تفحص الاشتراك الحالي في DB وتُزامن سجل التاريخ إذا كان غير متزامن.
 * SSOT: الحالة تُحسب من subscriptions + operations — لا من التاريخ وحده.
 */
export async function syncHistoryOnLoad(userId: string): Promise<void> {
  try {
    // 1. اقرأ الاشتراك الحالي من DB
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, status, expires_at, code_type')
      .eq('user_id', userId)
      .order('activated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) return; // لا اشتراك → لا تزامن مطلوب

    // 2. إذا الاشتراك ملغي أو منتهي في DB → حدّث السجل بالسبب الصحيح
    if (sub.status === 'cancelled') {
      await syncHistoryStatus(userId, 'cancelled', 'cancelled_by_admin');
      return;
    }

    if (sub.status === 'expired') {
      await syncHistoryStatus(userId, 'expired', 'duration_finished');
      return;
    }

    if (sub.status === 'replaced') {
      await syncHistoryStatus(userId, 'replaced', 'replaced_by_new_subscription');
      return;
    }

    // 3. إذا الاشتراك "active" في DB لكن expires_at انتهى → duration_finished
    if (sub.status === 'active' && sub.expires_at) {
      const expired = new Date(sub.expires_at).getTime() < Date.now();
      if (expired) {
        // حدّث subscriptions أولاً ثم التاريخ
        await supabase.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id);
        await syncHistoryStatus(userId, 'expired', 'duration_finished');
        return;
      }
    }

    // 4. إذا الاشتراك "active" لكن نفدت العمليات → operations_finished
    if (sub.status === 'active') {
      const { data: ops } = await supabase
        .from('subscription_operations')
        .select('ops_used, ops_limit')
        .eq('subscription_id', sub.id)
        .maybeSingle();

      if (ops && ops.ops_limit !== null && ops.ops_used >= ops.ops_limit) {
        const isTrial = sub.code_type === 'trial';
        await syncHistoryStatus(userId, 'expired', isTrial ? 'trial_finished' : 'operations_finished');
      }
    }
  } catch {
    // صامت — عدم التزامن أفضل من كراش الصفحة
  }
}
// ==========================================
// PHASE 2+3: معلومات العمليات + نوع الاشتراك
// ==========================================

export interface SubscriptionOpsInfo {
  opsUsed: number;
  opsLimit: number | null;  // null = ♾️ غير محدود
  codeType: 'paid' | 'trial' | 'gift' | 'unknown' | 'admin';
  isExhaustedByUsage: boolean; // true → نفدت الحصة وانتهاء الاشتراك فوري
  expirationMode: string | null;
  planLabel: string;           // اسم الخطة المعروض للمستخدم (عربي)
  durationDays: number | null; // مدة الاشتراك بالأيام
}

// ── دالة مساعدة: اشتق اسم الخطة من نوع الكود والمدة ─────────────────────────
export function derivePlanLabel(codeType: string, durationDays: number | null): string {
  if (codeType === 'admin')   return 'مسؤول النظام';
  if (codeType === 'trial')   return 'تجريبي';
  if (codeType === 'gift')    return 'هدية';
  // paid: اشتق الاسم من المدة
  if (durationDays === 10)  return '10 أيام';
  if (durationDays === 15)  return '15 يوم';
  if (durationDays === 30)  return 'شهري';
  if (durationDays === 40)  return '40 يوم';
  if (durationDays === 60)  return 'شهرين';
  if (durationDays != null && durationDays > 60)  return 'بريميوم';
  if (durationDays != null) return `${durationDays} يوم`;
  return 'بريميوم';
}

export async function getSubscriptionOpsInfo(userId: string): Promise<SubscriptionOpsInfo | null> {
  const sub = await getUserSubscription(userId);
  if (!sub || sub.status !== 'active') return null;

  if (!sub.license_key_id) {
    return {
      opsUsed: sub.ops_count ?? 0, opsLimit: null, codeType: 'admin',
      isExhaustedByUsage: false, expirationMode: null,
      planLabel: 'مسؤول النظام', durationDays: null,
    };
  }

  const { data: key } = await supabase
    .from('license_keys')
    .select('code_type, max_ops_per_user, uses_per_user, operations_per_user, expiration_mode, duration_days')
    .eq('id', sub.license_key_id)
    .maybeSingle();

  // ══ قراءة ops_limit: أولوية subscriptions.ops_limit (مملوء الآن بـ DB trigger)
  // fallback إلى license_keys.operations_per_user لضمان التوافق مع البيانات القديمة
  const subOpsLimit: number | null = sub.ops_limit ?? null;
  const keyOpsRaw: number | null   = (key?.operations_per_user ?? key?.max_ops_per_user) ?? null;
  const rawOpsLimit: number | null = subOpsLimit ?? keyOpsRaw;
  // القاعدة: 0 = غير محدود تماماً مثل NULL
  const opsLimit: number | null = (rawOpsLimit === 0 || rawOpsLimit === null) ? null : rawOpsLimit;

  const codeType = (key?.code_type as SubscriptionOpsInfo['codeType']) ?? 'unknown';
  const expirationMode = key?.expiration_mode ?? null;
  const durationDays: number | null = key?.duration_days ?? null;
  const isByUsage = expirationMode === 'BY_USAGE';
  const planLabel = derivePlanLabel(codeType, durationDays);

  // للتجريبي: اقرأ trial_usage
  if (codeType === 'trial') {
    const { data: usage } = await supabase
      .from('trial_usage')
      .select('ops_used')
      .eq('key_id', sub.license_key_id)
      .eq('user_id', userId)
      .maybeSingle();
    const opsUsed = usage?.ops_used ?? 0;
    const isExhaustedByUsage = isByUsage && opsLimit !== null && opsUsed >= opsLimit;
    if (isExhaustedByUsage) {
      const graceEnds = new Date(Date.now() + 60 * 60 * 1000);
      await supabase.from('subscriptions').update({
        status: 'expired', in_grace_period: true,
        grace_started_at: new Date().toISOString(),
        grace_ends_at: graceEnds.toISOString(),
      }).eq('id', sub.id);
    }
    return { opsUsed, opsLimit, codeType, isExhaustedByUsage, expirationMode, planLabel, durationDays };
  }

  const opsUsed = sub.ops_count ?? 0;
  const isExhaustedByUsage = isByUsage && opsLimit !== null && opsUsed >= opsLimit;
  if (isExhaustedByUsage) {
    const graceEnds = new Date(Date.now() + 60 * 60 * 1000);
    await supabase.from('subscriptions').update({
      status: 'expired', in_grace_period: true,
      grace_started_at: new Date().toISOString(),
      grace_ends_at: graceEnds.toISOString(),
    }).eq('id', sub.id);
  }
  return { opsUsed, opsLimit, codeType, isExhaustedByUsage, expirationMode, planLabel, durationDays };
}

// ==========================================
// سجل النشاط (Activity Timeline)
// ==========================================
export interface ActivityEntry {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function getActivityTimeline(userId: string, limit = 30): Promise<ActivityEntry[]> {
  const { data } = await supabase
    .from('activity_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data : [];
}

export async function logActivity(userId: string, event_type: string, title: string, description?: string, metadata?: Record<string, unknown>) {
  await supabase.from('activity_log').insert({ user_id: userId, event_type, title, description, metadata });
}

// ==========================================
// تنفيذ طلبات فودافون فكة ومارد
// ==========================================

const BRIDGE_URL = 'http://localhost:8765';

/** فحص إذا كان الجسر المحلي شغال على الموبايل */
export async function checkLocalBridge(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/ping`, { method: 'GET', signal: AbortSignal.timeout(2000) });
    const d = await res.json();
    return !!d?.ok;
  } catch {
    return false;
  }
}

/** هل التطبيق شغال كـ APK native على Android؟ */
function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } })?.Capacitor;
  return typeof cap !== 'undefined' && cap?.getPlatform?.() === 'android';
}

/** تنفيذ الشحن مباشرة من التطبيق (APK native) — بيستخدم CapacitorHttp المدمج */
// ── مساعد: تحليل استجابة CapacitorHttp (يدعم GZIP التلقائي + object + string) ──
function parseCapacitorData(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  // CapacitorHttp يفك ضغط GZIP تلقائياً — data تأتي كـ object أو string
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // إذا كان الرد JSON مُفسَّر مسبقاً كـ string (حالة نادرة)
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { return null; }
    }
    return null;
  }
  return null;
}

/**
 * تنفيذ الشحن من التطبيق الأصلي (APK) —
 * نفس منطق vodafone_bridge.py بالضبط، خطوة بخطوة، بدون أي تعديل أو إعادة محاولة
 */
export interface ResponseInspect {
  requestUrl: string;
  requestMethod: string;
  requestStartedAt: string;
  responseReceivedAt: string;
  httpStatus: number;
  headers: Record<string, string>;
  contentType: string;
  contentEncoding: string;
  contentLength: number;
  rawLength: number;
  rawFirst5000: string;
  rawBase64: string;
  detectedFormat: string;
  parseError: string;
  parsedJson: Record<string, unknown> | null;
  topLevelKeys: string[];
  tokenCandidates: Record<string, string | null>;
  tokenExtractedAt: string;
  tokenExtractedFrom: string;
}

export interface ChargeDebugStep {
  step: number;
  label: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
  raw?: string;
  inspect?: ResponseInspect;
}

// ── Full response inspector — safe base64 encoding ──
function safeBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str.slice(0, 2000))));
  } catch {
    try { return btoa(str.slice(0, 2000)); } catch { return '[base64 encode failed]'; }
  }
}

// ── Detect response format ──
function detectFormat(raw: string, headers: Record<string, string>): string {
  const ct = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
  const ce = (headers['content-encoding'] || headers['Content-Encoding'] || '').toLowerCase();
  if (ce.includes('gzip')) return 'GZIP compressed';
  if (ce.includes('deflate')) return 'Deflate compressed';
  if (ct.includes('application/json')) return 'JSON (content-type)';
  if (ct.includes('text/html')) return 'HTML';
  if (ct.includes('text/plain')) return 'Plain text';
  // heuristic checks on raw content
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'JSON (heuristic)';
  if (trimmed.startsWith('<')) return 'HTML/XML';
  // check for high proportion of non-printable bytes
  let nonPrint = 0;
  for (let i = 0; i < Math.min(raw.length, 200); i++) {
    const c = raw.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) nonPrint++;
  }
  if (nonPrint > 10) return `BINARY/COMPRESSED (${nonPrint} non-printable chars in first 200)`;
  return 'UNKNOWN';
}

// ── Try all token candidate field names ──
function extractTokenCandidates(obj: Record<string, unknown> | null): Record<string, string | null> {
  const fields = [
    'token', 'Token', 'TOKEN',
    'access_token', 'accessToken',
    'seamlessToken', 'seamless_token',
    'sessionToken', 'session_token',
    'authToken', 'auth_token',
    'id_token', 'refresh_token',
    'bearer', 'Bearer',
  ];
  const result: Record<string, string | null> = {};
  for (const f of fields) {
    const v = obj?.[f];
    result[f] = typeof v === 'string' ? v : null;
  }
  return result;
}

// ── Build full ResponseInspect for a CapacitorHttp response ──
function buildInspect(
  url: string,
  method: string,
  startedAt: string,
  receivedAt: string,
  status: number,
  headers: Record<string, string>,
  rawData: unknown,
): ResponseInspect {
  const ct = headers['content-type'] || headers['Content-Type'] || '';
  const ce = headers['content-encoding'] || headers['Content-Encoding'] || '';
  const cl = parseInt(headers['content-length'] || headers['Content-Length'] || '0', 10);

  // ── Phase 3 Fix: CapacitorHttp يفك GZIP تلقائياً ──
  // data تأتي كـ object مُفسَّر مسبقاً (أو string إذا كان Content-Type غير JSON)
  // ⚠️ لا نحتاج فك ضغط يدوي — لكن نحتاج التعامل الصحيح مع كل نوع
  let parsedJson: Record<string, unknown> | null = null;
  let parseError = '';
  let rawStr = '';

  if (rawData === null || rawData === undefined) {
    rawStr = '';
    parseError = 'Response body is null/undefined';
  } else if (typeof rawData === 'object' && !Array.isArray(rawData)) {
    // ✅ الحالة الطبيعية: CapacitorHttp أرجع JSON object جاهز
    parsedJson = rawData as Record<string, unknown>;
    rawStr = JSON.stringify(rawData);
    parseError = '';
  } else if (typeof rawData === 'string') {
    rawStr = rawData;
    const trimmed = rawData.trim();
    if (!trimmed) {
      parseError = 'Response body is empty string';
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsedJson = JSON.parse(trimmed);
      } catch (e) {
        parseError = e instanceof Error ? `JSON parse failed: ${e.message}` : String(e);
      }
    } else if (trimmed.startsWith('<')) {
      parseError = `HTML/XML response — not JSON (starts with <). Possible redirect to login page.`;
    } else {
      // فحص بيانات ثنائية (GZIP لم يُفك — حالة نادرة مع CapacitorHttp)
      let nonPrint = 0;
      for (let i = 0; i < Math.min(rawData.length, 200); i++) {
        const c = rawData.charCodeAt(i);
        if (c < 32 && c !== 9 && c !== 10 && c !== 13) nonPrint++;
      }
      if (nonPrint > 10) {
        parseError = `BINARY data detected (${nonPrint} non-printable in first 200 chars). GZIP not auto-decompressed by CapacitorHttp. Remove Accept-Encoding:gzip or add manual decompression.`;
      } else {
        parseError = `Unknown text format (not JSON, HTML, or binary). First 50 chars: ${rawData.slice(0, 50)}`;
      }
    }
  } else {
    rawStr = String(rawData);
    parseError = `Unexpected rawData type: ${typeof rawData}`;
  }

  const format = detectFormat(rawStr, headers);
  const candidates = extractTokenCandidates(parsedJson);
  const extracted = Object.entries(candidates).find(([, v]) => v !== null);

  return {
    requestUrl: url,
    requestMethod: method,
    requestStartedAt: startedAt,
    responseReceivedAt: receivedAt,
    httpStatus: status,
    headers,
    contentType: ct,
    contentEncoding: ce,
    contentLength: cl,
    rawLength: rawStr.length,
    rawFirst5000: rawStr.slice(0, 5000),
    rawBase64: safeBase64(rawStr),
    detectedFormat: format,
    parseError,
    parsedJson,
    topLevelKeys: parsedJson ? Object.keys(parsedJson) : [],
    tokenCandidates: candidates,
    tokenExtractedAt: extracted ? new Date().toISOString() : '',
    tokenExtractedFrom: extracted ? extracted[0] : 'NONE',
  };
}

/**
 * executeNativeVodafoneOrder v3 — Phase 4 Full Token Extraction Trace
 * كل خطوة موثقة بالكامل مع سبب الفشل الحقيقي
 */
async function executeNativeVodafoneOrder(payload: {
  product_id: string;
  receiver: string;
  pin: string;
  sender: string;
}): Promise<{ success: boolean; error?: string; debugSteps?: ChargeDebugStep[] }> {
  const steps: ChargeDebugStep[] = [];
  const devLog = import.meta.env.DEV ? console.log : () => {};
  const log = (step: number, label: string, status: 'pass' | 'fail' | 'skip', detail: string, raw?: string, inspect?: ResponseInspect) => {
    steps.push({ step, label, status, detail, raw, inspect });
    devLog(`[vf-debug] Step ${step} [${status.toUpperCase()}] ${label}: ${detail}${raw ? ' | raw=' + raw.slice(0, 200) : ''}`);
  };

  try {
    // ── فحص WiFi قبل البدء — Seamless يحتاج مسار بيانات Vodafone المباشر ──
    try {
      const { VodafoneDetector } = await import('./vodafoneDetector');
      const netInfo = await VodafoneDetector.getNetworkInfo();

      // تحقق أن البلوجن يعمل native فعلاً (وليس web fallback)
      // Web fallback يُرجع activeDataSimOperator = 'غير متوفر (ويب)' وisWifiActive=navigator.onLine دائماً
      const isWebFallback = netInfo.activeDataSimOperator.includes('ويب')
        || netInfo.deviceModel === 'متصفح ويب'
        || (!netInfo.hasPhonePermission && netInfo.activeDataSubId === -1 && netInfo.activeDataSimOperator === '');

      if (isWebFallback) {
        // لا نعتمد على بيانات web fallback لاتخاذ قرار الحجب — متابعة
        log(0, 'Network Pre-Check', 'skip', 'VodafoneDetector web fallback — تخطي فحص WiFi، متابعة الطلب');
      } else if (netInfo.isWifiActive && !netInfo.isMobileDataActive) {
        // WiFi فقط بدون Mobile Data — Seamless لن يعمل
        log(0, 'Network Pre-Check', 'fail', `WiFi فقط بدون Mobile Data — seamless سيفشل`);
        return {
          success: false,
          error: '📡 يرجى تشغيل بيانات Vodafone.\nأوقف الـ WiFi أو فعّل بيانات الجوال وأعد المحاولة.',
          debugSteps: steps,
        };
      } else if (netInfo.isWifiActive && netInfo.isMobileDataActive) {
        // WiFi + بيانات معاً — Android يوجّه عبر WiFi → يمنع Seamless
        log(0, 'Network Pre-Check', 'fail', `WiFi مفعّل مع Mobile Data — Android يوجّه عبر WiFi`);
        return {
          success: false,
          error: '📶 يرجى إيقاف الـ WiFi تماماً.\n\nالشحن يحتاج بيانات Vodafone المباشرة — أوقف الـ WiFi من الإعدادات ثم أعد المحاولة.',
          debugSteps: steps,
        };
      } else {
        log(0, 'Network Pre-Check', 'pass', `Mobile Data فقط: ${netInfo.activeNetwork} | WiFi: ${netInfo.isWifiActive} | op=${netInfo.activeDataSimOperatorName}`);
      }
    } catch {
      log(0, 'Network Pre-Check', 'skip', 'تعذّر جلب معلومات الشبكة — متابعة بدون فحص');
    }

    const { CapacitorHttp } = await import('@capacitor/core');
    log(1, 'CapacitorHttp Import', 'pass', 'Plugin loaded OK');

    // ── Step 1: seamless token — مع إعادة المحاولة تلقائياً (3 محاولات × 2 ثانية) ──
    let seamlessToken: string | null = null;
    let senderMsisdn: string = payload.sender;
    let seamlessHttpStatus = 0;
    let seamlessRaw = '';
    let seamlessInspect: ResponseInspect | undefined;

    const SEAMLESS_URL = 'http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth?client_id=ana-vodafone-app-seamless';
    const MAX_SEAMLESS_RETRIES = 3;
    const SEAMLESS_RETRY_DELAY_MS = 2000;

    for (let seamlessAttempt = 1; seamlessAttempt <= MAX_SEAMLESS_RETRIES; seamlessAttempt++) {
      // تأخير بين المحاولات (ما عدا الأولى)
      if (seamlessAttempt > 1) {
        log(0, `Seamless Retry`, 'skip', `محاولة ${seamlessAttempt}/${MAX_SEAMLESS_RETRIES} — انتظار ${SEAMLESS_RETRY_DELAY_MS}ms`);
        await new Promise(r => setTimeout(r, SEAMLESS_RETRY_DELAY_MS));
      }

      try {
        const step1StartedAt = new Date().toISOString();

        // ── Phase 4: Full Trace — Request ──
        devLog(`[vf-trace] ═══════════════════════ STEP 1 — SEAMLESS TOKEN (attempt ${seamlessAttempt}) ═══════════════════════`);
        devLog(`[vf-trace] REQUEST_STARTED_AT : ${step1StartedAt}`);
        devLog(`[vf-trace] URL                : ${SEAMLESS_URL}`);
        devLog(`[vf-trace] METHOD             : GET`);
        devLog(`[vf-trace] HEADERS            :`, JSON.stringify(DEVICE_HEADERS));

        const seamlessRes = await CapacitorHttp.request({
          method: 'GET',
          url: SEAMLESS_URL,
          headers: DEVICE_HEADERS,
          readTimeout: 15000,
          connectTimeout: 15000,
        });

        const step1ReceivedAt = new Date().toISOString();
        seamlessHttpStatus = seamlessRes.status ?? 0;
        const seamlessHeaders: Record<string, string> = (seamlessRes.headers as Record<string, string>) ?? {};

        // ── Phase 4: Full Trace — Response ──
        devLog(`[vf-trace] RESPONSE_RECEIVED_AT: ${step1ReceivedAt}`);
        devLog(`[vf-trace] HTTP_STATUS         : ${seamlessHttpStatus}`);
        devLog(`[vf-trace] CONTENT_TYPE        : ${seamlessHeaders['content-type'] || seamlessHeaders['Content-Type'] || '(none)'}`);
        devLog(`[vf-trace] CONTENT_ENCODING    : ${seamlessHeaders['content-encoding'] || seamlessHeaders['Content-Encoding'] || '(none)'}`);
        devLog(`[vf-trace] CONTENT_LENGTH      : ${seamlessHeaders['content-length'] || seamlessHeaders['Content-Length'] || '(not set)'}`);
        devLog(`[vf-trace] DATA_TYPE           : ${typeof seamlessRes.data}`);
        devLog(`[vf-trace] DATA_CONSTRUCTOR    : ${seamlessRes.data?.constructor?.name ?? 'n/a'}`);
        devLog(`[vf-trace] DATA_IS_ARRAY       : ${Array.isArray(seamlessRes.data)}`);

        // Full response inspector (Phase 3 fix applied)
        seamlessInspect = buildInspect(
          SEAMLESS_URL, 'GET', step1StartedAt, step1ReceivedAt,
          seamlessHttpStatus, seamlessHeaders, seamlessRes.data
        );

        // ── Phase 4: Full Trace — Parse Results ──
        devLog(`[vf-trace] DETECTED_FORMAT     : ${seamlessInspect.detectedFormat}`);
        devLog(`[vf-trace] RAW_LENGTH          : ${seamlessInspect.rawLength} chars`);
        devLog(`[vf-trace] RAW_FIRST_200       : ${seamlessInspect.rawFirst5000.slice(0, 200)}`);
        devLog(`[vf-trace] PARSE_ERROR         : ${seamlessInspect.parseError || 'none'}`);
        devLog(`[vf-trace] TOP_LEVEL_KEYS      : [${seamlessInspect.topLevelKeys.join(', ')}]`);
        devLog(`[vf-trace] TOKEN_CANDIDATES    :`, JSON.stringify(seamlessInspect.tokenCandidates));

        seamlessRaw = seamlessInspect.rawFirst5000;

        // ── Phase 4: Token Extraction with explicit priority trace ──
        const candidates = seamlessInspect.tokenCandidates;
        const TOKEN_PRIORITY = [
          'seamlessToken', 'token', 'Token', 'TOKEN',
          'access_token', 'accessToken',
          'sessionToken', 'session_token',
          'authToken', 'auth_token',
        ] as const;

        for (const field of TOKEN_PRIORITY) {
          const val = candidates[field];
          if (val !== null && val !== undefined) {
            seamlessToken = val;
            devLog(`[vf-trace] TOKEN_FOUND_IN      : ${field}`);
            devLog(`[vf-trace] TOKEN_VALUE_LENGTH  : ${val.length}`);
            devLog(`[vf-trace] TOKEN_FIRST_20      : ${val.slice(0, 20)}…`);
            break;
          }
          devLog(`[vf-trace] TOKEN_FIELD_NULL    : ${field}`);
        }

        if (!seamlessToken) {
          devLog(`[vf-trace] FINAL_TOKEN         : NULL`);
          devLog(`[vf-trace] FAILURE_REASON      : ${seamlessInspect.parseError || 'All token fields are null in parsed JSON'}`);
        } else {
          devLog(`[vf-trace] FINAL_TOKEN         : EXTRACTED from ${seamlessInspect.tokenExtractedFrom}`);
        }

        if (seamlessInspect.parsedJson?.msisdn) {
          senderMsisdn = String(seamlessInspect.parsedJson.msisdn);
        }

        if (seamlessToken) {
          const extractedAt = new Date().toISOString();
          devLog(`[vf-trace] TOKEN_EXTRACTED_AT  : ${extractedAt}`);
          log(1, 'Seamless Token', 'pass',
            `HTTP ${seamlessHttpStatus} | attempt=${seamlessAttempt} | format=${seamlessInspect.detectedFormat} | token_len=${seamlessToken.length} | from=${seamlessInspect.tokenExtractedFrom} | msisdn=${senderMsisdn}`,
            seamlessRaw, seamlessInspect);
          break; // ✅ تم الحصول على التوكن — اخرج من حلقة الـ retry
        }

        // فشل استخراج التوكن — هل نعيد المحاولة؟
        const pErr = seamlessInspect.parseError || '';
        const isRetryable = seamlessHttpStatus === 0 || seamlessHttpStatus >= 500 ||
          pErr.toLowerCase().includes('binary') || pErr.toLowerCase().includes('gzip');

        log(1, 'Seamless Token', 'fail',
          `HTTP ${seamlessHttpStatus} | attempt=${seamlessAttempt}/${MAX_SEAMLESS_RETRIES} | retryable=${isRetryable} | format=${seamlessInspect.detectedFormat} | parseErr=${pErr || 'none'}`,
          seamlessRaw, seamlessInspect);

        if (!isRetryable || seamlessAttempt === MAX_SEAMLESS_RETRIES) {
          // خطأ غير قابل للاسترداد أو استنفدنا المحاولات → اخرج برسالة دقيقة
          let seamlessErrMsg: string;
          if (pErr.toLowerCase().includes('binary') || pErr.toLowerCase().includes('gzip') || pErr.toLowerCase().includes('compress')) {
            seamlessErrMsg = '⚠️ خطأ مؤقت في خادم Vodafone (بيانات مضغوطة).\nجارٍ إعادة المحاولة تلقائياً — أو أعد المحاولة يدوياً.';
          } else if (pErr.toLowerCase().includes('html') || pErr.toLowerCase().includes('redirect')) {
            seamlessErrMsg = '🔄 انتهت الجلسة أو تم التحويل.\nأغلق التطبيق وأعد تشغيله.';
          } else if (seamlessHttpStatus === 0 || seamlessHttpStatus >= 500) {
            seamlessErrMsg = `⚠️ خادم Vodafone لا يستجيب (HTTP ${seamlessHttpStatus}).\nالشبكة تعمل ✓ — المشكلة من جانب Vodafone، أعد المحاولة بعد لحظات.`;
          } else if (seamlessHttpStatus === 401 || seamlessHttpStatus === 403) {
            seamlessErrMsg = '🔒 رفض Vodafone التحقق — الشريحة غير نشطة أو الجلسة انتهت.\nأعد تشغيل بيانات الجوال وحاول مجدداً.';
          } else {
            seamlessErrMsg = `🔄 تعذّر الحصول على رمز المصادقة من Vodafone.\nيرجى إعادة المحاولة. (HTTP ${seamlessHttpStatus})`;
          }
          return { success: false, error: seamlessErrMsg, debugSteps: steps };
        }
        // isRetryable && هناك محاولات متبقية → تابع الحلقة
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(1, 'Seamless Token', 'fail', `Network error (attempt ${seamlessAttempt}/${MAX_SEAMLESS_RETRIES}): ${msg}`);

        if (seamlessAttempt === MAX_SEAMLESS_RETRIES) {
          return {
            success: false,
            error: '📡 تعذّر الاتصال بخادم Vodafone.\nتأكد من تشغيل بيانات الجوال (ليس WiFi) ثم أعد المحاولة.',
            debugSteps: steps,
          };
        }
        // استمر في الحلقة للمحاولة التالية
      }
    } // end seamless retry loop

    // إذا لم نحصل على توكن بعد كل المحاولات
    if (!seamlessToken) {
      return {
        success: false,
        error: '⚠️ فشل التحقق من شبكة Vodafone بعد 3 محاولات.\nتأكد من تشغيل بيانات الجوال وأعد المحاولة.',
        debugSteps: steps,
      };
    }

    // ── Step 2: access token ──
    let accessToken: string | null = null;
    let tokenHttpStatus = 0;
    let tokenRaw = '';

    try {
      const tokenRes = await CapacitorHttp.request({
        method: 'POST',
        url: 'https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token',
        headers: {
          ...DEVICE_HEADERS,
          'Accept': 'application/json, text/plain, */*',
          'silentLogin': 'true',
          'seamlessToken': seamlessToken,
          'firstTimeLogin': 'true',
          'x-dynatrace': 'MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21520_165',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: new URLSearchParams({
          grant_type: 'password',
          client_secret: 'b86e30a8-ae29-467a-a71f-65c73f2ff5e3',
          client_id: 'cash-app',
        }).toString(),
        readTimeout: 15000,
        connectTimeout: 15000,
      });
      tokenHttpStatus = tokenRes.status ?? 0;
      tokenRaw = typeof tokenRes.data === 'string'
        ? tokenRes.data.slice(0, 500)
        : JSON.stringify(tokenRes.data ?? '').slice(0, 500);
      const tokenData = parseCapacitorData(tokenRes.data);
      accessToken = (tokenData?.access_token as string) ?? null;

      if (accessToken) {
        log(2, 'Access Token', 'pass',
          `HTTP ${tokenHttpStatus} — token=${accessToken.slice(0, 20)}…`,
          tokenRaw);
      } else {
        log(2, 'Access Token', 'fail',
          `HTTP ${tokenHttpStatus} — access_token is NULL. Keys: [${Object.keys(parseCapacitorData(tokenRes.data) ?? {}).join(', ')}]`,
          tokenRaw);
        return {
          success: false,
          error: '❌ فشل المصادقة — الرقم السري غير صحيح أو انتهت الجلسة.\nتحقق من رقم سري Vodafone Cash (6 أرقام) وأعد المحاولة.',
          debugSteps: steps,
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(2, 'Access Token', 'fail', `Network error: ${msg}`);
      return {
        success: false,
        error: '❌ فشل المصادقة — الرقم السري غير صحيح أو انتهت الجلسة.',
        debugSteps: steps,
      };
    }

    // ── Step 3: productOrder ──
    const msisdnStr = String(senderMsisdn);
    const formatted = msisdnStr.startsWith('0') ? msisdnStr : `0${msisdnStr}`;
    log(3, 'MSISDN Format', 'pass', `sender=${msisdnStr} → formatted=${formatted}`);

    const orderPayload = {
      channel: { name: 'MobileApp' },
      orderItem: [{
        action: 'insert',
        id: payload.product_id,
        product: {
          characteristic: [
            { name: 'PaymentMethod', value: 'VFCash' },
            { name: 'USE_EMONEY',    value: 'False' },
            { name: 'MerchantCode',  value: '' },
          ],
          id: payload.product_id,
          relatedParty: [
            { id: msisdnStr,        name: 'MSISDN',   role: 'Subscriber' },
            { id: payload.receiver, name: 'Receiver', role: 'Receiver' },
          ],
        },
        '@type': payload.product_id,
        eCode: 0,
      }],
      relatedParty: [{ id: payload.pin, name: 'pin', role: 'Requestor' }],
      '@type': 'CashFakkaAndMared',
    };

    let result: Record<string, unknown> | null = null;
    let orderHttpStatus = 0;
    let orderRaw = '';

    try {
      const orderRes = await CapacitorHttp.request({
        method: 'POST',
        url: 'https://mobile.vodafone.com.eg/services/dxl/pom/productOrder',
        headers: {
          ...DEVICE_HEADERS,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-host': 'ProductOrderingManagement',
          'useCase': 'CashFakkaAndMared',
          'x-dynatrace': 'MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_2_160',
          'api-version': 'v2',
          'msisdn': formatted,
          'Authorization': `Bearer ${accessToken}`,
        },
        data: JSON.stringify(orderPayload),
        readTimeout: 20000,
        connectTimeout: 20000,
      });
      orderHttpStatus = orderRes.status ?? 0;
      orderRaw = typeof orderRes.data === 'string'
        ? orderRes.data.slice(0, 500)
        : JSON.stringify(orderRes.data ?? '').slice(0, 500);
      result = parseCapacitorData(orderRes.data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(4, 'Product Order Request', 'fail', `Network error: ${msg}`);
      return {
        success: false,
        error: '⏱️ انتهت مهلة الاتصال بخوادم فودافون.\nتحقق من الإنترنت وأعد المحاولة.',
        debugSteps: steps,
      };
    }

    if (result?.state === 'Completed' || result?.complete) {
      log(4, 'Product Order', 'pass', `HTTP ${orderHttpStatus} — state=Completed`, orderRaw);
      return { success: true, debugSteps: steps };
    }

    const rawErr = String(result?.message ?? result?.description ?? result?.error ?? '');
    const errCode = String(result?.code ?? result?.errorCode ?? result?.error_code ?? '');
    log(4, 'Product Order', 'fail',
      `HTTP ${orderHttpStatus} — state=${result?.state ?? 'null'} | code=${errCode} | error=${rawErr.slice(0, 150)}`,
      orderRaw);

    let friendly = 'فشل الطلب — تحقق من رصيدك وبيانات المحفظة';

    // أولاً: كود الخطأ الصريح من Vodafone API
    if (errCode === '3999') {
      friendly = '⚠️ خطأ مؤقت من خوادم فودافون\nأعد المحاولة بعد ثوانٍ — ليس خطأً في بياناتك';
    } else if (errCode === '1118') {
      friendly = '🔒 تم تجميد حسابك بسبب تكرار الرقم الخاطئ 3 مرات\nانتظر 24 ساعة أو اتصل على 888 من خطك\nأو اكتب #912# وأرسل';
    } else if (errCode === '1056') {
      friendly = '❌ الرقم السري للمحفظة غير صحيح\n⚠️ تحذير: بعد 3 محاولات سيُقفل الحساب!\nتأكد من رقم سري Vodafone Cash المكون من 6 أرقام';
    } else if (errCode === '1051') {
      friendly = '📵 الرقم غير مسجّل في Vodafone Cash\nتأكد أن الرقم مفعّل عليه محفظة فودافون كاش';
    } else if (errCode === '6051' || errCode === '1057' || errCode === '1058') {
      friendly = '💳 رصيد محفظتك غير كافٍ\nاشحن المحفظة ثم أعد المحاولة';
    } else if (rawErr.toLowerCase().includes('insufficient') || rawErr.includes('رصيد') || rawErr.toLowerCase().includes('not enough balance')) {
      friendly = '💳 رصيد محفظتك غير كافٍ';
    } else if (rawErr.toLowerCase().includes('1118') || (rawErr.toLowerCase().includes('incorrect pin') && rawErr.toLowerCase().includes('3 times'))) {
      friendly = '🔒 تم تجميد حسابك بسبب تكرار الرقم الخاطئ\nانتظر 24 ساعة أو اتصل على 888 أو اكتب #912#';
    } else if (rawErr.toLowerCase().includes('pin') || rawErr.toLowerCase().includes('password') || rawErr.toLowerCase().includes('1056')) {
      friendly = '❌ الرقم السري للمحفظة غير صحيح\n⚠️ بعد 3 محاولات خاطئة سيُقفل الحساب!';
    } else if (rawErr.toLowerCase().includes('unregistered') || rawErr.toLowerCase().includes('1051')) {
      friendly = '📵 الرقم غير مسجّل في Vodafone Cash';
    } else if (orderHttpStatus === 401 || orderHttpStatus === 403) {
      friendly = '❌ انتهت صلاحية الجلسة — أعد المحاولة';
    } else if (orderHttpStatus === 400) {
      friendly = rawErr ? `❌ ${rawErr}` : '❌ بيانات الطلب غير صحيحة';
    } else if (rawErr) {
      friendly = `❌ ${rawErr}`;
    }
    return {
      success: false,
      error: friendly,
      debugSteps: steps,
    };

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error('[vf] native fatal error:', errMsg);
    return {
      success: false,
      error: `Fatal error: ${errMsg}`,
      debugSteps: steps,
    };
  }
}

/** تنفيذ الشحن — APK native أولاً، ثم الجسر، ثم Edge Function */
// ══════════════════════════════════════════════════════════════
// Smart Retry — Exponential Backoff للأخطاء المؤقتة فقط
// ══════════════════════════════════════════════════════════════

/** الأخطاء الدائمة — لا تُعاد المحاولة أبداً */
function isPermanentError(error?: string): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return (
    e.includes('1056') || e.includes('رقم سري') || e.includes('الرقم السري') ||
    e.includes('pin') || e.includes('password') ||
    e.includes('1051') || e.includes('غير مسجّل') || e.includes('unregistered') ||
    e.includes('1118') || e.includes('تجميد') || e.includes('frozen') ||
    e.includes('رصيد') || e.includes('insufficient') || e.includes('balance') ||
    e.includes('6051') || e.includes('1057') || e.includes('1058') ||
    e.includes('محظور') || e.includes('blocked') ||
    e.includes('غير صحيح') || e.includes('invalid') ||
    e.includes('منتهٍ') || e.includes('expired')
  );
}

/** الأخطاء المؤقتة — يُعاد المحاولة مع Exponential Backoff */
function isTransientError(error?: string, httpStatus?: number): boolean {
  if (isPermanentError(error)) return false;
  if (!error && !httpStatus) return false;
  const e = (error ?? '').toLowerCase();
  return (
    e.includes('3999') || e.includes('مؤقت') || e.includes('timeout') ||
    e.includes('network') || e.includes('انتهت مهلة') || e.includes('اتصال') ||
    e.includes('gateway') || e.includes('rate limit') || e.includes('too many') ||
    (httpStatus !== undefined && [429, 502, 503, 504].includes(httpStatus))
  );
}

/** Exponential Backoff: delay(attempt) = base * 2^attempt + jitter */
async function exponentialDelay(attempt: number, baseMs = 1000): Promise<void> {
  const delay = Math.min(baseMs * Math.pow(2, attempt) + Math.random() * 500, 8000);
  await new Promise(r => setTimeout(r, delay));
}

export async function executeVodafoneOrder(payload: {
  product_id: string;
  receiver: string;
  pin: string;
  sender: string;
  idempotencyKey?: string;    // مفتاح Idempotency — يمنع التنفيذ المزدوج
  correlationId?:  string;    // معرّف ربط للـ Debug
}): Promise<{ success: boolean; error?: string; via?: 'native' | 'bridge' | 'server'; debugSteps?: ChargeDebugStep[]; retryCount?: number; operation_number?: number | null; registered?: boolean }> {

  const MAX_RETRIES = 2;  // أقصى عدد إعادة محاولات
  let lastResult: { success: boolean; error?: string; debugSteps?: ChargeDebugStep[] } | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await exponentialDelay(attempt - 1);
      retryCount = attempt;
    }

    // أولاً: APK native — أسرع وأفضل (HTTP مباشر من الجهاز)
    if (isNativeApp()) {
      const nativeResult = await executeNativeVodafoneOrder(payload);
      lastResult = nativeResult;

      // نجاح → أرجع فوراً
      if (nativeResult.success) return { ...nativeResult, via: 'native', retryCount };

      // خطأ دائم → لا تُعد المحاولة
      if (isPermanentError(nativeResult.error)) return { ...nativeResult, via: 'native', retryCount };

      // خطأ مؤقت + لم نصل للحد → أعد المحاولة
      if (isTransientError(nativeResult.error) && attempt < MAX_RETRIES) continue;

      // آخر محاولة أو خطأ غير معروف → أرجع
      return { ...nativeResult, via: 'native', retryCount };
    }

    // ثانياً: الجسر المحلي (localhost:8765)
    const hasBridge = await checkLocalBridge();
    if (hasBridge) {
      try {
        const res = await fetch(`${BRIDGE_URL}/charge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(payload.idempotencyKey ? { 'X-Idempotency-Key': payload.idempotencyKey } : {}),
            ...(payload.correlationId  ? { 'X-Correlation-Id':  payload.correlationId  } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(35000),
        });
        const d = await res.json();
        if (d.success) return { success: true, error: d.error, via: 'bridge', retryCount };
        if (isPermanentError(d.error)) return { success: false, error: d.error, via: 'bridge', retryCount };
        if (isTransientError(d.error, res.status) && attempt < MAX_RETRIES) continue;
        return { success: false, error: d.error, via: 'bridge', retryCount };
      } catch (e) {
        if (attempt < MAX_RETRIES) continue;
        console.error('bridge error:', e);
      }
    }

    // ثالثاً: Edge Function (fallback) — تسجّل العمليات سيرفر-سايد تلقائياً
    const { data, error } = await supabase.functions.invoke<{
      success: boolean; error?: string; message?: string;
      operation_number?: number | null; registered?: boolean;
    }>(
      'vodafone-execute',
      {
        body: payload,
        headers: {
          ...(payload.idempotencyKey ? { 'X-Idempotency-Key': payload.idempotencyKey } : {}),
          ...(payload.correlationId  ? { 'X-Correlation-Id':  payload.correlationId  } : {}),
          'X-Device-Fp': typeof window !== 'undefined'
            ? (localStorage.getItem('vf_device_id') ?? '')
            : '',
        },
      }
    );
    if (error) {
      const msg = await error?.context?.text?.().catch(() => null);
      let parsed: { error?: string } | null = null;
      try { parsed = msg ? JSON.parse(msg) : null; } catch { /* ignore */ }
      const errMsg = parsed?.error ?? msg ?? 'حدث خطأ أثناء الاتصال بالخادم';
      if (isPermanentError(errMsg)) return { success: false, error: errMsg, via: 'server', retryCount };
      if (isTransientError(errMsg) && attempt < MAX_RETRIES) continue;
      return { success: false, error: errMsg, via: 'server', retryCount };
    }
    if (!data) {
      if (attempt < MAX_RETRIES) continue;
      return { success: false, error: 'لا يوجد رد من الخادم', via: 'server', retryCount };
    }
    if (data.success) return {
      success: true, error: data.error, via: 'server', retryCount,
      operation_number: data.operation_number ?? null,
      registered: data.registered ?? false,
    };
    if (isPermanentError(data.error)) return {
      success: false, error: data.error, via: 'server', retryCount,
      registered: data.registered ?? false,
    };
    if (isTransientError(data.error) && attempt < MAX_RETRIES) continue;
    return {
      success: false, error: data.error, via: 'server', retryCount,
      registered: data.registered ?? false,
    };
  }

  // fallback آمن — لن نصل هنا عادةً
  return {
    success: false,
    error: lastResult?.error ?? 'فشل الاتصال بعد عدة محاولات — تحقق من الإنترنت وأعد المحاولة',
    debugSteps: lastResult?.debugSteps,
    via: 'native',
    retryCount,
  };
}

// ==========================================
// معاينة التجديد التراكمي
// ==========================================
export async function getActivationPreview(userId: string, code: string): Promise<{
  valid: boolean;
  error?: string;
  errorCode?: string;
  currentDays: number;
  newDays: number;
  totalDays: number;
  newExpiry: string;
  codeType: string;
  // حقول جديدة
  allowedUsers: number | null;
  usesPerUser: number | null;
  remainingUses: number | null;
  expiryDate: string | null;
  expirationMode: string;
  notes: string | null;
  usedCount: number;
}> {
  const empty = { valid: false, currentDays: 0, newDays: 0, totalDays: 0, newExpiry: '', codeType: 'paid', allowedUsers: null, usesPerUser: null, remainingUses: null, expiryDate: null, expirationMode: 'BY_DATE', notes: null, usedCount: 0 };

  const { data: key } = await supabase.from('license_keys').select('*').eq('code', code).maybeSingle();
  if (!key) return { ...empty, error: 'كود التفعيل غير صحيح', errorCode: 'INVALID' };
  if (key.status === 'disabled') return { ...empty, error: 'هذا الكود معطّل', errorCode: 'DISABLED' };
  if (key.status === 'expired') return { ...empty, error: 'هذا الكود منتهي الصلاحية', errorCode: 'EXPIRED' };
  if (key.expiry_date && new Date(key.expiry_date) < new Date())
    return { ...empty, error: 'انتهت صلاحية هذا الكود', errorCode: 'EXPIRED' };
  if ((key.code_type === 'paid' || !key.code_type) && key.status === 'used')
    return { ...empty, error: 'هذا الكود مستخدم مسبقاً', errorCode: 'USED' };

  const maxAllowed = key.allowed_users ?? key.max_users ?? null;
  // uses_per_user = activation limit — do NOT use as ops fallback
  const usesPerUser = key.operations_per_user ?? key.max_ops_per_user ?? null;

  // التحقق من الحد الأقصى للمستخدمين (trial/gift)
  if ((key.code_type === 'trial' || key.code_type === 'gift') && maxAllowed !== null && key.used_count >= maxAllowed)
    return { ...empty, error: 'وصل الكود للحد الأقصى من المستخدمين', errorCode: 'MAX_USERS' };

  const { data: sub } = await supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
  const now = new Date();
  const currentDays = (() => {
    if (!sub || sub.status !== 'active' || !sub.expires_at) return 0;
    return Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - now.getTime()) / 86400000));
  })();

  const effectiveDays = key.custom_duration_days ?? key.duration_days;
  // P2 FIX: حساب تاريخ الانتهاء بالميلي‌ثانية الدقيقة (24 ساعة كاملة لكل يوم)
  const baseDate = currentDays > 0 && sub?.expires_at ? new Date(sub.expires_at) : now;
  const rawExpiry = new Date(baseDate.getTime() + effectiveDays * 24 * 60 * 60 * 1000);

  let newExpiry = rawExpiry;
  if (key.expiration_mode === 'BY_DATE' && key.expiry_date) {
    newExpiry = new Date(key.expiry_date);
  } else if (key.expiration_mode === 'EARLIEST' && key.expiry_date) {
    newExpiry = rawExpiry < new Date(key.expiry_date) ? rawExpiry : new Date(key.expiry_date);
  }

  // حساب الاستخدامات المتبقية
  const remainingUses = maxAllowed !== null ? Math.max(0, maxAllowed - key.used_count) : null;

  return {
    valid: true,
    currentDays,
    newDays: effectiveDays,
    totalDays: currentDays + effectiveDays,
    newExpiry: newExpiry.toISOString(),
    codeType: key.code_type ?? 'paid',
    allowedUsers: maxAllowed,
    usesPerUser,
    remainingUses,
    expiryDate: key.expiry_date ?? null,
    expirationMode: key.expiration_mode ?? 'BY_DATE',
    notes: key.notes ?? null,
    usedCount: key.used_count ?? 0,
  };
}

// ==========================================
// لوحة الأدمن — الاشتراكات
// ==========================================
export interface SubsFilter {
  search?: string;
  status?: string;   // 'all' | 'active' | 'expired' | 'suspended'
  codeType?: string; // 'all' | 'trial' | 'gift' | 'paid'
}

export type EnrichedSubscription = Subscription & {
  profile?: Pick<Profile, 'username' | 'email' | 'full_name' | 'phone'>;
  license_code?: string;
  code_type?: string;
  operations_per_user?: number | null;
  total_operations?: number | null;
  remaining_operations?: number | null;
  allowed_users?: number | null;
  used_users?: number | null;
  remaining_users?: number | null;
};

export async function getAllSubscriptions(
  page = 1,
  filters: SubsFilter = {},
): Promise<PaginatedResult<EnrichedSubscription>> {
  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = supabase
    .from('subscriptions')
    .select('*, profiles!user_id(username, email, full_name, phone)', { count: 'exact' })
    .order('created_at', { ascending: false });

  // فلتر الحالة
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  const { data, count } = await query.range(from, to);
  const rows = Array.isArray(data) ? data : [];

  // جلب تفاصيل الأكواد (code, code_type, ops fields, users fields)
  const keyIds = [...new Set(rows.filter(r => r.license_key_id).map(r => r.license_key_id as string))];
  interface KeyRow {
    id: string;
    code: string;
    code_type: string | null;
    operations_per_user: number | null;
    max_ops_per_user: number | null;
    uses_per_user: number | null;
    allowed_users: number | null;
    max_users: number | null;
    used_count: number | null;
  }
  let keyMap: Record<string, KeyRow> = {};
  if (keyIds.length > 0) {
    const { data: keys } = await supabase
      .from('license_keys')
      .select('id, code, code_type, operations_per_user, max_ops_per_user, uses_per_user, allowed_users, max_users, used_count')
      .in('id', keyIds);
    if (Array.isArray(keys)) keys.forEach((k: KeyRow) => { keyMap[k.id] = k; });
  }

  let enriched: EnrichedSubscription[] = rows.map(r => {
    const k = r.license_key_id ? keyMap[r.license_key_id] : null;
    const rawOpsEnriched = k ? (k.operations_per_user ?? k.max_ops_per_user ?? null) : null;
    const opsLimit: number | null = (rawOpsEnriched === 0) ? null : rawOpsEnriched;
    const opsUsed  = r.ops_count ?? 0;
    const allowedUsers: number | null = k ? (k.allowed_users ?? k.max_users ?? null) : null;
    const usedUsers = k?.used_count ?? 0;
    const rawProfile = (r as Record<string, unknown>)['profiles'] as EnrichedSubscription['profile'] | undefined;

    // ── تصحيح حالة الاشتراك بناءً على expires_at الفعلي ──────────────────
    let resolvedStatus = r.status;
    if (r.expires_at) {
      const now = Date.now();
      const exp = new Date(r.expires_at).getTime();
      if (exp < now && r.status === 'active') {
        resolvedStatus = 'expired'; // انتهى فعلياً رغم أن DB تقول active
      }
    }

    return {
      ...r,
      status: resolvedStatus,
      profile: rawProfile,
      license_code: k?.code ?? null,
      code_type: k?.code_type ?? null,
      operations_per_user: opsLimit,
      total_operations: opsLimit,
      remaining_operations: opsLimit !== null ? Math.max(0, opsLimit - opsUsed) : null,
      allowed_users: allowedUsers,
      used_users: usedUsers,
      remaining_users: allowedUsers !== null ? Math.max(0, allowedUsers - usedUsers) : null,
    } as EnrichedSubscription;
  });

  // فلتر نوع الكود (client-side بعد الـ join)
  if (filters.codeType && filters.codeType !== 'all') {
    enriched = enriched.filter(r => r.code_type === filters.codeType);
  }

  // بحث نصي (client-side) — username / email / user_id / code
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    enriched = enriched.filter(r => {
      const p = r.profile as { username?: string; email?: string; full_name?: string } | undefined;
      return (
        (p?.username?.toLowerCase().includes(q)) ||
        (p?.email?.toLowerCase().includes(q)) ||
        (p?.full_name?.toLowerCase().includes(q)) ||
        (r.license_code?.toLowerCase().includes(q)) ||
        (r.user_id?.toLowerCase().includes(q))
      );
    });
  }

  return { data: enriched, count: filters.search || filters.codeType !== 'all' ? enriched.length : (count ?? 0), page, pageSize: PAGE_SIZE };
}

// ==========================================
// لوحة الأدمن — أكواد الترخيص
// ==========================================
// جلب كل الأكواد بدون صفحات — للاستخدام في قائمة الاختيار فقط (لوحة الأدمن - صندوق الهدايا)
export async function getAllLicenseKeysUnpaged(): Promise<LicenseKey[]> {
  const { data } = await supabase
    .from('license_keys')
    .select('id, code, code_type, status, used_count, allowed_users, max_users, duration_days, custom_duration_days, notes')
    .order('created_at', { ascending: false });
  return Array.isArray(data) ? data as LicenseKey[] : [];
}

export async function getAllLicenseKeys(page = 1): Promise<PaginatedResult<LicenseKey>> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count } = await supabase
    .from('license_keys')
    .select('*, profiles!used_by(id, username, email, full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize: PAGE_SIZE };
}

// ==========================================
// إحصائيات الأكواد الشاملة
// ==========================================
export interface GlobalCodeStats {
  total_codes: number;
  active_codes: number;
  used_codes: number;
  expired_codes: number;
  disabled_codes: number;
  closed_codes: number;
  trial_codes: number;
  paid_codes: number;
  gift_codes: number;
  total_linked_users: number;
  total_renewals: number;
}

export async function getGlobalCodeStats(): Promise<GlobalCodeStats> {
  const { data } = await supabase.rpc('get_global_code_stats');
  const row = Array.isArray(data) ? data[0] : data;
  return {
    total_codes: Number(row?.total_codes ?? 0),
    active_codes: Number(row?.active_codes ?? 0),
    used_codes: Number(row?.used_codes ?? 0),
    expired_codes: Number(row?.expired_codes ?? 0),
    disabled_codes: Number(row?.disabled_codes ?? 0),
    closed_codes: Number(row?.closed_codes ?? 0),
    trial_codes: Number(row?.trial_codes ?? 0),
    paid_codes: Number(row?.paid_codes ?? 0),
    gift_codes: Number(row?.gift_codes ?? 0),
    total_linked_users: Number(row?.total_linked_users ?? 0),
    total_renewals: Number(row?.total_renewals ?? 0),
  };
}

// ==========================================
// توليد كود تلقائي قوي
// ==========================================
export function generateCode(prefix: 'NAFK' | 'NADER' | 'GIFT' = 'NAFK'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  if (prefix === 'NADER') return `NADER-${seg()}-${seg()}`;
  if (prefix === 'GIFT')  return `GIFT-${seg()}-${seg()}`;
  return `NAFK-${seg()}-${seg()}-${seg()}`;
}

export async function createLicenseKey(payload: {
  code_type: 'paid' | 'trial' | 'gift';
  duration_days: number;
  custom_duration_days?: number;
  max_hours?: number;
  notes?: string;
  created_by: string;
  max_users?: number;
  activation_limit_per_user?: number;
  operations_per_user?: number;
  max_ops_per_user?: number;
  allowed_users?: number;
  uses_per_user?: number;
  expiry_date?: string | null;
  expiration_mode?: 'BY_DATE' | 'BY_USAGE' | 'EARLIEST';
}): Promise<{ error: unknown; code: string }> {
  const pfx = payload.code_type === 'trial' ? 'NADER' : payload.code_type === 'gift' ? 'GIFT' : 'NAFK';
  let code = generateCode(pfx);
  let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await supabase.from('license_keys').select('id').eq('code', code).maybeSingle();
    if (!existing) break;
    code = generateCode(pfx);
    attempts++;
  }

  const isTrial = payload.code_type === 'trial';
  // null/0 = UNLIMITED
  const effectiveMaxUsers       = (payload.max_users ?? payload.allowed_users) || null;
  const effectiveActLimit       = payload.activation_limit_per_user ?? payload.uses_per_user ?? 1;
  // uses_per_user = activation limit — do NOT use as ops fallback
  const effectiveOpsPerUser = (payload.operations_per_user ?? payload.max_ops_per_user) || null;
  const defaultExpMode          = isTrial ? 'BY_USAGE' : 'BY_DATE';

  const insertPayload: Record<string, unknown> = {
    code,
    code_type:                  payload.code_type,
    duration_days:              payload.duration_days,
    custom_duration_days:       payload.custom_duration_days ?? null,
    max_hours:                  payload.max_hours ?? null,
    notes:                      payload.notes ?? null,
    created_by:                 payload.created_by,
    status:                     'active',
    used_count:                 0,
    max_users:                  effectiveMaxUsers,
    allowed_users:              effectiveMaxUsers,
    activation_limit_per_user:  effectiveActLimit,
    uses_per_user:              effectiveActLimit,
    operations_per_user:        effectiveOpsPerUser,
    max_ops_per_user:           effectiveOpsPerUser,
    expiry_date:                payload.expiry_date ?? null,
    expiration_mode:            payload.expiration_mode ?? defaultExpMode,
  };

  const { error } = await supabase.from('license_keys').insert(insertPayload);
  if (!error) {
    await insertSystemLog({
      user_id: payload.created_by, level: 'info', action: 'admin_create_key',
      message: `كود جديد: ${code}`,
      metadata: { code, code_type: payload.code_type, max_users: effectiveMaxUsers, ops_per_user: effectiveOpsPerUser },
    });
  }
  return { error, code };
}

export async function disableLicenseKey(id: string) {
  const { error } = await supabase.from('license_keys').update({ status: 'disabled', updated_at: new Date().toISOString() }).eq('id', id);
  return { error };
}

export async function enableLicenseKey(id: string) {
  // إعادة تشغيل الكود: يعود لحالة active أو used بناءً على عدد المستخدمين
  const { data: key } = await supabase.from('license_keys').select('used_count, max_users').eq('id', id).maybeSingle();
  const maxUsers = key?.max_users ?? 1;
  const usedCount = key?.used_count ?? 0;
  // إذا وصل للحد الأقصى → used، وإلا → active
  const newStatus = (maxUsers > 1 && usedCount >= maxUsers) ? 'used' : 'active';
  const { error } = await supabase.from('license_keys').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
  return { error };
}

// PHASE 1: حذف مع إلغاء الاشتراكات المرتبطة وتسجيل العملية في Audit Log
export async function deleteLicenseKeyWithCascade(
  keyId: string,
  adminId: string
): Promise<{ success: boolean; affectedUsers?: number; keyCode?: string; error?: string }> {
  const { data, error } = await supabase.rpc('delete_license_key_cascade', {
    p_key_id: keyId,
    p_admin_id: adminId,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; affected_users?: number; key_code?: string; error?: string };
  return {
    success: result?.success ?? false,
    affectedUsers: result?.affected_users ?? 0,
    keyCode: result?.key_code ?? '',
    error: result?.error,
  };
}

// متوافق للخلف — حذف بسيط (للأكواد غير المستخدمة)
export async function deleteLicenseKey(id: string) {
  const { error } = await supabase.from('license_keys').delete().eq('id', id);
  return { error };
}

// ==========================================
// نظام صندوق الهدايا الترحيبي
// ==========================================

export interface WelcomeGift {
  id: string;
  is_enabled: boolean;
  license_key_id: string | null;
  updated_at: string;
  license_key?: LicenseKey | null;
}

export async function getWelcomeGift(): Promise<WelcomeGift | null> {
  const { data, error } = await supabase
    .from('welcome_gifts')
    .select(`*, license_key:license_keys(*)`)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as WelcomeGift;
}

export async function setWelcomeGift(payload: { is_enabled: boolean; license_key_id: string | null }) {
  const { data: existing } = await supabase.from('welcome_gifts').select('id').limit(1).maybeSingle();
  if (existing?.id) {
    const { error } = await supabase
      .from('welcome_gifts')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    return { error };
  }
  const { error } = await supabase.from('welcome_gifts').insert({ ...payload });
  return { error };
}

export async function getGiftBoxStatus(userId: string): Promise<{
  available: boolean;
  alreadyClaimed: boolean;
  gift: WelcomeGift | null;
  reason?: 'disabled' | 'no_key' | 'key_invalid' | 'exhausted' | 'claimed' | null;
}> {
  const gift = await getWelcomeGift();
  if (!gift || !gift.is_enabled) return { available: false, alreadyClaimed: false, gift, reason: 'disabled' };
  if (!gift.license_key_id || !gift.license_key) return { available: false, alreadyClaimed: false, gift, reason: 'no_key' };

  const key = gift.license_key as LicenseKey;
  // هل الكود صالح للاستخدام؟
  if (key.status === 'disabled') return { available: false, alreadyClaimed: false, gift, reason: 'key_invalid' };
  if (key.status === 'expired') return { available: false, alreadyClaimed: false, gift, reason: 'key_invalid' };
  if (key.expiry_date && new Date(key.expiry_date) < new Date()) return { available: false, alreadyClaimed: false, gift, reason: 'key_invalid' };

  // هل وصل للحد الأقصى؟
  const maxAllowed = key.allowed_users ?? key.max_users ?? null;
  const isMultiUsePaidKey = (key.code_type === 'paid' || !key.code_type) && (key.allowed_users ?? key.max_users ?? 1) > 1;
  if (!isMultiUsePaidKey && (key.code_type !== 'paid') && maxAllowed !== null && key.used_count >= maxAllowed) {
    return { available: false, alreadyClaimed: false, gift, reason: 'exhausted' };
  }
  if (isMultiUsePaidKey && maxAllowed !== null && (key.used_count ?? 0) >= maxAllowed) {
    return { available: false, alreadyClaimed: false, gift, reason: 'exhausted' };
  }
  if ((key.code_type === 'paid' || !key.code_type) && !isMultiUsePaidKey && key.status === 'used') {
    return { available: false, alreadyClaimed: false, gift, reason: 'exhausted' };
  }

  // هل المستخدم استلم الهدية مسبقاً؟
  const { data: claim } = await supabase
    .from('gift_claims')
    .select('id')
    .eq('user_id', userId)
    .eq('license_key_id', gift.license_key_id)
    .maybeSingle();
  if (claim) return { available: false, alreadyClaimed: true, gift, reason: 'claimed' };

  return { available: true, alreadyClaimed: false, gift, reason: null };
}

export async function claimGiftCode(userId: string): Promise<{ success: boolean; code?: string; error?: string }> {
  const status = await getGiftBoxStatus(userId);
  if (!status.available) return { success: false, error: status.alreadyClaimed ? 'استلمت الهدية مسبقاً' : 'الهدية غير متاحة' };

  const keyId = status.gift!.license_key_id!;
  const key   = status.gift!.license_key as LicenseKey;
  const code  = key.code;

  // سجّل مباشرةً بحالة 'claimed' — لا يوجد pending
  // UNIQUE(user_id, license_key_id) في DB يمنع العد المكرر تلقائياً
  // NOTE: لا نزيد used_count هنا — الزيادة تحدث فقط في activateLicenseKey عند التفعيل الفعلي
  const { error } = await supabase.from('gift_claims').insert({
    user_id: userId,
    license_key_id: keyId,
    code_snapshot: code,
    status: 'claimed',
  });
  if (error) {
    if (error.code === '23505') return { success: false, error: 'استلمت الهدية مسبقاً' };
    return { success: false, error: 'حدث خطأ أثناء الاستلام' };
  }

  return { success: true, code };
}

// تأكيد الاستلام — no-op للتوافق مع الكود القديم
// الحالة 'claimed' تُضبط مباشرةً في claimGiftCode الآن
export async function confirmGiftClaim(userId: string, keyId: string): Promise<void> {
  // تأكد فقط أن الحالة claimed (للتوافق الآمن في حال استدعاء قديم)
  await supabase
    .from('gift_claims')
    .update({ status: 'claimed' })
    .eq('user_id', userId)
    .eq('license_key_id', keyId)
    .eq('status', 'pending'); // لا تعدّل سجلات claimed بلا داعٍ
}

// PHASE 5: هداياي — كل الأكواد المستلمة (pending + claimed)
export interface MyGiftEntry {
  id: string;
  license_key_id: string;
  claimed_at: string;
  status: 'pending' | 'claimed';
  code_snapshot: string | null;
  key: LicenseKey | null;
}

export async function getMyGifts(userId: string): Promise<MyGiftEntry[]> {
  const { data } = await supabase
    .from('gift_claims')
    .select('*, key:license_keys(*)')
    .eq('user_id', userId)
    .order('claimed_at', { ascending: false });
  if (!Array.isArray(data)) return [];
  return data.map(r => ({
    id: r.id,
    license_key_id: r.license_key_id,
    claimed_at: r.claimed_at,
    status: r.status ?? 'pending',
    code_snapshot: r.code_snapshot ?? r.key?.code ?? null,
    key: r.key ?? null,
  }));
}

// PHASE 8: إحصائيات كود الهدية — P3: مصدر بيانات موحد
// جميع الأرقام تُحسب من gift_claims WHERE status='claimed' فقط
// لا تُستخدم used_count كمصدر للإحصاءات (تجنب P3 mismatch)
export async function getGiftCodeStats(keyId: string): Promise<{
  // حقول النظام الجديد
  operations_per_user: number | null;
  total_operations: number | null;
  used_operations: number;
  remaining_operations: number | null;
  usage_percentage: number;
  allowed_users: number | null;
  remaining_users: number | null;
  // للتوافق مع الكود القديم
  totalAllowed: number | null;
  claimedCount: number;
  remainingCount: number | null;
}> {
  const { data: key } = await supabase
    .from('license_keys')
    .select('allowed_users, max_users, used_count, operations_per_user, max_ops_per_user, uses_per_user')
    .eq('id', keyId)
    .maybeSingle();

  // P3: المصدر الوحيد للعد — gift_claims WHERE status='claimed'
  const { count } = await supabase
    .from('gift_claims')
    .select('id', { count: 'exact', head: true })
    .eq('license_key_id', keyId)
    .eq('status', 'claimed');

  // uses_per_user = activation limit — do NOT use as ops fallback
  const opsPerUser: number | null = (key?.operations_per_user ?? key?.max_ops_per_user) || null;
  const totalAllowed: number | null = (key?.allowed_users ?? key?.max_users) || null;
  const claimedCount = count ?? 0;
  // P3: المصدر الوحيد — gift_claims WHERE status='claimed'
  // P1 FIX: remaining_operations = opsPerUser (ثابت لكل مستخدم، لا يتغير بعدد المطالبين)
  // لا تطرح claimedCount من opsPerUser — كل مستخدم يحصل على حصته الكاملة بغض النظر عن عدد المطالبين
  const remainingOps = opsPerUser; // كل مستخدم يحصل على opsPerUser كاملة
  // نسبة الاستخدام = مدى انتشار الكود بين المستخدمين (claimedCount / totalAllowed)
  const usagePct = totalAllowed && totalAllowed > 0
    ? Math.round((claimedCount / totalAllowed) * 100)
    : 0;
  const remainingCount = totalAllowed !== null ? Math.max(0, totalAllowed - claimedCount) : null;

  return {
    operations_per_user:  opsPerUser,
    total_operations:     opsPerUser,
    used_operations:      claimedCount,   // P3: كم مستخدم طالب الكود
    remaining_operations: remainingOps,   // P1: حصة كل مستخدم (ثابتة)
    usage_percentage:     usagePct,       // نسبة الانتشار وليس نسبة العمليات
    allowed_users:        totalAllowed,
    remaining_users:      remainingCount, // P3: كم مستخدم متبقٍ
    // backward compat
    totalAllowed,
    claimedCount,
    remainingCount,
  };
}

// ==========================================
// لوحة الأدمن — جميع العمليات
// ==========================================
export async function getAllOperations(page = 1, search = ''): Promise<PaginatedResult<Operation>> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase
    .from('operations')
    .select('*, profiles!user_id(username, email)', { count: 'exact' })
    .order('performed_at', { ascending: false })
    .range(from, to);
  if (search) query = query.ilike('phone_number', `%${search}%`);
  const { data, count } = await query;
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize: PAGE_SIZE };
}

// ==========================================
// لوحة الأدمن — العمليات مع فلاتر كاملة
// ==========================================
export interface OperationsFilter {
  user_id?: string;
  phone?: string;
  card_type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  operation_source?: string;
  operation_id?: string;
}

export interface OperationsStats {
  total: number;
  success: number;
  failed: number;
  total_amount: number;
}

export async function getAllOperationsFiltered(
  page = 1,
  filters: OperationsFilter = {}
): Promise<PaginatedResult<Operation & { profile?: { username?: string; email?: string } }>> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let q = supabase
    .from('operations')
    .select('*, profiles!user_id(username, email)', { count: 'exact' })
    .order('performed_at', { ascending: false })
    .range(from, to);

  if (filters.user_id)  q = q.eq('user_id', filters.user_id);
  if (filters.phone)    q = q.ilike('phone_number', `%${filters.phone}%`);
  if (filters.card_type && filters.card_type !== 'all') q = q.ilike('card_type', `%${filters.card_type}%`);
  if (filters.status && filters.status !== 'all')       q = q.eq('status', filters.status);
  if (filters.date_from) q = q.gte('performed_at', filters.date_from);
  if (filters.date_to)   q = q.lte('performed_at', filters.date_to + 'T23:59:59');
  if (filters.operation_source && filters.operation_source !== 'all')
    q = q.eq('operation_source', filters.operation_source);
  if (filters.operation_id)
    q = q.or(`id.eq.${filters.operation_id},operation_number.eq.${parseInt(filters.operation_id) || 0}`);

  const { data, count } = await q;
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function getOperationsStats(filters: OperationsFilter = {}): Promise<OperationsStats> {
  let dateTo = filters.date_to || null;
  if (dateTo && !dateTo.includes('T')) {
    dateTo = `${dateTo}T23:59:59`;
  }

  const rpcFilters = {
    filter_user_id: filters.user_id || null,
    filter_phone: filters.phone || null,
    filter_card_type: (filters.card_type && filters.card_type !== 'all') ? filters.card_type : null,
    filter_status: (filters.status && filters.status !== 'all') ? filters.status : null,
    filter_date_from: filters.date_from || null,
    filter_date_to: dateTo,
    filter_operation_source: (filters.operation_source && filters.operation_source !== 'all') ? filters.operation_source : null,
  };

  const { data, error } = await supabase.rpc('get_operations_stats_v2', rpcFilters).maybeSingle();

  if (error || !data) {
    console.error('Error fetching operations stats via RPC:', error);
    return { total: 0, success: 0, failed: 0, total_amount: 0 };
  }

  const rpcData = data as Record<string, any>;

  return {
    total: Number(rpcData.total_count) || 0,
    success: Number(rpcData.success_count) || 0,
    failed: Number(rpcData.failed_count) || 0,
    total_amount: Number(rpcData.total_amount) || 0,
  };
}

// ==========================================
// لوحة الأدمن — إجراءات العمليات للمستخدم
// ==========================================
export async function adminAdjustOps(userId: string, delta: number, adminId: string, reason?: string): Promise<{ success: boolean; error?: string; newCount?: number }> {
  const { data: sub } = await supabase
    .from('subscriptions').select('id, ops_count').eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (!sub) return { success: false, error: 'لا يوجد اشتراك نشط' };
  const newCount = Math.max(0, (sub.ops_count ?? 0) + delta);
  const { error } = await supabase.from('subscriptions').update({ ops_count: newCount }).eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  await insertSystemLog({
    user_id: adminId, level: delta > 0 ? 'info' : 'warning',
    action: delta > 0 ? 'admin_add_ops' : 'admin_deduct_ops',
    message: reason ?? `${delta > 0 ? 'إضافة' : 'خصم'} ${Math.abs(delta)} عملية`,
    metadata: { target_user: userId, delta, new_count: newCount },
  });
  return { success: true, newCount };
}

// ==========================================
// لوحة الأدمن — سجلات النظام
// ==========================================
export async function getSystemLogs(
  opts: number | { page?: number; limit?: number; search?: string; level?: string } = 1
): Promise<PaginatedResult<SystemLog>> {
  const page     = typeof opts === 'number' ? opts : (opts.page ?? 1);
  const pageSize = typeof opts === 'object'  ? (opts.limit ?? PAGE_SIZE) : PAGE_SIZE;
  const search   = typeof opts === 'object'  ? opts.search  : undefined;
  const level    = typeof opts === 'object'  ? opts.level   : undefined;

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let q = supabase
    .from('system_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (level)  q = q.eq('level', level);
  if (search) q = q.or(`action.ilike.%${search}%,message.ilike.%${search}%`);

  const { data, count } = await q;
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize };
}

// ==========================================
// لوحة الأدمن — الإشعارات
// ==========================================
export async function getAllNotifications(page = 1): Promise<PaginatedResult<Notification>> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function sendNotification(payload: { title: string; body: string; type: string; priority?: string; action_url?: string; user_id?: string; is_global?: boolean; dedup_key?: string; send_push?: boolean }) {
  // توجيه عبر Edge Function لإرسال FCM أيضاً
  const { dedup_key: _dk, ...body } = payload;
  const { data, error } = await supabase.functions.invoke('send-push-notification', { body });
  return { data, error };
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  return { error };
}

// ══════════════════════════════════════════════════════════════
// Product Config — إدارة الكروت الديناميكية من DB
// ══════════════════════════════════════════════════════════════
export interface ProductConfig {
  product_id:    string;
  display_name:  string;
  category:      string;
  is_visible:    boolean;
  is_enabled:    boolean;
  status:        'active' | 'maintenance' | 'development' | 'unavailable' | 'disabled_execution';
  price:         number | null;
  units:         number | null;
  validity:      string | null;
  net_balance:   number | null;
  profit_margin: number | null;
  sort_order:    number;
  api_override:  Record<string, unknown> | null;
  notes:         string | null;
  updated_at:    string;
}

export async function getProductConfig(): Promise<ProductConfig[]> {
  const { data, error } = await supabase.rpc('get_product_config');
  if (error) throw error;
  return (data ?? []) as ProductConfig[];
}

export async function updateProductConfig(
  productId: string,
  updates: Partial<Omit<ProductConfig, 'product_id' | 'display_name' | 'updated_at'>>
): Promise<{ error: unknown }> {
  const { error } = await supabase.rpc('update_product_config', {
    p_product_id:    productId,
    p_is_visible:    updates.is_visible    ?? null,
    p_is_enabled:    updates.is_enabled    ?? null,
    p_status:        updates.status        ?? null,
    p_price:         updates.price         ?? null,
    p_units:         updates.units         ?? null,
    p_validity:      updates.validity      ?? null,
    p_net_balance:   updates.net_balance   ?? null,
    p_profit_margin: updates.profit_margin ?? null,
    p_sort_order:    updates.sort_order    ?? null,
    p_api_override:  updates.api_override  ?? null,
    p_notes:         updates.notes         ?? null,
  });
  // إبطال كاش product_config فوراً حتى تنعكس تعديلات الأدمن على الشاشة الرئيسية
  if (!error) {
    try {
      const { cacheInvalidate } = await import('@/lib/appCache');
      await cacheInvalidate('cache_product_config_v2');
    } catch { /* تجاهل أخطاء الكاش — العملية تمت بنجاح */ }
  }
  return { error };
}

// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// Admin User Actions — كل إجراءات الأدمن عبر Edge Function بـ service role
// تحلّ مشكلة invalid JWT عند استخدام جلسة الأدمن لعمليات Auth
// ══════════════════════════════════════════════════════════════
async function callAdminUserAction(action: string, userId: string, value?: unknown): Promise<{ success: boolean; error?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action, userId, value },
  });
  if (error) return { success: false, error: error.message };
  return (data as { success: boolean; error?: string; message?: string }) ?? { success: false, error: 'لا يوجد رد من الخادم' };
}

/** تسجيل خروج من جميع الأجهزة — يستخدم service role لتجنب خطأ invalid JWT */
export async function adminSignOutAllDevices(userId: string): Promise<{ success: boolean; error?: string }> {
  return callAdminUserAction('sign_out_all', userId);
}

/** إعادة تعيين بيانات الجهاز (FCM tokens) */
export async function adminResetDeviceTokens(userId: string): Promise<{ success: boolean; error?: string }> {
  return callAdminUserAction('reset_tokens', userId);
}

/** تعديل الحد اليومي للعمليات */
export async function adminSetOpsLimit(userId: string, limit: number): Promise<{ success: boolean; error?: string }> {
  return callAdminUserAction('set_ops_limit', userId, limit);
}

/** حذف الحساب نهائياً عبر Edge Function الجديدة */
export async function deleteUserComplete(userId: string): Promise<{ success: boolean; error?: string }> {
  return callAdminUserAction('delete_account', userId);
}

// ══ نظام حظر الأجهزة وكشف الحسابات المكررة ══════════════════════════════

export interface DeviceBan {
  id: string;
  device_fp: string | null;
  device_id: string | null;
  hardware_hash: string | null;
  ban_reason: string;
  ban_type: string;
  is_permanent: boolean;
  is_active: boolean;
  associated_user_ids: string[];
  associated_usernames: string[];
  banned_by: string | null;
  banned_by_name: string | null;
  banned_at: string;
  unbanned_at: string | null;
  notes: string | null;
  ip_address: string | null;
  device_model: string | null;
  platform: string | null;
}

export interface DuplicateDeviceGroup {
  device_fp: string | null;
  device_id: string | null;
  hardware_hash: string | null;
  user_count: number;
  user_ids: string[];
  usernames: string[];
  phones: string[];
  first_seen: string;
  last_seen: string;
  is_banned: boolean;
  ban_info: Partial<DeviceBan> | null;
}

/** حظر جهاز نهائياً */
export async function banDevice(params: {
  device_fp?: string; device_id?: string; hardware_hash?: string;
  ban_reason?: string; ban_type?: string; notes?: string;
  ip_address?: string; device_model?: string; platform?: string;
  associated_user_ids?: string[]; associated_usernames?: string[];
}): Promise<{ success: boolean; ban_id?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action: 'ban_device', ...params },
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; ban_id?: string; error?: string };
}

/** رفع حظر جهاز */
export async function unbanDevice(ban_id: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action: 'unban_device', ban_id },
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** جلب الأجهزة المكررة (حسابات متعددة على نفس الجهاز) */
export async function getDuplicateDevices(): Promise<{
  success: boolean; data: DuplicateDeviceGroup[]; total: number; error?: string;
}> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action: 'get_duplicate_devices' },
  });
  if (error) return { success: false, data: [], total: 0, error: error.message };
  return data as { success: boolean; data: DuplicateDeviceGroup[]; total: number };
}

/** جلب قائمة حظر الأجهزة */
export async function getDeviceBans(): Promise<{ success: boolean; data: DeviceBan[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action: 'get_device_bans' },
  });
  if (error) return { success: false, data: [], error: error.message };
  return data as { success: boolean; data: DeviceBan[] };
}

/** فحص حظر الجهاز الحالي — يُستدعى عند فتح التطبيق */
export async function checkDeviceBan(params: {
  device_fp?: string; device_id?: string; hardware_hash?: string;
}): Promise<{ banned: boolean; reason?: string; banned_at?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action: 'check_device_ban', ...params },
  });
  if (error) return { banned: false, error: error.message };
  return data as { banned: boolean; reason?: string; banned_at?: string };
}

/** تسجيل جهاز في registry */
export async function registerDeviceInRegistry(userId: string, params: {
  device_fp?: string; device_id?: string; hardware_hash?: string;
  ip_address?: string; device_model?: string; platform?: string; app_version?: string;
}): Promise<void> {
  await supabase.functions.invoke('admin-user-actions', {
    body: { action: 'register_device', userId, ...params },
  }).catch(() => {});
}

// ── الحسابات المحظورة (is_active = false) ─────────────────────────────────
export interface BannedAccount {
  id: string;
  username: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
  device_fp: string | null;
  created_at: string;
  updated_at: string;
}

/** جلب جميع الحسابات المحظورة (is_active = false) */
export async function getBannedAccounts(): Promise<{ data: BannedAccount[]; error?: string }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, email, full_name, phone, role, device_fp, created_at, updated_at')
    .eq('is_active', false)
    .order('updated_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as BannedAccount[] };
}
// ── جلب بيانات كاملة لمجموعة أجهزة مكررة (profiles + device_registry) ────
export interface DuplicateGroupProfile {
  id: string;
  username: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  device_fp: string | null;
  created_at: string;
  // من fcm_tokens / device_registry
  device_model: string | null;
  platform: string | null;
  os_version: string | null;
  app_version: string | null;
}

export async function getDuplicateGroupProfiles(
  userIds: string[]
): Promise<{ data: DuplicateGroupProfile[]; error?: string }> {
  if (!userIds.length) return { data: [] };
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, email, full_name, phone, role, is_active, device_fp, created_at')
    .in('id', userIds);
  if (pErr) return { data: [], error: pErr.message };

  // جلب آخر token لكل مستخدم لمعرفة معلومات الجهاز
  const { data: tokens } = await supabase
    .from('fcm_tokens')
    .select('user_id, device_info, app_version')
    .in('user_id', userIds)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  const tokenMap: Record<string, { device_model: string | null; platform: string | null; os_version: string | null; app_version: string | null }> = {};
  (tokens ?? []).forEach((t: { user_id: string; device_info?: { model?: string; platform?: string; os_version?: string }; app_version?: string | null }) => {
    if (!tokenMap[t.user_id]) {
      tokenMap[t.user_id] = {
        device_model: t.device_info?.model ?? null,
        platform:     t.device_info?.platform ?? null,
        os_version:   t.device_info?.os_version ?? null,
        app_version:  t.app_version ?? null,
      };
    }
  });

  const result: DuplicateGroupProfile[] = (profiles ?? []).map((p: {
    id: string; username: string | null; email: string | null; full_name: string | null;
    phone: string | null; role: string; is_active: boolean; device_fp: string | null; created_at: string;
  }) => ({
    ...p,
    ...(tokenMap[p.id] ?? { device_model: null, platform: null, os_version: null, app_version: null }),
  }));
  return { data: result };
}

/** حظر كل الحسابات المكررة ما عدا الحساب الرئيسي */
export async function banDuplicateAccounts(
  userIds: string[], primaryUserId?: string
): Promise<{ success: boolean; banned: number; errors: string[] }> {
  const targets = primaryUserId ? userIds.filter(id => id !== primaryUserId) : userIds;
  const errors: string[] = [];
  let banned = 0;
  await Promise.all(targets.map(async id => {
    const res = await toggleUserActive(id, false);
    if (res.error) errors.push(typeof res.error === 'string' ? res.error : String(res.error));
    else banned++;
  }));
  return { success: errors.length === 0, banned, errors };
}

/** حذف كل الحسابات المكررة ما عدا الحساب الرئيسي */
export async function deleteDuplicateAccounts(
  userIds: string[], primaryUserId?: string
): Promise<{ success: boolean; deleted: number; errors: string[] }> {
  const targets = primaryUserId ? userIds.filter(id => id !== primaryUserId) : userIds;
  const errors: string[] = [];
  let deleted = 0;
  await Promise.all(targets.map(async id => {
    const res = await deleteUserComplete(id);
    if (!res.success) errors.push(res.error ?? 'فشل الحذف');
    else deleted++;
  }));
  return { success: errors.length === 0, deleted, errors };
}
export async function repairOrphanAccounts(): Promise<{
  success: boolean;
  total_profiles: number;
  valid_accounts: number;
  orphan_count: number;
  orphans: Array<{ id: string; username: string | null; email: string | null }>;
  message: string;
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action: 'repair_orphan_accounts' },
  });
  if (error) return { success: false, total_profiles: 0, valid_accounts: 0, orphan_count: 0, orphans: [], message: '', error: error.message };
  return data as ReturnType<typeof repairOrphanAccounts> extends Promise<infer R> ? R : never;
}

/** إرسال إشعار لقائمة مستخدمين متضررين */
export async function notifyAffectedUsers(userIds: string[], title: string, message: string): Promise<{ success: boolean; sent: number; failed: number; message: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action: 'notify_affected_users', userIds, title, message },
  });
  if (error) return { success: false, sent: 0, failed: 0, message: '', error: error.message };
  return data as { success: boolean; sent: number; failed: number; message: string };
}

// ══════════════════════════════════════════════════════════════
// Notification Cleanup — حذف إشعارات قديمة (أكثر من 30 يوم)
// ══════════════════════════════════════════════════════════════
export async function cleanupOldNotifications(): Promise<void> {
  await supabase.rpc('cleanup_old_notifications');
}

// حذف كل إشعارات مستخدم بعينه (نهائي)
export async function deleteAllUserNotifications(userId: string) {
  const { error } = await supabase.rpc('delete_all_user_notifications', { p_user_id: userId });
  return { error };
}

// حذف الإشعارات القديمة تلقائياً
export async function purgeOldNotifications(days: number = 20) {
  const { data, error } = await supabase.rpc('purge_old_notifications', { p_days: days });
  return { deleted: data as number, error };
}

// جلب + حفظ إعداد مدة الاحتفاظ بالإشعارات
export async function getNotificationRetentionDays(): Promise<number> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'notification_retention_days').maybeSingle();
  return data ? parseInt(data.value) || 20 : 20;
}
export async function setNotificationRetentionDays(days: number) {
  const { error } = await supabase.from('app_settings').upsert({ key: 'notification_retention_days', value: String(days) }, { onConflict: 'key' });
  return { error };
}

// ==========================================
// الإشعارات المجدولة
// ==========================================
export async function getScheduledNotifications(): Promise<import('@/types/types').ScheduledNotification[]> {
  const { data } = await supabase
    .from('scheduled_notifications')
    .select('*')
    .order('scheduled_at', { ascending: false });
  return Array.isArray(data) ? data : [];
}

export async function createScheduledNotification(payload: {
  title: string; body: string; type: string; priority: string;
  action_url?: string; target_type: 'all' | 'specific'; target_user_id?: string; scheduled_at: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('scheduled_notifications').insert({ ...payload, created_by: user?.id });
  return { error };
}

export async function deleteScheduledNotification(id: string) {
  const { error } = await supabase.from('scheduled_notifications').delete().eq('id', id);
  return { error };
}

// تسليم الإشعارات — للأدمن
export async function getNotificationDeliveries(notificationId: string) {
  const { data } = await supabase
    .from('notification_deliveries')
    .select('*, profiles:user_id(username,email)')
    .eq('notification_id', notificationId);
  return Array.isArray(data) ? data : [];
}

export async function resendNotification(notifId: string) {
  // جلب الإشعار الأصلي وإعادة إرساله
  const { data: notif } = await supabase.from('notifications').select('*').eq('id', notifId).maybeSingle();
  if (!notif) return { error: new Error('لم يُعثر على الإشعار') };
  return sendNotification({ title: notif.title, body: notif.body, type: notif.type, priority: notif.priority, action_url: notif.action_url, user_id: notif.user_id, is_global: notif.is_global, send_push: true });
}

// ==========================================
// قوالب الإشعارات
// ==========================================
export interface NotificationTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  type: string;
  priority: string;
  action_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function getNotificationTemplates(): Promise<NotificationTemplate[]> {
  const { data } = await supabase
    .from('notification_templates')
    .select('*')
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function saveNotificationTemplate(tpl: Omit<NotificationTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<{ data: NotificationTemplate | null; error: unknown }> {
  const { data, error } = await supabase
    .from('notification_templates')
    .insert({ ...tpl, updated_at: new Date().toISOString() })
    .select()
    .single();
  return { data, error };
}

export async function updateNotificationTemplate(id: string, tpl: Partial<Omit<NotificationTemplate, 'id' | 'created_at'>>): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('notification_templates')
    .update({ ...tpl, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

export async function deleteNotificationTemplate(id: string): Promise<{ error: unknown }> {
  const { error } = await supabase.from('notification_templates').delete().eq('id', id);
  return { error };
}

// ==========================================
// قواعد الإشعارات التلقائية
// ==========================================
export interface AutomationRule {
  id: string;
  trigger_event: string;
  label: string;
  enabled: boolean;
  title_template: string;
  body_template: string;
  type: string;
  priority: string;
  action_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function getAutomationRules(): Promise<AutomationRule[]> {
  const { data } = await supabase
    .from('notification_automation_rules')
    .select('*')
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function toggleAutomationRule(id: string, enabled: boolean): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('notification_automation_rules')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

export async function updateAutomationRule(id: string, updates: Partial<Omit<AutomationRule, 'id' | 'created_at'>>): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('notification_automation_rules')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

// ==========================================
// إرسال إشعار لعدة مستخدمين
// ==========================================
export async function sendNotificationBulk(
  userIds: string[],
  payload: Omit<Parameters<typeof sendNotification>[0], 'user_id' | 'is_global'>
): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (const userId of userIds) {
    const { error } = await sendNotification({ ...payload, user_id: userId, is_global: false });
    if (error) failed++; else sent++;
  }
  return { sent, failed };
}

// جلب كل المستخدمين بدون pagination (للـ picker) — يستثني أعضاء التجار
export async function getAllProfilesForPicker(search = ''): Promise<Profile[]> {
  let query = supabase
    .from('profiles')
    .select('id, username, email, phone, avatar_url, full_name, role, is_active')
    .is('merchant_id', null)   // استثناء كامل لأعضاء التجار
    .order('username', { ascending: true })
    .limit(200);
  if (search.trim()) {
    query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  const { data } = await query;
  return (data ?? []) as Profile[];
}

// ==========================================
// لوحة الأدمن — بيانات الرسوم البيانية
// ==========================================
export type ChartPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface AdminChartPoint {
  label: string;
  operations: number;
  revenue: number;
  new_users: number;
}

export async function getAdminChartData(period: ChartPeriod): Promise<AdminChartPoint[]> {
  const now = new Date();
  const points: AdminChartPoint[] = [];

  if (period === 'daily') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const from = new Date(d); from.setHours(0, 0, 0, 0);
      const to   = new Date(d); to.setHours(23, 59, 59, 999);
      const [opsStats, usersR] = await Promise.all([
        getOperationsStats({ date_from: from.toISOString(), date_to: to.toISOString() }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', from.toISOString()).lte('created_at', to.toISOString()),
      ]);
      points.push({ label: d.toLocaleDateString('en-GB', { weekday: 'short' }), operations: opsStats.total, revenue: opsStats.total_amount, new_users: usersR.count ?? 0 });
    }
  } else if (period === 'weekly') {
    for (let i = 7; i >= 0; i--) {
      const from = new Date(now); from.setDate(from.getDate() - i * 7 - 6); from.setHours(0, 0, 0, 0);
      const to   = new Date(now); to.setDate(to.getDate() - i * 7);         to.setHours(23, 59, 59, 999);
      const [opsStats, usersR] = await Promise.all([
        getOperationsStats({ date_from: from.toISOString(), date_to: to.toISOString() }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', from.toISOString()).lte('created_at', to.toISOString()),
      ]);
      points.push({ label: `أسبوع ${8 - i}`, operations: opsStats.total, revenue: opsStats.total_amount, new_users: usersR.count ?? 0 });
    }
  } else if (period === 'monthly') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const [opsStats, usersR] = await Promise.all([
        getOperationsStats({ date_from: from.toISOString(), date_to: to.toISOString() }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', from.toISOString()).lte('created_at', to.toISOString()),
      ]);
      points.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), operations: opsStats.total, revenue: opsStats.total_amount, new_users: usersR.count ?? 0 });
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const yr = now.getFullYear() - i;
      const from = new Date(yr, 0, 1);
      const to   = new Date(yr, 11, 31, 23, 59, 59);
      const [opsStats, usersR] = await Promise.all([
        getOperationsStats({ date_from: from.toISOString(), date_to: to.toISOString() }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', from.toISOString()).lte('created_at', to.toISOString()),
      ]);
      points.push({ label: String(yr), operations: opsStats.total, revenue: opsStats.total_amount, new_users: usersR.count ?? 0 });
    }
  }
  return points;
}

// ==========================================
// لوحة الأدمن — تفاصيل كود واحد
// ==========================================
export interface CodeDetail {
  key: LicenseKey;
  trial_users: {
    user_id: string;
    ops_used: number;
    activated_at: string;
    subscription_status?: string;
    profile?: Pick<Profile, 'id' | 'username' | 'email'>;
  }[];
  ops_count: number;           // إجمالي عمليات المستخدمين المرتبطين
  active_users_count: number;  // المستخدمون النشطون الحاليون
  total_users_count: number;   // كل من فعّل الكود على الإطلاق
  ops_used_total: number;      // عمليات من trial_usage مجموعة
  logs: CodeLog[];
}

export async function getCodeDetail(keyId: string): Promise<CodeDetail | null> {
  const { data: key } = await supabase
    .from('license_keys')
    .select('*, used_by_profile:profiles!used_by(id, username, email)')
    .eq('id', keyId)
    .maybeSingle();
  if (!key) return null;

  const [trialR, opsR, logsR, activeSubsR, allSubsR] = await Promise.all([
    supabase
      .from('trial_usage')
      .select('user_id, ops_used, activated_at, profiles!user_id(id, username, email)')
      .eq('key_id', keyId),
    supabase
      .from('operations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', key.used_by ?? ''),
    supabase
      .from('code_logs')
      .select('*, profiles!user_id(username, email)')
      .eq('code_id', keyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('subscriptions')
      .select('user_id, status, ops_count')
      .eq('license_key_id', keyId)
      .eq('status', 'active'),
    supabase
      .from('subscriptions')
      .select('user_id, ops_count')
      .eq('license_key_id', keyId),
  ]);

  const activeUserIds = new Set((activeSubsR.data ?? []).map((s: { user_id: string }) => s.user_id));
  const trialUsers    = Array.isArray(trialR.data) ? trialR.data : [];
  const allSubs       = Array.isArray(allSubsR.data) ? allSubsR.data : [];

  // إجمالي العمليات: من trial_usage (تجريبي) أو subscriptions.ops_count (مدفوع/هدية)
  const opsUsedTotal = key.code_type === 'trial'
    ? trialUsers.reduce((s, t) => s + (t.ops_used as number ?? 0), 0)
    : allSubs.reduce((s, r) => s + ((r as { ops_count?: number }).ops_count ?? 0), 0);

  return {
    key,
    trial_users: trialUsers.map(t => ({
      user_id: t.user_id as string,
      ops_used: t.ops_used as number,
      activated_at: t.activated_at as string,
      subscription_status: activeUserIds.has(t.user_id as string) ? 'active' : 'inactive',
      profile: (t as { profiles?: { id?: string; username?: string | null; email?: string | null } }).profiles
        ? {
            id: (t as { profiles?: { id?: string } }).profiles?.id ?? '',
            username: (t as { profiles?: { username?: string | null } }).profiles?.username ?? null,
            email: (t as { profiles?: { email?: string | null } }).profiles?.email ?? null,
          } as Pick<Profile, 'id' | 'username' | 'email'>
        : undefined,
    })),
    ops_count:          opsR.count ?? 0,
    active_users_count: activeSubsR.data?.length ?? 0,
    total_users_count:  allSubs.length,
    ops_used_total:     opsUsedTotal,
    logs: Array.isArray(logsR.data) ? logsR.data : [],
  };
}

export async function getAdminOverview(): Promise<{
  total_users: number;
  active_subs: number;
  expired_subs: number;
  total_operations: number;
  total_success_operations: number;
  total_failed_operations: number;
  total_cards: number;
  total_revenue: number;
  total_codes: number;
  used_codes: number;
}> {
  const now = new Date().toISOString();

  const [
    usersRes,
    activeSubsRes,    // حالة active في DB
    expiredSubsRes,   // حالة expired في DB
    expiredByDateRes, // حالة active لكن ends_at انتهت (منتهية فعلياً)
    opsSuccessRes,
    opsFailedRes,
    cardsRes,
    codesRes,
  ] = await Promise.all([
    // إجمالي المستخدمين
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    // مشتركون نشطون فعلياً: حالتهم active وتاريخ الانتهاء لم يحِن بعد
    supabase.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .or('ends_at.is.null,ends_at.gte.' + now),
    // منتهيون بالحالة المسجّلة
    supabase.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'expired'),
    // نشطون لكن ends_at انتهت (لم تُحدَّث حالتهم بعد)
    supabase.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .not('ends_at', 'is', null)
      .lt('ends_at', now),
    // العمليات الناجحة فقط
    supabase.from('operations')
      .select('id, amount', { count: 'exact' })
      .eq('status', 'success'),
    // العمليات الفاشلة فقط
    supabase.from('operations')
      .select('id', { count: 'exact', head: true })
      .in('status', ['failed', 'error', 'insufficient_balance', 'timeout']),
    // عدد الكروت (العمليات الناجحة هي الكروت المشحونة)
    supabase.from('operations')
      .select('id, amount', { count: 'exact' })
      .eq('status', 'success'),
    // الأكواد
    supabase.from('license_keys').select('id, status', { count: 'exact' }),
  ]);

  const successOps = Array.isArray(opsSuccessRes.data) ? opsSuccessRes.data : [];
  const codes      = Array.isArray(codesRes.data)      ? codesRes.data      : [];

  const realActiveSubs  = activeSubsRes.count ?? 0;
  const realExpiredSubs = (expiredSubsRes.count ?? 0) + (expiredByDateRes.count ?? 0);
  const totalOps        = (opsSuccessRes.count ?? 0) + (opsFailedRes.count ?? 0);

  return {
    total_users:             usersRes.count ?? 0,
    active_subs:             realActiveSubs,
    expired_subs:            realExpiredSubs,
    total_operations:        totalOps,           // كل العمليات (ناجحة + فاشلة)
    total_success_operations: opsSuccessRes.count ?? 0,  // الناجحة فقط
    total_failed_operations:  opsFailedRes.count ?? 0,   // الفاشلة فقط
    total_cards:             successOps.length,  // الكروت = العمليات الناجحة
    total_revenue:           successOps.reduce((s, o) => s + (o.amount ?? 0), 0),
    total_codes:             codesRes.count ?? 0,
    used_codes:              codes.filter(c => c.status === 'used').length,
  };
}

// ==========================================
// لوحة الأدمن — تفاصيل مستخدم واحد
// ==========================================
export interface UserDetail {
  profile: Profile & { auth_last_sign_in?: string | null };
  subscription: Subscription | null;
  license_code: string | null;
  ops_count: number;         // إجمالي كل العمليات (ناجحة + فاشلة) — للعرض الإداري
  ops_limit: number | null;  // الحد الأقصى من license_key (null = غير محدود)
  total_cards: number;
  total_amount: number;
  phone_numbers: string[];
  last_operation: Operation | null;
  top_phone: string | null;
  top_product: string | null;
  notifications: Notification[];
  activity: ActivityEntry[];
  recent_ops: Operation[];
  // ─── حقول جديدة ───────────────────────────────────
  devices: Array<{
    id: string;
    token: string;
    device_info: { platform?: string; model?: string; os_version?: string };
    app_version: string | null;
    version_code: number | null;
    is_active: boolean;
    updated_at: string;
  }>;
  similar_accounts: Array<{
    id: string;
    username: string | null;
    email: string | null;
    phone: string | null;
    created_at: string;
  }>;
}

export async function getUserDetail(userId: string): Promise<UserDetail> {
  // استخدام get_user_detail_v2 لجلب auth_last_sign_in + إصلاح timezone bug تلقائياً
  const { data: v2 } = await supabase.rpc('get_user_detail_v2', { p_user_id: userId });

  const [opsRes, notifsRes, actRes, devicesRes] = await Promise.all([
    supabase.from('operations').select('*').eq('user_id', userId).order('performed_at', { ascending: false }).limit(200),
    supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
    supabase.from('activity_log').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('fcm_tokens').select('id, token, device_info, app_version, version_code, is_active, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }),
  ]);

  const ops: Operation[] = Array.isArray(opsRes.data) ? opsRes.data : [];

  // استخدام البيانات من v2 إذا نجحت، وإلا Fallback للاستعلام المباشر
  let profile: Profile & { auth_last_sign_in?: string | null };
  let subscription: Subscription | null;
  let license_code: string | null = null;
  let ops_limit: number | null = null;

  if (v2?.profile) {
    profile = v2.profile as Profile & { auth_last_sign_in?: string | null };
    subscription = v2.subscription as Subscription | null;
    license_code = v2.license_code as string | null;
  } else {
    // Fallback: استعلام مباشر
    const [profRes, subRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    profile = { ...(profRes.data as Profile), auth_last_sign_in: null };
    subscription = subRes.data ?? null;
    if (subscription?.license_key_id) {
      const { data: k } = await supabase.from('license_keys').select('code, operations_per_user, max_ops_per_user').eq('id', subscription.license_key_id).maybeSingle();
      license_code = k?.code ?? null;
      const raw = k?.operations_per_user ?? k?.max_ops_per_user ?? null;
      ops_limit = raw === 0 ? null : raw;
    }
  }

  // جلب ops_limit من license_key عند استخدام v2
  if (!ops_limit && subscription?.license_key_id) {
    const { data: kv2 } = await supabase.from('license_keys').select('operations_per_user, max_ops_per_user').eq('id', subscription.license_key_id).maybeSingle();
    const rawV2 = kv2?.operations_per_user ?? kv2?.max_ops_per_user ?? null;
    ops_limit = rawV2 === 0 ? null : rawV2;
  }

  // حسابات مشابهة (نفس رقم الهاتف)
  let similar_accounts: UserDetail['similar_accounts'] = [];
  if (profile.phone) {
    const { data: simData } = await supabase
      .from('profiles')
      .select('id, username, email, phone, created_at')
      .eq('phone', profile.phone)
      .neq('id', userId)
      .order('created_at', { ascending: false });
    similar_accounts = Array.isArray(simData) ? simData : [];
  }

  // إحصائيات متقدمة
  const phoneCounts: Record<string, number> = {};
  const productCounts: Record<string, number> = {};
  ops.forEach(o => {
    if (o.phone_number) phoneCounts[o.phone_number] = (phoneCounts[o.phone_number] ?? 0) + 1;
    if (o.card_type)    productCounts[o.card_type]   = (productCounts[o.card_type]   ?? 0) + 1;
  });
  const topPhone   = Object.entries(phoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    profile,
    subscription,
    license_code,
    ops_limit,
    ops_count: ops.length,                                          // كل العمليات
    total_cards: ops.filter(o => o.status === 'success').length,    // الكروت الناجحة فقط
    total_amount: ops.filter(o => o.status === 'success').reduce((s, o) => s + (o.amount ?? 0), 0),
    phone_numbers: [...new Set(ops.map(o => o.phone_number).filter(Boolean))],
    last_operation: ops[0] ?? null,
    top_phone: topPhone,
    top_product: topProduct,
    notifications: Array.isArray(notifsRes.data) ? notifsRes.data : [],
    activity: Array.isArray(actRes.data) ? actRes.data : [],
    recent_ops: ops.slice(0, 50),
    devices: Array.isArray(devicesRes.data) ? (devicesRes.data as UserDetail['devices']) : [],
    similar_accounts,
  };
}

// ══════════════════════════════════════════════════════════════
// Admin Audit Log — تسجيل عمليات الإدارة
// ══════════════════════════════════════════════════════════════
export interface AdminAuditLog {
  id: string;
  admin_id: string | null;
  admin_username: string | null;
  action: string;
  target_user_id: string | null;
  target_username: string | null;
  details: Record<string, unknown>;
  success: boolean;
  error_msg: string | null;
  created_at: string;
}

export async function logAdminAction(params: {
  adminId: string;
  action: string;
  targetUserId?: string;
  details?: Record<string, unknown>;
  success?: boolean;
  errorMsg?: string;
}): Promise<void> {
  await supabase.rpc('log_admin_action', {
    p_admin_id:       params.adminId,
    p_action:         params.action,
    p_target_user_id: params.targetUserId ?? null,
    p_details:        params.details ?? {},
    p_success:        params.success ?? true,
    p_error_msg:      params.errorMsg ?? null,
  }).then();
}

export async function getAdminAuditLogs(page = 1): Promise<PaginatedResult<AdminAuditLog>> {
  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;
  const { data, count } = await supabase
    .from('admin_audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize: PAGE_SIZE };
}

// ==========================================
// لوحة الأدمن — سجلات الأكواد
// ==========================================
export interface CodeLog {
  id: string;
  code_id: string | null;
  user_id: string | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  created_at: string;
  profile?: Pick<Profile, 'username' | 'email'>;
}

export async function getCodeLogs(codeId?: string, page = 1): Promise<PaginatedResult<CodeLog>> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let q = supabase
    .from('code_logs')
    .select('*, profiles!user_id(username, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (codeId) q = q.eq('code_id', codeId);
  const { data, count } = await q;
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function insertCodeLog(entry: { code_id?: string; user_id?: string; action: string; details?: string }) {
  await supabase.from('code_logs').insert(entry);
}

// ==========================================
// لوحة الأدمن — تحليل الأرقام
// ==========================================
export interface PhoneAnalytic {
  phone_number: string;
  usage_count: number;
  success_count: number;
  total_amount: number;
  last_used_at: string;
}

export async function getPhoneAnalytics(_userId?: string, page = 1): Promise<PaginatedResult<PhoneAnalytic>> {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  // phone_analytics is a VIEW over operations table — returns global aggregates by phone_number
  const { data, count } = await supabase
    .from('phone_analytics')
    .select('*', { count: 'exact' })
    .order('usage_count', { ascending: false })
    .range(from, to);
  return { data: Array.isArray(data) ? data : [], count: count ?? 0, page, pageSize: PAGE_SIZE };
}

// ════════════════════════════════════════════════
//  نظام الأصول المرئية الديناميكية — Asset Management
// ════════════════════════════════════════════════

export interface AppAsset {
  id: string;
  asset_key: string;
  folder: string;
  file_name: string | null;
  public_url: string;
  mime_type: string | null;
  file_size: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getAllAssets(): Promise<AppAsset[]> {
  const { data, error } = await supabase
    .from('app_assets')
    .select('*')
    .eq('is_active', true)
    .order('asset_key');
  if (error) { console.error('[Assets] getAll error:', error); return []; }
  return Array.isArray(data) ? data : [];
}

export async function getAssetByKey(key: string): Promise<AppAsset | null> {
  const { data, error } = await supabase
    .from('app_assets')
    .select('*')
    .eq('asset_key', key)
    .eq('is_active', true)
    .maybeSingle();
  if (error) { console.error('[Assets] getByKey error:', error); return null; }
  return data;
}

export async function upsertAsset(asset: Partial<AppAsset> & { asset_key: string; public_url: string }) {
  const { error } = await supabase
    .from('app_assets')
    .upsert({
      asset_key: asset.asset_key,
      folder: asset.folder ?? 'logos',
      file_name: asset.file_name ?? null,
      public_url: asset.public_url,
      mime_type: asset.mime_type ?? null,
      file_size: asset.file_size ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'asset_key' });
  return { error };
}

export async function uploadAssetToStorage(
  file: File,
  folder: string,
  fileName: string
): Promise<{ url: string | null; error: Error | null }> {
  const path = `${folder}/${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from('app-assets')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { url: null, error: uploadError };

  const { data: publicData } = supabase.storage
    .from('app-assets')
    .getPublicUrl(path);
  return { url: publicData?.publicUrl ?? null, error: null };
}

export async function deleteAssetFromStorage(folder: string, fileName: string) {
  const path = `${folder}/${fileName}`;
  const { error } = await supabase.storage.from('app-assets').remove([path]);
  return { error };
}

// P2: مسح سجل الأصل من DB (يُبقي الصف لكن يُفرّغ public_url)
export async function clearAssetRecord(assetKey: string) {
  const { error } = await supabase
    .from('app_assets')
    .update({ public_url: '', file_name: '', file_size: 0, updated_at: new Date().toISOString() })
    .eq('asset_key', assetKey);
  return { error };
}

// ==========================================
// PHASE 6+7: نظام الحدود الثنائي
// A) max_users / allowed_users → عدد المستخدمين
// B) uses_per_user / max_ops_per_user → عدد العمليات لكل مستخدم
// null = غير محدود ♾️
// ==========================================

// فحص حد العمليات لمستخدم داخل اشتراكه
export async function checkOpsLimit(userId: string): Promise<{
  allowed: boolean;
  opsUsed: number;
  opsLimit: number | null; // null = unlimited
  reason?: string;
}> {
  const sub = await getUserSubscription(userId);
  if (!sub || sub.status !== 'active') return { allowed: false, opsUsed: 0, opsLimit: null, reason: 'no_active_sub' };
  if (!sub.license_key_id) return { allowed: true, opsUsed: sub.ops_count ?? 0, opsLimit: null };

  const { data: key } = await supabase
    .from('license_keys')
    .select('operations_per_user, uses_per_user, max_ops_per_user')
    .eq('id', sub.license_key_id)
    .maybeSingle();

  const limit = (key?.operations_per_user ?? key?.max_ops_per_user) || null;
  const used  = sub.ops_count ?? 0;

  if (limit === null) return { allowed: true, opsUsed: used, opsLimit: null };
  return { allowed: used < limit, opsUsed: used, opsLimit: limit };
}

// زيادة عداد العمليات
export async function incrementSubscriptionOps(userId: string): Promise<void> {
  const sub = await getUserSubscription(userId);
  if (!sub) return;
  await supabase
    .from('subscriptions')
    .update({ ops_count: (sub.ops_count ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', sub.id);
}

// ==========================================
// PHASE 9: Linked Users Control Center
// ==========================================
export interface LinkedUserEntry {
  profile: Profile;
  subscription: Subscription | null;
  license_key: LicenseKey | null;
  license_code: string | null;
  ops_count: number;
  is_banned: boolean;
}

export async function getAllLinkedUsers(page = 1, search = ''): Promise<PaginatedResult<LinkedUserEntry>> {
  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let q = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .is('merchant_id', null)   // فصل كامل: لا تظهر أعضاء التجار في قائمة المستخدمين الأساسيين
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search) {
    q = q.or(`username.ilike.%${search}%,email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data: profiles, count } = await q;
  if (!Array.isArray(profiles)) return { data: [], count: 0, page, pageSize: PAGE_SIZE };

  const userIds = profiles.map(p => p.id);

  const [subsRes, opsRes] = await Promise.all([
    supabase.from('subscriptions').select('*, license_keys(*)').in('user_id', userIds).eq('status', 'active'),
    supabase.from('operations').select('user_id', { count: 'exact' }).in('user_id', userIds),
  ]);

  const subsMap = new Map<string, (Subscription & { license_keys?: LicenseKey | null })>();
  (Array.isArray(subsRes.data) ? subsRes.data : []).forEach(s => subsMap.set(s.user_id, s));

  const opsCountMap = new Map<string, number>();
  (Array.isArray(opsRes.data) ? opsRes.data : []).forEach(o => {
    opsCountMap.set(o.user_id, (opsCountMap.get(o.user_id) ?? 0) + 1);
  });

  const entries: LinkedUserEntry[] = profiles.map(p => {
    const sub = subsMap.get(p.id) ?? null;
    const lk  = sub ? (sub.license_keys ?? null) as LicenseKey | null : null;
    return {
      profile: p as Profile,
      subscription: sub ? ({ ...sub, license_keys: undefined } as Subscription) : null,
      license_key: lk,
      license_code: lk?.code ?? (sub as Subscription & { code_used?: string | null } | null)?.code_used ?? null,
      ops_count: opsCountMap.get(p.id) ?? 0,
      is_banned: !(p as Profile).is_active,
    };
  });

  return { data: entries, count: count ?? 0, page, pageSize: PAGE_SIZE };
}

// ==========================================
// PHASE 10: User Actions
// ==========================================

// تجديد الاشتراك — إعادة تفعيل نفس الكود بمدة جديدة
// تفعيل اشتراك مستخدم بكود يدوياً من لوحة التحكم (بدون device_fp)
export async function adminActivateByCode(
  userId: string,
  code: string,
  adminId?: string,
): Promise<{ success: boolean; error?: string; errorCode?: string; isTrial?: boolean }> {
  const { data, error } = await supabase.rpc('activate_license_key_v2', {
    p_user_id:   userId,
    p_code:      code.trim().toUpperCase(),
    p_device_fp: null, // الأدمن يتجاوز فحص الجهاز
  });
  if (error) return { success: false, error: 'فشل الاتصال بالسيرفر', errorCode: 'SERVER_ERROR' };
  const result = typeof data === 'string' ? JSON.parse(data) : data;
  if (result?.success && adminId) {
    await logAdminAction({
      adminId,
      action:       'admin_activate_by_code',
      targetUserId: userId,
      details:      { code, isTrial: !!result.isTrial },
    });
  }
  return { success: !!result?.success, error: result?.error, errorCode: result?.errorCode, isTrial: !!result?.isTrial };
}

// معاينة تفاصيل الكود قبل التفعيل
export interface LicenseCodePreview {
  code:         string;
  code_type:    string;
  status:       string;
  duration:     number;
  used_count:   number;
  max_users:    number | null;
  expiry_date:  string | null;
}

export async function previewLicenseCode(code: string): Promise<{ found: boolean; data?: LicenseCodePreview; error?: string }> {
  const { data, error } = await supabase
    .from('license_keys')
    .select('code, code_type, status, duration_days, custom_duration_days, used_count, max_users, allowed_users, expiry_date')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();
  if (error) return { found: false, error: 'خطأ في الاتصال' };
  if (!data)  return { found: false, error: 'الكود غير موجود' };
  return {
    found: true,
    data: {
      code:        data.code,
      code_type:   data.code_type ?? 'paid',
      status:      data.status,
      duration:    data.custom_duration_days ?? data.duration_days ?? 1,
      used_count:  data.used_count ?? 0,
      max_users:   data.allowed_users ?? data.max_users ?? null,
      expiry_date: data.expiry_date ?? null,
    },
  };
}

export async function renewUserSubscription(userId: string, extraDays: number, adminId?: string): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };
  const base = sub.expires_at && new Date(sub.expires_at) > new Date() ? new Date(sub.expires_at) : new Date();
  base.setDate(base.getDate() + extraDays);
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'active', expires_at: base.toISOString(), in_grace_period: false, grace_started_at: null, grace_ends_at: null, updated_at: new Date().toISOString() })
    .eq('id', sub.id);
  if (error) return { success: false, error: `فشل تجديد الاشتراك: ${error.message}` };
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'renewal', title: 'تجديد اشتراك', description: `تم تجديد الاشتراك بـ ${extraDays} يوم` });
  await insertSystemLog({ user_id: userId, level: 'info', action: 'admin_renew_subscription', message: `تجديد ${extraDays} يوم`, metadata: { sub_id: sub.id, extraDays } });
  if (adminId) await logAdminAction({ adminId, action: 'renew_subscription', targetUserId: userId, details: { sub_id: sub.id, extraDays, new_expiry: base.toISOString() } });
  return { success: true };
}

// إعادة تفعيل الاشتراك الملغي/المنتهي بناءً على مدة الكود الأصلي
export async function reactivateUserSubscription(userId: string): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك' };
  // احسب المدة من الكود الأصلي
  let durationDays = 30; // افتراضي
  if (sub.license_key_id) {
    const { data: key } = await supabase.from('license_keys').select('duration_days, custom_duration_days').eq('id', sub.license_key_id).maybeSingle();
    if (key) durationDays = key.custom_duration_days ?? key.duration_days ?? 30;
  }
  const newExpiry = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  const { error } = await supabase.from('subscriptions').update({
    status: 'active',
    expires_at: newExpiry.toISOString(),
    ops_count: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'reactivated', title: 'إعادة تفعيل اشتراك', description: `تم إعادة التفعيل لمدة ${durationDays} يوم` });
  await insertSystemLog({ user_id: userId, level: 'info', action: 'admin_reactivate_subscription', metadata: { sub_id: sub.id, durationDays } });
  return { success: true };
}

// إزالة المستخدم من الكود نهائياً: إلغاء اشتراكه + فك الربط + تخفيض used_count
export async function removeUserFromCode(userId: string): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك' };
  const keyId = sub.license_key_id;
  // 1. إلغاء الاشتراك وفك الربط
  const { error } = await supabase.from('subscriptions').update({
    status: 'cancelled',
    expires_at: new Date().toISOString(),
    license_key_id: null,
    code_used: null,
    updated_at: new Date().toISOString(),
  }).eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  // 2. تخفيض used_count في الكود
  if (keyId) {
    await supabase.rpc('decrement_key_used_count', { p_key_id: keyId });
  }
  await syncHistoryStatus(userId, 'cancelled', 'cancelled_by_admin');
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'removed_from_code', title: 'إزالة من الكود', description: 'تم إزالة المستخدم من الكود وإلغاء اشتراكه' });
  await insertSystemLog({ user_id: userId, level: 'warning', action: 'admin_remove_user_from_code', metadata: { sub_id: sub.id, key_id: keyId } });
  return { success: true };
}
export async function extendUserSubscription(userId: string, newExpiresAt: string): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك' };
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'active', expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'extension', title: 'تمديد اشتراك', description: `تم تمديد الاشتراك حتى ${new Date(newExpiresAt).toLocaleDateString('en-GB')}` });
  await insertSystemLog({ user_id: userId, level: 'info', action: 'admin_extend_subscription', metadata: { sub_id: sub.id, newExpiresAt } });
  return { success: true };
}

// إلغاء الاشتراك
export async function cancelUserSubscription(userId: string, adminId?: string): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', expires_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', sub.id);
  if (error) return { success: false, error: `فشل إلغاء الاشتراك: ${error.message}` };
  await syncHistoryStatus(userId, 'cancelled', 'cancelled_by_admin');
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'cancellation', title: 'إلغاء اشتراك', description: 'تم إلغاء الاشتراك من قبل الإدارة' });
  await insertSystemLog({ user_id: userId, level: 'warning', action: 'admin_cancel_subscription', metadata: { sub_id: sub.id } });
  if (adminId) await logAdminAction({ adminId, action: 'cancel_subscription', targetUserId: userId, details: { sub_id: sub.id } });
  return { success: true };
}

// تعطيل / تفعيل الاشتراك (تعليق مؤقت)
export async function suspendUserSubscription(userId: string, suspend: boolean, adminId?: string): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: suspend ? 'suspended' : 'active', updated_at: new Date().toISOString() })
    .eq('id', sub.id);
  if (error) return { success: false, error: `فشل تحديث حالة الاشتراك: ${error.message}` };
  await supabase.from('activity_log').insert({ user_id: userId, event_type: suspend ? 'suspended' : 'reactivated', title: suspend ? 'تعليق اشتراك' : 'إعادة تفعيل اشتراك', description: '' });
  await insertSystemLog({ user_id: userId, level: 'info', action: suspend ? 'admin_suspend_subscription' : 'admin_activate_subscription', metadata: { sub_id: sub.id } });
  if (adminId) await logAdminAction({ adminId, action: suspend ? 'suspend_subscription' : 'reactivate_subscription', targetUserId: userId, details: { sub_id: sub.id } });
  return { success: true };
}

// حظر / رفع الحظر عن مستخدم
export async function banUser(userId: string, ban: boolean, adminId?: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('profiles').update({ is_active: !ban, updated_at: new Date().toISOString() }).eq('id', userId);
  if (error) return { success: false, error: `فشل تحديث حالة المستخدم: ${error.message}` };
  await supabase.from('activity_log').insert({ user_id: userId, event_type: ban ? 'banned' : 'unbanned', title: ban ? 'حظر مستخدم' : 'رفع الحظر', description: '' });
  await insertSystemLog({ user_id: userId, level: ban ? 'warning' : 'info', action: ban ? 'admin_ban_user' : 'admin_unban_user', metadata: { user_id: userId } });
  if (adminId) await logAdminAction({ adminId, action: ban ? 'ban_user' : 'unban_user', targetUserId: userId, details: { is_active: !ban } });
  return { success: true };
}

// إزالة ربط المستخدم بالكود
export async function unlinkUserFromCode(userId: string, adminId?: string): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };
  const { error } = await supabase
    .from('subscriptions')
    .update({ license_key_id: null, code_used: null, updated_at: new Date().toISOString() })
    .eq('id', sub.id);
  if (error) return { success: false, error: `فشل إزالة الربط: ${error.message}` };
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'unlinked', title: 'إزالة الربط', description: 'تم إزالة ربط الكود عن المستخدم' });
  await insertSystemLog({ user_id: userId, level: 'warning', action: 'admin_unlink_user', metadata: { sub_id: sub.id } });
  if (adminId) await logAdminAction({ adminId, action: 'unlink_from_code', targetUserId: userId, details: { sub_id: sub.id, prev_code: sub.code_used } });
  return { success: true };
}

// تغيير كود المستخدم
export async function changeUserCode(userId: string, newKeyId: string, newCode: string, adminId?: string): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };
  const { error } = await supabase
    .from('subscriptions')
    .update({ license_key_id: newKeyId, code_used: newCode, updated_at: new Date().toISOString() })
    .eq('id', sub.id);
  if (error) return { success: false, error: `فشل تغيير الكود: ${error.message}` };
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'code_changed', title: 'تغيير الكود', description: `تم تغيير الكود إلى ${newCode}` });
  if (adminId) await logAdminAction({ adminId, action: 'change_code', targetUserId: userId, details: { new_code: newCode, prev_code: sub.code_used } });
  return { success: true };
}

// ==========================================
// PHASE 11: Subscription Editor
// ==========================================
export async function updateSubscriptionExpiry(
  userId: string,
  daysToAdd: number | null,
  exactDate?: string,
  adminId?: string
): Promise<{ success: boolean; error?: string; newExpiry?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };

  let newExpiry: Date;
  if (exactDate) {
    newExpiry = new Date(exactDate);
  } else if (daysToAdd !== null) {
    const base = sub.expires_at && new Date(sub.expires_at) > new Date()
      ? new Date(sub.expires_at) : new Date();
    newExpiry = new Date(base);
    newExpiry.setDate(newExpiry.getDate() + daysToAdd);
  } else {
    return { success: false, error: 'يجب تحديد مدة أو تاريخ' };
  }

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'active', expires_at: newExpiry.toISOString(), in_grace_period: false, grace_started_at: null, grace_ends_at: null, updated_at: new Date().toISOString() })
    .eq('id', sub.id);

  if (error) return { success: false, error: `فشل تعديل تاريخ الانتهاء: ${error.message}` };
  await supabase.from('activity_log').insert({
    user_id: userId,
    event_type: 'subscription_edited',
    title: 'تعديل الاشتراك',
    description: exactDate
      ? `تم تحديد تاريخ الانتهاء: ${newExpiry.toLocaleDateString('ar-EG')}`
      : `تم إضافة ${daysToAdd} يوم`,
    metadata: { new_expires_at: newExpiry.toISOString() },
  });
  if (adminId) await logAdminAction({ adminId, action: 'edit_subscription_expiry', targetUserId: userId, details: { new_expiry: newExpiry.toISOString(), days_added: daysToAdd } });
  return { success: true, newExpiry: newExpiry.toISOString() };
}

// ==========================================
// PHASE 13: DB Audit
// ==========================================
export interface DBAuditReport {
  total_profiles: number;
  total_subscriptions: number;
  active_subscriptions: number;
  expired_subscriptions: number;
  total_license_keys: number;
  active_keys: number;
  used_keys: number;
  total_gift_claims: number;
  pending_gift_claims: number;
  claimed_gifts: number;
  total_operations: number;
  orphan_subscriptions: number;
  mismatched_used_count: number;
  duplicate_active_subs: number;
  check_time: string;
}

export async function runSystemIntegrityCheck(): Promise<DBAuditReport | null> {
  const { data, error } = await supabase.rpc('get_system_integrity_report');
  if (error || !data) return null;
  return data as DBAuditReport;
}

export async function repairUsedCount(): Promise<{ fixedRows: number; error?: string }> {
  const { data, error } = await supabase.rpc('repair_used_count');
  if (error) return { fixedRows: 0, error: error.message };
  return { fixedRows: (data as { fixed_rows?: number })?.fixed_rows ?? 0 };
}

// ==========================================
// إعدادات التحديث الإجباري (Force Update)
// ==========================================

/** جلب الحد الأدنى للإصدار المطلوب — 0 = لا إجبار */
export async function getMinVersionCode(): Promise<number> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'min_version_code')
    .maybeSingle();
  return parseInt((data as { value?: string } | null)?.value ?? '0', 10) || 0;
}

/** تعيين الحد الأدنى للإصدار المطلوب (من لوحة الإدارة) */
export async function setMinVersionCode(code: number): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'min_version_code', value: String(code), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { error: error.message };
  return {};
}

// ==========================================
// Merchant API — Phase 1 Foundation
// ==========================================
import type { Merchant, MerchantStats, MerchantFull, MerchantDetail } from '@/types/types';

/** جلب بيانات تاجر بواسطة ID */
export async function getMerchant(merchantId: string): Promise<Merchant | null> {
  const { data, error } = await supabase
    .from('merchants')
    .select('*')
    .eq('id', merchantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Merchant;
}

/** جلب كل التجار — للأدمن فقط */
export async function getAllMerchants(): Promise<Merchant[]> {
  const { data } = await supabase
    .from('merchants')
    .select('*')
    .order('created_at', { ascending: false });
  return Array.isArray(data) ? (data as Merchant[]) : [];
}

/** إنشاء تاجر جديد */
export async function createMerchant(params: {
  name: string;
  notes?: string;
  created_by: string;
}): Promise<{ merchant: Merchant | null; error?: string }> {
  const { data, error } = await supabase
    .from('merchants')
    .insert({
      name: params.name,
      notes: params.notes ?? null,
      created_by: params.created_by,
    })
    .select()
    .single();
  if (error) return { merchant: null, error: error.message };
  return { merchant: data as Merchant };
}

/** تحديث حالة التاجر */
export async function updateMerchantStatus(
  merchantId: string,
  status: import('@/types/types').MerchantStatus
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('merchants')
    .update({ status })
    .eq('id', merchantId);
  if (error) return { error: error.message };
  return {};
}

/** جلب إحصائيات التاجر (users count, active, blocked) */
export async function getMerchantStats(merchantId: string): Promise<MerchantStats> {
  const { data } = await supabase.rpc('get_merchant_stats', { p_merchant_id: merchantId });
  return (data as MerchantStats) ?? { total_users: 0, active_users: 0, blocked_users: 0 };
}

/** جلب المستخدمين التابعين للتاجر */
export async function getMerchantUsers(merchantId: string, page = 1, pageSize = 20) {
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;
  const { data, count } = await supabase
    .from('profiles')
    .select('id, username, email, role, is_active, created_at', { count: 'exact' })
    .eq('merchant_id', merchantId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .range(from, to);
  return { data: Array.isArray(data) ? data : [], count: count ?? 0 };
}

/** تعيين مستخدم لتاجر (role يصبح user + merchant_id) */
export async function assignUserToMerchant(
  userId: string,
  merchantId: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('profiles')
    .update({ merchant_id: merchantId })
    .eq('id', userId);
  if (error) return { error: error.message };
  return {};
}

/** جلب تاجر برمز الدعوة */
export async function getMerchantByInviteCode(code: string): Promise<Merchant | null> {
  const { data, error } = await supabase.rpc('get_merchant_by_invite_code', { p_code: code });
  if (error || !data?.length) return null;
  return (data as Merchant[])[0];
}

/** توليد رابط الدعوة الكامل */
export function generateMerchantInviteLink(inviteCode: string): string {
  const BASE = 'https://vchmsnavyhripakyvzom.supabase.co/functions/v1/serve-app';
  return `${BASE}?merchant=${inviteCode}`;
}

// ─── Phase 2: Promote / Demote / Regenerate ──────────────────────────────────

/** ترقية مستخدم عادي إلى تاجر (atomic — يُنشئ أو يُعيد تفعيل ملف التاجر) */
export async function promoteToMerchant(
  userId: string,
  adminId?: string
): Promise<{ success: boolean; merchant_id?: string; invite_code?: string; is_restored?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('promote_to_merchant', {
    p_user_id:  userId,
    p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; merchant_id?: string; invite_code?: string; is_restored?: boolean; error?: string };
  return result;
}

/** تحويل تاجر إلى مستخدم عادي (يؤرشف البيانات، لا يحذف) */
export async function demoteToUser(
  userId: string,
  adminId?: string
): Promise<{ success: boolean; merchant_id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('demote_to_user', {
    p_user_id:  userId,
    p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; merchant_id?: string; error?: string };
  return result;
}

/** إعادة توليد كود الدعوة للتاجر */
export async function regenerateInviteCode(
  merchantId: string
): Promise<{ success: boolean; invite_code?: string; error?: string }> {
  const { data, error } = await supabase.rpc('regenerate_invite_code', { p_merchant_id: merchantId });
  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; invite_code?: string; error?: string };
  return result;
}

// ─── Phase 3: Invite Validation + Merchant User Management ───────────────────

/** التحقق من صلاحية كود الدعوة */
export async function validateInviteCode(code: string): Promise<{
  valid: boolean;
  merchant_id?: string;
  merchant_name?: string;
  invite_code?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('validate_invite_code', { p_code: code });
  if (error) return { valid: false, error: error.message };
  return data as { valid: boolean; merchant_id?: string; merchant_name?: string; invite_code?: string; error?: string };
}

/** تعيين مستخدم لتاجر عبر RPC الآمن */
export async function assignUserToMerchantSecure(
  userId: string,
  merchantId: string,
  inviteCode?: string,
  source = 'invite_link',
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('assign_user_to_merchant', {
    p_user_id:     userId,
    p_merchant_id: merchantId,
    p_invite_code: inviteCode ?? null,
    p_source:      source,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** جلب مستخدمي التاجر مع pagination + فلترة */
export interface MerchantUsersResult {
  data: import('@/types/types').Profile[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
export async function getMerchantUsersPaged(
  merchantId: string,
  opts: { search?: string; status?: string; page?: number; pageSize?: number } = {},
): Promise<MerchantUsersResult> {
  const { data, error } = await supabase.rpc('get_merchant_users', {
    p_merchant_id: merchantId,
    p_search:      opts.search   ?? null,
    p_status:      opts.status   ?? null,
    p_page:        opts.page     ?? 1,
    p_page_size:   opts.pageSize ?? 20,
  });
  if (error) return { data: [], total: 0, page: 1, page_size: 20, pages: 0 };
  const r = data as { data: unknown[]; total: number; page: number; page_size: number; pages: number };
  return r as MerchantUsersResult;
}

/** إحصائيات مستخدمي التاجر */
export async function getMerchantUserStats(merchantId: string): Promise<{
  total: number; active: number; suspended: number; blocked: number; pending: number;
}> {
  const { data } = await supabase.rpc('get_merchant_user_stats', { p_merchant_id: merchantId });
  const d = (data ?? {}) as Record<string, number>;
  return {
    total:     d.total     ?? 0,
    active:    d.active    ?? 0,
    suspended: d.suspended ?? 0,
    blocked:   d.blocked   ?? 0,
    pending:   d.pending   ?? 0,
  };
}

// ─── Phase 4: Merchant Promotion & Control Core ──────────────────────────────

/** جلب كل التجار مع الإحصائيات الكاملة — Admin only */
export async function getAllMerchantsWithStats(): Promise<MerchantFull[]> {
  const { data, error } = await supabase.rpc('get_all_merchants_with_stats');
  if (error) return [];
  return Array.isArray(data) ? (data as MerchantFull[]) : [];
}

/** جلب تفاصيل تاجر واحد مع كل بياناته — Admin only */
export async function getMerchantDetail(merchantId: string): Promise<MerchantDetail | null> {
  const { data, error } = await supabase.rpc('get_merchant_detail', { p_merchant_id: merchantId });
  if (error || !data) return null;
  const r = data as { success: boolean } & MerchantDetail;
  return r.success ? r : null;
}

/** تحديث حالة دعوة التاجر (active / disabled / expired) */
export async function updateMerchantInviteStatus(
  merchantId: string,
  status: 'active' | 'disabled' | 'expired',
  adminId?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('update_merchant_invite_status', {
    p_merchant_id: merchantId,
    p_status:      status,
    p_admin_id:    adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** تحديث حالة التاجر عبر RPC الآمن (admin_only) */
export async function updateMerchantStatusAdmin(
  merchantId: string,
  status: import('@/types/types').MerchantStatus,
  adminId?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('update_merchant_status_admin', {
    p_merchant_id: merchantId,
    p_status:      status,
    p_admin_id:    adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** تحديث حالة مستخدم تابع للتاجر (RBAC: التاجر يعدّل مستخدميه فقط) */
export async function updateMerchantUserStatus(
  merchantId: string,
  userId: string,
  newStatus: import('@/types/types').MerchantUserStatus,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('update_merchant_user_status', {
    p_merchant_id: merchantId,
    p_user_id:     userId,
    p_new_status:  newStatus,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

// ─── Phase 5: Merchant Wallet & Points Engine ────────────────────────────────

import type { MerchantWallet, MerchantLedgerEntry } from '@/types/types';

/** جلب محفظة التاجر */
export async function getMerchantWallet(merchantId: string): Promise<{ success: boolean; wallet?: MerchantWallet | null; error?: string }> {
  const { data, error } = await supabase.rpc('get_merchant_wallet', { p_merchant_id: merchantId });
  if (error) return { success: false, error: error.message };
  const r = data as { success: boolean; wallet: MerchantWallet | null };
  return { success: r.success, wallet: r.wallet };
}

/** شحن نقاط للتاجر — مع دعم تاريخ انتهاء النقاط */
export async function merchantWalletRecharge(
  merchantId: string,
  amount: number,
  reason?: string,
  notes?: string,
  adminId?: string,
  pointsExpiresAt?: string | null,
): Promise<{ success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string }> {
  const idempotencyKey = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const { data, error } = await supabase.rpc('merchant_wallet_recharge', {
    p_merchant_id:      merchantId,
    p_amount:           amount,
    p_admin_id:         adminId          ?? null,
    p_reason:           reason           ?? 'admin_recharge',
    p_notes:            notes            ?? null,
    p_idempotency_key:  idempotencyKey,
    p_points_expires_at: pointsExpiresAt ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string };
}

/** خصم نقاط من التاجر */
export async function merchantWalletDeduct(
  merchantId: string,
  amount: number,
  reason?: string,
  notes?: string,
  adminId?: string,
): Promise<{ success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string }> {
  const idempotencyKey = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const { data, error } = await supabase.rpc('merchant_wallet_deduct', {
    p_merchant_id: merchantId,
    p_amount: amount,
    p_reason: reason ?? null,
    p_notes: notes ?? null,
    p_idempotency_key: idempotencyKey,
    p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string };
}

/** إرجاع نقاط للتاجر */
export async function merchantWalletRefund(
  merchantId: string,
  amount: number,
  reason?: string,
  notes?: string,
  adminId?: string,
): Promise<{ success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string }> {
  const idempotencyKey = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const { data, error } = await supabase.rpc('merchant_wallet_refund', {
    p_merchant_id: merchantId,
    p_amount: amount,
    p_reason: reason ?? null,
    p_notes: notes ?? null,
    p_idempotency_key: idempotencyKey,
    p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string };
}

/** تعديل رصيد التاجر (موجب أو سالب) */
export async function merchantWalletAdjust(
  merchantId: string,
  amount: number,
  reason?: string,
  notes?: string,
  adminId?: string,
): Promise<{ success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string }> {
  const idempotencyKey = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const { data, error } = await supabase.rpc('merchant_wallet_adjust', {
    p_merchant_id: merchantId,
    p_amount: amount,
    p_reason: reason ?? null,
    p_notes: notes ?? null,
    p_idempotency_key: idempotencyKey,
    p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string };
}

/** جلب سجل عمليات التاجر (Ledger) */
export async function getMerchantLedger(
  merchantId: string,
  opts: { limit?: number; offset?: number; type?: string } = {},
): Promise<{ success: boolean; total?: number; items?: MerchantLedgerEntry[]; error?: string }> {
  const { data, error } = await supabase.rpc('get_merchant_ledger', {
    p_merchant_id: merchantId,
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
    p_type: opts.type ?? null,
  });
  if (error) return { success: false, error: error.message };
  const r = data as { success: boolean; total: number; items: MerchantLedgerEntry[] };
  return { success: r.success, total: r.total, items: r.items };
}

// ─── Phase 6: Merchant Members & Subscription System ─────────────────────────

import type {
  MerchantMember, MemberSubscription, MemberLedgerEntry, MemberStatsResult,
} from '@/types/types';

/** جلب أعضاء التاجر مع Pagination + فلترة */
export async function getMerchantMembersPaged(
  merchantId: string,
  opts: { search?: string; status?: string; page?: number; pageSize?: number } = {},
): Promise<{ success: boolean; total: number; pages: number; items: MerchantMember[] }> {
  const { data, error } = await supabase.rpc('get_merchant_members_paged', {
    p_merchant_id: merchantId,
    p_search:      opts.search   ?? null,
    p_status:      opts.status   ?? null,
    p_page:        opts.page     ?? 1,
    p_page_size:   opts.pageSize ?? 20,
  });
  if (error) return { success: false, total: 0, pages: 0, items: [] };
  const r = data as { success: boolean; total: number; pages: number; items: MerchantMember[] };
  return { success: r.success, total: r.total, pages: r.pages, items: r.items ?? [] };
}

/** إحصائيات أعضاء التاجر */
export async function getMerchantMembersStats(merchantId: string): Promise<MemberStatsResult> {
  const { data } = await supabase.rpc('get_merchant_members_stats', { p_merchant_id: merchantId });
  const d = (data ?? {}) as Record<string, number>;
  return {
    total: d.total ?? 0, active: d.active ?? 0, suspended: d.suspended ?? 0,
    blocked: d.blocked ?? 0, pending: d.pending ?? 0, expired: d.expired ?? 0,
    total_assigned: d.total_assigned ?? 0, total_consumed: d.total_consumed ?? 0, total_remaining: d.total_remaining ?? 0,
  };
}

/** جلب تفاصيل عضو واحد */
export async function getMerchantMember(
  merchantId: string, userId: string
): Promise<{ success: boolean; member: MerchantMember | null; subscription: MemberSubscription | null }> {
  const { data, error } = await supabase.rpc('get_merchant_member', { p_merchant_id: merchantId, p_user_id: userId });
  if (error) return { success: false, member: null, subscription: null };
  const r = data as { success: boolean; member: MerchantMember | null; subscription: MemberSubscription | null };
  return { success: r.success, member: r.member, subscription: r.subscription };
}

/** توزيع نقاط على عضو (يخصم من محفظة التاجر) */
export async function assignPointsToMember(
  merchantId: string, userId: string, amount: number,
  reason?: string, notes?: string, adminId?: string,
): Promise<{ success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string }> {
  const ik = crypto.randomUUID?.() ?? `${Date.now()}`;
  const { data, error } = await supabase.rpc('assign_points_to_member', {
    p_merchant_id: merchantId, p_user_id: userId, p_amount: amount,
    p_reason: reason ?? null, p_notes: notes ?? null,
    p_admin_id: adminId ?? null, p_idempotency_key: ik,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; transaction_id?: string; balance_before?: number; balance_after?: number; error?: string };
}

/** زيادة نقاط عضو */
export async function increaseMemberPoints(
  merchantId: string, userId: string, amount: number,
  reason?: string, notes?: string, adminId?: string,
): Promise<{ success: boolean; error?: string }> {
  const ik = crypto.randomUUID?.() ?? `${Date.now()}`;
  const { data, error } = await supabase.rpc('increase_member_points', {
    p_merchant_id: merchantId, p_user_id: userId, p_amount: amount,
    p_reason: reason ?? null, p_notes: notes ?? null,
    p_admin_id: adminId ?? null, p_idempotency_key: ik,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** تقليل نقاط عضو */
export async function decreaseMemberPoints(
  merchantId: string, userId: string, amount: number,
  reason?: string, notes?: string, adminId?: string,
): Promise<{ success: boolean; error?: string }> {
  const ik = crypto.randomUUID?.() ?? `${Date.now()}`;
  const { data, error } = await supabase.rpc('decrease_member_points', {
    p_merchant_id: merchantId, p_user_id: userId, p_amount: amount,
    p_reason: reason ?? null, p_notes: notes ?? null,
    p_admin_id: adminId ?? null, p_idempotency_key: ik,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** تفعيل اشتراك عضو */
export async function activateMemberSubscription(
  merchantId: string, userId: string,
  days = 30, points = 0, startDate?: string, adminId?: string,
): Promise<{ success: boolean; start_date?: string; end_date?: string; error?: string }> {
  const { data, error } = await supabase.rpc('activate_member_subscription', {
    p_merchant_id: merchantId, p_user_id: userId,
    p_days: days, p_points: points,
    p_start_date: startDate ?? null, p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; start_date?: string; end_date?: string; error?: string };
}

/** تجديد اشتراك عضو */
export async function renewMemberSubscription(
  merchantId: string, userId: string,
  days = 30, points = 0, startDate?: string, adminId?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('renew_member_subscription', {
    p_merchant_id: merchantId, p_user_id: userId,
    p_days: days, p_points: points,
    p_start_date: startDate ?? null, p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** تغيير حالة عضو (suspend / resume / block / expire) */
export async function setMemberStatus(
  merchantId: string, userId: string, newStatus: string, adminId?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('set_member_status', {
    p_merchant_id: merchantId, p_user_id: userId,
    p_new_status: newStatus, p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** إلغاء اشتراك عضو — PHASE 10 */
export async function cancelMemberSubscription(
  merchantId: string, userId: string, adminId?: string,
): Promise<{ success: boolean; cancelled_sub_id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('cancel_member_subscription', {
    p_merchant_id: merchantId, p_user_id: userId,
    p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; cancelled_sub_id?: string; error?: string };
}

/** التحقق من أهلية إنشاء اشتراك — PHASE 9 */
export async function validateMerchantSubscriptionEligibility(
  merchantId: string, userId: string, days: number, points: number,
): Promise<{ eligible: boolean; error?: string; current_balance?: number; points_expire?: string }> {
  const { data, error } = await supabase.rpc('validate_merchant_subscription_eligibility', {
    p_merchant_id: merchantId, p_user_id: userId, p_days: days, p_points: points,
  });
  if (error) return { eligible: false, error: error.message };
  return data as { eligible: boolean; error?: string; current_balance?: number; points_expire?: string };
}

/** حذف عضوية */
export async function deleteMerchantMember(
  merchantId: string, userId: string, adminId?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('delete_merchant_member', {
    p_merchant_id: merchantId, p_user_id: userId, p_admin_id: adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** جلب سجل عمليات عضو */
export async function getMemberHistory(
  merchantId: string, userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ success: boolean; total: number; items: MemberLedgerEntry[] }> {
  const { data, error } = await supabase.rpc('get_member_history', {
    p_merchant_id: merchantId, p_user_id: userId,
    p_limit: opts.limit ?? 50, p_offset: opts.offset ?? 0,
  });
  if (error) return { success: false, total: 0, items: [] };
  const r = data as { success: boolean; total: number; items: MemberLedgerEntry[] };
  return { success: r.success, total: r.total, items: r.items ?? [] };
}

/** Admin: جلب كل الأعضاء من كل التجار */
export async function adminGetAllMembers(opts: {
  search?: string; status?: string; merchant?: string; page?: number; pageSize?: number;
} = {}): Promise<{ success: boolean; total: number; pages: number; items: MerchantMember[] }> {
  const { data, error } = await supabase.rpc('admin_get_all_members', {
    p_search:    opts.search   ?? null,
    p_status:    opts.status   ?? null,
    p_merchant:  opts.merchant ?? null,
    p_page:      opts.page     ?? 1,
    p_page_size: opts.pageSize ?? 30,
  });
  if (error) return { success: false, total: 0, pages: 0, items: [] };
  const r = data as { success: boolean; total: number; pages: number; items: MerchantMember[] };
  return { success: r.success, total: r.total, pages: r.pages, items: r.items ?? [] };
}

// ══════════════════════════════════════════════════════════════════
// Phase 7: Merchant Invite Token APIs — Additive Only
// ══════════════════════════════════════════════════════════════════
import type { MerchantInvite, PendingInviteToken, InviteTokenStatus } from '@/types/types';

/** المفتاح المستخدم لتخزين دعوة الانتظار في localStorage */
export const INVITE_TOKEN_KEY = 'vfp_pending_invite_v2';

/** مدة صلاحية الدعوة المحلية: 24 ساعة */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/** حفظ بيانات الدعوة مؤقتاً في localStorage */
export function storePendingInviteToken(invite: PendingInviteToken): void {
  localStorage.setItem(INVITE_TOKEN_KEY, JSON.stringify(invite));
}

/** قراءة دعوة الانتظار (تتحقق من انتهاء الصلاحية 24 ساعة) */
export function getPendingInviteToken(): PendingInviteToken | null {
  try {
    const raw = localStorage.getItem(INVITE_TOKEN_KEY);
    if (!raw) return null;
    const inv = JSON.parse(raw) as PendingInviteToken;
    if (Date.now() - inv.stored_at > INVITE_TTL_MS) {
      localStorage.removeItem(INVITE_TOKEN_KEY);
      return null;
    }
    return inv;
  } catch { return null; }
}

/** مسح دعوة الانتظار بعد الاستخدام */
export function clearPendingInviteToken(): void {
  localStorage.removeItem(INVITE_TOKEN_KEY);
}

/** التحقق من صلاحية رابط الدعوة الجديد (يعمل بدون مصادقة) */
export async function validateInviteToken(token: string): Promise<{
  valid: boolean;
  invite_id?: string;
  merchant_id?: string;
  merchant_name?: string;
  token?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('validate_invite_token', { p_token: token });
  if (error) return { valid: false, error: error.message };
  return data as { valid: boolean; invite_id?: string; merchant_id?: string; merchant_name?: string; token?: string; error?: string };
}

/** ربط المستخدم الحالي بالتاجر عبر التوكن (بعد تسجيل الدخول أو الإنشاء) */
export async function linkUserToInviteToken(
  userId: string,
  token: string,
): Promise<{ success: boolean; duplicate?: boolean; merchant_id?: string; merchant_name?: string; error?: string }> {
  const { data, error } = await supabase.rpc('link_user_to_invite_token', {
    p_user_id: userId,
    p_token:   token,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; duplicate?: boolean; merchant_id?: string; merchant_name?: string; error?: string };
}

/** جلب بيانات دعوة التاجر (أو إنشاؤها إن لم تكن موجودة) */
export async function getMerchantInvite(merchantId: string): Promise<{
  success: boolean; invite?: MerchantInvite; error?: string;
}> {
  const { data, error } = await supabase.rpc('get_merchant_invite', { p_merchant_id: merchantId });
  if (error) return { success: false, error: error.message };
  return { success: true, invite: data as MerchantInvite };
}

/** إعادة توليد توكن دعوة جديد للتاجر (يُبطل القديم) */
export async function regenerateInviteToken(
  merchantId: string,
  adminId?: string,
): Promise<{ success: boolean; token?: string; error?: string }> {
  const { data, error } = await supabase.rpc('regenerate_invite_token', {
    p_merchant_id: merchantId,
    p_admin_id:    adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  const r = data as { success: boolean; token?: string };
  return r;
}

/** تغيير حالة الدعوة: active / disabled / expired */
export async function setInviteTokenStatus(
  merchantId: string,
  status: InviteTokenStatus,
  adminId?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('set_invite_token_status', {
    p_merchant_id: merchantId,
    p_status:      status,
    p_admin_id:    adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** بناء رابط الدعوة الكامل من التوكن — يُفضّل استخدام invite_link المُعاد من RPC */
export function buildInviteLink(token: string): string {
  const BASE = 'https://vchmsnavyhripakyvzom.supabase.co/functions/v1/serve-app';
  return `${BASE}?merchant=${token}`;
}

// ══════════════════════════════════════════════════════════════════
// Phase 9: Merchant Charging Engine — API (Additive)
// ══════════════════════════════════════════════════════════════════

export interface MerchantChargeEligibility {
  eligible: boolean;
  reason?: string;
  stage?: string;
  merchant_id?: string;
  merchant_name?: string;
  merchant_status?: string;
  member_status?: string;
  sub_status?: string;
  ops_remaining?: number | null;
  ops_limit?: number | null;
  ops_count?: number;
}

export interface MerchantOperation {
  id: string;
  user_id: string;
  operation_id: string | null;
  operation_source: 'vodafone_cash' | 'mobile_balance';
  card_name: string | null;
  price: number | null;
  phone_number: string | null;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  failure_reason: string | null;
  failure_stage: string | null;
  points_deducted: number;
  correlation_id: string | null;
  executed_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  username: string | null;
  user_email: string | null;
}

export interface MerchantChargeStats {
  total_ops: number;
  success_ops: number;
  failed_ops: number;
  success_rate: number;
  points_used: number;
  last_op: string | null;
  last_success: string | null;
  last_failure: string | null;
  vodafone_ops: number;
  balance_ops: number;
}

/** التحقق من أهلية المستخدم لتنفيذ عملية شحن (Pre-charge validation) */
export async function validateMerchantChargeEligibility(
  userId: string,
): Promise<MerchantChargeEligibility> {
  const { data, error } = await supabase.rpc('validate_merchant_charge_eligibility', {
    p_user_id: userId,
  });
  if (error || !data) return { eligible: false, reason: 'rpc_error', stage: 'system' };
  return data as MerchantChargeEligibility;
}

/** سجل عمليات التاجر مع pagination */
export async function getMerchantOperationsHistory(
  merchantId: string,
  opts: { limit?: number; offset?: number; status?: string; source?: string } = {},
): Promise<{ success: boolean; total: number; rows: MerchantOperation[] }> {
  const { data, error } = await supabase.rpc('get_merchant_operations_history', {
    p_merchant_id: merchantId,
    p_limit:       opts.limit  ?? 50,
    p_offset:      opts.offset ?? 0,
    p_status:      opts.status ?? null,
    p_source:      opts.source ?? null,
  });
  if (error || !data) return { success: false, total: 0, rows: [] };
  const d = data as { success: boolean; total: number; rows: MerchantOperation[] };
  return { success: d.success, total: d.total ?? 0, rows: Array.isArray(d.rows) ? d.rows : [] };
}

// ══════════════════════════════════════════════════════════════════
// Phase 10: Merchant Client Control Center — API (Additive)
// ══════════════════════════════════════════════════════════════════

export type MerchantControlAction =
  | 'enable' | 'disable' | 'suspend' | 'resume'
  | 'kill_switch_on' | 'kill_switch_off'
  | 'maintenance_on' | 'maintenance_off'
  | 'force_update_on' | 'force_update_off'
  | 'force_logout' | 'force_logout_clear'
  | 'force_sync' | 'force_refresh_config'
  | 'invite_enable' | 'invite_disable' | 'invite_regenerate'
  | 'invite_lock' | 'invite_unlock';

export interface MerchantControlConfig {
  id:               string;
  merchant_id:      string;
  kill_switch:      boolean;
  maintenance_mode: boolean;
  force_update:     boolean;
  force_logout:     boolean;
  app_version:      string | null;
  min_version:      string | null;
  config_version:   number;
  invite_enabled:   boolean;
  kill_switch_msg:  string | null;
  maintenance_msg:  string | null;
  force_update_msg: string | null;
  force_update_url: string | null;
  kill_switch_at:   string | null;
  maintenance_at:   string | null;
  force_update_at:  string | null;
  force_logout_at:  string | null;
  last_config_push: string | null;
  updated_at:       string;
}

export interface MerchantLiveStats {
  online_now:          number;
  total_connected:     number;
  last_heartbeat:      string | null;
  last_activity:       string | null;
  last_sync:           string | null;
  healthy_connections: number;
  poor_connections:    number;
  kill_switch:         boolean;
  maintenance_mode:    boolean;
  force_update:        boolean;
  config_version:      number;
}

export interface MerchantAuditEntry {
  id:             string;
  action:         string;
  reason:         string | null;
  metadata:       Record<string, unknown>;
  created_at:     string;
  admin_username: string | null;
  correlation_id: string | null;
}

export interface HeartbeatResponse {
  ok:              boolean;
  kill_switch:     boolean;
  maintenance:     boolean;
  force_update:    boolean;
  force_logout:    boolean;
  config_version:  number;
  min_version:     string | null;
  kill_msg:        string | null;
  maintenance_msg: string | null;
  force_update_msg:string | null;
}

/** تنفيذ إجراء إداري على تاجر محدد */
export async function adminMerchantAction(
  merchantId: string,
  action: MerchantControlAction,
  adminId: string,
  reason?: string,
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_merchant_action', {
    p_merchant_id: merchantId,
    p_action:      action,
    p_admin_id:    adminId,
    p_reason:      reason ?? null,
    p_metadata:    metadata ?? {},
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; message?: string; error?: string };
}

/** إحصائيات لحظية للتاجر */
export async function getMerchantLiveStats(merchantId: string): Promise<MerchantLiveStats | null> {
  const { data, error } = await supabase.rpc('get_merchant_live_stats', { p_merchant_id: merchantId });
  if (error || !data) return null;
  const d = data as { success: boolean } & MerchantLiveStats;
  return d.success ? d : null;
}

/** إرسال Heartbeat من العميل — يُرجع الإعدادات الحالية */
export async function upsertMerchantHeartbeat(opts: {
  userId:           string;
  appVersion?:      string;
  configVersion?:   number;
  realtimeOk?:      boolean;
  notificationOk?:  boolean;
  dbSyncOk?:        boolean;
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
}): Promise<HeartbeatResponse | null> {
  const { data, error } = await supabase.rpc('upsert_merchant_heartbeat', {
    p_user_id:           opts.userId,
    p_app_version:       opts.appVersion        ?? null,
    p_config_version:    opts.configVersion     ?? 0,
    p_realtime_ok:       opts.realtimeOk        ?? true,
    p_notification_ok:   opts.notificationOk    ?? true,
    p_db_sync_ok:        opts.dbSyncOk          ?? true,
    p_connection_quality:opts.connectionQuality ?? 'good',
  });
  if (error || !data) return null;
  return data as HeartbeatResponse;
}

/** سجل الإجراءات الإدارية */
export async function getMerchantAuditLog(
  merchantId: string, limit = 50, offset = 0,
): Promise<{ success: boolean; total: number; rows: MerchantAuditEntry[] }> {
  const { data, error } = await supabase.rpc('get_merchant_audit_log', {
    p_merchant_id: merchantId, p_limit: limit, p_offset: offset,
  });
  if (error || !data) return { success: false, total: 0, rows: [] };
  const d = data as { success: boolean; total: number; rows: MerchantAuditEntry[] };
  return { success: d.success, total: d.total ?? 0, rows: Array.isArray(d.rows) ? d.rows : [] };
}

/** قراءة إعدادات التحكم للتاجر (للعميل) */
export async function getMerchantControlConfig(merchantId: string): Promise<MerchantControlConfig | null> {
  const { data, error } = await supabase
    .from('merchant_control_config')
    .select('*')
    .eq('merchant_id', merchantId)
    .single();
  if (error || !data) return null;
  return data as MerchantControlConfig;
}

/** إحصائيات عمليات التاجر */
export async function getMerchantChargeStatistics(
  merchantId: string,
): Promise<MerchantChargeStats | null> {
  const { data, error } = await supabase.rpc('get_merchant_charge_stats', {
    p_merchant_id: merchantId,
  });
  if (error || !data) return null;
  const d = data as { success: boolean } & MerchantChargeStats;
  return d.success ? d : null;
}

/** إيقاف جميع أعضاء التاجر — Owner Control */
export async function adminSuspendAllMembers(
  merchantId: string,
  adminId?: string,
): Promise<{ success: boolean; suspended_count?: number; error?: string }> {
  const { data, error } = await supabase.rpc('admin_suspend_all_members', {
    p_merchant_id: merchantId,
    p_admin_id:    adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; suspended_count?: number };
}

/** إعادة تفعيل جميع أعضاء التاجر — Owner Control */
export async function adminResumeAllMembers(
  merchantId: string,
  adminId?: string,
): Promise<{ success: boolean; resumed_count?: number; error?: string }> {
  const { data, error } = await supabase.rpc('admin_resume_all_members', {
    p_merchant_id: merchantId,
    p_admin_id:    adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; resumed_count?: number };
}

/** نقل عضو من تاجر إلى آخر — Owner Control */
export async function adminTransferMember(
  userId:       string,
  fromMerchant: string,
  toMerchant:   string,
  adminId?:     string,
): Promise<{ success: boolean; new_merchant_id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_transfer_member', {
    p_user_id:       userId,
    p_from_merchant: fromMerchant,
    p_to_merchant:   toMerchant,
    p_admin_id:      adminId ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; new_merchant_id?: string };
}

/** تحديث إعدادات التاجر (brand_color, welcome_msg, logo_url, max_users) */
export async function updateMerchantSettings(params: {
  merchantId:            string;
  brandColor?:           string | null;
  welcomeMsg?:           string | null;
  logoUrl?:              string | null;
  maxUsers?:             number | null;
  welcomeInstructions?:  string | null;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('update_merchant_settings', {
    p_merchant_id:           params.merchantId,
    p_brand_color:           params.brandColor           ?? null,
    p_welcome_msg:           params.welcomeMsg           ?? null,
    p_logo_url:              params.logoUrl              ?? null,
    p_max_users:             params.maxUsers             ?? null,
    p_welcome_instructions:  params.welcomeInstructions  ?? null,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string };
}

/** قائمة جميع التجار النشطين — للاستخدام في نقل الأعضاء */
export async function getActiveMerchantsList(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('merchants')
    .select('id, name')
    .eq('status', 'active')
    .order('name');
  if (error || !data) return [];
  return data as { id: string; name: string }[];
}

// ─── فحص كود الاشتراك قبل تفعيله للمستخدم (للتاجر) ────────────────────────────
export interface MemberCodePreview {
  success: boolean;
  error?: string;
  code?: string;
  code_type?: string;
  status?: string;
  duration_days?: number | null;
  expiry_date?: string | null;
  expiration_mode?: string | null;
  ops_per_user?: number | null;
  allowed_users?: number | null;
  used_count?: number;
  remaining_uses?: number | null;
  is_multi_use?: boolean;
}

export async function previewLicenseCodeForMember(code: string): Promise<MemberCodePreview> {
  const { data, error } = await supabase.rpc('preview_license_code_for_member', { p_code: code.trim().toUpperCase() });
  if (error) return { success: false, error: error.message };
  return data as MemberCodePreview;
}

export async function activateLicenseCodeForMember(
  merchantId: string,
  userId: string,
  code: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  const { data, error } = await supabase.rpc('activate_license_code_for_member', {
    p_merchant_id: merchantId,
    p_user_id:     userId,
    p_code:        code.trim().toUpperCase(),
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; error?: string; message?: string };
}

/** قراءة merchant مع max_users */
export async function getMerchantFull(merchantId: string) {
  const { data, error } = await supabase
    .from('merchants')
    .select('*')
    .eq('id', merchantId)
    .single();
  if (error || !data) return null;
  return data as {
    id: string; name: string; brand_color: string | null;
    welcome_msg: string | null; logo_url: string | null;
    max_users: number | null; status: string;
    welcome_instructions: string | null;
    instructions_version: number;
    [key: string]: unknown;
  };
}

// ══════════════════════════════════════════════════════════════════
// Merchant Welcome System — get status + dismiss
// ══════════════════════════════════════════════════════════════════

/** حالة ترحيبية: هل يجب عرض التعليمات؟ */
export async function getMerchantWelcomeStatus(userId: string): Promise<{
  should_show: boolean;
  instructions: string;
  version: number;
  merchant_id: string;
} | null> {
  const { data, error } = await supabase.rpc('get_merchant_welcome_status', {
    p_user_id: userId,
  });
  if (error || !data) return null;
  return data as { should_show: boolean; instructions: string; version: number; merchant_id: string };
}

/** تسجيل "تم الاطلاع" للمستخدم */
export async function dismissMerchantWelcome(
  userId: string, merchantId: string, version: number
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('dismiss_merchant_welcome', {
    p_user_id:     userId,
    p_merchant_id: merchantId,
    p_version:     version,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ══════════════════════════════════════════════════════════════════
// Admin Merchants Overview — للوحة مراقبة التجار (Merchants First)
// ══════════════════════════════════════════════════════════════════

export interface MerchantOverviewItem {
  id:                    string;
  name:                  string;
  status:                string;
  brand_color:           string | null;
  current_balance:       number;
  remaining_points:      number;
  total_points_received: number;
  total_points_given:    number;
  member_count:          number;
  operation_count:       number;
  active_subs:           number;
  expired_subs:          number;
  code_count:            number;
  last_activity:         string | null;
  created_at:            string;
}

/** جلب نظرة عامة على جميع التجار مع إحصائياتهم */
export async function adminGetMerchantsOverview(): Promise<MerchantOverviewItem[]> {
  const { data, error } = await supabase.rpc('admin_get_merchants_overview');
  if (error || !data) return [];
  return data as MerchantOverviewItem[];
}

// ═══════════════════════════════════════════════════════════════
// ── Red Packages API ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

export interface RedPackageShowFields {
  gb:           boolean;
  minutes:      boolean;
  duration:     boolean;
  renewal:      boolean;
  features:     boolean;
  requirements: boolean;
  terms:        boolean;
  instructions: boolean;
  pre_msg:      boolean;
  post_msg:     boolean;
}

export interface RedPackage {
  id:                      string;
  name:                    string;
  network_name:            string;
  description:             string;
  short_description:       string;
  full_description:        string;
  data_gb:                 number;
  minutes:                 number;
  base_price:              number;
  discounted_price:        number | null;
  duration:                string;
  renewal_type:            string;
  status:                  'available' | 'coming_soon' | 'featured' | 'disabled';
  sort_order:              number;
  is_visible:              boolean;
  subscription_enabled:    boolean;
  whatsapp_number:         string;
  whatsapp_link:           string;
  terms:                   string[];
  features:                string[];
  requirements:            string[];
  subscription_method:     string;
  subscription_instructions: string;
  pre_subscription_msg:    string;
  post_subscription_msg:   string;
  show_fields:             RedPackageShowFields;
  image_url:               string;
  card_color:              string;
  bg_color:                string;
  btn_color:               string;
  text_color:              string;
  icon:                    string;
  color_primary:           string;
  color_secondary:         string;
  badge_label:             string;
  created_at:              string;
  updated_at:              string;
}

export function calcPackageDiscount(pkg: RedPackage): {
  savings: number;
  pct: number;
  currentPrice: number;
  originalPrice: number;
} {
  const original = pkg.base_price;
  const current  = pkg.discounted_price ?? pkg.base_price;
  const savings  = original - current;
  const pct      = original > 0 ? Math.round((savings / original) * 100) : 0;
  return { savings, pct, currentPrice: current, originalPrice: original };
}

export async function getRedPackages(): Promise<RedPackage[]> {
  const { data, error } = await supabase
    .from('red_packages')
    .select('*')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RedPackage[];
}

export async function getRedPackageById(id: string): Promise<RedPackage | null> {
  const { data, error } = await supabase
    .from('red_packages')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as RedPackage;
}

export async function adminGetAllRedPackages(): Promise<RedPackage[]> {
  const { data, error } = await supabase
    .from('red_packages')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RedPackage[];
}

export async function adminCreateRedPackage(pkg: Omit<RedPackage, 'id' | 'created_at' | 'updated_at'>): Promise<RedPackage> {
  const { data, error } = await supabase
    .from('red_packages')
    .insert([{ ...pkg, updated_at: new Date().toISOString() }])
    .select()
    .single();
  if (error) throw error;
  return data as RedPackage;
}

export async function adminUpdateRedPackage(id: string, updates: Partial<Omit<RedPackage, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await supabase
    .from('red_packages')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function adminDeleteRedPackage(id: string): Promise<void> {
  const { error } = await supabase.from('red_packages').delete().eq('id', id);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════
// ── Promotions API ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

export interface Promotion {
  id:                string;
  title:             string;
  description:       string;
  image_url:         string;
  color_primary:     string;
  color_secondary:   string;
  icon:              string;
  sort_order:        number;
  priority:          number;
  start_date:        string | null;
  end_date:          string | null;
  cta_label:         string;
  internal_route:    string;
  external_url:      string;
  status:            'active' | 'scheduled' | 'ended' | 'draft';
  display_frequency: 'always' | 'once' | 'daily' | 'weekly' | 'monthly';
  dismiss_behavior:  'permanent' | 'till_tomorrow' | 'hours' | 'always_show';
  dismiss_hours:     number;
  send_push:         boolean;
  push_sent:         boolean;
  is_active:         boolean;
  show_on_home:      boolean;
  created_at:        string;
  updated_at:        string;
}

export async function getActivePromotions(): Promise<Promotion[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .eq('is_active', true)
    .eq('show_on_home', true)
    .in('status', ['active'])
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order('priority', { ascending: false })
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data ?? []) as Promotion[];
}

export async function adminGetAllPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Promotion[];
}

export async function adminCreatePromotion(promo: Omit<Promotion, 'id' | 'created_at' | 'updated_at' | 'push_sent'>): Promise<Promotion> {
  const { data, error } = await supabase
    .from('promotions')
    .insert([{ ...promo, push_sent: false, updated_at: new Date().toISOString() }])
    .select()
    .single();
  if (error) throw error;
  return data as Promotion;
}

export async function adminUpdatePromotion(id: string, updates: Partial<Omit<Promotion, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await supabase
    .from('promotions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function adminDeletePromotion(id: string): Promise<void> {
  const { error } = await supabase.from('promotions').delete().eq('id', id);
  if (error) throw error;
}

export async function recordPromotionView(promotionId: string, userId: string): Promise<void> {
  await supabase.rpc('upsert_promotion_view', { p_promotion_id: promotionId, p_user_id: userId }).maybeSingle();
}

export async function getPromotionView(promotionId: string, userId: string): Promise<{ view_count: number; dismissed: boolean; last_viewed: string } | null> {
  const { data } = await supabase
    .from('promotion_views')
    .select('view_count, dismissed, last_viewed')
    .eq('promotion_id', promotionId)
    .eq('user_id', userId)
    .maybeSingle();
  return data as { view_count: number; dismissed: boolean; last_viewed: string } | null;
}

export async function dismissPromotion(promotionId: string, userId: string): Promise<void> {
  await supabase
    .from('promotion_views')
    .upsert({
      promotion_id: promotionId,
      user_id:      userId,
      dismissed:    true,
      dismissed_at: new Date().toISOString(),
      last_viewed:  new Date().toISOString(),
    }, { onConflict: 'promotion_id,user_id' });
}

// ══════════════════════════════════════════════════════════════════
// نظام الاشتراكات الاحترافي — PHASE 1-17
// ══════════════════════════════════════════════════════════════════

export interface SubscriptionOperation {
  id: string;
  user_id: string;
  subscription_id: string | null;
  license_key_id: string | null;
  code: string | null;
  operation_type: string;
  reason: string | null;
  notes: string | null;
  days_before: number | null;
  days_after: number | null;
  expires_before: string | null;
  expires_after: string | null;
  performed_by: string | null;
  performed_by_name: string | null;
  performed_at: string;
  metadata: Record<string, unknown>;
}

/** إدراج عملية في سجل subscription_operations */
async function insertSubOperation(payload: Omit<SubscriptionOperation, 'id' | 'performed_at'>) {
  await supabase.from('subscription_operations').insert(payload);
}

/** جلب سجل عمليات اشتراك مستخدم */
export async function getSubscriptionOperations(userId: string): Promise<SubscriptionOperation[]> {
  const { data } = await supabase
    .from('subscription_operations')
    .select('*')
    .eq('user_id', userId)
    .order('performed_at', { ascending: false })
    .limit(100);
  return Array.isArray(data) ? data : [];
}

/** تعليق الاشتراك مع السبب — PHASE 6 */
export async function suspendSubscriptionPro(
  userId: string,
  reason: string,
  adminId?: string,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };
  const now = new Date().toISOString();
  const { error } = await supabase.from('subscriptions').update({
    status: 'suspended',
    suspend_reason: reason,
    suspended_at: now,
    modified_by: adminId ?? null,
    updated_at: now,
  }).eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  await syncHistoryStatus(userId, 'active', null); // keep history active, just sub is suspended
  await insertSubOperation({
    user_id: userId, subscription_id: sub.id,
    license_key_id: sub.license_key_id,
    code: sub.code_used,
    operation_type: 'suspension',
    reason,
    notes: null, days_before: null, days_after: null,
    expires_before: sub.expires_at, expires_after: sub.expires_at,
    performed_by: adminId ?? null, performed_by_name: adminName ?? null,
    metadata: { sub_id: sub.id, prev_status: sub.status },
  });
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'suspended', title: 'تعليق اشتراك', description: `السبب: ${reason}` });
  await insertSystemLog({ user_id: userId, level: 'warning', action: 'admin_suspend_subscription', message: `السبب: ${reason}`, metadata: { sub_id: sub.id, reason } });
  if (adminId) await logAdminAction({ adminId, action: 'suspend_subscription', targetUserId: userId, details: { sub_id: sub.id, reason } });
  // إشعار PHASE 8
  await sendNotification({
    user_id: userId, is_global: false,
    title: '⏸️ تم تعليق اشتراكك',
    body: `تم تعليق اشتراكك بواسطة الإدارة. السبب: ${reason}. تواصل مع الدعم لمزيد من المعلومات.`,
    type: 'security', priority: 'urgent',
    action_url: '/subscription',
    send_push: true,
    dedup_key: `suspend_${sub.id}_${now}`,
  });
  return { success: true };
}

/** فك تعليق الاشتراك — PHASE 9 */
export async function unsuspendSubscriptionPro(
  userId: string,
  adminId?: string,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: sub } = await supabase.from('subscriptions')
    .select('*').eq('user_id', userId).eq('status', 'suspended')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!sub) return { success: false, error: 'لا يوجد اشتراك معلق لهذا المستخدم' };
  const now = new Date().toISOString();
  const { error } = await supabase.from('subscriptions').update({
    status: 'active',
    suspend_reason: null,
    suspended_at: null,
    modified_by: adminId ?? null,
    updated_at: now,
  }).eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  await insertSubOperation({
    user_id: userId, subscription_id: sub.id,
    license_key_id: sub.license_key_id,
    code: sub.code_used,
    operation_type: 'unsuspension',
    reason: 'فك التعليق من الإدارة',
    notes: null, days_before: null, days_after: null,
    expires_before: sub.expires_at, expires_after: sub.expires_at,
    performed_by: adminId ?? null, performed_by_name: adminName ?? null,
    metadata: { sub_id: sub.id },
  });
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'reactivated', title: 'فك تعليق اشتراك', description: 'تم فك التعليق بواسطة الإدارة' });
  await insertSystemLog({ user_id: userId, level: 'info', action: 'admin_unsuspend_subscription', metadata: { sub_id: sub.id } });
  if (adminId) await logAdminAction({ adminId, action: 'unsuspend_subscription', targetUserId: userId, details: { sub_id: sub.id } });
  // إشعار PHASE 8
  await sendNotification({
    user_id: userId, is_global: false,
    title: '✅ تم إعادة تفعيل اشتراكك',
    body: 'تم رفع التعليق عن اشتراكك وإعادة تفعيله. يمكنك الآن استخدام التطبيق بشكل طبيعي.',
    type: 'subscription_activated', priority: 'important',
    action_url: '/subscription',
    send_push: true,
    dedup_key: `unsuspend_${sub.id}_${now}`,
  });
  return { success: true };
}

/** إلغاء الاشتراك مع السبب — PHASE 10 */
export async function cancelSubscriptionPro(
  userId: string,
  reason: string,
  adminId?: string,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };
  const now = new Date().toISOString();
  const { error } = await supabase.from('subscriptions').update({
    status: 'cancelled',
    cancel_reason: reason,
    cancelled_at: now,
    modified_by: adminId ?? null,
    updated_at: now,
  }).eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  await syncHistoryStatus(userId, 'cancelled', 'cancelled_by_admin');
  await insertSubOperation({
    user_id: userId, subscription_id: sub.id,
    license_key_id: sub.license_key_id,
    code: sub.code_used,
    operation_type: 'cancellation',
    reason,
    notes: null, days_before: null, days_after: null,
    expires_before: sub.expires_at, expires_after: now,
    performed_by: adminId ?? null, performed_by_name: adminName ?? null,
    metadata: { sub_id: sub.id, prev_status: sub.status },
  });
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'cancellation', title: 'إلغاء اشتراك', description: `السبب: ${reason}` });
  await insertSystemLog({ user_id: userId, level: 'warning', action: 'admin_cancel_subscription_pro', message: `السبب: ${reason}`, metadata: { sub_id: sub.id } });
  if (adminId) await logAdminAction({ adminId, action: 'cancel_subscription', targetUserId: userId, details: { sub_id: sub.id, reason } });
  return { success: true };
}

/** إعادة تفعيل الاشتراك الملغي مع الاحتفاظ بالبيانات — PHASE 11 */
export async function reactivateSubscriptionPro(
  userId: string,
  durationDays: number,
  adminId?: string,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: sub } = await supabase.from('subscriptions')
    .select('*').eq('user_id', userId)
    .in('status', ['cancelled', 'expired', 'replaced'])
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!sub) return { success: false, error: 'لا يوجد اشتراك يمكن إعادة تفعيله' };
  const now = new Date();
  const newExpiry = new Date(now.getTime() + durationDays * 86400000);
  const { error } = await supabase.from('subscriptions').update({
    status: 'active',
    expires_at: newExpiry.toISOString(),
    cancel_reason: null, cancelled_at: null,
    replace_reason: null, replaced_at: null, replaced_by_sub_id: null,
    is_archived: false, archived_at: null,
    modified_by: adminId ?? null,
    updated_at: now.toISOString(),
  }).eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  const dBefore = sub.expires_at ? Math.floor((new Date(sub.expires_at).getTime() - Date.now()) / 86400000) : 0;
  await insertSubOperation({
    user_id: userId, subscription_id: sub.id,
    license_key_id: sub.license_key_id,
    code: sub.code_used,
    operation_type: 'reactivation',
    reason: 'إعادة تفعيل يدوي من الإدارة',
    notes: null,
    days_before: dBefore,
    days_after: durationDays,
    expires_before: sub.expires_at,
    expires_after: newExpiry.toISOString(),
    performed_by: adminId ?? null, performed_by_name: adminName ?? null,
    metadata: { sub_id: sub.id, prev_status: sub.status, durationDays },
  });
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'reactivated', title: 'إعادة تفعيل اشتراك', description: `تم إعادة التفعيل لمدة ${durationDays} يوم` });
  await insertSystemLog({ user_id: userId, level: 'info', action: 'admin_reactivate_subscription_pro', metadata: { sub_id: sub.id, durationDays } });
  if (adminId) await logAdminAction({ adminId, action: 'reactivate_subscription', targetUserId: userId, details: { sub_id: sub.id, durationDays } });
  await sendNotification({
    user_id: userId, is_global: false,
    title: '🎉 تم إعادة تفعيل اشتراكك',
    body: `تم إعادة تفعيل اشتراكك لمدة ${durationDays} يوم. يمكنك الآن الاستمتاع بجميع الخدمات.`,
    type: 'subscription_activated', priority: 'important',
    action_url: '/subscription',
    send_push: true,
  });
  return { success: true };
}

/** أرشفة الاشتراك (نقله للأرشيف دون حذف) — PHASE 4 */
export async function archiveSubscriptionPro(
  userId: string,
  subId: string,
  reason: string,
  adminId?: string,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('subscriptions').update({
    is_archived: true,
    archived_at: now,
    replace_reason: reason,
    replaced_at: now,
    modified_by: adminId ?? null,
    updated_at: now,
  }).eq('id', subId);
  if (error) return { success: false, error: error.message };
  await insertSubOperation({
    user_id: userId, subscription_id: subId,
    license_key_id: null, code: null,
    operation_type: 'archival', reason,
    notes: null, days_before: null, days_after: null,
    expires_before: null, expires_after: null,
    performed_by: adminId ?? null, performed_by_name: adminName ?? null,
    metadata: { sub_id: subId },
  });
  await insertSystemLog({ user_id: userId, level: 'info', action: 'admin_archive_subscription', metadata: { sub_id: subId } });
  return { success: true };
}

/** استعادة اشتراك مستبدل (replaced) وإلغاء الحالي — PHASE 32 */
export async function restoreReplacedSubscription(
  userId: string,
  replacedSubId: string,
  adminId?: string,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  // 1. جلب الاشتراك المستبدل
  const { data: replacedSub } = await supabase
    .from('subscriptions').select('*').eq('id', replacedSubId).maybeSingle();
  if (!replacedSub) return { success: false, error: 'الاشتراك المستبدل غير موجود' };

  // 2. حساب الأيام المتبقية (من days_remaining المحفوظ أو من المدة الأصلية)
  const daysRemaining: number = replacedSub.days_remaining ?? replacedSub.duration_days ?? 1;
  const newExpiry = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000).toISOString();

  // 3. إلغاء الاشتراك الحالي النشط (إن وُجد)
  const { data: currentSub } = await supabase
    .from('subscriptions')
    .select('id, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (currentSub && currentSub.id !== replacedSubId) {
    await supabase.from('subscriptions').update({
      status: 'cancelled', cancelled_at: now,
      cancel_reason: 'استُبدل باشتراك مُستعاد بواسطة الأدمن',
      modified_by: adminId ?? null, updated_at: now,
    }).eq('id', currentSub.id);
    await syncHistoryStatus(userId, 'cancelled', 'cancelled_by_admin');
  }

  // 4. استعادة الاشتراك المستبدل — تعيينه نشطاً بالأيام المتبقية
  const { error } = await supabase.from('subscriptions').update({
    status: 'active', expires_at: newExpiry,
    replace_reason: null, replaced_at: null, replaced_by_sub_id: null,
    is_archived: false, archived_at: null, days_remaining: null,
    modified_by: adminId ?? null, updated_at: now,
  }).eq('id', replacedSubId);
  if (error) return { success: false, error: error.message };

  // 5. مزامنة السجل التاريخي
  await syncHistoryStatus(userId, 'active', null);

  // 6. تسجيل العملية
  await insertSubOperation({
    user_id: userId, subscription_id: replacedSubId,
    license_key_id: replacedSub.license_key_id, code: replacedSub.code_used,
    operation_type: 'restoration',
    reason: `استعادة اشتراك مستبدل (${daysRemaining} يوم متبقي)`,
    notes: null, days_before: null, days_after: daysRemaining,
    expires_before: replacedSub.expires_at, expires_after: newExpiry,
    performed_by: adminId ?? null, performed_by_name: adminName ?? null,
    metadata: { sub_id: replacedSubId, restored_from: 'replaced', days_remaining: daysRemaining },
  });

  await sendNotification({
    user_id: userId, is_global: false,
    title: '🔄 تم استعادة اشتراكك',
    body: `تم استعادة اشتراكك المستبدل بمدة ${daysRemaining} يوم. ينتهي في ${new Date(newExpiry).toLocaleDateString('ar-EG')}.`,
    type: 'subscription_activated', priority: 'important',
    action_url: '/subscription', send_push: true,
  });

  if (adminId) await logAdminAction({
    adminId, action: 'restore_replaced_subscription', targetUserId: userId,
    details: { sub_id: replacedSubId, days_remaining: daysRemaining, new_expiry: newExpiry },
  });
  return { success: true };
}

/** استعادة اشتراك مؤرشف — PHASE 4,15 */
export async function restoreArchivedSubscription(
  userId: string,
  subId: string,
  mode: 'restore_only' | 'restore_and_cancel_current' | 'merge',
  adminId?: string,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: archivedSub } = await supabase.from('subscriptions').select('*').eq('id', subId).maybeSingle();
  if (!archivedSub) return { success: false, error: 'الاشتراك المؤرشف غير موجود' };
  const now = new Date().toISOString();

  if (mode === 'restore_and_cancel_current') {
    const currentSub = await getUserSubscription(userId);
    if (currentSub && currentSub.id !== subId) {
      await supabase.from('subscriptions').update({ status: 'cancelled', cancelled_at: now, cancel_reason: 'استُبدل باشتراك محفوظ', modified_by: adminId ?? null, updated_at: now }).eq('id', currentSub.id);
    }
  } else if (mode === 'merge') {
    const currentSub = await getUserSubscription(userId);
    if (currentSub && currentSub.id !== subId && currentSub.expires_at && archivedSub.expires_at) {
      const mergedExpiry = new Date(
        Math.max(new Date(currentSub.expires_at).getTime(), new Date(archivedSub.expires_at).getTime())
      );
      await supabase.from('subscriptions').update({ expires_at: mergedExpiry.toISOString(), updated_at: now }).eq('id', currentSub.id);
      await insertSubOperation({
        user_id: userId, subscription_id: currentSub.id,
        license_key_id: currentSub.license_key_id, code: currentSub.code_used,
        operation_type: 'merge', reason: 'دمج مع اشتراك محفوظ',
        notes: null, days_before: null, days_after: null,
        expires_before: currentSub.expires_at, expires_after: mergedExpiry.toISOString(),
        performed_by: adminId ?? null, performed_by_name: adminName ?? null,
        metadata: { archived_sub_id: subId },
      });
    }
  }

  const { error } = await supabase.from('subscriptions').update({
    is_archived: false, archived_at: null,
    replace_reason: null, replaced_at: null,
    status: 'active',
    modified_by: adminId ?? null,
    updated_at: now,
  }).eq('id', subId);
  if (error) return { success: false, error: error.message };
  await insertSubOperation({
    user_id: userId, subscription_id: subId,
    license_key_id: archivedSub.license_key_id, code: archivedSub.code_used,
    operation_type: 'restoration', reason: `استعادة (${mode})`,
    notes: null, days_before: null, days_after: null,
    expires_before: null, expires_after: archivedSub.expires_at,
    performed_by: adminId ?? null, performed_by_name: adminName ?? null,
    metadata: { sub_id: subId, mode },
  });
  await insertSystemLog({ user_id: userId, level: 'info', action: 'admin_restore_subscription', metadata: { sub_id: subId, mode } });
  if (adminId) await logAdminAction({ adminId, action: 'restore_subscription', targetUserId: userId, details: { sub_id: subId, mode } });
  return { success: true };
}

/** جلب الاشتراكات المؤرشفة لمستخدم — PHASE 4 */
export async function getArchivedSubscriptions(userId: string): Promise<Subscription[]> {
  const { data } = await supabase.from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', true)
    .order('archived_at', { ascending: false });
  return Array.isArray(data) ? data as Subscription[] : [];
}

/** جلب كل الاشتراكات (الكاملة) لمستخدم */
export async function getAllUserSubscriptions(userId: string): Promise<Subscription[]> {
  const { data } = await supabase.from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return Array.isArray(data) ? data as Subscription[] : [];
}

/** تجديد مع سجل كامل */
export async function renewSubscriptionPro(
  userId: string,
  extraDays: number,
  adminId?: string,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };
  const base = sub.expires_at && new Date(sub.expires_at) > new Date() ? new Date(sub.expires_at) : new Date();
  const newExpiry = new Date(base);
  newExpiry.setDate(newExpiry.getDate() + extraDays);
  const daysBefore = sub.expires_at ? Math.max(0, Math.floor((new Date(sub.expires_at).getTime() - Date.now()) / 86400000)) : 0;
  const { error } = await supabase.from('subscriptions').update({
    status: 'active', expires_at: newExpiry.toISOString(),
    in_grace_period: false, grace_started_at: null, grace_ends_at: null,
    modified_by: adminId ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  await insertSubOperation({
    user_id: userId, subscription_id: sub.id,
    license_key_id: sub.license_key_id, code: sub.code_used,
    operation_type: 'renewal',
    reason: `تجديد بـ ${extraDays} يوم`,
    notes: null,
    days_before: daysBefore, days_after: daysBefore + extraDays,
    expires_before: sub.expires_at, expires_after: newExpiry.toISOString(),
    performed_by: adminId ?? null, performed_by_name: adminName ?? null,
    metadata: { sub_id: sub.id, extraDays },
  });
  await supabase.from('activity_log').insert({ user_id: userId, event_type: 'renewal', title: 'تجديد اشتراك', description: `تم تجديد الاشتراك بـ ${extraDays} يوم` });
  await insertSystemLog({ user_id: userId, level: 'info', action: 'admin_renew_subscription_pro', message: `تجديد ${extraDays} يوم`, metadata: { sub_id: sub.id, extraDays } });
  if (adminId) await logAdminAction({ adminId, action: 'renew_subscription', targetUserId: userId, details: { sub_id: sub.id, extraDays, new_expiry: newExpiry.toISOString() } });
  return { success: true };
}

/** تمديد حتى تاريخ محدد مع سجل */
export async function extendSubscriptionPro(
  userId: string,
  newExpiresAt: string,
  adminId?: string,
  adminName?: string,
): Promise<{ success: boolean; error?: string }> {
  const sub = await getUserSubscription(userId);
  if (!sub) return { success: false, error: 'لا يوجد اشتراك لهذا المستخدم' };
  const daysBefore = sub.expires_at ? Math.max(0, Math.floor((new Date(sub.expires_at).getTime() - Date.now()) / 86400000)) : 0;
  const daysAfter = Math.max(0, Math.floor((new Date(newExpiresAt).getTime() - Date.now()) / 86400000));
  const { error } = await supabase.from('subscriptions').update({
    status: 'active', expires_at: newExpiresAt,
    modified_by: adminId ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', sub.id);
  if (error) return { success: false, error: error.message };
  await insertSubOperation({
    user_id: userId, subscription_id: sub.id,
    license_key_id: sub.license_key_id, code: sub.code_used,
    operation_type: 'extension',
    reason: `تمديد حتى ${new Date(newExpiresAt).toLocaleDateString('ar-EG')}`,
    notes: null,
    days_before: daysBefore, days_after: daysAfter,
    expires_before: sub.expires_at, expires_after: newExpiresAt,
    performed_by: adminId ?? null, performed_by_name: adminName ?? null,
    metadata: { sub_id: sub.id, newExpiresAt },
  });
  await insertSystemLog({ user_id: userId, level: 'info', action: 'admin_extend_subscription_pro', metadata: { sub_id: sub.id, newExpiresAt } });
  if (adminId) await logAdminAction({ adminId, action: 'extend_subscription', targetUserId: userId, details: { sub_id: sub.id, newExpiresAt } });
  return { success: true };
}

// ══════════════════════════════════════════════════════════════════
// END نظام الاشتراكات الاحترافي
// ══════════════════════════════════════════════════════════════════

/** جلب تفاصيل تاجر واحد: أعضاء + عمليات + نقاط + اشتراكات + أكواد + logs */
export async function adminGetMerchantDetail(merchantId: string): Promise<{
  merchant:      MerchantFull | null;
  members:       MerchantMember[];
  operations:    unknown[];
  subscriptions: unknown[];
  codes:         unknown[];
}> {
  const [mRes, mmRes, opsRes, subsRes, codesRes] = await Promise.all([
    supabase.from('merchants').select('*').eq('id', merchantId).single(),
    supabase.from('merchant_members')
      .select('*, profiles(username, email, phone, avatar_url)')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false }),
    supabase.from('merchant_operations')
      .select('*').eq('merchant_id', merchantId).order('created_at', { ascending: false }).limit(200),
    supabase.from('merchant_member_subscriptions')
      .select('*').eq('merchant_id', merchantId).order('created_at', { ascending: false }),
    supabase.from('merchant_license_codes')
      .select('*').eq('merchant_id', merchantId).order('created_at', { ascending: false }),
  ]);
  return {
    merchant:      mRes.data as MerchantFull | null,
    members:       Array.isArray(mmRes.data) ? mmRes.data : [],
    operations:    Array.isArray(opsRes.data) ? opsRes.data : [],
    subscriptions: Array.isArray(subsRes.data) ? subsRes.data : [],
    codes:         Array.isArray(codesRes.data) ? codesRes.data : [],
  };
}

