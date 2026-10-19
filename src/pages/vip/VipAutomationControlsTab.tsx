import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import {
  Zap,
  Play,
  Pause,
  Square,
  Clock,
  Layers,
  ShieldCheck,
  Target,
  Cpu,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Activity,
  KeyRound,
  Sliders,
} from 'lucide-react';
import type { VipDashboardData, VipSession } from '@/types/vip';
import { updateVipAutomationSettings } from '@/lib/vipApi';

interface Props {
  data: VipDashboardData;
  activeSession: VipSession;
  onRefresh: () => void;
}

const TARGET_BALANCE_OPTIONS = [
  { value: 50000, label: '50,000 ميكس' },
  { value: 100000, label: '100,000 ميكس' },
  { value: 150000, label: '150,000 ميكس' },
  { value: 200000, label: '200,000 ميكس' },
];

const CYCLE_DELAY_OPTIONS = [
  { value: 10, label: '10 ثوانٍ' },
  { value: 15, label: '15 ثانية' },
  { value: 20, label: '20 ثانية (الافتراضي)' },
  { value: 30, label: '30 ثانية' },
];

export function VipAutomationControlsTab({ data, activeSession, onRefresh }: Props) {
  const { supported_systems } = data;
  const session = activeSession;

  const [enabled, setEnabled] = useState(session.automation_enabled);
  const [selectedTarget, setSelectedTarget] = useState<number>(session.target_mix_balance || 50000);
  const [isCustomTarget, setIsCustomTarget] = useState(
    !TARGET_BALANCE_OPTIONS.some((o) => o.value === session.target_mix_balance)
  );
  const [customTargetValue, setCustomTargetValue] = useState<string>(
    session.custom_target_balance ? String(session.custom_target_balance) : ''
  );

  // Cycle delay seconds (Default 20s as specified in original script instructions)
  const [cycleDelaySeconds, setCycleDelaySeconds] = useState<number>(
    session.cycle_delay_seconds !== undefined ? session.cycle_delay_seconds : 20
  );
  const [isCustomDelay, setIsCustomDelay] = useState(
    !CYCLE_DELAY_OPTIONS.some((o) => o.value === (session.cycle_delay_seconds || 20))
  );
  const [customDelayValue, setCustomDelayValue] = useState<string>(
    String(session.cycle_delay_seconds || 20)
  );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(session.automation_enabled);
    setSelectedTarget(session.target_mix_balance || 50000);
    const matchesTargetPreset = TARGET_BALANCE_OPTIONS.some((o) => o.value === session.target_mix_balance);
    setIsCustomTarget(!matchesTargetPreset);
    if (!matchesTargetPreset && session.target_mix_balance) {
      setCustomTargetValue(String(session.target_mix_balance));
    }

    const currentDelay = session.cycle_delay_seconds !== undefined ? session.cycle_delay_seconds : 20;
    setCycleDelaySeconds(currentDelay);
    const matchesDelayPreset = CYCLE_DELAY_OPTIONS.some((o) => o.value === currentDelay);
    setIsCustomDelay(!matchesDelayPreset);
    setCustomDelayValue(String(currentDelay));
  }, [session]);

  const handleSaveSettings = async (action: 'save' | 'pause' | 'stop' = 'save', newEnabled?: boolean) => {
    setSaving(true);
    try {
      const targetVal = isCustomTarget ? Number(customTargetValue) || 50000 : selectedTarget;
      const delayVal = isCustomDelay ? Number(customDelayValue) || 20 : cycleDelaySeconds;
      const isEn = newEnabled !== undefined ? newEnabled : enabled;

      const res = await updateVipAutomationSettings(
        isEn,
        targetVal,
        isCustomTarget ? Number(customTargetValue) : null,
        action,
        session.id,
        delayVal
      );

      if (res.success) {
        toast.success(`تم حفظ إعدادات الأتمتة للجلسة «${session.session_name}» بنجاح.`);
        onRefresh();
      }
    } catch (err: any) {
      console.error('[VipAutomation] Update error:', err);
      toast.error('فشل تحديث إعدادات الأتمتة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setSaving(false);
    }
  };

  const getWorkerBadge = (status?: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] animate-pulse">شغال الآن</Badge>;
      case 'ready':
        return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px]">جاهز للتشغيل</Badge>;
      case 'paused':
        return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px]">متوقف مؤقتاً</Badge>;
      case 'completed':
        return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">تم بلوغ الهدف</Badge>;
      case 'stopped':
      default:
        return <Badge variant="outline" className="text-muted-foreground border-border text-[10px]">متوقف</Badge>;
    }
  };

  return (
    <div className="space-y-2.5 max-w-4xl" dir="rtl">
      {/* ── Compact Header Bar ── */}
      <div className="p-2.5 sm:p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-foreground truncate">
                إعدادات الأتمتة: {session.session_name}
              </span>
              {getWorkerBadge(session.worker_status)}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              المحرك الخلفي EtisalatBot | دورة #{session.current_cycle || 0}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {session.automation_enabled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSaveSettings('stop', false)}
              disabled={saving}
              className="text-xs h-7 px-2.5 border-destructive/30 text-destructive hover:bg-destructive/10 gap-1"
            >
              <Square className="w-3 h-3" />
              <span>إيقاف</span>
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => handleSaveSettings('save', true)}
              disabled={saving}
              className="text-xs h-7 px-3 bg-primary text-primary-foreground gap-1"
            >
              <Play className="w-3 h-3" />
              <span>بدء الأتمتة</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Worker Status & Current Step Banner ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl border border-border/70 bg-card">
          <span className="text-[10px] text-muted-foreground block">حالة المشغل</span>
          <div className="flex items-center gap-1 mt-0.5">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-foreground font-mono">
              {session.worker_status || 'idle'}
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl border border-border/70 bg-card">
          <span className="text-[10px] text-muted-foreground block">الرصيد المستهدف</span>
          <div className="flex items-center gap-1 mt-0.5">
            <Target className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-bold text-foreground font-mono">
              {(session.target_mix_balance || 50000).toLocaleString('ar-EG')} ميكس
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl border border-border/70 bg-card">
          <span className="text-[10px] text-muted-foreground block">فترة الانتظار بين الدورات</span>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-bold text-foreground font-mono">
              {session.cycle_delay_seconds || 20} ثانية
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl border border-border/70 bg-card">
          <span className="text-[10px] text-muted-foreground block">فاصل استعلام النظام</span>
          <div className="flex items-center gap-1 mt-0.5">
            <RotateCcw className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-bold text-foreground font-mono">
              2 ثانية (ثابت بالمراقبة)
            </span>
          </div>
        </div>
      </div>

      {/* ── Target Selection Card ── */}
      <Card className="border border-border/70 bg-card">
        <CardHeader className="p-3 pb-2 border-b border-border/60">
          <CardTitle className="text-xs font-bold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-primary" />
              الرصيد المستهدف للميكسات (Target Mix)
            </span>
            <span className="text-[10px] font-normal text-muted-foreground">
              تتوقف الدورة تلقائياً عند بلوغ الهدف
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TARGET_BALANCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setIsCustomTarget(false);
                  setSelectedTarget(opt.value);
                }}
                className={`p-2 rounded-lg border text-right transition-all text-xs font-bold ${
                  !isCustomTarget && selectedTarget === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/60 bg-muted/20 hover:bg-muted/40 text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCustomTarget(true)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold shrink-0 transition-all ${
                isCustomTarget
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/60 bg-muted/20 text-muted-foreground'
              }`}
            >
              رقم يدوي مخصص:
            </button>
            <Input
              type="number"
              placeholder="مثال: 75000"
              value={customTargetValue}
              onChange={(e) => {
                setIsCustomTarget(true);
                setCustomTargetValue(e.target.value);
              }}
              className="h-8 text-xs font-mono max-w-xs border-border/70"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Cycle Delay Setting Card (Default 20s) ── */}
      <Card className="border border-border/70 bg-card">
        <CardHeader className="p-3 pb-2 border-b border-border/60">
          <CardTitle className="text-xs font-bold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              مدة الانتظار بين الدورات (Cycle Delay Seconds)
            </span>
            <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-[10px] px-1.5 py-0">
              افتراضي: 20 ثانية
            </Badge>
          </CardTitle>
          <CardDescription className="text-[11px] text-muted-foreground">
            تُطبّق فقط بعد اكتمال الدورة وقبل بدء الدورة التالية. لا تؤثر على فاصل فحص النظام البالغ ثانيتين في حلقة المراقبة.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CYCLE_DELAY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setIsCustomDelay(false);
                  setCycleDelaySeconds(opt.value);
                }}
                className={`p-2 rounded-lg border text-right transition-all text-xs font-bold ${
                  !isCustomDelay && cycleDelaySeconds === opt.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                    : 'border-border/60 bg-muted/20 hover:bg-muted/40 text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCustomDelay(true)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold shrink-0 transition-all ${
                isCustomDelay
                  ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                  : 'border-border/60 bg-muted/20 text-muted-foreground'
              }`}
            >
              مدة مخصصة (بالثواني):
            </button>
            <Input
              type="number"
              min="0"
              placeholder="مثال: 25"
              value={customDelayValue}
              onChange={(e) => {
                setIsCustomDelay(true);
                setCustomDelayValue(e.target.value);
              }}
              className="h-8 text-xs font-mono max-w-[140px] border-border/70"
            />
            <span className="text-[11px] text-muted-foreground">ثانية بعد كل دورة</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Save Settings Button ── */}
      <div className="flex justify-end gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => handleSaveSettings('save')}
          disabled={saving}
          className="text-xs h-8 px-4 bg-primary text-primary-foreground gap-1.5 font-bold"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>حفظ إعدادات الأتمتة وزمن الانتظار</span>
        </Button>
      </div>
    </div>
  );
}
