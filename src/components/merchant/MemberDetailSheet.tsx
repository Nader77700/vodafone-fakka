import React from 'react';
// ─── Phase 6: Member Detail Sheet ────────────────────────────────────────────
// عرض تفاصيل العضو الكاملة: الاشتراك + النقاط + الإجراءات + السجل
import { useState, useEffect, useCallback } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  UserCheck, UserX, Ban, RotateCcw, Trash2, Plus, Minus,
  Calendar, Zap, History, Loader2, TrendingUp, TrendingDown,
  ChevronLeft, ChevronRight, CheckCircle, XCircle,
} from 'lucide-react';
import {
  getMerchantMember, assignPointsToMember, increaseMemberPoints, decreaseMemberPoints,
  activateMemberSubscription, renewMemberSubscription, setMemberStatus,
  deleteMerchantMember, getMemberHistory,
  previewLicenseCodeForMember, activateLicenseCodeForMember,
  type MemberCodePreview,
} from '@/lib/api';
import type { MerchantMember, MemberSubscription, MemberLedgerEntry, MemberStatus } from '@/types/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy', { locale: ar }); } catch { return d; }
}

const MEMBER_STATUS_LABELS: Record<string, string> = {
  active: 'نشط', pending: 'انتظار', suspended: 'موقوف',
  disabled: 'معطل', blocked: 'محظور', expired: 'منتهي',
};
const MEMBER_STATUS_CLS: Record<string, string> = {
  active:    'bg-success/10 text-success border-success/20',
  pending:   'bg-primary/10 text-primary border-primary/20',
  suspended: 'bg-warning/10 text-warning border-warning/20',
  disabled:  'bg-muted text-muted-foreground border-border',
  blocked:   'bg-destructive/10 text-destructive border-destructive/20',
  expired:   'bg-muted text-muted-foreground border-border',
};
const SUB_STATUS_LABELS: Record<string, string> = {
  active: 'نشط', pending: 'انتظار', expired: 'منتهي', cancelled: 'ملغى',
};
const TX_LABELS: Record<string, string> = {
  assign: 'توزيع', increase: 'زيادة', decrease: 'خصم', refund: 'إرجاع',
  adjustment: 'تعديل', subscription_bonus: 'مكافأة', admin_grant: 'منحة', admin_remove: 'إزالة', consume: 'استهلاك',
};

function MemberStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold',
      MEMBER_STATUS_CLS[status] ?? MEMBER_STATUS_CLS.disabled)}>
      {MEMBER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Action Dialog ─────────────────────────────────────────────────────────────
type ActionType = 'assign' | 'increase' | 'decrease' | 'activate' | 'renew' | null;

interface ActionDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  actionType: ActionType;
  onConfirm: (amount: number, reason: string, days?: number) => Promise<void>;
  loading: boolean;
}

