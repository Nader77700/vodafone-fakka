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
  
  let label: string;
  let color: string;
  let status: 'active' | 'expiring' | 'critical' | 'expired';

  if (totalSeconds > 86400) {
    // أكثر من يوم: نحسب الأيام بالسقف (30 يوم و1 دقيقة = 31، لكن إذا 29 و23 ساعة = 30)
    // لا يخصم يوم إلا بعد انتهاء 24 ساعة كاملة
    const displayDays = Math.ceil(totalSeconds / 86400);
    label  = `${displayDays} ${displayDays === 1 ? 'يوم' : displayDays === 2 ? 'يومان' : displayDays <= 10 ? 'أيام' : 'يوماً'}`;
    color  = displayDays <= 3 ? '#F7C948' : displayDays <= 7 ? '#F7C948' : '#00C896';
    status = displayDays <= 7 ? 'expiring' : 'active';
  } else {
    // آخر يوم (أقل من أو يساوي 24 ساعة): نبدأ بعرض الساعات والدقائق
    const hours   = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours >= 1) {
      label  = `${hours} ${hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتان' : hours <= 10 ? 'ساعات' : 'ساعة'}`;
      color  = '#F7C948';
      status = 'expiring';
    } else if (minutes >= 1) {
      label  = `${minutes} ${minutes === 1 ? 'دقيقة' : minutes === 2 ? 'دقيقتان' : minutes <= 10 ? 'دقائق' : 'دقيقة'}`;
      color  = '#ef4444';
      status = 'critical';
    } else {
      label  = `${seconds} ${seconds === 1 ? 'ثانية' : seconds === 2 ? 'ثانيتان' : seconds <= 10 ? 'ثوانٍ' : 'ثانية'}`;
      color  = '#ef4444';
      status = 'critical';
    }
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
