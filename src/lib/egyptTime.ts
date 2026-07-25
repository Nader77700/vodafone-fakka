/**
 * egyptTime.ts — أدوات تنسيق الوقت المصري (Africa/Cairo)
 * يُستخدم في جميع شاشات التطبيق بدلاً من toLocaleString المباشر
 */

const CAIRO_TZ = 'Africa/Cairo';
const AR_EG     = 'ar-EG';

/** وقت مصري: ٨:١٥ مساءً */
export function formatEgyptTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString(AR_EG, {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: CAIRO_TZ,
  });
}

/** تاريخ مصري: ٢١ يونيو ٢٠٢٦ */
export function formatEgyptDate(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleDateString(AR_EG, {
    day:   'numeric',
    month: 'long',
    year:  'numeric',
    timeZone: CAIRO_TZ,
  });
}

/** تاريخ مختصر: ٢١ يونيو */
export function formatEgyptDateShort(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleDateString(AR_EG, {
    day:   'numeric',
    month: 'short',
    timeZone: CAIRO_TZ,
  });
}

/** تاريخ + وقت كامل: ٢١ يونيو ٢٠٢٦ · ٨:١٥ مساءً */
export function formatEgyptDateTime(date: Date | string | number): string {
  return `${formatEgyptDate(date)} · ${formatEgyptTime(date)}`;
}

/** تاريخ إنجليزي للـ receipt: 21/06/2026 */
export function formatReceiptDate(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { timeZone: CAIRO_TZ });
}

/** وقت الفاتورة بأرقام إنجليزية: 11:02 AM / 03:45 PM */
export function formatReceiptTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   true,
    timeZone: CAIRO_TZ,
  });
}
