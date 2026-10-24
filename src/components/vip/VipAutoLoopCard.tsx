import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { updateVipAutoEjectSetting } from '@/lib/vipApi';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
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
  AlertTriangle,
  Lock,
} from 'lucide-react';
import type { VipSession } from '@/types/vip';
import type { VipAccessStatus } from '@/services/vipDelegationService';
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
  isDelegatedUser?: boolean;
  vipAccess?: VipAccessStatus | null;
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
  isDelegatedUser = false,
  vipAccess = null,
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
  const [autoEject, setAutoEject] = useState<boolean>(session.auto_eject_child_on_complete ?? false);
  const [isUpdatingAutoEject, setIsUpdatingAutoEject] = useState<boolean>(false);

  useEffect(() => {
    setHasNotifPerm(isVipNotificationGranted());
  }, []);

  // Synchronize target, delay, and auto-eject strictly when session changes
  useEffect(() => {
    setTargetPreset(
      [50000, 100000, 150000, 200000].includes(session.target_mix_balance || 50000)
        ? String(session.target_mix_balance || 50000)
        : 'custom'
    );
    setCustomTarget(String(session.target_mix_balance || 50000));
    setCycleDelay(session.cycle_delay_seconds || 20);
    setAutoEject(session.auto_eject_child_on_complete ?? false);
  }, [session.id, session.target_mix_balance, session.cycle_delay_seconds, session.auto_eject_child_on_complete]);

  const handleToggleAutoEject = async (newVal: boolean) => {
    setAutoEject(newVal);
    setIsUpdatingAutoEject(true);
    try {
      await updateVipAutoEjectSetting(session.id, newVal);
      toast.success(
        newVal
          ? 'تم تفعيل خيار إخراج الفرد تلقائياً بعد اكتمال الجلسة!'
          : 'تم تعطيل خيار الإخراج التلقائي للفرد.'
      );
    } catch (e: any) {
      setAutoEject(!newVal);
      toast.error('تعذر تحديث إعداد الإخراج التلقائي: ' + (e?.message || ''));
    } finally {
      setIsUpdatingAutoEject(false);
    }
  };

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

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleStartClick = () => {
    // If target was already reached, strictly require explicit manual confirmation
    if (
      isTargetReached ||
      session.operation_state === 'completed' ||
      session.current_step === 'completed'
    ) {
      setShowConfirmModal(true);
      return;
    }
    onStartLoop(selectedTarget, cycleDelay);
  };

  const handleConfirmResume = (increaseTarget = false) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(`vip_target_completed_${session.id}`);
      }
    } catch (_) {}

    const targetToRun = increaseTarget ? selectedTarget + 50000 : selectedTarget;
    if (increaseTarget) {
      setCustomTarget(String(targetToRun));
      setTargetPreset('custom');
    }
    setShowConfirmModal(false);
    onStartLoop(targetToRun, cycleDelay);
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
              onClick={handleStartClick}
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

          {/* Parked Mixes Golden Shield Safety Banner */}
          {((session.individual_mix_balance || 0) > 0 || session.stop_reason?.includes('الفرد')) && (
            <div className="mt-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2 text-[11px]">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-right">
                <span className="font-bold text-emerald-400 block">
                  درع الأمان: الرصيد محفوظ ومحمي في حساب الفرد
                </span>
                <span className="text-muted-foreground block text-[10.5px] leading-relaxed">
                  يتم حفظ الميكسات بأمان في حساب الفرد لحين إتمام ترحيل النظام واسترجاعها تلقائياً.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Configuration Row: Target Preset & Cycle Delay */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* Target Select */}
          <div className="p-2.5 rounded-lg border border-border/60 bg-card space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-foreground flex items-center gap-1">
                <Target className="w-3 h-3 text-primary" />
                تحديد الهدف (Target Mix):
              </label>
              {isDelegatedUser && (
                <span className="text-[10px] text-amber-500 font-medium flex items-center gap-0.5">
                  <ShieldCheck className="w-3 h-3" />
                  خانات مصرحة فقط
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {['50000', '100000', '150000', '200000'].map((val) => {
                const pkgNum = parseInt(val);
                const isAllowed = !isDelegatedUser || (vipAccess?.allowed_packages ? vipAccess.allowed_packages.includes(pkgNum) : true);
                return (
                  <button
                    key={val}
                    type="button"
                    disabled={isRunning || !isAllowed}
                    onClick={() => setTargetPreset(val)}
                    title={!isAllowed ? 'هذه الباقة مقيدة ومحجوبة من قبل المالك' : undefined}
                    className={`h-7 rounded text-[10px] font-mono font-bold transition-all border flex items-center justify-center gap-0.5 ${
                      !isAllowed
                        ? 'opacity-40 cursor-not-allowed bg-muted/20 border-border text-muted-foreground'
                        : targetPreset === val
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {!isAllowed && <Lock className="w-2.5 h-2.5" />}
                    <span>{pkgNum / 1000}K</span>
                  </button>
                );
              })}
            </div>

            {(!isDelegatedUser || vipAccess?.allow_custom_amount) && (targetPreset === 'custom' || !['50000', '100000', '150000', '200000'].includes(targetPreset)) ? (
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
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-foreground flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                الفاصل الزمني (بالثواني):
              </label>
              {isDelegatedUser && (
                <span className="text-[10px] text-muted-foreground">محدد من المالك</span>
              )}
            </div>
            <Input
              type="number"
              min={isDelegatedUser ? (vipAccess?.cooldown_seconds || 30) : 5}
              disabled={isRunning || isDelegatedUser}
              value={isDelegatedUser ? (vipAccess?.cooldown_seconds || cycleDelay) : cycleDelay}
              onChange={(e) => setCycleDelay(Math.max(5, parseInt(e.target.value) || 20))}
              className="h-7 text-xs font-mono"
              dir="ltr"
            />
          </div>

          {/* Auto-Eject Child on Complete Toggle directly in Session Auto-Loop Card */}
          <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 flex items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-foreground">
                  إخراج الفرد تلقائياً بعد اكتمال الجلسة (Auto-Eject)
                </span>
                <Badge className={`text-[9px] px-1.5 py-0 font-semibold ${autoEject ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground'}`}>
                  {autoEject ? 'مفعّل ✓' : 'معطّل'}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                ينفذ التسلسل الذكي فور اكتمال الجلسة: تجديد الباقة ➔ انتظار الميكسات ➔ 5 محاولات إخراج بفاصل 20ث ➔ فحص وتكرار ➔ تحويل MINION.
              </p>
            </div>
            <Switch
              checked={autoEject}
              disabled={isUpdatingAutoEject}
              onCheckedChange={handleToggleAutoEject}
            />
          </div>
        </div>
      </CardContent>

      {/* Explicit Manual Confirmation Modal When Target is Already Reached */}
      <AlertDialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              تأكيد استئناف الأتمتة (تم الوصول للهدف سابقاً)
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed pt-2">
              لقد وصل رصيد الجلسة بالفعل إلى الحد المستهدف الحالي ({selectedTarget.toLocaleString('ar-EG')} ميكس).
              لحماية رصيدك وحصص الباقات ومنع أي استهلاك تلقائي غير مقصود، لن تبدأ الدورات إلا بتأكيدك اليدوي الصريح كمالك للنظام.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="p-3 my-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-1">
            <div className="flex items-center justify-between font-bold text-foreground">
              <span>الرصيد الفعلي الحالي:</span>
              <span className="font-mono text-primary">{currentMix.toLocaleString('ar-EG')} ميكس</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>الهدف المضبوط:</span>
              <span className="font-mono">{selectedTarget.toLocaleString('ar-EG')} ميكس</span>
            </div>
          </div>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <AlertDialogCancel
              onClick={() => setShowConfirmModal(false)}
              className="text-xs h-8"
            >
              إلغاء الأمر
            </AlertDialogCancel>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleConfirmResume(false)}
              className="text-xs h-8 font-medium border-border"
            >
              المتابعة بنفس الهدف
            </Button>
            <Button
              size="sm"
              onClick={() => handleConfirmResume(true)}
              className="text-xs h-8 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              رفع الهدف (+50,000) وبدء العمل
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
