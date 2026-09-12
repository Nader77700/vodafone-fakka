/**
 * AdminDisclaimerTab — لوحة تحكم الأدمن في نظام إخلاء المسؤولية
 * التحكم الكامل: تفعيل/تعطيل، تحرير النص، سياسة الظهور، نشر نسخة جديدة، معاينة
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Eye, FileText, RefreshCw, Save, ScrollText, Shield,
  ToggleLeft, ToggleRight, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import DisclaimerModal from '@/components/common/DisclaimerModal';
import type { DisclaimerConfig } from '@/hooks/useDisclaimer';

const POLICY_LABELS: Record<string, string> = {
  once_per_version: 'مرة واحدة لكل نسخة',
  weekly:           'كل أسبوع',
  monthly:          'كل شهر',
  bimonthly:        'كل شهرين',
  quarterly:        'كل 3 أشهر',
  custom:           'مدة مخصصة',
  always:           'عند كل دخول',
};

interface ConfigRow { key: string; value: string; }

export default function AdminDisclaimerTab() {
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [publishing,setPublishing]= useState(false);
  const [preview,   setPreview]   = useState(false);

  // حالة الإعدادات
  const [enabled,    setEnabled]    = useState(true);
  const [version,    setVersion]    = useState(1);
  const [title,      setTitle]      = useState('إخلاء مسؤولية');
  const [developer,  setDeveloper]  = useState('Nader Akram');
  const [policy,     setPolicy]     = useState<string>('once_per_version');
  const [customDays, setCustomDays] = useState(30);
  const [body,       setBody]       = useState('');

  // إحصائيات الموافقات
  const [stats, setStats] = useState({ total: 0, accepted: 0, rejected: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('core_app_config')
        .select('key, value')
        .in('key', [
          'disclaimer_enabled','disclaimer_version','disclaimer_title',
          'disclaimer_body','disclaimer_developer','disclaimer_show_policy','disclaimer_custom_days',
        ]);
      if (!data) return;
      const get = (k: string, fb = '') => (data as ConfigRow[]).find(r => r.key === k)?.value ?? fb;
      setEnabled(get('disclaimer_enabled','true') === 'true');
      setVersion(parseInt(get('disclaimer_version','1'), 10));
      setTitle(get('disclaimer_title','إخلاء مسؤولية'));
      setDeveloper(get('disclaimer_developer','Nader Akram'));
      setPolicy(get('disclaimer_show_policy','once_per_version'));
      setCustomDays(parseInt(get('disclaimer_custom_days','30'), 10));
      setBody(get('disclaimer_body',''));

      // إحصائيات
      const { data: consents } = await supabase
        .from('disclaimer_consents')
        .select('accepted')
        .eq('version', parseInt(get('disclaimer_version','1'), 10));
      if (consents) {
        const acc = consents.filter(c => c.accepted).length;
        setStats({ total: consents.length, accepted: acc, rejected: consents.length - acc });
      }
    } catch { toast.error('فشل تحميل الإعدادات'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upsert = (key: string, value: string) =>
    supabase.from('core_app_config')
      .upsert({ key, value }, { onConflict: 'key' });

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsert('disclaimer_enabled',    String(enabled)),
        upsert('disclaimer_title',      title),
        upsert('disclaimer_developer',  developer),
        upsert('disclaimer_show_policy',policy),
        upsert('disclaimer_custom_days',String(customDays)),
        upsert('disclaimer_body',       body),
      ]);
      toast.success('تم حفظ الإعدادات');
    } catch { toast.error('فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const handlePublishVersion = async () => {
    setPublishing(true);
    try {
      const newVersion = version + 1;
      await upsert('disclaimer_version', String(newVersion));
      setVersion(newVersion);
      setStats({ total: 0, accepted: 0, rejected: 0 });
      toast.success(`تم نشر النسخة ${newVersion} — سيُطلب من جميع المستخدمين الموافقة مجدداً`);
    } catch { toast.error('فشل نشر النسخة'); }
    finally { setPublishing(false); }
  };

  const previewConfig: DisclaimerConfig = {
    enabled, version, title, body, developer,
    showPolicy: policy as DisclaimerConfig['showPolicy'],
    customDays,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl" dir="rtl">
      {/* ── رأس القسم ───────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.25)' }}>
          <ScrollText className="w-5 h-5" style={{ color: '#E60000' }} />
        </div>
        <div>
          <h2 className="text-base font-black">إخلاء المسؤولية</h2>
          <p className="text-xs text-muted-foreground">إدارة نص وإعدادات وسياسة ظهور الإخلاء</p>
        </div>
        <Button variant="ghost" size="icon" className="mr-auto" onClick={load}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* ── إحصائيات النسخة الحالية ─────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'إجمالي الاستجابات', val: stats.total,    icon: Users,   color: 'text-foreground' },
          { label: 'وافقوا',            val: stats.accepted,  icon: Shield,  color: 'text-success'    },
          { label: 'رفضوا',             val: stats.rejected,  icon: FileText,color: 'text-destructive'},
        ].map(s => (
          <div key={s.label} className="card-premium p-3 space-y-1 text-center">
            <s.icon className={`w-4 h-4 mx-auto ${s.color}`} />
            <p className="text-xl font-black tabular-nums">{s.val}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── تفعيل / تعطيل ───────────────────────────── */}
      <div className="card-premium p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold">حالة الإخلاء الإجباري</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabled ? 'مفعّل — يُعرض على المستخدمين حسب السياسة' : 'متوقف — لا يظهر كإخلاء إجباري'}
          </p>
        </div>
        <button
          onClick={() => setEnabled(v => !v)}
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          {enabled
            ? <ToggleRight className="w-9 h-9" style={{ color: '#E60000' }} />
            : <ToggleLeft  className="w-9 h-9 text-muted-foreground" />}
        </button>
      </div>

      {/* ── النسخة والنشر ───────────────────────────── */}
      <div className="card-premium p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">نسخة الإخلاء الحالية</p>
            <p className="text-xs text-muted-foreground">النسخة: {version}</p>
          </div>
          <Button
            size="sm"
            className="h-9 font-bold"
            style={{ background: '#E60000', color: '#fff', border: 'none' }}
            onClick={handlePublishVersion}
            disabled={publishing}
          >
            {publishing
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : '🚀 نشر نسخة جديدة'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
          ⚠️ نشر نسخة جديدة سيطلب من جميع المستخدمين (بمن فيهم الذين وافقوا مسبقاً) إعادة الموافقة على الإخلاء.
        </p>
      </div>

      {/* ── العنوان واسم المطور ──────────────────────── */}
      <div className="card-premium p-4 space-y-3">
        <p className="text-sm font-bold border-b border-border pb-2">بيانات الإخلاء</p>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">عنوان الإخلاء</Label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="h-9 bg-muted border-border text-right"
            placeholder="إخلاء مسؤولية"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">اسم المطور</Label>
          <Input
            value={developer}
            onChange={e => setDeveloper(e.target.value)}
            className="h-9 bg-muted border-border text-right"
            placeholder="Nader Akram"
          />
        </div>
      </div>

      {/* ── سياسة الظهور ────────────────────────────── */}
      <div className="card-premium p-4 space-y-3">
        <p className="text-sm font-bold border-b border-border pb-2">سياسة الظهور</p>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">طريقة الظهور</Label>
          <Select value={policy} onValueChange={setPolicy}>
            <SelectTrigger className="h-9 bg-muted border-border text-right">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(POLICY_LABELS).map(([val, lbl]) => (
                <SelectItem key={val} value={val}>{lbl}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {policy === 'custom' && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">عدد الأيام</Label>
            <Input
              type="number"
              min={1}
              value={customDays}
              onChange={e => setCustomDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-9 bg-muted border-border text-right w-32"
            />
          </div>
        )}
      </div>

      {/* ── نص الإخلاء ──────────────────────────────── */}
      <div className="card-premium p-4 space-y-3">
        <p className="text-sm font-bold border-b border-border pb-2">نص إخلاء المسؤولية</p>
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          className="min-h-[240px] bg-muted border-border text-right text-sm leading-relaxed resize-y"
          placeholder="أدخل نص إخلاء المسؤولية..."
          dir="rtl"
        />
        <p className="text-[11px] text-muted-foreground">
          استخدم سطرين فارغين (Enter مرتان) للفصل بين الفقرات.
        </p>
      </div>

      {/* ── أزرار الإجراءات ──────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <Button
          className="flex-1 h-11 font-bold"
          style={{ background: '#E60000', color: '#fff', border: 'none' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin ml-2" />
            : <Save className="w-4 h-4 ml-2" />}
          حفظ الإعدادات
        </Button>
        <Button
          variant="outline"
          className="h-11 px-5"
          onClick={() => setPreview(true)}
        >
          <Eye className="w-4 h-4 ml-2" />
          معاينة
        </Button>
      </div>

      {/* معاينة الإخلاء */}
      {preview && (
        <DisclaimerModal
          open={preview}
          mode="readonly"
          config={previewConfig}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}
