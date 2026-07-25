// صفحة سجل العمليات — آخر 10 + سجل كامل مقسّم
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getUserOperations } from '@/lib/api';
import { parseApiError } from '@/lib/errorMapper';
import { formatEgyptDate, formatEgyptTime } from '@/lib/egyptTime';
import { supabase } from '@/db/supabase';
import { staleWhileRevalidate, CACHE_KEYS } from '@/lib/appCache';
import type { Operation, PaginatedResult } from '@/types/types';
import {
  Clock, Phone, CheckCircle, XCircle, Loader2,
  ChevronRight, ChevronLeft, Hash, Tag, Banknote,
  Timer, Eye, ListFilter, Wallet, Zap,
} from 'lucide-react';

// مصدر العملية — نص قابل للعرض
function sourceLabel(op: Operation): { text: string; color: string; bg: string; border: string } | null {
  const cd = (op as unknown as { card_data?: Record<string, unknown> }).card_data;
  const src = (op as unknown as { operation_source?: string }).operation_source;
  if (cd?.source === 'ana_vodafone_balance' || src === 'ana_vodafone_balance') {
    return { text: 'رصيد أنا فودافون', color: '#ff8888', bg: 'rgba(230,0,0,0.10)', border: 'rgba(230,0,0,0.20)' };
  }
  if (src === 'vodafone_cash' || (!src && op.category)) {
    return { text: 'Vodafone Cash', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)' };
  }
  return null;
}

import { Button } from '@/components/ui/button';
import AppFooter from '@/components/common/AppFooter';

const STATUS_MAP = {
  success: { label: 'ناجحة',  icon: CheckCircle, cls: 'text-success bg-success/10 border-success/20' },
  failed:  { label: 'فاشلة',  icon: XCircle,     cls: 'text-destructive bg-destructive/10 border-destructive/20' },
  pending: { label: 'انتظار', icon: Loader2,      cls: 'text-warning bg-warning/10 border-warning/20' },
};

