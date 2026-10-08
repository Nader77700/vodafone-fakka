import { supabase } from '@/db/supabase';
import type { VipRedLine, VipRedMerchant, VipRedActivationDay } from '@/types/vipRed';

/**
 * حساب أقرب موعد تفعيل فعلي عام (من الأيام 7، 11، 25) انطلاقاً من تاريخ معين مع مراعاة انتقال الأشهر بدقة
 */
export function getNextGeneralActivationDate(from: Date = new Date()): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  const day = from.getDate();

  if (day <= 7) {
    return new Date(year, month, 7);
  }
  if (day <= 11) {
    return new Date(year, month, 11);
  }
  if (day <= 25) {
    return new Date(year, month, 25);
  }

  // تجاوز يوم 25 في الشهر الحالي -> الانتقال ليوم 7 في الشهر التالي
  return new Date(year, month + 1, 7);
}

/**
 * حساب التاريخ الفعلي القادم ليوم تفعيل محدد (7 أو 11 أو 25)
 */
export function getNextActivationDateForDay(activationDay: VipRedActivationDay, from: Date = new Date()): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  const day = from.getDate();

  if (day <= activationDay) {
    return new Date(year, month, activationDay);
  }

  // تجاوز اليوم في الشهر الحالي -> موعده في نفس اليوم من الشهر القادم
  return new Date(year, month + 1, activationDay);
}

/**
 * حساب تاريخ التذكير (قبل موعد التفعيل بيومين)
 * يوم 7 -> تذكير يوم 5
 * يوم 11 -> تذكير يوم 9
 * يوم 25 -> تذكير يوم 23
 */
export function getReminderDateForActivation(activationDate: Date): Date {
  const rem = new Date(activationDate);
  rem.setDate(rem.getDate() - 2);
  return rem;
}

/**
 * تنسيق التاريخ لصيغة YYYY-MM-DD لمقارنات قاعدة البيانات
 */
export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface MerchantActivationStats {
  totalLines: number;
  convertedLines: number;
  monitoringLines: number;
  countDay7: number;
  countDay11: number;
  countDay25: number;
  nextActivationDate: Date | null;
  nextActivationDay: VipRedActivationDay | null;
  daysUntilNextActivation: number | null;
}

/**
 * حساب إحصائيات مواعيد التفعيل لتاجر معين بناءً على قائمة أرقامه
 */
