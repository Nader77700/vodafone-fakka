// ── ApkInstaller Bridge ────────────────────────────────────────────────────
// واجهة TypeScript للـ Capacitor Plugin الأصلي ApkInstallerPlugin.java
// يتولى: تحميل APK بـ fetch + إرسال base64 للـ Native لكتابة الملف وتثبيته
import { registerPlugin } from '@capacitor/core';

interface ApkInstallerPlugin {
  /** تثبيت APK من مسار ملف محلي */
  install(options: { filePath: string }): Promise<void>;
  /** حفظ base64 كـ APK في cache ثم إرجاع المسار */
  saveAndInstall(options: { base64: string; fileName: string }): Promise<{ filePath: string }>;
}

export const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

// ─── تتبع التقدم ────────────────────────────────────────────────────────────
export interface DownloadProgress {
  downloaded: number;   // bytes
  total: number;        // bytes (0 = unknown)
  percent: number;      // 0–100
  speedMBps: number;
  remainingSec: number;
}

/**
 * تحميل APK مع تتبع التقدم.
 * يُرجع base64 string جاهز للإرسال للـ Native plugin.
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

  // دمج الـ chunks وتحويلها لـ base64
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
