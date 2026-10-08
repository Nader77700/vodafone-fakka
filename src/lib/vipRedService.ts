/**
 * خدمة إدارة ومراقبة تحويلات خطوط ريد VIP
 */

import { supabase } from '@/db/supabase';
import { fetchLineInfo } from '@/lib/lineInfoProvider';
import {
  type VipRedLine,
  type VipRedConfig,
  type VipRedMerchant,
  type VipRedActivationDay,
  type DuplicateLineDetected,
  type VipRedMerchantWithStats,
  type VipRedMerchantStats,
  type VipRedPaymentStatus,
  type VipRedRoleType,
  type VipRedProfile,
  type VipRedPackageTier,
  type VipRedLineClaim,
  type VipRedCycleInvoice,
  VIP_RED_PACKAGES,
  classifyLineSystem,
} from '@/types/vipRed';
import { calculateMerchantActivationStats } from './vipRedActivationReminders';

// صوت تنبيه عند نجاح التحويل
function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.25); // D6
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch {
    // تجاهل في حال المتصفح منع الصوت بدون تفاعل
  }
}

// طلب إذن إشعارات المتصفح
export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

// إظهار إشعار متصفح / هاتف
export function showBrowserNotification(title: string, body: string) {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        dir: 'rtl',
        lang: 'ar',
      });
    }
  } catch (e) {
    console.warn('[VipRed] Browser notification error:', e);
  }
}

/**
 * جلب إعدادات قسم VIP
 */
export async function getVipRedConfig(): Promise<VipRedConfig> {
  try {
    const { data, error } = await supabase
      .from('vip_red_config')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (error || !data) {
      return {
        id: 'default',
        is_enabled_globally: true,
        allowed_user_ids: [],
        check_interval_hours: 4,
        last_batch_run_at: null,
      };
    }

    return {
      id: data.id,
      is_enabled_globally: data.is_enabled_globally ?? true,
      allowed_user_ids: Array.isArray(data.allowed_user_ids) ? data.allowed_user_ids : [],
      check_interval_hours: data.check_interval_hours || 4,
      last_batch_run_at: data.last_batch_run_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (err) {
    console.error('[VipRed] getVipRedConfig error:', err);
    return {
      id: 'default',
      is_enabled_globally: true,
      allowed_user_ids: [],
      check_interval_hours: 4,
      last_batch_run_at: null,
    };
  }
}

/**
 * تحديث إعدادات قسم VIP (للأدمن)
 */
export async function updateVipRedConfig(updates: Partial<VipRedConfig>): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('vip_red_config')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default');

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * التحقق من صلاحية وصول المستخدم لقسم VIP
 */
export function canUserAccessVipRed(
  user: { id: string } | null,
  profile: { role?: string } | null,
  config: VipRedConfig | null
): boolean {
  if (!user) return false;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  if (isAdmin) return true;
  if (!config) return false;
  if (config.is_enabled_globally) return true;
  if (Array.isArray(config.allowed_user_ids) && config.allowed_user_ids.includes(user.id)) return true;
  return false;
}

/**
 * توحيد ومعايرة صيغة رقم الهاتف
 * يقبل 010xxxxxxxx أو 2010xxxxxxxx أو +2010xxxxxxxx ويحولها إلى 01xxxxxxxxx
 */
export function normalizePhoneNumber(raw: string): string {
  let cleaned = (raw || '').trim().replace(/\D/g, '');
  if (cleaned.startsWith('0020')) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('20') && cleaned.length >= 12) {
    cleaned = cleaned.slice(2);
  }
  if (cleaned.length === 10 && cleaned.startsWith('1')) {
    cleaned = `0${cleaned}`;
  }
  return cleaned;
}

/**
 * جلب جميع الأرقام المراقبة الخاصة بالمستخدم مع بيانات التاجر المرتبط
 * إذا كان allForAdmin=true يتم جلب كل الأرقام في النظام
 */
export async function getMonitoredLines(userId: string, allForAdmin: boolean = false): Promise<VipRedLine[]> {
  try {
    let query = supabase
      .from('vip_red_monitored_lines')
      .select('*, merchant:vip_red_merchants(*)')
      .order('created_at', { ascending: false });

    if (!allForAdmin && userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[VipRed] getMonitoredLines error:', error);
      return [];
    }

    return (data || []) as VipRedLine[];
  } catch (err) {
    console.error('[VipRed] getMonitoredLines unexpected error:', err);
    return [];
  }
}

/**
 * جلب قائمة التجار النشطين
 */
export async function getMerchants(): Promise<VipRedMerchant[]> {
  try {
    const { data, error } = await supabase
      .from('vip_red_merchants')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[VipRed] getMerchants error:', error);
      return [];
    }
    return (data || []) as VipRedMerchant[];
  } catch (err) {
    console.error('[VipRed] getMerchants unexpected error:', err);
    return [];
  }
}

/**
 * إنشاء تاجر جديد (مع إمكانية ربطه بمستخدم أو إنشاؤه كتاجر مستقل)
 */
