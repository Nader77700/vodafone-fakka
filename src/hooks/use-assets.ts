// Hook: نظام الأصول المرئية الديناميكية — مع Cache + Realtime
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { getAllAssets } from '@/lib/api';
import type { AppAsset } from '@/lib/api';
import { cacheGetStale, cacheSet, CACHE_KEYS, preloadImages } from '@/lib/appCache';

export type AssetMap = Record<string, AppAsset>;

const DEFAULT_KEYS = [
  'splash_logo',
  'header_logo',
  'home_hero_logo',
  'welcome_icon',
  'app_logo',
  'home_banner',
];

export function useAssets() {
  const [assets, setAssets] = useState<AssetMap>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (background = false) => {
    if (!background) {
      // ── الخطوة 1: اعرض الكاش فوراً (stale) ─────────────────────────────
      const cached = await cacheGetStale<AssetMap>(CACHE_KEYS.HERO_ASSETS);
      if (cached && Object.keys(cached).length > 0) {
        setAssets(cached);
        setLoading(false);
      }
    }

    // ── الخطوة 2: جلب جديد من DB ─────────────────────────────────────────
    try {
      const rows = await getAllAssets();
      const map: AssetMap = {};
      for (const row of rows) map[row.asset_key] = row;

      // حفظ في الكاش
      await cacheSet(CACHE_KEYS.HERO_ASSETS, map);

      // تحميل مسبق للصور في الخلفية
      const urls = rows.map(r => r.public_url).filter(Boolean);
      preloadImages(urls);

      setAssets(map);
    } catch {
      // تجاهل الخطأ إذا كان الكاش موجود
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // ── Realtime: التحديث الفوري عند تغيير الأصول ─────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('app_assets_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_assets' }, () => {
        load(true); // تحديث في الخلفية
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const getUrl = useCallback(
    (key: string, fallback?: string): string => {
      const asset = assets[key];
      if (asset?.public_url && asset.public_url.trim().length > 0) {
        // إضافة cache-buster لتجنب caching القديم
        const sep = asset.public_url.includes('?') ? '&' : '?';
        return `${asset.public_url}${sep}t=${new Date(asset.updated_at).getTime()}`;
      }
      return fallback ?? '';
    },
    [assets]
  );

  const hasAsset = useCallback(
    (key: string) => !!assets[key]?.public_url && assets[key].public_url.trim().length > 0,
    [assets]
  );

  return { assets, loading, getUrl, hasAsset, reload: load };
}
