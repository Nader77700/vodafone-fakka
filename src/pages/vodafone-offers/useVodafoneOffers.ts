import { useState, useEffect, useCallback } from 'react';
import type { VodafoneOffer, OfferCategory } from './types';

const MOCK_OFFERS: VodafoneOffer[] = [
  {
    id: 'flex-1',
    offerId: 'FLX001',
    name: 'فليكس 150',
    description: '150 وحدة فليكس صالحة لمدة 30 يوم',
    price: '75',
    category: 'flex',
    tags: ['شهري', 'مكالمات + إنترنت'],
  },
  {
    id: 'flex-2',
    offerId: 'FLX002',
    name: 'فليكس 200',
    description: '200 وحدة فليكس صالحة لمدة 30 يوم',
    price: '95',
    category: 'flex',
    tags: ['شهري', 'مكالمات + إنترنت'],
  },
  {
    id: 'flex-3',
    offerId: 'FLX003',
    name: 'فليكس 75',
    description: '75 وحدة فليكس صالحة لمدة 30 يوم',
    price: '45',
    category: 'flex',
    tags: ['شهري', 'مكالمات + إنترنت'],
  },
  {
    id: 'internet-1',
    offerId: 'INT001',
    name: 'إنترنت 5 GB',
    description: '5 جيجابايت إنترنت صالحة لمدة 30 يوم',
    price: '50',
    category: 'internet',
    tags: ['شهري', 'إنترنت'],
  },
  {
    id: 'internet-2',
    offerId: 'INT002',
    name: 'إنترنت 10 GB',
    description: '10 جيجابايت إنترنت صالحة لمدة 30 يوم',
    price: '90',
    category: 'internet',
    tags: ['شهري', 'إنترنت'],
  },
  {
    id: 'internet-3',
    offerId: 'INT003',
    name: 'إنترنت 20 GB',
    description: '20 جيجابايت إنترنت صالحة لمدة 30 يوم',
    price: '150',
    category: 'internet',
    tags: ['شهري', 'إنترنت'],
  },
  {
    id: 'other-1',
    offerId: 'OTH001',
    name: 'دقائق لكل الشبكات',
    description: '500 دقيقة لكل الشبكات صالحة لمدة 30 يوم',
    price: '60',
    category: 'other',
    tags: ['شهري', 'مكالمات'],
  },
  {
    id: 'other-2',
    offerId: 'OTH002',
    name: 'رسائل لكل الشبكات',
    description: '1000 رسالة لكل الشبكات صالحة لمدة 30 يوم',
    price: '25',
    category: 'other',
    tags: ['شهري', 'رسائل'],
  },
];

export function useVodafoneOffers(category: OfferCategory) {
  const [offers, setOffers] = useState<VodafoneOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // PHASE 1: بيانات تجريبية — سيتم الاستبدال بجلب من الـ Edge Function في PHASE 2
      await new Promise((resolve) => setTimeout(resolve, 500));
      setOffers(MOCK_OFFERS.filter((o) => o.category === category));
    } catch {
      setError('فشل تحميل العروض');
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  return { offers, loading, error, reload: load };
}

// ACTION HOOK: جاهز للربط الفعلي في PHASE 2
export function useSubscribeOffer() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const subscribe = useCallback(async (offer: VodafoneOffer) => {
    setLoadingId(offer.id);
    setError(null);
    setSuccess(null);
    try {
      // PHASE 2: استدعاء الـ Edge Function الفعلي
      await new Promise((resolve) => setTimeout(resolve, 700));
      setSuccess(`تم تجهيز الاشتراك في ${offer.name} — سيتم التفعيل في المرحلة التالية`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تجهيز الاشتراك');
    } finally {
      setLoadingId(null);
    }
  }, []);

  return { subscribe, loadingId, error, success, clearError: () => setError(null), clearSuccess: () => setSuccess(null) };
}