export async function createMerchant(
  params: { name: string; phone?: string; user_id?: string | null; notes?: string },
  adminId: string
): Promise<{ success: boolean; merchant?: VipRedMerchant; error?: string }> {
  try {
    const name = params.name.trim();
    if (!name) {
      return { success: false, error: 'اسم التاجر مطلوب' };
    }

    const { data, error } = await supabase
      .from('vip_red_merchants')
      .insert({
        name,
        phone: params.phone ? normalizePhoneNumber(params.phone) : null,
        user_id: params.user_id || null,
        created_by: adminId,
        notes: params.notes || null,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, merchant: data as VipRedMerchant };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * جلب قائمة المستخدمين المسجلين في التطبيق لإتاحة ربط التاجر بحساب موجود
 */
export async function getRegisteredAppUsers(): Promise<{ id: string; email: string; name?: string }[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .order('email', { ascending: true })
      .limit(100);

    if (error) {
      console.warn('[VipRed] getRegisteredAppUsers error:', error);
      return [];
    }

    return (data || []).map((p: { id: string; email?: string | null; full_name?: string | null }) => ({
      id: p.id,
      email: p.email || p.id,
      name: p.full_name || undefined,
    }));
  } catch (err) {
    console.warn('[VipRed] getRegisteredAppUsers error:', err);
    return [];
  }
}

/**
 * فحص ما إذا كان الرقم مسجلاً بالفعل في نظام المراقبة
 */
export async function checkExistingLine(phoneNumber: string): Promise<{ exists: boolean; line?: VipRedLine }> {
  try {
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized) return { exists: false };

    const { data, error } = await supabase
      .from('vip_red_monitored_lines')
      .select('*, merchant:vip_red_merchants(*)')
      .eq('phone_number', normalized)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[VipRed] checkExistingLine error:', error);
    }

    if (data) {
      return { exists: true, line: data as VipRedLine };
    }
    return { exists: false };
  } catch (err) {
    console.warn('[VipRed] checkExistingLine exception:', err);
    return { exists: false };
  }
}

/**
 * تنظيف واستخراج أرقام الهواتف من النص
 */
export function extractPhoneNumbers(input: string): string[] {
  const rawList = input.split(/[\n,;\s]+/);
  const validNumbers = new Set<string>();

  for (const item of rawList) {
    const normalized = normalizePhoneNumber(item);
    if (normalized.startsWith('01') && normalized.length === 11) {
      validNumbers.add(normalized);
    }
  }

  return Array.from(validNumbers);
}

export interface AddLineInput {
  phone: string;
  merchantId?: string | null;
  activationDay?: VipRedActivationDay | null;
  packageTier?: VipRedPackageTier | null;
}

/**
 * إضافة أرقام جديدة إلى المراقبة مع حماية كاملة ضد التكرار (Unique Check + Duplicate Warning)
 */
export async function addMonitoredLines(
  inputs: (string | AddLineInput)[],
  userId: string
): Promise<{ added: number; errors: string[]; duplicates: DuplicateLineDetected[] }> {
  let added = 0;
  const errors: string[] = [];
  const duplicates: DuplicateLineDetected[] = [];

  for (const item of inputs) {
    const rawPhone = typeof item === 'string' ? item : item.phone;
    const merchantId = typeof item === 'object' ? item.merchantId : null;
    const activationDay = typeof item === 'object' ? item.activationDay : null;
    const packageTier: VipRedPackageTier = (typeof item === 'object' && item.packageTier) ? item.packageTier : '100gb';
    const pkg = VIP_RED_PACKAGES[packageTier] || VIP_RED_PACKAGES['100gb'];
    const pkgPrice = pkg.price;
    const phone = normalizePhoneNumber(rawPhone);

    if (!phone || !/^01[0125]\d{8}$/.test(phone)) {
      errors.push(`الرقم ${rawPhone} غير صحيح (يجب أن يكون 11 رقماً يبدأ بـ 01)`);
      continue;
    }

    // 1. فحص استباقي في قاعدة البيانات للتأكد من عدم وجود الرقم مسبقاً
    const existingCheck = await checkExistingLine(phone);
    if (existingCheck.exists && existingCheck.line) {
      duplicates.push({
        phone,
        line: existingCheck.line,
      });
      continue;
    }

    // 2. إدخال السجل الجديد
    try {
      const nextCheck = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
      const { error } = await supabase
        .from('vip_red_monitored_lines')
        .insert({
          user_id: userId,
          phone_number: phone,
          system_status: 'monitoring',
          current_system: null,
          last_line_info: {},
          check_count: 0,
          next_check_at: nextCheck,
          merchant_id: merchantId || null,
          activation_day: activationDay || null,
          package_tier: packageTier,
          package_price: pkgPrice,
          renewal_amount: pkgPrice,
        });

      if (error) {
        if (error.code === '23505') {
          // قيد التكرار في قاعدة البيانات منع الإضافة (حالات Race Condition أو النقر المزدوج)
          const doubleCheck = await checkExistingLine(phone);
          if (doubleCheck.line) {
            duplicates.push({ phone, line: doubleCheck.line });
          } else {
            errors.push(`الرقم ${phone} موجود بالفعل في نظام المراقبة.`);
          }
        } else {
          errors.push(`فشل إضافة ${phone}: ${error.message}`);
        }
      } else {
        added++;
      }
    } catch (err) {
      errors.push(`خطأ في إضافة ${phone}: ${String(err)}`);
    }
  }

  return { added, errors, duplicates };
}

