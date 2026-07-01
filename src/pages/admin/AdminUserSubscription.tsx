// صفحة إدارة الاشتراك الكاملة — /admin/users/:id/subscription
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CreditCard, RefreshCw, Loader2, Calendar, Key,
  CheckCircle, XCircle, Clock, AlertCircle,
  History, RotateCcw, Ban, PlusCircle, Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import AdminShell, { SectionCard, InfoRow, ConfirmDialog } from '@/components/admin/AdminShell';
import {
  getUserDetail, type UserDetail,
  renewUserSubscription, updateSubscriptionExpiry,
  cancelUserSubscription, getSubscriptionHistory,
  type SubscriptionHistoryEntry, logAdminAction,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}
function calcDays(e?: string | null) {
  if (!e) return null;
  return Math.ceil((new Date(e).getTime() - Date.now()) / 86400000);
}

export default function AdminUserSubscription() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile: adminProfile } = useAuth();

  const [detail, setDetail]   = useState<UserDetail | null>(null);
  const [history, setHistory] = useState<SubscriptionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [renewDays,  setRenewDays]  = useState('30');
  const [extendDate, setExtendDate] = useState('');
  const [confirmData, setConfirmData] = useState<{
    open: boolean; title: string; desc?: string;
    action: () => Promise<void>; variant?: 'default' | 'destructive';
  }>({ open: false, title: '', action: async () => {} });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, h] = await Promise.all([getUserDetail(id), getSubscriptionHistory(id)]);
      setDetail(d); setHistory(h);
      if (d.subscription?.expires_at) setExtendDate(d.subscription.expires_at.slice(0, 10));
    } catch { toast.error('فشل تحميل بيانات الاشتراك'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
          else toast.error(res.error || 'فشلت العملية');
        } finally { setSaving(false); setConfirmData(p => ({ ...p, open: false })); }
      },
    });
  };

  if (loading) return (
    <AdminShell title="إدارة الاشتراك"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'المستخدمون', href: '/admin' }, { label: '...' }, { label: 'الاشتراك' }]}>
      <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl bg-muted" />)}</div>
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
  const days = calcDays(subscription?.expires_at);
  const username = profile.full_name || profile.username || profile.email || 'مستخدم';

  const STATUS_STYLES: Record<string, string> = {
    active:    'text-success bg-success/10 border-success/20',
    expired:   'text-destructive bg-destructive/10 border-destructive/20',
    cancelled: 'text-muted-foreground bg-muted/30 border-border',
    replaced:  'text-warning bg-warning/10 border-warning/20',
    pending:   'text-warning bg-warning/10 border-warning/20',
    suspended: 'text-warning bg-warning/10 border-warning/20',
  };
  const STATUS_LABEL: Record<string, string> = {
    active: 'نشط', expired: 'منتهي', cancelled: 'ملغي',
    replaced: 'مستبدل', pending: 'معلق', suspended: 'موقوف',
  };

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
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/users/${id}/actions`)} className="h-8 gap-1 text-xs">
            الإجراءات
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-8">

        {/* ── معلومات الاشتراك الحالي ── */}
        <SectionCard title="معلومات الاشتراك الحالي" icon={CreditCard}>
          {subscription ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${STATUS_STYLES[subscription.status] ?? STATUS_STYLES.expired}`}>
                  {STATUS_LABEL[subscription.status] ?? subscription.status}
                </span>
                {days !== null && days > 0 && (
                  <span className="text-xs text-primary font-semibold">{days} يوم متبقي</span>
                )}
                {days !== null && days <= 0 && (
                  <span className="text-xs text-destructive font-semibold">انتهى الاشتراك</span>
                )}
              </div>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
                <InfoRow label="كود التفعيل" value={license_code} copyable />
                <InfoRow label="تاريخ البداية" value={fmt(subscription.activated_at || subscription.created_at)} />
                <InfoRow label="تاريخ الانتهاء" value={fmt(subscription.expires_at)} />
                <InfoRow label="الأيام المتبقية" value={days === null ? '—' : days > 0 ? `${days} يوم` : 'منتهي'} />
