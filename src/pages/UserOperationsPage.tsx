/**
 * UserOperationsPage — صفحة عمليات المستخدم المستقلة (النظام الجديد)
 * تعرض جميع عمليات المستخدم مع بحث وفلترة وتفاصيل inline
 * رسائل عربية فقط — لا تقنيات مكشوفة
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import type { Operation } from '@/types/types';
import { parseApiError } from '@/lib/errorMapper';
import {
  ArrowRight, Search, CheckCircle2, XCircle, Clock,
  RefreshCw, X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { ALL_PRODUCTS } from '@/data/products';
import { formatReceiptTime, formatReceiptDate } from '@/lib/egyptTime';
import InvoiceReceipt from '@/components/invoice/InvoiceReceipt';
import PrintButton from '@/components/invoice/PrintButton';
import type { InvoiceData } from '@/lib/printer/types';

// ─── helpers ─────────────────────────────────────────────────────────────────
function statusLabel(s: string) {
  if (s === 'success') return { text: 'ناجحة', color: 'text-green-400', bg: 'bg-green-400/10', icon: CheckCircle2 };
  if (s === 'failed')  return { text: 'فاشلة',  color: 'text-red-400',   bg: 'bg-red-400/10',   icon: XCircle };
  return { text: 'معلقة', color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: Clock };
}

// ─── بناء InvoiceData من Operation ───────────────────────────────────────────
function buildInvoiceFromOp(op: Operation): InvoiceData {
  const cd = op.card_data as Record<string, unknown> | null;
  const isBalance = op.operation_source === 'ana_vodafone_balance' || cd?.source === 'ana_vodafone_balance';

  const productId = (cd?.product_id as string | undefined) ?? op.card_type ?? '';
  const productFromList = ALL_PRODUCTS.find(p => p.id === productId || p.displayName === productId);

  const unitsLabel = (cd?.units_label  as string | undefined)
    ?? (cd?.units != null ? `${cd.units} وحدة` : null)
    ?? productFromList?.unitsLabel ?? '—';

  const validity = (cd?.validity as string | undefined) ?? productFromList?.validity ?? '';

  const cardPrice = op.amount != null
    ? `${op.amount} جنيه`
    : productFromList?.priceLabel ?? '—';

  const via = (cd?.via as string | undefined)
    ?? op.execution_layer
    ?? (isBalance ? 'رصيد أنا فودافون' : 'vodafone_cash');

  const performedDate = new Date(op.performed_at);

  return {
    opNumber:      op.operation_number ?? null,
    receiverPhone: op.phone_number,
    productName:   op.card_type ?? productFromList?.name ?? '—',
    cardPrice,
    units:         unitsLabel,
    validity,
    category:      op.category ?? (isBalance ? 'رصيد' : 'فكة'),
    date:          formatReceiptDate(performedDate),
    time:          formatReceiptTime(performedDate),
    via,
    status:        op.status,
    correlationId: op.correlation_id ?? undefined,
    latencyMs:     op.duration_ms ?? op.latency_ms ?? undefined,
  };
}

// ─── Sheet تفاصيل العملية — يستخدم InvoiceReceipt الموحّدة ──────────────────
function OpDetailSheet({ op, open, onClose }: { op: Operation | null; open: boolean; onClose: () => void }) {
  if (!op) return null;
  const isSuccess = op.status === 'success';
  const invoice = buildInvoiceFromOp(op);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom"
        className="max-h-[88dvh] overflow-y-auto max-w-[calc(100%-2rem)] md:max-w-lg mx-auto rounded-t-2xl"
        style={{ background: '#120000', border: '1px solid rgba(230,0,0,0.2)' }}>
        <SheetHeader className="pb-3 border-b" style={{ borderColor: 'rgba(230,0,0,0.15)' }}>
          <SheetTitle className="text-sm text-white">
            <span>{isSuccess ? '✅' : '❌'}</span> تفاصيل العملية
          </SheetTitle>
        </SheetHeader>

        {/* فاتورة موحّدة */}
        <InvoiceReceipt invoice={invoice} compact />

        {/* سبب الفشل */}
        {!isSuccess && op.error_message && (
          <div className="mx-3 mt-2 rounded-xl p-3"
            style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}>
            <p className="text-[10px] font-bold text-red-400 mb-1">سبب الفشل</p>
            <p className="text-xs text-red-300 break-words">
              {parseApiError(op.error_message).arabicMessage}
            </p>
          </div>
        )}

        <div className="px-3 pt-3 pb-2 space-y-2">
          <PrintButton invoice={invoice} variant="full" />
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.15)', color: '#ff8888' }}>
            إغلاق
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function UserOperationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [ops,         setOps]         = useState<Operation[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'balance' | 'vcash'>('all');
  const [dateFilter,   setDateFilter]   = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [detailOp,    setDetailOp]    = useState<Operation | null>(null);
  const [sheetOpen,   setSheetOpen]   = useState(false);

  const loadOps = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('operations')
      .select('*')
      .eq('user_id', user.id)
      .order('performed_at', { ascending: false })
      .limit(500);
    setOps(Array.isArray(data) ? (data as unknown as Operation[]) : []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadOps(); }, [loadOps]);

  // إحصائيات
  const stats = useMemo(() => {
    const success = ops.filter(o => o.status === 'success');
    const failed  = ops.filter(o => o.status !== 'success');
    const totalAmt = success.reduce((s, o) => s + (o.amount ?? 0), 0);
    return { total: ops.length, success: success.length, failed: failed.length, totalAmt };
  }, [ops]);

  // فلترة
  const filtered = useMemo(() => ops.filter(op => {
    const now = new Date();
    if (statusFilter !== 'all' && op.status !== statusFilter) return false;
    if (sourceFilter !== 'all') {
      const src = op.operation_source ?? (op.card_data as Record<string,unknown> | null)?.source as string;
      const isBalance = src === 'ana_vodafone_balance' || src === 'balance';
      if (sourceFilter === 'balance' && !isBalance) return false;
      if (sourceFilter === 'vcash' && isBalance) return false;
    }
    if (dateFilter !== 'all') {
      const opDate = new Date(op.performed_at);
      const start = new Date(now);
      if (dateFilter === 'today') start.setHours(0,0,0,0);
      else if (dateFilter === 'week') start.setDate(start.getDate() - 7);
      else if (dateFilter === 'month') start.setDate(start.getDate() - 30);
      if (opDate < start) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        op.phone_number?.toLowerCase().includes(q) ||
        op.card_type?.toLowerCase().includes(q) ||
        String(op.operation_number ?? '').includes(q)
      );
    }
    return true;
  }), [ops, statusFilter, sourceFilter, dateFilter, search]);

  const hasFilters = search || statusFilter !== 'all' || sourceFilter !== 'all' || dateFilter !== 'all';

  return (
    <div className="min-h-screen pb-8" style={{ background: '#080000' }} dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b"
        style={{ background: 'rgba(8,0,0,0.95)', borderColor: 'rgba(230,0,0,0.15)', backdropFilter: 'blur(8px)' }}>
        <button onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(230,0,0,0.1)', border: '1px solid rgba(230,0,0,0.2)' }}>
          <ArrowRight className="w-4 h-4" style={{ color: '#E60000' }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-black text-white truncate">سجل العمليات</h1>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{stats.total} عملية إجمالاً</p>
        </div>
        <button onClick={loadOps} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.15)' }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: '#E60000' }} />
        </button>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* إحصائيات مختصرة */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'الكل',    value: stats.total,                      color: '#ffffff' },
            { label: 'ناجحة',   value: stats.success,                    color: '#4ade80' },
            { label: 'فاشلة',   value: stats.failed,                     color: '#f87171' },
            { label: 'المبلغ',  value: `${stats.totalAmt.toFixed(0)}ج`,  color: '#E60000' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-2.5 text-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-base font-black tabular-nums" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* بحث */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            placeholder="ابحث برقم الهاتف أو المنتج أو رقم العملية..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl outline-none text-right"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', caretColor: '#E60000' }}
          />
        </div>

        {/* فلاتر */}
        <div className="grid grid-cols-3 gap-2">
          {/* الحالة */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-8 text-xs rounded-lg px-2 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
            <option value="all">كل الحالات</option>
            <option value="success">✅ ناجحة</option>
            <option value="failed">❌ فاشلة</option>
          </select>
          {/* المصدر */}
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as typeof sourceFilter)}
            className="h-8 text-xs rounded-lg px-2 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
            <option value="all">كل المصادر</option>
            <option value="balance">🔴 رصيد أنا</option>
            <option value="vcash">💳 VCash</option>
          </select>
          {/* التاريخ */}
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value as typeof dateFilter)}
            className="h-8 text-xs rounded-lg px-2 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
            <option value="all">كل الأوقات</option>
            <option value="today">اليوم</option>
            <option value="week">آخر 7 أيام</option>
            <option value="month">آخر 30 يوم</option>
          </select>
        </div>

        {/* مسح الفلاتر */}
        {hasFilters && (
          <button onClick={() => { setSearch(''); setStatusFilter('all'); setSourceFilter('all'); setDateFilter('all'); }}
            className="flex items-center gap-1 text-[11px]" style={{ color: '#E60000' }}>
            <X className="w-3 h-3" /> مسح الفلاتر ({filtered.length} نتيجة)
          </button>
        )}

        {/* قائمة العمليات */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-2xl">📭</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>لا توجد عمليات</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(op => {
              const st = statusLabel(op.status);
              const StIcon = st.icon;
              const opSrc = op.operation_source ?? (op.card_data as Record<string,unknown> | null)?.source as string | undefined;
              const isBalance = opSrc === 'ana_vodafone_balance' || opSrc === 'balance';
              const srcLabel  = isBalance ? 'رصيد أنا فودافون' : 'Vodafone Cash';
              const failReason = op.status === 'failed'
                ? parseApiError(op.error_message).arabicMessage.split('\n')[0]
                : null;
              const opDateStr = formatReceiptDate(new Date(op.performed_at));

              return (
                <div key={op.id}
                  className="rounded-xl border p-3"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: op.status === 'success' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)' }}>
                  {/* صف رئيسي */}
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${st.bg}`}>
                      <StIcon className={`w-4 h-4 ${st.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-white truncate">{op.card_type}</p>
                        {op.operation_number != null && (
                          <span className="text-[9px] font-mono px-1.5 py-0 rounded-full shrink-0"
                            style={{ background: 'rgba(230,0,0,0.1)', color: '#ff8888', border: '1px solid rgba(230,0,0,0.2)' }}>
                            #{op.operation_number}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {op.phone_number}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>{st.text}</span>
                      {op.amount != null && (
                        <span className="text-[11px] font-bold" style={{ color: '#E60000' }}>{op.amount} ج</span>
                      )}
                    </div>
                  </div>
                  {/* بادجات + وقت */}
                  <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                        isBalance
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      }`}>{isBalance ? '🔴' : '💳'} {srcLabel}</span>
                      {failReason && (
                        <span className="text-[9px] truncate max-w-[140px]" style={{ color: 'rgba(248,113,113,0.75)' }}>
                          {failReason}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {opDateStr}
                      </p>
                      <button
                        onClick={() => { setDetailOp(op); setSheetOpen(true); }}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors"
                        style={{ background: 'rgba(230,0,0,0.1)', border: '1px solid rgba(230,0,0,0.2)', color: '#ff8888' }}>
                        تفاصيل
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <OpDetailSheet op={detailOp} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