/**
 * تحديث بيانات التاجر وموعد التفعيل لرقم مسجل مسبقاً
 */
export async function updateLineMerchantAndActivation(
  lineId: string,
  merchantId: string | null,
  activationDay: VipRedActivationDay | null
): Promise<{ success: boolean; line?: VipRedLine; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('vip_red_monitored_lines')
      .update({
        merchant_id: merchantId,
        activation_day: activationDay,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lineId)
      .select('*, merchant:vip_red_merchants(*)')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, line: data as VipRedLine };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * حذف رقم من المراقبة
 */
export async function deleteMonitoredLine(lineId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('vip_red_monitored_lines')
      .delete()
      .eq('id', lineId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * فحص رقم محدد وتحديث حالته وإرسال إشعار إذا تحول إلى ريد
 */
export async function checkSingleMonitoredLine(
  line: VipRedLine,
  userId: string
): Promise<{ success: boolean; line?: VipRedLine; error?: string }> {
  try {
    const res = await fetchLineInfo(line.phone_number);
    if (res.status !== 'success' || !res.data) {
      return { success: false, error: res.errorMessage || 'تعذّر استعلام بيانات الخط' };
    }

    const currentSystem = res.data.system || null;
    const classification = classifyLineSystem(currentSystem);
    const wasConverted = line.system_status === 'converted';
    const isNowConverted = classification.status === 'converted';

    const cfg = await getVipRedConfig();
    const intervalHours = cfg.check_interval_hours || 4;

    const updates: Partial<VipRedLine> = {
      current_system: currentSystem,
      system_status: classification.status,
      last_checked_at: new Date().toISOString(),
      check_count: (line.check_count || 0) + 1,
      last_line_info: res.data,
      updated_at: new Date().toISOString(),
    };

    if (isNowConverted) {
      if (!wasConverted) {
        updates.converted_at = new Date().toISOString();
      }
      // إيقاف المراقبة الدورية فور التحويل
      updates.next_check_at = null;
    } else if (classification.status === 'monitoring') {
      // تجديد دورة الفحص القادم تلقائياً (4 ساعات من الآن)
      updates.next_check_at = new Date(Date.now() + intervalHours * 3600 * 1000).toISOString();
    } else {
      // غير مؤهل
      updates.next_check_at = null;
    }

    const { data: updatedData, error } = await supabase
      .from('vip_red_monitored_lines')
      .update(updates)
      .eq('id', line.id)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // إذا تحول الخط إلى Enterprise member control لأول مرة:
    if (isNowConverted && !wasConverted) {
      const notifTitle = `🎉 تم تحويل الرقم (${line.phone_number}) لنظام ريد!`;
      const notifBody = `تم بنجاح تحويل الخط (${line.phone_number}) إلى نظام فودافون ريد بيزنس (${currentSystem || 'Enterprise member control'}) وهو جاهز للتفعيل الآن.`;

      // 1. إرسال إشعار فوري وتنبيه للمشرف / المالك
      if (userId) {
        await sendVipPushNotification(userId, notifTitle, notifBody, '/vip-red');
      }

      // 2. إرسال إشعار للمستخدم المرتبط بالرقم إذا وجد
      if (line.claimed_by_user_id && line.claimed_by_user_id !== userId) {
        await sendVipPushNotification(
          line.claimed_by_user_id,
          `🎉 تم تحويل رقمك (${line.phone_number}) لريد بيزنس!`,
          `تهانينا! تم تحويل رقمك (${line.phone_number}) بنجاح إلى نظام فودافون ريد بيزنس وهو جاهز للتفعيل الآن.`,
          '/vip-red'
        );
      }

      // 3. إرسال إشعار للتاجر المرتبط إذا كان لديه حساب مستخدم
      if (line.merchant_id) {
        try {
          const { data: merch } = await supabase
            .from('vip_red_merchants')
            .select('user_id, name')
            .eq('id', line.merchant_id)
            .maybeSingle();

          if (merch?.user_id && merch.user_id !== userId && merch.user_id !== line.claimed_by_user_id) {
            await sendVipPushNotification(
              merch.user_id,
              `🎉 تحويل رقم للتاجر: ${line.phone_number}`,
              `تم تحويل الرقم (${line.phone_number}) المسجل بحسابك (${merch.name}) إلى نظام فودافون ريد بيزنس بنجاح!`,
              '/vip-red'
            );
          }
        } catch (merchErr) {
          console.warn('[VipRed] Failed to notify merchant:', merchErr);
        }
      }

      // 4. تشغيل نغمة النجاح إذا كان التطبيق مفتوحاً
      playSuccessChime();
    }

    return { success: true, line: updatedData as VipRedLine };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * دالة مساعدة موحدة لإرسال الإشعارات الفورية وفي قاعدة البيانات
 */
async function sendVipPushNotification(
  targetUserId: string,
  title: string,
  body: string,
  actionUrl: string = '/vip-red'
) {
  if (!targetUserId) return;
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: targetUserId,
        title,
        body,
        type: 'vip_red',
        priority: 'urgent',
        action_url: actionUrl,
        send_push: true,
      },
    });
  } catch (pushErr) {
    console.warn('[VipRed] push invoke error:', pushErr);
  }

  try {
    await supabase.from('notifications').insert({
      user_id: targetUserId,
      title,
      body,
      type: 'vip_red',
      priority: 'urgent',
      action_url: actionUrl,
      is_read: false,
      is_global: false,
    });
  } catch (ne) {
    console.warn('[VipRed] notification insert fallback error:', ne);
  }
}

/**
 * فحص دفعة من الخطوط مع تجزئة تدريجية (Chunked Batch Throttling) لتجنب حظر WAF
 * يقسم الأرقام إلى مجموعات صغيرة (3 أرقام) مع فواصل آمنة
 */
export async function batchCheckMonitoredLines(
  lines: VipRedLine[],
  userId: string,
  onProgress?: (index: number, total: number, currentPhone: string) => void
): Promise<{ checked: number; convertedNow: number; errors: number; convertedPhones: string[] }> {
  let checked = 0;
  let convertedNow = 0;
  let errors = 0;
  const convertedPhones: string[] = [];

  // تقسيم الأرقام إلى دفعات صغيرة من 3 أرقام
  const CHUNK_SIZE = 3;
  const chunks: VipRedLine[][] = [];
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    chunks.push(lines.slice(i, i + CHUNK_SIZE));
  }

  let processedCount = 0;
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];

    for (let j = 0; j < chunk.length; j++) {
      const line = chunk[j];
      processedCount++;
      onProgress?.(processedCount, lines.length, line.phone_number);

      const prevStatus = line.system_status;
      const res = await checkSingleMonitoredLine(line, userId);

      if (res.success && res.line) {
        checked++;
        if (res.line.system_status === 'converted' && prevStatus !== 'converted') {
          convertedNow++;
          convertedPhones.push(line.phone_number);
        }
      } else {
        errors++;
      }

      // فاصل زمني آمن بين الأرقام داخل نفس الدفعة (1500 مللي ثانية)
      if (j < chunk.length - 1 || processedCount < lines.length) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // استراحة أطول بين الدفعات (2500 مللي ثانية) لتهدئة حركة المرور
    if (c < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 2500));
    }
  }

  return { checked, convertedNow, errors, convertedPhones };
}

