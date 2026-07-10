// ServerConfigTab — تبويب إدارة الإعدادات الديناميكية من السيرفر
// يتحكم في Feature Flags + Version Control + Security + UI Messages
// أي تعديل يصل فوراً لجميع المستخدمين بكل الإصدارات بدون APK جديد
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatError } from '@/lib/formatError';
import {
  RefreshCw, Loader2, Save, ToggleLeft, ToggleRight,
  Shield, Zap, Bell, Settings, AlertTriangle, ServerCrash,
  CheckCircle, Lock, Globe, Megaphone,
} from 'lucide-react';

// ── أنواع ──────────────────────────────────────────────────────────────────
interface AppConfigRow {
  id:          string;
  key:         string;
  value:       string;
  value_type:  'string' | 'boolean' | 'number' | 'json';
  category:    string;
  label:       string;
  description: string;
  updated_at:  string;
}

// ── أيقونات الفئات ──────────────────────────────────────────────────────────
const CAT_META: Record<string, { label: string; icon: React.FC<{ className?: string }> }> = {
  feature_flags: { label: 'Feature Flags',       icon: ToggleRight },
  version:       { label: 'التحكم في الإصدارات', icon: Shield },
  security:      { label: 'الأمان',              icon: Lock },
  business:      { label: 'الأعمال',             icon: Zap },
  ui:            { label: 'الواجهة والرسائل',    icon: Megaphone },
  general:       { label: 'عام',                 icon: Settings },
};

// ── دالة حفظ ─────────────────────────────────────────────────────────────────
async function saveConfigKey(key: string, value: string, updatedBy: string) {
  const { error } = await supabase.rpc('upsert_app_config', {
    p_key:        key,
    p_value:      value,
    p_updated_by: updatedBy,
  });
  if (error) throw error;
}

