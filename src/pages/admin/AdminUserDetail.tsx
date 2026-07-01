// صفحة تفاصيل المستخدم الكاملة — /admin/users/:id
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  User, CreditCard, Activity, Phone, Clock,
  Shield, RefreshCw, Copy, CheckCircle,
  XCircle, Smartphone, Wifi, Bell, BellOff,
  Trash2, UserX, Zap, CalendarDays, AlertCircle,
  BarChart2, Package, Hash, Wallet, Timer, Calendar,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import AdminShell, { SectionCard, InfoRow, StatusBadge } from '@/components/admin/AdminShell';
import { getUserDetail, type UserDetail, deleteNotification, deleteAllUserNotifications } from '@/lib/api';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { Operation } from '@/types/types';

// ─── مكوّن تفاصيل العملية (Sheet سفلي مدمج) ────────────────────────────────
function OpDetailsSheet({ op, open, onClose }: { op: Operation | null; open: boolean; onClose: () => void }) {
  if (!op) return null;
  const isSuccess = op.status === 'success';
  const src = op.operation_source;
  const isBalance = src === 'ana_vodafone_balance';
  const srcLabel = isBalance ? 'رصيد أنا فودافون' : 'Vodafone Cash';
  const srcDot   = isBalance ? '🔴' : '💳';
  const srcCls   = isBalance
    ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';

  function Row({ icon: Icon, label, value, mono = false, copyable = false }: {
    icon?: React.ComponentType<{ className?: string }>;
    label: string; value: string | number | null | undefined;
    mono?: boolean; copyable?: boolean;
  }) {
    const v = value != null && value !== '' ? String(value) : '—';
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-b-0">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
          <p className={`text-xs font-semibold break-all ${mono ? 'font-mono' : ''} ${v === '—' ? 'text-muted-foreground' : 'text-foreground'}`}>{v}</p>
        </div>
        {copyable && v !== '—' && (
          <button onClick={() => navigator.clipboard.writeText(v).then(() => toast.success('تم النسخ'))}
            className="shrink-0 opacity-40 hover:opacity-100 transition-opacity mt-0.5">
            <Copy className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto max-w-[calc(100%-2rem)] md:max-w-lg mx-auto rounded-t-2xl">
        <SheetHeader className="pb-3 border-b border-border/30">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <span>{isSuccess ? '✅' : '❌'}</span>
            تفاصيل العملية
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${srcCls}`}>{srcDot} {srcLabel}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="py-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2">📋 البيانات الأساسية</p>
          <Row icon={Hash}       label="رقم العملية"  value={op.operation_number} mono copyable />
          <Row icon={Phone}      label="رقم الهاتف"   value={op.phone_number} mono copyable />
          <Row icon={CreditCard} label="نوع الكارت"   value={op.card_type} />
          <Row icon={Wallet}     label="المبلغ"        value={op.amount != null ? `${op.amount} ج.م` : null} />
          <Row icon={Tag}        label="الفئة"         value={op.category} />
          <Row icon={Calendar}   label="وقت التنفيذ"  value={op.performed_at ? format(new Date(op.performed_at), 'dd MMM yyyy HH:mm', { locale: ar }) : null} />
          <Row icon={Shield}     label="الحالة"        value={isSuccess ? '✅ ناجحة' : '❌ فاشلة'} />

          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2 pt-4">⚡ مصدر الشحن</p>
          <Row icon={Zap}        label="مصدر الشحن"   value={srcLabel} />
          <Row                   label="operation_source" value={op.operation_source} mono copyable />
          <Row                   label="execution_layer"  value={op.execution_layer} mono />

          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2 pt-4">⏱️ الأداء والتتبع</p>
          <Row icon={Timer}      label="مدة التنفيذ"  value={op.duration_ms != null ? `${op.duration_ms} ms` : null} />
          <Row                   label="latency_ms"    value={op.latency_ms != null ? `${op.latency_ms} ms` : null} />
          <Row                   label="retry_count"   value={op.retry_count} />

          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2 pt-4">🔍 معرّفات Debug</p>
          <Row label="Operation ID"    value={op.id} mono copyable />
          <Row label="correlation_id"  value={op.correlation_id} mono copyable />
          <Row label="idempotency_key" value={op.idempotency_key} mono copyable />

          {!isSuccess && op.error_message && (
            <>
              <p className="text-[10px] font-bold text-destructive uppercase tracking-wider py-2 pt-4">🚨 تفاصيل الخطأ</p>
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                <p className="text-xs text-destructive font-medium break-words">{op.error_message}</p>
              </div>
            </>
          )}

          {op.api_response && (
            <>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2 pt-4">📡 استجابة API</p>
              <div className="bg-muted/30 border border-border/40 rounded-xl p-3">
                <pre className="text-[10px] font-mono text-muted-foreground break-all whitespace-pre-wrap overflow-x-auto max-h-48">
                  {(() => { try { return JSON.stringify(JSON.parse(op.api_response), null, 2); } catch { return op.api_response; } })()}
                </pre>
              </div>
            </>
          )}
        </div>
        <div className="pt-2 pb-2">
          <Button variant="outline" className="w-full h-9" onClick={onClose}>إغلاق</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}
function calcDays(expiresAt?: string | null) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

function MiniStat({ icon: Icon, label, value, color = 'text-primary' }: {
  icon: React.ElementType; label: string; value: string | number; color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', color.replace('text-', 'bg-') + '/10')}>
        <Icon className={cn('w-4 h-4', color)} />
      </div>
      <div className="min-w-0">
        <p className={cn('text-base font-black tabular-nums leading-none', color)}>{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [deletingNotif, setDeletingNotif] = useState<string | null>(null);
  const [deletingAllNotifs, setDeletingAllNotifs] = useState(false);
  const [deletingSimilar, setDeletingSimilar] = useState<string | null>(null);
  const [detailOp, setDetailOp] = useState<Operation | null>(null);
  const [opSheetOpen, setOpSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try { const d = await getUserDetail(id); setDetail(d); }
    catch { toast.error('فشل تحميل بيانات المستخدم'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label); toast.success(`تم نسخ ${label}`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDeleteNotif = async (notifId: string) => {
    setDeletingNotif(notifId);
    const { error } = await deleteNotification(notifId);
    if (error) { toast.error('فشل حذف الإشعار'); }
    else { toast.success('تم حذف الإشعار'); load(); }
    setDeletingNotif(null);
  };

  const handleDeleteAllNotifs = async () => {
    if (!id) return;
    setDeletingAllNotifs(true);
    await deleteAllUserNotifications(id);
    toast.success('تم حذف جميع الإشعارات');
    setDeletingAllNotifs(false);
    load();
  };

  const handleDeleteSimilar = async (similarId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الحساب المشابه؟')) return;
    setDeletingSimilar(similarId);
    // حذف من auth + profiles عبر service role
    const { data: delData, error: delErr } = await supabase.functions.invoke('admin-user-actions', {
      body: { action: 'delete_account', userId: similarId },
    });
    const realErrMsg = delErr
      ? (await delErr?.context?.text?.().catch(() => null)
          .then((t: string | null) => { try { return JSON.parse(t ?? '').error; } catch { return t; } }))
          ?? delErr.message
      : (delData as { error?: string } | null)?.error ?? null;
    if (delErr || realErrMsg) { toast.error(`فشل حذف الحساب: ${realErrMsg ?? 'خطأ غير معروف'}`); }
    else { toast.success('تم حذف الحساب المشابه'); load(); }
    setDeletingSimilar(null);
  };

  if (loading) return (
    <AdminShell title="تفاصيل المستخدم"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'المستخدمون', href: '/admin' }, { label: '...' }]}>
      <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl bg-muted" />)}</div>
    </AdminShell>
  );

  if (!detail) return (
    <AdminShell title="مستخدم غير موجود"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'خطأ' }]}>
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground">لم يُعثر على بيانات المستخدم</p>
        <Button onClick={() => navigate('/admin')} variant="outline">العودة</Button>
      </div>
    </AdminShell>
  );

  const { profile, subscription, license_code, ops_count, total_cards, total_amount, activity, recent_ops, devices, similar_accounts, notifications } = detail;
  const days = calcDays(subscription?.expires_at);
  const isBanned = !profile.is_active;
  const subStatus = isBanned ? 'banned'
    : subscription?.status === 'active' ? 'active'
    : subscription?.status === 'suspended' ? 'suspended'
    : 'inactive';

  // أحدث جهاز مسجّل
  const primaryDevice = devices[0];
  const deviceModel = primaryDevice?.device_info?.model || 'Android';
  const deviceOS = primaryDevice?.device_info?.os_version || '';
  const appVer = primaryDevice?.app_version ?? '—';
  const versionCode = primaryDevice?.version_code ?? '—';

  return (
    <AdminShell
      title={profile.full_name || profile.username || profile.email || 'مستخدم'}
      subtitle={`ID: ${profile.id.slice(0, 12)}...`}
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/admin' },
        { label: 'المستخدمون', href: '/admin' },
        { label: profile.username || profile.email || 'مستخدم' },
      ]}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="h-8 gap-1 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </Button>
          <Button size="sm" onClick={() => navigate(`/admin/users/${id}/actions`)} className="h-8 gap-1 text-xs">
            <Shield className="w-3.5 h-3.5" /> إجراءات
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-8">

        {/* ── بيانات الحساب ── */}
        <SectionCard title="بيانات الحساب" icon={User}>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-xl font-black text-primary">
              {(profile.full_name || profile.username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="font-black text-sm">{profile.full_name || '—'}</h2>
                <StatusBadge status={subStatus} />
              </div>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
              <p className="text-xs text-muted-foreground">@{profile.username}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
            <InfoRow label="User ID" value={profile.id} copyable />
            <InfoRow label="اسم المستخدم" value={profile.username} copyable />
            <InfoRow label="الاسم الكامل" value={profile.full_name} />
            <InfoRow label="البريد الإلكتروني" value={profile.email} copyable />
            <InfoRow label="رقم الهاتف" value={profile.phone} copyable />
            <InfoRow label="الدور" value={profile.role === 'super_admin' ? 'مسؤول رئيسي' : profile.role === 'admin' ? 'مسؤول' : 'مستخدم'} />
            <InfoRow label="تاريخ التسجيل" value={fmt(profile.created_at)} />
            <InfoRow label="آخر تسجيل دخول" value={fmt((profile as typeof profile & { auth_last_sign_in?: string }).auth_last_sign_in)} />
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => copy(profile.id, 'ID')}>
              {copied === 'ID' ? <CheckCircle className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />} نسخ ID
            </Button>
            {profile.email && <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => copy(profile.email!, 'البريد')}>
              <Copy className="w-3 h-3" /> نسخ البريد
            </Button>}
          </div>
        </SectionCard>

        {/* ── معلومات الجهاز والإصدار ── */}
        <SectionCard title="الجهاز وإصدار التطبيق" icon={Smartphone}>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">لم يتم تسجيل جهاز بعد</p>
          ) : (
            <div className="space-y-3">
              {devices.map((dev) => (
                <div key={dev.id} className={cn(
                  'rounded-xl border p-3 space-y-2',
                  dev.is_active ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/10 opacity-60'
                )}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-xs font-semibold">{dev.device_info?.model || 'Android'}</span>
                      {dev.is_active && <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded-full">نشط</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{fmt(dev.updated_at)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded-lg bg-muted/30 p-2">
                      <p className="text-[10px] text-muted-foreground">نظام التشغيل</p>
                      <p className="text-xs font-medium">{dev.device_info?.os_version || '—'}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-2">
                      <p className="text-[10px] text-muted-foreground">إصدار التطبيق</p>
                      <p className="text-xs font-medium">v{dev.app_version ?? '—'} ({dev.version_code ?? '—'})</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* ملخص سريع */}
          {primaryDevice && (
            <div className="mt-3 p-3 rounded-xl bg-muted/20 border border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <Package className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">آخر إصدار مثبّت:</span>
                <span className="text-xs font-bold text-primary">v{appVer} (code {versionCode})</span>
                <span className="text-xs text-muted-foreground">—</span>
                <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{deviceModel}</span>
                {deviceOS && <><span className="text-xs text-muted-foreground">·</span><span className="text-xs text-muted-foreground">{deviceOS}</span></>}
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── إحصائيات سريعة ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat icon={Clock}       label="كل العمليات"       value={ops_count}             color="text-primary" />
          <MiniStat icon={CheckCircle} label="ناجحة ✅"           value={total_cards}           color="text-success" />
          <MiniStat icon={BarChart2}   label="إجمالي الإيرادات"  value={`${total_amount} ج`}   color="text-warning" />
          <MiniStat icon={Phone}       label="أرقام مستخدمة"     value={detail.phone_numbers.length} color="text-primary" />
        </div>

        {/* ── بيانات الاشتراك ── */}
        <SectionCard title="بيانات الاشتراك" icon={CreditCard}>
          {subscription ? (
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50">
              <InfoRow label="حالة الاشتراك" value={subscription.status === 'active' ? 'نشط ✓' : subscription.status === 'suspended' ? 'معلق' : 'منتهي'} />
              <InfoRow label="كود التفعيل" value={license_code} copyable />
              <InfoRow label="تاريخ البداية" value={fmt(subscription.activated_at || subscription.created_at)} />
              <InfoRow label="تاريخ الانتهاء" value={fmt(subscription.expires_at)} />
              <InfoRow label="الأيام المتبقية" value={days === null ? '—' : days > 0 ? `${days} يوم` : 'منتهي'} />
              <InfoRow label="كروت مشحونة (ناجحة)" value={String(total_cards)} />
              <InfoRow label="كل العمليات (ناجحة + فاشلة)" value={String(ops_count)} />
              <InfoRow label="الحد اليومي" value={
                (subscription as typeof subscription & { operations_per_user?: number | null })?.operations_per_user == null
                  ? 'غير محدود' : String((subscription as typeof subscription & { operations_per_user?: number | null }).operations_per_user)
              } />
              <InfoRow label="آخر عملية" value={fmt(detail.last_operation?.performed_at)} />
            </div>
          ) : (
            <div className="flex items-center gap-3 py-6 text-muted-foreground">
              <XCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">لا يوجد اشتراك نشط لهذا المستخدم</p>
            </div>
          )}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => navigate(`/admin/users/${id}/subscription`)} className="h-8 gap-1 text-xs">
              <CalendarDays className="w-3 h-3" /> إدارة الاشتراك الكامل
            </Button>
          </div>
        </SectionCard>

        {/* ── الإشعارات ── */}
        <SectionCard title={`الإشعارات (${notifications.length})`} icon={Bell}>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <BellOff className="w-8 h-8 opacity-40" />
              <p className="text-sm">لا توجد إشعارات</p>
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-3">
                <Button size="sm" variant="outline"
                  className="h-7 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={handleDeleteAllNotifs} disabled={deletingAllNotifs}>
                  <Trash2 className="w-3 h-3" />
                  {deletingAllNotifs ? 'جاري الحذف...' : 'حذف الكل'}
                </Button>
              </div>
              <div className="space-y-2">
                {notifications.map(n => (
                  <div key={n.id} className={cn(
                    'flex items-start gap-2 p-2.5 rounded-xl border',
                    n.is_read ? 'border-border bg-muted/10 opacity-70' : 'border-primary/20 bg-primary/5'
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold line-clamp-1">{n.title || 'إشعار'}</p>
                      {n.body && <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{fmt(n.created_at)}</p>
                    </div>
                    <Button size="sm" variant="ghost"
                      className="h-6 w-6 p-0 shrink-0 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteNotif(n.id)}
                      disabled={deletingNotif === n.id}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>

        {/* ── حسابات مشابهة (نفس رقم الهاتف) ── */}
        {similar_accounts.length > 0 && (
          <SectionCard title={`حسابات بنفس الرقم (${similar_accounts.length})`} icon={UserX}>
            <p className="text-xs text-muted-foreground mb-3">
              هذه الحسابات تستخدم نفس رقم الهاتف <span className="font-semibold text-foreground">{profile.phone}</span>
            </p>
            <div className="space-y-2">
              {similar_accounts.map(sim => (
                <div key={sim.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-destructive/20 bg-destructive/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">@{sim.username || '—'}</p>
                    <p className="text-[10px] text-muted-foreground">{sim.email}</p>
                    <p className="text-[10px] text-muted-foreground">تسجيل: {fmt(sim.created_at)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => navigate(`/admin/users/${sim.id}`)}>
                      عرض
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteSimilar(sim.id)}
                      disabled={deletingSimilar === sim.id}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── آخر العمليات ── */}
        <SectionCard title="آخر العمليات" icon={Clock}>
          {recent_ops.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">لا توجد عمليات بعد</p>
          ) : (
            <div className="space-y-2">
              {recent_ops.slice(0, 6).map(op => {
                const opRaw = op as Operation & { operation_source?: string; duration_ms?: number; correlation_id?: string };
                const srcIsBalance =
                  opRaw.operation_source === 'ana_vodafone_balance' ||
                  (op as unknown as { card_data?: Record<string, unknown> }).card_data?.source === 'ana_vodafone_balance';
                const srcLabel = srcIsBalance ? 'رصيد أنا فودافون'
                  : opRaw.operation_source === 'vodafone_cash' ? 'Vodafone Cash'
                  : op.category ?? 'Vodafone Cash';
                return (
                  <div key={op.id} className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {op.status === 'success'
                          ? <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />
                          : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-xs font-medium">{op.phone_number}</p>
                          <p className="text-[10px] text-muted-foreground">{op.card_type} · {op.amount} ج</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-[10px] text-muted-foreground">{fmt(op.performed_at)}</p>
                        <button
                          onClick={() => { setDetailOp(op as unknown as Operation); setOpSheetOpen(true); }}
                          className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-lg font-semibold hover:bg-primary/20 transition-colors">
                          تفاصيل
                        </button>
                      </div>
                    </div>
                    {/* بادج المصدر + الفئة */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                        srcIsBalance
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      }`}>
                        {srcIsBalance ? '🔴' : '💳'} {srcLabel}
                      </span>
                      {op.status === 'failed' && op.error_message && (
                        <span className="text-[10px] text-destructive bg-destructive/5 border border-destructive/20 px-1.5 py-0.5 rounded-full truncate max-w-[180px]">
                          {op.error_message.split('\n')[0]}
                        </span>
                      )}
                      {op.status === 'success' && (
                        <span className="text-[10px] text-success bg-success/5 border border-success/20 px-1.5 py-0.5 rounded-full">
                          ✓ تمّ بنجاح
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="pt-1">
                <button
                  onClick={() => navigate(`/admin/users/${id}/operations`)}
                  className="w-full text-xs text-primary bg-primary/5 border border-primary/20 py-2.5 rounded-xl font-semibold hover:bg-primary/10 transition-colors">
                  عرض جميع العمليات →
                </button>
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── سجل الأحداث ── */}
        <SectionCard title="سجل الأحداث" icon={Activity}>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">لا يوجد سجل نشاط</p>
          ) : (
            <div className="space-y-2">
              {activity.slice(0, 10).map(a => (
                <div key={a.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-muted/20 border border-border/40">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{a.title || a.event_type}</p>
                    {a.description && <p className="text-[10px] text-muted-foreground mt-0.5">{a.description}</p>}
                  </div>
                  <p className="text-[10px] text-muted-foreground shrink-0">{fmt(a.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── تنقل سريع ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'إجراءات', icon: Shield,     href: `/admin/users/${id}/actions` },
            { label: 'الاشتراك', icon: CreditCard, href: `/admin/users/${id}/subscription` },
            { label: 'العمليات', icon: Zap,        href: `/admin/users/${id}/operations` },
          ].map(item => (
            <button key={item.label} onClick={() => navigate(item.href)}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-card hover:bg-muted/40 hover:border-primary/30 transition-colors">
              <item.icon className="w-5 h-5 text-primary" />
              <span className="text-xs font-semibold">{item.label}</span>
            </button>
          ))}
        </div>

      </div>
      <OpDetailsSheet op={detailOp} open={opSheetOpen} onClose={() => setOpSheetOpen(false)} />
    </AdminShell>
  );
}
