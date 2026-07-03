// صفحة إجراءات المستخدم الكاملة — /admin/users/:id/actions
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  RefreshCw, Loader2, CreditCard, User, Shield, Clock,
  RotateCcw, Ban, UserCheck, UserX, Zap, AlertTriangle,
  CheckCircle, ChevronRight, Trash2, LogOut, Smartphone,
  ListX, History, Settings, Key, Search, Info,
  Building2, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import AdminShell, { SectionCard, ConfirmDialog, StatusBadge } from '@/components/admin/AdminShell';
import {
  getUserDetail, type UserDetail,
  renewUserSubscription, cancelUserSubscription,
  suspendUserSubscription, banUser,
  adminAdjustOps, getAdminAuditLogs, type AdminAuditLog,
  adminSignOutAllDevices, adminResetDeviceTokens,
  adminSetOpsLimit, deleteUserComplete,
  adminActivateByCode, previewLicenseCode, type LicenseCodePreview,
  promoteToMerchant, demoteToUser,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}

// ── زر إجراء ─────────────────────────────────────────────────────────────────
function ActionBtn({ icon: Icon, label, description, variant = 'default', onClick, disabled }: {
  icon: React.ElementType; label: string; description: string;
  variant?: 'default' | 'destructive' | 'warning'; onClick: () => void; disabled?: boolean;
}) {
  const border = { default: 'border-border hover:bg-muted/40', destructive: 'border-destructive/20 hover:bg-destructive/5', warning: 'border-warning/20 hover:bg-warning/5' }[variant];
  const iconCls = { default: 'text-primary bg-primary/10', destructive: 'text-destructive bg-destructive/10', warning: 'text-warning bg-warning/10' }[variant];
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border bg-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${border}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconCls}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 text-right min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export default function AdminUserActions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile: adminProfile } = useAuth();

  const [detail, setDetail]     = useState<UserDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [opsAdj,  setOpsAdj]    = useState('');
  const [opsLimit, setOpsLimit] = useState('');
  // ── تفعيل بكود يدوي ──
  const [codeInput,      setCodeInput]      = useState('');
  const [codePreview,    setCodePreview]    = useState<LicenseCodePreview | null>(null);
  const [codePreviewing, setCodePreviewing] = useState(false);
  const [codeActivating, setCodeActivating] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    open: boolean; title: string; desc?: string;
    action: () => Promise<void>; variant?: 'default' | 'destructive';
  }>({ open: false, title: '', action: async () => {} });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try { setDetail(await getUserDetail(id)); }
    catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  }, [id]);

  const handleCodePreview = async () => {
    if (!codeInput.trim()) return;
    setCodePreviewing(true);
    setCodePreview(null);
    const res = await previewLicenseCode(codeInput);
    setCodePreviewing(false);
    if (!res.found) { toast.error(res.error ?? 'الكود غير موجود'); return; }
    setCodePreview(res.data!);
  };

  const handleCodeActivate = async () => {
    if (!codePreview || !id) return;
    setCodeActivating(true);
    const res = await adminActivateByCode(id, codePreview.code, adminProfile?.id);
    setCodeActivating(false);
    if (res.success) {
      toast.success('تم تفعيل الكود بنجاح!');
      setCodeInput('');
      setCodePreview(null);
      await load();
      await loadLogs();
    } else {
      toast.error(res.error ?? 'فشل التفعيل');
    }
  };

  const loadLogs = useCallback(async () => {
    if (!id) return;
    setLogsLoading(true);
    try {
      const res = await getAdminAuditLogs(1);
      setAuditLogs(res.data.filter(l => l.target_user_id === id));
    }
    finally { setLogsLoading(false); }
  }, [id]);

  useEffect(() => { load(); loadLogs(); }, [load, loadLogs]);

  const confirm = (
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
          if (res.success) { toast.success(successMsg); await load(); await loadLogs(); }
          else toast.error(res.error || 'فشلت العملية');
        } finally { setSaving(false); setConfirmData(p => ({ ...p, open: false })); }
      },
    });
  };

  if (loading) return (
    <AdminShell title="إجراءات المستخدم"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'المستخدمون', href: '/admin' }, { label: '...' }, { label: 'إجراءات' }]}>
      <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl bg-muted" />)}</div>
    </AdminShell>
  );

  if (!detail) return (
    <AdminShell title="مستخدم غير موجود"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'خطأ' }]}>
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground">لم يُعثر على البيانات</p>
        <Button onClick={() => navigate('/admin')} variant="outline">العودة</Button>
      </div>
    </AdminShell>
  );

  const { profile, subscription } = detail;
  const isBanned    = !profile.is_active;
  const isSuspended = subscription?.status === 'suspended';
  const username    = profile.full_name || profile.username || profile.email || 'مستخدم';

  return (
    <AdminShell
      title={`إجراءات — ${username}`}
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/admin' },
        { label: 'المستخدمون', href: '/admin' },
        { label: username, href: `/admin/users/${id}` },
        { label: 'إجراءات' },
      ]}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="h-8 gap-1 text-xs" disabled={loading}>
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/users/${id}`)} className="h-8 gap-1 text-xs">
            التفاصيل
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-8">

        {/* ── ملخص الحالة ── */}
        <div className="card-premium p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-xl font-black text-primary">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">{username}</p>
            <p className="text-xs text-muted-foreground">{profile.email}</p>
          </div>
          <StatusBadge status={isBanned ? 'banned' : subscription?.status === 'active' ? 'active' : subscription?.status === 'suspended' ? 'suspended' : 'inactive'} />
        </div>

        {/* ── إدارة الجلسة والجهاز ── */}
        <SectionCard title="الجلسة والجهاز" icon={Smartphone}>
          <div className="space-y-2">
            <ActionBtn icon={LogOut} label="تسجيل خروج من جميع الأجهزة" description="إلغاء جميع الجلسات النشطة فوراً" variant="warning"
              onClick={() => confirm(
                'تسجيل خروج شامل',
                `تسجيل خروج ${username} من جميع الأجهزة؟ سيضطر لتسجيل الدخول مجدداً.`,
                () => adminSignOutAllDevices(id!),
                'تم تسجيل الخروج من جميع الأجهزة',
                'destructive',
              )} />
            <ActionBtn icon={Smartphone} label="إعادة تعيين بيانات الجهاز" description="مسح رموز الإشعارات المخزنة للجهاز"
              onClick={() => confirm(
                'إعادة تعيين الجهاز',
                `إعادة تعيين بيانات جهاز ${username}؟`,
                () => adminResetDeviceTokens(id!),
                'تم إعادة تعيين بيانات الجهاز',
              )} />
          </div>
        </SectionCard>

        {/* ── إدارة الاشتراك ── */}
        <SectionCard title="إدارة الاشتراك" icon={CreditCard}>
          <div className="space-y-2">
            <ActionBtn icon={RotateCcw} label="تجديد 30 يوم" description="إضافة 30 يوم للاشتراك الحالي"
              onClick={() => confirm('تجديد الاشتراك', `تجديد اشتراك ${username} بـ 30 يوم؟`,
                () => renewUserSubscription(id!, 30, adminProfile?.id), 'تم التجديد بنجاح')} />
            <ActionBtn icon={Zap} label="تجديد 7 أيام" description="إضافة أسبوع للاشتراك الحالي"
              onClick={() => confirm('تجديد 7 أيام', `إضافة 7 أيام لاشتراك ${username}؟`,
                () => renewUserSubscription(id!, 7, adminProfile?.id), 'تم التجديد بنجاح')} />
            {!isSuspended && subscription && (
              <ActionBtn icon={Clock} label="تعليق الاشتراك" description="إيقاف مؤقت — يمكن رفعه لاحقاً" variant="warning"
                onClick={() => confirm('تعليق الاشتراك', `تعليق اشتراك ${username} مؤقتاً؟`,
                  () => suspendUserSubscription(id!, true, adminProfile?.id), 'تم تعليق الاشتراك', 'destructive')} />
            )}
            {isSuspended && (
              <ActionBtn icon={CheckCircle} label="رفع التعليق" description="استئناف الاشتراك المعلق"
                onClick={() => confirm('رفع التعليق', `رفع تعليق اشتراك ${username}؟`,
                  () => suspendUserSubscription(id!, false, adminProfile?.id), 'تم رفع التعليق')} />
            )}
            <ActionBtn icon={Ban} label="إلغاء الاشتراك" description="إنهاء الاشتراك نهائياً" variant="destructive"
              onClick={() => confirm('إلغاء الاشتراك', `إلغاء اشتراك ${username} نهائياً؟ لن يستطيع الاستخدام.`,
                () => cancelUserSubscription(id!, adminProfile?.id), 'تم إلغاء الاشتراك', 'destructive')} />
            <div className="mt-1">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-border"
                onClick={() => navigate(`/admin/users/${id}/subscription`)}>
                <CreditCard className="w-3 h-3" /> إدارة الاشتراك التفصيلية
              </Button>
            </div>
          </div>
        </SectionCard>

        {/* ── تفعيل بكود يدوي ── */}
        <SectionCard title="تفعيل بكود" icon={Key}>
          <div className="space-y-3">
            {/* إدخال الكود + فحص */}
            <div className="flex gap-2">
              <Input
                placeholder="أدخل كود التفعيل..."
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodePreview(null); }}
                className="text-sm font-mono tracking-wider"
                onKeyDown={e => e.key === 'Enter' && handleCodePreview()}
              />
              <Button
                type="button" size="sm" variant="outline"
                className="h-9 text-xs gap-1 border-border shrink-0"
                disabled={codePreviewing || !codeInput.trim()}
                onClick={handleCodePreview}
              >
                {codePreviewing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Search className="w-3.5 h-3.5" />}
                فحص
              </Button>
            </div>

            {/* معاينة تفاصيل الكود */}
            {codePreview && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                {/* رأس المعاينة */}
                <div className="flex items-center gap-2 pb-1 border-b border-border/40">
                  <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                  <p className="text-xs font-bold text-foreground">تفاصيل الكود</p>
                  <span className={`mr-auto text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    codePreview.status === 'active'   ? 'bg-green-500/15 text-green-600' :
                    codePreview.status === 'used'     ? 'bg-orange-500/15 text-orange-600' :
                    codePreview.status === 'disabled' ? 'bg-destructive/15 text-destructive' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {codePreview.status === 'active'   ? '✅ نشط' :
                     codePreview.status === 'used'     ? '⚠️ مستخدم' :
                     codePreview.status === 'disabled' ? '🚫 معطّل' :
                     codePreview.status}
                  </span>
                </div>

                {/* بيانات الكود */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div>
                    <p className="text-muted-foreground text-[10px]">الكود</p>
                    <p className="font-mono font-bold text-foreground">{codePreview.code}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">النوع</p>
                    <p className="font-semibold text-foreground">
                      {codePreview.code_type === 'gift'  ? '🎁 هدية' :
                       codePreview.code_type === 'trial' ? '🔬 تجريبي' : '💳 مدفوع'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">المدة</p>
                    <p className="font-semibold text-foreground">{codePreview.duration} يوم</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">الاستخدام</p>
                    <p className="font-semibold text-foreground">
                      {codePreview.used_count}
                      {codePreview.max_users !== null ? ` / ${codePreview.max_users}` : ' / ∞'}
                    </p>
                  </div>
                  {codePreview.expiry_date && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-[10px]">تاريخ الانتهاء</p>
                      <p className="font-semibold text-foreground">{fmt(codePreview.expiry_date)}</p>
                    </div>
                  )}
                </div>

                {/* أزرار التأكيد / التغيير */}
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button" size="sm"
                    className="flex-1 h-8 text-xs gap-1 bg-primary text-primary-foreground"
                    disabled={codeActivating || codePreview.status === 'disabled'}
                    onClick={handleCodeActivate}
                  >
                    {codeActivating
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <CheckCircle className="w-3.5 h-3.5" />}
                    تأكيد التفعيل
                  </Button>
                  <Button
                    type="button" size="sm" variant="outline"
                    className="h-8 text-xs border-border"
                    onClick={() => { setCodePreview(null); setCodeInput(''); }}
                  >
                    تغيير الكود
                  </Button>
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              أدخل الكود واضغط «فحص» لمعاينة التفاصيل، ثم «تأكيد التفعيل».
              يتجاوز هذا الإجراء فحص الجهاز.
            </p>
          </div>
        </SectionCard>

        {/* ── إدارة العمليات ── */}
        <SectionCard title="إدارة العمليات" icon={Zap}>
          <div className="space-y-3">
            {/* تعديل رصيد العمليات */}
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                placeholder="تعديل الرصيد (+/-) ..."
                value={opsAdj}
                onChange={e => setOpsAdj(e.target.value)}
                className="text-sm"
              />
              <Button size="sm" variant="outline" className="h-9 text-xs gap-1 border-border shrink-0"
                disabled={saving || !opsAdj}
                onClick={() => confirm(
                  'تعديل العمليات',
                  `تعديل عمليات ${username} بمقدار ${opsAdj}؟`,
                  () => adminAdjustOps(id!, Number(opsAdj), adminProfile?.id ?? ''),
                  'تم تعديل العمليات',
                )}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                تعديل
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">أدخل قيمة موجبة للإضافة أو سالبة للطرح</p>

            {/* تعديل الحد الأقصى للعمليات */}
            <div className="flex gap-2 items-center mt-1">
              <Input
                type="number"
                placeholder="الحد الأقصى اليومي..."
                value={opsLimit}
                onChange={e => setOpsLimit(e.target.value)}
                className="text-sm"
              />
              <Button size="sm" variant="outline" className="h-9 text-xs gap-1 border-border shrink-0"
                disabled={saving || !opsLimit}
                onClick={() => confirm(
                  'تعديل الحد اليومي',
                  `تعيين الحد الأقصى لعمليات ${username} إلى ${opsLimit}؟`,
                  () => adminSetOpsLimit(id!, Number(opsLimit)),
                  'تم تعديل الحد اليومي',
                )}>
                <Settings className="w-3 h-3" /> حد يومي
              </Button>
            </div>

            <ActionBtn icon={ListX} label="إعادة تعيين العمليات" description="مسح عداد العمليات الحالي"
              onClick={() => confirm('إعادة تعيين', `إعادة تعيين عمليات ${username}؟`,
                () => adminAdjustOps(id!, 0, adminProfile?.id ?? ''), 'تم إعادة التعيين')} />
          </div>
        </SectionCard>

        {/* ── صلاحيات التاجر — Merchant Role ── */}
        {(profile.role === 'user' || profile.role === 'merchant') && (
          <SectionCard title="صلاحيات التاجر" icon={Building2}>
            <div className="space-y-2">
              {profile.role === 'user' && (
                <ActionBtn
                  icon={ArrowUpCircle}
                  label="ترقية إلى تاجر"
                  description="منح صلاحيات التاجر وتفعيل لوحة التحكم الخاصة به"
                  onClick={() => confirm(
                    'ترقية إلى تاجر',
                    `سيتم ترقية "${username}" إلى دور تاجر وإنشاء ملف التاجر تلقائياً. هل تريد المتابعة؟`,
                    async () => {
                      const res = await promoteToMerchant(id!, adminProfile?.id);
                      return res;
                    },
                    profile.merchant_id
                      ? `تم استعادة حساب التاجر لـ ${username} ✅`
                      : `تم ترقية ${username} إلى تاجر ✅`,
                  )}
                />
              )}
              {profile.role === 'merchant' && (
                <ActionBtn
                  icon={ArrowDownCircle}
                  label="تحويل إلى مستخدم عادي"
                  description="سحب صلاحيات التاجر — البيانات تُحفظ ويمكن الاستعادة لاحقاً"
                  variant="warning"
                  onClick={() => confirm(
                    'تحويل إلى مستخدم عادي',
                    `سيُسحب دور التاجر من "${username}". بيانات التاجر ستُحفظ ويمكن استعادتها عند الترقية مجدداً.`,
                    async () => {
                      const res = await demoteToUser(id!, adminProfile?.id);
                      return res;
                    },
                    `تم تحويل ${username} إلى مستخدم عادي`,
                    'destructive',
                  )}
                />
              )}
              <div className="rounded-xl bg-muted/40 border border-border/40 p-3 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {profile.role === 'merchant'
                    ? 'هذا المستخدم تاجر حالياً. التحويل يُوقف لوحة التحكم ورابط الدعوة دون حذف البيانات.'
                    : profile.merchant_id
                      ? 'لهذا المستخدم ملف تاجر سابق — ستتم الاستعادة التلقائية عند الترقية.'
                      : 'ترقية المستخدم ستُنشئ ملف تاجر جديد برمز دعوة فريد.'}
                </p>
              </div>
            </div>
          </SectionCard>
        )}

        {/* ── إدارة الحساب ── */}
        <SectionCard title="إدارة الحساب" icon={User}>
          <div className="space-y-2">
            {!isBanned ? (
              <ActionBtn icon={UserX} label="حظر الحساب" description="منع المستخدم من الدخول كلياً" variant="destructive"
                onClick={() => confirm('حظر الحساب', `حظر حساب ${username} نهائياً؟`,
                  () => banUser(id!, true, adminProfile?.id), 'تم حظر الحساب', 'destructive')} />
            ) : (
              <ActionBtn icon={UserCheck} label="رفع الحظر" description="السماح للمستخدم بالدخول مجدداً"
                onClick={() => confirm('رفع الحظر', `رفع الحظر عن ${username}؟`,
                  () => banUser(id!, false, adminProfile?.id), 'تم رفع الحظر')} />
            )}

            {/* حذف الحساب — خطر شديد */}
            <div className="pt-2 border-t border-border/40">
              <ActionBtn icon={Trash2} label="حذف الحساب نهائياً" description="حذف كامل لا يمكن التراجع عنه" variant="destructive"
                onClick={() => confirm(
                  '⚠️ حذف الحساب نهائياً',
                  `سيُحذف حساب "${username}" وجميع بياناته بشكل نهائي ولا يمكن استعادتها. هل أنت متأكد تماماً؟`,
                  () => deleteUserComplete(id!),
                  'تم حذف الحساب نهائياً',
                  'destructive',
                )} />
            </div>
          </div>
        </SectionCard>

        {/* ── سجل الإجراءات ── */}
        <SectionCard title="سجل الإجراءات الإدارية" icon={History}>
          {logsLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">لا توجد إجراءات مسجّلة</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-muted/20 border border-border/40">
                  <Shield className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{log.action}</p>
                    {log.error_msg && <p className="text-[10px] text-muted-foreground mt-0.5">{log.error_msg}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">بواسطة: {log.admin_id?.slice(0, 8) ?? '—'}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground shrink-0">{fmt(log.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>

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