// ── مكوّن بدّال (Toggle) ────────────────────────────────────────────────────
function BooleanToggle({
  row, onSave, saving,
}: { row: AppConfigRow; onSave: (key: string, val: string) => void; saving: boolean }) {
  const active = row.value === 'true';
  return (
    <button
      onClick={() => onSave(row.key, active ? 'false' : 'true')}
      disabled={saving}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors
        ${active
          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
        }`}
      title={active ? 'اضغط لإيقاف' : 'اضغط لتفعيل'}
    >
      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : active
        ? <ToggleRight className="h-3.5 w-3.5" />
        : <ToggleLeft  className="h-3.5 w-3.5" />}
      {active ? 'مُفعَّل' : 'مُعطَّل'}
    </button>
  );
}

// ── حقل تعديل نصي ────────────────────────────────────────────────────────────
function EditableField({
  row, onSave, saving,
}: { row: AppConfigRow; onSave: (key: string, val: string) => void; saving: boolean }) {
  const [val, setVal] = useState(row.value);
  const dirty = val !== row.value;

  return (
    <div className="flex items-center gap-2">
      {row.value_type === 'json' || row.value.length > 60 ? (
        <Textarea
          value={val}
          onChange={e => setVal(e.target.value)}
          className="h-16 resize-none text-xs font-mono"
          dir="ltr"
        />
      ) : (
        <Input
          value={val}
          onChange={e => setVal(e.target.value)}
          className="h-8 text-xs font-mono"
          dir="ltr"
        />
      )}
      <Button
        size="sm"
        disabled={!dirty || saving}
        onClick={() => onSave(row.key, val)}
        className="h-8 gap-1 shrink-0"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        حفظ
      </Button>
    </div>
  );
}

// ── تبويب select لنوع الإعلان ────────────────────────────────────────────────
function AnnouncementTypeSelect({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="info">🔵 معلومة</SelectItem>
        <SelectItem value="warning">🟡 تحذير</SelectItem>
        <SelectItem value="error">🔴 خطأ</SelectItem>
        <SelectItem value="success">🟢 نجاح</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── المكوّن الرئيسي ──────────────────────────────────────────────────────────
export default function ServerConfigTab({ adminEmail }: { adminEmail: string }) {
  const [rows,    setRows]    = useState<AppConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('*')
        .order('category')
        .order('key');
      if (error) throw error;
      setRows((data ?? []) as AppConfigRow[]);
    } catch (e) {
      toast.error('فشل تحميل الإعدادات: ' + formatError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = useCallback(async (key: string, value: string) => {
    setSaving(p => ({ ...p, [key]: true }));
    try {
      await saveConfigKey(key, value, adminEmail);
      setRows(prev => prev.map(r => r.key === key ? { ...r, value, updated_at: new Date().toISOString() } : r));
      toast.success(`✅ تم حفظ "${key}"`);
    } catch (e) {
      toast.error('فشل الحفظ: ' + formatError(e));
    } finally {
      setSaving(p => ({ ...p, [key]: false }));
    }
  }, [adminEmail]);

  // تجميع حسب الفئة
  const grouped = rows.reduce<Record<string, AppConfigRow[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push(r);
    return acc;
  }, {});

  const ORDER = ['feature_flags', 'version', 'security', 'business', 'ui', 'general'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter">
      {/* هيدر */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-lg">إعدادات السيرفر الديناميكية</h2>
            <p className="text-xs text-muted-foreground">كل تعديل يصل فوراً لجميع المستخدمين بجميع الإصدارات</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="gap-1.5 h-8">
          <RefreshCw className="h-3.5 w-3.5" /> تحديث
        </Button>
      </div>

      {/* تحذير مهم */}
      <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          <strong>تنبيه:</strong> التغييرات تُطبَّق فوراً على جميع المستخدمين بما فيهم أصحاب الإصدارات القديمة.
          فكّر جيداً قبل التعديل.
        </p>
      </div>

      {/* الفئات */}
      {ORDER.filter(cat => grouped[cat]?.length).map(cat => {
        const meta = CAT_META[cat] ?? { label: cat, icon: Settings };
        const Icon = meta.icon;
        const items = grouped[cat];

        return (
          <div key={cat} className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* هيدر الفئة */}
            <div className="flex items-center gap-2 bg-muted/40 px-4 py-2.5 border-b border-border">
              <Icon className="h-4 w-4 text-primary shrink-0" />
              <span className="font-bold text-sm">{meta.label}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">{items.length} إعداد</Badge>
            </div>

            {/* الصفوف */}
            <div className="divide-y divide-border">
              {items.map(row => (
                <div key={row.key} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 p-4 items-start">
                  {/* معلومات */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <code className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {row.key}
                      </code>
                      <Badge variant="outline" className="text-[9px] h-4">{row.value_type}</Badge>
                    </div>
                    {row.label && <p className="text-sm font-medium">{row.label}</p>}
                    {row.description && <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>}
                    <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                      آخر تحديث: {new Date(row.updated_at).toLocaleString('ar-EG')}
                    </p>
                  </div>

                  {/* حقل التعديل */}
                  <div className="shrink-0">
                    {row.value_type === 'boolean' ? (
                      <BooleanToggle row={row} onSave={handleSave} saving={!!saving[row.key]} />
                    ) : row.key === 'ui_announcement_type' ? (
                      <AnnouncementTypeSelect
                        value={row.value}
                        onChange={v => handleSave(row.key, v)}
                      />
                    ) : (
                      <EditableField row={row} onSave={handleSave} saving={!!saving[row.key]} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ملخص حالة النظام */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <ServerCrash className="h-4 w-4 text-muted-foreground" />
          <span className="font-bold text-sm">حالة النظام الحالية</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              key: 'ff_maintenance_mode',
              label: 'وضع الصيانة',
              icon: AlertTriangle,
              activeColor: 'text-red-600',
              inactiveColor: 'text-green-600',
            },
            {
              key: 'ff_recharge_enabled',
              label: 'خدمة الشحن',
              icon: Zap,
              activeColor: 'text-green-600',
              inactiveColor: 'text-red-600',
            },
            {
              key: 'ui_announcement_enabled',
              label: 'الإعلان',
              icon: Bell,
              activeColor: 'text-blue-600',
              inactiveColor: 'text-muted-foreground',
            },
            {
              key: 'sec_require_active_sub',
              label: 'اشتراك مطلوب',
              icon: CheckCircle,
              activeColor: 'text-primary',
              inactiveColor: 'text-muted-foreground',
            },
          ].map(({ key, label, icon: Icon, activeColor, inactiveColor }) => {
            const row = rows.find(r => r.key === key);
            const active = row?.value === 'true';
            return (
              <div key={key} className="flex flex-col items-center gap-1 rounded-xl bg-muted/30 p-3 text-center">
                <Icon className={`h-5 w-5 ${active ? activeColor : inactiveColor}`} />
                <span className="text-xs font-medium">{label}</span>
                <span className={`text-[10px] font-bold ${active ? activeColor : inactiveColor}`}>
                  {active ? '✓ مُفعَّل' : '✗ مُعطَّل'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
