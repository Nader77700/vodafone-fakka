// مدير جلسة أنا فودافون — Session Manager
// يخزّن بيانات الجلسات في localStorage (مدة 24 ساعة لكل جلسة)
// يدعم حسابات متعددة مع التبديل الفوري بينها

const MULTI_KEY   = 'avb_multi_v2';    // مخزن الجلسات المتعددة
const ACTIVE_KEY  = 'avb_active_v2';   // الحساب النشط حالياً
const REMEMBER_KEY = 'avb_remember_v2'; // بيانات "تذكرني" آخر حساب

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 ساعة

export interface BalanceSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;   // Unix ms
  msisdn: string;       // بدون صفر
  phone: string;        // 01XXXXXXXXX
  created_at: number;   // Unix ms
}

export interface RememberedCredentials {
  phone: string;
  password: string; // مشفَّر XOR
  saved_at: number;
}

// ── XOR بسيط لإخفاء كلمة المرور في الذاكرة ──
function xorEncode(text: string, key: string): string {
  let r = '';
  for (let i = 0; i < text.length; i++)
    r += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  return btoa(r);
}
function xorDecode(encoded: string, key: string): string {
  try {
    const t = atob(encoded);
    let r = '';
    for (let i = 0; i < t.length; i++)
      r += String.fromCharCode(t.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return r;
  } catch { return ''; }
}
const ENCODE_KEY = 'vf-fakka-premium-2026';

// ── مساعدات التخزين ──
function readMulti(): Record<string, BalanceSession> {
  try {
    const raw = localStorage.getItem(MULTI_KEY);
    return raw ? (JSON.parse(raw) as Record<string, BalanceSession>) : {};
  } catch { return {}; }
}
function writeMulti(store: Record<string, BalanceSession>): void {
  try { localStorage.setItem(MULTI_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}
function isSessionValid(s: BalanceSession): boolean {
  return s.expires_at > Date.now() + 60_000;
}

// ══════════════════════════════════════════════════════════
// CRUD الجلسات المتعددة
// ══════════════════════════════════════════════════════════

/** إضافة / تحديث جلسة وتفعيلها كحساب نشط */
export function saveBalanceSession(session: BalanceSession): void {
  const store = readMulti();
  store[session.phone] = session;
  writeMulti(store);
  try { localStorage.setItem(ACTIVE_KEY, session.phone); } catch { /* ignore */ }
}

/** استرجاع الجلسة النشطة — null إذا انتهت أو غير موجودة */
export function getBalanceSession(): BalanceSession | null {
  try {
    const phone = localStorage.getItem(ACTIVE_KEY);
    if (!phone) return null;
    const store = readMulti();
    const s = store[phone];
    if (!s || !isSessionValid(s)) {
      // إزالة الجلسة المنتهية والتحويل للتالية
      delete store[phone];
      writeMulti(store);
      const remaining = Object.values(store).filter(isSessionValid);
      if (remaining.length > 0) {
        const next = remaining[0];
        localStorage.setItem(ACTIVE_KEY, next.phone);
        return next;
      }
      localStorage.removeItem(ACTIVE_KEY);
      return null;
    }
    return s;
  } catch { return null; }
}

/** استرجاع كل الجلسات الصالحة */
export function getAllSessions(): BalanceSession[] {
  const store = readMulti();
  // تنظيف المنتهية
  const valid: Record<string, BalanceSession> = {};
  for (const [phone, s] of Object.entries(store)) {
    if (isSessionValid(s)) valid[phone] = s;
  }
  writeMulti(valid);
  return Object.values(valid).sort((a, b) => b.created_at - a.created_at);
}

/** التبديل لحساب آخر — يرجع الجلسة المفعَّلة أو null */
export function switchToSession(phone: string): BalanceSession | null {
  const store = readMulti();
  const s = store[phone];
  if (!s || !isSessionValid(s)) {
    delete store[phone];
    writeMulti(store);
    return null;
  }
  try { localStorage.setItem(ACTIVE_KEY, phone); } catch { /* ignore */ }
  return s;
}

/** حذف جلسة محددة */
export function removeSession(phone: string): void {
  const store = readMulti();
  delete store[phone];
  writeMulti(store);
  try {
    const active = localStorage.getItem(ACTIVE_KEY);
    if (active === phone) {
      const remaining = Object.values(store).filter(isSessionValid);
      if (remaining.length > 0) {
        localStorage.setItem(ACTIVE_KEY, remaining[0].phone);
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
    }
  } catch { /* ignore */ }
}

/** حذف الجلسة النشطة */
export function clearBalanceSession(): void {
  try {
    const phone = localStorage.getItem(ACTIVE_KEY);
    if (phone) removeSession(phone);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* ignore */ }
}

/** تسجيل الخروج الكامل — يحذف كل الجلسات */
export function signOutBalance(): void {
  try {
    localStorage.removeItem(MULTI_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(REMEMBER_KEY);
  } catch { /* ignore */ }
}

/** هل يوجد جلسة نشطة؟ */
export function isBalanceSessionActive(): boolean {
  return getBalanceSession() !== null;
}

// ══════════════════════════════════════════════════════════
// مساعدات عرض معلومات الجلسة
// ══════════════════════════════════════════════════════════

/** كم دقيقة تبقّت على انتهاء الجلسة النشطة */
export function sessionRemainingMinutes(): number {
  const s = getBalanceSession();
  if (!s) return 0;
  return Math.max(0, Math.round((s.expires_at - Date.now()) / 60_000));
}

/** وقت الانتهاء المنسَّق (ساعة:دقيقة) */
export function sessionExpiryLabel(): string {
  const s = getBalanceSession();
  if (!s) return '';
  return new Date(s.expires_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

/** وقت الانتهاء كامل: "السبت ٢٨ يونيو ٩:٤٣ م" */
export function sessionExpiryFullLabel(): string {
  const s = getBalanceSession();
  if (!s) return '';
  return new Date(s.expires_at).toLocaleString('ar-EG', {
    weekday: 'short', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}

/** نسبة ما مضى من مدة الـ 24 ساعة (0–100) */
export function sessionProgressPercent(session?: BalanceSession): number {
  const s = session ?? getBalanceSession();
  if (!s) return 0;
  const elapsed = Date.now() - s.created_at;
  return Math.min(100, Math.round((elapsed / SESSION_DURATION_MS) * 100));
}

/** وصف المدة المتبقية بشكل واضح */
export function sessionRemainingLabel(session?: BalanceSession): string {
  const s = session ?? getBalanceSession();
  if (!s) return '';
  const mins = Math.max(0, Math.round((s.expires_at - Date.now()) / 60_000));
  if (mins < 1) return 'أقل من دقيقة';
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} س ${m} د` : `${h} ساعة`;
}

// ══════════════════════════════════════════════════════════
// "تذكرني" — آخر حساب مُسجَّل
// ══════════════════════════════════════════════════════════

/** حفظ بيانات آخر تسجيل دخول للملء التلقائي */
export function saveRememberedCredentials(phone: string, password: string): void {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({
      phone,
      password: xorEncode(password, ENCODE_KEY),
      saved_at: Date.now(),
    } as RememberedCredentials));
  } catch { /* ignore */ }
}

/** استرجاع البيانات المحفوظة (تنتهي بعد 7 أيام) */
export function getRememberedCredentials(): { phone: string; password: string } | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const creds: RememberedCredentials = JSON.parse(raw);
    if (Date.now() - creds.saved_at > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(REMEMBER_KEY);
      return null;
    }
    return { phone: creds.phone, password: xorDecode(creds.password, ENCODE_KEY) };
  } catch { return null; }
}

/** حذف بيانات التذكر */
export function clearRememberedCredentials(): void {
  try { localStorage.removeItem(REMEMBER_KEY); } catch { /* ignore */ }
}

/** هل يوجد بيانات محفوظة؟ */
export function hasRememberedCredentials(): boolean {
  return getRememberedCredentials() !== null;
}
