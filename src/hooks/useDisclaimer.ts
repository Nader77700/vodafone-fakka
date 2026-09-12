/**
 * useDisclaimer — نظام إخلاء المسؤولية
 * مسؤول عن قرار واحد فقط: "هل يجب إظهار الإخلاء الآن؟"
 * - يظهر لكل المستخدمين (جدد وقدامى) عند أول دخول بعد التسجيل
 * - لا يمكن تخطيه: لا back، لا backdrop، لا route change
 * - رفض → logout فوري، دخول مرة ثانية → يظهر مجدداً
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

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
  shouldShow: boolean;
  config: DisclaimerConfig | null;
  loading: boolean;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
}

const POLICY_DAYS: Record<string, number> = {
  weekly:    7,
  monthly:   30,
  bimonthly: 60,
  quarterly: 90,
};

function isExpiredByPolicy(
  policy: string,
  customDays: number,
  acceptedAt: string | null,
): boolean {
  if (policy === 'always')           return true;
  if (policy === 'once_per_version') return false;
  if (!acceptedAt)                   return true;
  const days = policy === 'custom' ? customDays : (POLICY_DAYS[policy] ?? 30);
  const diff = (Date.now() - new Date(acceptedAt).getTime()) / (1000 * 60 * 60 * 24);
  return diff >= days;
}

export function useDisclaimer(): DisclaimerState {
  const { user, profile, loading: authLoading, signOut } = useAuth();

  const [shouldShow, setShouldShow] = useState(false);
  const [cfg, setCfg]               = useState<DisclaimerConfig | null>(null);
  const [loading, setLoading]       = useState(true);

  const checkedRef = useRef(false);
  const userIdRef  = useRef<string | null>(null);

  const buildConfig = useCallback((rows: { key: string; value: string }[]): DisclaimerConfig => {
    const get = (k: string, fb = '') => rows.find(r => r.key === k)?.value ?? fb;
    return {
      enabled:    get('disclaimer_enabled', 'true') === 'true',
      version:    parseInt(get('disclaimer_version', '1'), 10),
      title:      get('disclaimer_title', 'إخلاء مسؤولية'),
      body:       get('disclaimer_body', ''),
      developer:  get('disclaimer_developer', 'Nader Akram'),
      showPolicy: get('disclaimer_show_policy', 'once_per_version') as DisclaimerConfig['showPolicy'],
      customDays: parseInt(get('disclaimer_custom_days', '30'), 10),
    };
  }, []);

  const checkDisclaimer = useCallback(async (uid: string) => {
    try {
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

      if (!disclaimerCfg.enabled) { setShouldShow(false); setLoading(false); return; }

      const { data: consent } = await supabase
        .from('disclaimer_consents')
        .select('version, accepted_at')
        .eq('user_id', uid)
        .eq('accepted', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      let show = false;
      if (!consent) {
        show = true;
      } else if (consent.version < disclaimerCfg.version) {
        show = true;
      } else if (isExpiredByPolicy(disclaimerCfg.showPolicy, disclaimerCfg.customDays, consent.accepted_at)) {
        show = true;
      }

      setShouldShow(show);
    } catch {
      setShouldShow(false);
    } finally {
      setLoading(false);
    }
  }, [buildConfig]);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !profile) {
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
  }, [user, profile, authLoading, checkDisclaimer]);

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
