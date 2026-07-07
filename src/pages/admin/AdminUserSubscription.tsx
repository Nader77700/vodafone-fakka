// صفحة إدارة الاشتراك الكاملة — /admin/users/:id/subscription
// PHASE 1-17: نظام احترافي شامل
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, RefreshCw, Loader2, Calendar, Key,
  CheckCircle, XCircle, Clock, AlertCircle,
  History, RotateCcw, Ban, Edit3, User, Copy, Phone,
  Mail, ExternalLink, Play, Archive, Undo2, Pause,
  Activity, ChevronDown, ChevronUp, AlertTriangle,
  Timer, Info, ArrowRightLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import AdminShell, { SectionCard, InfoRow, ConfirmDialog } from '@/components/admin/AdminShell';
import {
  getUserDetail, type UserDetail,
  getSubscriptionHistory, type SubscriptionHistoryEntry,
  getSubscriptionOperations, type SubscriptionOperation,
  suspendSubscriptionPro, unsuspendSubscriptionPro,
  cancelSubscriptionPro, reactivateSubscriptionPro,
  archiveSubscriptionPro, restoreArchivedSubscription, restoreReplacedSubscription,
  getArchivedSubscriptions, getAllUserSubscriptions,
  renewSubscriptionPro, extendSubscriptionPro,
} from '@/lib/api';
import type { Subscription } from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

