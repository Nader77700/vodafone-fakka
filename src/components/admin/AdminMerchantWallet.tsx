// ─── Phase 5: Merchant Wallet Panel — Admin View ──────────────────────────────
// Additive Only — لا تعديل أي نظام قائم
import { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Plus, Minus, RotateCcw, SlidersHorizontal,
  History, Loader2, TrendingUp, TrendingDown,
  AlertCircle, ChevronLeft, ChevronRight, Search,
  Calendar, Filter, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard } from '@/components/admin/AdminShell';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  getMerchantWallet, getMerchantLedger,
  merchantWalletRecharge, merchantWalletDeduct,
  merchantWalletRefund, merchantWalletAdjust,
} from '@/lib/api';
import type { MerchantWallet, MerchantLedgerEntry, MerchantTxType } from '@/types/types';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}

const TX_LABELS: Record<MerchantTxType, string> = {
  recharge:           'شحن',
  deduct:             'خصم',
  refund:             'إرجاع',
  adjustment:         'تعديل',
  subscription_bonus: 'مكافأة اشتراك',
  admin_grant:        'منحة إدارية',
  admin_remove:        'إزالة إدارية',
  transfer_to_user:   'تحويل لمستخدم',
};

const TX_COLORS: Record<MerchantTxType, string> = {
  recharge:           'bg-success/10 text-success border-success/20',
  deduct:             'bg-destructive/10 text-destructive border-destructive/20',
  refund:             'bg-primary/10 text-primary border-primary/20',
  adjustment:         'bg-warning/10 text-warning border-warning/20',
  subscription_bonus: 'bg-success/10 text-success border-success/20',
  admin_grant:        'bg-success/10 text-success border-success/20',
  admin_remove:        'bg-destructive/10 text-destructive border-destructive/20',
  transfer_to_user:   'bg-primary/10 text-primary border-primary/20',
};

interface Props {
  merchantId: string;
  adminId?: string;
}

