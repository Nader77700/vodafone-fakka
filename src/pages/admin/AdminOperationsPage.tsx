// صفحة العمليات الشاملة — /admin/operations
// عرض كل عمليات جميع المستخدمين · آخر عملية في الأعلى · مباشر من DB
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, RefreshCw, Search, CheckCircle, XCircle,
  Loader2, ChevronLeft, ChevronRight, Copy,
  Hash, Phone, CreditCard, Timer, Calendar, Shield, Tag,
  Zap, Wallet, Banknote, TrendingUp, TrendingDown,
  User, X, Download, Filter, ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import AdminShell from '@/components/admin/AdminShell';
import { OperationsAmountsFilter } from '@/components/common/OperationsAmountsFilter';
import type { Operation } from '@/types/types';
import {
  getAllOperationsFiltered, getOperationsStats,
  type OperationsFilter, type OperationsStats,
} from '@/lib/api';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

// ─── Page size ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy · HH:mm', { locale: ar }); } catch { return d; }
}
function fmtShort(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM · HH:mm', { locale: ar }); } catch { return d; }
}
function copyText(t: string) {
  navigator.clipboard.writeText(t).then(() => toast.success('تم النسخ')).catch(() => {});
}

// ─── مصدر العملية ─────────────────────────────────────────────────────────────
function srcInfo(op: Operation) {
  const src = op.operation_source ?? (op.card_data as Record<string, unknown> | null)?.source as string | null;
  if (src === 'ana_vodafone_balance' || src === 'balance')
    return {
      label: 'رصيد أنا فودافون',
      short: 'رصيد أنا',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      dot: '🔴',
      key: 'balance',
    };
  return {
    label: 'Vodafone Cash',
    short: 'V.Cash',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    dot: '💳',
    key: 'vcash',
  };
}

type OpWithProfile = Operation & { profiles?: { username?: string; email?: string } };

