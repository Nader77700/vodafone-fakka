import { useState, useEffect, useCallback } from 'react';
import type { VodafoneOffer, OfferCategory } from './types';
import { getVodafoneOffers, subscribeVodafoneOffer, type VodafoneOfferInfo } from '@/lib/api';

function mapOffer(category: OfferCategory, info: VodafoneOfferInfo): VodafoneOffer {
  const priceStr = info.price === null || info.price === undefined ? '' : String(info.price);
  const code = info.redemption_code ? info.redemption_code : undefined;
  const tags: string[] = [];
  if (code) tags.push(`كود: ${code}`);
  return {
    id: info.id,
    offerId: info.id,
    name: info.name,
    description: info.description,
    price: priceStr,
    category,
    code,
    tags,
  };
}

function pickCategory(result: { flex_offers?: VodafoneOfferInfo[]; internet_offers?: VodafoneOfferInfo[]; other_offers?: VodafoneOfferInfo[] }, category: OfferCategory) {
  if (category === 'flex') return result.flex_offers ?? [];
  if (category === 'internet') return result.internet_offers ?? [];
  return result.other_offers ?? [];
}

export function useVodafoneOffers(category: OfferCategory) {
  const [offers, setOffers] = useState<VodafoneOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCode(null);
    try {
      const result = await getVodafoneOffers();
      if (!result.success) {
        setError(result.error ?? 'فشل تحميل العروض');
        setCode(result.code ?? null);
        setOffers([]);
      } else {
        setOffers(pickCategory(result, category).map((o) => mapOffer(category, o)));
      }
    } catch {
      setError('فشل تحميل العروض');
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  return { offers, loading, error, code, reload: load };
}

export function useSubscribeOffer() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const subscribe = useCallback(async (offer: VodafoneOffer) => {
    setLoadingId(offer.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await subscribeVodafoneOffer(offer.offerId);
      if (!result.success) {
        setError(result.error ?? 'فشل الاشتراك في العرض');
      } else {
        setSuccess(result.message ?? `تم الاشتراك في ${offer.name} بنجاح`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الاشتراك في العرض');
    } finally {
      setLoadingId(null);
    }
  }, []);

  return { subscribe, loadingId, error, success, clearError: () => setError(null), clearSuccess: () => setSuccess(null) };
}