export function calculateMerchantActivationStats(lines: VipRedLine[]): MerchantActivationStats {
  const totalLines = lines.length;
  const convertedLines = lines.filter(l => l.system_status === 'converted').length;
  const monitoringLines = lines.filter(l => l.system_status === 'monitoring').length;

  const countDay7 = lines.filter(l => l.activation_day === 7).length;
  const countDay11 = lines.filter(l => l.activation_day === 11).length;
  const countDay25 = lines.filter(l => l.activation_day === 25).length;

  const activeDays = new Set<VipRedActivationDay>();
  lines.forEach(l => {
    if (l.activation_day && (l.activation_day === 7 || l.activation_day === 11 || l.activation_day === 25)) {
      activeDays.add(l.activation_day);
    }
  });

  if (activeDays.size === 0) {
    return {
      totalLines,
      convertedLines,
      monitoringLines,
      countDay7,
      countDay11,
      countDay25,
      nextActivationDate: null,
      nextActivationDay: null,
      daysUntilNextActivation: null,
    };
  }

  const now = new Date();
  let nearestDate: Date | null = null;
  let nearestDay: VipRedActivationDay | null = null;

  activeDays.forEach(day => {
    const nextDate = getNextActivationDateForDay(day, now);
    if (!nearestDate || nextDate.getTime() < nearestDate.getTime()) {
      nearestDate = nextDate;
      nearestDay = day;
    }
  });

  let daysUntil: number | null = null;
  if (nearestDate) {
    const diffMs = (nearestDate as Date).getTime() - now.getTime();
    daysUntil = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  return {
    totalLines,
    convertedLines,
    monitoringLines,
    countDay7,
    countDay11,
    countDay25,
    nextActivationDate: nearestDate,
    nextActivationDay: nearestDay,
    daysUntilNextActivation: daysUntil,
  };
}

/**
 * محرك التذكيرات بمواعيد التفعيل:
 * - يفحص جميع الخطوط والتجار
 * - يجمّع الأرقام لكل تاجر وموعد تفعيل
 * - يحسب هل موعد التذكير (قبل يومين) حل اليوم
 * - يتحقق من منع التكرار (Idempotency) في جدول vip_red_activation_reminders
 * - يرسل إشعاراً مجمعاً للتاجر (لو مسجل) أو للآدمن (لو غير مسجل)
 */
export async function runActivationRemindersCheck(adminUserId?: string): Promise<{
  checked: number;
  sentReminders: number;
  errors: string[];
}> {
  const result = { checked: 0, sentReminders: 0, errors: [] as string[] };

  try {
    // 1. جلب التجار والخطوط النشطة
    const { data: merchants, error: mError } = await supabase
      .from('vip_red_merchants')
      .select('*')
      .eq('is_active', true);

    if (mError || !merchants) {
      result.errors.push(`فشل جلب التجار: ${mError?.message}`);
      return result;
    }

    const { data: lines, error: lError } = await supabase
      .from('vip_red_monitored_lines')
      .select('id, merchant_id, activation_day, phone_number, system_status, package_tier, package_price')
      .not('merchant_id', 'is', null)
      .not('activation_day', 'is', null);

    if (lError || !lines) {
      result.errors.push(`فشل جلب الخطوط: ${lError?.message}`);
      return result;
    }

    const today = new Date();
    const todayISO = formatDateISO(today);

    // 2. تجميع الأرقام وحساب إجمالي الفاتورة لكل (merchant_id + activation_day)
    // Key: `${merchant_id}_${activation_day}`
    const grouped = new Map<string, { merchant: VipRedMerchant; day: VipRedActivationDay; count: number; totalAmount: number }>();

    for (const line of lines) {
      if (!line.merchant_id || !line.activation_day) continue;
      const merchant = merchants.find(m => m.id === line.merchant_id);
      if (!merchant) continue;

      const key = `${line.merchant_id}_${line.activation_day}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          merchant,
          day: line.activation_day as VipRedActivationDay,
          count: 0,
          totalAmount: 0,
        });
      }
      const item = grouped.get(key)!;
      item.count += 1;
      const price = Number(line.package_price) || (line.package_tier === '200gb' ? 700 : line.package_tier === '150gb' ? 550 : 450);
      item.totalAmount += price;
    }

    result.checked = grouped.size;

    // 3. التحقق من كل مجموعة
    for (const item of grouped.values()) {
      const nextActivation = getNextActivationDateForDay(item.day, today);
      const reminderDate = getReminderDateForActivation(nextActivation);

      const activationDateISO = formatDateISO(nextActivation);
      const reminderDateISO = formatDateISO(reminderDate);

      // هل اليوم هو يوم التذكير أو بعده ولكن قبل موعد التفعيل؟
      // التذكير قبل موعد التفعيل بيومين (مثلاً: اليوم 5 للتفعيل يوم 7)
      const diffDays = Math.round((nextActivation.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // التذكير يتم عند بقاء يومين أو يوم على التفعيل (قبل التفعيل)
      if (diffDays !== 2 && diffDays !== 1) {
        continue;
      }

      // 4. التحقق من Idempotency: هل تم إرسال تذكير لهذا التاجر وهذا الموعد من قبل؟
      const { data: existingReminder } = await supabase
        .from('vip_red_activation_reminders')
        .select('id')
        .eq('merchant_id', item.merchant.id)
        .eq('activation_date', activationDateISO)
        .eq('reminder_date', reminderDateISO)
        .maybeSingle();

      if (existingReminder) {
        // تم إرسال التذكير بالفعل -> منع التكرار تماماً
        continue;
      }

      // 5. تحديد المستلم والرسالة المجمعة
      const isMerchantLinked = Boolean(item.merchant.user_id);
      const recipientType = isMerchantLinked ? 'merchant' : 'admin';
      const targetUserId = isMerchantLinked ? item.merchant.user_id! : (adminUserId || null);

      const title = isMerchantLinked
        ? 'تذكير باستحقاق باقات فودافون ريد 💳'
        : `تذكير بفاتورة باقات ريد للتاجر (${item.merchant.name})`;

      const message = isMerchantLinked
        ? `موعد تجديد باقات فودافون ريد يقترب: لديك ${item.count} أرقام تستحق التجديد يوم ${item.day} بإجمالي فاتورة ${item.totalAmount.toLocaleString()} ج.م. يرجى تسديد الاشتراكات.`
        : `تذكير: التاجر "${item.merchant.name}" لديه ${item.count} خطوط تستحق التجديد يوم ${item.day} بإجمالي مستحق ${item.totalAmount.toLocaleString()} ج.م.`;

      const actionUrl = isMerchantLinked ? `/vip-red/merchants/${item.merchant.id}` : '/vip-red/renewals';

      // 6. تسجيل التذكير في جدول vip_red_activation_reminders أولاً لضمان عدم التكرار
      const { error: insErr } = await supabase
        .from('vip_red_activation_reminders')
        .insert({
          merchant_id: item.merchant.id,
          activation_day: item.day,
          activation_date: activationDateISO,
          reminder_date: reminderDateISO,
          lines_count: item.count,
          recipient_type: recipientType,
          recipient_user_id: targetUserId,
          title,
          message,
          notification_sent: true,
        });

      if (insErr) {
        // لو تعارض فريد (Unique violation) بسبب تنافس العمليات -> تجاهل
        if (insErr.code === '23505') continue;
        console.warn('[VipRedReminders] Insert reminder record failed:', insErr);
      }

      // 7. إرسال الإشعار الفعلي عبر الدفع والتطبيق
      if (targetUserId) {
        try {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              user_id: targetUserId,
              title,
              body: message,
              type: 'vip_red',
              priority: 'high',
              action_url: actionUrl,
              send_push: true,
            },
          });
        } catch {
          // Fallback لإدخال جدول الإشعارات المباشر
          await supabase.from('notifications').insert({
            user_id: targetUserId,
            title,
            body: message,
            type: 'vip_red',
            priority: 'high',
            action_url: actionUrl,
            is_read: false,
            is_global: false,
          });
        }
      }

      result.sentReminders += 1;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    console.error('[VipRedReminders] Error running reminders:', err);
  }

  return result;
}
