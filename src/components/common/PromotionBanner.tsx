// PromotionBanner — بانر العروض الديناميكي — PHASE 8-13
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Zap, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getActivePromotions, dismissPromotion, getPromotionView } from '@/lib/api';
import type { Promotion } from '@/lib/api';

// ── مدة الكاش ──────────────────────────────────────────────────
const STORAGE_KEY = (id: string) => `promo_dismiss_${id}`;

function shouldShow(promo: Promotion, viewCount: number, dismissed: boolean, lastViewed: string | null): boolean {
  if (!promo.is_active) return false;

  // إذا أُغلق مرة — نتحقق من السلوك
  if (dismissed) {
    switch (promo.dismiss_behavior) {
      case 'permanent': return false;
      case 'always_show': return true;
      case 'till_tomorrow': {
        if (!lastViewed) return true;
        const nextDay = new Date(lastViewed);
        nextDay.setDate(nextDay.getDate() + 1);
        return Date.now() > nextDay.getTime();
      }
      case 'hours': {
        if (!lastViewed) return true;
        const hoursMs = (promo.dismiss_hours || 24) * 3600 * 1000;
        return Date.now() > new Date(lastViewed).getTime() + hoursMs;
      }
    }
  }

  // تكرار الظهور (بدون إغلاق مسبق)
  switch (promo.display_frequency) {
    case 'always':  return true;
    case 'once':    return viewCount === 0;
    case 'daily': {
      if (!lastViewed) return true;
      const nextDay = new Date(lastViewed);
      nextDay.setDate(nextDay.getDate() + 1);
      return Date.now() > nextDay.getTime();
    }
    case 'weekly': {
      if (!lastViewed) return true;
      const nextWeek = new Date(lastViewed);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return Date.now() > nextWeek.getTime();
    }
    case 'monthly': {
      if (!lastViewed) return true;
      const nextMonth = new Date(lastViewed);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return Date.now() > nextMonth.getTime();
    }
    default: return true;
  }
}

export default function PromotionBanner() {
  const { user }                = useAuth();
  const navigate                = useNavigate();
  const [promo, setPromo]       = useState<Promotion | null>(null);
  const [visible, setVisible]   = useState(false);

  const loadPromo = useCallback(async () => {
    if (!user) return;
    try {
      const promos = await getActivePromotions();
      for (const p of promos) {
        const view = await getPromotionView(p.id, user.id);
        const viewCount  = view?.view_count  ?? 0;
        const dismissed  = view?.dismissed   ?? false;
        const lastViewed = view?.last_viewed ?? null;

        if (shouldShow(p, viewCount, dismissed, lastViewed)) {
          setPromo(p);
          setVisible(true);
          break;
        }
      }
    } catch { /* صامت */ }
  }, [user]);

  useEffect(() => { loadPromo(); }, [loadPromo]);

  const handleDismiss = async () => {
    if (!promo || !user) return;
    setVisible(false);
    await dismissPromotion(promo.id, user.id);
    // localStorage fallback للأجهزة غير المتصلة
    localStorage.setItem(STORAGE_KEY(promo.id), new Date().toISOString());
  };

  const handleCTA = () => {
    if (!promo) return;
    if (promo.internal_route) {
      navigate(promo.internal_route);
    } else if (promo.external_url) {
      window.open(promo.external_url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!promo || !visible) return null;

  const primaryColor = promo.color_primary || '#E60000';

  return (
    <div className="mx-4 mb-3">
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: `linear-gradient(135deg,${primaryColor}22,rgba(0,0,0,0.75),${primaryColor}14)`,
          border: `1.5px solid ${primaryColor}40`,
          boxShadow: `0 4px 24px ${primaryColor}18`,
        }}
      >
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 60% 80% at 10% 50%,${primaryColor}14,transparent)` }} />
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: `linear-gradient(90deg,transparent,${primaryColor}80,transparent)` }} />

        <div className="relative p-3.5 flex items-center gap-3">
          {/* أيقونة */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${primaryColor}20`, border: `1px solid ${primaryColor}40` }}>
            <Zap className="w-5 h-5" style={{ color: primaryColor }} />
          </div>

          {/* النص */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-foreground truncate">{promo.title}</p>
            {promo.description && (
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{promo.description}</p>
            )}
          </div>

          {/* أزرار */}
          <div className="flex items-center gap-1.5 shrink-0">
            {(promo.internal_route || promo.external_url) && (
              <button
                onClick={handleCTA}
                className="h-7 px-2.5 rounded-lg text-[10px] font-black text-white transition-all active:scale-[0.97] flex items-center gap-1"
                style={{ background: `linear-gradient(90deg,${primaryColor},${promo.color_secondary || primaryColor})` }}>
                {promo.cta_label || 'التفاصيل'}
                {promo.external_url && !promo.internal_route && <ExternalLink className="w-2.5 h-2.5" />}
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:bg-white/10 active:scale-[0.97]"
              aria-label="إغلاق العرض">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
