/**
 * AdminHotfixPage — لوحة تحكم HotFix من السيرفر
 * تعطيل/تفعيل الخدمات + بانر الطوارئ بدون رفع تحديث APK
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import BulkGiftPanel from '@/components/admin/BulkGiftPanel';
import { ShieldAlert, Zap, Wifi, ArrowLeftRight, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';

// ── الإعدادات القابلة للتعديل ─────────────────────────────────────────────
interface HotfixSettings {
  hotfix_emergency_banner:               boolean;
  hotfix_emergency_message:              string;
  hotfix_emergency_type:                 'info' | 'warning' | 'error' | 'success';
  hotfix_disable_all_recharge:           boolean;
  hotfix_disable_recharge_message:       string;
  hotfix_disable_line_info:              boolean;
  hotfix_disable_line_info_message:      string;
  hotfix_disable_money_transfer:         boolean;
  hotfix_disable_money_transfer_message: string;
}

async function updateHotfixKey(key: string, value: string): Promise<boolean> {
  const { error } = await supabase
    .from('core_app_config')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key);
  return !error;
}

export default function AdminHotfixPage() {
  const { config, refresh, isLoading } = useRuntimeConfig();
  const sec = config.security;
  const ui  = config.ui;

  const [saving, setSaving] = useState<string | null>(null);

  const [local, setLocal] = useState<HotfixSettings>({
    hotfix_emergency_banner:               ui.hotfix_emergency_banner,
    hotfix_emergency_message:              ui.hotfix_emergency_message,
    hotfix_emergency_type:                 ui.hotfix_emergency_type,
    hotfix_disable_all_recharge:           sec.hotfix_disable_all_recharge,
    hotfix_disable_recharge_message:       ui.hotfix_disable_recharge_message,
    hotfix_disable_line_info:              sec.hotfix_disable_line_info,
    hotfix_disable_line_info_message:      ui.hotfix_disable_line_info_message,
    hotfix_disable_money_transfer:         sec.hotfix_disable_money_transfer,
    hotfix_disable_money_transfer_message: ui.hotfix_disable_money_transfer_message,
  });

  async function save(key: keyof HotfixSettings, val?: string | boolean) {
    const value = val !== undefined ? val : local[key];
    const strVal = typeof value === 'boolean' ? String(value) : (value as string);
    setSaving(key);
    const ok = await updateHotfixKey(key, strVal);
    setSaving(null);
    if (ok) {
      toast.success(`✅ تم تحديث "${key}" بنجاح`);
      await refresh();
    } else {
      toast.error(`❌ فشل تحديث "${key}"`);
    }
  }

  async function toggle(key: keyof HotfixSettings) {
    const newVal = !local[key];
    setLocal(p => ({ ...p, [key]: newVal }));
    await save(key, newVal);
  }

  const activeCount = [
    sec.hotfix_disable_all_recharge,
    sec.hotfix_disable_line_info,
    sec.hotfix_disable_money_transfer,
    ui.hotfix_emergency_banner,
  ].filter(Boolean).length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <ShieldAlert className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold">نظام HotFix</h1>
            <p className="text-xs text-muted-foreground">تعطيل/تفعيل الخدمات من السيرفر — بدون تحديث APK</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" />
              {activeCount} نشط
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* بانر الطوارئ العام */}
      <Card className={ui.hotfix_emergency_banner ? 'border-destructive/50' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            بانر الطوارئ العام
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">تفعيل البانر لكل المستخدمين</span>
            <Switch
              checked={local.hotfix_emergency_banner}
              disabled={saving === 'hotfix_emergency_banner'}
              onCheckedChange={() => toggle('hotfix_emergency_banner')}
            />
          </div>
          <div className="space-y-2">
            <Select
              value={local.hotfix_emergency_type}
              onValueChange={v => setLocal(p => ({ ...p, hotfix_emergency_type: v as HotfixSettings['hotfix_emergency_type'] }))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">معلومات (أزرق)</SelectItem>
                <SelectItem value="warning">تحذير (أصفر)</SelectItem>
                <SelectItem value="error">خطأ (أحمر)</SelectItem>
                <SelectItem value="success">نجاح (أخضر)</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={local.hotfix_emergency_message}
              onChange={e => setLocal(p => ({ ...p, hotfix_emergency_message: e.target.value }))}
              placeholder="نص رسالة الطوارئ..."
              className="text-sm resize-none"
              rows={2}
            />
            <Button size="sm" onClick={() => save('hotfix_emergency_message')} disabled={saving === 'hotfix_emergency_message'} className="w-full">
              {saving === 'hotfix_emergency_message' ? <RefreshCw className="w-3 h-3 animate-spin ml-1" /> : <CheckCircle2 className="w-3 h-3 ml-1" />}
              حفظ رسالة الطوارئ
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Kill Switches */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Kill Switches — إيقاف فوري بدون APK
        </h2>

        {/* الشحن */}
        <KillSwitchCard
          icon={<Zap className="w-4 h-4 text-orange-500" />}
          title="تعطيل كل عمليات الشحن"
          description="يوقف vcc-recharge + ana-balance-charge فوراً"
          active={sec.hotfix_disable_all_recharge}
          localActive={local.hotfix_disable_all_recharge}
          message={local.hotfix_disable_recharge_message}
          savingSwitch={saving === 'hotfix_disable_all_recharge'}
          savingMsg={saving === 'hotfix_disable_recharge_message'}
          onToggle={() => toggle('hotfix_disable_all_recharge')}
          onMsgChange={v => setLocal(p => ({ ...p, hotfix_disable_recharge_message: v }))}
          onMsgSave={() => save('hotfix_disable_recharge_message')}
        />

        {/* معلومات الخط */}
        <KillSwitchCard
          icon={<Wifi className="w-4 h-4 text-blue-500" />}
          title="تعطيل معلومات الخط"
          description="يوقف line-info-query فوراً"
          active={sec.hotfix_disable_line_info}
          localActive={local.hotfix_disable_line_info}
          message={local.hotfix_disable_line_info_message}
          savingSwitch={saving === 'hotfix_disable_line_info'}
          savingMsg={saving === 'hotfix_disable_line_info_message'}
          onToggle={() => toggle('hotfix_disable_line_info')}
          onMsgChange={v => setLocal(p => ({ ...p, hotfix_disable_line_info_message: v }))}
          onMsgSave={() => save('hotfix_disable_line_info_message')}
        />

        {/* تحويل الأموال */}
        <KillSwitchCard
          icon={<ArrowLeftRight className="w-4 h-4 text-purple-500" />}
          title="تعطيل تحويل الأموال"
          description="يوقف vcc-money-transfer فوراً"
          active={sec.hotfix_disable_money_transfer}
          localActive={local.hotfix_disable_money_transfer}
          message={local.hotfix_disable_money_transfer_message}
          savingSwitch={saving === 'hotfix_disable_money_transfer'}
          savingMsg={saving === 'hotfix_disable_money_transfer_message'}
          onToggle={() => toggle('hotfix_disable_money_transfer')}
          onMsgChange={v => setLocal(p => ({ ...p, hotfix_disable_money_transfer_message: v }))}
          onMsgSave={() => save('hotfix_disable_money_transfer_message')}
        />
      </div>

      <p className="text-xs text-muted-foreground text-center pb-4">
        التغييرات تظهر فوراً لكل المستخدمين عبر Realtime — بدون تحديث APK
      </p>

      <Separator />

      {/* ── الهدايا والتعويضات الجماعية ── */}
      <Card>
        <CardContent className="pt-5">
          <BulkGiftPanel />
        </CardContent>
      </Card>
    </div>
  );
}

