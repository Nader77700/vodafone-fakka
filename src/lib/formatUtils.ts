// ─── مكتبة التنسيق المشتركة — أرقام إنجليزية دائماً ──────────────────────────

/** تنسيق التاريخ الإنجليزي: "25 Jun 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** أسماء الشهور العربية */
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/** تنسيق التاريخ بالعربية: "24 يونيو 2026" — أرقام إنجليزية، شهر عربي */
export function fmtDateAr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const day  = d.getDate();
  const mon  = AR_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${mon} ${year}`;
}

/**
 * محرّك الوقت المتبقي — Remaining Time Engine
 * - الأرقام إنجليزية دائماً
 * - النصوص عربية كاملة
 * - لا يظهر "منتهي" إلا بعد انتهاء الاشتراك فعلاً
 */
export function fmtTimeLeft(expiresAt: string | null | undefined): {
  label: string;
  color: string;
  status: 'active' | 'expiring' | 'critical' | 'expired';
} {
  if (!expiresAt) return { label: 'منتهي', color: '#ef4444', status: 'expired' };

  let ms: number;
  try {
    ms = new Date(expiresAt).getTime() - Date.now();
  } catch {
    return { label: 'منتهي', color: '#ef4444', status: 'expired' };
  }

  // منتهي فعلاً
  if (ms <= 0) return { label: 'منتهي', color: '#ef4444', status: 'expired' };

  const totalSeconds = Math.floor(ms / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let label: string;
  let color: string;
  let status: 'active' | 'expiring' | 'critical' | 'expired';

  if (days >= 1) {
    // أكثر من يوم: نعرض الأيام فقط
    label  = `${days} ${days === 1 ? 'يوم' : 'أيام'}`;
    color  = days <= 3 ? '#F7C948' : days <= 7 ? '#F7C948' : '#00C896';
    status = days <= 7 ? 'expiring' : 'active';
  } else if (hours >= 1) {
    // أقل من يوم وأكثر من ساعة: نعرض الساعات مباشرة
    label  = `${hours} ${hours === 1 ? 'ساعة' : 'ساعات'}`;
    color  = '#F7C948';
    status = 'expiring';
  } else if (minutes >= 1) {
    // أقل من ساعة: نعرض الدقائق
    label  = `${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'}`;
    color  = '#ef4444';
    status = 'critical';
  } else {
    // أقل من دقيقة: نعرض الثواني
    label  = `${seconds} ${seconds === 1 ? 'ثانية' : 'ثوانٍ'}`;
    color  = '#ef4444';
    status = 'critical';
  }

  return { label, color, status };
}

/** شريط التقدم — نسبة الوقت المنقضي */
export function fmtProgress(activatedAt: string | null, expiresAt: string | null): number {
  if (!activatedAt || !expiresAt) return 0;
  const total   = new Date(expiresAt).getTime() - new Date(activatedAt).getTime();
  const elapsed = Date.now() - new Date(activatedAt).getTime();
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/** تحويل الأرقام العربية إلى إنجليزية */
export function toEnNum(val: number | string | undefined | null): string {
  if (val == null) return '—';
  return String(val)
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** عدّ متحرّك — CSS counter animation مساعد */
export function fmtCount(val: number | null | undefined, fallback = '—'): string {
  if (val == null) return fallback;
  return String(val);
}
