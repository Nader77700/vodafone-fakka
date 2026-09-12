/**
 * useDisclaimer — نظام إخلاء المسؤولية
 * مسؤول عن قرار واحد فقط: "هل يجب إظهار الإخلاء الآن؟"
 * لا يعتمد على Internet لكي يعمل — يقرأ الـ config من RuntimeConfig المحفوظ
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

export interface DisclaimerConfig {
  enabled: boolean;
  version: number;
  title: string;
  body: string;
  developer: string;
  showPolicy: 'once_per_version' | 'weekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'custom' | 'always';
  customDays: number;
}

interface DisclaimerState {
  /** هل يجب إظهار الإخلاء الإجباري */
  shouldShow: boolean;
  config: DisclaimerConfig | null;
  loading: boolean;
  /** الموافقة على الإخلاء */
  accept: () => Promise<void>;
  /** رفض الإخلاء → logout */
  reject: () => Promise<void>;
}

const POLICY_DAYS: Record<string, number> = {
  weekly:     7,
  monthly:    30,
  bimonthly:  60,
  quarterly:  90,
};

function policyExpiredDays(policy: string, customDays: number): number {
  if (policy === 'once_per_version') return 0;   // لا تحقق بالأيام
  if (policy === 'always')           return -1;   // دائماً يظهر
  if (policy === 'custom')           return customDays;
  return POLICY_DAYS[policy] ?? 30;
}

function isExpiredByPolicy(
  policy: string,
  customDays: number,
  acceptedAt: string | null,
): boolean {
  if (policy === 'always') return true;
  if (policy === 'once_per_version') return false; // يُعالَج بـ version check
  if (!acceptedAt) return true;
  const days = policyExpiredDays(policy, customDays);
  const diff = (Date.now() - new Date(acceptedAt).getTime()) / (1000 * 60 * 60 * 24);
  return diff >= days;
}

export function useDisclaimer(): DisclaimerState {
  const { user, signOut } = useAuth();
  const { config: runtimeConfig } = useRuntimeConfig();

  const [shouldShow, setShouldShow]  = useState(false);
  const [cfg, setCfg]                = useState<DisclaimerConfig | null>(null);
  const [loading, setLoading]        = useState(true);
  // نمنع الفحص المتكرر باستخدام ref
  const checkedRef = useRef(false);
  const userIdRef  = useRef<string | null>(null);

  // استخراج الـ config من core_app_config
  const buildConfig = useCallback((rows: { key: string; value: string }[]): DisclaimerConfig => {
    const get = (k: string, fallback = '') => rows.find(r => r.key === k)?.value ?? fallback;
    return {
      enabled:    get('disclaimer_enabled', 'true') === 'true',
      version:    parseInt(get('disclaimer_version', '1'), 10),
      title:      get('disclaimer_title',     'إخلاء مسؤولية'),
      body:       get('disclaimer_body',      ''),
      developer:  get('disclaimer_developer', 'Nader Akram'),
      showPolicy: get('disclaimer_show_policy', 'once_per_version') as DisclaimerConfig['showPolicy'],
      customDays: parseInt(get('disclaimer_custom_days', '30'), 10),
    };
  }, []);

  const checkDisclaimer = useCallback(async (uid: string) => {
    try {
      // 1. اجلب إعدادات الإخلاء
      const { data: configRows } = await supabase
        .from('core_app_config')
        .select('key, value')
        .in('key', [
          'disclaimer_enabled', 'disclaimer_version', 'disclaimer_title',
          'disclaimer_body', 'disclaimer_developer', 'disclaimer_show_policy',
          'disclaimer_custom_days',
        ]);

      if (!configRows?.length) { setLoading(false); return; }

      const disclaimerCfg = buildConfig(configRows);
      setCfg(disclaimerCfg);

      if (!disclaimerCfg.enabled) { setLoading(false); setShouldShow(false); return; }

      // 2. اجلب آخر موافقة للمستخدم
      const { data: consent } = await supabase
        .from('disclaimer_consents')
        .select('version, accepted, accepted_at')
        .eq('user_id', uid)
        .eq('accepted', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. قرار الإظهار
      let show = false;

      if (!consent) {
        // لم يوافق مطلقاً
        show = true;
      } else if (consent.version < disclaimerCfg.version) {
        // وافق على نسخة قديمة
        show = true;
      } else if (
        disclaimerCfg.showPolicy !== 'once_per_version' &&
        isExpiredByPolicy(disclaimerCfg.showPolicy, disclaimerCfg.customDays, consent.accepted_at)
      ) {
        // انتهت مدة الظهور حسب السياسة
        show = true;
      }

      setShouldShow(show);
    } catch {
      // Offline أو خطأ → لا نُجبر المستخدم
      setShouldShow(false);
    } finally {
      setLoading(false);
    }
  }, [buildConfig]);

  useEffect(() => {
    // نُعيد الفحص فقط عند تغيير user.id
    if (!user) {
      setShouldShow(false);
      setLoading(false);
      checkedRef.current = false;
      userIdRef.current  = null;
      return;
    }
    if (checkedRef.current && userIdRef.current === user.id) return;
    checkedRef.current = true;
    userIdRef.current  = user.id;
    setLoading(true);
    checkDisclaimer(user.id);
  }, [user, checkDisclaimer]);

  const accept = useCallback(async () => {
    if (!user || !cfg) return;
    await supabase.from('disclaimer_consents').upsert(
      {
        user_id:     user.id,
        version:     cfg.version,
        accepted:    true,
        accepted_at: new Date().toISOString(),
        rejected_at: null,
      },
      { onConflict: 'user_id,version' },
    );
    setShouldShow(false);
  }, [user, cfg]);

  const reject = useCallback(async () => {
    if (!user || !cfg) return;
    await supabase.from('disclaimer_consents').upsert(
      {
        user_id:     user.id,
        version:     cfg.version,
        accepted:    false,
        rejected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,version' },
    );
    checkedRef.current = false;
    userIdRef.current  = null;
    setShouldShow(false);
    await signOut();
  }, [user, cfg, signOut]);

  return { shouldShow, config: cfg, loading, accept, reject };
}