// ── بطاقة عملية واحدة (مشتركة بين القسمَين) ──────────────────────────────
function OpCard({ op, onView }: { op: Operation; onView: (op: Operation) => void }) {
  const s = STATUS_MAP[op.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.pending;
  const Icon = s.icon;
  const src = sourceLabel(op);
  const dm = (op as unknown as { duration_ms?: number }).duration_ms;

  return (
    <div className="card-premium p-4 space-y-3">
      {/* الصف الأول: أيقونة + رقم الهاتف + الحالة */}
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${s.cls}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-sm font-semibold truncate font-mono">{op.phone_number}</p>
          </div>
          <p className="text-xs text-muted-foreground truncate">{op.card_type ?? 'كارت غير محدد'}</p>
        </div>
        <div className="text-left shrink-0 space-y-1">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border block text-center ${s.cls}`}>{s.label}</span>
          <p className="text-[10px] text-muted-foreground text-center tabular-nums">
            {formatEgyptDate(op.performed_at)}
          </p>
          <p className="text-[10px] text-muted-foreground text-center tabular-nums">
            {formatEgyptTime(op.performed_at)}
          </p>
        </div>
      </div>

      {/* الصف الثاني: بادجات */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/40 flex-wrap">
        {op.operation_number != null && (
          <div className="flex items-center gap-1 text-[11px] text-primary bg-primary/10 px-2 py-1 rounded-lg border border-primary/20">
            <Hash className="w-3 h-3 shrink-0" />
            <span className="font-mono font-bold">#{op.operation_number}</span>
          </div>
        )}
        {/* مصدر العملية */}
        {src ? (
          <div className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg shrink-0"
            style={{ background: src.bg, color: src.color, border: `1px solid ${src.border}` }}>
            <Wallet className="w-3 h-3 shrink-0" />
            <span className="font-bold">{src.text}</span>
          </div>
        ) : op.category ? (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/40 px-2 py-1 rounded-lg">
            <Tag className="w-3 h-3 shrink-0" />
            <span>{op.category}</span>
          </div>
        ) : null}
        {op.amount != null && op.amount > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-primary bg-primary/10 px-2 py-1 rounded-lg mr-auto">
            <Banknote className="w-3 h-3 shrink-0" />
            <span className="font-bold">{op.amount} ج.م</span>
          </div>
        )}
        {dm != null && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/40 px-2 py-1 rounded-lg">
            <Timer className="w-3 h-3 shrink-0" />
            <span>{dm < 1000 ? `${dm}ms` : `${(dm / 1000).toFixed(1)}s`}</span>
          </div>
        )}
      </div>

      {/* سبب الفشل */}
      {op.status === 'failed' && op.error_message && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2">
          <p className="text-[11px] text-destructive break-words">
            {parseApiError(op.error_message).arabicMessage.split('\n')[0]}
          </p>
        </div>
      )}

      {/* زر تفاصيل */}
      <div className="flex justify-end pt-1">
        <Button size="sm" className="h-6 text-[10px] px-2.5 gap-1"
          style={{ background: 'rgba(230,0,0,0.08)', color: '#ff6666', border: '1px solid rgba(230,0,0,0.2)' }}
          onClick={() => onView(op)}>
          <Eye className="w-3 h-3" /> تفاصيل
        </Button>
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية ──────────────────────────────────────────────────────────
export default function OperationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // آخر 10 عمليات (Realtime)
  const [recent, setRecent] = useState<Operation[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // السجل الكامل (Pagination)
  const [result, setResult] = useState<PaginatedResult<Operation> | null>(null);
  const [page, setPage] = useState(1);
  const [fullLoading, setFullLoading] = useState(false);
  const fetchedPages = useRef<Set<number>>(new Set());

  const fetchRecent = useCallback(async (bg = false) => {
    if (!user) return;
    if (!bg) setRecentLoading(true);
    const { data } = await supabase
      .from('operations')
      .select('*')
      .eq('user_id', user.id)
      .order('performed_at', { ascending: false })
      .limit(10);
    setRecent(Array.isArray(data) ? (data as unknown as Operation[]) : []);
    setRecentLoading(false);
  }, [user]);

  const fetchFull = useCallback(async (p: number, bg = false) => {
    if (!user) return;
    if (p === 1 && !bg) {
      const cached = await staleWhileRevalidate<PaginatedResult<Operation>>(
        CACHE_KEYS.OPERATIONS_P1,
        () => getUserOperations(user.id, 1),
        (fresh) => { setResult(fresh); fetchedPages.current.add(1); },
      );
      if (cached) { setResult(cached); setFullLoading(false); fetchedPages.current.add(1); return; }
    }
    if (!bg) setFullLoading(true);
    getUserOperations(user.id, p).then(r => {
      setResult(r);
      fetchedPages.current.add(p);
      if (p === 1) {
        import('@/lib/appCache').then(({ cacheSet, CACHE_KEYS: CK }) => cacheSet(CK.OPERATIONS_P1, r));
      }
      setFullLoading(false);
    }).catch(() => setFullLoading(false));
  }, [user]);

  // الحمل الأوّلي
  useEffect(() => {
    fetchRecent();
    fetchFull(1);
  }, [fetchRecent, fetchFull]);

  // عند تغيير الصفحة
  useEffect(() => { fetchFull(page); }, [page, fetchFull]);

  // Realtime — عملية جديدة تحدّث القسمَين
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`ops-page-rt-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'operations',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchRecent(true);
        if (page === 1) fetchFull(1, true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, page, fetchRecent, fetchFull]);

  const totalPages = result ? Math.ceil(result.count / result.pageSize) : 1;

  const goView = (op: Operation) => navigate(`/operations/${op.id}`, { state: { op } });

  return (
    <div className="p-4 md:p-6 space-y-6 page-enter">

      {/* ═══════════════════════════════════
          قسم 1 — آخر العمليات (10 فقط)
         ═══════════════════════════════════ */}
      <div className="space-y-3">
        {/* عنوان القسم */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.2)' }}>
              <Zap className="w-3.5 h-3.5" style={{ color: '#E60000' }} />
            </div>
            <div>
              <h2 className="text-sm font-black">آخر العمليات</h2>
              <p className="text-[10px] text-muted-foreground">أحدث 10 عمليات — تحديث تلقائي</p>
            </div>
          </div>
        </div>

        {recentLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Clock className="w-8 h-8 text-muted-foreground opacity-30" />
            <p className="text-xs text-muted-foreground">لا توجد عمليات بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recent.map(op => <OpCard key={op.id} op={op} onView={goView} />)}
          </div>
        )}
      </div>

      {/* فاصل */}
      <div className="border-t border-border/40" />

      {/* ═══════════════════════════════════
          قسم 2 — سجل العمليات الكامل
         ═══════════════════════════════════ */}
      <div className="space-y-3">
        {/* عنوان القسم */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.15)' }}>
              <Clock className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-black">سجل العمليات الكامل</h2>
              <p className="text-[10px] text-muted-foreground">
                {result ? `${result.count} عملية — كل عملية كسجل مستقل` : 'جاري التحميل...'}
              </p>
            </div>
          </div>
          <Button size="sm" className="h-7 text-xs gap-1"
            style={{ background: 'rgba(230,0,0,0.1)', color: '#ff6666', border: '1px solid rgba(230,0,0,0.25)' }}
            onClick={() => navigate('/my-operations')}>
            <ListFilter className="w-3 h-3" /> عرض الكل
          </Button>
        </div>

        {fullLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !result?.data.length ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Clock className="w-8 h-8 text-muted-foreground opacity-30" />
            <p className="text-xs text-muted-foreground">لا توجد عمليات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.data.map(op => <OpCard key={op.id} op={op} onView={goView} />)}
          </div>
        )}

        {/* الترقيم */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="icon" className="w-8 h-8 border-border"
              disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="w-8 h-8 border-border"
              disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <AppFooter />
    </div>
  );
}
