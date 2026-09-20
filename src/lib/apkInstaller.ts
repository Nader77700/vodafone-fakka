// ── ApkInstaller Bridge ────────────────────────────────────────────────────
// واجهة TypeScript للـ Capacitor Plugin الأصلي ApkInstallerPlugin.java
// يتولى: تحميل APK عبر Filesystem.downloadFile (بدون base64 في الذاكرة)
//         ثم تمرير مسار الملف للـ Native plugin لتثبيته
import { registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

interface ApkInstallerPlugin {
  /** تثبيت APK من مسار ملف محلي */
  install(options: { filePath: string }): Promise<void>;
  /** حفظ base64 كـ APK في cache ثم إرجاع المسار (fallback قديم) */
  saveAndInstall(options: { base64: string; fileName: string }): Promise<{ filePath: string }>;
}

export const ApkInstallerNative = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

export const ApkInstaller = {
  saveAndInstall: async (options: { base64: string; fileName: string }) => {
    try {
      const result = await Filesystem.writeFile({
        path: options.fileName,
        data: options.base64,
        directory: Directory.Cache
      });
      await ApkInstallerNative.install({ filePath: result.uri });
      return { filePath: result.uri };
    } catch {
      return ApkInstallerNative.saveAndInstall(options);
    }
  }
};

// ─── تتبع التقدم ────────────────────────────────────────────────────────────
export interface DownloadProgress {
  downloaded: number;   // bytes
  total: number;        // bytes (0 = unknown)
  percent: number;      // 0–100
  speedMBps: number;
  remainingSec: number;
}

/**
 * تحميل APK مباشرةً للملف عبر Filesystem.downloadFile
 * ← لا يحمّل الملف كاملاً في الذاكرة → آمن على كل ذاكرة
 * ← يُرجع مسار الملف المحلي (file:// أو content://)
 */
export async function downloadApkToFile(
  url: string,
  fileName: string,
  onProgress: (p: DownloadProgress) => void
): Promise<string> {
  const startTime = Date.now();

  // تتبع مسبق لحجم الملف عبر HEAD
  let total = 0;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    total = parseInt(head.headers.get('content-length') || '0', 10);
  } catch { /* غير ضروري */ }

  // شريط تقدم وهمي سريع حتى اكتمال التنزيل
  let fakePercent = 0;
  const fakeTimer = setInterval(() => {
    if (fakePercent < 90) {
      fakePercent = Math.min(90, fakePercent + 3);
      const elapsed = (Date.now() - startTime) / 1000 || 0.001;
      onProgress({
        downloaded: Math.round(total * fakePercent / 100),
        total,
        percent: fakePercent,
        speedMBps: (total * fakePercent / 100) / 1024 / 1024 / elapsed,
        remainingSec: Math.max(0, Math.round(((100 - fakePercent) / 3) * 0.5))
      });
    }
  }, 500);

  try {
    const result = await Filesystem.downloadFile({
      url,
      path: fileName,
      directory: Directory.Cache,
    });
    clearInterval(fakeTimer);
    onProgress({ downloaded: total, total, percent: 100, speedMBps: 0, remainingSec: 0 });
    const filePath = result.path ?? '';
    if (!filePath) throw new Error('لم يُعاد مسار الملف من Filesystem.downloadFile');
    return filePath;
  } catch (e) {
    clearInterval(fakeTimer);
    throw e;
  }
}

/**
 * تحميل APK مع تتبع التقدم (طريقة قديمة — base64 في الذاكرة).
 * تُستخدم كـ fallback فقط إذا فشل downloadApkToFile.
 */
export async function downloadApkWithProgress(
  url: string,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const total     = parseInt(response.headers.get('content-length') || '0', 10);
  const reader    = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let downloaded  = 0;
  const startTime = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    downloaded += value.length;
    const elapsed   = (Date.now() - startTime) / 1000 || 0.001;
    const speedMBps = downloaded / 1024 / 1024 / elapsed;
    const percent   = total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0;
    const remaining = total > 0 ? Math.round((total - downloaded) / 1024 / 1024 / speedMBps) : 0;
    onProgress({ downloaded, total, percent, speedMBps, remainingSec: remaining });
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const merged   = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < merged.length; i += chunkSize) {
    binary += String.fromCharCode(...merged.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
