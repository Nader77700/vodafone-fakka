// ============================================================
// بصمة الجهاز — UUID ثابت لكل جهاز/تثبيت
// يُخزَّن في localStorage ويبقى عبر تبديل الحسابات
// يُستخدم لمنع تعدد الحسابات على نفس الجهاز للاستفادة
// من كودَي الهدية والتجريبي أكثر من مرة
// ============================================================

const FP_KEY = '__vfp_dfp';

/**
 * يُعيد بصمة UUID ثابتة للجهاز الحالي.
 * تُولَّد مرة واحدة وتُحفظ في localStorage إلى الأبد.
 */
export function getDeviceFingerprint(): string {
  try {
    const existing = localStorage.getItem(FP_KEY);
    if (existing && existing.length === 36) return existing;

    const fp = generateUUID();
    localStorage.setItem(FP_KEY, fp);
    return fp;
  } catch {
    // في حالة حظر localStorage (نادر جداً في WebView)
    return generateUUID();
  }
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Polyfill للإصدارات القديمة من WebView
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
