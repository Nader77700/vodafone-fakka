/**
 * ForceUpdateScreen — شاشة التحديث الإجباري Full Screen
 * ─────────────────────────────────────────────────────────
 * - تظهر عندما installedCode < min_version_code في DB
 * - لا يوجد زر تخطي أو إغلاق
 * - تمنع زر الرجوع على Android
 * - تفتح رابط APK من Supabase Storage مباشرة (NEVER GitHub)
 *
 * ⚠️ لا تستخدم روابط GitHub Releases هنا أبداً:
 *    - GitHub لا يحدّث latest release تلقائياً
 *    - سيحمّل المستخدم نسخة قديمة وتفشل الثبيت
 *    - الرابط الصحيح دائماً من DB → apkUrl من جدول app_versions
 */
import { useState, useEffect } from 'react';
import { Download, AlertTriangle, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ApkInstaller, downloadApkWithProgress, DownloadProgress } from '@/lib/apkInstaller';
import { toast } from 'sonner';

interface ForceUpdateScreenProps {
  apkUrl?: string;
  latestVersion?: string;
  customMessage?: string;
}

export default function ForceUpdateScreen({ apkUrl, latestVersion, customMessage }: ForceUpdateScreenProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // منع زر الرجوع على Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => void } | null = null;
    CapacitorApp.addListener('backButton', () => {}).then(h => { handle = h; });
    return () => { handle?.remove(); };
  }, []);

  const startInternalDownload = async () => {
    if (!apkUrl) {
      setError('عذراً، رابط التحديث غير متوفر حالياً.');
      return;
    }
    setIsDownloading(true);
    setError('');
    try {
      const base64 = await downloadApkWithProgress(apkUrl, setProgress);
      setProgress(p => ({ ...p!, percent: 100 }));
      await ApkInstaller.saveAndInstall({ base64, fileName: `VodafoneFakka-v${latestVersion || 'latest'}.apk` });
    } catch (err: any) {
      console.error('Internal update failed:', err);
      setError(err.message || 'حدث خطأ أثناء التنزيل');
      toast.error('فشل التنزيل الداخلي. يرجى نسخ الرابط واستخدام متصفح كروم.');
    } finally {
      setIsDownloading(false);
      setProgress(null);
    }
  };

  const copyUrl = async () => {
    const url = apkUrl || (window.location.origin + '/#/download');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('تم نسخ الرابط! افتح جوجل كروم والصقه للتحميل');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('تعذّر نسخ الرابط');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6 overflow-y-auto"
      style={{ background: 'linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--card)) 100%)' }}
    >
      {/* الشعار */}
      <div className="mb-8 flex flex-col items-center gap-4 mt-8">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl overflow-hidden shrink-0"
          style={{ background: 'linear-gradient(135deg, #e00 0%, #c00 100%)' }}
        >
          <img
            src="/vfp-logo.png"
            alt="Vodafone Fakka"
            className="w-16 h-16 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold gradient-text">Vodafone Fakka Premium</h1>
          <p className="text-xs text-muted-foreground mt-1">بواسطة Nader Akram</p>
        </div>
      </div>

      {/* بطاقة التحديث */}
      <div
        className="w-full max-w-sm rounded-3xl p-6 space-y-5 border border-warning/30 shadow-2xl shrink-0"
        style={{ background: 'hsl(var(--card))' }}
      >
        {/* أيقونة التنبيه */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-warning/15 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-warning" />
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-bold text-balance">
              يجب تحديث التطبيق للمتابعة
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
              {customMessage || 'إصدارك الحالي قديم ولا يدعم الخدمة. يرجى تحديث التطبيق للاستمرار.'}
            </p>
          </div>
        </div>

        {/* رقم الإصدار */}
        {latestVersion && (
          <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <span className="text-xs text-muted-foreground">الإصدار الجديد:</span>
            <span className="text-sm font-bold text-primary">v{latestVersion}</span>
          </div>
        )}

        {/* زر التحديث الداخلي أو شريط التقدم */}
        {isDownloading ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold px-1">
              <span className="text-primary flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري التنزيل...
              </span>
              <span>{progress?.percent || 0}%</span>
            </div>
            <div className="h-3 w-full bg-muted rounded-full overflow-hidden relative">
              <div 
                className="absolute top-0 right-0 h-full bg-primary transition-all duration-300"
                style={{ width: `${progress?.percent || 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
              <span>{((progress?.downloaded || 0) / 1024 / 1024).toFixed(1)} MB</span>
              {progress?.remainingSec ? <span>متبقي {progress.remainingSec}ث</span> : null}
            </div>
          </div>
        ) : (
          <Button
            onClick={startInternalDownload}
            disabled={!Capacitor.isNativePlatform()}
            className="w-full h-14 text-base font-bold rounded-2xl gap-2 shadow-lg relative overflow-hidden"
            style={{
              background: Capacitor.isNativePlatform() ? 'linear-gradient(135deg, #e00 0%, #c00 100%)' : 'hsl(var(--muted))',
              color: Capacitor.isNativePlatform() ? '#fff' : 'hsl(var(--muted-foreground))',
              boxShadow: Capacitor.isNativePlatform() ? '0 4px 20px #e0000040' : 'none',
            }}
          >
            <Download className="w-5 h-5" />
            {Capacitor.isNativePlatform() ? 'تحديث الآن (تثبيت داخلي)' : 'التحديث متاح في التطبيق فقط'}
          </Button>
        )}

        {/* رسالة الخطأ */}
        {error && (
          <div className="text-xs text-center text-destructive bg-destructive/10 p-2 rounded-lg">
            {error}
          </div>
        )}

        {/* رابط النسخ (Fallback) */}
        <div className="pt-2 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground text-center mb-3 leading-relaxed">
            إذا واجهتك مشكلة في التنزيل الداخلي أو توقف التحميل،<br/> انسخ الرابط وافتحه في <span className="font-bold text-foreground">Google Chrome</span>
          </p>
          <Button
            variant="outline"
            onClick={copyUrl}
            className="w-full h-10 text-xs font-bold rounded-xl gap-2"
          >
            <Copy className="w-4 h-4" />
            {copied ? 'تم النسخ بنجاح!' : 'نسخ رابط آخر إصدار'}
          </Button>
        </div>
      </div>

      {/* رسالة تحتية */}
      <p className="mt-6 mb-8 text-xs text-muted-foreground text-center shrink-0">
        لا يمكن استخدام التطبيق قبل التحديث
      </p>
    </div>
  );
}