export default function AdminMerchantWallet({ merchantId, adminId }: Props) {
  const [wallet, setWallet] = useState<MerchantWallet | null>(null);
  const [ledger, setLedger] = useState<MerchantLedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [filterType, setFilterType] = useState<MerchantTxType | ''>('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogDesc, setDialogDesc] = useState('');
  const [dialogVariant, setDialogVariant] = useState<'default' | 'destructive'>('default');
  const [dialogAmount, setDialogAmount] = useState('');
  const [dialogReason, setDialogReason] = useState('');
  const [dialogNotes, setDialogNotes] = useState('');
  const [pendingAction, setPendingAction] = useState<'recharge' | 'deduct' | 'refund' | 'adjust' | null>(null);

  const loadWallet = useCallback(async () => {
    const { success, wallet: w } = await getMerchantWallet(merchantId);
    if (success) setWallet(w ?? null);
  }, [merchantId]);

  const loadLedger = useCallback(async () => {
    const { success, total: t, items } = await getMerchantLedger(merchantId, {
      limit: pageSize,
      offset: page * pageSize,
      type: filterType || undefined,
    });
    if (success) {
      setTotal(t ?? 0);
      setLedger(items ?? []);
    }
  }, [merchantId, page, pageSize, filterType]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadWallet(), loadLedger()]);
    setLoading(false);
  }, [loadWallet, loadLedger]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime: subscribe to wallet + ledger changes
  useEffect(() => {
    const ch = supabase
      .channel(`admin-wallet-${merchantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'merchant_wallets',
        filter: `merchant_id=eq.${merchantId}`,
      }, () => { loadWallet(); })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'merchant_ledger',
        filter: `merchant_id=eq.${merchantId}`,
      }, () => { loadLedger(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [merchantId, loadWallet, loadLedger]);

  const openDialog = (action: 'recharge' | 'deduct' | 'refund' | 'adjust') => {
    setPendingAction(action);
    setDialogAmount('');
    setDialogReason('');
    setDialogNotes('');
    const titles: Record<string, string> = {
      recharge: 'شحن نقاط',
      deduct: 'خصم نقاط',
      refund: 'إرجاع نقاط',
      adjust: 'تعديل الرصيد',
    };
    setDialogTitle(titles[action]);
    setDialogDesc('أدخل التفاصيل واضغط تأكيد للتنفيذ.');
    setDialogVariant(action === 'deduct' ? 'destructive' : 'default');
    setDialogOpen(true);
  };

  const executeAction = async () => {
    const amount = parseInt(dialogAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      toast.error('أدخل رقماً صحيحاً موجباً');
      return;
    }
    setActionLoading(true);
    let result;
    switch (pendingAction) {
      case 'recharge':
        result = await merchantWalletRecharge(merchantId, amount, dialogReason, dialogNotes, adminId);
        break;
      case 'deduct':
        result = await merchantWalletDeduct(merchantId, amount, dialogReason, dialogNotes, adminId);
        break;
      case 'refund':
        result = await merchantWalletRefund(merchantId, amount, dialogReason, dialogNotes, adminId);
        break;
      case 'adjust':
        result = await merchantWalletAdjust(merchantId, amount, dialogReason, dialogNotes, adminId);
        break;
    }
    setActionLoading(false);
    setDialogOpen(false);
    if (result?.success) {
      toast.success(`${dialogTitle} — تم التنفيذ ✅`);
      loadAll();
    } else {
      toast.error(result?.error ?? 'حدث خطأ');
    }
  };

  const pages = Math.ceil(total / pageSize);

  if (loading && !wallet) return (
    <div className="space-y-4">
      <Skeleton className="h-32 bg-muted rounded-2xl" />
      <Skeleton className="h-48 bg-muted rounded-2xl" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ── Balance Card ── */}
      <SectionCard title="محفظة النقاط" icon={Wallet}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">الرصيد الحالي</p>
            <p className="text-2xl font-black tabular-nums text-primary">{wallet?.current_points ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">المحجوز</p>
            <p className="text-2xl font-black tabular-nums text-warning">{wallet?.reserved_points ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">المستخدم مدى الحياة</p>
            <p className="text-2xl font-black tabular-nums text-destructive">{wallet?.lifetime_consumed ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">المشحون مدى الحياة</p>
            <p className="text-2xl font-black tabular-nums text-success">{wallet?.lifetime_purchased ?? 0}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">الشهري</p>
            <p className="text-lg font-black tabular-nums">{wallet?.monthly_consumed ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">اليومي</p>
            <p className="text-lg font-black tabular-nums">{wallet?.daily_consumed ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">آخر عملية</p>
            <p className="text-xs font-semibold">{fmt(wallet?.last_operation_at)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">آخر شحن</p>
            <p className="text-xs font-semibold">{fmt(wallet?.last_recharge_at)}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button size="sm" className="h-8 gap-1.5 bg-success text-success-foreground" onClick={() => openDialog('recharge')}>
            <Plus className="w-3.5 h-3.5" /> شحن نقاط
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-destructive border-destructive/30" onClick={() => openDialog('deduct')}>
            <Minus className="w-3.5 h-3.5" /> خصم نقاط
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-primary border-primary/30" onClick={() => openDialog('refund')}>
            <RotateCcw className="w-3.5 h-3.5" /> إرجاع نقاط
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-warning border-warning/30" onClick={() => openDialog('adjust')}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> تعديل رصيد
          </Button>
        </div>
      </SectionCard>

      {/* ── Ledger History ── */}
      <SectionCard title={`سجل العمليات (${total})`} icon={History}>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value as MerchantTxType | ''); setPage(0); }}
            className="h-8 text-xs rounded-lg border border-border bg-background px-2"
          >
            <option value="">كل الأنواع</option>
            {Object.entries(TX_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={loadAll}>
            <RotateCcw className="w-3 h-3" /> تحديث
          </Button>
        </div>

        {ledger.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
            لا توجد عمليات مسجلة
          </div>
        ) : (
          <div className="space-y-2">
            {ledger.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  entry.amount > 0 ? 'bg-success/10' : 'bg-destructive/10'
                }`}>
                  {entry.amount > 0
                    ? <TrendingUp className="w-4 h-4 text-success" />
                    : <TrendingDown className="w-4 h-4 text-destructive" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${TX_COLORS[entry.type]}`}>
                      {TX_LABELS[entry.type]}
                    </Badge>
                    <span className={`text-sm font-bold tabular-nums ${entry.amount > 0 ? 'text-success' : 'text-destructive'}`}>
                      {entry.amount > 0 ? '+' : ''}{entry.amount}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {entry.reason || '—'} {entry.notes && `· ${entry.notes}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    قبل: {entry.balance_before} → بعد: {entry.balance_after}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">{fmt(entry.created_at)}</p>
                  <p className="text-[9px] font-mono text-muted-foreground opacity-60">{entry.transaction_id.slice(0, 16)}…</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground">صفحة {page + 1} من {pages}</span>
            <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        )}
      </SectionCard>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">عدد النقاط</label>
              <Input
                type="number"
                min={1}
                value={dialogAmount}
                onChange={(e) => setDialogAmount(e.target.value)}
                placeholder="أدخل عدد النقاط"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">السبب</label>
              <Input
                value={dialogReason}
                onChange={(e) => setDialogReason(e.target.value)}
                placeholder="سبب العملية"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">ملاحظات</label>
              <Input
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder="ملاحظات إضافية"
                className="mt-1"
              />
            </div>
            {pendingAction === 'adjust' && (
              <p className="text-[10px] text-warning">
                ⚠️ القيمة السالبة تخصم والموجبة تضيف. لا يسمح برصيد سالب.
              </p>
            )}
            {actionLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> جاري التنفيذ...
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={executeAction}
              className={dialogVariant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              disabled={actionLoading}
            >
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
