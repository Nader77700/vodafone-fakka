// ============================================================
// بصمة الجهاز — متعددة الإشارات ومقاومة للحذف وإعادة التثبيت
// الإشارات المستخدمة:
//   1. localStorage UUID (أسرع وأبسط)
//   2. hardware_hash: مشتق من خصائص الجهاز الثابتة (Canvas/WebGL/Screen/CPU)
//   3. device_id: يُرسَل من Android Native عبر header/window
// ============================================================

const FP_KEY     = '__vfp_dfp';
const HW_KEY     = '__vfp_hwfp';
const STABLE_KEY = '__vfp_stable'; // يدمج localStorage + hardware للاستمرارية

// ── استخراج device_id من Android Native ──────────────────────────────
export function getNativeDeviceId(): string | null {
  try {
    // Capacitor يحقن الـ device_id في window.__DEVICE_ID__ عبر capacitor.config
    // أو يمكن قراءته من cookie محقون أو localStorage من Native
    const w = window as Window & { __DEVICE_ID__?: string; __ANDROID_ID__?: string };
    return w.__DEVICE_ID__ ?? w.__ANDROID_ID__ ?? localStorage.getItem('__vfp_native_id');
  } catch { return null; }
}

// ── حساب hardware_hash من خصائص الجهاز الثابتة ───────────────────────
export function computeHardwareHash(): string {
  try {
    const parts: string[] = [];

    // 1. Screen resolution + color depth
    parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

    // 2. Timezone
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // 3. Language
    parts.push(navigator.language);

    // 4. CPU cores
    parts.push(String(navigator.hardwareConcurrency ?? 0));

    // 5. Platform (OS)
    parts.push(navigator.platform ?? '');

    // 6. User-Agent hash (أول 80 حرف)
    parts.push((navigator.userAgent ?? '').slice(0, 80));

    // 7. Canvas fingerprint
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('VFP🔒بصمة', 2, 2);
        ctx.fillStyle = 'rgba(200,0,100,0.5)';
        ctx.fillRect(10, 10, 100, 20);
        parts.push(canvas.toDataURL().slice(-50));
      }
    } catch { /* ignore */ }

    // 8. WebGL renderer
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (gl) {
        const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbgInfo) {
          parts.push(gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) ?? '');
          parts.push(gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL) ?? '');
        }
      }
    } catch { /* ignore */ }

    // تحويل للـ hash باستخدام djb2
    const raw = parts.join('|');
    let h = 5381;
    for (let i = 0; i < raw.length; i++) {
      h = ((h << 5) + h) ^ raw.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  } catch {
    return 'hw-fallback';
  }
}

// ── الدالة الرئيسية: بصمة UUID ثابتة (localStorage) ─────────────────
export function getDeviceFingerprint(): string {
  try {
    const existing = localStorage.getItem(FP_KEY);
    if (existing && existing.length === 36) return existing;
    const fp = generateUUID();
    localStorage.setItem(FP_KEY, fp);
    return fp;
  } catch {
    return generateUUID();
  }
}

// ── hardware hash مع cache ────────────────────────────────────────────
export function getHardwareHash(): string {
  try {
    const cached = localStorage.getItem(HW_KEY);
    if (cached && cached.length >= 6) return cached;
    const hw = computeHardwareHash();
    localStorage.setItem(HW_KEY, hw);
    return hw;
  } catch {
    return computeHardwareHash();
  }
}

// ── بصمة مستقرة تجمع localStorage + hardware ─────────────────────────
// تعيش حتى لو حُذف localStorage — يمكن إعادة استنتاجها من hardware
export function getStableDeviceIdentity(): {
  device_fp: string;
  hardware_hash: string;
  device_id: string | null;
} {
  const device_fp    = getDeviceFingerprint();
  const hardware_hash = getHardwareHash();
  const device_id    = getNativeDeviceId();

  // إذا فُقد device_fp من localStorage ولكن hardware_hash موجود — نسجّل مرة أخرى
  try {
    const stableFp = localStorage.getItem(STABLE_KEY);
    if (!stableFp) {
      // أول مرة: احفظ الـ hardware_hash كمرجع للتعرف المستقبلي
      localStorage.setItem(STABLE_KEY, `${device_fp}:${hardware_hash}`);
    }
  } catch { /* ignore */ }

  return { device_fp, hardware_hash, device_id };
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