let isAutoScanningDueLines = false;

/**
 * فحص الأرقام المستحقة للفحص الدوري تلقائياً بنظام الدفعات المجزأة
 */
export async function runAutoScanDueLines(
  userId: string,
  onLineUpdated?: (updatedLine: VipRedLine) => void
): Promise<{ checked: number; convertedNow: number; errors: number; convertedPhones: string[] }> {
  // فحص توفر الإنترنت
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { checked: 0, convertedNow: 0, errors: 0, convertedPhones: [] };
  }

  // قفل منع التزامن المتكرر
  if (isAutoScanningDueLines) {
    return { checked: 0, convertedNow: 0, errors: 0, convertedPhones: [] };
  }

  isAutoScanningDueLines = true;
  let checked = 0;
  let convertedNow = 0;
  let errors = 0;
  const convertedPhones: string[] = [];

  try {
    const nowIso = new Date().toISOString();
    // استعلام الخطوط المستحقة بحد أقصى 5 أرقام للدورة
    const { data: dueLines, error } = await supabase
      .from('vip_red_monitored_lines')
      .select('*')
      .eq('user_id', userId)
      .eq('system_status', 'monitoring')
      .or(`next_check_at.is.null,next_check_at.lte.${nowIso}`)
      .limit(5);

    if (error || !dueLines || dueLines.length === 0) {
      return { checked: 0, convertedNow: 0, errors: 0, convertedPhones: [] };
    }

    for (let i = 0; i < dueLines.length; i++) {
      const line = dueLines[i] as VipRedLine;
      const prevStatus = line.system_status;
      const res = await checkSingleMonitoredLine(line, userId);

      if (res.success && res.line) {
        checked++;
        if (res.line.system_status === 'converted' && prevStatus !== 'converted') {
          convertedNow++;
          convertedPhones.push(line.phone_number);
        }
        if (onLineUpdated) {
          onLineUpdated(res.line);
        }
      } else {
        errors++;
      }

      if (i < dueLines.length - 1) {
        await new Promise(r => setTimeout(r, 1800));
      }
    }
  } catch (err) {
    console.error('[VipRed] Error in runAutoScanDueLines:', err);
  } finally {
    isAutoScanningDueLines = false;
  }

  return { checked, convertedNow, errors, convertedPhones };
}