function ActionDialog({ open, onOpenChange, actionType, onConfirm, loading }: ActionDialogProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('30');

  useEffect(() => { if (open) { setAmount(''); setReason(''); setDays('30'); } }, [open]);

  const titles: Record<string, string> = {
    assign: 'توزيع نقاط', increase: 'زيادة نقاط', decrease: 'خصم نقاط',
    activate: 'تفعيل اشتراك', renew: 'تجديد اشتراك',
  };
  const isPoints = actionType === 'assign' || actionType === 'increase' || actionType === 'decrease';
  const isSub    = actionType === 'activate' || actionType === 'renew';

  const handleConfirm = async () => {
    const n = parseInt(amount, 10);
    if (isNaN(n) || n <= 0) { toast.error('أدخل رقماً صحيحاً موجباً'); return; }
    const d = isSub ? parseInt(days, 10) : undefined;
    await onConfirm(n, reason, d);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{actionType ? titles[actionType] : ''}</DialogTitle>
          <DialogDescription>أدخل التفاصيل واضغط تأكيد للتنفيذ الفوري.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isPoints && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">عدد النقاط</label>
              <Input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="عدد النقاط" className="mt-1" />
            </div>
          )}
          {isSub && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">عدد الأيام</label>
                <Input type="number" min={1} value={days} onChange={e => setDays(e.target.value)}
                  placeholder="30" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">عدد النقاط</label>
                <Input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0" className="mt-1" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">السبب (اختياري)</label>
            <Input value={reason} onChange={e => setReason(e.target.value)}
              placeholder="سبب العملية" className="mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2 mt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : null}
            تأكيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  userId: string | null;
  merchantId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function MemberDetailSheet({ userId, merchantId, open, onClose, onChanged }: Props) {
  const [member, setMember]   = useState<MerchantMember | null>(null);
  const [sub, setSub]         = useState<MemberSubscription | null>(null);
  const [ledger, setLedger]   = useState<MemberLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab]         = useState<'info' | 'history'>('info');
  const [actionType, setActionType] = useState<ActionType>(null);

  // ── تفعيل بكود اشتراك ─────────────────────────────────────────────────────
  const [showCodeBox,         setShowCodeBox]         = useState(false);
  const [codeInput,           setCodeInput]           = useState('');
  const [codePreview,         setCodePreview]         = useState<MemberCodePreview | null>(null);
  const [codePreviewLoading,  setCodePreviewLoading]  = useState(false);
  const [codeActivateLoading, setCodeActivateLoading] = useState(false);

  const handlePreviewCode = async () => {
    if (!codeInput.trim()) return;
    setCodePreviewLoading(true);
    setCodePreview(null);
    const res = await previewLicenseCodeForMember(codeInput.trim().toUpperCase());
    setCodePreview(res);
    setCodePreviewLoading(false);
  };

  const handleActivateCode = async () => {
    if (!userId || !codePreview?.code) return;
    setCodeActivateLoading(true);
    const res = await activateLicenseCodeForMember(merchantId, userId, codePreview.code);
    setCodeActivateLoading(false);
    if (res.success) {
      toast.success('تم تفعيل الكود بنجاح ✅');
      setShowCodeBox(false); setCodeInput(''); setCodePreview(null);
      loadMember(); loadLedger(); onChanged();
    } else {
      toast.error(res.error ?? 'فشل التفعيل');
    }
  };

  const loadMember = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const r = await getMerchantMember(merchantId, userId);
    setMember(r.member);
    setSub(r.subscription);
    setLoading(false);
  }, [merchantId, userId]);

  const loadLedger = useCallback(async () => {
    if (!userId) return;
    const r = await getMemberHistory(merchantId, userId, { limit: 15, offset: ledgerPage * 15 });
    setLedger(r.items);
    setLedgerTotal(r.total);
  }, [merchantId, userId, ledgerPage]);

  useEffect(() => {
    if (open && userId) { loadMember(); loadLedger(); }
  }, [open, userId, loadMember, loadLedger]);

  // Realtime
  useEffect(() => {
    if (!open || !userId) return;
    const ch = supabase
      .channel(`member-detail-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_members',
        filter: `user_id=eq.${userId}` }, () => { loadMember(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_member_subscriptions',
        filter: `user_id=eq.${userId}` }, () => { loadMember(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'merchant_member_ledger',
        filter: `user_id=eq.${userId}` }, () => { loadLedger(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, userId, loadMember, loadLedger]);

  const handleAction = async (amount: number, reason: string, days?: number) => {
    if (!userId) return;
    setActionLoading(true);
    let res: { success: boolean; error?: string } = { success: false };
    switch (actionType) {
      case 'assign':   res = await assignPointsToMember(merchantId, userId, amount, reason); break;
      case 'increase': res = await increaseMemberPoints(merchantId, userId, amount, reason); break;
      case 'decrease': res = await decreaseMemberPoints(merchantId, userId, amount, reason); break;
      case 'activate': res = await activateMemberSubscription(merchantId, userId, days ?? 30, amount); break;
      case 'renew':    res = await renewMemberSubscription(merchantId, userId, days ?? 30, amount); break;
    }
    setActionLoading(false);
    setActionType(null);
    if (res.success) {
      toast.success('تم التنفيذ بنجاح ✅');
      loadMember(); loadLedger(); onChanged();
    } else {
      toast.error(res.error ?? 'حدث خطأ');
    }
  };

  const handleStatus = async (status: MemberStatus) => {
    if (!userId) return;
    setActionLoading(true);
    const res = await setMemberStatus(merchantId, userId, status);
    setActionLoading(false);
    if (res.success) {
      // تحديث فوري للحالة في الـ UI بدون انتظار إعادة التحميل
      setMember(prev => prev ? { ...prev, member_status: status } : prev);
      toast.success(`تم تغيير الحالة إلى: ${MEMBER_STATUS_LABELS[status]}`);
      loadMember();
      onChanged();
    } else {
      toast.error(res.error ?? 'فشل تغيير الحالة');
    }
  };

  const handleDelete = async () => {
    if (!userId) return;
    if (!confirm('هل أنت متأكد من حذف العضوية؟ لا يمكن التراجع.')) return;
    setActionLoading(true);
    const res = await deleteMerchantMember(merchantId, userId);
    setActionLoading(false);
    if (res.success) { toast.success('تم حذف العضوية'); onClose(); onChanged(); }
    else toast.error(res.error ?? 'فشل الحذف');
  };

  const ledgerPages = Math.ceil(ledgerTotal / 15);

  return (
    <>
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-card" dir="rtl">
          <SheetHeader className="pb-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                {(member?.username ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{member?.username ?? '—'}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{member?.phone ?? member?.email ?? '—'}</p>
              </div>
              {member && <MemberStatusBadge status={member.member_status} />}
            </SheetTitle>
          </SheetHeader>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 mb-4">
            {(['info', 'history'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('flex-1 h-8 rounded-lg text-xs font-semibold transition-colors',
                  tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                {t === 'info' ? 'التفاصيل' : 'السجل'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 bg-muted rounded-xl" />)}
            </div>
          ) : tab === 'info' ? (
            <div className="space-y-4">
              {/* Points Summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border bg-muted/30 p-2.5 text-center">
                  <p className="text-sm font-black text-primary tabular-nums">{member?.remaining_points ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">المتبقية</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-2.5 text-center">
                  <p className="text-sm font-black text-success tabular-nums">{member?.assigned_points ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">الموزعة</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-2.5 text-center">
                  <p className="text-sm font-black text-destructive tabular-nums">{member?.consumed_points ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">المستخدمة</p>
                </div>
              </div>

              {/* Subscription */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">الاشتراك</p>
                  {sub
                    ? <span className={cn('px-2 py-0.5 rounded-full border text-[10px] font-semibold',
                        sub.status === 'active' ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border')}>
                        {SUB_STATUS_LABELS[sub.status] ?? sub.status}
                      </span>
                    : <span className="text-[10px] text-muted-foreground">لا يوجد</span>
                  }
                </div>
                {sub && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">بداية:</span> <span>{fmtDate(sub.start_date)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">نهاية:</span> <span>{fmtDate(sub.end_date)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">الأيام المتبقية:</span>
                      <span className={cn('font-bold tabular-nums',
                        (sub.end_date && new Date(sub.end_date) < new Date()) ? 'text-destructive' : 'text-success')}>
                        {sub.end_date
                          ? Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
                          : 0}
                      </span>
                    </div>
                    <div className="flex justify-between"><span className="text-muted-foreground">آخر عملية:</span> <span>{fmt(member?.last_operation_at)}</span></div>
                  </div>
                )}
              </div>

              {/* ── تفعيل بكود اشتراك (داخل تفاصيل العضو) ── */}
              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                <button
                  onClick={() => { setShowCodeBox(v => !v); setCodeInput(''); setCodePreview(null); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary" /> تفعيل بكود اشتراك</span>
                  <span className="text-[10px]">{showCodeBox ? '▲' : '▼'}</span>
                </button>
                {showCodeBox && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border/50">
                    <div className="flex gap-2 pt-2">
                      <Input
                        placeholder="أدخل كود الاشتراك…"
                        value={codeInput}
                        onChange={e => setCodeInput(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && handlePreviewCode()}
                        className="h-8 text-xs flex-1 font-mono tracking-widest"
                        dir="ltr"
                      />
                      <Button size="sm" className="h-8 px-3 shrink-0 text-xs"
                        onClick={handlePreviewCode}
                        disabled={codePreviewLoading || !codeInput.trim()}>
                        {codePreviewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'فحص'}
                      </Button>
                    </div>
                    {codePreview && !codePreview.success && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-[11px] text-destructive">
                        <XCircle className="w-3 h-3 shrink-0" />{codePreview.error}
                      </div>
                    )}
                    {codePreview?.success && (
                      <div className="space-y-2">
                        <div className="rounded-lg bg-muted/30 border border-border p-2 grid grid-cols-2 gap-1.5 text-[11px]">
                          <div><span className="text-muted-foreground">النوع: </span><span className="font-semibold">{codePreview.code_type ?? '—'}</span></div>
                          <div><span className="text-muted-foreground">المدة: </span><span className="font-semibold">{codePreview.duration_days ? `${codePreview.duration_days} يوم` : '—'}</span></div>
                          <div><span className="text-muted-foreground">المتبقية: </span>
                            <span className={cn('font-bold', (codePreview.remaining_uses ?? 1) <= 0 ? 'text-destructive' : 'text-success')}>
                              {codePreview.remaining_uses ?? 'غير محدود'}
                            </span>
                          </div>
                        </div>
                        <Button size="sm" className="w-full h-8 gap-1.5 text-xs"
                          onClick={handleActivateCode}
                          disabled={codeActivateLoading || (codePreview.remaining_uses !== null && (codePreview.remaining_uses ?? 1) <= 0)}>
                          {codeActivateLoading
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <><CheckCircle className="w-3 h-3" /> تفعيل الكود لهذا العضو</>}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Points Actions */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">إجراءات النقاط</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" className="h-9 gap-1 text-xs bg-success text-success-foreground" onClick={() => setActionType('assign')}>
                    <Plus className="w-3.5 h-3.5" /> توزيع
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 gap-1 text-xs text-primary border-primary/30" onClick={() => setActionType('increase')}>
                    <TrendingUp className="w-3.5 h-3.5" /> زيادة
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 gap-1 text-xs text-destructive border-destructive/30" onClick={() => setActionType('decrease')}>
                    <Minus className="w-3.5 h-3.5" /> خصم
                  </Button>
                </div>
              </div>

              {/* Subscription Actions — smart: based on current sub status */}
              {(() => {
                const ms  = member?.member_status ?? 'pending';
                const ss  = sub?.status ?? null;
                const canActivate = !ss || ss === 'pending' || ss === 'expired' || ss === 'cancelled';
                const canRenew    = ss === 'active';
                if (!canActivate && !canRenew) return null;
                return (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">إجراءات الاشتراك</p>
                    <div className="grid grid-cols-2 gap-2">
                      {canActivate && (
                        <Button size="sm" variant="outline" className="h-9 gap-1 text-xs text-success border-success/30"
                          disabled={actionLoading} onClick={() => setActionType('activate')}>
                          <Calendar className="w-3.5 h-3.5" /> تفعيل
                        </Button>
                      )}
                      {canRenew && (
                        <Button size="sm" variant="outline" className="h-9 gap-1 text-xs text-primary border-primary/30"
                          disabled={actionLoading} onClick={() => setActionType('renew')}>
                          <RotateCcw className="w-3.5 h-3.5" /> تجديد
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Status Actions — حظر↔فك حظر، إيقاف↔تشغيل */}
              {(() => {
                const ms = member?.member_status ?? 'pending';
                const actions: { label: string; status: MemberStatus; icon: React.ElementType; cls: string }[] = [];

                // فك الحظر — إذا كان محظوراً
                if (ms === 'blocked') {
                  actions.push({ label: 'فك الحظر',     status: 'active',    icon: UserCheck, cls: 'text-success border-success/30' });
                }
                // إلغاء التعليق — إذا كان موقوفاً
                if (ms === 'suspended') {
                  actions.push({ label: 'إلغاء الإيقاف', status: 'active',   icon: UserCheck, cls: 'text-success border-success/30' });
                }
                // إعادة تفعيل — معطل أو منتهي
                if (ms === 'disabled' || ms === 'expired') {
                  actions.push({ label: 'استعادة',       status: 'active',   icon: UserCheck, cls: 'text-success border-success/30' });
                }
                // إيقاف مؤقت — نشط أو pending
                if (ms === 'active' || ms === 'pending') {
                  actions.push({ label: 'إيقاف مؤقت',   status: 'suspended', icon: UserX,    cls: 'text-warning border-warning/30' });
                }
                // حظر — أي حالة عدا المحظور
                if (ms !== 'blocked') {
                  actions.push({ label: 'حظر',           status: 'blocked',   icon: Ban,      cls: 'text-destructive border-destructive/30' });
                }

                if (!actions.length) return null;
                return (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">إجراءات الحالة</p>
                    <div className="grid grid-cols-2 gap-2">
                      {actions.map(({ label, status, icon: Icon, cls }) => (
                        <Button key={label} size="sm" variant="outline" disabled={actionLoading}
                          className={cn('h-9 gap-1 text-xs', cls)}
                          onClick={() => handleStatus(status)}>
                          {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Delete */}
              <Button size="sm" variant="outline" className="w-full h-9 gap-1.5 text-xs text-destructive border-destructive/30"
                disabled={actionLoading} onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" /> حذف العضوية
              </Button>
            </div>
          ) : (
            /* History Tab */
            <div className="space-y-2">
              {ledger.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  لا توجد عمليات
                </div>
              ) : ledger.map(e => (
                <div key={e.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5">
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                    e.amount > 0 ? 'bg-success/10' : 'bg-destructive/10')}>
                    {e.amount > 0
                      ? <TrendingUp className="w-3.5 h-3.5 text-success" />
                      : <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('text-xs font-bold tabular-nums',
                        e.amount > 0 ? 'text-success' : 'text-destructive')}>
                        {e.amount > 0 ? '+' : ''}{e.amount}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{TX_LABELS[e.type] ?? e.type}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{e.reason ?? '—'}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{fmt(e.created_at)}</span>
                </div>
              ))}
              {ledgerPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <Button size="sm" variant="ghost" disabled={ledgerPage === 0} onClick={() => setLedgerPage(p => p - 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <span className="text-[10px] text-muted-foreground">{ledgerPage + 1}/{ledgerPages}</span>
                  <Button size="sm" variant="ghost" disabled={ledgerPage >= ledgerPages - 1} onClick={() => setLedgerPage(p => p + 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ActionDialog
        open={actionType !== null}
        onOpenChange={v => !v && setActionType(null)}
        actionType={actionType}
        onConfirm={handleAction}
        loading={actionLoading}
      />
    </>
  );
}