// ── مساعدات ──────────────────────────────────────────────────────────────────
function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}
function calcSecondsLeft(e?: string | null): number {
  if (!e) return 0;
  return Math.max(0, Math.floor((new Date(e).getTime() - Date.now()) / 1000));
}
function fmtCountdown(secs: number): string {
  if (secs <= 0) return 'انتهى';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d} يوم ${h} ساعة`;
  if (h > 0) return `${h} ساعة ${m} دقيقة`;
  if (m > 0) return `${m} دقيقة ${s} ثانية`;
  return `${s} ثانية`;
}

const STATUS_STYLES: Record<string, string> = {
  active:    'text-success bg-success/10 border-success/20',
  expired:   'text-destructive bg-destructive/10 border-destructive/20',
  cancelled: 'text-muted-foreground bg-muted/30 border-border',
  replaced:  'text-primary bg-primary/10 border-primary/20',
  pending:   'text-warning bg-warning/10 border-warning/20',
  suspended: 'text-warning bg-warning/10 border-warning/20',
  archived:  'text-muted-foreground bg-muted/20 border-border',
};
const STATUS_LABEL: Record<string, string> = {
  active: 'نشط', expired: 'منتهي', cancelled: 'ملغي',
  replaced: 'مستبدل', pending: 'معلق', suspended: 'موقوف', archived: 'مؤرشف',
};

const OP_LABEL: Record<string, { label: string; color: string }> = {
  activation:   { label: 'تفعيل',        color: 'text-success' },
  renewal:      { label: 'تجديد',         color: 'text-primary' },
  extension:    { label: 'تمديد',         color: 'text-primary' },
  suspension:   { label: 'تعليق',         color: 'text-warning' },
  unsuspension: { label: 'فك تعليق',      color: 'text-success' },
  cancellation: { label: 'إلغاء',         color: 'text-destructive' },
  reactivation: { label: 'إعادة تفعيل',  color: 'text-success' },
  replacement:  { label: 'استبدال',       color: 'text-primary' },
  archival:     { label: 'أرشفة',         color: 'text-muted-foreground' },
  restoration:  { label: 'استعادة',       color: 'text-success' },
  merge:        { label: 'دمج',           color: 'text-primary' },
};

// ── مكوّن العد التنازلي ──────────────────────────────────────────────────────
function CountdownTimer({ expiresAt }: { expiresAt: string | null | undefined }) {
  const [secs, setSecs] = useState(() => calcSecondsLeft(expiresAt));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    setSecs(calcSecondsLeft(expiresAt));
    timerRef.current = setInterval(() => setSecs(calcSecondsLeft(expiresAt)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [expiresAt]);
  if (!expiresAt) return <span className="text-muted-foreground">—</span>;
  const color = secs === 0 ? 'text-destructive' : secs < 86400 ? 'text-warning' : 'text-success';
  return (
    <span className={`font-mono font-bold text-sm flex items-center gap-1.5 ${color}`}>
      <Timer className="w-3.5 h-3.5 shrink-0" /> {fmtCountdown(secs)}
    </span>
  );
}

// ── Dialog التعليق ────────────────────────────────────────────────────────────
const SUSPEND_REASONS = ['عدم السداد', 'مراجعة البيانات', 'طلب من العميل', 'مخالفة'];
function SuspendDialog({ open, onClose, onConfirm, saving }: {
  open: boolean; onClose: () => void;
  onConfirm: (reason: string) => void; saving: boolean;
}) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom]     = useState('');
  const reason = selected === 'أخرى' ? custom : selected;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pause className="w-4 h-4 text-warning" /> تعليق الاشتراك</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">اختر سبب التعليق:</p>
          <div className="grid grid-cols-2 gap-2">
            {SUSPEND_REASONS.map(r => (
              <button key={r} onClick={() => setSelected(r)}
                className={`text-sm px-3 py-2 rounded-xl border text-right transition-colors ${selected === r ? 'border-warning bg-warning/10 text-warning' : 'border-border hover:border-warning/50'}`}>
                {r}
              </button>
            ))}
            <button onClick={() => setSelected('أخرى')}
              className={`text-sm px-3 py-2 rounded-xl border text-right col-span-2 transition-colors ${selected === 'أخرى' ? 'border-warning bg-warning/10 text-warning' : 'border-border hover:border-warning/50'}`}>
              أخرى (اكتب سبباً مخصصاً)
            </button>
          </div>
          {selected === 'أخرى' && (
            <Textarea placeholder="اكتب السبب..." value={custom} onChange={e => setCustom(e.target.value)}
              className="text-sm resize-none" rows={2} />
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="default" disabled={!reason || saving}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            onClick={() => reason && onConfirm(reason)}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Pause className="w-3.5 h-3.5 ml-1" />}
            تعليق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog الإلغاء ────────────────────────────────────────────────────────────
function CancelDialog({ open, onClose, onConfirm, saving }: {
  open: boolean; onClose: () => void;
  onConfirm: (reason: string) => void; saving: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Ban className="w-4 h-4 text-destructive" /> إلغاء الاشتراك</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">لن يتم حذف البيانات. ستتحول الحالة إلى ملغي.</p>
          <Textarea placeholder="سبب الإلغاء..." value={reason} onChange={e => setReason(e.target.value)}
            className="text-sm resize-none" rows={3} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>تراجع</Button>
          <Button variant="destructive" disabled={!reason.trim() || saving}
            onClick={() => reason.trim() && onConfirm(reason.trim())}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Ban className="w-3.5 h-3.5 ml-1" />}
            تأكيد الإلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog استعادة الأرشيف ────────────────────────────────────────────────────
function RestoreDialog({ open, onClose, onConfirm, archived, current, saving }: {
  open: boolean; onClose: () => void;
  onConfirm: (subId: string, mode: 'restore_only' | 'restore_and_cancel_current' | 'merge') => void;
  archived: Subscription[]; current: Subscription | null; saving: boolean;
}) {
  const [selectedSub, setSelectedSub] = useState<string>('');
  const [mode, setMode] = useState<'restore_only' | 'restore_and_cancel_current' | 'merge'>('restore_only');
  const sub = archived.find(s => s.id === selectedSub);
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Undo2 className="w-4 h-4 text-primary" /> استعادة اشتراك مؤرشف</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          {current && (
            <div className="p-3 rounded-xl border border-warning/20 bg-warning/5">
              <p className="text-xs font-semibold text-warning mb-1">الاشتراك الحالي</p>
              <p className="text-xs text-muted-foreground">الكود: {(current as Subscription & { code_used?: string | null }).code_used ?? '—'}</p>
              <p className="text-xs text-muted-foreground">ينتهي: {fmt(current.expires_at)}</p>
            </div>
          )}
          {archived.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد اشتراكات مؤرشفة</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">اختر الاشتراك المؤرشف:</p>
                {archived.map(s => (
                  <button key={s.id} onClick={() => setSelectedSub(s.id)}
                    className={`w-full text-right p-3 rounded-xl border text-xs transition-colors ${selectedSub === s.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                    <div className="flex justify-between">
                      <span className="font-mono font-bold">{(s as Subscription & { code_used?: string | null }).code_used ?? 'بدون كود'}</span>
                      <span className="text-muted-foreground">{fmt(s.archived_at ?? s.updated_at)}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">انتهى: {fmt(s.expires_at)} | {s.replace_reason ?? '—'}</p>
                  </button>
                ))}
              </div>
              {selectedSub && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">اختر نوع الاستعادة:</p>
                  {[
                    { value: 'restore_only', label: 'استعادة فقط', desc: 'استعادة الاشتراك المؤرشف بدون التأثير على الحالي' },
                    { value: 'restore_and_cancel_current', label: 'استعادة وإلغاء الحالي', desc: 'استعادة القديم وإلغاء الاشتراك الحالي' },
                    { value: 'merge', label: 'استعادة ودمج', desc: 'دمج المدتين واختيار الأطول' },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => setMode(opt.value as typeof mode)}
                      className={`w-full text-right p-3 rounded-xl border text-xs transition-colors ${mode === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                      <p className="font-semibold">{opt.label}</p>
                      <p className="text-muted-foreground">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              )}
              {sub && (
                <div className="p-3 rounded-xl border border-border bg-muted/20 text-xs space-y-1">
                  <p className="font-semibold text-foreground">تفاصيل الاشتراك المؤرشف:</p>
                  <p className="text-muted-foreground">الكود: {(sub as Subscription & { code_used?: string | null }).code_used ?? '—'}</p>
                  <p className="text-muted-foreground">تاريخ الانتهاء: {fmt(sub.expires_at)}</p>
                  {sub.replace_reason && <p className="text-muted-foreground">سبب الأرشفة: {sub.replace_reason}</p>}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button disabled={!selectedSub || saving} onClick={() => onConfirm(selectedSub, mode)}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Undo2 className="w-3.5 h-3.5 ml-1" />}
            استعادة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════
// المكوّن الرئيسي
// ══════════════════════════════════════════════════════════════════
export default function AdminUserSubscription() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile: adminProfile } = useAuth();

  const [detail,   setDetail]   = useState<UserDetail | null>(null);
  const [history,  setHistory]  = useState<SubscriptionHistoryEntry[]>([]);
  const [ops,      setOps]      = useState<SubscriptionOperation[]>([]);
  const [archived, setArchived] = useState<Subscription[]>([]);
  const [allSubs,  setAllSubs]  = useState<Subscription[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [renewDays,  setRenewDays]  = useState('30');
  const [extendDate, setExtendDate] = useState('');
  const [reactivateDays, setReactivateDays] = useState('30');
  const [showOps,  setShowOps]  = useState(false);
  const [showAllSubs, setShowAllSubs] = useState(false);

  // dialogs
  const [suspendOpen,  setSuspendOpen]  = useState(false);
  const [cancelOpen,   setCancelOpen]   = useState(false);
  const [restoreOpen,  setRestoreOpen]  = useState(false);
  const [confirmData, setConfirmData] = useState<{
    open: boolean; title: string; desc?: string;
    action: () => Promise<void>; variant?: 'default' | 'destructive';
  }>({ open: false, title: '', action: async () => {} });

  const adminName = adminProfile?.full_name ?? adminProfile?.username ?? adminProfile?.email ?? 'الإدارة';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, h, o, arch, all] = await Promise.all([
        getUserDetail(id),
        getSubscriptionHistory(id),
        getSubscriptionOperations(id),
        getArchivedSubscriptions(id),
        getAllUserSubscriptions(id),
      ]);
      setDetail(d); setHistory(h); setOps(o); setArchived(arch); setAllSubs(all);
      if (d.subscription?.expires_at) setExtendDate(d.subscription.expires_at.slice(0, 10));
    } catch { toast.error('فشل تحميل بيانات الاشتراك'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (fn: () => Promise<{ success: boolean; error?: string }>, successMsg: string) => {
    setSaving(true);
    try {
      const res = await fn();
      if (res.success) { toast.success(successMsg); await load(); }
      else toast.error(res.error ?? 'فشلت العملية');
    } finally { setSaving(false); }
  };

  const runConfirm = (
    title: string, desc: string,
    fn: () => Promise<{ success: boolean; error?: string }>,
    successMsg: string,
    variant: 'default' | 'destructive' = 'default',
  ) => {
    setConfirmData({
      open: true, title, desc, variant,
      action: async () => {
        setSaving(true);
        try {
          const res = await fn();
          if (res.success) { toast.success(successMsg); await load(); }
          else toast.error(res.error ?? 'فشلت العملية');
        } finally { setSaving(false); setConfirmData(p => ({ ...p, open: false })); }
      },
    });
  };

  const copy = (v: string, label: string) => {
    navigator.clipboard.writeText(v).then(() => toast.success(`تم نسخ ${label}`));
  };

  if (loading) return (
    <AdminShell title="إدارة الاشتراك"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'المستخدمون', href: '/admin' }, { label: '...' }, { label: 'الاشتراك' }]}>
      <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl bg-muted" />)}</div>
    </AdminShell>
  );

  if (!detail) return (
    <AdminShell title="مستخدم غير موجود"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'خطأ' }]}>
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground">لم يُعثر على البيانات</p>
        <Button onClick={() => navigate('/admin')} variant="outline">العودة</Button>
      </div>
    </AdminShell>
  );

  const { profile, subscription, license_code } = detail;
  const username   = profile.full_name || profile.username || profile.email || 'مستخدم';
  const isSuspended = subscription?.status === 'suspended';
  const isCancelled = subscription?.status === 'cancelled';
  const isExpired   = subscription?.status === 'expired';
  const isActive    = subscription?.status === 'active';
  const canSuspend  = isActive;
  const canUnsuspend = isSuspended;
  const canCancel   = !!subscription && !isCancelled;
  const canReactivate = isCancelled || isExpired || subscription?.status === 'replaced';

  const subExt = subscription as (Subscription & { suspend_reason?: string | null; cancel_reason?: string | null; code_used?: string | null }) | null;

  return (
    <AdminShell
      title={`اشتراك — ${username}`}
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/admin' },
        { label: 'المستخدمون', href: '/admin' },
        { label: username, href: `/admin/users/${id}` },
        { label: 'الاشتراك' },
      ]}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="h-8 gap-1 text-xs" disabled={loading}>
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/users/${id}`)} className="h-8 gap-1 text-xs">
            <User className="w-3.5 h-3.5" /> صفحة المستخدم
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-10">

        {/* ── PHASE 1: معلومات المستخدم المرتبط بالكود ── */}
        <SectionCard title="المستخدم المرتبط" icon={User}>
          <div className="flex items-center gap-4 flex-wrap">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} className="w-14 h-14 rounded-full object-cover border-2 border-border shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center shrink-0">
                <User className="w-7 h-7 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-bold text-base">{username}</p>
              <p className="text-xs text-muted-foreground">{profile.email ?? '—'}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${profile.is_active ? 'text-success bg-success/10 border-success/20' : 'text-destructive bg-destructive/10 border-destructive/20'}`}>
                {profile.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {profile.is_active ? 'حساب نشط' : 'حساب موقوف'}
              </span>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-border overflow-hidden divide-y divide-border/50">
            <div className="flex items-center justify-between px-3 py-2.5 gap-2">
              <span className="text-xs text-muted-foreground">ID المستخدم</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono truncate max-w-[150px]">{profile.id}</span>
                <button onClick={() => copy(profile.id, 'ID')} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {profile.email && (
              <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> البريد</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs truncate max-w-[150px]">{profile.email}</span>
                  <button onClick={() => copy(profile.email!, 'البريد')} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
            {profile.phone && (
              <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> الهاتف</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono">{profile.phone}</span>
                  <button onClick={() => copy(profile.phone!, 'الهاتف')} className="text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => navigate(`/admin/users/${id}`)}>
              <ExternalLink className="w-3.5 h-3.5" /> فتح صفحة المستخدم
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => copy(profile.id, 'ID')}>
              <Copy className="w-3.5 h-3.5" /> نسخ ID
            </Button>
            {profile.email && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => copy(profile.email!, 'البريد')}>
                <Mail className="w-3.5 h-3.5" /> نسخ البريد
              </Button>
            )}
            {profile.phone && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => copy(profile.phone!, 'الهاتف')}>
                <Phone className="w-3.5 h-3.5" /> نسخ الهاتف
              </Button>
            )}
          </div>
        </SectionCard>

        {/* ── معلومات الاشتراك الحالي ── */}
        <SectionCard title="الاشتراك الحالي" icon={CreditCard}>
          {subscription ? (
            <>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${STATUS_STYLES[subscription.status] ?? STATUS_STYLES.expired}`}>
                  {STATUS_LABEL[subscription.status] ?? subscription.status}
                </span>
                {/* PHASE 13: العد التنازلي الحقيقي */}
                {subscription.expires_at && (
                  <CountdownTimer expiresAt={subscription.expires_at} />
                )}
              </div>
              {/* PHASE 7: رسالة التعليق */}
              {isSuspended && subExt?.suspend_reason && (
                <div className="mb-4 p-3 rounded-xl border border-warning/30 bg-warning/5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-warning">الاشتراك معلق حالياً</p>
                    <p className="text-xs text-muted-foreground mt-0.5">السبب: {subExt.suspend_reason}</p>
                  </div>
                </div>
              )}
              {isCancelled && subExt?.cancel_reason && (
                <div className="mb-4 p-3 rounded-xl border border-destructive/30 bg-destructive/5 flex items-start gap-2">
                  <Info className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-destructive">سبب الإلغاء</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{subExt.cancel_reason}</p>
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
                <InfoRow label="كود التفعيل" value={license_code ?? subExt?.code_used ?? '—'} copyable />
                <InfoRow label="تاريخ البداية" value={fmt(subscription.activated_at || subscription.created_at)} />
                <InfoRow label="تاريخ الانتهاء" value={fmt(subscription.expires_at)} />
                <InfoRow label="كروت مشحونة (ناجحة)" value={String(detail.total_cards ?? 0)} />
                <InfoRow label="حد الاشتراك" value={detail.ops_limit == null ? 'غير محدود ♾️' : String(detail.ops_limit)} />
                <InfoRow label="العمليات المتبقية" value={
                  detail.ops_limit == null ? 'غير محدود ♾️'
                  : String(Math.max(0, detail.ops_limit - (subscription.ops_count ?? 0)))
                } />
                <InfoRow label="آخر عملية" value={fmt(detail.last_operation?.performed_at)} />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 py-8 text-muted-foreground justify-center flex-col">
              <XCircle className="w-10 h-10" />
              <p className="text-sm">لا يوجد اشتراك نشط لهذا المستخدم</p>
            </div>
          )}
        </SectionCard>

        {/* ── PHASE 14: الأزرار الرئيسية ── */}
        <SectionCard title="إجراءات الاشتراك" icon={Edit3}>
          <div className="space-y-4">

            {/* تجديد */}
            <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-success shrink-0" />
                <p className="text-sm font-semibold">تجديد الاشتراك</p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <Input type="number" value={renewDays} onChange={e => setRenewDays(e.target.value)}
                  className="text-sm w-24 text-center" placeholder="30" />
                <Label className="text-xs text-muted-foreground">يوم</Label>
                <Button size="sm" variant="default" className="h-9 text-xs gap-1 mr-auto"
                  disabled={saving}
                  onClick={() => runConfirm(
                    'تأكيد التجديد',
                    `تجديد اشتراك ${username} بـ ${renewDays} يوم إضافي`,
                    () => renewSubscriptionPro(id!, Number(renewDays), adminProfile?.id, adminName),
                    `تم تجديد الاشتراك بـ ${renewDays} يوم`,
                  )}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} تجديد
                </Button>
              </div>
            </div>

            {/* تمديد */}
            <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm font-semibold">تمديد حتى تاريخ محدد</p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <Input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)} className="text-sm" />
                <Button size="sm" variant="outline" className="h-9 text-xs gap-1 border-border shrink-0"
                  disabled={saving || !extendDate}
                  onClick={() => runConfirm(
                    'تأكيد التمديد',
                    `تمديد اشتراك ${username} حتى ${extendDate}`,
                    () => extendSubscriptionPro(id!, extendDate, adminProfile?.id, adminName),
                    'تم تمديد الاشتراك',
                  )}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />} تمديد
                </Button>
              </div>
            </div>

            {/* إعادة التفعيل */}
            {canReactivate && (
              <div className="p-4 rounded-xl border border-success/20 bg-success/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-success shrink-0" />
                  <p className="text-sm font-semibold text-success">إعادة تفعيل الاشتراك</p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <Input type="number" value={reactivateDays} onChange={e => setReactivateDays(e.target.value)}
                    className="text-sm w-24 text-center" placeholder="30" />
                  <Label className="text-xs text-muted-foreground">يوم</Label>
                  <Button size="sm" className="h-9 text-xs gap-1 mr-auto bg-success hover:bg-success/90 text-white"
                    disabled={saving}
                    onClick={() => runConfirm(
                      'إعادة التفعيل',
                      `إعادة تفعيل اشتراك ${username} لمدة ${reactivateDays} يوم`,
                      () => reactivateSubscriptionPro(id!, Number(reactivateDays), adminProfile?.id, adminName),
                      'تم إعادة تفعيل الاشتراك',
                    )}>
                    <Play className="w-3 h-3" /> إعادة تفعيل
                  </Button>
                </div>
              </div>
            )}

            {/* صف أزرار الإجراءات */}
            <div className="flex flex-wrap gap-2 pt-1">
              {canSuspend && (
                <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 border-warning/40 text-warning hover:bg-warning/10"
                  disabled={saving} onClick={() => setSuspendOpen(true)}>
                  <Pause className="w-3.5 h-3.5" /> تعليق الاشتراك
                </Button>
              )}
              {canUnsuspend && (
                <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 border-success/40 text-success hover:bg-success/10"
                  disabled={saving}
                  onClick={() => runConfirm('فك التعليق', `إعادة تفعيل اشتراك ${username} بعد التعليق`,
                    () => unsuspendSubscriptionPro(id!, adminProfile?.id, adminName), 'تم فك التعليق')}>
                  <Play className="w-3.5 h-3.5" /> فك التعليق
                </Button>
              )}
              {canCancel && (
                <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={saving} onClick={() => setCancelOpen(true)}>
                  <Ban className="w-3.5 h-3.5" /> إلغاء الاشتراك
                </Button>
              )}
              {subscription && !isExpired && !isCancelled && (
                <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 border-muted text-muted-foreground hover:bg-muted/20"
                  disabled={saving}
                  onClick={() => runConfirm('أرشفة الاشتراك', 'نقل الاشتراك للأرشيف دون حذف',
                    () => archiveSubscriptionPro(id!, subscription.id, 'أرشفة يدوية', adminProfile?.id, adminName),
                    'تم نقل الاشتراك للأرشيف')}>
                  <Archive className="w-3.5 h-3.5" /> أرشفة
                </Button>
              )}
              {archived.length > 0 && (
                <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  disabled={saving} onClick={() => setRestoreOpen(true)}>
                  <Undo2 className="w-3.5 h-3.5" /> استعادة مؤرشف ({archived.length})
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5"
                onClick={() => navigate(`/admin/users/${id}/subscription-history`)}>
                <History className="w-3.5 h-3.5" /> سجل الاشتراكات
              </Button>
            </div>
          </div>
        </SectionCard>

        {/* ── PHASE 3: سجل الاشتراكات الاحترافي ── */}
        <SectionCard title={`سجل الاشتراكات (${history.length})`} icon={History}>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">لا يوجد سجل اشتراكات</p>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 5).map((h, i) => (
                <div key={h.id} className={`p-3 rounded-xl border transition-colors ${i === 0 ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/10'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      {h.code && <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{h.code}</span>}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[h.status] ?? STATUS_STYLES.expired}`}>
                        {STATUS_LABEL[h.status] ?? h.status}
                      </span>
                      {i === 0 && <span className="text-[10px] font-bold text-primary">الحالي</span>}
                      {h.operation_type && (
                        <span className={`text-[10px] font-medium ${OP_LABEL[h.operation_type]?.color ?? 'text-muted-foreground'}`}>
                          [{OP_LABEL[h.operation_type]?.label ?? h.operation_type}]
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{fmt(h.created_at)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div><p className="text-[10px] text-muted-foreground">البداية</p><p className="text-xs font-medium">{fmt(h.activated_at)}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">النهاية</p><p className="text-xs font-medium">{fmt(h.expires_at)}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">المدة</p><p className="text-xs font-medium">{h.duration_days} يوم</p></div>
                    {h.end_reason && <div><p className="text-[10px] text-muted-foreground">السبب</p><p className="text-xs font-medium">{h.end_reason}</p></div>}
                    {h.suspend_reason && <div><p className="text-[10px] text-muted-foreground">سبب التعليق</p><p className="text-xs font-medium text-warning">{h.suspend_reason}</p></div>}
                    {h.cancel_reason && <div><p className="text-[10px] text-muted-foreground">سبب الإلغاء</p><p className="text-xs font-medium text-destructive">{h.cancel_reason}</p></div>}
                    {h.performed_by_name && <div><p className="text-[10px] text-muted-foreground">نفّذ بواسطة</p><p className="text-xs font-medium">{h.performed_by_name}</p></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── PHASE 16: سجل جميع العمليات ── */}
        <SectionCard
          title={`سجل العمليات (${ops.length})`}
          icon={Activity}
          actions={
            <button onClick={() => setShowOps(v => !v)} className="text-muted-foreground hover:text-foreground">
              {showOps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          }
        >
          {showOps ? (
            ops.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">لا توجد عمليات مسجّلة</p>
            ) : (
              <div className="space-y-2">
                {ops.map(op => {
                  const opCfg = OP_LABEL[op.operation_type] ?? { label: op.operation_type, color: 'text-muted-foreground' };
                  return (
                    <div key={op.id} className="p-3 rounded-xl border border-border bg-muted/10">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[op.operation_type === 'cancellation' ? 'cancelled' : op.operation_type === 'suspension' ? 'suspended' : 'active'] ?? 'border-border text-muted-foreground'}`}>
                            {opCfg.label}
                          </span>
                          {op.code && <span className="text-xs font-mono text-muted-foreground">{op.code}</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{fmt(op.performed_at)}</span>
                      </div>
                      {op.reason && <p className="text-xs text-muted-foreground mt-1.5">السبب: {op.reason}</p>}
                      {op.performed_by_name && <p className="text-[10px] text-muted-foreground mt-0.5">بواسطة: {op.performed_by_name}</p>}
                      {(op.expires_before || op.expires_after) && (
                        <div className="flex gap-4 mt-1.5">
                          {op.expires_before && <span className="text-[10px] text-muted-foreground">قبل: {fmt(op.expires_before)}</span>}
                          {op.expires_after && <span className="text-[10px] text-muted-foreground">بعد: {fmt(op.expires_after)}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground py-2 text-center cursor-pointer" onClick={() => setShowOps(true)}>
              اضغط لعرض {ops.length} عملية مسجّلة
            </p>
          )}
        </SectionCard>

        {/* ── كل اشتراكات المستخدم ── */}
        {allSubs.length > 1 && (
          <SectionCard
            title={`كل الاشتراكات (${allSubs.length})`}
            icon={ArrowRightLeft}
            actions={
              <button onClick={() => setShowAllSubs(v => !v)} className="text-muted-foreground hover:text-foreground">
                {showAllSubs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            }
          >
            {showAllSubs ? (
              <div className="space-y-2">
                {allSubs.map((s, i) => {
                  const sExt = s as Subscription & { code_used?: string | null; is_archived?: boolean };
                  const isReplaced = s.status === 'replaced';
                  return (
                    <div key={s.id} className={`p-3 rounded-xl border ${i === 0 ? 'border-primary/20 bg-primary/5' : 'border-border'}`}>
                      <div className="flex items-center gap-2 flex-wrap justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          {sExt.code_used && <span className="text-xs font-mono font-bold text-primary">{sExt.code_used}</span>}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[s.status] ?? 'border-border text-muted-foreground'}`}>
                            {STATUS_LABEL[s.status] ?? s.status}
                          </span>
                          {sExt.is_archived && <span className="text-[10px] bg-muted/30 border border-border text-muted-foreground px-2 py-0.5 rounded-full font-medium">مؤرشف</span>}
                          {i === 0 && <span className="text-[10px] text-primary font-bold">الأحدث</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{fmt(s.expires_at)}</span>
                          {isReplaced && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1 border-primary/40 text-primary hover:bg-primary/10 px-2"
                              disabled={saving}
                              onClick={() => runConfirm(
                                'استعادة الاشتراك المستبدل',
                                `سيتم إلغاء الاشتراك الحالي واستعادة الكود "${sExt.code_used ?? s.id.slice(0, 8)}" بنفس الأيام المتبقية.`,
                                () => restoreReplacedSubscription(id!, s.id, adminProfile?.id, adminName),
                                'تم استعادة الاشتراك المستبدل بنجاح',
                              )}>
                              <Undo2 className="w-3 h-3" /> استعادة
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2 text-center cursor-pointer" onClick={() => setShowAllSubs(true)}>
                اضغط لعرض {allSubs.length} اشتراك
              </p>
            )}
          </SectionCard>
        )}

      </div>

      {/* Dialogs */}
      <SuspendDialog
        open={suspendOpen} onClose={() => setSuspendOpen(false)}
        saving={saving}
        onConfirm={reason => runAction(
          () => suspendSubscriptionPro(id!, reason, adminProfile?.id, adminName),
          'تم تعليق الاشتراك'
        ).then(() => setSuspendOpen(false))}
      />
      <CancelDialog
        open={cancelOpen} onClose={() => setCancelOpen(false)}
        saving={saving}
        onConfirm={reason => runAction(
          () => cancelSubscriptionPro(id!, reason, adminProfile?.id, adminName),
          'تم إلغاء الاشتراك'
        ).then(() => setCancelOpen(false))}
      />
      <RestoreDialog
        open={restoreOpen} onClose={() => setRestoreOpen(false)}
        archived={archived} current={subscription}
        saving={saving}
        onConfirm={(subId, mode) => runAction(
          () => restoreArchivedSubscription(id!, subId, mode, adminProfile?.id, adminName),
          'تم استعادة الاشتراك'
        ).then(() => setRestoreOpen(false))}
      />
      <ConfirmDialog
        open={confirmData.open}
        onOpenChange={v => !v && setConfirmData(p => ({ ...p, open: false }))}
        title={confirmData.title}
        description={confirmData.desc}
        variant={confirmData.variant}
        onConfirm={confirmData.action}
      />
    </AdminShell>
  );
}