/**
 * تشغيل فحص الخادم السحابي التلقائي يدوياً (Edge Function Trigger)
 */
export async function triggerServerAutoScan(): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const res = await supabase.functions.invoke('vip-red-auto-scan', {
      body: { manual_trigger: true },
    });
    if (res.error) {
      return { success: false, message: res.error.message };
    }
    return {
      success: true,
      message: res.data?.message || 'تم تنفيذ دورة فحص الخادم السحابية بنجاح',
      data: res.data,
    };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

/**
 * جلب جميع التجار مع إحصائيات الخطوط ومواعيد التفعيل لكل تاجر
 */
export async function getMerchantsWithStats(): Promise<VipRedMerchantWithStats[]> {
  try {
    const { data: merchants, error: mError } = await supabase
      .from('vip_red_merchants')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (mError || !merchants) {
      console.error('[VipRed] getMerchantsWithStats error:', mError);
      return [];
    }

    const { data: allLines, error: lError } = await supabase
      .from('vip_red_monitored_lines')
      .select('*')
      .not('merchant_id', 'is', null);

    if (lError) {
      console.warn('[VipRed] getMerchantsWithStats lines error:', lError);
    }

    const linesList = (allLines || []) as VipRedLine[];

    return merchants.map(m => {
      const merchantLines = linesList.filter(l => l.merchant_id === m.id);
      const stats = calculateMerchantActivationStats(merchantLines);
      return {
        ...(m as VipRedMerchant),
        stats: stats as VipRedMerchantStats,
        linesCount: merchantLines.length,
      };
    });
  } catch (err) {
    console.error('[VipRed] getMerchantsWithStats exception:', err);
    return [];
  }
}

/**
 * جلب تفاصيل تاجر محدد بالـ ID مع كافة أرقامه وإحصائياتها
 * ويشمل فحص الأمان لرفض الوصول غير المصرح به
 */
