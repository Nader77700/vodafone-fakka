// صفحة تفاصيل التاجر الكاملة — Owner Controls + Phase 4 + Phase 2 Fix
// Additive Only — لا تعدّل أي نظام قائم
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2, RefreshCw, Copy, CheckCircle,
  Users, Zap, CreditCard, Shield, Link2,
  Lock, Unlock, RotateCcw, Loader2,
  XCircle, CheckCircle2, AlertTriangle,
  UserX, UserCheck, ArrowRightLeft,
  Settings, Hash, Image as ImageIcon,
  BookOpen, ClipboardList, Wallet, Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import AdminShell, { SectionCard, ConfirmDialog } from '@/components/admin/AdminShell';
import {
  getMerchantDetail,
  updateMerchantStatusAdmin,
  adminMerchantAction,
  adminSuspendAllMembers,
  adminResumeAllMembers,
  adminTransferMember,
  updateMerchantSettings,
  getActiveMerchantsList,
  getMerchantFull,
  merchantWalletRecharge,
  merchantWalletDeduct,
  getMerchantLedger,
  demoteToUser,
} from '@/lib/api';
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

// نوع موسّع لنتيجة get_merchant_detail الجديدة
interface MerchantDetailFull extends MerchantDetail {
  invite_locked_by_owner?: boolean;
  wallet?: {
    current_points: number;
    used_points: number;
    lifetime_purchased: number;
    lifetime_consumed: number;
    last_recharge_at: string | null;
    last_operation_at: string | null;
  };
  control_config?: {
    kill_switch: boolean;
    maintenance_mode: boolean;
    force_update: boolean;
    invite_enabled: boolean;
    invite_locked_by_owner: boolean;
    config_version: number;
  };
  invite?: {
    id: string;
    token: string;
    invite_code?: string;
    merchant_name?: string;
    apk_url?: string;
    apk_version?: string;
    status: string;
    view_count: number;
    join_count: number;
    invite_link: string;
    created_at: string;
  };
  ledger?: Array<{
    type: string;
    amount: number;
    balance_before: number;
    balance_after: number;
    reason: string;
    created_at: string;
  }>;
  audit?: Array<{
    action: string;
    admin_id: string;
    reason: string | null;
    created_at: string;
  }>;
}

