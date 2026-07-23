// فحص التحديثات التلقائي
// FORCE-UPDATE: يقرأ min_version_code + blocked_codes من app_config
// يعمل مع جميع إصدارات APK القديمة والجديدة — لا يعتمد على latestVersion لإطلاق الإجبار
import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '@/db/supabase';
import { BUILD_INFO } from '@/lib/buildInfo';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

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
  const { config, isLoading: configLoading } = useRuntimeConfig();
  const [latestVersion,    setLatestVersion]    = useState<AppVersion | null>(null);
  const [apkExists,        setApkExists]        = useState<boolean | null>(null);
  const [dismissed,        setDismissed]        = useState(false);
  const [ready,            setReady]            = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string>(BUILD_INFO.appVersion);
  const [installedCode,    setInstalledCode]    = useState<number>(BUILD_INFO.versionCode);

  const minVersionCode = config.version.version_min_supported || 0;
  const blockedCodes   = config.version.version_blocked_codes || [];

  useEffect(() => {
    const check = async () => {
      try {
        const { code, version } = await getNativeVersionCode();
        setInstalledCode(code);
        setInstalledVersion(version);

        const { data } = await supabase.from('app_versions').select('*').eq('is_latest', true).maybeSingle();
        
        if (data) {
          const latest = data as AppVersion;
          setLatestVersion(latest);

          const dismissedVersion = localStorage.getItem(STORAGE_KEY);
          if (dismissedVersion === latest.version) setDismissed(true);

          const exists = await checkApkExists(latest.apk_url);
          setApkExists(exists);
        } else {
          setApkExists(false);
        }
      } catch { /* صامت */ }
      finally { setReady(true); }
    };
    check();
  }, [minVersionCode, blockedCodes.join(',')]); // إعادة الفحص فوراً عند تغيير الإعدادات لضمان جلب رابط التحديث الجديد

  const isApkUpdate = latestVersion?.update_type !== 'web';

  const hasUpdate = ready
    && latestVersion !== null
    && isApkUpdate
    && latestVersion.version_code > installedCode
    && apkExists === true;

  const isBlocked   = blockedCodes.includes(installedCode);
  const isBelowMin  = minVersionCode > 0 && installedCode < minVersionCode;

  const apkReady = apkExists === true;

  const forceUpdate = !configLoading
    && ready
    && (isBelowMin || isBlocked);

  const showBanner = hasUpdate && !dismissed && !forceUpdate;

  const dismiss = () => {
    if (latestVersion) localStorage.setItem(STORAGE_KEY, latestVersion.version);
    setDismissed(true);
  };

  return { hasUpdate, showBanner, forceUpdate, latestVersion, apkExists, dismiss, installedVersion, installedCode };
}
