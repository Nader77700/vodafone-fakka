// لوحة تحكم التاجر — MerchantDashboard
// Phase 3: Users tab fully implemented
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, Zap,
  Settings, ChevronRight, Copy, CheckCircle,
  Building2, Clock, TrendingUp, Shield,
  LogOut, RefreshCw, Link2, Search, X as XIcon,
  UserCheck, UserX, Ban, RotateCcw, ChevronLeft, Info,
  Loader2, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useMerchant } from '@/contexts/MerchantContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  generateMerchantInviteLink,
  getMerchantUsersPaged, getMerchantUserStats, updateMerchantUserStatus,
  getMerchantWallet, getMerchantLedger,
  getMerchantMembersPaged, getMerchantMembersStats,
  activateMemberSubscription, renewMemberSubscription, setMemberStatus,
  cancelMemberSubscription, validateMerchantSubscriptionEligibility,
  updateMerchantSettings,
  type MerchantUsersResult,
} from '@/lib/api';
import type { Profile, MerchantUserStatus, MerchantWallet, MerchantLedgerEntry, MerchantMember, MemberStatsResult } from '@/types/types';
import MemberDetailSheet from '@/components/merchant/MemberDetailSheet';
import InviteManager from '@/components/merchant/InviteManager';
import MerchantOperationsTab from '@/components/merchant/MerchantOperationsTab';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'users' | 'subscriptions' | 'points' | 'operations' | 'settings' | 'invite';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview',       label: 'نظرة عامة',  icon: LayoutDashboard },
  { id: 'users',          label: 'المستخدمون', icon: Users },
  { id: 'subscriptions',  label: 'الاشتراكات', icon: CreditCard },
  { id: 'points',         label: 'النقاط',     icon: Zap },
  { id: 'operations',     label: 'العمليات',   icon: Clock },
  { id: 'invite',         label: 'رابط الدعوة', icon: Link2 },
  { id: 'settings',       label: 'الإعدادات',  icon: Settings },
];