export async function getMerchantDetails(
  merchantId: string,
  currentUserId?: string,
  userRole?: string
): Promise<{
  success: boolean;
  merchant?: VipRedMerchant;
  lines?: VipRedLine[];
  stats?: VipRedMerchantStats;
  error?: string;
  isForbidden?: boolean;
}> {
  try {
    const { data: merchant, error: mErr } = await supabase
      .from('vip_red_merchants')
      .select('*')
      .eq('id', merchantId)
      .maybeSingle();

    if (mErr || !merchant) {
      return { success: false, error: 'التاجر غير موجود في النظام' };
    }

    // فحص الصلاحيات: إذا كان المستخدم تاجراً مرتبطاً بحساب (وليس آدمن) ولا يطابق هذا التاجر
    const isAdmin = userRole === 'admin' || userRole === 'owner';
    if (!isAdmin && currentUserId && merchant.user_id && merchant.user_id !== currentUserId) {
      // التحقق هل لدى المستخدم تاجر خاص به
      const { data: ownMerchant } = await supabase
        .from('vip_red_merchants')
        .select('id')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (ownMerchant && ownMerchant.id !== merchantId) {
        return {
          success: false,
          isForbidden: true,
          error: 'عذراً، لا تملك صلاحية الاطلاع على بيانات تجار آخرين.',
        };
      }
    }

    // جلب أرقام هذا التاجر
    const { data: lines, error: lErr } = await supabase
      .from('vip_red_monitored_lines')
      .select('*, merchant:vip_red_merchants(*)')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false });

    if (lErr) {
      console.warn('[VipRed] getMerchantDetails lines error:', lErr);
    }

    const typedLines = (lines || []) as VipRedLine[];
    const stats = calculateMerchantActivationStats(typedLines);

    return {
      success: true,
      merchant: merchant as VipRedMerchant,
      lines: typedLines,
      stats: stats as VipRedMerchantStats,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * نقل رقم من تاجر إلى تاجر آخر مع الحفاظ الكامل على Phone ID وتاريخ وسجل الفحص والمراقبة دون إنشاء سجل مكرر
 */
export async function transferLineToMerchant(
  lineId: string,
  targetMerchantId: string | null
): Promise<{ success: boolean; line?: VipRedLine; error?: string }> {
  try {
    // 1. التحقق من وجود الرقم أولاً
    const { data: existingLine, error: fetchErr } = await supabase
      .from('vip_red_monitored_lines')
      .select('*')
      .eq('id', lineId)
      .maybeSingle();

    if (fetchErr || !existingLine) {
      return { success: false, error: 'الرقم غير موجود في سجل المراقبة' };
    }

    // 2. إذا كان هناك تاجر مستهدف، التحقق من وجوده
    if (targetMerchantId) {
      const { data: targetMerchant, error: tmErr } = await supabase
        .from('vip_red_merchants')
        .select('id, name')
        .eq('id', targetMerchantId)
        .maybeSingle();

      if (tmErr || !targetMerchant) {
        return { success: false, error: 'التاجر المستهدف غير موجود' };
      }
    }

    // 3. تحديث التاجر في نفس السجل تماماً (in-place update) دون المساس بأي من بيانات المراقبة أو السجل
    const { data: updated, error: updateErr } = await supabase
      .from('vip_red_monitored_lines')
      .update({
        merchant_id: targetMerchantId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lineId)
      .select('*, merchant:vip_red_merchants(*)')
      .single();

    if (updateErr || !updated) {
      return { success: false, error: updateErr?.message || 'فشل تحديث بيانات ربط التاجر' };
    }

    return { success: true, line: updated as VipRedLine };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * فحص ما إذا كان المستخدم الحالي مرتبطاً بسجل تاجر
 */
export async function getLinkedMerchantForUser(userId: string): Promise<VipRedMerchant | null> {
  try {
    const { data, error } = await supabase
      .from('vip_red_merchants')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data as VipRedMerchant;
  } catch {
    return null;
  }
}

/**
 * تحديث حالة سداد وتجديد الخط (unpaid | paid | cancelled)
 */
export async function updateLinePaymentStatus(
  lineId: string,
  paymentStatus: VipRedPaymentStatus
): Promise<{ success: boolean; line?: VipRedLine; error?: string }> {
  try {
    const updatePayload: Record<string, any> = {
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    };

    if (paymentStatus === 'paid') {
      updatePayload.last_payment_date = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('vip_red_monitored_lines')
      .update(updatePayload)
      .eq('id', lineId)
      .select('*, merchant:vip_red_merchants(*)')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'فشل تحديث حالة السداد' };
    }

    return { success: true, line: data as VipRedLine };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * تحديث اسم العميل / المستخدم المرتبط بالخط
 */
export async function updateLineCustomerName(
  lineId: string,
  customerName: string
): Promise<{ success: boolean; line?: VipRedLine; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('vip_red_monitored_lines')
      .update({
        customer_name: customerName.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lineId)
      .select('*, merchant:vip_red_merchants(*)')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'فشل حفظ اسم العميل' };
    }

    return { success: true, line: data as VipRedLine };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * جلب جميع خطوط ريد المحولة الجاهزة للتجديد والسداد
 */
export async function getConvertedRenewalLines(userId?: string): Promise<VipRedLine[]> {
  try {
    let query = supabase
      .from('vip_red_monitored_lines')
      .select('*, merchant:vip_red_merchants(*)')
      .eq('system_status', 'converted')
      .order('activation_day', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as VipRedLine[];
  } catch {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── الملف التعريفي والتحقق من حسابات المستخدمين والتجار ──
// ══════════════════════════════════════════════════════════════════════════

export async function getVipRedProfile(userId: string): Promise<VipRedProfile | null> {
  try {
    const { data, error } = await supabase
      .from('vip_red_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data as VipRedProfile;
  } catch {
    return null;
  }
}

export async function saveVipRedProfile(payload: {
  userId: string;
  roleType: VipRedRoleType;
  fullName: string;
  whatsappPhone: string;
  notes?: string;
}): Promise<{ success: boolean; profile?: VipRedProfile; error?: string }> {
  try {
    const cleanPhone = payload.whatsappPhone.trim().replace(/\D/g, '');
    const cleanName = payload.fullName.trim();

    if (!cleanName) {
      return { success: false, error: 'يرجى كتابة الاسم واللقب' };
    }
    if (cleanPhone.length < 10) {
      return { success: false, error: 'يرجى كتابة رقم واتساب صحيح للتواصل مع الإدارة' };
    }

    const { data, error } = await supabase
      .from('vip_red_profiles')
      .upsert({
        user_id: payload.userId,
        role_type: payload.roleType,
        full_name: cleanName,
        whatsapp_phone: cleanPhone,
        notes: payload.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'تعذر حفظ الملف التعريفي' };
    }

    // إذا كان نوع الحساب تاجراً، ننشئ أو نربط تاجراً تلقائياً في جدول vip_red_merchants
    if (payload.roleType === 'merchant') {
      const { data: existingM } = await supabase
        .from('vip_red_merchants')
        .select('id')
        .eq('user_id', payload.userId)
        .maybeSingle();

      if (!existingM) {
        await supabase.from('vip_red_merchants').insert({
          name: cleanName,
          phone: cleanPhone,
          user_id: payload.userId,
          created_by: payload.userId,
          is_active: true,
          notes: 'تم إنشاؤه عبر تسجيل الملف التعريفي لقسم ريد',
        });
      }
    }

    return { success: true, profile: data as VipRedProfile };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── البحث عن أرقام على السيرفر وطلب اعتمادها ──
// ══════════════════════════════════════════════════════════════════════════

export async function searchServerLinesToClaim(
  phoneNumberQuery: string,
  currentUserId: string
): Promise<{
  success: boolean;
  lines: Array<VipRedLine & { canClaim: boolean; claimMessage: string }>;
  error?: string;
}> {
  try {
    const clean = phoneNumberQuery.trim().replace(/\D/g, '');
    if (clean.length < 8) {
      return { success: true, lines: [] };
    }

    const { data, error } = await supabase
      .from('vip_red_monitored_lines')
      .select('*, merchant:vip_red_merchants(*)')
      .ilike('phone_number', `%${clean}%`)
      .limit(10);

    if (error) {
      return { success: false, lines: [], error: error.message };
    }

    const mapped = (data || []).map(line => {
      let canClaim = false;
      let claimMessage = '';

      if (line.claimed_by_user_id === currentUserId) {
        if (line.claim_status === 'approved') {
          canClaim = false;
          claimMessage = 'هذا الرقم مربوط ومعتمد في حسابك بالفعل';
        } else if (line.claim_status === 'pending') {
          canClaim = false;
          claimMessage = 'طلبك قيد المراجعة لدى المالك';
        } else if (line.claim_status === 'rejected') {
          canClaim = true;
          claimMessage = `تم رفض طلبك السابق (${line.claim_rejection_reason || 'بدون سبب'}). يمكنك إعادة الطلب.`;
        }
      } else if (line.claimed_by_user_id && line.claim_status === 'approved') {
        canClaim = false;
        claimMessage = 'هذا الرقم معتمد ومربوط بحساب تاجر/مستخدم آخر';
      } else {
        canClaim = true;
        claimMessage = 'الرقم متوفر على السيرفر ومتاح لطلب الإضافة والاعتماد';
      }

      return {
        ...(line as VipRedLine),
        canClaim,
        claimMessage,
      };
    });

    return { success: true, lines: mapped };
  } catch (err) {
    return { success: false, lines: [], error: String(err) };
  }
}

export async function submitLineClaim(
  lineId: string,
  userId: string,
  profile: VipRedProfile
): Promise<{ success: boolean; claim?: VipRedLineClaim; error?: string }> {
  try {
    // 1. فحص وجود الخط
    const { data: line, error: lineErr } = await supabase
      .from('vip_red_monitored_lines')
      .select('*')
      .eq('id', lineId)
      .single();

    if (lineErr || !line) {
      return { success: false, error: 'الرقم غير موجود على السيرفر' };
    }

    if (line.claimed_by_user_id && line.claimed_by_user_id !== userId && line.claim_status === 'approved') {
      return { success: false, error: 'عذراً، هذا الرقم مربوط ومعتمد لحساب آخر' };
    }

    // 2. إدخال أو تحديث سجل الطلب
    const { data: claim, error: claimErr } = await supabase
      .from('vip_red_line_claims')
      .insert({
        line_id: lineId,
        user_id: userId,
        phone_number: line.phone_number,
        requester_name: profile.full_name,
        requester_whatsapp: profile.whatsapp_phone,
        requester_role: profile.role_type,
        status: 'pending',
      })
      .select('*')
      .single();

    if (claimErr || !claim) {
      return { success: false, error: claimErr?.message || 'فشل إرسال طلب الربط' };
    }

    // 3. تحديث حالة الخط إلى قيد الانتظار
    await supabase
      .from('vip_red_monitored_lines')
      .update({
        claimed_by_user_id: userId,
        claim_status: 'pending',
        claim_rejection_reason: null,
      })
      .eq('id', lineId);

    // 4. إشعار المالك بالطلب الجديد
    try {
      await supabase.from('notifications').insert({
        title: 'طلب ربط رقم جديد بقسم ريد VIP',
        body: `قام ${profile.role_type === 'merchant' ? 'التاجر' : 'المستخدم'} "${profile.full_name}" بطلب اعتماد الرقم ${line.phone_number}.`,
        type: 'vip_red_merchants',
        priority: 'high',
        action_url: '/vip-red/requests',
        is_read: false,
        is_global: true,
      });
    } catch (notifErr) {
      console.warn('Failed to insert admin notification:', notifErr);
    }

    return { success: true, claim: claim as VipRedLineClaim };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── لوحة إدارة المالك لمراجعة طلبات الاعتماد ──
// ══════════════════════════════════════════════════════════════════════════

export async function getPendingLineClaims(): Promise<VipRedLineClaim[]> {
  try {
    const { data, error } = await supabase
      .from('vip_red_line_claims')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data as VipRedLineClaim[];
  } catch {
    return [];
  }
}

export async function reviewLineClaim(
  claimId: string,
  approved: boolean,
  reviewerId: string,
  rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: claim, error: fetchErr } = await supabase
      .from('vip_red_line_claims')
      .select('*')
      .eq('id', claimId)
      .single();

    if (fetchErr || !claim) {
      return { success: false, error: 'طلب الربط غير موجود' };
    }

    const newStatus = approved ? 'approved' : 'rejected';

    // 1. تحديث الطلب
    await supabase
      .from('vip_red_line_claims')
      .update({
        status: newStatus,
        rejection_reason: approved ? null : (rejectionReason?.trim() || 'هذا الرقم غير خاص بك'),
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimId);

    // 2. تحديث الخط
    if (approved) {
      // البحث عن تاجر مرتبط بهذا المستخدم إن وجد
      const { data: merchant } = await supabase
        .from('vip_red_merchants')
        .select('id')
        .eq('user_id', claim.user_id)
        .maybeSingle();

      await supabase
        .from('vip_red_monitored_lines')
        .update({
          claimed_by_user_id: claim.user_id,
          claim_status: 'approved',
          claim_rejection_reason: null,
          claimed_at: new Date().toISOString(),
          customer_name: claim.requester_name,
          ...(merchant?.id ? { merchant_id: merchant.id } : {}),
        })
        .eq('id', claim.line_id);
    } else {
      await supabase
        .from('vip_red_monitored_lines')
        .update({
          claim_status: 'rejected',
          claim_rejection_reason: rejectionReason?.trim() || 'هذا الرقم غير خاص بك',
        })
        .eq('id', claim.line_id);
    }

    // 3. إشعار المستخدم بالنتيجة
    try {
      const title = approved ? 'تمت الموافقة على طلب ربط رقمك 🎉' : 'تم رفض طلب ربط الرقم ❌';
      const body = approved
        ? `تهانينا! وافق المالك على ربط الرقم ${claim.phone_number} بحسابك في قسم ريد VIP.`
        : `عذراً، رفض المالك طلب ربط الرقم ${claim.phone_number}. السبب: ${rejectionReason || 'هذا الرقم غير خاص بك'}.`;

      await supabase.from('notifications').insert({
        user_id: claim.user_id,
        title,
        body,
        type: 'vip_red',
        priority: 'high',
        action_url: '/vip-red',
        is_read: false,
        is_global: false,
      });

      // إشعار Push خارج التطبيق
      await supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: claim.user_id,
          title,
          body,
          type: 'vip_red',
          priority: 'high',
          action_url: '/vip-red',
          send_push: true,
        },
      });
    } catch {
      // Push error is non-blocking
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── إرسال كلمة سر أنا فودافون الجديدة عند التحويل لريد ──
// ══════════════════════════════════════════════════════════════════════════

export async function submitAnaVodafonePassword(
  lineId: string,
  newPassword: string,
  requesterName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanPw = newPassword.trim();
    if (!cleanPw) {
      return { success: false, error: 'يرجى كتابة كلمة سر أنا فودافون الجديدة' };
    }

    const { data: line, error: lineErr } = await supabase
      .from('vip_red_monitored_lines')
      .update({
        ana_vodafone_password: cleanPw,
        ana_vodafone_password_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lineId)
      .select('phone_number')
      .single();

    if (lineErr || !line) {
      return { success: false, error: lineErr?.message || 'تعذر حفظ كلمة المرور' };
    }

    // إشعار المالك باستلام كلمة السر
    try {
      await supabase.from('notifications').insert({
        title: 'تم استلام كلمة سر أنا فودافون جديدة 🔑',
        body: `قام العميل/التاجر ${requesterName ? `"${requesterName}"` : ''} بتعيين كلمة سر جديدة لتطبيق أنا فودافون للرقم ${line.phone_number} بعد تحويله لريد.`,
        type: 'vip_red',
        priority: 'high',
        action_url: '/vip-red/renewals',
        is_read: false,
        is_global: true,
      });
    } catch {
      // ignore
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── تعيين باقة الخط وتوليد الفاتورة التفصيلية ──
// ══════════════════════════════════════════════════════════════════════════

export async function updateLinePackageTier(
  lineId: string,
  tier: VipRedPackageTier,
  customPrice?: number
): Promise<{ success: boolean; line?: VipRedLine; error?: string }> {
  try {
    const pkg = VIP_RED_PACKAGES[tier];
    const price = customPrice !== undefined ? customPrice : pkg.price;

    const { data, error } = await supabase
      .from('vip_red_monitored_lines')
      .update({
        package_tier: tier,
        package_price: price,
        renewal_amount: price,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lineId)
      .select('*, merchant:vip_red_merchants(*)')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'تعذر تعديل باقة الخط' };
    }

    return { success: true, line: data as VipRedLine };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export function calculateCycleInvoice(
  lines: VipRedLine[],
  cycleDay?: VipRedActivationDay | 'all'
): VipRedCycleInvoice {
  const filtered = cycleDay && cycleDay !== 'all'
    ? lines.filter(l => l.activation_day === cycleDay)
    : lines;

  let totalAmount = 0;
  let paidAmount = 0;
  let unpaidAmount = 0;

  const lineItems = filtered.map(l => {
    const tier = l.package_tier || '100gb';
    const price = l.package_price ?? VIP_RED_PACKAGES[tier]?.price ?? 450;
    const isPaid = l.payment_status === 'paid';

    totalAmount += price;
    if (isPaid) {
      paidAmount += price;
    } else {
      unpaidAmount += price;
    }

    return {
      id: l.id,
      phoneNumber: l.phone_number,
      customerName: l.customer_name,
      packageTier: tier,
      packagePrice: price,
      paymentStatus: l.payment_status || 'unpaid',
      lastPaymentDate: l.last_payment_date,
    };
  });

  return {
    cycleDay: typeof cycleDay === 'number' ? cycleDay : 7,
    totalLines: lineItems.length,
    totalAmount,
    paidAmount,
    unpaidAmount,
    lines: lineItems,
  };
}


