/**
 * خدمة إدارة ومراقبة تحويلات خطوط ريد VIP
 */

import { supabase } from '@/db/supabase';
import { fetchLineInfo } from '@/lib/lineInfoProvider';
import {
  type VipRedLine,
  type VipRedConfig,
  classifyLineSystem,
} from '@/types/vipRed';

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
        is_enabled_globally: false,
        allowed_user_ids: [],
        check_interval_hours: 4,
        last_batch_run_at: null,
      };
    }

    return {
      id: data.id,
      is_enabled_globally: data.is_enabled_globally ?? false,
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
      is_enabled_globally: false,
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
 * جلب جميع الأرقام المراقبة الخاصة بالمستخدم
 */
export async function getMonitoredLines(userId: string): Promise<VipRedLine[]> {
  try {
    const { data, error } = await supabase
      .from('vip_red_monitored_lines')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

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
 * تنظيف واستخراج أرقام الهواتف من النص
 */
export function extractPhoneNumbers(input: string): string[] {
  // تقسيم النص بالفواصل، المسافات، الأسطر الجديدة
  const rawList = input.split(/[\n,;\s]+/);
  const validNumbers = new Set<string>();

  for (const item of rawList) {
    let cleaned = item.replace(/\D/g, '');
    if (cleaned.startsWith('20') && cleaned.length === 12) {
      cleaned = cleaned.slice(2);
    }
    if (cleaned.length === 10 && cleaned.startsWith('1')) {
      cleaned = `0${cleaned}`;
    }
    if (cleaned.startsWith('01') && cleaned.length === 11) {
      validNumbers.add(cleaned);
    }
  }

  return Array.from(validNumbers);
}

/**
 * إضافة أرقام جديدة إلى المراقبة
 */
export async function addMonitoredLines(
  phoneNumbers: string[],
  userId: string
): Promise<{ added: number; errors: string[] }> {
  let added = 0;
  const errors: string[] = [];

  for (const phone of phoneNumbers) {
    try {
      const { error } = await supabase
        .from('vip_red_monitored_lines')
        .insert({
          user_id: userId,
          phone_number: phone,
          system_status: 'monitoring',
          current_system: null,
          last_line_info: {},
          check_count: 0,
        });

      if (error) {
        if (error.code === '23505') {
          // الرقم موجود مسبقاً لهذا المستخدم
          errors.push(`الرقم ${phone} مضاف مسبقاً في قائمة المراقبة`);
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

  return { added, errors };
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

    const updates: Partial<VipRedLine> = {
      current_system: currentSystem,
      system_status: classification.status,
      last_checked_at: new Date().toISOString(),
      check_count: (line.check_count || 0) + 1,
      last_line_info: res.data,
      updated_at: new Date().toISOString(),
    };

    if (isNowConverted && !wasConverted) {
      updates.converted_at = new Date().toISOString();
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
      const notifTitle = '🎉 تم تحويل الرقم بنجاح لنظام ريد!';
      const notifBody = `تم تحويل الرقم ${line.phone_number} بنجاح إلى نظام ريد (${currentSystem || 'Enterprise member control'}) وهو جاهز للتفعيل الآن.`;

      // 1. تسجيل إشعار في قاعدة البيانات
      try {
        await supabase.from('notifications').insert({
          user_id: userId,
          title: notifTitle,
          body: notifBody,
          type: 'operation',
          priority: 'high',
          is_read: false,
          is_global: false,
        });
      } catch (ne) {
        console.warn('[VipRed] Failed to insert notification:', ne);
      }

      // 2. تشغيل التنبيه الصوتي
      playSuccessChime();

      // 3. إظهار إشعار المتصفح
      showBrowserNotification(notifTitle, notifBody);
    }

    return { success: true, line: updatedData as VipRedLine };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * فحص دفعة من الخطوط مع تأخير زمني محسوب لتجنب WAF
 */
export async function batchCheckMonitoredLines(
  lines: VipRedLine[],
  userId: string,
  onProgress?: (index: number, total: number, currentPhone: string) => void
): Promise<{ checked: number; convertedNow: number; errors: number }> {
  let checked = 0;
  let convertedNow = 0;
  let errors = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    onProgress?.(i + 1, lines.length, line.phone_number);

    const prevStatus = line.system_status;
    const res = await checkSingleMonitoredLine(line, userId);

    if (res.success && res.line) {
      checked++;
      if (res.line.system_status === 'converted' && prevStatus !== 'converted') {
        convertedNow++;
      }
    } else {
      errors++;
    }

    // تأخير 1200ms بين كل رقم لتوزيع الحمل
    if (i < lines.length - 1) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  return { checked, convertedNow, errors };
}