// ─── Status helpers ────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<MerchantUserStatus, string> = {
  active:    'نشط',
  suspended: 'موقوف',
  blocked:   'محظور',
  pending:   'قيد الانتظار',
  disabled:  'معطل',
};
const STATUS_CLS: Record<MerchantUserStatus, string> = {
  active:    'bg-success/10 text-success border-success/20',
  suspended: 'bg-warning/10 text-warning border-warning/20',
  blocked:   'bg-destructive/10 text-destructive border-destructive/20',
  pending:   'bg-primary/10 text-primary border-primary/20',
  disabled:  'bg-muted text-muted-foreground border-border',
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function UserStatusBadge({ status }: { status: string }) {
  const s = (status ?? 'active') as MerchantUserStatus;
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold', STATUS_CLS[s] ?? STATUS_CLS.disabled)}>
      {STATUS_LABELS[s] ?? s}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    'bg-success/10 text-success border-success/20',
    suspended: 'bg-warning/10 text-warning border-warning/20',
    disabled:  'bg-muted text-muted-foreground border-border',
    blocked:   'bg-destructive/10 text-destructive border-destructive/20',
    deleted:   'bg-destructive/10 text-destructive border-destructive/20',
  };
  const labels: Record<string, string> = {
    active: 'نشط', suspended: 'موقوف', disabled: 'معطل', blocked: 'محظور', deleted: 'محذوف',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold', map[status] ?? map.disabled)}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── Placeholder Section ──────────────────────────────────────────────────────
function PlaceholderSection({ icon: Icon, title, desc }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Icon className="w-7 h-7 text-primary" />
      </div>
      <p className="text-base font-semibold text-foreground text-balance">{title}</p>
      <p className="text-sm text-muted-foreground max-w-xs text-pretty">{desc}</p>
      <Badge variant="outline" className="text-xs text-muted-foreground border-border mt-1">
        قريباً
      </Badge>
    </div>
  );
}

// ─── User Detail Sheet ────────────────────────────────────────────────────────
function UserDetailSheet({
  user, merchantId, open, onClose, onStatusChanged,
}: {
  user: Profile | null;
  merchantId: string;
  open: boolean;
  onClose: () => void;
  onStatusChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const changeStatus = async (s: MerchantUserStatus) => {
    if (!user) return;
    setBusy(true);
    const res = await updateMerchantUserStatus(merchantId, user.id, s);
    setBusy(false);
    if (res.success) {
      toast.success(`تم تغيير الحالة إلى: ${STATUS_LABELS[s]}`);
      onStatusChanged();
      onClose();
    } else {
      toast.error(res.error ?? 'فشل تغيير الحالة');
    }
  };

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-card" dir="rtl">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
              {(user.username ?? 'U').charAt(0).toUpperCase()}
            </div>
            {user.username ?? 'مستخدم'}
            <UserStatusBadge status={user.merchant_user_status ?? 'active'} />
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pt-4">
          {/* معلومات المستخدم */}
          <div className="rounded-xl bg-muted/50 p-3 space-y-2">
            {[
              { label: 'اسم المستخدم', val: user.username ?? '—' },
              { label: 'رقم الهاتف',   val: user.phone    ?? '—' },
              { label: 'مصدر التسجيل', val: user.registration_source ?? 'مباشر' },
              { label: 'تاريخ الانضمام', val: user.merchant_created_at
                  ? format(new Date(user.merchant_created_at), 'dd MMM yyyy', { locale: ar })
                  : format(new Date(user.created_at), 'dd MMM yyyy', { locale: ar }) },
              { label: 'آخر نشاط',     val: user.merchant_last_seen
                  ? format(new Date(user.merchant_last_seen), 'dd MMM yyyy HH:mm', { locale: ar })
                  : '—' },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-medium text-foreground">{val}</span>
              </div>
            ))}
          </div>

          {/* Placeholders */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'الاشتراك',   val: '—', cls: 'text-muted-foreground' },
              { label: 'النقاط',     val: '—', cls: 'text-muted-foreground' },
              { label: 'العمليات',   val: '—', cls: 'text-muted-foreground' },
            ].map(({ label, val, cls }) => (
              <div key={label} className="rounded-xl border border-border bg-muted/30 p-2.5 text-center">
                <p className={cn('text-sm font-bold', cls)}>{val}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* إجراءات الحالة */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">تغيير الحالة</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: 'تفعيل',   status: 'active'    as MerchantUserStatus, icon: UserCheck, cls: 'text-success border-success/30 hover:bg-success/10' },
                { label: 'إيقاف',   status: 'suspended' as MerchantUserStatus, icon: UserX,     cls: 'text-warning border-warning/30 hover:bg-warning/10' },
                { label: 'حظر',     status: 'blocked'   as MerchantUserStatus, icon: Ban,       cls: 'text-destructive border-destructive/30 hover:bg-destructive/10' },
                { label: 'استعادة', status: 'active'    as MerchantUserStatus, icon: RotateCcw, cls: 'text-primary border-primary/30 hover:bg-primary/10' },
              ] as const).filter(a => a.status !== (user.merchant_user_status ?? 'active') || a.label === 'استعادة')
                .map(({ label, status, icon: Icon, cls }) => (
                  <Button key={label} variant="outline" size="sm" disabled={busy}
                    className={cn('h-9 gap-1.5 text-xs', cls)}
                    onClick={() => changeStatus(status)}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                    {label}
                  </Button>
                ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab({ merchantId }: { merchantId: string }) {
  const [result,   setResult]   = useState<MerchantUsersResult | null>(null);
  const [stats,    setStats]    = useState({ total: 0, active: 0, suspended: 0, blocked: 0, pending: 0 });
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState<string>('all');
  const [page,     setPage]     = useState(1);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [memberSelected, setMemberSelected] = useState<string | null>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async (pg = page, q = search, st = status) => {
    setLoading(true);
    const [res, s] = await Promise.all([
      getMerchantUsersPaged(merchantId, {
        search:   q   || undefined,
        status:   st !== 'all' ? st : undefined,
        page:     pg,
        pageSize: 20,
      }),
      getMerchantUserStats(merchantId),
    ]);
    setResult(res);
    setStats(s);
    setLoading(false);
  }, [merchantId, page, search, status]);

  // initial + realtime
  useEffect(() => {
    load(1, '', 'all');
    // Realtime: listen for profile changes on this merchant's users
    const ch = supabase
      .channel(`merchant-users-${merchantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `merchant_id=eq.${merchantId}`,
      }, () => {
        load(page, search, status);
      })
      .subscribe();
    realtimeRef.current = ch;
    return () => { ch.unsubscribe(); };
  }, [merchantId]); // eslint-disable-line

  const handleSearch = (q: string) => { setSearch(q); setPage(1); load(1, q, status); };
  const handleStatus = (s: string)  => { setStatus(s); setPage(1); load(1, search, s); };
  const handlePage   = (p: number)  => { setPage(p);               load(p, search, status); };

  const statCards = [
    { label: 'الإجمالي',  val: stats.total,     cls: 'text-primary',     bg: 'bg-primary/10'     },
    { label: 'نشط',       val: stats.active,    cls: 'text-success',     bg: 'bg-success/10'     },
    { label: 'موقوف',     val: stats.suspended, cls: 'text-warning',     bg: 'bg-warning/10'     },
    { label: 'محظور',     val: stats.blocked,   cls: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'انتظار',    val: stats.pending,   cls: 'text-muted-foreground', bg: 'bg-muted'     },
  ];

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-2">
        {statCards.map(({ label, val, cls, bg }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-2 text-center">
            <p className={cn('text-sm md:text-base font-black tabular-nums', cls)}>{val}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="بحث باسم المستخدم أو رقم الهاتف…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="h-9 pr-9 pl-3 text-sm"
            dir="rtl"
          />
          {search && (
            <button onClick={() => handleSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={status} onValueChange={handleStatus}>
          <SelectTrigger className="w-28 h-9 text-xs shrink-0">
            <Filter className="w-3 h-3 ml-1" />
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="all">الكل</SelectItem>
            {(Object.keys(STATUS_LABELS) as MerchantUserStatus[]).map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* User list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 bg-muted rounded-xl" />)}
        </div>
      ) : !result || result.data.length === 0 ? (
        <div className="py-14 text-center space-y-2">
          <Users className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            {search || status !== 'all' ? 'لا توجد نتائج للبحث' : 'لا يوجد مستخدمون مرتبطون بحسابك بعد'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {result.data.map(u => (
            <button
              key={u.id}
              onClick={() => { setSelected(u); setMemberSelected(u.id); }}
              className="w-full rounded-xl border border-border bg-card p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-right"
            >
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {(u.username ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-semibold truncate">{u.username ?? '—'}</p>
                  <UserStatusBadge status={u.merchant_user_status ?? 'active'} />
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate">{u.phone ?? u.email ?? '—'}</p>
              </div>
              <div className="shrink-0 text-right space-y-0.5">
                <p className="text-[10px] text-muted-foreground">
                  {u.merchant_created_at
                    ? format(new Date(u.merchant_created_at), 'dd/MM/yy')
                    : format(new Date(u.created_at), 'dd/MM/yy')}
                </p>
                {u.registration_source === 'invite_link' && (
                  <p className="text-[10px] text-primary">رابط دعوة</p>
                )}
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {result && result.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1"
            disabled={page <= 1} onClick={() => handlePage(page - 1)}>
            <ChevronRight className="w-3.5 h-3.5" /> السابق
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page} / {result.pages}
          </span>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1"
            disabled={page >= result.pages} onClick={() => handlePage(page + 1)}>
            التالي <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* User detail sheet — legacy status changes */}
      <UserDetailSheet
        user={selected}
        merchantId={merchantId}
        open={!!selected && !memberSelected}
        onClose={() => { setSelected(null); setMemberSelected(null); }}
        onStatusChanged={() => load(page, search, status)}
      />

      {/* Phase 6: Full member detail with points + subscription + history */}
      <MemberDetailSheet
        userId={memberSelected}
        merchantId={merchantId}
        open={!!memberSelected}
        onClose={() => { setSelected(null); setMemberSelected(null); }}
        onChanged={() => load(page, search, status)}
      />
    </div>
  );
}

// ─── Invite Manager Tab — Phase 7 ────────────────────────────────────────────
function InviteManagerTab({ merchantId }: { merchantId: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Link2 className="w-4 h-4 text-primary" />
        <p className="text-sm font-bold">رابط الدعوة</p>
        <span className="text-xs text-muted-foreground">أرسل هذا الرابط لعملائك لينضموا إليك تلقائياً</span>
      </div>
      <InviteManager merchantId={merchantId} />
    </div>
  );
}

// ─── Subscriptions Tab ────────────────────────────────────────────────────────
// تفعيل/تجديد اشتراكات الأعضاء وإدارة حالاتهم مباشرةً
function SubscriptionsTab({ merchantId }: { merchantId: string }) {
  const [members, setMembers]   = useState<MerchantMember[]>([]);
  const [stats,   setStats]     = useState<MemberStatsResult | null>(null);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState('');
  const [page,    setPage]      = useState(1);
  const [total,   setTotal]     = useState(0);
  const [pages,   setPages]     = useState(1);
  // إجراء مفعّل
  const [actionUser,    setActionUser]    = useState<MerchantMember | null>(null);
  const [actionType,    setActionType]    = useState<'activate' | 'renew' | 'suspend' | 'resume' | 'cancel' | null>(null);
  const [days,          setDays]          = useState(30);
  const [points,        setPoints]        = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    const [res, st] = await Promise.all([
      getMerchantMembersPaged(merchantId, { search: search || undefined, page: pg, pageSize: 15 }),
      getMerchantMembersStats(merchantId),
    ]);
    setMembers(res.items);
    setTotal(res.total);
    setPages(res.pages);
    setPage(pg);
    setStats(st);
    setLoading(false);
  }, [merchantId, search]);

  useEffect(() => { load(1); }, [load]);

  const doAction = async () => {
    if (!actionUser || !actionType) return;
    setActionLoading(true);
    setValidationError(null);

    let res: { success: boolean; error?: string };

    // PHASE 9: Validation قبل التفعيل/التجديد
    if (actionType === 'activate' || actionType === 'renew') {
      const validation = await validateMerchantSubscriptionEligibility(
        merchantId, actionUser.user_id, days, points,
      );
      if (!validation.eligible) {
        setValidationError(validation.error ?? 'فشل التحقق من الأهلية');
        setActionLoading(false);
        return;
      }
    }

    if (actionType === 'activate') {
      res = await activateMemberSubscription(merchantId, actionUser.user_id, days, points);
    } else if (actionType === 'renew') {
      res = await renewMemberSubscription(merchantId, actionUser.user_id, days, points);
    } else if (actionType === 'suspend') {
      res = await setMemberStatus(merchantId, actionUser.user_id, 'suspended');
    } else if (actionType === 'cancel') {
      // PHASE 10: إلغاء الاشتراك
      res = await cancelMemberSubscription(merchantId, actionUser.user_id);
    } else {
      res = await setMemberStatus(merchantId, actionUser.user_id, 'active');
    }

    if (res.success) {
      toast.success(
        actionType === 'activate' ? 'تم تفعيل الاشتراك ✅' :
        actionType === 'renew'    ? 'تم تجديد الاشتراك ✅' :
        actionType === 'suspend'  ? 'تم تعليق الحساب ✅'  :
        actionType === 'cancel'   ? 'تم إلغاء الاشتراك ✅' :
                                    'تم استئناف الحساب ✅'
      );
      setActionUser(null); setActionType(null); setValidationError(null);
      load(page);
    } else {
      toast.error(res.error ?? 'فشلت العملية — أعد المحاولة');
    }
    setActionLoading(false);
  };

  const SUB_COLORS: Record<string, string> = {
    active:    'bg-success/10 text-success border-success/25',
    pending:   'bg-warning/10 text-warning border-warning/25',
    expired:   'bg-muted text-muted-foreground border-border',
    cancelled: 'bg-muted text-muted-foreground border-border',
    suspended: 'bg-destructive/10 text-destructive border-destructive/25',
    blocked:   'bg-destructive/10 text-destructive border-destructive/25',
  };
  const SUB_LABELS: Record<string, string> = {
    active: 'نشط', pending: 'انتظار', expired: 'منتهي',
    cancelled: 'ملغى', suspended: 'موقوف', blocked: 'محظور',
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* فاصل */}
      <div className="h-px bg-border" />

      {/* إحصائيات سريعة */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'نشط',    val: stats.active,    cls: 'text-success' },
            { label: 'انتظار', val: stats.pending,   cls: 'text-warning' },
            { label: 'المجموع', val: stats.total,    cls: 'text-foreground' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-3 text-center">
              <p className={`text-xl font-black ${s.cls}`}>{s.val}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* بحث */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="ابحث باسم المستخدم أو الهاتف…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-9 text-sm h-9"
        />
      </div>

      {/* قائمة الأعضاء */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl bg-muted" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground text-sm">
          لا يوجد أعضاء {search ? 'بهذا البحث' : 'بعد'}
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(m => {
            const statusKey = m.member_status ?? 'pending';
            const subKey    = m.sub_status    ?? 'pending';
            return (
              <div key={m.user_id}
                className="rounded-xl border border-border bg-card p-3 space-y-2">
                {/* رأس البطاقة */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-black text-primary">
                        {(m.username ?? '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{m.username ?? '—'}</p>
                      <p className="text-[10px] text-muted-foreground">{m.phone ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${SUB_COLORS[subKey] ?? SUB_COLORS.pending}`}>
                      {SUB_LABELS[subKey] ?? subKey}
                    </span>
                  </div>
                </div>

                {/* تفاصيل الاشتراك */}
                {(m.start_date || m.end_date || m.remaining_days > 0) && (
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground px-1">
                    {m.start_date && <span>من: {format(new Date(m.start_date), 'dd/MM/yyyy', { locale: ar })}</span>}
                    {m.end_date   && <span>إلى: {format(new Date(m.end_date), 'dd/MM/yyyy', { locale: ar })}</span>}
                    {m.remaining_days > 0 && (
                      <span className="text-success font-semibold">{m.remaining_days} يوم متبقي</span>
                    )}
                  </div>
                )}

                {/* أزرار الإجراءات */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/50">
                  {(subKey === 'pending' || subKey === 'expired' || subKey === 'cancelled' || !m.sub_status) && (
                    <Button size="sm" className="h-7 text-xs gap-1 px-2"
                      onClick={() => { setActionUser(m); setActionType('activate'); setDays(30); setPoints(0); setValidationError(null); }}>
                      <Zap className="w-3 h-3" /> تفعيل
                    </Button>
                  )}
                  {subKey === 'active' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2"
                      onClick={() => { setActionUser(m); setActionType('renew'); setDays(30); setPoints(0); setValidationError(null); }}>
                      <RefreshCw className="w-3 h-3" /> تجديد
                    </Button>
                  )}
                  {/* PHASE 10: زر إلغاء الاشتراك */}
                  {subKey === 'active' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2 text-destructive hover:text-destructive hover:border-destructive/50"
                      onClick={() => { setActionUser(m); setActionType('cancel'); setValidationError(null); }}>
                      <XIcon className="w-3 h-3" /> إلغاء الاشتراك
                    </Button>
                  )}
                  {statusKey === 'active' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2 text-warning hover:text-warning"
                      onClick={() => { setActionUser(m); setActionType('suspend'); setValidationError(null); }}>
                      <Ban className="w-3 h-3" /> تعليق
                    </Button>
                  )}
                  {statusKey === 'suspended' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2 text-success hover:text-success"
                      onClick={() => { setActionUser(m); setActionType('resume'); setValidationError(null); }}>
                      <CheckCircle className="w-3 h-3" /> استئناف
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => load(page - 1)}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground">{page}/{pages} — {total} عضو</span>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => load(page + 1)}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Action Dialog */}
      {actionUser && actionType && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4 w-full max-w-sm max-w-[calc(100%-2rem)]">
            <h3 className="text-sm font-black">
              {actionType === 'activate' ? `تفعيل اشتراك — ${actionUser.username}` :
               actionType === 'renew'    ? `تجديد اشتراك — ${actionUser.username}` :
               actionType === 'suspend'  ? `تعليق حساب — ${actionUser.username}` :
               actionType === 'cancel'   ? `إلغاء الاشتراك — ${actionUser.username}` :
                                           `استئناف حساب — ${actionUser.username}`}
            </h3>

            {(actionType === 'activate' || actionType === 'renew') && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">عدد الأيام</label>
                  <Input
                    type="number" min={1} max={365}
                    value={days}
                    onChange={e => { setDays(Number(e.target.value)); setValidationError(null); }}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">النقاط المخصصة</label>
                  <Input
                    type="number" min={0}
                    value={points}
                    onChange={e => { setPoints(Number(e.target.value)); setValidationError(null); }}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            )}

            {(actionType === 'suspend' || actionType === 'resume') && (
              <p className="text-xs text-muted-foreground">
                {actionType === 'suspend'
                  ? 'سيتم تعليق الحساب مؤقتاً — لن يتمكن المستخدم من الوصول.'
                  : 'سيتم استئناف الحساب وإتاحة الوصول مجدداً.'}
              </p>
            )}

            {/* PHASE 10: تأكيد الإلغاء */}
            {actionType === 'cancel' && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-destructive">سيتم إلغاء الاشتراك فوراً</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  سيُوقف وصول المستخدم لجميع خدمات الشحن وتغيير حالته إلى «انتظار».
                  لا يمكن التراجع عن هذا الإجراء إلا بتفعيل اشتراك جديد.
                </p>
              </div>
            )}

            {/* PHASE 9: رسالة خطأ التحقق */}
            {validationError && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive font-medium leading-relaxed">{validationError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className={cn('flex-1', actionType === 'cancel' && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground')}
                onClick={doAction}
                disabled={actionLoading}
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                  actionType === 'cancel' ? 'إلغاء الاشتراك نهائياً' : 'تأكيد'}
              </Button>
              <Button variant="outline" onClick={() => { setActionUser(null); setActionType(null); setValidationError(null); }}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Points Tab ───────────────────────────────────────────────────────────────
function PointsTab({ merchantId }: { merchantId: string }) {
  const [wallet, setWallet] = useState<MerchantWallet | null>(null);
  const [ledger, setLedger] = useState<MerchantLedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const TX_LABELS: Record<string, string> = {
    recharge: 'شحن', deduct: 'خصم', refund: 'إرجاع', adjustment: 'تعديل',
    subscription_bonus: 'مكافأة', admin_grant: 'منحة', admin_remove: 'إزالة', transfer_to_user: 'تحويل',
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [wRes, lRes] = await Promise.all([
      getMerchantWallet(merchantId),
      getMerchantLedger(merchantId, { limit: pageSize, offset: page * pageSize }),
    ]);
    if (wRes.success) setWallet(wRes.wallet ?? null);
    if (lRes.success) { setLedger(lRes.items ?? []); setTotal(lRes.total ?? 0); }
    setLoading(false);
  }, [merchantId, page]);

  useEffect(() => { load(); }, [load]);

  // Realtime: subscribe to merchant_wallets changes
  useEffect(() => {
    const ch = supabase
      .channel(`merchant-wallet-${merchantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'merchant_wallets',
        filter: `merchant_id=eq.${merchantId}`,
      }, () => { load(); })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'merchant_ledger',
        filter: `merchant_id=eq.${merchantId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [merchantId, load]);

  if (loading && !wallet) return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 bg-muted rounded-xl" />)}
    </div>
  );

  const pages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground">الرصيد الحالي</p>
          <p className="text-xl font-black tabular-nums text-primary">{wallet?.current_points ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground">المستخدم</p>
          <p className="text-xl font-black tabular-nums text-destructive">{wallet?.used_points ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground">الشهري</p>
          <p className="text-lg font-black tabular-nums">{wallet?.monthly_consumed ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground">اليومي</p>
          <p className="text-lg font-black tabular-nums">{wallet?.daily_consumed ?? 0}</p>
        </div>
      </div>

      {/* Last Operation */}
      <div className="rounded-xl border border-border bg-card p-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">آخر عملية</span>
        <span className="text-xs font-semibold">{wallet?.last_operation_at
          ? format(new Date(wallet.last_operation_at), 'dd MMM yyyy HH:mm', { locale: ar })
          : '—'}</span>
      </div>

      {/* Ledger */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-sm font-semibold mb-2">سجل العمليات ({total})</p>
        {ledger.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">لا توجد عمليات</p>
        ) : (
          <div className="space-y-2">
            {ledger.map(e => (
              <div key={e.id} className="flex items-center gap-2 text-xs border-b border-border/50 pb-2 last:border-0">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  e.amount > 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                }`}>
                  {e.amount > 0 ? '+' : ''}{e.amount}
                </span>
                <span className="text-muted-foreground">{TX_LABELS[e.type] ?? e.type}</span>
                <span className="mr-auto text-muted-foreground opacity-60">
                  {format(new Date(e.created_at), 'dd/MM HH:mm', { locale: ar })}
                </span>
              </div>
            ))}
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-2">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="w-3 h-3" />
            </Button>
            <span className="text-[10px] text-muted-foreground">{page + 1}/{pages}</span>
            <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronLeft className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ merchantId }: { merchantId: string }) {
  const [saving, setSaving]       = useState(false);
  const [brandColor, setBrandColor] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [logoUrl, setLogoUrl]       = useState('');
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    import('@/lib/api').then(({ getMerchantFull }) =>
      getMerchantFull(merchantId).then(m => {
        if (!m) return;
        setBrandColor(m.brand_color ?? '');
        setWelcomeMsg(m.welcome_msg ?? '');
        setLogoUrl(m.logo_url ?? '');
      }),
    );
  }, [merchantId]);

  const handleSave = async () => {
    setSaving(true);
    const r = await updateMerchantSettings({
      merchantId,
      brandColor: brandColor || null,
      welcomeMsg: welcomeMsg || null,
      logoUrl:    logoUrl    || null,
    });
    setSaving(false);
    if (r.success) toast.success('تم حفظ الإعدادات ✅');
    else toast.error(r.error ?? 'خطأ في الحفظ');
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-black">إعدادات الحساب التجاري</h3>
        <p className="text-xs text-muted-foreground">
          هذه الإعدادات تظهر للمستخدمين التابعين لك.
        </p>

        {/* لون البراند */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">لون البراند</label>
          <div className="flex items-center gap-2">
            <Input
              value={brandColor}
              onChange={e => setBrandColor(e.target.value)}
              placeholder="#ffffff"
              className="h-9 text-sm font-mono flex-1"
            />
            {brandColor && (
              <div
                className="w-9 h-9 rounded-lg border border-border shrink-0"
                style={{ backgroundColor: brandColor }}
              />
            )}
          </div>
        </div>

        {/* رسالة الترحيب */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">رسالة الترحيب</label>
          <Input
            value={welcomeMsg}
            onChange={e => setWelcomeMsg(e.target.value)}
            placeholder="مرحباً بك في متجرنا..."
            className="h-9 text-sm"
          />
        </div>

        {/* رابط الشعار */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">رابط الشعار (URL)</label>
          <Input
            value={logoUrl}
            onChange={e => setLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            className="h-9 text-sm"
          />
          {logoUrl && (
            <div className="flex items-center justify-center mt-1">
              <img
                src={logoUrl}
                alt="شعار التاجر"
                className="h-12 w-auto rounded-lg border border-border object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
        </div>

        <Button
          className="w-full h-9 gap-2"
          onClick={handleSave}
          disabled={saving}
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <CheckCircle className="w-4 h-4" />
          }
          حفظ الإعدادات
        </Button>
      </div>

      {/* معلومات القيود */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-bold text-muted-foreground">ملاحظة</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>لا يمكنك تعديل رابط الدعوة أو كود التاجر.</li>
          <li>تغيير الصلاحيات والحدود يتم من قِبل الإدارة فقط.</li>
          <li>لمزيد من الخيارات تواصل مع الإدارة.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { merchant, stats, loading } = useMerchant();
  const [copied, setCopied] = useState(false);
  const [wallet, setWallet] = useState<MerchantWallet | null>(null);

  useEffect(() => {
    if (!merchant?.id) return;
    getMerchantWallet(merchant.id).then(r => {
      if (r.success) setWallet(r.wallet ?? null);
    });
  }, [merchant?.id]);

  const inviteLink = merchant ? generateMerchantInviteLink(merchant.invite_code) : '';

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success('تم نسخ رابط الدعوة');
      setTimeout(() => setCopied(false), 2500);
    } catch { toast.error('تعذّر النسخ'); }
  };

  if (loading) return (
    <div className="space-y-4 pt-2">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 bg-muted rounded-xl" />)}
    </div>
  );

  if (!merchant) return (
    <div className="py-12 text-center text-muted-foreground text-sm">
      لا توجد بيانات متاحة
    </div>
  );

  const currentPoints = wallet?.current_points ?? (merchant.total_points - merchant.used_points);

  return (
    <div className="space-y-4">
      {/* Merchant Card */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground truncate">{merchant.name}</p>
              <p className="text-[10px] text-muted-foreground font-mono">{merchant.id.slice(0, 16)}…</p>
            </div>
          </div>
          <StatusBadge status={merchant.status} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'إجمالي المستخدمين', val: stats?.total_users ?? 0,   icon: Users,        cls: 'text-primary',     bg: 'bg-primary/10' },
          { label: 'مستخدمون نشطون',    val: stats?.active_users ?? 0,  icon: CheckCircle,  cls: 'text-success',     bg: 'bg-success/10' },
          { label: 'الرصيد الحالي',     val: currentPoints,              icon: Zap,          cls: 'text-warning',     bg: 'bg-warning/10' },
          { label: 'النقاط المستخدمة',  val: wallet?.used_points ?? merchant.used_points, icon: TrendingUp, cls: 'text-muted-foreground', bg: 'bg-muted' },
        ].map(({ label, val, icon: Icon, cls, bg }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-3 flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
              <Icon className={cn('w-4 h-4', cls)} />
            </div>
            <div className="min-w-0">
              <p className={cn('text-base font-black tabular-nums', cls)}>{val}</p>
              <p className="text-[10px] text-muted-foreground leading-tight text-pretty">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Invite Link — Phase 7: استبدال الرابط القديم بإحالة للتبويب الجديد */}
      <button
        onClick={() => {
          // الانتقال لتبويب رابط الدعوة الجديد (Phase 7)
          const tabEvent = new CustomEvent('merchant-tab-change', { detail: 'invite' });
          window.dispatchEvent(tabEvent);
        }}
        className="w-full rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3 hover:bg-primary/10 transition-colors text-right"
      >
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Link2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-primary">رابط الدعوة الجديد</p>
          <p className="text-[10px] text-muted-foreground">اضغط لعرض الرابط الآمن والإحصائيات</p>
        </div>
        <ChevronLeft className="w-4 h-4 text-primary shrink-0" />
      </button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function MerchantDashboard() {
  const { merchant, loading } = useMerchant();
  const { profile, signOut }  = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // استقبال حدث التنقل من OverviewTab (زر رابط الدعوة الجديد)
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent<Tab>).detail;
      setActiveTab(tab);
    };
    window.addEventListener('merchant-tab-change', handler);
    return () => window.removeEventListener('merchant-tab-change', handler);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">
                  {loading ? '…' : (merchant?.name ?? 'لوحة التاجر')}
                </p>
                <p className="text-[10px] text-muted-foreground">{profile?.username ?? profile?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => navigate('/home')}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => signOut()}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="max-w-2xl mx-auto px-2 overflow-x-auto">
          <div className="flex items-center gap-1 pb-2 whitespace-nowrap">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
                  activeTab === id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4">

        {/* RBAC Warning: suspended/blocked merchant */}
        {!loading && merchant && merchant.status !== 'active' && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive font-medium">
              حسابك التجاري في حالة «{merchant.status}» — بعض الميزات محدودة. تواصل مع الإدارة.
            </p>
          </div>
        )}

        {activeTab === 'overview'      && <OverviewTab />}
        {activeTab === 'users'         && merchant && <UsersTab merchantId={merchant.id} />}
        {activeTab === 'users'         && !merchant && <PlaceholderSection icon={Users} title="جارٍ التحميل…" desc="" />}
        {activeTab === 'subscriptions' && merchant && <SubscriptionsTab merchantId={merchant.id} />}
        {activeTab === 'subscriptions' && !merchant && <PlaceholderSection icon={CreditCard} title="جارٍ التحميل…" desc="" />}
        {activeTab === 'points'        && merchant && <PointsTab merchantId={merchant.id} />}
        {activeTab === 'points'        && !merchant && <PlaceholderSection icon={Zap} title="جارٍ التحميل…" desc="" />}
        {activeTab === 'operations'    && merchant && <MerchantOperationsTab merchantId={merchant.id} />}
        {activeTab === 'operations'    && !merchant && <PlaceholderSection icon={Clock} title="جارٍ التحميل…" desc="" />}
        {activeTab === 'invite'        && merchant && <InviteManagerTab merchantId={merchant.id} />}
        {activeTab === 'invite'        && !merchant && <PlaceholderSection icon={Link2} title="جارٍ التحميل…" desc="" />}
        {activeTab === 'settings'      && merchant && <SettingsTab merchantId={merchant.id} />}
        {activeTab === 'settings'      && !merchant && <PlaceholderSection icon={Settings} title="جارٍ التحميل…" desc="" />}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-2 flex items-center justify-between max-w-2xl mx-auto">
        <p className="text-[10px] text-muted-foreground">Vodafone Fakka Premium · Merchant Portal</p>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => window.location.reload()}>
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
      </div>
    </div>
  );
}