// ─── Sheet تفاصيل العملية ─────────────────────────────────────────────────────
function DetailSheet({
  op, open, onClose, onUserClick,
}: {
  op: OpWithProfile | null;
  open: boolean;
  onClose: () => void;
  onUserClick: (uid: string) => void;
}) {
  if (!op) return null;
  const src  = srcInfo(op);
  const isOk = op.status === 'success';
  const user = op.profiles;

  function Row({
    icon: Icon, label, value, mono = false, copyable = false,
  }: {
    icon?: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | number | null | undefined;
    mono?: boolean;
    copyable?: boolean;
  }) {
    const v = value != null && value !== '' ? String(value) : '—';
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-b-0">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />}
        <div className={`flex-1 min-w-0 ${!Icon ? 'pr-5' : ''}`}>
          <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
          <p className={`text-xs font-semibold break-all ${mono ? 'font-mono' : ''} ${v === '—' ? 'text-muted-foreground' : 'text-foreground'}`}>
            {v}
          </p>
        </div>
        {copyable && v !== '—' && (
          <button onClick={() => copyText(v)} className="shrink-0 opacity-40 hover:opacity-100 transition-opacity mt-0.5">
            <Copy className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[92dvh] overflow-y-auto p-0">
        {/* الرأس */}
        <div className={`px-4 pt-4 pb-3 border-b border-border ${isOk ? 'bg-success/5' : 'bg-destructive/5'}`}>
          <SheetHeader className="text-right">
            <SheetTitle className="text-sm flex items-center gap-2 text-balance">
              {isOk
                ? <CheckCircle className="w-4 h-4 text-success shrink-0" />
                : <XCircle className="w-4 h-4 text-destructive shrink-0" />}
              تفاصيل العملية #{op.operation_number ?? op.id.slice(0, 8)}
            </SheetTitle>
          </SheetHeader>
          {/* بادج المصدر + الحالة */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${src.bg} ${src.border} ${src.color}`}>
              {src.dot} {src.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${isOk ? 'bg-success/10 border-success/20 text-success' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
              {isOk ? '✅ ناجحة' : '❌ فاشلة'}
            </span>
            {op.amount != null && op.amount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-warning/10 border-warning/20 text-warning text-[10px] font-semibold">
                💰 {op.amount} ج.م
              </span>
            )}
          </div>
        </div>

        <div className="px-4 py-3 space-y-1">
          {/* المستخدم */}
          {user && (
            <div className="flex items-center justify-between py-2.5 border-b border-border/30">
              <div className="flex items-center gap-3">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">المستخدم</p>
                  <p className="text-xs font-semibold">{user.username ?? user.email ?? op.user_id.slice(0, 8)}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary"
                onClick={() => { onClose(); onUserClick(op.user_id); }}>
                <ArrowUpRight className="w-3.5 h-3.5" /> عملياته
              </Button>
            </div>
          )}

          {/* البيانات الأساسية */}
          <Row icon={Phone} label="رقم الهاتف" value={op.phone_number} copyable />
          <Row icon={CreditCard} label="نوع الكارت" value={op.card_type} />
          <Row icon={Tag} label="الفئة" value={op.category} />
          <Row icon={Banknote} label="المبلغ" value={op.amount != null ? `${op.amount} ج.م` : null} />
          <Row icon={Hash} label="رقم العملية" value={op.operation_number} copyable />
          <Row icon={Calendar} label="وقت التنفيذ" value={fmt(op.performed_at)} />
          <Row icon={Calendar} label="وقت الإنشاء" value={fmt(op.created_at)} />

          {/* الأداء */}
          {(op.duration_ms != null || op.latency_ms != null) && (
            <>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pt-2 pb-1">⚡ الأداء</p>
              <Row icon={Timer} label="مدة التنفيذ (duration_ms)" value={op.duration_ms != null ? `${op.duration_ms} ms` : null} />
              <Row icon={Timer} label="زمن الاستجابة (latency_ms)" value={op.latency_ms != null ? `${op.latency_ms} ms` : null} />
            </>
          )}

          {/* Debug */}
          {(op.correlation_id || op.execution_layer || op.idempotency_key || op.retry_count != null) && (
            <>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pt-2 pb-1">🔍 Debug</p>
              <Row icon={Shield} label="Correlation ID" value={op.correlation_id} mono copyable />
              <Row icon={Zap} label="Execution Layer" value={op.execution_layer} mono />
              <Row icon={Hash} label="Idempotency Key" value={op.idempotency_key} mono copyable />
              <Row icon={TrendingUp} label="عدد المحاولات (retry_count)" value={op.retry_count} />
            </>
          )}

          {/* رسالة الخطأ */}
          {op.error_message && (
            <>
              <p className="text-[10px] font-semibold text-destructive uppercase tracking-wide pt-2 pb-1">❌ رسالة الخطأ</p>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-xs text-destructive font-medium break-all">{op.error_message}</p>
              </div>
            </>
          )}

          {/* استجابة API */}
          {op.api_response && (
            <>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pt-2 pb-1">📡 API Response</p>
              <div className="rounded-lg bg-muted/50 border border-border p-3">
                <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                  {(() => {
                    try {
                      const parsed = typeof op.api_response === 'string'
                        ? JSON.parse(op.api_response)
                        : op.api_response;
                      return JSON.stringify(parsed, null, 2);
                    } catch {
                      return String(op.api_response);
                    }
                  })()}
                </pre>
              </div>
            </>
          )}

          <div className="pb-8" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── بطاقة عملية واحدة ────────────────────────────────────────────────────────
function OpRow({
  op, onDetail, onUserClick,
}: {
  op: OpWithProfile;
  onDetail: (op: OpWithProfile) => void;
  onUserClick: (uid: string) => void;
}) {
  const src    = srcInfo(op);
  const isOk   = op.status === 'success';
  const user   = op.profiles;
  const uName  = user?.username ?? user?.email ?? op.user_id.slice(0, 8);

  return (
    <div className="card-premium p-3 md:p-4 space-y-2.5">
      {/* الصف الأول: المصدر + الحالة + الوقت */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${src.bg} ${src.border} ${src.color}`}>
            {src.dot} {src.short}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${isOk ? 'bg-success/10 border-success/20 text-success' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
            {isOk ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {isOk ? 'ناجحة' : 'فاشلة'}
          </span>
          {op.amount != null && op.amount > 0 && (
            <span className="text-[10px] font-bold text-warning">{op.amount} ج.م</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{fmtShort(op.performed_at)}</span>
      </div>

      {/* الصف الثاني: رقم الهاتف + الكارت */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${isOk ? 'bg-success/10 border-success/20' : 'bg-destructive/10 border-destructive/20'}`}>
          {isOk
            ? <CheckCircle className="w-4 h-4 text-success" />
            : <XCircle className="w-4 h-4 text-destructive" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground tabular-nums">{op.phone_number}</p>
          <p className="text-[11px] text-muted-foreground">
            {op.card_type ?? '—'}{op.category ? ` · ${op.category}` : ''}
            {op.operation_number ? ` · #${op.operation_number}` : ''}
          </p>
        </div>
      </div>

      {/* الصف الثالث: المستخدم + رسالة خطأ */}
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-1.5 text-[11px] text-primary hover:underline underline-offset-2 min-w-0"
          onClick={() => onUserClick(op.user_id)}>
          <User className="w-3 h-3 shrink-0" />
          <span className="truncate">{uName}</span>
          <ArrowUpRight className="w-3 h-3 shrink-0" />
        </button>
        {!isOk && op.error_message && (
          <p className="text-[10px] text-destructive truncate max-w-[50%]">{op.error_message}</p>
        )}
      </div>

      {/* زر التفاصيل */}
      <Button
        variant="outline"
        size="sm"
        className="w-full h-8 text-xs border-border gap-1.5"
        onClick={() => onDetail(op)}>
        <Shield className="w-3.5 h-3.5" /> تفاصيل كاملة
      </Button>
    </div>
  );
}

// ─── الصفحة الرئيسية ──────────────────────────────────────────────────────────
export default function AdminOperationsPage() {
  const navigate = useNavigate();

  // حالة البيانات
  const [ops, setOps]           = useState<OpWithProfile[]>([]);
  const [totalCount, setTotal]  = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState<OperationsStats | null>(null);
  const [statsLoading, setStL]  = useState(true);

  // فلاتر
  const [search, setSearch]       = useState('');
  const [statusF, setStatusF]     = useState('all');
  const [sourceF, setSourceF]     = useState('all');
  const [cardTypeF, setCardTypeF] = useState('all');
  const [amountF, setAmountF]     = useState<number | null>(null);
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');

  // Sheet التفاصيل
  const [detailOp, setDetailOp]   = useState<OpWithProfile | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Realtime — مؤشر عمليات جديدة
  const [newCount, setNewCount]   = useState(0);
  const pageRef = useRef(page);
  pageRef.current = page;

  // ─── بناء الفلاتر ──────────────────────────────────────────────────────────
  const buildFilters = useCallback((): OperationsFilter => {
    const f: OperationsFilter = {};
    if (search)              f.phone = search;
    if (statusF !== 'all')   f.status = statusF;
    if (sourceF !== 'all')   f.operation_source = sourceF;
    if (cardTypeF !== 'all') f.card_type = cardTypeF;
    if (amountF !== null)    f.amount = amountF;
    if (dateFrom)            f.date_from = dateFrom;
    if (dateTo)              f.date_to = dateTo;
    return f;
  }, [search, statusF, sourceF, cardTypeF, amountF, dateFrom, dateTo]);

  // ─── تحميل البيانات ────────────────────────────────────────────────────────
  const loadData = useCallback(async (p = 1, silent = false) => {
    if (!silent) setLoading(true);
    const filters = buildFilters();
    try {
      const [res] = await Promise.all([
        getAllOperationsFiltered(p, filters),
      ]);
      setOps(prev => p === 1 ? (res.data as OpWithProfile[]) : [...prev, ...(res.data as OpWithProfile[])]);
      setTotal(res.count);
      setPage(p);
      setNewCount(0);
    } catch {
      toast.error('حدث خطأ أثناء تحميل العمليات');
    } finally {
      setLoading(false);
    }
  }, [buildFilters]);

  const loadStats = useCallback(async () => {
    setStL(true);
    try {
      const filters = buildFilters();
      const s = await getOperationsStats(filters);
      setStats(s);
    } finally {
      setStL(false);
    }
  }, [buildFilters]);

  // ─── أولى التحميل ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadData(1);
    loadStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusF, sourceF, cardTypeF, dateFrom, dateTo]);

  // ─── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('global-ops-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'operations' },
        () => {
          if (pageRef.current === 1) {
            // نحدّث الصفحة الأولى بصمت
            loadData(1, true);
            loadStats();
          } else {
            // نُعلم المستخدم بعملية جديدة
            setNewCount(n => n + 1);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData, loadStats]);

  // ─── تصدير CSV ───────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!ops.length) { toast.warning('لا توجد بيانات للتصدير'); return; }
    const header = 'رقم العملية,رقم الهاتف,المستخدم,المنتج,الفئة,المبلغ,الحالة,المصدر,التاريخ\n';
    const rows = ops.map(op => {
      const u   = op.profiles;
      const src = op.operation_source ?? 'vodafone_cash';
      const uName = u?.username ?? u?.email ?? op.user_id.slice(0, 8);
      return [
        op.operation_number ?? '',
        op.phone_number,
        uName,
        op.card_type ?? '',
        op.category ?? '',
        op.amount ?? '',
        op.status,
        src,
        fmt(op.performed_at),
      ].join(',');
    }).join('\n');
    const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `operations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasFilters = !!(search || statusF !== 'all' || sourceF !== 'all' || cardTypeF !== 'all' || dateFrom || dateTo);

  return (
    <AdminShell
      title="سجل العمليات الشامل"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'سجل العمليات الشامل' }]}
    >      <div className="space-y-4 page-enter">

        {/* ── إشعار عمليات جديدة (للصفحات غير الأولى) ── */}
        {newCount > 0 && (
          <button
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-semibold"
            onClick={() => { setPage(1); loadData(1); loadStats(); }}>
            <TrendingUp className="w-4 h-4" />
            {newCount} عملية جديدة — اضغط للتحديث
          </button>
        )}

        {/* ── بطاقات الإحصائيات ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {statsLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 bg-muted rounded-xl" />
              ))
            : stats && [
                { label: 'إجمالي العمليات', val: stats.total,                                  icon: Clock,       cls: 'text-primary',     bg: 'bg-primary/10' },
                { label: 'عمليات ناجحة',    val: stats.success,                                icon: CheckCircle, cls: 'text-success',     bg: 'bg-success/10' },
                { label: 'عمليات فاشلة',    val: stats.failed,                                 icon: XCircle,     cls: 'text-destructive', bg: 'bg-destructive/10' },
                { label: 'إجمالي المبالغ',  val: `${stats.total_amount.toFixed(0)} ج.م`,        icon: Banknote,    cls: 'text-warning',     bg: 'bg-warning/10' },
                { label: 'نسبة النجاح',     val: stats.total > 0 ? `${Math.round(stats.success / stats.total * 100)}%` : '—', icon: TrendingUp, cls: 'text-success', bg: 'bg-success/10' },
                { label: 'نسبة الفشل',      val: stats.total > 0 ? `${Math.round(stats.failed / stats.total * 100)}%` : '—',  icon: TrendingDown, cls: 'text-destructive', bg: 'bg-destructive/10' },
              ].map(({ label, val, icon: Icon, cls, bg }) => (
                <div key={label} className="card-premium p-3 flex items-center gap-3 h-full">
                  <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${cls}`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-base font-black tabular-nums ${cls}`}>{val}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight text-pretty">{label}</p>
                  </div>
                </div>
              ))
          }
        </div>

        {/* ── بادجات المصادر السريعة ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">تصفية سريعة:</span>
          <button
            onClick={() => setSourceF('all')}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-semibold transition-all ${sourceF === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
            <Clock className="w-3 h-3" /> الكل
          </button>
          <button
            onClick={() => setSourceF('ana_vodafone_balance')}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-semibold transition-all ${sourceF === 'ana_vodafone_balance' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'border-border text-muted-foreground hover:border-red-400/40'}`}>
            🔴 رصيد أنا فودافون
          </button>
          <button
            onClick={() => setSourceF('vodafone_cash')}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-semibold transition-all ${sourceF === 'vodafone_cash' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' : 'border-border text-muted-foreground hover:border-yellow-400/40'}`}>
            💳 Vodafone Cash
          </button>
        </div>

        {/* ── فلاتر البحث المتقدمة ── */}
        <div className="card-premium p-4 space-y-3">
          <OperationsAmountsFilter 
            selectedAmount={amountF} 
            onSelectAmount={(a) => { setAmountF(a); setPage(1); }} 
          />
          
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">فلاتر البحث</span>
          </div>

          {/* الصف الأول: بحث بالهاتف */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pr-9 bg-background border-border h-10"
              placeholder="بحث برقم الهاتف..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {/* الصف الثاني: فلاتر */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* الحالة */}
            <Select value={statusF} onValueChange={v => { setStatusF(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs bg-background border-border w-32">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="success">ناجحة ✅</SelectItem>
                <SelectItem value="failed">فاشلة ❌</SelectItem>
                <SelectItem value="pending">انتظار ⏳</SelectItem>
              </SelectContent>
            </Select>

            {/* المنتج */}
            <Select value={cardTypeF} onValueChange={v => { setCardTypeF(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs bg-background border-border w-28">
                <SelectValue placeholder="المنتج" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المنتجات</SelectItem>
                <SelectItem value="فكة">فكة</SelectItem>
                <SelectItem value="مارد">مارد</SelectItem>
              </SelectContent>
            </Select>

            {/* من تاريخ */}
            <Input
              type="date"
              className="h-8 text-xs bg-background border-border w-36"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            />

            {/* إلى تاريخ */}
            <Input
              type="date"
              className="h-8 text-xs bg-background border-border w-36"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
            />

            {/* مسح */}
            {hasFilters && (
              <Button
                variant="ghost" size="sm"
                className="h-8 text-xs text-muted-foreground gap-1"
                onClick={() => {
                  setSearch(''); setStatusF('all'); setSourceF('all');
                  setCardTypeF('all'); setDateFrom(''); setDateTo('');
                  setPage(1);
                }}>
                <X className="w-3.5 h-3.5" /> مسح الكل
              </Button>
            )}

            {/* أزرار جانبية */}
            <div className="flex items-center gap-2 mr-auto">
              <Button variant="outline" size="sm" className="h-8 text-xs border-border gap-1"
                onClick={exportCSV}>
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs border-border gap-1"
                onClick={() => { loadData(page); loadStats(); }}>
                <RefreshCw className="w-3.5 h-3.5" /> تحديث
              </Button>
            </div>
          </div>
        </div>

        {/* ── رأس القائمة ── */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {loading ? '...' : `${totalCount.toLocaleString('ar-EG')} عملية`}
            {hasFilters ? ' (مفلترة)' : ' (إجمالي)'}
          </p>
          <p className="text-xs text-muted-foreground">
            صفحة {page} من {totalPages || 1}
          </p>
        </div>

        {/* ── قائمة العمليات ── */}
        {loading
          ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 bg-muted rounded-xl" />
              ))}
            </div>
          )
          : ops.length === 0
            ? (
              <div className="card-premium p-10 text-center space-y-2">
                <Clock className="w-10 h-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">لا توجد عمليات</p>
                {hasFilters && (
                  <p className="text-xs text-muted-foreground">جرّب تغيير الفلاتر</p>
                )}
              </div>
            )
            : (
              <div className="space-y-3">
                {ops.map(op => (
                  <OpRow
                    key={op.id}
                    op={op}
                    onDetail={o => { setDetailOp(o); setSheetOpen(true); }}
                    onUserClick={uid => navigate(`/admin/users/${uid}`)}
                  />
                ))}
              </div>
            )
        }

        {/* ── ترقيم الصفحات ── */}
        {page < totalPages && (
          <div className="flex items-center justify-center gap-3 py-4">
            <Button
              variant="outline"
              className="w-full sm:w-auto h-10 border-border"
              disabled={loading}
              onClick={() => loadData(page + 1)}>
              {loading ? 'جاري التحميل...' : 'عرض المزيد'}
            </Button>
          </div>
        )}

        {/* ── Sheet تفاصيل العملية ── */}
        <DetailSheet
          op={detailOp}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onUserClick={uid => navigate(`/admin/users/${uid}`)}
        />
      </div>
    </AdminShell>
  );
}
