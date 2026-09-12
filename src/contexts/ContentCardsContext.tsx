/**
 * ContentCardsContext — المرحلة الثانية: إدارة العروض للمستخدمين
 *
 * المسؤوليات:
 * - جلب content_cards المؤهلة للمستخدم
 * - Realtime subscription واحدة فقط (dedup + cleanup)
 * - eligibility: status + is_active + start/end + repeat policy + revision
 * - queue بالأولوية (priority DESC)
 * - seen/dismissed tracking لكل (user × card × revision)
 * - لا polling عدواني — Realtime أولاً، fallback interval 90s
 */

import React, {
  createContext, useCallback,useContext, useEffect, useMemo,useRef, 
  useState, 
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import type { ContentCard } from '@/lib/api';
import { getUserCardViews, markCardDismissed, markCardViewed } from '@/lib/api';

// ── نوع الـ view record ─────────────────────────────────────
interface ViewRecord {
  card_id:          string;
  card_revision:    number;
  view_count:       number;
  dismissed:        boolean;
  last_viewed_at:   string;
  last_dismissed_at: string | null;
}

// ── Context interface ────────────────────────────────────────
interface ContentCardsCtx {
  /** الكارت الحالي الظاهر (الأعلى أولوية) */
  currentCard:    ContentCard | null;
  /** إغلاق الكارت مؤقتاً (لا يُخفي الباقي) */
  dismissCard:    (cardId: string) => void;
  /** تسجيل أن المستخدم ضغط CTA / شاهد الكارت */
  markSeen:       (cardId: string) => void;
  /** هل يوجد كارت مؤهل */
  hasCard:        boolean;
  /** عدد الكروت المؤهلة */
  queueCount:     number;
}

const ContentCardsContext = createContext<ContentCardsCtx>({
  currentCard: null,
  dismissCard: () => {},
  markSeen:    () => {},
  hasCard:     false,
  queueCount:  0,
});

// ── ثوابت ───────────────────────────────────────────────────
const FALLBACK_POLL_MS  = 90_000;   // 90 ثانية fallback فقط
const SHOW_DELAY_MS     = 1_500;    // تأخير 1.5 ثانية بعد دخول التطبيق

// ── eligibility check ────────────────────────────────────────
function isCardEligible(
  card:    ContentCard,
  views:   Map<string, ViewRecord>,
  nowMs:   number,
): boolean {
  // حالة الكارت
  if (!card.is_active)              return false;
  if (card.status !== 'active')     return false;
  if (!card.system_enabled)         return false;

  // نطاق الوقت
  if (card.start_date && new Date(card.start_date).getTime() > nowMs) return false;
  if (card.end_date   && new Date(card.end_date).getTime()   < nowMs)  return false;

  // view record لهذا المستخدم
  const view = views.get(card.id);

  // لم يشاهده من قبل → مؤهل دائماً
  if (!view) return true;

  // revision جديد → مؤهل من جديد
  if (view.card_revision < card.revision) return true;

  // مُخفي نهائيًا وفق repeat_policy
  if (view.dismissed) {
    const policy = card.repeat_policy;
    const val    = card.repeat_value ?? 1;

    if (policy === 'once') return false;
    if (policy === 'every_open') return true; // يظهر دائماً

    const dismissedAt = view.last_dismissed_at
      ? new Date(view.last_dismissed_at).getTime()
      : 0;

    const msMap: Record<string, number> = {
      hourly:  val * 60 * 60_000,
      daily:   val * 24 * 60 * 60_000,
      weekly:  val * 7  * 24 * 60 * 60_000,
      monthly: val * 30 * 24 * 60 * 60_000,
    };
    const interval = msMap[policy];
    if (!interval) return false;
    return nowMs - dismissedAt >= interval;
  }

  return true;
}

// ════════════════════════════════════════════════════════════
//  Provider
// ════════════════════════════════════════════════════════════
export function ContentCardsProvider({ children, ready }: {
  children: React.ReactNode;
  /** true بعد انتهاء Splash + Auth */
  ready: boolean;
}) {
  const { user } = useAuth();

  const [cards,   setCards]   = useState<ContentCard[]>([]);
  const [views,   setViews]   = useState<Map<string, ViewRecord>>(new Map());
  const [visible, setVisible] = useState(false); // تأخير 1.5s أولي

  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchingRef  = useRef(false);
  const mountedRef   = useRef(true);

  // ── جلب الكروت من DB ──────────────────────────────────────
  const fetchCards = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { data, error } = await supabase
        .from('content_cards')
        .select('*')
        .eq('is_active', true)
        .eq('status', 'active')
        .eq('system_enabled', true)
        .order('priority', { ascending: false })
        .order('sort_order', { ascending: true });
      if (error || !data) return;
      if (mountedRef.current) setCards(data as ContentCard[]);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // ── جلب view records للمستخدم ─────────────────────────────
  const fetchViews = useCallback(async () => {
    if (!user?.id) return;
    try {
      const rows = await getUserCardViews(user.id);
      if (!mountedRef.current) return;
      const map = new Map<string, ViewRecord>();
      rows.forEach(r => map.set(r.card_id, r));
      setViews(map);
    } catch {}
  }, [user?.id]);

  // ── بدء التحديث ──────────────────────────────────────────
  const init = useCallback(async () => {
    await Promise.all([fetchCards(), fetchViews()]);
  }, [fetchCards, fetchViews]);

  // ── إعداد Realtime + fallback polling ─────────────────────
  useEffect(() => {
    if (!ready) return;
    mountedRef.current = true;

    // تأخير أولي قبل إظهار أي كارت
    delayRef.current = setTimeout(() => {
      if (mountedRef.current) setVisible(true);
    }, SHOW_DELAY_MS);

    // جلب أولي
    init();

    // Realtime — channel واحد فقط
    if (!channelRef.current) {
      const ch = supabase
        .channel('content_cards_live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'content_cards' },
          () => {
            // تحديث عند أي تغيير (INSERT/UPDATE/DELETE)
            fetchCards();
          },
        )
        .subscribe();
      channelRef.current = ch;
    }

    // Fallback polling — 90 ثانية
    pollRef.current = setInterval(fetchCards, FALLBACK_POLL_MS);

    return () => {
      mountedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (delayRef.current) {
        clearTimeout(delayRef.current);
        delayRef.current = null;
      }
    };
  }, [ready, init, fetchCards]);

  // ── إعادة جلب views عند تغيير المستخدم ───────────────────
  useEffect(() => {
    if (user?.id && ready) fetchViews();
  }, [user?.id, ready, fetchViews]);

  // ── حساب queue المؤهلة ────────────────────────────────────
  const eligibleQueue = useMemo<ContentCard[]>(() => {
    if (!visible) return [];
    const now = Date.now();
    return cards.filter(c => isCardEligible(c, views, now));
  }, [cards, views, visible]);

  const currentCard = eligibleQueue[0] ?? null;

  // ── markSeen ──────────────────────────────────────────────
  const markSeen = useCallback((cardId: string) => {
    if (!user?.id) return;
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    markCardViewed(cardId, user.id, card.revision).catch(() => {});
    setViews(prev => {
      const map = new Map(prev);
      const existing = map.get(cardId);
      map.set(cardId, {
        card_id:          cardId,
        card_revision:    card.revision,
        view_count:       (existing?.view_count ?? 0) + 1,
        dismissed:        existing?.dismissed ?? false,
        last_viewed_at:   new Date().toISOString(),
        last_dismissed_at: existing?.last_dismissed_at ?? null,
      });
      return map;
    });
  }, [user?.id, cards]);

  // ── dismissCard ───────────────────────────────────────────
  const dismissCard = useCallback((cardId: string) => {
    if (!user?.id) return;
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    markCardDismissed(cardId, user.id, card.revision).catch(() => {});
    setViews(prev => {
      const map = new Map(prev);
      const existing = map.get(cardId);
      map.set(cardId, {
        card_id:           cardId,
        card_revision:     card.revision,
        view_count:        existing?.view_count ?? 1,
        dismissed:         true,
        last_viewed_at:    existing?.last_viewed_at ?? new Date().toISOString(),
        last_dismissed_at: new Date().toISOString(),
      });
      return map;
    });
  }, [user?.id, cards]);

  const value = useMemo<ContentCardsCtx>(() => ({
    currentCard,
    dismissCard,
    markSeen,
    hasCard:    !!currentCard,
    queueCount: eligibleQueue.length,
  }), [currentCard, dismissCard, markSeen, eligibleQueue.length]);

  return (
    <ContentCardsContext.Provider value={value}>
      {children}
    </ContentCardsContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────
export function useContentCards() {
  return useContext(ContentCardsContext);
}