export default function AdminMerchantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile: adminProfile } = useAuth();

  const [detail, setDetail]   = useState<MerchantDetailFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [copied, setCopied]   = useState(false);
  const [confirmOpen, setConfirmOpen]       = useState(false);
  const [confirmTitle, setConfirmTitle]     = useState('');
  const [confirmDesc, setConfirmDesc]       = useState('');
  const [confirmVariant, setConfirmVariant] = useState<'default' | 'destructive'>('default');
  const [pendingAction, setPendingAction]   = useState<(() => Promise<void>) | null>(null);

  const [ownerTab, setOwnerTab]               = useState<'settings' | 'invite' | 'members' | 'wallet' | 'transfer' | 'ledger'>('settings');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [brandColor, setBrandColor]           = useState('');
  const [welcomeMsg, setWelcomeMsg]           = useState('');
  const [welcomeInstructions, setWelcomeInstructions] = useState('');
  const [logoUrl, setLogoUrl]                 = useState('');
  const [maxUsers, setMaxUsers]               = useState('');
  const [walletAmt, setWalletAmt]             = useState('');
  const [walletReason, setWalletReason]       = useState('');
  const [walletAction, setWalletAction]       = useState<'recharge' | 'deduct'>('recharge');
  const [walletLoading, setWalletLoading]     = useState(false);
  const [allMerchants, setAllMerchants]       = useState<{ id: string; name: string }[]>([]);
  const [transferUserId, setTransferUserId]   = useState('');
  const [targetMerchant, setTargetMerchant]   = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [ledgerItems, setLedgerItems]         = useState<MerchantDetailFull['ledger']>([]);
  const [ledgerLoading, setLedgerLoading]     = useState(false);
  const [inviteBusy, setInviteBusy]           = useState(false);
  const settingsInitRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const d = await getMerchantDetail(id);
    setDetail(d as MerchantDetailFull);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!id || settingsInitRef.current) return;
    settingsInitRef.current = true;
    getMerchantFull(id).then(m => {
      if (!m) return;
      setBrandColor(m.brand_color ?? '');
      setWelcomeMsg(m.welcome_msg ?? '');
      setWelcomeInstructions(m.welcome_instructions ?? '');
      setLogoUrl(m.logo_url ?? '');
      setMaxUsers(m.max_users != null ? String(m.max_users) : '');
    });
    getActiveMerchantsList().then(list => setAllMerchants(list.filter(m => m.id !== id)));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadLedger = useCallback(async () => {
    if (!id) return;
    setLedgerLoading(true);
    const r = await getMerchantLedger(id, { limit: 20 });
    if (r.success && r.items) setLedgerItems(r.items as unknown as MerchantDetailFull['ledger']);
    setLedgerLoading(false);
  }, [id]);

  useEffect(() => { if (ownerTab === 'ledger') loadLedger(); }, [ownerTab, loadLedger]);

  const ask = (title: string, desc: string, action: () => Promise<void>, variant: 'default' | 'destructive' = 'default') => {
    setConfirmTitle(title); setConfirmDesc(desc); setConfirmVariant(variant);
    setPendingAction(() => action); setConfirmOpen(true);
  };
  const runConfirm = async () => {
    if (!pendingAction) return;
    setSaving(true);
    try { await pendingAction(); await load(); } finally { setSaving(false); setConfirmOpen(false); }
  };

  const handleInviteAction = async (action: 'invite_lock' | 'invite_unlock' | 'invite_regenerate' | 'invite_enable' | 'invite_disable') => {
    if (!id || !adminProfile?.id) return;
    setInviteBusy(true);
    const r = await adminMerchantAction(id, action, adminProfile.id, 'owner_control');
    setInviteBusy(false);
    if (r.success) { toast.success(r.message ?? 'تم تنفيذ الإجراء'); await load(); }
    else toast.error(r.error ?? 'خطأ في التنفيذ');
  };

  const handleSaveSettings = async () => {
    if (!id) return;
    setSettingsLoading(true);
    const r = await updateMerchantSettings({
      merchantId: id, brandColor: brandColor || null,
      welcomeMsg: welcomeMsg || null, logoUrl: logoUrl || null,
      maxUsers: maxUsers ? parseInt(maxUsers, 10) : null,
      welcomeInstructions: welcomeInstructions || null,
    });
    setSettingsLoading(false);
    if (r.success) { toast.success('تم حفظ الإعدادات ✅'); await load(); }
    else toast.error(r.error ?? 'خطأ في الحفظ');
  };

  const handleWalletAction = async () => {
    if (!id || !walletAmt) return;
    const amt = parseInt(walletAmt, 10);
    if (isNaN(amt) || amt <= 0) { toast.error('أدخل قيمة صحيحة'); return; }
    setWalletLoading(true);
    const fn = walletAction === 'recharge' ? merchantWalletRecharge : merchantWalletDeduct;
    const r = await fn(id, amt, walletReason || 'admin_direct', undefined, adminProfile?.id);
    setWalletLoading(false);
    if (r.success) {
      toast.success(walletAction === 'recharge' ? `تم إضافة ${amt} نقطة ✅` : `تم خصم ${amt} نقطة ✅`);
      setWalletAmt(''); setWalletReason(''); await load();
    } else toast.error(r.error ?? 'خطأ');
  };

  const handleTransferMember = async () => {
    if (!id || !transferUserId.trim() || !targetMerchant) { toast.error('أدخل معرف المستخدم والتاجر الهدف'); return; }
    setTransferLoading(true);
    const r = await adminTransferMember(transferUserId.trim(), id, targetMerchant, adminProfile?.id);
    setTransferLoading(false);
    if (r.success) { toast.success('تم نقل العضو بنجاح ✅'); setTransferUserId(''); setTargetMerchant(''); }
    else toast.error(r.error ?? 'خطأ في النقل');
  };

  if (loading) {
    return (
      <AdminShell title="تفاصيل التاجر" breadcrumbs={[{ label: 'الإدارة', href: '/admin' }, { label: 'التجار', href: '/admin' }, { label: 'تحميل…' }]}>
        <div className="space-y-4 p-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      </AdminShell>
    );
  }

  if (!detail) {
    return (
      <AdminShell title="تفاصيل التاجر" breadcrumbs={[{ label: 'الإدارة', href: '/admin' }, { label: 'التجار', href: '/admin' }, { label: 'غير موجود' }]}>
        <div className="py-20 text-center space-y-2 p-4">
          <XCircle className="w-10 h-10 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">لم يتم العثور على بيانات التاجر</p>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>رجوع</Button>
        </div>
      </AdminShell>
    );
  }

  const inviteCode   = detail.invite?.invite_code ?? detail.invite?.invite_link ?? detail.invite?.token ?? '';
  const inviteLink   = detail.invite?.invite_link ?? '';
  const inviteLocked = detail.invite_locked_by_owner ?? detail.control_config?.invite_locked_by_owner ?? false;

  // بناء رسالة واتساب للإدارة
  const buildAdminWhatsAppMsg = () => {
    const code    = inviteCode;
    const name    = detail.invite?.merchant_name ?? detail.name ?? '';
    const apkUrl  = detail.invite?.apk_url ?? '';
    const version = detail.invite?.apk_version ? ` (v${detail.invite.apk_version})` : '';
    return [
      '🎉 *دعوة للانضمام إلى Vodafone Fakka Premium*',
      '',
      name ? `التاجر: *${name}*` : '',
      '━━━━━━━━━━━━━━━━━━',
      `🔑 كود الدعوة: *${code}*`,
      '━━━━━━━━━━━━━━━━━━',
      apkUrl ? `📱 تحميل التطبيق${version}:` : '',
      apkUrl,
      '',
      '✅ أدخل الكود عند التسجيل وسيتم ربطك تلقائياً',
    ].filter(Boolean).join('\n');
  };

  const MERCHANT_STATUS_ACTIONS: { status: MerchantStatus; label: string; variant?: 'destructive' }[] = [
    { status: 'active',    label: 'تفعيل' },
    { status: 'suspended', label: 'إيقاف مؤقت' },
    { status: 'disabled',  label: 'تعطيل' },
    { status: 'blocked',   label: 'حظر', variant: 'destructive' },
  ];

  return (
    <AdminShell
      title={`تاجر: ${detail.name}`}
      breadcrumbs={[{ label: 'الإدارة', href: '/admin' }, { label: 'التجار' }, { label: detail.name }]}
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
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5 select-all">{detail.id}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span>📅 أُنشئ: <b className="text-foreground">{fmt(detail.created_at)}</b></span>
            <span>🕒 آخر تحديث: <b className="text-foreground">{fmt(detail.updated_at)}</b></span>
          </div>
          {detail.invite_code && (
            <div className="flex items-center gap-2 text-xs bg-muted/40 rounded-xl px-3 py-2">
              <span className="text-muted-foreground">Merchant Code:</span>
              <code className="font-mono font-bold text-foreground select-all">{detail.invite_code}</code>
            </div>
          )}
        </div>

        {/* ── المحفظة ── */}
        {detail.wallet && (
          <SectionCard title="المحفظة" icon={Wallet}>
            <div className="grid grid-cols-3 gap-3">
              <StatCard icon={Zap}          label="الرصيد الحالي"   value={detail.wallet.current_points}     color="bg-primary/10" />
              <StatCard icon={CreditCard}   label="المستهلكة"       value={detail.wallet.used_points}        color="bg-warning/10" />
              <StatCard icon={CheckCircle2} label="مجموع الشراء"    value={detail.wallet.lifetime_purchased} color="bg-success/10" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
              <span>آخر شحن: <b className="text-foreground">{fmt(detail.wallet.last_recharge_at)}</b></span>
              <span>آخر عملية: <b className="text-foreground">{fmt(detail.wallet.last_operation_at)}</b></span>
            </div>
          </SectionCard>
        )}

        {/* ── بيانات المالك ── */}
        {detail.owner_profile && (
          <SectionCard title="معلومات المالك" icon={Shield}>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'الاسم',        val: detail.owner_profile.full_name ?? detail.owner_profile.username ?? '—' },
                { label: 'اسم المستخدم', val: detail.owner_profile.username ? `@${detail.owner_profile.username}` : '—' },
                { label: 'البريد',       val: detail.owner_profile.email ?? '—' },
                { label: 'الهاتف',       val: detail.owner_profile.phone ?? '—' },
                { label: 'الدور',        val: detail.owner_profile.role },
                { label: 'الحساب',       val: detail.owner_profile.is_active ? '✅ نشط' : '❌ معطل' },
              ].map(({ label, val }) => (
                <div key={label} className="rounded-xl bg-muted/60 p-2">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="font-semibold text-foreground truncate">{val}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── الإحصائيات — من DB ── */}
        <SectionCard title="الإحصائيات" icon={Zap}>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            <StatCard icon={Users}        label="المستخدمون"       value={detail.stats?.total_users ?? 0}   color="bg-primary/10" />
            <StatCard icon={CheckCircle2} label="نشطون"            value={detail.stats?.active_users ?? 0}  color="bg-success/10" />
            <StatCard icon={XCircle}      label="معلّقون"          value={(detail.stats as Record<string, number>)?.pending_users ?? 0} color="bg-warning/10" />
            <StatCard icon={Zap}          label="النقاط الكلية"    value={detail.total_points} />
            <StatCard icon={CreditCard}   label="النقاط المستهلكة" value={detail.used_points} />
          </div>
        </SectionCard>

        {/* ── رابط الدعوة — Owner Controls ── */}
        <SectionCard title="رابط الدعوة" icon={Link2}>
          <div className="space-y-3">
            {inviteLocked && (
              <div className="flex items-center gap-2 bg-destructive/8 border border-destructive/20 rounded-xl px-3 py-2">
                <Lock className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive font-semibold">مقفل — التاجر لا يستطيع تغييره</p>
              </div>
            )}
            {/* كود الدعوة + أزرار المشاركة */}
            {inviteCode && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl p-3 min-w-0">
                  <Link2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <p className="text-sm font-black font-mono text-primary flex-1 min-w-0 select-all tracking-widest">{inviteCode}</p>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0"
                    onClick={async () => { await navigator.clipboard.writeText(inviteCode); setCopied(true); toast.success('تم نسخ الكود'); setTimeout(() => setCopied(false), 2000); }}>
                    {copied ? <CheckCircle className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm"
                    className="gap-1.5 h-8 text-xs bg-[#25D366] hover:bg-[#1da851] text-white border-0"
                    onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(buildAdminWhatsAppMsg())}`, '_blank')}>
                    <Share2 className="w-3.5 h-3.5" />
                    واتساب
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs"
                    onClick={async () => { await navigator.clipboard.writeText(buildAdminWhatsAppMsg()); toast.success('تم نسخ الرسالة'); }}>
                    <Copy className="w-3.5 h-3.5" />
                    نسخ الرسالة
                  </Button>
                </div>
              </div>
            )}
            {detail.invite && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-card border border-border rounded-xl p-2 text-center">
                  <p className="text-sm font-black">{detail.invite.join_count}</p>
                  <p className="text-[10px] text-muted-foreground">انضموا</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-2 text-center">
                  <p className="text-sm font-black">{detail.invite.view_count}</p>
                  <p className="text-[10px] text-muted-foreground">مشاهدة</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-2 text-center">
                  <Badge variant="outline" className={`text-[10px] ${detail.invite.status === 'active' ? 'text-success border-success/30' : 'text-warning border-warning/30'}`}>
                    {detail.invite.status === 'active' ? 'نشط' : 'معطل'}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">الحالة</p>
                </div>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {!inviteLocked ? (
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10" disabled={inviteBusy}
                  onClick={() => ask('قفل رابط الدعوة', 'سيتم تعطيل الرابط نهائياً. التاجر لن يستطيع تغييره.', () => handleInviteAction('invite_lock'), 'destructive')}>
                  <Lock className="w-3.5 h-3.5" /> قفل الرابط
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-success/40 text-success hover:bg-success/10" disabled={inviteBusy}
                  onClick={() => ask('فك قفل الرابط', 'سيتم إعادة تفعيل الرابط.', () => handleInviteAction('invite_unlock'))}>
                  <Unlock className="w-3.5 h-3.5" /> فك القفل
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={inviteBusy}
                onClick={() => ask('إعادة توليد الرابط', 'سيتم إنشاء رابط جديد وإبطال القديم نهائياً.', () => handleInviteAction('invite_regenerate'), 'destructive')}>
                <RotateCcw className="w-3.5 h-3.5" /> إعادة توليد
              </Button>
              {!inviteLocked && (detail.invite?.status === 'active' ? (
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-warning/40 text-warning hover:bg-warning/10" disabled={inviteBusy}
                  onClick={() => handleInviteAction('invite_disable')}>تعطيل مؤقت</Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-success/40 text-success hover:bg-success/10" disabled={inviteBusy}
                  onClick={() => handleInviteAction('invite_enable')}>تفعيل</Button>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* ── تغيير حالة التاجر ── */}
        <SectionCard title="تغيير الحالة" icon={Shield}>
          <div className="flex gap-2 flex-wrap">
            {MERCHANT_STATUS_ACTIONS.map(a => (
              <Button key={a.status} size="sm"
                variant={detail.status === a.status ? 'default' : a.variant ?? 'outline'}
                className="h-8 gap-1.5" disabled={saving || detail.status === a.status}
                onClick={() => ask(`تغيير الحالة: ${STATUS_CFG[a.status]?.label}`, 'ينعكس فوراً على التاجر.',
                  async () => {
                    const r = await updateMerchantStatusAdmin(detail.id, a.status, adminProfile?.id);
                    if (r.success) toast.success(`تم تغيير الحالة إلى: ${STATUS_CFG[a.status]?.label}`);
                    else toast.error(r.error ?? 'خطأ');
                  }, a.variant ?? 'default')}>
                {STATUS_CFG[a.status]?.label}
              </Button>
            ))}
          </div>
        </SectionCard>

        {/* ── تحويل إلى مستخدم عادي ── */}
        {detail.owner_profile?.id && (
          <SectionCard title="إجراءات المالك" icon={UserX}>
            <div className="space-y-3">
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning">
                  تحويل التاجر إلى مستخدم عادي سيوقف متجره مؤقتاً مع الإبقاء على كامل بياناته وأعضائه. يمكن إعادة الترقية لاحقاً.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full h-10 gap-2 border-warning/50 text-warning hover:bg-warning/10"
                disabled={saving}
                onClick={() =>
                  ask(
                    'تحويل إلى مستخدم عادي',
                    `سيتم تحويل "${detail.owner_profile?.username ?? detail.name}" إلى مستخدم عادي. بيانات المتجر تبقى محفوظة ويمكن استعادته لاحقاً.`,
                    async () => {
                      const r = await demoteToUser(detail.owner_profile!.id, adminProfile?.id);
                      if (r.success) {
                        toast.success('تم تحويل التاجر إلى مستخدم عادي ✅');
                      } else {
                        toast.error(r.error ?? 'فشل التحويل');
                      }
                    },
                    'destructive'
                  )
                }
              >
                <UserX className="w-4 h-4" />
                تحويل إلى مستخدم عادي
              </Button>
            </div>
          </SectionCard>
        )}

        {/* ── مركز التحكم ── */}
        <SectionCard title="مركز التحكم" icon={Shield}>
          <MerchantControlCenter merchantId={detail.id} adminId={adminProfile?.id ?? ''} onRefresh={load} />
        </SectionCard>

        {/* ── صلاحيات المالك ── */}
        <SectionCard title="صلاحيات المالك" icon={Settings}>
          <div className="flex gap-1 mb-4 overflow-x-auto whitespace-nowrap pb-1">
            {([
              { key: 'settings', label: 'الإعدادات',  icon: Settings },
              { key: 'wallet',   label: 'النقاط',     icon: Wallet },
              { key: 'members',  label: 'الأعضاء',    icon: Users },
              { key: 'transfer', label: 'نقل عضو',   icon: ArrowRightLeft },
              { key: 'ledger',   label: 'سجل النقاط', icon: BookOpen },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setOwnerTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                  ownerTab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          {ownerTab === 'settings' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <Hash className="w-3 h-3" /> لون البراند (HEX)
                  </label>
                  <div className="flex gap-2">
                    <Input value={brandColor} onChange={e => setBrandColor(e.target.value)} placeholder="#ffffff" className="h-9 text-sm font-mono" />
                    {brandColor && <div className="w-9 h-9 rounded-lg border border-border shrink-0" style={{ backgroundColor: brandColor }} />}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> رابط الشعار
                  </label>
                  <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">رسالة الترحيب</label>
                  <Input value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)} placeholder="مرحباً بك في..." className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <Users className="w-3 h-3" /> الحد الأقصى للمستخدمين
                  </label>
                  <Input type="number" min={1} value={maxUsers} onChange={e => setMaxUsers(e.target.value)} placeholder="غير محدود" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    تعليمات الاستخدام
                    <span className="text-[10px] text-muted-foreground/60 mr-1">(تظهر للعضو عند أول دخول)</span>
                  </label>
                  <textarea
                    value={welcomeInstructions}
                    onChange={e => setWelcomeInstructions(e.target.value)}
                    placeholder="أدخل التعليمات — كل سطر = بند واحد"
                    rows={5}
                    dir="rtl"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    سيتم إرسال التعليمات كـ Dialog لكل عضو — تحديثها يُعيد إظهار الـ Dialog تلقائياً.
                  </p>
                </div>
              </div>
              <Button className="w-full h-9 gap-2" onClick={handleSaveSettings} disabled={settingsLoading}>
                {settingsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                حفظ الإعدادات
              </Button>
            </div>
          )}

          {ownerTab === 'wallet' && (
            <div className="space-y-3">
              {detail.wallet && (
                <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 rounded-xl p-3">
                  <span>الرصيد الحالي: <b className="text-foreground">{detail.wallet.current_points} نقطة</b></span>
                  <span>المُستهلكة: <b className="text-foreground">{detail.wallet.used_points} نقطة</b></span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">منح أو خصم نقاط — يُسجّل في Ledger فوراً.</p>
              <div className="flex gap-2">
                <button onClick={() => setWalletAction('recharge')} className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${walletAction === 'recharge' ? 'bg-success/10 border-success/40 text-success' : 'border-border text-muted-foreground'}`}>+ إضافة</button>
                <button onClick={() => setWalletAction('deduct')} className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${walletAction === 'deduct' ? 'bg-destructive/10 border-destructive/40 text-destructive' : 'border-border text-muted-foreground'}`}>- خصم</button>
              </div>
              <Input type="number" min={1} value={walletAmt} onChange={e => setWalletAmt(e.target.value)} placeholder="عدد النقاط" className="h-9 text-sm" />
              <Input value={walletReason} onChange={e => setWalletReason(e.target.value)} placeholder="السبب (اختياري)" className="h-9 text-sm" />
              <Button className="w-full h-9 gap-2" variant={walletAction === 'deduct' ? 'destructive' : 'default'} onClick={handleWalletAction} disabled={walletLoading || !walletAmt}>
                {walletLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {walletAction === 'recharge' ? 'إضافة النقاط' : 'خصم النقاط'}
              </Button>
            </div>
          )}

          {ownerTab === 'members' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">إيقاف أو استئناف جميع الأعضاء النشطين دفعة واحدة.</p>
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning">إيقاف الكل يمنع جميع الأعضاء النشطين فوراً.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-10 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => ask('إيقاف جميع الأعضاء', `سيتم إيقاف جميع الأعضاء النشطين لـ "${detail.name}" فوراً.`,
                    async () => { const r = await adminSuspendAllMembers(detail.id, adminProfile?.id); if (r.success) toast.success(`تم إيقاف ${r.suspended_count ?? 0} عضو ✅`); else toast.error(r.error ?? 'خطأ'); }, 'destructive')}>
                  <UserX className="w-4 h-4" /> إيقاف الكل
                </Button>
                <Button variant="outline" className="h-10 gap-1.5 border-success/40 text-success hover:bg-success/10"
                  onClick={() => ask('استئناف جميع الأعضاء', `سيتم استئناف جميع الأعضاء الموقوفين لـ "${detail.name}".`,
                    async () => { const r = await adminResumeAllMembers(detail.id, adminProfile?.id); if (r.success) toast.success(`تم استئناف ${r.resumed_count ?? 0} عضو ✅`); else toast.error(r.error ?? 'خطأ'); })}>
                  <UserCheck className="w-4 h-4" /> استئناف الكل
                </Button>
              </div>
            </div>
          )}

          {ownerTab === 'transfer' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">نقل عضو من هذا التاجر إلى تاجر آخر. ستُلغى اشتراكاته الحالية.</p>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">معرف المستخدم (UUID)</label>
                <Input value={transferUserId} onChange={e => setTransferUserId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="h-9 text-sm font-mono" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">التاجر الهدف</label>
                {allMerchants.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">لا يوجد تجار نشطون آخرون</p>
                ) : (
                  <select value={targetMerchant} onChange={e => setTargetMerchant(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="">اختر تاجراً...</option>
                    {allMerchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
              </div>
              <Button className="w-full h-9 gap-2" variant="destructive"
                onClick={() => ask('نقل العضو', 'ستُلغى اشتراكات العضو الحالي ويُنشأ له سجل جديد.', handleTransferMember, 'destructive')}
                disabled={transferLoading || !transferUserId.trim() || !targetMerchant}>
                {transferLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                نقل العضو
              </Button>
            </div>
          )}

          {ownerTab === 'ledger' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">آخر 20 حركة في المحفظة</p>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={loadLedger} disabled={ledgerLoading}>
                  <RefreshCw className={`w-3 h-3 ${ledgerLoading ? 'animate-spin' : ''}`} /> تحديث
                </Button>
              </div>
              {ledgerLoading ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}</div>
              ) : !ledgerItems?.length ? (
                <div className="py-8 text-center">
                  <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">لا توجد حركات مسجّلة</p>
                </div>
              ) : (
                <div className="space-y-1.5 overflow-y-auto max-h-80">
                  {ledgerItems.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 bg-card border border-border rounded-xl px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${['recharge','refund','admin_grant'].includes(entry.type) ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                            {['recharge','refund','admin_grant'].includes(entry.type) ? `+ ${entry.type}` : `- ${entry.type}`}
                          </span>
                          <span className="text-xs font-black tabular-nums">{entry.amount}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{entry.reason ?? '—'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-mono text-muted-foreground">{entry.balance_before} → {entry.balance_after}</p>
                        <p className="text-[10px] text-muted-foreground">{fmt(entry.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* ── سجل التدقيق ── */}
        {detail.audit && detail.audit.length > 0 && (
          <SectionCard title="سجل التدقيق" icon={ClipboardList}>
            <div className="space-y-1.5">
              {detail.audit.map((entry, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-card border border-border rounded-xl px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold font-mono">{entry.action}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{entry.reason ?? '—'}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground shrink-0">{fmt(entry.created_at)}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={confirmTitle} description={confirmDesc} variant={confirmVariant} onConfirm={runConfirm} />
      </div>
    </AdminShell>
  );
}