<<<<<<< HEAD
                {/* العمليات المنجزة = الناجحة فقط (من subscription.ops_count بعد إصلاح الخصم) */}
                <InfoRow label="كروت مشحونة (ناجحة)" value={String(detail.total_cards ?? 0)} />
                <InfoRow label="كل العمليات (ناجحة + فاشلة)" value={String(detail.ops_count ?? 0)} />
                <InfoRow label="حد الاشتراك" value={
                  detail.ops_limit == null ? 'غير محدود ♾️' : String(detail.ops_limit)
                } />
                <InfoRow label="العمليات المتبقية" value={
                  detail.ops_limit == null
                    ? 'غير محدود ♾️'
                    : String(Math.max(0, detail.ops_limit - (subscription.ops_count ?? 0)))
=======
                <InfoRow label="العمليات المنجزة" value={String(detail.ops_count ?? 0)} />
                <InfoRow label="الحد اليومي" value={
                  (subscription as typeof subscription & { operations_per_user?: number | null })?.operations_per_user == null
                    ? 'غير محدود' : String((subscription as typeof subscription & { operations_per_user?: number | null }).operations_per_user)
                } />
                <InfoRow label="العمليات المتبقية" value={
                  subscription.ops_remaining == null ? 'غير محدود' : String(subscription.ops_remaining)
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
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

        {/* ── إجراءات الاشتراك ── */}
        <SectionCard title="إجراءات الاشتراك" icon={Edit3}>
          <div className="space-y-4">

            {/* تجديد الاشتراك */}
            <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-success shrink-0" />
                <p className="text-sm font-semibold">تجديد الاشتراك</p>
              </div>
              <div className="flex gap-2 items-center">
                <Input type="number" value={renewDays} onChange={e => setRenewDays(e.target.value)}
                  className="text-sm w-24 text-center" placeholder="30" />
                <Label className="text-xs text-muted-foreground">يوم</Label>
                <Button size="sm" variant="default" className="h-9 text-xs gap-1 mr-auto"
                  disabled={saving}
                  onClick={() => runConfirm(
                    'تأكيد التجديد',
                    `تجديد اشتراك ${username} بـ ${renewDays} يوم إضافي`,
                    () => renewUserSubscription(id!, Number(renewDays), adminProfile?.id),
                    `تم تجديد الاشتراك بـ ${renewDays} يوم`,
                  )}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  تجديد
                </Button>
              </div>
            </div>

            {/* تمديد حتى تاريخ */}
            <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm font-semibold">تمديد حتى تاريخ محدد</p>
              </div>
              <div className="flex gap-2 items-center">
                <Input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)} className="text-sm" />
                <Button size="sm" variant="outline" className="h-9 text-xs gap-1 border-border shrink-0"
                  disabled={saving || !extendDate}
                  onClick={() => runConfirm(
                    'تأكيد التمديد',
                    `تمديد اشتراك ${username} حتى ${extendDate}`,
                    () => updateSubscriptionExpiry(id!, null, extendDate, adminProfile?.id),
                    'تم تمديد الاشتراك',
                  )}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
                  تمديد
                </Button>
              </div>
            </div>

            {/* إلغاء الاشتراك */}
            {subscription && (
              <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Ban className="w-4 h-4 text-destructive shrink-0" />
                  <p className="text-sm font-semibold text-destructive">إلغاء الاشتراك</p>
                </div>
                <Button size="sm" variant="destructive" className="h-9 text-xs gap-1"
                  disabled={saving}
                  onClick={() => runConfirm(
                    'تأكيد الإلغاء',
                    `هل أنت متأكد من إلغاء اشتراك ${username}؟ لن يتمكن من استخدام التطبيق.`,
                    () => cancelUserSubscription(id!, adminProfile?.id),
                    'تم إلغاء الاشتراك',
                    'destructive',
                  )}>
                  <Ban className="w-3 h-3" /> إلغاء الاشتراك
                </Button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── سجل الاشتراكات ── */}
        <SectionCard title={`سجل الاشتراكات (${history.length})`} icon={History}>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">لا يوجد سجل اشتراكات</p>
          ) : (
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={h.id} className={`p-3 rounded-xl border transition-colors ${i === 0 ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/10'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {h.code && <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{h.code}</span>}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[h.status] ?? STATUS_STYLES.expired}`}>
                        {STATUS_LABEL[h.status] ?? h.status}
                      </span>
                      {i === 0 && <span className="text-[10px] font-bold text-primary">الحالي</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{fmt(h.created_at)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div><p className="text-[10px] text-muted-foreground">البداية</p><p className="text-xs font-medium">{fmt(h.activated_at)}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">النهاية</p><p className="text-xs font-medium">{fmt(h.expires_at)}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">المدة</p><p className="text-xs font-medium">{h.duration_days} يوم</p></div>
                    {h.end_reason && <div><p className="text-[10px] text-muted-foreground">السبب</p><p className="text-xs font-medium">{h.end_reason}</p></div>}
                  </div>
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
