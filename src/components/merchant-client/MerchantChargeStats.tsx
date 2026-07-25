// ── Phase 9: Merchant Charge Statistics Card ────────────────────────────────
// ADDITIVE — يُستخدم في MerchantClientHome و MerchantDashboard

import { useState, useEffect, useCallback } from 'react';
import { Zap, CheckCircle2, XCircle, TrendingUp, Clock, Phone, Wallet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getMerchantChargeStatistics } from '@/lib/api';
import type { MerchantChargeStats as Stats } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Props {
  merchantId: string;
  /** compact: يعرض 4 أرقام فقط بدون تفاصيل */
  compact?: boolean;
  className?: string;
}

function StatCard({
  label, value, icon: Icon, cls, bg, sub
}: {
  label: string; value: string | number; icon: React.ElementType;
  cls: string; bg: string; sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
        <Icon className={cn('w-4 h-4', cls)} />
      </div>
      <div className="min-w-0">
        <p className={cn('text-base font-black tabular-nums', cls)}>{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight text-pretty">{label}</p>
        {sub && <p className="text-[9px] text-muted-foreground/70 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function MerchantChargeStats({ merchantId, compact = false, className }: Props) {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const s = await getMerchantChargeStatistics(merchantId);
    setStats(s);
    setLoading(false);
  }, [merchantId]);

  useEffect(() => { void fetch(); }, [fetch]);

  if (loading) {
    return (
      <div className={cn('grid grid-cols-2 gap-3', className)}>
        {[...Array(compact ? 4 : 6)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const lastOpLabel = stats.last_op
    ? formatDistanceToNow(new Date(stats.last_op), { addSuffix: true, locale: ar })
    : 'لا توجد';

  const items = compact
    ? [
        { label: 'إجمالي العمليات', value: stats.total_ops,   icon: Zap,         cls: 'text-primary',     bg: 'bg-primary/10' },
        { label: 'ناجح',            value: stats.success_ops,  icon: CheckCircle2, cls: 'text-success',     bg: 'bg-success/10' },
        { label: 'فاشل',            value: stats.failed_ops,   icon: XCircle,      cls: 'text-destructive', bg: 'bg-destructive/10' },
        { label: 'نقاط مستهلكة',   value: stats.points_used,  icon: TrendingUp,   cls: 'text-warning',     bg: 'bg-warning/10' },
      ]
    : [
        { label: 'إجمالي العمليات', value: stats.total_ops,   icon: Zap,         cls: 'text-primary',     bg: 'bg-primary/10' },
        { label: 'ناجح',            value: stats.success_ops,  icon: CheckCircle2, cls: 'text-success',     bg: 'bg-success/10', sub: `${stats.success_rate}%` },
        { label: 'فاشل',            value: stats.failed_ops,   icon: XCircle,      cls: 'text-destructive', bg: 'bg-destructive/10' },
        { label: 'نقاط مستهلكة',   value: stats.points_used,  icon: TrendingUp,   cls: 'text-warning',     bg: 'bg-warning/10' },
        { label: 'Vodafone Cash',   value: stats.vodafone_ops, icon: Phone,        cls: 'text-primary',     bg: 'bg-primary/10' },
        { label: 'شحن رصيد',        value: stats.balance_ops,  icon: Wallet,       cls: 'text-muted-foreground', bg: 'bg-muted' },
      ];

  return (
    <div className={cn('space-y-3', className)}>
      {!compact && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <p className="text-sm font-bold">إحصائيات العمليات</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{lastOpLabel}</span>
          </div>
        </div>
      )}
      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2')}>
        {items.map(({ label, value, icon, cls, bg, sub }: {
          label: string; value: number; icon: React.ElementType;
          cls: string; bg: string; sub?: string;
        }) => (
          <StatCard key={label} label={label} value={value} icon={icon} cls={cls} bg={bg} sub={sub} />
        ))}
      </div>
      {!compact && stats.last_success && (
        <p className="text-[10px] text-muted-foreground text-center">
          آخر نجاح: {formatDistanceToNow(new Date(stats.last_success), { addSuffix: true, locale: ar })}
        </p>
      )}
    </div>
  );
}