// ── مكوّن KillSwitchCard ──────────────────────────────────────────────────────
interface KillSwitchCardProps {
  icon:          React.ReactNode;
  title:         string;
  description:   string;
  active:        boolean;
  localActive:   boolean;
  message:       string;
  savingSwitch:  boolean;
  savingMsg:     boolean;
  onToggle:      () => void;
  onMsgChange:   (v: string) => void;
  onMsgSave:     () => void;
}

function KillSwitchCard({ icon, title, description, active, localActive, message, savingSwitch, savingMsg, onToggle, onMsgChange, onMsgSave }: KillSwitchCardProps) {
  return (
    <Card className={active ? 'border-destructive/60 bg-destructive/5' : ''}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {active && <Badge variant="destructive" className="text-xs">مُعطَّل</Badge>}
            <Switch checked={localActive} disabled={savingSwitch} onCheckedChange={onToggle} />
          </div>
        </div>
        <div className="flex gap-2">
          <Textarea
            value={message}
            onChange={e => onMsgChange(e.target.value)}
            placeholder="رسالة تظهر للمستخدم عند التعطيل..."
            className="text-xs resize-none flex-1"
            rows={2}
          />
          <Button size="sm" variant="outline" onClick={onMsgSave} disabled={savingMsg} className="shrink-0 self-end">
            {savingMsg ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
