import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Play,
  Pause,
  Square,
  Zap,
  Target,
  Clock,
  Activity,
  Sparkles,
  Flame,
  CheckCircle2,
  Loader2,
  Bell,
  BellRing,
  ShieldCheck,
} from 'lucide-react';
import type { VipSession } from '@/types/vip';
import {
  requestVipNotificationPermission,
  isVipNotificationGranted,
} from '@/lib/vipBackgroundManager';

interface Props {
  session: VipSession;
  onStartLoop: (targetMix: number, delaySeconds: number) => void;
  onStopLoop: () => void;
  isRunning: boolean;
  isPaused: boolean;
  currentCycle: number;
  countdownSeconds: number | null;
  stepMessage: string | null;
}

export function VipAutoLoopCard({
  session,
  onStartLoop,
  onStopLoop,
  isRunning,
  isPaused,
  currentCycle,
  countdownSeconds,
  stepMessage,
}: Props) {
  const [targetPreset, setTargetPreset] = useState<string>(
    [50000, 100000, 150000, 200000].includes(session.target_mix_balance || 50000)
      ? String(session.target_mix_balance || 50000)
      : 'custom'
  );
  const [customTarget, setCustomTarget] = useState<string>(
    String(session.target_mix_balance || 50000)
  );
  const [cycleDelay, setCycleDelay] = useState<number>(session.cycle_delay_seconds || 20);
  const [hasNotifPerm, setHasNotifPerm] = useState(false);

  useEffect(() => {
    setHasNotifPerm(isVipNotificationGranted());
  }, []);

  // Synchronize target and delay strictly when session changes
  useEffect(() => {
    setTargetPreset(
      [50000, 100000, 150000, 200000].includes(session.target_mix_balance || 50000)
        ? String(session.target_mix_balance || 50000)
        : 'custom'
    );
    setCustomTarget(String(session.target_mix_balance || 50000));
    setCycleDelay(session.cycle_delay_seconds || 20);
  }, [session.id, session.target_mix_balance, session.cycle_delay_seconds]);

  const handleToggleNotifications = async () => {
    const granted = await requestVipNotificationPermission();
    setHasNotifPerm(granted);
  };

  const selectedTarget =
    targetPreset === 'custom' ? parseInt(customTarget, 10) || 50000 : parseInt(targetPreset, 10);

  // Total current balance across owner & child to prevent progress bar flashing 0 during parking
  const currentMix = Math.max(
    session.owner_mix_balance || 0,
    (session.owner_mix_balance || 0) + (session.individual_mix_balance || 0)
  );
  const progressPercent = selectedTarget > 0 ? Math.min(100, Math.round((currentMix / selectedTarget) * 100)) : 0;
  const isTargetReached = currentMix >= selectedTarget && currentMix > 0;

  const handleStart = () => {
    onStartLoop(selectedTarget, cycleDelay);
  };

  return (
    <Card className="border border-border/80 bg-card/90 shadow-md relative overflow-hidden" dir="rtl">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <CardHeader className="p-2.5 sm:p-3 pb-2 border-b border-border/50 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-xs font-bold text-foreground flex items-center gap-1.5 flex-wrap">
              <span>أتمتة الدورات الحية</span>
              {isRunning ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0 animate-pulse">
                  الدورة نشطة (#{currentCycle})
                </Badge>
              ) : isTargetReached ? (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                  تم الوصول للهدف
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground border-border text-[10px] px-1.5 py-0">
                  متوقف
                </Badge>
              )}
            </CardTitle>
            <p className="text-[10px] text-muted-foreground truncate">
              نظام أمان صارم: ركن فوري عند الفرد، ترحيل، فحص نزول الرصيد، ثم استرجاع
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleNotifications}
            className={`h-7 text-[11px] px-2 gap-1 border ${
              hasNotifPerm
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white'
            }`}
            title={hasNotifPerm ? 'إشعارات النظام والخلفية مفعلة' : 'طلب تفعيل إشعارات النظام'}
          >
            {hasNotifPerm ? <BellRing className="w-3.5 h-3.5 text-emerald-400" /> : <Bell className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{hasNotifPerm ? 'الإشعارات نشطة' : 'تفعيل الإشعارات'}</span>
          </Button>

          {isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopLoop}
              className="h-7 text-xs px-2.5 gap-1 font-bold"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>إيقاف الأتمتة</span>
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleStart}
              className="h-7 text-xs px-3 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 font-bold shadow"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>بدء الدورة التلقائية</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-2.5 sm:p-3 space-y-2.5">
        {/* Progress Bar & Target Display */}
        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/70 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary" />
              تقدم الميكسات نحو الهدف:
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-foreground">
                {currentMix.toLocaleString('ar-EG')} / {selectedTarget.toLocaleString('ar-EG')} ميكس
              </span>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0 font-mono">
                {progressPercent}%
              </Badge>
            </div>
          </div>

          <Progress value={progressPercent} className="h-2 bg-muted/80" />

          {/* Status ticker & countdown */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
            <span className="truncate flex items-center gap-1">
              {isRunning && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />}
              {stepMessage || (isRunning ? 'جاري تنفيذ خطوات الدورة...' : 'جاهز للبدء')}
            </span>

            {countdownSeconds !== null && countdownSeconds > 0 && (
              <span className="text-amber-500 font-bold flex items-center gap-1 shrink-0 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                <Clock className="w-3 h-3 animate-pulse" />
                استراحة: {countdownSeconds} ثانية
              </span>
            )}
          </div>
        </div>

        {/* Configuration Row: Target Preset & Cycle Delay */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {/* Target Select */}
          <div className="p-2.5 rounded-lg border border-border/60 bg-card space-y-1.5">
            <label className="text-[11px] font-bold text-foreground flex items-center gap-1">
              <Target className="w-3 h-3 text-primary" />
              تحديد الهدف (Target Mix):
            </label>
            <div className="grid grid-cols-4 gap-1">
              {['50000', '100000', '150000', '200000'].map((val) => (
                <button
                  key={val}
                  type="button"
                  disabled={isRunning}
                  onClick={() => setTargetPreset(val)}
                  className={`h-7 rounded text-[10px] font-mono font-bold transition-all border ${
                    targetPreset === val
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {parseInt(val) / 1000}K
                </button>
              ))}
            </div>

            {targetPreset === 'custom' || !['50000', '100000', '150000', '200000'].includes(targetPreset) ? (
              <Input
                type="number"
                disabled={isRunning}
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                placeholder="أدخل الرقم يدوياً..."
                className="h-7 text-xs font-mono mt-1"
                dir="ltr"
              />
            ) : null}
          </div>

          {/* Cycle Delay Seconds */}
          <div className="p-2.5 rounded-lg border border-border/60 bg-card space-y-1.5">
            <label className="text-[11px] font-bold text-foreground flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-500" />
              الانتظار بين الدورات (بالثواني):
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                disabled={isRunning}
                value={cycleDelay}
                onChange={(e) => setCycleDelay(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="h-7 text-xs font-mono w-24 text-center"
                dir="ltr"
              />
              <span className="text-[11px] text-muted-foreground">ثانية (افتراضي السكريبت: 20 ثانية)</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              فحص نزول الميكسات مطبق تلقائياً كل ثانيتين كما في السكريبت.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
