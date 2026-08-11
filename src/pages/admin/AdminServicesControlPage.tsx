/**
 * AdminServicesControlPage — التحكم في قسم خدماتي
 * - إخفاء/إظهار كل قسم
 * - وضع الصيانة / تعطيل / تفعيل
 * - تحكم في الوصول: مشتركون فقط / الجميع
 * - كل التغييرات تُحفظ في DB فوراً وتنعكس على المستخدمين
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Eye, EyeOff, Wrench, Power, PowerOff, Users, Globe,
  RefreshCw, Loader2, CheckCircle, AlertTriangle, Info,
  ScanLine, RotateCcw, Wallet, CreditCard, ChevronDown,
} from 'lucide-react';
import type { PreviewServiceAccess } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import AdminShell, { SectionCard } from '@/components/admin/AdminShell';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface ServiceControl {
  id: string;
  name: string;
  visible: boolean;
  status: 'active' | 'maintenance' | 'disabled';
  access_mode: PreviewServiceAccess;
  maintenance_message: string | null;
  display_order: number;
  updated_at: string | null;
  updated_by: string | null;
}

// أيقونات ثابتة لكل خدمة
const SERVICE_ICONS: Record<string, React.ReactNode> = {
  services_section:    <Globe className="w-4 h-4" />,
  'legacy-flex':       <RotateCcw className="w-4 h-4" />,
  'balance-charge':    <Wallet className="w-4 h-4" />,
  'vodafone-cash-center': <CreditCard className="w-4 h-4" />,
  'wallet-lines':      <ScanLine className="w-4 h-4" />,
};

// ألوان الحالة
function statusStyle(s: ServiceControl['status']) {
  if (s === 'active')      return { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', border: 'rgba(34,197,94,0.3)',  label: 'نشط' };
  if (s === 'maintenance') return { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)', label: 'صيانة' };
  return                          { bg: 'rgba(239,68,68,0.12)',  color: '#f87171', border: 'rgba(239,68,68,0.3)',  label: 'معطل' };
}

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); }
  catch { return d; }
}

// ── بطاقة تحكم خدمة واحدة ─────────────────────────────────────────
function ServiceCard({
  svc,
  onUpdate,
  saving,
}: {
  svc: ServiceControl;
  onUpdate: (id: string, patch: Partial<ServiceControl>) => void;
  saving: boolean;
}) {
  const st = statusStyle(svc.status);
  const isSection = svc.id === 'services_section';

  return (
    <div
      className="rounded-2xl p-4 border space-y-4 transition-all"
      style={{
        background: isSection ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.03)',
        borderColor: isSection ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)',
      }}
    >
      {/* رأس البطاقة */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
          {SERVICE_ICONS[svc.id] ?? <Globe className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{svc.name}</p>
          <p className="text-[10px] text-white/40">آخر تعديل: {fmt(svc.updated_at)}</p>
        </div>
        {/* badge الحالة */}
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
          {st.label}
        </span>
      </div>

      {/* صف الإخفاء / الإظهار */}
      <div className="flex items-center justify-between p-2.5 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-2">
          {svc.visible
            ? <Eye className="w-3.5 h-3.5 text-green-400" />
            : <EyeOff className="w-3.5 h-3.5 text-white/35" />}
          <span className="text-xs text-white/70">
            {svc.visible ? 'ظاهر للمستخدمين' : 'مخفي من الواجهة'}
          </span>
        </div>
        <Switch
          checked={svc.visible}
          disabled={saving}
          onCheckedChange={v => onUpdate(svc.id, { visible: v })}
        />
      </div>

      {/* حالة الخدمة */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-white/40 px-0.5">حالة الخدمة</p>
        <Select
          value={svc.status}
          disabled={saving}
          onValueChange={v => onUpdate(svc.id, { status: v as ServiceControl['status'] })}
        >
          <SelectTrigger className="h-9 text-xs border-white/10 bg-white/5 text-white">
            <div className="flex items-center gap-2">
              {svc.status === 'active'      && <Power   className="w-3 h-3 text-green-400" />}
              {svc.status === 'maintenance' && <Wrench  className="w-3 h-3 text-amber-400" />}
              {svc.status === 'disabled'    && <PowerOff className="w-3 h-3 text-red-400" />}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">
              <div className="flex items-center gap-2">
                <Power className="w-3 h-3 text-green-400" /> نشط — يعمل بشكل طبيعي
              </div>
            </SelectItem>
            <SelectItem value="maintenance">
              <div className="flex items-center gap-2">
                <Wrench className="w-3 h-3 text-amber-400" /> صيانة — موقف مؤقتاً
              </div>
            </SelectItem>
            <SelectItem value="disabled">
              <div className="flex items-center gap-2">
                <PowerOff className="w-3 h-3 text-red-400" /> معطل — لا أحد يدخله
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* وضع الوصول */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-white/40 px-0.5">صلاحية الوصول</p>
        <Select
          value={svc.access_mode}
          disabled={saving}
          onValueChange={v => onUpdate(svc.id, { access_mode: v as ServiceControl['access_mode'] })}
        >
          <SelectTrigger className="h-9 text-xs border-white/10 bg-white/5 text-white">
            <div className="flex items-center gap-2">
              {svc.access_mode === 'subscribers_only' ? <Users className="w-3 h-3 text-indigo-400" />
                : svc.access_mode === 'preview_available' ? <Eye className="w-3 h-3 text-amber-400" />
                : <Globe className="w-3 h-3 text-emerald-400" />}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="subscribers_only">
              <div className="flex items-center gap-2">
                <Users className="w-3 h-3 text-indigo-400" /> مشتركون فقط (الافتراضي)
              </div>
            </SelectItem>
            <SelectItem value="preview_available">
              <div className="flex items-center gap-2">
                <Eye className="w-3 h-3 text-amber-400" /> متاح للمعاينة
              </div>
            </SelectItem>
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <Globe className="w-3 h-3 text-emerald-400" /> الجميع — مجاني بدون اشتراك
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* تحذير: مفتوح للجميع أو للمعاينة */}
      {svc.access_mode === 'all' && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/8">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-300/80 leading-relaxed">
            هذا القسم مفتوح للجميع بدون اشتراك. تأكد قبل الحفظ.
          </p>
        </div>
      )}
      {svc.access_mode === 'preview_available' && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/8">
          <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-300/80 leading-relaxed">
            هذا القسم يظهر للمستخدمين في وضع المعاينة فقط عند تفعيل Preview Mode.
          </p>
        </div>
      )}
    </div>
  );
}

