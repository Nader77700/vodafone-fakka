// صفحة Feature Management — /admin/feature-management
// تشغيل/إيقاف أي Feature فوراً بدون APK جديد
import { useState, useEffect, useCallback } from 'react';
import {
  Zap, RefreshCw, Search, Loader2, CheckCircle,
  XCircle, Clock, Shield, CreditCard, Smartphone,
  ToggleLeft, ToggleRight, Activity, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import AdminShell, { SectionCard } from '@/components/admin/AdminShell';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { formatError } from '@/lib/formatError';


function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}

interface FeatureRow {
  key: string;
  value: string;
  description: string | null;
  category: string | null;
  updated_at: string | null;
}

// تعريف الـ Features مع مجموعاتها
const FEATURE_GROUPS = [
  {
    id: 'ff', label: 'Feature Flags',
    icon: Zap, color: 'text-primary',
    keys: [
      { key: 'ff_maintenance_mode',     label: 'وضع الصيانة',          desc: 'يوقف التطبيق ويعرض شاشة صيانة' },
      { key: 'ff_force_update',         label: 'تحديث إجباري',          desc: 'يجبر المستخدمين على التحديث' },
      { key: 'ff_registration_open',    label: 'فتح التسجيل',           desc: 'السماح بتسجيل مستخدمين جدد' },
      { key: 'ff_show_announcement',    label: 'عرض الإعلان',           desc: 'إظهار شريط الإعلان للمستخدمين' },
    ],
  },
  {
    id: 'cards', label: 'إدارة الكروت',
    icon: CreditCard, color: 'text-warning',
    keys: [
      { key: 'ff_cards_enabled',        label: 'تفعيل الكروت',          desc: 'تشغيل/إيقاف جميع الكروت' },
      { key: 'ff_new_cards_visible',    label: 'عرض الكروت الجديدة',    desc: 'إظهار الكروت الجديدة فوراً' },
      { key: 'ff_recharge_enabled',     label: 'تفعيل الشحن',           desc: 'السماح بتنفيذ عمليات الشحن' },
    ],
  },
  {
    id: 'security', label: 'الأمان',
    icon: Shield, color: 'text-destructive',
    keys: [
      { key: 'ff_device_lock',          label: 'قفل الجهاز',            desc: 'منع الدخول من أجهزة غير مسجّلة' },
      { key: 'ff_session_strict',       label: 'جلسة صارمة',           desc: 'انتهاء الجلسة بعد انقطاع' },
      { key: 'ff_rate_limit',           label: 'تحديد معدل الطلبات',   desc: 'حماية من الإغراق' },
    ],
  },
  {
    id: 'ui', label: 'واجهة المستخدم',
    icon: Smartphone, color: 'text-blue-500',
    keys: [
      { key: 'ff_dark_mode_forced',     label: 'إجبار الوضع الداكن',    desc: 'لجميع المستخدمين' },
      { key: 'ff_show_ads',             label: 'عرض الإعلانات',         desc: 'بانرات ترويجية' },
      { key: 'ff_show_networks_tab',    label: 'تبويب الشبكات',         desc: 'إظهار/إخفاء تبويب الشبكات' },
      { key: 'ff_show_stats_tab',       label: 'تبويب الإحصائيات',     desc: 'إظهار/إخفاء تبويب الإحصائيات' },
    ],
  },
  {
    id: 'ops', label: 'العمليات',
    icon: Activity, color: 'text-success',
    keys: [
      { key: 'ff_ops_logging',          label: 'تسجيل العمليات',        desc: 'حفظ سجل تفصيلي لكل عملية' },
      { key: 'ff_ops_duplicate_check',  label: 'فحص التكرار',           desc: 'منع تكرار نفس العملية' },
      { key: 'ff_notifications_push',   label: 'الإشعارات الفورية',     desc: 'تشغيل/إيقاف Push Notifications' },
    ],
  },
];

