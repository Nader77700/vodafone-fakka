// صفحة عمليات المستخدم المتطورة — /admin/users/:id/operations
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock, RefreshCw, Search, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight, Loader2, Trash2, Edit2,
  Copy, BarChart2, Zap, Wallet, X, Info, Hash,
  Phone, CreditCard, Timer, Calendar, Shield, Tag,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import AdminShell, { SectionCard, ConfirmDialog } from '@/components/admin/AdminShell';
import type { Operation } from '@/types/types';
import {
  getUserDetail, type UserDetail,
  getUserOperations, adminAdjustOps, logAdminAction,
} from '@/lib/api';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}

function copyText(t: string) {
  navigator.clipboard.writeText(t).then(() => toast.success('تم النسخ')).catch(() => {});
}

function srcInfo(op: Operation) {
  const src = op.operation_source ?? (op.card_data as Record<string,unknown> | null)?.source as string | null;
  if (src === 'ana_vodafone_balance' || src === 'balance')
    return { label: 'رصيد أنا فودافون', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', dot: '🔴' };
  return { label: 'Vodafone Cash', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', dot: '💳' };
}

// ─── تفاصيل العملية (Sheet) ───────────────────────────────────────────────────
function OperationDetailsSheet({
  op, open, onClose,
}: { op: Operation | null; open: boolean; onClose: () => void }) {
  if (!op) return null;
  const src = srcInfo(op);
  const isSuccess = op.status === 'success';

  function Row({ icon: Icon, label, value, mono = false, copyable = false }: {
    icon?: React.ComponentType<{ className?: string }>;
    label: string; value: string | number | null | undefined;
    mono?: boolean; copyable?: boolean;
  }) {
    const v = value != null && value !== '' ? String(value) : '—';
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-b-0">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />}
        <div className={`flex-1 min-w-0 ${!Icon ? 'pr-5' : ''}`}>
          <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
          <p className={`text-xs font-semibold break-all ${mono ? 'font-mono' : ''} ${v === '—' ? 'text-muted-foreground' : 'text-foreground'}`}>{v}</p>
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
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto max-w-[calc(100%-2rem)] md:max-w-lg mx-auto rounded-t-2xl">
        <SheetHeader className="pb-3 border-b border-border/30">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <span className={`text-sm ${isSuccess ? 'text-success' : 'text-destructive'}`}>
              {isSuccess ? '✅' : '❌'}
            </span>
            تفاصيل العملية
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${src.bg} ${src.color} ${src.border}`}>
              {src.dot} {src.label}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="py-2 space-y-1">
          {/* معلومات أساسية */}
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2">📋 البيانات الأساسية</p>
          <Row icon={Hash}       label="رقم العملية"   value={op.operation_number} mono copyable />
          <Row icon={Phone}      label="رقم الهاتف"    value={op.phone_number} mono copyable />
          <Row icon={CreditCard} label="نوع الكارت"    value={op.card_type} />
          <Row icon={Wallet}     label="المبلغ"         value={op.amount != null ? `${op.amount} ج.م` : null} />
          <Row icon={Tag}        label="الفئة"          value={op.category} />
          <Row icon={Calendar}   label="وقت التنفيذ"   value={fmt(op.performed_at)} />
          <Row icon={Shield}     label="الحالة"         value={isSuccess ? '✅ ناجحة' : '❌ فاشلة'} />

          {/* مصدر الشحن */}
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2 pt-4">⚡ مصدر الشحن</p>
          <Row icon={Zap}        label="مصدر الشحن"    value={src.label} />
          <Row                   label="operation_source" value={op.operation_source} mono copyable />
          <Row                   label="execution_layer"  value={op.execution_layer} mono />

          {/* أداء */}
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2 pt-4">⏱️ الأداء والتتبع</p>
          <Row icon={Timer}      label="مدة التنفيذ"   value={op.duration_ms != null ? `${op.duration_ms} ms` : null} />
          <Row                   label="latency_ms"     value={op.latency_ms != null ? `${op.latency_ms} ms` : null} />
          <Row                   label="retry_count"    value={op.retry_count} />

          {/* معرّفات Debug */}
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2 pt-4">🔍 معرّفات Debug</p>
          <Row label="Operation ID"    value={op.id} mono copyable />
          <Row label="correlation_id"  value={op.correlation_id} mono copyable />
          <Row label="idempotency_key" value={op.idempotency_key} mono copyable />

          {/* خطأ (إن وُجد) */}
          {!isSuccess && op.error_message && (
            <>
              <p className="text-[10px] font-bold text-destructive uppercase tracking-wider py-2 pt-4">🚨 تفاصيل الخطأ</p>
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                <p className="text-xs text-destructive font-medium break-words">{op.error_message}</p>
              </div>
            </>
          )}

          {/* استجابة API */}
          {op.api_response && (
            <>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2 pt-4">📡 استجابة API</p>
              <div className="bg-muted/30 border border-border/40 rounded-xl p-3">
                <pre className="text-[10px] font-mono text-muted-foreground break-all whitespace-pre-wrap overflow-x-auto max-h-48">
                  {(() => {
                    try { return JSON.stringify(JSON.parse(op.api_response), null, 2); }
                    catch { return op.api_response; }
                  })()}
                </pre>
              </div>
            </>
          )}

          {/* بيانات الكارت */}
          {op.card_data && Object.keys(op.card_data).length > 0 && (
            <>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2 pt-4">🃏 بيانات الكارت</p>
              <div className="bg-muted/30 border border-border/40 rounded-xl p-3">
                <pre className="text-[10px] font-mono text-muted-foreground break-all whitespace-pre-wrap overflow-x-auto max-h-48">
                  {JSON.stringify(op.card_data, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>

        <div className="pt-4 pb-2">
          <Button variant="outline" className="w-full h-9" onClick={onClose}>إغلاق</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── بطاقة عملية واحدة ────────────────────────────────────────────────────────
function OpCard({ op, onDetails }: { op: Operation; onDetails: (op: Operation) => void }) {
  const isSuccess = op.status === 'success';
  const src = srcInfo(op);
  return (
    <div className={`p-3 rounded-xl border transition-colors ${
      isSuccess ? 'border-success/20 bg-success/5' : 'border-destructive/20 bg-destructive/5'
    }`}>
      {/* صف رئيسي */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isSuccess
            ? <CheckCircle className="w-4 h-4 text-success shrink-0" />
            : <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold font-mono tabular-nums">{op.phone_number}</p>
            <p className="text-[10px] text-muted-foreground">{op.card_type} · {op.amount} ج.م</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-[10px] text-muted-foreground">{fmt(op.performed_at)}</p>
          <button
            onClick={() => onDetails(op)}
            className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-lg font-semibold hover:bg-primary/20 transition-colors">
            تفاصيل
          </button>
        </div>
      </div>
      {/* بادجات */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${src.bg} ${src.color} ${src.border}`}>
          {src.dot} {src.label}
        </span>
        {isSuccess
          ? <span className="text-[10px] text-success bg-success/5 border border-success/20 px-2 py-0.5 rounded-full">✓ تمّ بنجاح</span>
          : <span className="text-[10px] text-destructive bg-destructive/5 border border-destructive/20 px-2 py-0.5 rounded-full truncate max-w-[200px]">
              {op.error_message?.split('\n')[0] ?? 'فاشلة'}
            </span>}
        {op.operation_number && (
          <span className="text-[10px] text-muted-foreground font-mono">#{op.operation_number}</span>
        )}
      </div>
    </div>
  );
}

// ─── الصفحة الرئيسية ──────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

export default function AdminUserOperations() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile: adminProfile } = useAuth();

  const [detail,      setDetail]      = useState<UserDetail | null>(null);
  const [ops,         setOps]         = useState<Operation[]>([]);
  const [allOps,      setAllOps]      = useState<Operation[]>([]); // for stats
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState('');
  const [statusF,     setStatusF]     = useState('all');
  const [sourceF,     setSourceF]     = useState('all');
  const [detailOp,    setDetailOp]    = useState<Operation | null>(null);
  const [sheetOpen,   setSheetOpen]   = useState(false);
  const [adjustDelta, setAdjustDelta] = useState('0');
  const [adjReason,   setAdjReason]   = useState('');
  const [confirmData, setConfirmData] = useState<{
    open: boolean; title: string; desc?: string;
    action: () => Promise<void>; variant?: 'default' | 'destructive';
  }>({ open: false, title: '', action: async () => {} });

  // تحميل كل العمليات للإحصائيات (مرة واحدة)
  const loadAllOps = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('operations').select('status, amount, operation_source, card_data')
      .eq('user_id', id);
    setAllOps(Array.isArray(data) ? data as unknown as Operation[] : []);
  }, [id]);

  // تحميل صفحة العمليات مع فلاتر
  const loadOps = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      let q = supabase
        .from('operations').select('*', { count: 'exact' })
        .eq('user_id', id)
        .order('performed_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (search) q = q.or(`phone_number.ilike.%${search}%,card_type.ilike.%${search}%`);
      if (statusF !== 'all') q = q.eq('status', statusF);
      if (sourceF === 'balance') q = q.eq('operation_source', 'ana_vodafone_balance');
      if (sourceF === 'vcash')   q = q.eq('operation_source', 'vodafone_cash');

      const { data, count } = await q;
      setOps(Array.isArray(data) ? data as unknown as Operation[] : []);
      setTotal(count ?? 0);
    } catch { toast.error('فشل تحميل العمليات'); }
    finally { setLoading(false); }
  }, [id, page, search, statusF, sourceF]);

  useEffect(() => {
    if (id) {
      getUserDetail(id).then(setDetail).catch(() => {});
      loadAllOps();
    }
  }, [id]);
  useEffect(() => { loadOps(); }, [loadOps]);

  // إحصائيات من كل العمليات
  const stats = useMemo(() => {
    const success = allOps.filter(o => o.status === 'success');
    const failed  = allOps.filter(o => o.status !== 'success');
    const totalAmt = success.reduce((s, o) => s + (o.amount ?? 0), 0);
    const balanceOps = allOps.filter(o => {
      const src = o.operation_source ?? (o.card_data as Record<string,unknown> | null)?.source as string;
      return src === 'ana_vodafone_balance' || src === 'balance';
    });
    const vcashOps = allOps.filter(o => {
      const src = o.operation_source ?? (o.card_data as Record<string,unknown> | null)?.source as string;
      return !src || src === 'vodafone_cash';
    });
    return {
      total: allOps.length,
      success: success.length,
      failed: failed.length,
      totalAmt,
      balanceOps: balanceOps.length,
      vcashOps: vcashOps.length,
      successRate: allOps.length > 0 ? Math.round((success.length / allOps.length) * 100) : 0,
    };
  }, [allOps]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const runConfirm = (
    title: string, desc: string,
    fn: () => Promise<void>,
    variant: 'default' | 'destructive' = 'default',
  ) => setConfirmData({ open: true, title, desc, variant, action: fn });

  const openDetails = (op: Operation) => { setDetailOp(op); setSheetOpen(true); };

  const userName = detail?.profile.full_name || detail?.profile.username || id;

  return (
    <AdminShell
      title={`عمليات: ${userName}`}
      subtitle={`${stats.total} عملية إجمالياً`}
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/admin' },
        { label: 'المستخدمون',   href: '/admin' },
        { label: detail?.profile.username || 'مستخدم', href: `/admin/users/${id}` },
        { label: 'العمليات' },
      ]}
      actions={
        <Button size="sm" variant="outline" onClick={() => { loadOps(); loadAllOps(); }} className="h-8 gap-1">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      }
    >
      <div className="space-y-5">

        {/* ── إحصائيات شاملة ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            { label: 'إجمالي العمليات', value: stats.total,      color: 'text-foreground',  icon: BarChart2 },
            { label: 'ناجحة',            value: stats.success,    color: 'text-success',     icon: CheckCircle },
            { label: 'فاشلة',            value: stats.failed,     color: 'text-destructive', icon: AlertCircle },
            { label: 'الإجمالي المشحون (ج.م)', value: `${stats.totalAmt.toFixed(2)}`, color: 'text-primary', icon: Wallet },
            { label: '🔴 رصيد أنا فودافون', value: stats.balanceOps, color: 'text-red-400', icon: Zap },
            { label: '💳 Vodafone Cash',    value: stats.vcashOps,   color: 'text-yellow-400', icon: CreditCard },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-3 text-center">
              <p className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* نسبة النجاح */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">نسبة النجاح</span>
            <span className={`text-sm font-black tabular-nums ${stats.successRate >= 70 ? 'text-success' : stats.successRate >= 40 ? 'text-yellow-400' : 'text-destructive'}`}>
              {stats.successRate}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stats.successRate >= 70 ? 'bg-success' : stats.successRate >= 40 ? 'bg-yellow-400' : 'bg-destructive'}`}
              style={{ width: `${stats.successRate}%` }}
            />
          </div>
        </div>

        {/* ── تعديل سريع ── */}
        <SectionCard title="تعديل سريع" icon={Edit2}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <Label className="text-xs mb-1 block">تعديل (+/-)</Label>
              <Input value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)}
                type="number" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">السبب</Label>
              <Input value={adjReason} onChange={e => setAdjReason(e.target.value)}
                className="h-8 text-sm" placeholder="اختياري" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 gap-1 text-xs" disabled={saving} onClick={() =>
              runConfirm('تأكيد تعديل العمليات', `تعديل ${adjustDelta} عملية`,
                async () => {
                  setSaving(true);
                  const res = await adminAdjustOps(id!, parseInt(adjustDelta)||0, adminProfile?.id ?? '', adjReason || 'تعديل');
                  setSaving(false);
                  if (res.success) { toast.success('✅ تم تعديل العمليات'); await loadOps(); await loadAllOps(); }
                  else toast.error(`فشل: ${res.error}`);
                })}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit2 className="w-3 h-3" />} تطبيق
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => runConfirm('تصفير جميع العمليات', 'سيتم حذف كل سجلات عمليات هذا المستخدم نهائياً!',
                async () => {
                  const { error } = await supabase.from('operations').delete().eq('user_id', id!);
                  if (!error) { toast.success('✅ تم التصفير'); await loadOps(); await loadAllOps(); }
                  else toast.error(`فشل: ${error.message}`);
                }, 'destructive')}>
              <Trash2 className="w-3 h-3" /> تصفير الكل
            </Button>
          </div>
        </SectionCard>

        {/* ── فلاتر ── */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="بحث برقم الهاتف أو نوع الكارت..."
              className="pr-9 h-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusF} onValueChange={v => { setStatusF(v); setPage(1); }}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="success">✅ ناجحة</SelectItem>
                <SelectItem value="failed">❌ فاشلة</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceF} onValueChange={v => { setSourceF(v); setPage(1); }}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="المصدر" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المصادر</SelectItem>
                <SelectItem value="balance">🔴 رصيد أنا فودافون</SelectItem>
                <SelectItem value="vcash">💳 Vodafone Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(search || statusF !== 'all' || sourceF !== 'all') && (
            <button
              onClick={() => { setSearch(''); setStatusF('all'); setSourceF('all'); setPage(1); }}
              className="text-[11px] text-primary flex items-center gap-1 hover:opacity-70">
              <X className="w-3 h-3" /> مسح الفلاتر
            </button>
          )}
        </div>

        {/* ── قائمة العمليات ── */}
        <SectionCard title={`العمليات (${total})`} icon={Clock}>
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl bg-muted" />)}</div>
          ) : ops.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">لا توجد عمليات تطابق الفلاتر</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {ops.map(op => <OpCard key={op.id} op={op} onDetails={openDetails} />)}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <Button size="icon" variant="outline" className="w-8 h-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">{page} / {totalPages}</span>
                  <Button size="icon" variant="outline" className="w-8 h-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </SectionCard>

      </div>

      {/* Sheet تفاصيل */}
      <OperationDetailsSheet
        op={detailOp}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />

      <ConfirmDialog
        open={confirmData.open}
        onOpenChange={v => setConfirmData(p => ({ ...p, open: v }))}
        title={confirmData.title}
        description={confirmData.desc}
        variant={confirmData.variant}
        onConfirm={async () => {
          setConfirmData(p => ({ ...p, open: false }));
          await confirmData.action();
        }}
      />
    </AdminShell>
  );
}
