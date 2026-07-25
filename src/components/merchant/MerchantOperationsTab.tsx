// ── Phase 9: Merchant Operations History Tab ───────────────────────────────
// ADDITIVE — يُضاف كتبويب جديد في MerchantDashboard
// يعرض جميع عمليات مستخدمي التاجر مع فلترة + pagination + realtime

import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, Clock, Phone, Wallet, RefreshCw, Filter, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { getMerchantOperationsHistory } from '@/lib/api';
import type { MerchantOperation } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import MerchantChargeStats from '@/components/merchant-client/MerchantChargeStats';

interface Props { merchantId: string }

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: MerchantOperation['status'] }) {
  const cfg = {
    success:   { label: 'ناجح',    cls: 'bg-success/10 text-success border-success/20', icon: CheckCircle2 },
    failed:    { label: 'فاشل',    cls: 'bg-destructive/10 text-destructive border-destructive/20', icon: XCircle },
    pending:   { label: 'جارٍ',   cls: 'bg-warning/10 text-warning border-warning/20', icon: Clock },
    cancelled: { label: 'ملغي',   cls: 'bg-muted text-muted-foreground border-border', icon: XCircle },
  }[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border', cfg.cls)}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function SourceBadge({ source }: { source: MerchantOperation['operation_source'] }) {
  return source === 'vodafone_cash'
    ? <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20"><Phone className="w-2 h-2" />VC</span>
    : <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border"><Wallet className="w-2 h-2" />رصيد</span>;
}

function OperationRow({ op }: { op: MerchantOperation }) {
  const timeLabel = op.executed_at
    ? formatDistanceToNow(new Date(op.executed_at), { addSuffix: true, locale: ar })
    : '—';

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors">
      {/* أيقونة المصدر */}
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
        op.operation_source === 'vodafone_cash' ? 'bg-primary/10' : 'bg-muted',
      )}>
        {op.operation_source === 'vodafone_cash'
          ? <Phone className="w-3.5 h-3.5 text-primary" />
          : <Wallet className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>

      {/* تفاصيل */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-bold text-foreground truncate">
            {op.card_name ?? 'عملية شحن'}
          </p>
          <SourceBadge source={op.operation_source} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[10px] text-muted-foreground font-mono">
            {op.phone_number ?? '—'}
          </p>
          {op.price != null && (
            <p className="text-[10px] text-muted-foreground">
              {op.price} جنيه
            </p>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/70 truncate">
          {op.username ?? op.user_email ?? op.user_id.slice(0, 8) + '…'}
        </p>
        {op.status === 'failed' && op.failure_reason && (
          <p className="text-[10px] text-destructive mt-1 text-pretty">
            ↳ {op.failure_reason}
            {op.failure_stage && <span className="text-muted-foreground"> (في: {op.failure_stage})</span>}
          </p>
        )}
      </div>

      {/* حالة + وقت */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={op.status} />
        <p className="text-[9px] text-muted-foreground">{timeLabel}</p>
        {op.points_deducted > 0 && (
          <span className="text-[9px] font-bold text-warning">-{op.points_deducted} نقطة</span>
        )}
      </div>
    </div>
  );
}

export default function MerchantOperationsTab({ merchantId }: Props) {
  const [ops,       setOps]       = useState<MerchantOperation[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<string>('all');
  const [source,    setSource]    = useState<string>('all');
  const mountedRef = useRef(true);

  const fetch = useCallback(async (pg = 0, st = filter, src = source) => {
    setLoading(true);
    const res = await getMerchantOperationsHistory(merchantId, {
      limit:  PAGE_SIZE,
      offset: pg * PAGE_SIZE,
      status: st === 'all' ? undefined : st,
      source: src === 'all' ? undefined : src,
    });
    if (!mountedRef.current) return;
    setOps(res.rows);
    setTotal(res.total);
    setLoading(false);
  }, [merchantId, filter, source]);

  useEffect(() => {
    mountedRef.current = true;
    void fetch(0);
    return () => { mountedRef.current = false; };
  }, [fetch]);

  // Realtime: تحديث تلقائي عند إضافة عمليات جديدة
  useEffect(() => {
    const channel = supabase
      .channel(`merchant-ops-${merchantId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'merchant_operations',
        filter: `merchant_id=eq.${merchantId}`,
      }, () => void fetch(page))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'merchant_operations',
        filter: `merchant_id=eq.${merchantId}`,
      }, () => void fetch(page))
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [merchantId, page, fetch]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleFilter = (val: string) => {
    setFilter(val); setPage(0); void fetch(0, val, source);
  };
  const handleSource = (val: string) => {
    setSource(val); setPage(0); void fetch(0, filter, val);
  };
  const goPrev = () => { const p = Math.max(0, page - 1); setPage(p); void fetch(p); };
  const goNext = () => { const p = Math.min(totalPages - 1, page + 1); setPage(p); void fetch(p); };

  return (
    <div className="space-y-4">
      {/* إحصائيات مدمجة */}
      <MerchantChargeStats merchantId={merchantId} />

      {/* أدوات الفلترة */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Select value={filter} onValueChange={handleFilter}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="success">ناجح</SelectItem>
            <SelectItem value="failed">فاشل</SelectItem>
            <SelectItem value="pending">جارٍ</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={handleSource}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="المصدر" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المصادر</SelectItem>
            <SelectItem value="vodafone_cash">Vodafone Cash</SelectItem>
            <SelectItem value="mobile_balance">شحن رصيد</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost" size="sm" className="h-8 px-2 ml-auto"
          onClick={() => void fetch(page)}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <span className="text-[10px] text-muted-foreground">{total} عملية</span>
      </div>

      {/* القائمة */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl bg-muted" />
          ))}
        </div>
      ) : ops.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p>لا توجد عمليات بعد</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ops.map(op => <OperationRow key={op.id} op={op} />)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={goPrev} disabled={page === 0}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={goNext} disabled={page >= totalPages - 1}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}


