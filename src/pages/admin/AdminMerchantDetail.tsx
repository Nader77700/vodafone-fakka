// صفحة تفاصيل التاجر الكاملة — Phase 4
// Additive Only — لا تعدّل أي نظام قائم
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2, RefreshCw, Copy, CheckCircle,
  Users, Zap, Clock, CreditCard, Shield, Link2,
  ToggleLeft, ToggleRight, RotateCcw, Loader2,
  XCircle, CheckCircle2, Timer, AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import AdminShell, { SectionCard, ConfirmDialog } from '@/components/admin/AdminShell';
import {
  getMerchantDetail,
  updateMerchantStatusAdmin,
  updateMerchantInviteStatus,
  regenerateInviteCode,
  generateMerchantInviteLink,
} from '@/lib/api';
import AdminMerchantWallet from '@/components/admin/AdminMerchantWallet';
import MerchantControlCenter from '@/components/admin/MerchantControlCenter';
import type { MerchantDetail, MerchantStatus } from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  active:    { label: 'نشط',    cls: 'bg-success/10 text-success border-success/20' },
  suspended: { label: 'موقوف', cls: 'bg-warning/10 text-warning border-warning/20' },
  disabled:  { label: 'معطل',  cls: 'bg-muted text-muted-foreground border-border' },
  blocked:   { label: 'محظور', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
  deleted:   { label: 'محذوف', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
};

function MerchantStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cfg.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
      {cfg.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color = '' }: {
  icon: React.ElementType; label: string; value: React.ReactNode; color?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card p-4 text-center">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-1 ${color || 'bg-primary/10'}`}>
        <Icon className={`w-4 h-4 ${color ? '' : 'text-primary'}`} />
      </div>
      <p className="text-lg font-black tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

export default function AdminMerchantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile: adminProfile } = useAuth();

  const [detail, setDetail]     = useState<MerchantDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [copied, setCopied]     = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDesc, setConfirmDesc]   = useState('');
  const [confirmVariant, setConfirmVariant] = useState<'default' | 'destructive'>('default');
  const [pendingAction, setPendingAction]   = useState<(() => Promise<void>) | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const d = await getMerchantDetail(id);
    setDetail(d);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const ask = (title: string, desc: string, action: () => Promise<void>, variant: 'default' | 'destructive' = 'default') => {
    setConfirmTitle(title);
    setConfirmDesc(desc);
    setConfirmVariant(variant);
    setPendingAction(() => action);
    setConfirmOpen(true);
  };

  const runConfirm = async () => {
    if (!pendingAction) return;
    setSaving(true);
    try { await pendingAction(); await load(); } finally { setSaving(false); setConfirmOpen(false); }
  };

  if (loading) {
    return (
      <AdminShell
        title="تفاصيل التاجر"
        breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'التجار', href: '/admin' }, { label: 'تحميل…' }]}
      >
        <div className="space-y-4 p-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      </AdminShell>
    );
  }

  if (!detail) {
    return (
      <AdminShell
        title="تفاصيل التاجر"
        breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'التجار', href: '/admin' }, { label: 'غير موجود' }]}
      >
        <div className="py-20 text-center space-y-2 p-4">
          <XCircle className="w-10 h-10 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">لم يتم العثور على بيانات التاجر</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>رجوع</Button>
        </div>
      </AdminShell>
    );
  }

  const inviteLink = generateMerchantInviteLink(detail.invite_code);

  const MERCHANT_STATUS_ACTIONS: { status: MerchantStatus; label: string; variant?: 'destructive' }[] = [
    { status: 'active',    label: 'تفعيل' },
    { status: 'suspended', label: 'إيقاف مؤقت' },
    { status: 'disabled',  label: 'تعطيل' },
    { status: 'blocked',   label: 'حظر', variant: 'destructive' },
  ];

  return (
    <AdminShell
      title={`تاجر: ${detail.name}`}
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/admin' },
        { label: 'التجار' },
        { label: detail.name },
      ]}
      actions={
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={load} disabled={saving}>
          <RefreshCw className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} /> تحديث
        </Button>
      }
    >
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* ── رأس البطاقة ── */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black truncate">{detail.name}</h2>
                <MerchantStatusBadge status={detail.status} />
              </div>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{detail.id}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span>📅 أُنشئ: <b className="text-foreground">{fmt(detail.created_at)}</b></span>
            <span>🕒 آخر تحديث: <b className="text-foreground">{fmt(detail.updated_at)}</b></span>
          </div>
        </div>

        {/* ── بيانات المالك ── */}
        {detail.owner_profile && (
          <SectionCard title="معلومات المالك" icon={Shield}>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'الاسم',         val: detail.owner_profile.full_name ?? detail.owner_profile.username ?? '—' },
                { label: 'اسم المستخدم',  val: detail.owner_profile.username ? `@${detail.owner_profile.username}` : '—' },
                { label: 'البريد',        val: detail.owner_profile.email ?? '—' },
                { label: 'الهاتف',        val: detail.owner_profile.phone ?? '—' },
                { label: 'الدور',         val: detail.owner_profile.role },
                { label: 'آخر دخول',     val: fmt(detail.owner_profile.last_sign_in_at) },
                { label: 'تسجيل',         val: fmt(detail.owner_profile.created_at) },
                { label: 'الحساب',        val: detail.owner_profile.is_active ? '✅ نشط' : '❌ معطل' },
              ].map(({ label, val }) => (
                <div key={label} className="rounded-xl bg-muted/60 p-2">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="font-semibold text-foreground truncate">{val}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── الإحصائيات ── */}
        <SectionCard title="الإحصائيات" icon={Zap}>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            <StatCard icon={Users}        label="المستخدمون"       value={detail.stats?.total_users ?? 0}   color="bg-primary/10" />
            <StatCard icon={CheckCircle2} label="نشطون"            value={detail.stats?.active_users ?? 0}  color="bg-success/10" />
            <StatCard icon={XCircle}      label="موقوفون"          value={detail.stats?.blocked_users ?? 0} color="bg-destructive/10" />
            <StatCard icon={Zap}          label="النقاط الكلية"    value={detail.total_points} />
            <StatCard icon={CreditCard}   label="النقاط المستخدمة" value={detail.used_points} />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <StatCard icon={Clock}      label="العمليات" value={detail.ops_count} />
            <StatCard icon={CreditCard} label="الرصيد"   value={`${detail.balance ?? 0} ج`} />
          </div>
        </SectionCard>

        {/* ── رابط الدعوة ── */}
        <SectionCard title="رابط الدعوة" icon={Link2}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">حالة الدعوة:</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
              detail.invite_status === 'active'
                ? 'bg-success/10 text-success border-success/20'
                : detail.invite_status === 'disabled'
                ? 'bg-muted text-muted-foreground border-border'
                : 'bg-destructive/10 text-destructive border-destructive/20'
            }`}>
              {detail.invite_status === 'active' ? '✅ مفعّل' : detail.invite_status === 'disabled' ? '⛔ معطل' : '⏱ منتهي'}
            </span>
            <span className="text-xs text-muted-foreground mr-auto">
              {detail.invite_enabled ? '🟢 يعمل' : '🔴 مغلق'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5 mb-3">
            <p className="flex-1 min-w-0 text-[11px] font-mono text-muted-foreground break-all">{inviteLink}</p>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink);
                setCopied(true);
                toast.success('تم نسخ رابط الدعوة ✅');
                setTimeout(() => setCopied(false), 2500);
              }}>
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {detail.invite_status !== 'active' && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-success border-success/30" disabled={saving}
                onClick={() => ask('تفعيل رابط الدعوة', 'سيتم تفعيل الرابط ويمكن للمستخدمين الانضمام به.', async () => {
                  const r = await updateMerchantInviteStatus(detail.id, 'active', adminProfile?.id);
                  if (r.success) toast.success('تم تفعيل رابط الدعوة');
                  else toast.error(r.error ?? 'خطأ');
                })}>
                <ToggleRight className="w-3.5 h-3.5" /> تفعيل
              </Button>
            )}
            {detail.invite_status === 'active' && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={saving}
                onClick={() => ask('تعطيل رابط الدعوة', 'أي محاولة دخول بالرابط ستُرفض.', async () => {
                  const r = await updateMerchantInviteStatus(detail.id, 'disabled', adminProfile?.id);
                  if (r.success) toast.success('تم تعطيل رابط الدعوة');
                  else toast.error(r.error ?? 'خطأ');
                })}>
                <ToggleLeft className="w-3.5 h-3.5" /> تعطيل
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-warning border-warning/30" disabled={saving}
              onClick={() => ask('إنهاء صلاحية الرابط', 'سيُصبح الرابط منتهي الصلاحية.', async () => {
                const r = await updateMerchantInviteStatus(detail.id, 'expired', adminProfile?.id);
                if (r.success) toast.success('تم إنهاء صلاحية الرابط');
                else toast.error(r.error ?? 'خطأ');
              }, 'destructive')}>
              <Timer className="w-3.5 h-3.5" /> إنهاء
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-primary border-primary/30" disabled={saving}
              onClick={() => ask('إعادة توليد الرابط', 'سيُبطل الرابط القديم فوراً ويعمل الجديد فقط.', async () => {
                const r = await regenerateInviteCode(detail.id);
                if (r.success) toast.success('تم توليد رابط جديد ✅');
                else toast.error(r.error ?? 'خطأ');
              })}>
              <RotateCcw className="w-3.5 h-3.5" /> تجديد
            </Button>
          </div>
        </SectionCard>

        {/* ── محفظة النقاط ── */}
        <AdminMerchantWallet merchantId={detail.id} adminId={adminProfile?.id} />

        {/* ── حالة التاجر ── */}
        <SectionCard title="إدارة حالة التاجر" icon={AlertTriangle}>
          <p className="text-xs text-muted-foreground mb-3">تغيير الحالة ينعكس فوراً على لوحة التاجر.</p>
          <div className="flex flex-wrap gap-2">
            {MERCHANT_STATUS_ACTIONS.filter(a => a.status !== detail.status).map(a => (
              <Button key={a.status} size="sm"
                variant={a.variant ?? 'outline'}
                className="h-8 gap-1.5"
                disabled={saving}
                onClick={() => ask(
                  `تغيير الحالة إلى: ${STATUS_CFG[a.status]?.label}`,
                  'هذا التغيير ينعكس فوراً على التاجر.',
                  async () => {
                    const r = await updateMerchantStatusAdmin(detail.id, a.status, adminProfile?.id);
                    if (r.success) toast.success(`تم تغيير الحالة إلى: ${STATUS_CFG[a.status]?.label}`);
                    else toast.error(r.error ?? 'خطأ');
                  },
                  a.variant ?? 'default',
                )}>
                {STATUS_CFG[a.status]?.label}
              </Button>
            ))}
          </div>
        </SectionCard>

        {/* ── مركز التحكم — Phase 10 ── */}
        <SectionCard title="مركز التحكم" icon={Shield}>
          <MerchantControlCenter
            merchantId={detail.id}
            adminId={adminProfile?.id ?? ''}
            onRefresh={load}
          />
        </SectionCard>

        {/* ConfirmDialog — uses correct AdminShell ConfirmDialogProps */}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmTitle}
          description={confirmDesc}
          variant={confirmVariant}
          onConfirm={runConfirm}
        />
      </div>
    </AdminShell>
  );
}
