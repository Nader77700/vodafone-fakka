// فحص التحديثات التلقائي
// FORCE-UPDATE: يقرأ min_version_code + blocked_codes من app_config
// يعمل مع جميع إصدارات APK القديمة والجديدة — لا يعتمد على latestVersion لإطلاق الإجبار
import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '@/db/supabase';
import { BUILD_INFO } from '@/lib/buildInfo';

export interface AppVersion {
  version: string;
  version_code: number;
  apk_url: string;
  release_notes: string | null;
  is_latest: boolean;
  created_at: string;
  update_type: 'apk' | 'web';
}

const STORAGE_KEY = 'vf_update_dismissed_v';

export async function checkApkExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function getNativeVersionCode(): Promise<{ code: number; version: string }> {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await CapacitorApp.getInfo();
      return { code: parseInt(info.build, 10) || BUILD_INFO.versionCode, version: info.version };
    } catch { /* fallback */ }
  }
  return { code: BUILD_INFO.versionCode, version: BUILD_INFO.appVersion };
}

export function useUpdateChecker() {
  const [latestVersion,    setLatestVersion]    = useState<AppVersion | null>(null);
  const [apkExists,        setApkExists]        = useState<boolean | null>(null);
  const [dismissed,        setDismissed]        = useState(false);
  const [ready,            setReady]            = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string>(BUILD_INFO.appVersion);
  const [installedCode,    setInstalledCode]    = useState<number>(BUILD_INFO.versionCode);
  // Force Update state — مستقل عن latestVersion
  const [minVersionCode,   setMinVersionCode]   = useState<number>(0);
  const [blockedCodes,     setBlockedCodes]     = useState<number[]>([]);
  const [forceUpdateToggle, setForceUpdateToggle] = useState<boolean>(false);
  const [forceReady,       setForceReady]       = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        // 1. اقرأ versionCode الحقيقي من APK المثبَّت
        const { code, version } = await getNativeVersionCode();
        setInstalledCode(code);
        setInstalledVersion(version);

        // 2. اجلب runtime config أولاً (الأولوية — لا نحتاج latest للإجبار)
        const [configRes, versionRes] = await Promise.all([
          supabase.rpc('get_app_config_public'),
          supabase.from('app_versions').select('*').eq('is_latest', true).maybeSingle(),
        ]);

        // استخرج min_version + blocked من runtime config
        let minCode = 0;
        let blocked: number[] = [];
        let forceToggle = false;
        if (configRes.data) {
          for (const row of configRes.data as { key: string; value: string }[]) {
            if (row.key === 'version_min_supported') {
              minCode = parseInt(row.value, 10) || 0;
            }
            // version_min_code كـ fallback إذا لم يُضبط version_min_supported
            if (row.key === 'version_min_code' && minCode === 0) {
              minCode = parseInt(row.value, 10) || 0;
            }
            if (row.key === 'version_blocked_codes') {
              try { blocked = JSON.parse(row.value) || []; } catch { /* ignore */ }
            }
            // version_force_update boolean — fallback إضافي للإجبار
            if (row.key === 'version_force_update') {
              forceToggle = row.value === 'true';
            }
          }
        }
        setMinVersionCode(minCode);
        setBlockedCodes(blocked);
        setForceUpdateToggle(forceToggle);
        // Force check جاهز بمجرد قراءة config — لا ننتظر APK check
        setForceReady(true);

        // 3. معالجة آخر إصدار للبانر الاختياري
        if (versionRes.data) {
          const latest = versionRes.data as AppVersion;
          setLatestVersion(latest);

          const dismissedVersion = localStorage.getItem(STORAGE_KEY);
          if (dismissedVersion === latest.version) setDismissed(true);

          const exists = await checkApkExists(latest.apk_url);
          setApkExists(exists);
        }
      } catch { /* صامت */ }
      finally { setReady(true); }
    };

    // تشغيل فوري بدون تأخير — التحقق من التحديث الإجباري يجب أن يكون سريعاً
    check();
  }, []);

  const isApkUpdate = latestVersion?.update_type !== 'web';

  const hasUpdate = ready
    && latestVersion !== null
    && isApkUpdate
    && latestVersion.version_code > installedCode
    && apkExists === true;

  // forceUpdate — يعتمد على forceReady (config) لا ready (APK check)
  // يعمل حتى لو latestVersion غير متاح — يكفي أن installedCode < minVersionCode
  // أو أن version_force_update = true مع وجود إصدار أحدث
  const isBlocked   = blockedCodes.includes(installedCode);
  const isBelowMin  = minVersionCode > 0 && installedCode < minVersionCode;
  // version_force_update boolean toggle: يُجبر إذا كان هناك إصدار أحدث
  const isForceToggled = forceUpdateToggle && latestVersion !== null && latestVersion.version_code > installedCode;

  // ─── Guard حاسم: لا Force Update ولا hasUpdate إلا بعد التأكد من APK ───
  // apkExists=null = جارٍ الفحص، apkExists=false = الرابط ميت (لا تُظهر شيئاً)
  // يمنع شاشة "تحديث إجباري" عندما APK غير موجود أو لم يرتفع بعد
  const apkReady = apkExists === true;

  const forceUpdate = forceReady
    && ready             // انتظر اكتمال فحص APK أولاً
    && apkReady          // APK موجود فعلاً ويرجع 200
    && Capacitor.isNativePlatform()
    && (isBelowMin || isBlocked || isForceToggled);

  const showBanner = hasUpdate && !dismissed && !forceUpdate;

  const dismiss = () => {
    if (latestVersion) localStorage.setItem(STORAGE_KEY, latestVersion.version);
    setDismissed(true);
  };

  return { hasUpdate, showBanner, forceUpdate, latestVersion, apkExists, dismiss, installedVersion, installedCode };
}
