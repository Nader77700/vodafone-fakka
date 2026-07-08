// بانر التحديث الداخلي — تحميل وتثبيت APK مباشرة داخل التطبيق
//
// ⚠️ قاعدة React Hooks حرجة: يجب استدعاء جميع الـ hooks (useState/useRef/useCallback)
// قبل أي return مشروط — وإلا يرمي React خطأ "Rendered more/fewer hooks"
// الذي يظهر كشاشة "حدث خطأ غير متوقع" عند أول ظهور تحديث جديد.
//
import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, X, Sparkles, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useUpdateChecker } from '@/hooks/useUpdateChecker';
import { ApkInstaller, downloadApkWithProgress, type DownloadProgress } from '@/lib/apkInstaller';
type Phase = 'idle' | 'downloading' | 'ready' | 'installing' | 'error';

function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function fmtSpeed(mbps: number) {
  return mbps < 1 ? `${(mbps * 1024).toFixed(0)} KB/s` : `${mbps.toFixed(1)} MB/s`;
}

export default function UpdateBanner() {
  const { showBanner, latestVersion, apkExists, dismiss, installedVersion } = useUpdateChecker();
  const navigate = useNavigate();

  // ── كل الـ hooks يجب أن تكون هنا قبل أي return مشروط ──────────────────
  const [phase,     setPhase]     = useState<Phase>('idle');
  const [progress,  setProgress]  = useState<DownloadProgress | null>(null);
  const [base64Apk, setBase64Apk] = useState<string>('');
  const [errMsg,    setErrMsg]    = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // ── بدء التحميل (hook يجب أن يكون قبل return null) ─────────────────────
  const handleDownload = useCallback(async () => {
    if (!latestVersion) return;

    // على المتصفح (web) → تنزيل مباشر
    if (!isNative) {
      const a = document.createElement('a');
      a.href = latestVersion.apk_url;
      a.download = `VodafoneFakka-${latestVersion.version}.apk`;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      return;
    }

    // على الجهاز الأصلي → محاولة التحميل الداخلي مع fallback
    setPhase('downloading');
    setErrMsg('');
    abortRef.current = new AbortController();
    try {
      const b64 = await downloadApkWithProgress(
        latestVersion.apk_url,
        (p) => setProgress(p),
        abortRef.current.signal
      );
      setProgress(prev => prev ? { ...prev, percent: 100 } : null);
      setBase64Apk(b64);
      setPhase('ready');
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') {
        setPhase('idle');
      } else {
        // Fallback: إذا فشل التحميل الداخلي → افتح رابط التنزيل في المتصفح
        setPhase('idle');
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: latestVersion.apk_url, windowName: '_blank' });
        } catch {
          window.open(latestVersion.apk_url, '_blank');
        }
      }
    }
  }, [isNative, latestVersion]);

  // ── تثبيت APK (hook يجب أن يكون قبل return null) ────────────────────────
  const handleInstall = useCallback(async () => {
    if (!latestVersion || !base64Apk) {
      // base64 فارغ → fallback لتنزيل مباشر
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: latestVersion!.apk_url, windowName: '_blank' });
      } catch {
        window.open(latestVersion!.apk_url, '_blank');
      }
      return;
    }
    setPhase('installing');
    try {
      await ApkInstaller.saveAndInstall({
        base64:   base64Apk,
        fileName: `VodafoneFakka-${latestVersion.version}.apk`,
      });
    } catch (e: unknown) {
      setErrMsg((e as Error)?.message ?? 'خطأ في التثبيت');
      setPhase('error');
    }
  }, [base64Apk, latestVersion]);

  // ── العودة المبكرة: بعد جميع الـ hooks ─────────────────────────────────
  // FIX: هذه السطر كانت قبل useCallback فيما مضى — هذا هو السبب الجذري للكراش
  if (!showBanner || !latestVersion) return null;

  const noteSummary = null; // لا تُظهر أي تفاصيل للمستخدمين — البانر يعرض رقم الإصدار فقط

  const handleCancel = () => {
    abortRef.current?.abort();
    setPhase('idle');
    setProgress(null);
  };

  const pct = progress?.percent ?? 0;

  return (
    <div
      dir="rtl"
      className="fixed bottom-0 left-0 right-0 z-50 p-3 md:p-4 animate-in slide-in-from-bottom-4 duration-300"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="max-w-lg mx-auto rounded-2xl overflow-hidden"
        style={{
          pointerEvents: 'auto',
          background: 'linear-gradient(135deg, #1a0000 0%, #0D0303 60%, #1a0505 100%)',
          border: '1.5px solid rgba(230,0,0,0.55)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.75), 0 0 24px rgba(230,0,0,0.25)',
        }}
      >
        {/* شريط علوي */}
        <div className="h-0.5 w-full" style={{
          background: phase === 'downloading'
            ? `linear-gradient(to right, #E60000 ${pct}%, rgba(230,0,0,0.2) ${pct}%)`
            : 'linear-gradient(to right, #E60000, #ff4444, #E60000)',
          transition: 'background 0.3s',
        }} />

        <div className="flex items-start gap-3 p-3">
          {/* أيقونة الحالة */}
          <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5"
            style={{ background: 'rgba(230,0,0,0.18)', border: '1px solid rgba(230,0,0,0.40)' }}>
            {phase === 'ready'      ? <CheckCircle2 className="w-4 h-4" style={{ color: '#44ff88' }} /> :
             phase === 'installing' ? <Zap          className="w-4 h-4" style={{ color: '#ffdd44' }} /> :
                                      <Sparkles     className="w-4 h-4" style={{ color: '#ff4444' }} />}
          </div>

          <div className="flex-1 min-w-0">
            {/* ── Idle ──────────────────────────────────────────────── */}
            {phase === 'idle' && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black text-white leading-tight">إصدار جديد متاح!</p>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(230,0,0,0.25)', color: '#ff6666', border: '1px solid rgba(230,0,0,0.40)' }}>
                    {latestVersion.version}
                  </span>
                  <span className="text-[10px] text-white/40">(أنت على v{installedVersion})</span>
                </div>
                {noteSummary && (
                  <p className="text-[11px] text-white/60 mt-0.5 line-clamp-2 text-pretty">{noteSummary}</p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {apkExists === false ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                      style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.30)' }}>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: '#ff6666' }} />
                      <p className="text-[11px] font-bold" style={{ color: '#ff8888' }}>ملف التحديث غير موجود على الخادم</p>
                    </div>
                  ) : (
                    <button type="button" onClick={handleDownload}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all hover:opacity-85 active:scale-95"
                      style={{ background: '#E60000', color: '#fff', boxShadow: '0 2px 12px rgba(230,0,0,0.5)' }}>
                      <Download className="w-3.5 h-3.5" />
                      {isNative ? 'تحميل التحديث داخلياً' : 'تنزيل التحديث'}
                    </button>
                  )}
                  <a href="/updates"
                    onClick={(e) => { e.preventDefault(); window.location.hash = ''; window.history.pushState({}, '', '/updates'); window.dispatchEvent(new PopStateEvent('popstate')); dismiss(); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    التفاصيل ←
                  </a>
                </div>
              </>
            )}

            {/* ── Downloading ───────────────────────────────────────── */}
            {phase === 'downloading' && progress && (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-black text-white">جاري تحميل التحديث…</p>
                  <span className="text-xs font-black tabular-nums" style={{ color: '#ff4444' }}>{pct}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full overflow-hidden mb-1.5"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-200 relative"
                    style={{
                      width: `${pct}%`,
                      background: 'linear-gradient(90deg, #990000, #E60000, #ff4444)',
                      boxShadow: pct > 5 ? '0 0 8px rgba(230,0,0,0.7)' : 'none',
                    }}>
                    {pct > 2 && (
                      <span className="absolute right-0 top-1/2 w-3 h-3 rounded-full block"
                        style={{ background: '#ff6666', boxShadow: '0 0 8px 3px rgba(230,0,0,0.8)', transform: 'translate(50%,-50%)' }} />
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/50 tabular-nums">
                    {fmtBytes(progress.downloaded)}{progress.total > 0 && ` / ${fmtBytes(progress.total)}`}
                  </span>
                  <span className="text-[11px] text-white/40 tabular-nums">
                    {fmtSpeed(progress.speedMBps)}{progress.remainingSec > 0 && ` · ${progress.remainingSec}ث`}
                  </span>
                </div>
                <button type="button" onClick={handleCancel}
                  className="text-[10px] text-white/30 mt-1.5 hover:text-white/60 transition-colors">
                  إلغاء التحميل
                </button>
              </>
            )}

            {/* ── Ready ─────────────────────────────────────────────── */}
            {phase === 'ready' && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-black text-white">اكتمل التحميل!</p>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(40,180,80,0.25)', color: '#44ff88', border: '1px solid rgba(40,180,80,0.4)' }}>
                    v{latestVersion.version}
                  </span>
                </div>
                <p className="text-[11px] text-white/55 mb-2">اضغط لبدء التثبيت الفوري</p>
                <button type="button" onClick={handleInstall}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black w-full justify-center transition-all hover:opacity-85 active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#1a8a3a,#22c55e)', color:'#fff', boxShadow:'0 2px 16px rgba(34,197,94,0.45)' }}>
                  <Zap className="w-4 h-4" />
                  تثبيت التحديث الآن
                </button>
              </>
            )}

            {/* ── Installing ────────────────────────────────────────── */}
            {phase === 'installing' && (
              <p className="text-sm font-black text-white">جاري فتح نافذة التثبيت…</p>
            )}

            {/* ── Error ─────────────────────────────────────────────── */}
            {phase === 'error' && (
              <>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: '#ff6666' }} />
                  <p className="text-[11px] font-bold leading-snug" style={{ color: '#ff8888' }}>
                    {errMsg || 'حدث خطأ'}
                  </p>
                </div>
                {errMsg?.includes('مصادر غير معروفة') ? (
                  <p className="text-[10px] text-white/45 mb-2 leading-relaxed">
                    اذهب إلى الإعدادات ← التطبيقات ← Vodafone Fakka ← تثبيت تطبيقات غير معروفة ← سماح، ثم عُد واضغط تثبيت.
                  </p>
                ) : null}
                <button type="button" onClick={() => setPhase('ready')}
                  className="text-[11px] px-3 py-1 rounded-lg font-bold"
                  style={{ background: 'rgba(230,0,0,0.2)', color: '#ff6666' }}>
                  حاول مجدداً
                </button>
              </>
            )}
          </div>

          {/* زر الإغلاق */}
          {phase !== 'downloading' && (
            <button type="button" onClick={dismiss} aria-label="إغلاق"
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/10">
              <X className="w-3.5 h-3.5 text-white/50" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
