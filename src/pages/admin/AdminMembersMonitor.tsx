// ─── Phase 6 v2: Admin Members Monitor — Merchants First ─────────────────────
// الصفحة الرئيسية تعرض التجار فقط → ضغط على تاجر → تفاصيل مع Tabs
// بدون تعديل أي نظام أساسي — Merchant Module فقط
import { useState, useEffect, useCallback } from 'react';
import {
  Users, RefreshCw, Building2, AlertCircle, Zap, Calendar,
  TrendingUp, ArrowRight, Activity, CreditCard, Hash, Clock,
  UserCheck, UserX, Ban, ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  adminGetMerchantsOverview, adminGetMerchantDetail,
  type MerchantOverviewItem,
} from '@/lib/api';
import type { MerchantMember } from '@/types/types';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import MemberDetailSheet from '@/components/merchant/MemberDetailSheet';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM', { locale: ar }); } catch { return d; }
}
function num(n: unknown): number { return typeof n === 'number' ? n : Number(n ?? 0); }

const MERCHANT_STATUS_CLS: Record<string, string> = {
  active:    'bg-success/10 text-success border-success/20',
  suspended: 'bg-warning/10 text-warning border-warning/20',
  disabled:  'bg-muted text-muted-foreground border-border',
  inactive:  'bg-muted text-muted-foreground border-border',
};
const MERCHANT_STATUS_LABELS: Record<string, string> = {
  active: 'نشط', suspended: 'موقوف', disabled: 'معطل', inactive: 'غير نشط',
};
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