// ── الصفحة الرئيسية ────────────────────────────────────────────────
export default function AdminServicesControlPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const [services, setServices]   = useState<ServiceControl[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [savingId, setSavingId]   = useState<string | null>(null);

  // Preview Mode state
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewStats, setPreviewStats]   = useState({ active: 0, converted: 0, total: 0 });
  const [togglingPreview, setTogglingPreview] = useState(false);

  const loadPreview = useCallback(async () => {
    const { data: cfg } = await supabase
      .from('core_app_config')
      .select('value')
      .eq('key', 'ff_preview_mode_enabled')
      .maybeSingle();
    setPreviewEnabled(cfg?.value === 'true');

    const [{ count: active }, { count: converted }, { count: total }] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('access_mode', 'preview'),
      supabase.from('preview_mode_logs').select('id', { count: 'exact', head: true }).not('converted_at', 'is', null),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);

    setPreviewStats({
      active: active ?? 0,
      converted: converted ?? 0,
      total: total ?? 0,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }] = await Promise.all([
      supabase.from('services_control').select('*').order('display_order', { ascending: true }),
      loadPreview(),
    ]);
    setLoading(false);
    if (error) { toast.error('فشل تحميل الإعدادات'); return; }
    setServices((data as ServiceControl[]) ?? []);
  }, [loadPreview]);

  useEffect(() => { load(); }, [load]);

  async function togglePreviewMode(enabled: boolean) {
    if (!isAdmin) { toast.error('غير مصرح'); return; }
    setTogglingPreview(true);
    const { error } = await supabase
      .from('core_app_config')
      .update({ value: enabled ? 'true' : 'false', updated_by: profile?.id ?? null })
      .eq('key', 'ff_preview_mode_enabled');
    setTogglingPreview(false);
    if (error) {
      toast.error(`فشل تحديث Preview Mode: ${error.message}`);
    } else {
      setPreviewEnabled(enabled);
      toast.success(enabled ? 'تم تفعيل Preview Mode' : 'تم إيقاف Preview Mode', { duration: 2000 });
    }
  }

  async function handleUpdate(id: string, patch: Partial<ServiceControl>) {
    if (!isAdmin) { toast.error('غير مصرح'); return; }
    setSavingId(id);
    setSaving(true);

    // تحديث محلي فوري (optimistic)
    setServices(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

    const { error } = await supabase
      .from('services_control')
      .update({ ...patch, updated_by: profile?.id ?? null })
      .eq('id', id);

    setSaving(false);
    setSavingId(null);

    if (error) {
      toast.error(`فشل الحفظ: ${error.message}`);
      load(); // أعد التحميل لإلغاء التغيير المحلي
    } else {
      toast.success('تم الحفظ بنجاح', { duration: 1800 });
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" dir="rtl">
        <AlertTriangle className="w-10 h-10 text-destructive" />
        <p className="text-muted-foreground text-sm">غير مصرح لك بالوصول لهذه الصفحة</p>
      </div>
    );
  }

  // فصل القسم الرئيسي عن الأقسام الفرعية
  const mainSection = services.find(s => s.id === 'services_section');
  const subSections = services.filter(s => s.id !== 'services_section');

  return (
    <AdminShell
      title="التحكم في قسم خدماتي"
      subtitle="إدارة الخدمات والصلاحيات من السيرفر مباشرة"
      breadcrumbs={[
        { label: 'لوحة التحكم', href: '/admin' },
        { label: 'التحكم في خدماتي' },
      ]}
    >
      <div className="flex items-start gap-2.5 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/7 mb-4">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-white/55 leading-relaxed">
          كل تغيير يُطبَّق فوراً على جميع المستخدمين بدون الحاجة لتحديث التطبيق.
          الإخفاء يمنع ظهور القسم في الواجهة، والصيانة تُوقف الدخول مع رسالة للمستخدم،
          والتعطيل يحجب بالكامل.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          Preview Mode Control
         ═══════════════════════════════════════════════════════════ */}
      <SectionCard
        title="التحكم في وضع المعاينة (Preview Mode)"
        icon={Eye}
        className="border-amber-500/20 mb-4"
      >
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/4 border border-white/8">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${previewEnabled ? 'bg-amber-400/15 text-amber-400' : 'bg-white/10 text-white/50'}`}>
              <Power className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-black text-white">زر معاينة التطبيق</p>
              <p className="text-[10px] text-white/50">
                {previewEnabled ? 'يظهر في شاشة التفعيل' : 'مخفي عن المستخدمين'}
              </p>
            </div>
          </div>
          <Switch
            checked={previewEnabled}
            disabled={togglingPreview || loading}
            onCheckedChange={togglePreviewMode}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl border border-white/8 bg-white/4 p-3 text-center">
            <p className="text-lg font-black text-amber-400">{previewStats.active}</p>
            <p className="text-[10px] text-white/50">مستخدم في المعاينة</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/4 p-3 text-center">
            <p className="text-lg font-black text-emerald-400">{previewStats.converted}</p>
            <p className="text-[10px] text-white/50">تم تحويلهم</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/4 p-3 text-center">
            <p className="text-lg font-black text-indigo-400">{previewStats.total}</p>
            <p className="text-[10px] text-white/50">إجمالي المستخدمين</p>
          </div>
        </div>

        <p className="text-[10px] text-white/40 px-1 mt-3">
          • إيقاف Preview Mode لا يمنع المستخدمين الحاليين من التصفح، لكنه يمنع أي خدمة مدفوعة من العمل.
          <br />
          • اختر "متاح للمعاينة" من صلاحية الوصول في أي قسم لإتاحته لمستخدمي المعاينة.
        </p>
      </SectionCard>

      {/* زر إعادة التحميل */}
      <div className="flex justify-end mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading || saving}
          className="gap-2 text-xs border-white/15 text-white/60 hover:text-white"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          تحديث
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">

          {/* القسم الرئيسي */}
          {mainSection && (
            <SectionCard
              title="قسم خدماتي — التحكم الرئيسي"
              icon={Globe}
              className="border-indigo-500/20"
            >
              <div className="relative">
                {savingId === mainSection.id && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
                    style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  </div>
                )}
                <ServiceCard svc={mainSection} onUpdate={handleUpdate} saving={saving} />
              </div>
              <p className="text-[10px] text-white/30 px-1 mt-1">
                ⚠ تعطيل هذا القسم يُخفي جميع الخدمات التابعة له من الشاشة الرئيسية
              </p>
            </SectionCard>
          )}

          {/* الأقسام الفرعية */}
          <SectionCard
            title="الأقسام الفرعية داخل خدماتي"
            icon={ChevronDown}
          >
            <div className="space-y-3">
              {subSections.map(svc => (
                <div key={svc.id} className="relative">
                  {savingId === svc.id && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
                      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
                      <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                    </div>
                  )}
                  <ServiceCard svc={svc} onUpdate={handleUpdate} saving={saving} />
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ملاحظة الاشتراك */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-green-500/15 bg-green-500/6">
            <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-white/50 leading-relaxed">
              الافتراضي: جميع الخدمات تستلزم اشتراكاً نشطاً. استخدم زر &quot;الجميع&quot; لفتح قسم معين
              مجاناً مؤقتاً.
            </p>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
