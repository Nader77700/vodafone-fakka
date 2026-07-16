// redWhatsApp.ts — مُنشئ رسالة واتساب الاحترافية لباقات Vodafone RED
// يُستخدم من VodafonePage + PackageDetailPage + SubscribePackagePage
import type { RedPackage } from '@/lib/api';
import { calcPackageDiscount } from '@/lib/api';
import { formatEgyptDate, formatEgyptTime } from '@/lib/egyptTime';

export interface RedUserInfo {
  userId:   string;
  fullName: string | null | undefined;
  username: string | null | undefined;
  phone:    string | null | undefined;
}

/** رقم واتساب الرسمي الافتراضي */
export const OFFICIAL_WA_NUMBER = '201222692182';

/**
 * ينشئ رسالة واتساب احترافية كاملة من بيانات الباقة والمستخدم
 * لا توجد قيم ثابتة — كل شيء من النظام
 */
export function buildRedWhatsAppMessage(
  pkg:  RedPackage,
  user: RedUserInfo,
): string {
  const { currentPrice, originalPrice, pct, savings } = calcPackageDiscount(pkg);
  const now     = new Date();
  const dateStr = formatEgyptDate(now);
  const timeStr = formatEgyptTime(now);

  const displayName    = user.fullName?.trim() || user.username?.trim() || 'غير محدد';
  const displayAccount = user.username?.trim() || user.fullName?.trim() || 'غير محدد';
  const displayPhone   = user.phone?.trim()    || 'غير محدد';

  const discountLine = pct > 0
    ? [
        `💸 السعر قبل الخصم:  ${originalPrice} جنيه`,
        `🏷️ نسبة الخصم:       ${pct}%`,
        `💰 قيمة الخصم:       ${savings} جنيه`,
      ].join('\n')
    : '';

  const lines = [
    `🔴 طلب اشتراك — Vodafone RED`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📋 تفاصيل الباقة`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 اسم الباقة:     ${pkg.name}`,
    `🌐 الشبكة:         ${pkg.network_name || 'Vodafone RED'}`,
    `📶 الإنترنت:       ${pkg.data_gb} جيجابايت`,
    `📞 الدقائق:        ${pkg.minutes} دقيقة`,
    `📦 الوحدات:        ${pkg.data_gb} GB + ${pkg.minutes} دقيقة`,
    `⏱️ مدة الباقة:     ${pkg.duration || '30 يوم'}`,
    `🔄 نوع التجديد:    ${pkg.renewal_type || 'تجديد تلقائي'}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💳 السعر`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `✅ السعر الحالي:   ${currentPrice} جنيه`,
    discountLine,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 بيانات المستخدم`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `🙍 اسم المستخدم:   ${displayName}`,
    `💼 اسم الحساب:     ${displayAccount}`,
    `📱 رقم الهاتف:     ${displayPhone}`,
    `🆔 معرف المستخدم:  ${user.userId}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📅 تاريخ الطلب:    ${dateStr}`,
    `🕐 وقت الطلب:      ${timeStr}`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ]
    .filter(l => l !== undefined && l !== null)
    .join('\n')
    .replace(/\n\n\n+/g, '\n\n') // normalize extra blank lines from empty discountLine
    .trim();

  return lines;
}

/**
 * ينشئ رابط واتساب كامل مع الرسالة
 * يستخدم whatsapp_number من الباقة وإلا OFFICIAL_WA_NUMBER
 */
export function buildRedWhatsAppUrl(
  pkg:  RedPackage,
  user: RedUserInfo,
): string {
  const rawNum = pkg.whatsapp_number?.replace(/\D/g, '') || OFFICIAL_WA_NUMBER;
  const num    = rawNum || OFFICIAL_WA_NUMBER;
  const msg    = buildRedWhatsAppMessage(pkg, user);
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

/**
 * للاستخدام السريع (واتساب بدون رسالة كاملة — مثل الاستفسار فقط)
 */
export function buildRedWhatsAppQueryUrl(pkg: RedPackage): string {
  const rawNum = pkg.whatsapp_number?.replace(/\D/g, '') || OFFICIAL_WA_NUMBER;
  const num    = rawNum || OFFICIAL_WA_NUMBER;
  const text   = `أريد الاستفسار عن باقة ${pkg.name} — ${pkg.network_name || 'Vodafone RED'}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

/**
 * التحقق من اكتمال بيانات المستخدم قبل الإرسال
 */
export function validateRedSubscription(
  pkg:  RedPackage | null,
  user: RedUserInfo | null,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!user?.userId)                         errors.push('يجب تسجيل الدخول أولاً');
  if (!user?.fullName && !user?.username)    errors.push('يجب إضافة اسمك في الإعدادات');
  if (!user?.phone)                          errors.push('يجب إضافة رقم الهاتف في الإعدادات');
  if (!pkg)                                  errors.push('الباقة غير موجودة');
  if (pkg && pkg.status === 'coming_soon')   errors.push('هذه الباقة ستكون متاحة قريباً');
  if (pkg && pkg.status === 'disabled')      errors.push('هذه الباقة غير متاحة حالياً');
  if (pkg && !pkg.subscription_enabled)     errors.push('الاشتراك في هذه الباقة غير مفعّل حالياً');
  return { ok: errors.length === 0, errors };
}
