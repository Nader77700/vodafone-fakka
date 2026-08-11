/**
 * useServicesControl — Hook يجلب إعدادات الخدمات من DB
 * يُستخدم في ServicesPage و WalletLinesPage للتحقق من:
 *  - هل القسم ظاهر؟
 *  - هل القسم في صيانة؟
 *  - هل يحتاج اشتراك؟
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/db/supabase';

export interface ServiceControlItem {
  id: string;
  visible: boolean;
  status: 'active' | 'maintenance' | 'disabled';
  access_mode: 'subscribers_only' | 'all' | 'preview_available';
  maintenance_message: string | null;
}

type ServiceControlMap = Record<string, ServiceControlItem>;

// ── cache بسيط في الذاكرة (يُعاد تحميله كل 5 دقائق) ─────────────
let _cache: ServiceControlMap | null = null;
let _cacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

export function useServicesControl() {
  const [config, setConfig] = useState<ServiceControlMap | null>(_cache);
  const [loading, setLoading] = useState(!_cache);

  const load = useCallback(async () => {
    const now = Date.now();
    if (_cache && now - _cacheTs < CACHE_TTL) {
      setConfig(_cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('services_control')
      .select('id,visible,status,access_mode,maintenance_message');
    setLoading(false);
    if (!data) return;
    const map: ServiceControlMap = {};
    for (const row of data as ServiceControlItem[]) map[row.id] = row;
    _cache = map;
    _cacheTs = now;
    setConfig(map);
  }, []);

  useEffect(() => { load(); }, [load]);

  /** هل القسم مفتوح ومرئي لمستخدم معين؟ */
  function isAccessible(
    serviceId: string,
    hasActiveSub: boolean,
    isPreview = false,
  ): {
    allowed: boolean;
    reason: 'ok' | 'hidden' | 'maintenance' | 'disabled' | 'no_subscription';
    message: string | null;
  } {
    if (!config) return { allowed: true, reason: 'ok', message: null };

    // تحقق من القسم الرئيسي — فقط حالات الصيانة/التعطيل/الإخفاء (لا نمنع بسبب الاشتراك)
    // دخول قسم الخدمات مفتوح للجميع — المنع على مستوى تنفيذ العملية داخل كل خدمة
    if (serviceId !== 'services_section') {
      const mainSection = config['services_section'];
      if (mainSection) {
        if (!mainSection.visible) return { allowed: false, reason: 'hidden', message: null };
        if (mainSection.status === 'disabled')    return { allowed: false, reason: 'disabled',    message: null };
        if (mainSection.status === 'maintenance') return { allowed: false, reason: 'maintenance', message: mainSection.maintenance_message };
      }
    }

    const svc = config[serviceId];
    if (!svc) return { allowed: true, reason: 'ok', message: null };
    if (!svc.visible)                  return { allowed: false, reason: 'hidden',      message: null };
    if (svc.status === 'disabled')     return { allowed: false, reason: 'disabled',    message: null };
    if (svc.status === 'maintenance')  return { allowed: false, reason: 'maintenance', message: svc.maintenance_message };

    // فحص services_section نفسه — الصيانة/التعطيل فقط، لا منع بسبب الاشتراك
    if (serviceId === 'services_section') {
      return { allowed: true, reason: 'ok', message: null };
    }

    if (hasActiveSub) return { allowed: true, reason: 'ok', message: null };

    if (svc.access_mode === 'subscribers_only') {
      return { allowed: false, reason: 'no_subscription', message: null };
    }

    if (svc.access_mode === 'preview_available' && isPreview) {
      return { allowed: true, reason: 'ok', message: null };
    }

    if (svc.access_mode === 'all') {
      return { allowed: true, reason: 'ok', message: null };
    }

    return { allowed: false, reason: 'no_subscription', message: null };
  }

  return { config, loading, isAccessible, reload: load };
}