export default function AdminFeatureManagement() {
  const { profile } = useAuth();
  const [features, setFeatures] = useState<Record<string, FeatureRow>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<Record<string, boolean>>({});
  const [search,   setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('app_config').select('key,value,description,category,updated_at');
      const map: Record<string, FeatureRow> = {};
      (Array.isArray(data) ? data : []).forEach(r => { map[r.key] = r; });
      setFeatures(map);
    } catch { toast.error('فشل تحميل الـ Features'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key: string, newValue: boolean) => {
    setSaving(p => ({ ...p, [key]: true }));
    try {
      const { error } = await supabase.from('app_config').upsert(
        { key, value: String(newValue), updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      if (error) throw error;
      setFeatures(p => ({ ...p, [key]: { ...p[key], key, value: String(newValue), description: p[key]?.description ?? null, category: p[key]?.category ?? null, updated_at: new Date().toISOString() } }));
      toast.success(`✅ ${key}: ${newValue ? 'مُفعَّل' : 'مُعطَّل'}`);
    } catch (e) { toast.error(`فشل: ${formatError(e)}`); }
    finally { setSaving(p => ({ ...p, [key]: false })); }
  };

  const isEnabled = (key: string) => features[key]?.value === 'true';

  const allKeys = FEATURE_GROUPS.flatMap(g => g.keys);
  const filteredGroups = FEATURE_GROUPS.map(g => ({
    ...g,
    keys: g.keys.filter(k =>
      !search ||
      k.label.includes(search) ||
      k.desc.includes(search) ||
      k.key.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(g => g.keys.length > 0);

  const enabledCount  = allKeys.filter(k => isEnabled(k.key)).length;
  const disabledCount = allKeys.length - enabledCount;

  return (
    <AdminShell
      title="Feature Management"
      subtitle="تشغيل/إيقاف أي ميزة فوراً بدون إصدار APK"
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/admin' },
        { label: 'Feature Management' },
      ]}
      actions={
        <Button size="sm" variant="outline" onClick={load} className="h-8 gap-1">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      }
    >
      <div className="space-y-5">

        {/* ── ملخص ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'إجمالي',    value: allKeys.length,  color: 'text-primary' },
            { label: 'مفعَّلة',  value: enabledCount,    color: 'text-success' },
            { label: 'مُعطَّلة', value: disabledCount,   color: 'text-destructive' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 text-center">
              <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── بحث ── */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث في الـ Features..."
            className="pr-9 h-9"
          />
        </div>

        {/* ── مجموعات الـ Features ── */}
        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl bg-muted" />)}</div>
        ) : (
          filteredGroups.map(group => (
            <SectionCard key={group.id} title={group.label} icon={group.icon}>
              <div className="space-y-3">
                {group.keys.map(feat => {
                  const enabled    = isEnabled(feat.key);
                  const isSaving   = saving[feat.key];
                  const updatedAt  = features[feat.key]?.updated_at;
                  return (
                    <div
                      key={feat.key}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                        enabled ? 'border-success/20 bg-success/5' : 'border-border bg-muted/20'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{feat.label}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${
                            enabled
                              ? 'bg-success/10 text-success border-success/20'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}>
                            {enabled ? 'مفعَّل' : 'مُعطَّل'}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{feat.desc}</p>
                        <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{feat.key}</p>
                        {updatedAt && (
                          <p className="text-[9px] text-muted-foreground/50 mt-0.5">آخر تعديل: {fmt(updatedAt)}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {isSaving ? (
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        ) : (
                          <Switch
                            checked={enabled}
                            onCheckedChange={v => toggle(feat.key, v)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          ))
        )}

        {/* ── جميع الـ Config (raw) ── */}
        <SectionCard title="جميع إعدادات السيرفر (Raw)" icon={Settings}>
          <p className="text-xs text-muted-foreground mb-3">جميع المفاتيح المخزّنة في جدول app_config</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {Object.entries(features)
              .filter(([k]) => !search || k.toLowerCase().includes(search.toLowerCase()))
              .map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">{k}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    v.value === 'true' ? 'bg-success/10 text-success' :
                    v.value === 'false' ? 'bg-muted text-muted-foreground' :
                    'bg-primary/10 text-primary'
                  }`}>
                    {v.value.length > 30 ? v.value.slice(0, 30) + '...' : v.value}
                  </span>
                </div>
              ))}
          </div>
        </SectionCard>

      </div>
    </AdminShell>
  );
}
