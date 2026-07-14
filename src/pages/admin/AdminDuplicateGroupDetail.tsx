// صفحة تفاصيل مجموعة أجهزة مكررة — /admin/duplicate-accounts/:fp
// ─────────────────────────────────────────────────────────────────
// تعرض كل التفاصيل لمجموعة واحدة: الجهاز + الحسابات + جميع الإجراءات
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Smartphone, ShieldX, ShieldCheck, RefreshCw, Loader2,
  Users, AlertTriangle, Ban, Trash2, UserCheck,
  Phone, Hash, Calendar, Clock, ChevronLeft,
  Crown, Eye, Shield, CheckCircle2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import AdminShell, { ConfirmDialog, SectionCard } from '@/components/admin/AdminShell';
import {
  getDuplicateDevices,
  getDuplicateGroupProfiles,
  banDevice, unbanDevice,
  toggleUserActive,
  deleteUserComplete,
  banDuplicateAccounts,
  deleteDuplicateAccounts,
  type DuplicateDeviceGroup,
  type DuplicateGroupProfile,
} from '@/lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

// ─── مساعدات ────────────────────────────────────────────────────────────────
function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy · HH:mm', { locale: ar }); }
  catch { return d; }
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy', { locale: ar }); }
  catch { return d; }
}
function shortFp(fp?: string | null, len = 8) {
  if (!fp) return '—';
  return fp.length > len * 2 ? `${fp.slice(0, len)}…${fp.slice(-len)}` : fp;
}
function InfoItem({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs font-medium text-right break-all ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ─── بطاقة حساب واحد ─────────────────────────────────────────────────────────
interface AccountCardProps {
  profile: DuplicateGroupProfile;
  isPrimary: boolean;
  onSetPrimary: () => void;
  onBan: () => void;
  onUnban: () => void;
  onDelete: () => void;
  onView: () => void;
  actionLoading: string | null; // userId | null
}
function AccountCard({
  profile, isPrimary,
  onSetPrimary, onBan, onUnban, onDelete, onView,
  actionLoading,
}: AccountCardProps) {
  const isLoading = actionLoading === profile.id;
  const isActive  = profile.is_active;

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${
      isPrimary
        ? 'border-primary/50 bg-primary/5'
        : isActive
          ? 'border-border bg-card'
          : 'border-destructive/30 bg-destructive/5'
    }`}>
      {/* الرأس */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          isPrimary ? 'bg-primary/15' : isActive ? 'bg-muted' : 'bg-destructive/10'
        }`}>
          {isPrimary
            ? <Crown className="w-4 h-4 text-primary" />
            : isActive
              ? <Users className="w-4 h-4 text-muted-foreground" />
              : <Ban className="w-4 h-4 text-destructive" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm">{profile.username ?? '—'}</p>
            {isPrimary && (
              <Badge className="text-[9px] h-4 px-1.5 bg-primary/20 text-primary border-0">رئيسي</Badge>
            )}
            <Badge variant={isActive ? 'outline' : 'destructive'} className="text-[9px] h-4 px-1.5">
              {isActive ? 'نشط' : 'محظور'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {profile.email ?? '—'}
          </p>
        </div>
      </div>

      {/* تفاصيل */}
      <div className="space-y-1 mb-3 text-xs text-muted-foreground">
        {profile.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-3 h-3 shrink-0" />
            <span dir="ltr">{profile.phone}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar className="w-3 h-3 shrink-0" />
          <span>تسجيل: {fmtDate(profile.created_at)}</span>
        </div>
        {profile.app_version && (
          <div className="flex items-center gap-2">
            <Smartphone className="w-3 h-3 shrink-0" />
            <span>{profile.device_model ?? 'جهاز'} · {profile.app_version}</span>
          </div>
        )}
      </div>

      {/* أزرار الإجراءات */}
      <div className="flex flex-wrap gap-2">
        {/* عرض الملف */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 flex-1"
          onClick={onView}
          disabled={isLoading}
        >
          <Eye className="w-3 h-3" />
          عرض
        </Button>

        {/* تحديد كرئيسي */}
        {!isPrimary && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 flex-1 border-primary/30 text-primary hover:bg-primary/5"
            onClick={onSetPrimary}
            disabled={isLoading}
          >
            <Crown className="w-3 h-3" />
            رئيسي
          </Button>
        )}

        {/* حظر / رفع حظر الحساب */}
        {isActive ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 flex-1 border-orange-400/30 text-orange-500 hover:bg-orange-500/5"
            onClick={onBan}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
            حظر
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 flex-1 border-green-500/30 text-green-500 hover:bg-green-500/5"
            onClick={onUnban}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            رفع حظر
          </Button>
        )}

        {/* حذف */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 flex-1 border-destructive/30 text-destructive hover:bg-destructive/5"
          onClick={onDelete}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          حذف
        </Button>
      </div>
    </div>
  );
}

// ─── الصفحة الرئيسية ─────────────────────────────────────────────────────────
export default function AdminDuplicateGroupDetail() {
  const { fp }  = useParams<{ fp: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [group, setGroup]         = useState<DuplicateDeviceGroup | null>(
    (location.state as { group?: DuplicateDeviceGroup })?.group ?? null
  );
  const [profiles, setProfiles]   = useState<DuplicateGroupProfile[]>([]);
  const [primaryId, setPrimaryId] = useState<string>('');
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Confirm dialogs
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant?: 'destructive' | 'default';
    onConfirm: () => Promise<void>;
  }>({ open: false, title: '', description: '', onConfirm: async () => {} });

  // ── تحميل البيانات ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // إذا لم تُمرَّر البيانات → جلبها من API
      let currentGroup = group;
      if (!currentGroup && fp) {
        const decoded = decodeURIComponent(fp);
        const res = await getDuplicateDevices();
        if (res.success) {
          currentGroup = res.data.find(
            g => g.device_fp === decoded || g.hardware_hash === decoded || g.device_id === decoded
          ) ?? null;
          setGroup(currentGroup);
        }
      }
      if (!currentGroup) return;

      // جلب profiles
      const { data } = await getDuplicateGroupProfiles(currentGroup.user_ids);
      setProfiles(data);
      // الحساب الأقدم كـ primary افتراضياً
      if (!primaryId && data.length > 0) {
        const oldest = [...data].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0];
        setPrimaryId(oldest.id);
      }
    } catch {
      toast.error('فشل تحميل التفاصيل');
    } finally {
      setLoading(false);
    }
  }, [fp, group, primaryId]);

  useEffect(() => { load(); }, []);// eslint-disable-line

  // ── إجراءات الحساب الفردي ────────────────────────────────────────────────
  const handleBanAccount = async (userId: string) => {
    setActionLoading(userId);
    const res = await toggleUserActive(userId, false);
    setActionLoading(null);
    if (res.error) toast.error(typeof res.error === 'string' ? res.error : 'فشل الحظر');
    else { toast.success('تم حظر الحساب'); await load(); }
  };

  const handleUnbanAccount = async (userId: string) => {
    setActionLoading(userId);
    const res = await toggleUserActive(userId, true);
    setActionLoading(null);
    if (res.error) toast.error(typeof res.error === 'string' ? res.error : 'فشل رفع الحظر');
    else { toast.success('تم رفع الحظر'); await load(); }
  };

  const handleDeleteAccount = (userId: string, username: string) => {
    setConfirm({
      open: true,
      title: 'حذف الحساب نهائياً',
      description: `سيتم حذف حساب "${username}" بشكل نهائي. لا يمكن التراجع.`,
      variant: 'destructive',
      onConfirm: async () => {
        setActionLoading(userId);
        const res = await deleteUserComplete(userId);
        setActionLoading(null);
        if (!res.success) toast.error(res.error ?? 'فشل الحذف');
        else { toast.success('تم حذف الحساب'); await load(); }
      },
    });
  };

  // ── إجراءات الجهاز ──────────────────────────────────────────────────────
  const handleBanDevice = () => {
    if (!group) return;
    setConfirm({
      open: true,
      title: 'حظر الجهاز نهائياً',
      description: `سيُحظر هذا الجهاز حظراً نهائياً. لن يتمكن أي حساب من استخدامه.`,
      variant: 'destructive',
      onConfirm: async () => {
        setActionLoading('device');
        const res = await banDevice({
          device_fp: group.device_fp ?? undefined,
          device_id: group.device_id ?? undefined,
          hardware_hash: group.hardware_hash ?? undefined,
          ban_reason: 'حظر يدوي من الإدارة — أجهزة مكررة',
          ban_type: 'permanent',
          associated_user_ids: group.user_ids,
          associated_usernames: group.usernames,
        });
        setActionLoading(null);
        if (!res.success) toast.error(res.error ?? 'فشل حظر الجهاز');
        else { toast.success('تم حظر الجهاز نهائياً'); await load(); }
      },
    });
  };

  const handleUnbanDevice = () => {
    if (!group?.ban_info?.id) return;
    setConfirm({
      open: true,
      title: 'رفع حظر الجهاز',
      description: 'سيتم رفع حظر هذا الجهاز وإعادة تفعيله.',
      variant: 'default',
      onConfirm: async () => {
        setActionLoading('device');
        const res = await unbanDevice(group.ban_info!.id!);
        setActionLoading(null);
        if (!res.success) toast.error(res.error ?? 'فشل رفع الحظر');
        else { toast.success('تم رفع حظر الجهاز'); await load(); }
      },
    });
  };

  // ── حظر كل الحسابات المكررة ──────────────────────────────────────────────
  const handleBanAllDuplicates = () => {
    const targets = group?.user_ids.filter(id => id !== primaryId) ?? [];
    if (targets.length === 0) { toast.info('لا توجد حسابات مكررة للحظر'); return; }
    const primaryName = profiles.find(p => p.id === primaryId)?.username ?? 'الحساب الرئيسي';
    setConfirm({
      open: true,
      title: 'حظر الحسابات المكررة',
      description: `سيتم حظر ${targets.length} حساب مكرر مع الإبقاء على "${primaryName}".`,
      variant: 'destructive',
      onConfirm: async () => {
        setActionLoading('bulk_ban');
        const res = await banDuplicateAccounts(group!.user_ids, primaryId);
        setActionLoading(null);
        if (res.errors.length > 0) toast.error(`فشل حظر ${res.errors.length} حساب`);
        else toast.success(`تم حظر ${res.banned} حساب بنجاح`);
        await load();
      },
    });
  };

  // ── حذف كل الحسابات المكررة ──────────────────────────────────────────────
  const handleDeleteAllDuplicates = () => {
    const targets = group?.user_ids.filter(id => id !== primaryId) ?? [];
    if (targets.length === 0) { toast.info('لا توجد حسابات مكررة للحذف'); return; }
    const primaryName = profiles.find(p => p.id === primaryId)?.username ?? 'الحساب الرئيسي';
    setConfirm({
      open: true,
      title: 'حذف الحسابات المكررة',
      description: `سيتم حذف ${targets.length} حساب مكرر نهائياً مع الإبقاء على "${primaryName}". لا يمكن التراجع!`,
      variant: 'destructive',
      onConfirm: async () => {
        setActionLoading('bulk_delete');
        const res = await deleteDuplicateAccounts(group!.user_ids, primaryId);
        setActionLoading(null);
        if (res.errors.length > 0) toast.error(`فشل حذف ${res.errors.length} حساب`);
        else toast.success(`تم حذف ${res.deleted} حساب بنجاح`);
        await load();
      },
    });
  };

  // ── بيانات الجهاز للعرض ──────────────────────────────────────────────────
  const deviceModel   = profiles[0]?.device_model ?? null;
  const platform      = profiles[0]?.platform ?? null;
  const osVersion     = profiles[0]?.os_version ?? null;
  const appVersion    = profiles[0]?.app_version ?? null;

  if (!loading && !group) {
    return (
      <AdminShell
        title="مجموعة غير موجودة"
        breadcrumbs={[{ label: 'الإدارة', href: '/admin' }, { label: 'الحسابات المكررة', href: '/admin/duplicate-accounts' }, { label: 'خطأ' }]}
      >
        <div className="text-center py-16 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>لم يتم العثور على هذه المجموعة</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/duplicate-accounts')}>
            العودة للقائمة
          </Button>
        </div>
      </AdminShell>
    );
  }

  const duplicateProfiles = profiles.filter(p => p.id !== primaryId);
  const primaryProfile    = profiles.find(p => p.id === primaryId);

  return (
    <AdminShell
      title={group ? (group.usernames.slice(0, 2).join('، ') + (group.usernames.length > 2 ? '...' : '')) : '...'}
      subtitle={`${group?.user_count ?? 0} حسابات على نفس الجهاز`}
      breadcrumbs={[
        { label: 'الإدارة', href: '/admin' },
        { label: 'الحسابات المكررة', href: '/admin/duplicate-accounts' },
        { label: 'التفاصيل' },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          تحديث
        </Button>
      }
    >
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── حالة الجهاز ── */}
          {group?.is_banned && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/8 p-4 flex items-center gap-3">
              <ShieldX className="w-5 h-5 text-destructive shrink-0" />
              <div>
                <p className="font-semibold text-sm text-destructive">هذا الجهاز محظور نهائياً</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {group.ban_info?.ban_reason ?? 'حظر من الإدارة'}
                  {group.ban_info?.banned_at ? ` · ${fmt(group.ban_info.banned_at)}` : ''}
                </p>
              </div>
            </div>
          )}

          {/* ── معلومات الجهاز ── */}
          <SectionCard title="الجهاز وبيانات التعريف" icon={Smartphone}>
            <InfoItem label="بصمة الجهاز (FP)"   value={group?.device_fp}        mono />
            <InfoItem label="معرف الجهاز (ID)"    value={group?.device_id}        mono />
            <InfoItem label="Hardware Hash"        value={group?.hardware_hash}    mono />
            <InfoItem label="موديل الجهاز"         value={deviceModel} />
            <InfoItem label="نظام التشغيل"         value={platform ? `${platform}${osVersion ? ` ${osVersion}` : ''}` : null} />
            <InfoItem label="إصدار التطبيق"        value={appVersion} />
            <div className="grid grid-cols-2 gap-4 mt-1">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">أول ظهور</p>
                <p className="text-xs font-medium">{fmt(group?.first_seen)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">آخر نشاط</p>
                <p className="text-xs font-medium">{fmt(group?.last_seen)}</p>
              </div>
            </div>
          </SectionCard>

          {/* ── إجراءات الجهاز ── */}
          <SectionCard title="إجراءات الجهاز" icon={Shield}>
            <div className="flex flex-col gap-2.5">
              {group?.is_banned ? (
                <Button
                  variant="outline"
                  className="w-full h-11 gap-2 border-green-500/30 text-green-600 hover:bg-green-500/5"
                  onClick={handleUnbanDevice}
                  disabled={actionLoading === 'device'}
                >
                  {actionLoading === 'device' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  رفع حظر الجهاز
                </Button>
              ) : (
                <Button
                  className="w-full h-11 gap-2"
                  style={{ background: 'linear-gradient(135deg,#e00,#c00)', color: '#fff' }}
                  onClick={handleBanDevice}
                  disabled={actionLoading === 'device'}
                >
                  {actionLoading === 'device' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldX className="w-4 h-4" />}
                  حظر الجهاز نهائياً
                </Button>
              )}
            </div>
          </SectionCard>

          {/* ── الحساب الرئيسي ── */}
          {primaryProfile && (
            <SectionCard title="الحساب الرئيسي" icon={Crown}>
              <AccountCard
                profile={primaryProfile}
                isPrimary
                onSetPrimary={() => {}}
                onBan={() => handleBanAccount(primaryProfile.id)}
                onUnban={() => handleUnbanAccount(primaryProfile.id)}
                onDelete={() => handleDeleteAccount(primaryProfile.id, primaryProfile.username ?? '—')}
                onView={() => navigate(`/admin/users/${primaryProfile.id}`)}
                actionLoading={actionLoading}
              />
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                * الحساب الرئيسي يُستبعد من إجراءات الحذف/الحظر الجماعي
              </p>
            </SectionCard>
          )}

          {/* ── الحسابات المكررة ── */}
          <SectionCard
            title={`الحسابات المكررة (${duplicateProfiles.length})`}
            icon={Users}
          >
            {duplicateProfiles.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-green-500" />
                <p className="text-sm">لا توجد حسابات مكررة</p>
              </div>
            ) : (
              <>
                {/* إجراءات جماعية */}
                <div className="flex gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs gap-1.5 border-orange-400/30 text-orange-500 hover:bg-orange-500/5"
                    onClick={handleBanAllDuplicates}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'bulk_ban'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Shield className="w-3.5 h-3.5" />
                    }
                    حظر الكل
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5"
                    onClick={handleDeleteAllDuplicates}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === 'bulk_delete'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />
                    }
                    حذف الكل
                  </Button>
                </div>

                {/* قائمة الحسابات */}
                <div className="space-y-3">
                  {duplicateProfiles.map(p => (
                    <AccountCard
                      key={p.id}
                      profile={p}
                      isPrimary={false}
                      onSetPrimary={() => {
                        setPrimaryId(p.id);
                        toast.success(`تم تحديد "${p.username ?? p.id}" كحساب رئيسي`);
                      }}
                      onBan={() => handleBanAccount(p.id)}
                      onUnban={() => handleUnbanAccount(p.id)}
                      onDelete={() => handleDeleteAccount(p.id, p.username ?? '—')}
                      onView={() => navigate(`/admin/users/${p.id}`)}
                      actionLoading={actionLoading}
                    />
                  ))}
                </div>
              </>
            )}
          </SectionCard>

          {/* ── ملخص ── */}
          <div className="rounded-2xl border bg-muted/40 p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-primary">{profiles.length}</p>
                <p className="text-[10px] text-muted-foreground">إجمالي الحسابات</p>
              </div>
              <div>
                <p className="text-xl font-bold text-green-500">
                  {profiles.filter(p => p.is_active).length}
                </p>
                <p className="text-[10px] text-muted-foreground">نشط</p>
              </div>
              <div>
                <p className="text-xl font-bold text-destructive">
                  {profiles.filter(p => !p.is_active).length}
                </p>
                <p className="text-[10px] text-muted-foreground">محظور</p>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* نافذة تأكيد */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        description={confirm.description}
        variant={confirm.variant}
        onConfirm={async () => {
          setConfirm(c => ({ ...c, open: false }));
          await confirm.onConfirm();
        }}
        onOpenChange={(v) => !v && setConfirm(c => ({ ...c, open: false }))}
      />
    </AdminShell>
  );
}
