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
import { useEffect } from 'react';
import { Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const SUPABASE_STORAGE = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases';

interface ForceUpdateScreenProps {
  apkUrl?: string;
  latestVersion?: string;
}

export default function ForceUpdateScreen({ apkUrl, latestVersion }: ForceUpdateScreenProps) {

  // منع زر الرجوع على Android — المستخدم لا يستطيع الهروب من الشاشة
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => void } | null = null;
    CapacitorApp.addListener('backButton', () => {
      // لا تفعل شيئاً — ابقَ في شاشة التحديث
    }).then(h => { handle = h; });
    return () => { handle?.remove(); };
  }, []);

  const handleUpdate = async () => {
    // ── بناء رابط التنزيل بالأولوية: ─────────────────────────────────────
    // 1. apkUrl من DB (app_versions.apk_url) — المصدر الوحيد الصحيح
    // 2. بناء رابط Supabase من رقم الإصدار كـ fallback
    // ⛔ لا GitHub Releases أبداً — يبقى قديماً ولا يُحدَّث تلقائياً
    let downloadUrl: string;

    if (apkUrl && apkUrl.startsWith('https://') && (apkUrl.includes('apk-releases') || apkUrl.includes('supabase.co'))) {
      // الرابط من DB صحيح ومن Supabase Storage ✅
      downloadUrl = apkUrl;
    } else if (latestVersion) {
      // بناء الرابط من رقم الإصدار كـ fallback
      downloadUrl = `${SUPABASE_STORAGE}/VodafoneFakka-v${latestVersion}.apk`;
    } else {
      // آخر حل — أحدث إصدار معروف في Supabase
      downloadUrl = `${SUPABASE_STORAGE}/VodafoneFakka-v3.0.276.apk`;
    }

    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: downloadUrl, windowName: '_system' });
    } else {
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--card)) 100%)' }}
    >
      {/* الشعار */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl overflow-hidden"
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
        className="w-full max-w-sm rounded-3xl p-6 space-y-5 border border-warning/30 shadow-2xl"
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
              إصدارك الحالي قديم ولا يدعم الخدمة. يرجى تحديث التطبيق للاستمرار في الاستخدام.
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

        {/* زر التحديث */}
        <Button
          onClick={handleUpdate}
          className="w-full h-14 text-base font-bold rounded-2xl gap-2 shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #e00 0%, #c00 100%)',
            color: '#fff',
            boxShadow: '0 4px 20px #e0000040',
          }}
        >
          <Download className="w-5 h-5" />
          تحديث الآن
        </Button>

        {/* تعليمات */}
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          بعد التحميل، افتح الملف من &quot;التنزيلات&quot; وثبّت التطبيق
        </p>
      </div>

      {/* رسالة تحتية — لا يوجد تخطي */}
      <p className="mt-6 text-xs text-muted-foreground text-center">
        لا يمكن استخدام التطبيق قبل التحديث
      </p>
    </div>
  );
}