// ═══════════════════════════════════════════════════════════════════════════════
// بطاقة تاجر — نظرة عامة
// ═══════════════════════════════════════════════════════════════════════════════
function MerchantCard({
  merchant,
  onClick,
}: { merchant: MerchantOverviewItem; onClick: () => void }) {
  const brandColor = merchant.brand_color ?? '#E60000';
  const statsRow = [
    { label: 'الأعضاء',     val: num(merchant.member_count),    icon: Users },
    { label: 'العمليات',    val: num(merchant.operation_count), icon: Activity },
    { label: 'اشتراك نشط',  val: num(merchant.active_subs),     icon: CreditCard },
    { label: 'الأكواد',     val: num(merchant.code_count),      icon: Hash },
  ];

  return (
    <button
      onClick={onClick}
      className="w-full text-right rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all group"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border text-sm font-black"
          style={{ background: `${brandColor}15`, borderColor: `${brandColor}25`, color: brandColor }}
        >
          {merchant.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold truncate">{merchant.name}</p>
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
              MERCHANT_STATUS_CLS[merchant.status] ?? MERCHANT_STATUS_CLS.inactive
            )}>
              {MERCHANT_STATUS_LABELS[merchant.status] ?? merchant.status}
            </span>
          </div>
          {merchant.last_activity && (
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              آخر نشاط: {fmtDate(merchant.last_activity)}
            </p>
          )}
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
      </div>

      {/* Points row */}
      <div
        className="rounded-xl px-3 py-2 mb-3 flex items-center justify-between gap-2 border"
        style={{ background: `${brandColor}08`, borderColor: `${brandColor}15` }}
      >
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">الرصيد</p>
          <p className="text-sm font-black tabular-nums" style={{ color: brandColor }}>
            {num(merchant.current_balance).toLocaleString()}
          </p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">نقاط وردت</p>
          <p className="text-sm font-black tabular-nums text-success">
            {num(merchant.total_points_received).toLocaleString()}
          </p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">نقاط وُزّعت</p>
          <p className="text-sm font-black tabular-nums text-warning">
            {num(merchant.total_points_given).toLocaleString()}
          </p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">متبقية</p>
          <p className="text-sm font-black tabular-nums text-primary">
            {num(merchant.remaining_points).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-1">
        {statsRow.map(({ label, val, icon: Icon }) => (
          <div key={label} className="text-center">
            <Icon className="w-3 h-3 mx-auto text-muted-foreground mb-0.5" />
            <p className="text-xs font-black tabular-nums">{val}</p>
            <p className="text-[9px] text-muted-foreground leading-tight">{label}</p>
          </div>
        ))}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// تفاصيل تاجر — Tabs
// ═══════════════════════════════════════════════════════════════════════════════
function MerchantDetailView({
  merchantId,
  onBack,
  onRefreshList,
}: { merchantId: string; onBack: () => void; onRefreshList: () => void }) {
  const [loading, setLoading] = useState(true);
  const [detail,  setDetail]  = useState<Awaited<ReturnType<typeof adminGetMerchantDetail>> | null>(null);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await adminGetMerchantDetail(merchantId);
    setDetail(d);
    setLoading(false);
  }, [merchantId]);

  useEffect(() => { load(); }, [load]);

  const merchant  = detail?.merchant;
  const members   = (detail?.members ?? []) as MerchantMember[];
  const ops       = (detail?.operations   ?? []) as Record<string, unknown>[];
  const subs      = (detail?.subscriptions ?? []) as Record<string, unknown>[];
  const codes     = (detail?.codes ?? []) as Record<string, unknown>[];
  const brandColor = merchant?.brand_color ?? '#E60000';

  const openMember = (userId: string) => { setSelectedMember(userId); setSheetOpen(true); };

  if (loading) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={onBack}>
          <ChevronLeft className="w-3.5 h-3.5" /> رجوع
        </Button>
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 bg-muted rounded-xl" />)}
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={onBack}>
          <ChevronLeft className="w-3.5 h-3.5" /> رجوع
        </Button>
        <div className="py-12 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">لم يتم العثور على التاجر</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1 text-xs shrink-0" onClick={onBack}>
          <ChevronLeft className="w-3.5 h-3.5" /> رجوع
        </Button>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 border"
          style={{ background: `${brandColor}15`, borderColor: `${brandColor}25`, color: brandColor }}
        >
          {merchant.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{merchant.name}</p>
          <p className="text-[10px] text-muted-foreground">تفاصيل التاجر</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs shrink-0" onClick={load}>
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" dir="rtl">
        <div className="overflow-x-auto">
          <TabsList className="h-9 text-xs gap-1 whitespace-nowrap">
            <TabsTrigger value="overview"      className="text-xs px-2">نظرة عامة</TabsTrigger>
            <TabsTrigger value="members"       className="text-xs px-2">أعضاء ({members.length})</TabsTrigger>
            <TabsTrigger value="operations"    className="text-xs px-2">عمليات ({ops.length})</TabsTrigger>
            <TabsTrigger value="subscriptions" className="text-xs px-2">اشتراكات ({subs.length})</TabsTrigger>
            <TabsTrigger value="codes"         className="text-xs px-2">أكواد ({codes.length})</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'إجمالي الأعضاء', val: members.length, icon: Users, cls: 'text-primary', bg: 'bg-primary/10' },
              { label: 'العمليات',        val: ops.length,     icon: Activity, cls: 'text-success', bg: 'bg-success/10' },
              { label: 'اشتراكات نشطة',  val: subs.filter((s: Record<string, unknown>) => s.status === 'active').length,  icon: CreditCard, cls: 'text-success', bg: 'bg-success/10' },
              { label: 'اشتراكات منتهية', val: subs.filter((s: Record<string, unknown>) => s.status === 'expired').length, icon: Calendar,   cls: 'text-muted-foreground', bg: 'bg-muted' },
            ].map(({ label, val, icon: Icon, cls, bg }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-3 flex items-center gap-2">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', bg)}>
                  <Icon className={cn('w-4 h-4', cls)} />
                </div>
                <div>
                  <p className={cn('text-base font-black tabular-nums', cls)}>{val}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">بيانات التاجر</p>
            {[
              ['الحالة',      MERCHANT_STATUS_LABELS[merchant.status] ?? merchant.status],
              ['تاريخ الإنشاء', fmt(merchant.created_at)],
              ['الرصيد',       num(merchant.balance ?? 0).toLocaleString()],
              ['أقصى أعضاء',   merchant.max_users ?? 'غير محدد'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-semibold">{String(v)}</span>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Members ── */}
        <TabsContent value="members" className="mt-3">
          {members.length === 0 ? (
            <EmptyState label="لا يوجد أعضاء" />
          ) : (
            <div className="space-y-2">
              {members.map((m: MerchantMember) => (
                <button
                  key={m.member_id}
                  onClick={() => openMember(m.user_id ?? m.member_id)}
                  className="w-full text-right rounded-xl border border-border bg-card p-3 flex items-center gap-3 hover:border-primary/30 transition-colors group"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: `${brandColor}15`, color: brandColor }}
                  >
                    {(m.username ?? 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold truncate">{m.username ?? '—'}</p>
                      <span className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
                        MEMBER_STATUS_CLS[m.member_status] ?? MEMBER_STATUS_CLS.pending
                      )}>
                        {MEMBER_STATUS_LABELS[m.member_status] ?? m.member_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-warning" />{m.remaining_points ?? 0} نقطة
                      </span>
                      {m.phone && <span>{m.phone}</span>}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Operations ── */}
        <TabsContent value="operations" className="mt-3">
          {ops.length === 0 ? <EmptyState label="لا توجد عمليات" /> : (
            <div className="space-y-2">
              {ops.slice(0, 100).map((op: Record<string, unknown>, i) => (
                <div key={String(op.id ?? i)} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{String(op.operation_type ?? op.type ?? '—')}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt(String(op.created_at ?? ''))}</p>
                    </div>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0',
                      op.status === 'success' || op.status === 'completed'
                        ? 'bg-success/10 text-success border-success/20'
                        : op.status === 'failed'
                          ? 'bg-destructive/10 text-destructive border-destructive/20'
                          : 'bg-muted text-muted-foreground border-border'
                    )}>
                      {String(op.status ?? '—')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Subscriptions ── */}
        <TabsContent value="subscriptions" className="mt-3">
          {subs.length === 0 ? <EmptyState label="لا توجد اشتراكات" /> : (
            <div className="space-y-2">
              {subs.map((s: Record<string, unknown>, i) => (
                <div key={String(s.id ?? i)} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">
                        {fmtDate(String(s.start_date ?? ''))} ← {fmtDate(String(s.end_date ?? ''))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {num(s.ops_used)} / {num(s.ops_limit)} عملية
                      </p>
                    </div>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0',
                      s.status === 'active' ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'
                    )}>
                      {s.status === 'active' ? 'نشط' : s.status === 'expired' ? 'منتهي' : String(s.status ?? '—')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Codes ── */}
        <TabsContent value="codes" className="mt-3">
          {codes.length === 0 ? <EmptyState label="لا توجد أكواد" /> : (
            <div className="space-y-2">
              {codes.map((c: Record<string, unknown>, i) => (
                <div key={String(c.id ?? i)} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-mono font-bold">{String(c.code ?? '—')}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt(String(c.created_at ?? ''))}</p>
                    </div>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0',
                      c.is_used ? 'bg-muted text-muted-foreground border-border' : 'bg-success/10 text-success border-success/20'
                    )}>
                      {c.is_used ? 'مستخدم' : 'متاح'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* MemberDetailSheet */}
      {selectedMember && (
        <MemberDetailSheet
          open={sheetOpen}
          merchantId={merchant.id}
          userId={selectedMember}
          onClose={() => setSheetOpen(false)}
          onChanged={() => { load(); onRefreshList(); }}
        />
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-10 text-center">
      <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// الصفحة الرئيسية — Merchants First
// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminMembersMonitor() {
  const [merchants,       setMerchants]       = useState<MerchantOverviewItem[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    const data = await adminGetMerchantsOverview();
    setMerchants(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // ── تفاصيل تاجر مفتوح ─────────────────────────────────────────
  if (selectedMerchant) {
    return (
      <MerchantDetailView
        merchantId={selectedMerchant}
        onBack={() => setSelectedMerchant(null)}
        onRefreshList={loadList}
      />
    );
  }

  // ── الإحصائيات الإجمالية ──────────────────────────────────────
  const totalMembers   = merchants.reduce((s, m) => s + num(m.member_count), 0);
  const totalActiveSubs = merchants.reduce((s, m) => s + num(m.active_subs), 0);
  const totalOps       = merchants.reduce((s, m) => s + num(m.operation_count), 0);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">مراقبة التجار والأعضاء</h2>
          <p className="text-xs text-muted-foreground">
            {merchants.length} تاجر — {totalMembers} عضو
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={loadList}>
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'التجار',         val: merchants.length, icon: Building2, cls: 'text-primary',     bg: 'bg-primary/10' },
          { label: 'الأعضاء',         val: totalMembers,     icon: Users,    cls: 'text-success',     bg: 'bg-success/10' },
          { label: 'اشتراكات نشطة',   val: totalActiveSubs,  icon: CreditCard, cls: 'text-warning',  bg: 'bg-warning/10' },
          { label: 'إجمالي العمليات', val: totalOps,         icon: Activity, cls: 'text-primary',     bg: 'bg-primary/10' },
        ].map(({ label, val, icon: Icon, cls, bg }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3 flex items-center gap-2">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', bg)}>
              <Icon className={cn('w-4 h-4', cls)} />
            </div>
            <div className="min-w-0">
              <p className={cn('text-base font-black tabular-nums', cls)}>{val}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Merchants list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 bg-muted rounded-2xl" />)}
        </div>
      ) : merchants.length === 0 ? (
        <div className="py-14 text-center space-y-2">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
          <p className="text-sm text-muted-foreground">لا يوجد تجار مسجّلون بعد</p>
        </div>
      ) : (
        <div className="space-y-3">
          {merchants.map(m => (
            <MerchantCard
              key={m.id}
              merchant={m}
              onClick={() => setSelectedMerchant(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
