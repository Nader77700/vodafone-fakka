import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';

import type { VipDashboardData, VipSession } from '@/types/vip';
import {
  executeVipCheckStatusStream,
  executeVipAddChild,
  executeVipChangePlan,
  executeVipRunSingleCycleStream,
  type VipExecutionLog,
} from '@/lib/vipApi';
import {
  enableVipBackgroundExecution,
  disableVipBackgroundExecution,
  showVipNotification,
  sendVipRemotePushNotification,
  requestVipNotificationPermission,
} from '@/lib/vipBackgroundManager';

import { VipUnifiedMasterCard } from '@/components/vip/VipUnifiedMasterCard';
import { VipAutoLoopCard } from '@/components/vip/VipAutoLoopCard';
import { VipTerminalLogs } from '@/components/vip/VipTerminalLogs';
import { VipCycleStepper } from '@/components/vip/VipCycleStepper';

interface Props {
  data: VipDashboardData;
  activeSession: VipSession;
  onRefresh: () => void;
  refreshing: boolean;
  onNavigateTab?: (tab: string) => void;
}

export function VipDashboardTab({
  activeSession,
  onRefresh,
  refreshing,
}: Props) {
  const session = activeSession;

  // Terminal Logs State
  const [terminalLogs, setTerminalLogs] = useState<VipExecutionLog[]>([
    {
      time: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
      level: 'info',
      message: `[+] تم تحميل جلسة «${session?.session_name || 'VIP'}». جاهز لبدء العمليات مع Etisalat VIP Bot.`,
    },
  ]);

  // Action Loading States
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);

  // Auto Loop & Stepper States
  const [loopRunning, setLoopRunning] = useState(false);
  const [loopCycle, setLoopCycle] = useState(session?.current_cycle || 0);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<string>('idle');
  const [stepMessage, setStepMessage] = useState<string | null>(null);

  // Keep ref for auto loop cancel
  const stopRequestedRef = useRef(false);

  const appendLogs = (newLogs?: VipExecutionLog[]) => {
    if (!newLogs || newLogs.length === 0) return;
    setTerminalLogs((prev) => [...prev, ...newLogs]);
  };

  const addSingleLog = (
    message: string,
    level: 'info' | 'success' | 'warn' | 'error' = 'info'
  ) => {
    const time = new Date().toLocaleTimeString('ar-EG', { hour12: false });
    setTerminalLogs((prev) => [...prev, { time, level, message }]);
  };

  // 1. Comprehensive check status with real-time SSE stream
  const handleCheckStatus = async (silent = false) => {
    if (!session) return;
    setCheckingStatus(true);
    if (!silent) {
      addSingleLog(`[*] بدء فحص شامل وتسجيل دخول للجلسة «${session.session_name}»...`, 'info');
    }
    try {
      const res = await executeVipCheckStatusStream(session.id, undefined, {
        onLog: (liveLog) => {
          setTerminalLogs((prev) => [...prev, liveLog]);
        },
      });

      if (res.success) {
        if (!silent) toast.success('تم فحص الحالة وتحديث البيانات بنجاح!');
        onRefresh();
      } else {
        if (!silent) toast.error(res.error || 'فشل فحص الحالة');
      }
    } catch (err: any) {
      addSingleLog(`[-] خطأ أثناء فحص الحالة: ${err?.message || err}`, 'error');
      if (!silent) toast.error(err?.message || 'تعذر الاتصال بالخادم');
    } finally {
      setCheckingStatus(false);
    }
  };

  // 2. Add Child and Confirm
  const handleAddChild = async (childNumber: string) => {
    if (!session) return;
    setAddingChild(true);
    addSingleLog(`[*] بدء إجراءات إضافة وتأكيد الفرد ${childNumber} في عائلة الأونر...`, 'info');
    try {
      const res = await executeVipAddChild(session.id, childNumber);
      appendLogs(res.logs);
      if (res.success) {
        toast.success(res.message || 'تمت إضافة وتأكيد الفرد بنجاح!');
        onRefresh();
      } else {
        toast.error(res.error || 'فشل تأكيد الفرد');
      }
    } catch (err: any) {
      addSingleLog(`[-] خطأ أثناء إضافة الفرد: ${err?.message || err}`, 'error');
      toast.error(err?.message || 'تعذر إضافة الفرد');
    } finally {
      setAddingChild(false);
    }
  };

  // 3. Migrate Plan (e.g. from 240 or switch 6 <-> 7)
  const handleChangePlan = async (targetPlan?: '6' | '7') => {
    if (!session) return;
    setChangingPlan(true);
    addSingleLog(`[*] إرسال أمر ترحيل النظام إلى ${targetPlan === '6' ? 'حكاية ميكسات 180' : 'حكاية ميكسات 270'}...`, 'info');
    try {
      const res = await executeVipChangePlan(session.id, targetPlan);
      appendLogs(res.logs);
      if (res.success) {
        toast.success(res.message || 'تم ترحيل النظام بنجاح!');
        onRefresh();
      } else {
        toast.error(res.error || 'فشل ترحيل النظام');
      }
    } catch (err: any) {
      addSingleLog(`[-] خطأ أثناء ترحيل النظام: ${err?.message || err}`, 'error');
      toast.error(err?.message || 'تعذر ترحيل النظام');
    } finally {
      setChangingPlan(false);
    }
  };

  // Helper to determine if an error is network/stream drop
  const isNetworkGlitch = (errorText?: string | null) => {
    if (!errorText) return false;
    const txt = errorText.toLowerCase();
    return (
      txt.includes('fetch') ||
      txt.includes('network') ||
      txt.includes('abort') ||
      txt.includes('timeout') ||
      txt.includes('failed to fetch') ||
      txt.includes('connection') ||
      txt.includes('load failed') ||
      txt.includes('stream') ||
      txt.includes('offline')
    );
  };

  // 4. Auto Loop Controller: Executes full cycles sequentially with live SSE stream, Stepper & Network Resilience
  const handleStartAutoLoop = async (targetMix: number, delaySeconds: number) => {
    if (!session) return;
    stopRequestedRef.current = false;
    setLoopRunning(true);

    // Request notification permission if not yet decided, and enable background execution
    requestVipNotificationPermission().catch(() => {});
    await enableVipBackgroundExecution();

    addSingleLog(`==================================================`, 'info');
    addSingleLog(
      `=== بدء تشغيل الدورة التلقائية (الهدف: ${targetMix.toLocaleString('ar-EG')} ميكس | الانتظار: ${delaySeconds}ث) ===`,
      'success'
    );
    addSingleLog(`[🛡️] تم تفعيل نظام الصمود أمام انقطاع الإنترنت اللحظي والتشغيل بالخلفية.`, 'info');

    sendVipRemotePushNotification(
      '🚀 بدأت دورة اتصالات VIP التلقائية',
      `الهدف المستهدف: ${targetMix.toLocaleString('ar-EG')} ميكس. النظام يعمل بالخلفية.`
    ).catch(() => {});

    let cycleCount = loopCycle;
    let consecutiveNetworkErrors = 0;
    const MAX_NETWORK_RETRIES = 5;

    while (!stopRequestedRef.current) {
      cycleCount += 1;
      setLoopCycle(cycleCount);
      setCurrentStep('parking');
      setStepMessage(`جاري تنفيذ الدورة #${cycleCount}...`);

      try {
        const res = await executeVipRunSingleCycleStream(session.id, {
          onLog: (liveLog) => {
            setTerminalLogs((prev) => [...prev, liveLog]);
          },
          onStep: (stepInfo) => {
            setCurrentStep(stepInfo.step);
            setStepMessage(stepInfo.detail || stepInfo.title);
          },
        });

        if (!res.success) {
          // Check if this failure is caused by transient network/stream disconnect
          if (isNetworkGlitch(res.error) && consecutiveNetworkErrors < MAX_NETWORK_RETRIES) {
            consecutiveNetworkErrors++;
            addSingleLog(
              `[🌐] انقطاع لحظي في الاتصال أثناء الدورة #${cycleCount}. جاري الصمود وإعادة الاتصال التلقائي (محاولة ${consecutiveNetworkErrors}/${MAX_NETWORK_RETRIES}) خلال 4 ثوانٍ...`,
              'warn'
            );
            setStepMessage(`إعادة الاتصال التلقائي (${consecutiveNetworkErrors}/${MAX_NETWORK_RETRIES})...`);
            await new Promise((r) => setTimeout(r, 4000));
            // Check status silently to see if server finished the cycle on its own
            try {
              await handleCheckStatus(true);
            } catch (_) {}
            cycleCount -= 1; // Retry current cycle
            continue;
          }

          addSingleLog(`[-] توقفت الدورة: ${res.error || 'حدث خطأ'}`, 'error');
          if (res.safety_stop) {
            toast.warning('⚠️ توقف أمان لحماية الميكسات: تم حفظ رصيدك عند الفرد.');
            showVipNotification(
              '⚠️ توقف أمان - حماية الميكسات',
              'لم يؤكد السيرفر نزول الرصيد. تم إيقاف الدورة وميكساتك مركونة بأمان عند الفرد.'
            );
            sendVipRemotePushNotification(
              '⚠️ توقف أمان - اتصالات VIP',
              'تم إيقاف الدورة وميكساتك محفوظة بأمان عند الفرد.'
            ).catch(() => {});
          } else {
            toast.error(res.error || 'توقفت الدورة التلقائية');
            showVipNotification('❌ توقفت الدورة التلقائية', res.error || 'حدث خطأ أثناء تنفيذ الدورة');
          }
          break;
        }

        // Reset consecutive network errors on successful cycle
        consecutiveNetworkErrors = 0;
        onRefresh();

        // Send local and remote push notifications on cycle success
        showVipNotification(
          `🎉 اكتملت الدورة #${cycleCount} بنجاح`,
          `الرصيد الحالي للأونر: ${(res.final_mix || 0).toLocaleString('ar-EG')} ميكس`
        );
        sendVipRemotePushNotification(
          `🎉 دورة #${cycleCount} اتصالات VIP مكتملة`,
          `الرصيد وصل إلى ${(res.final_mix || 0).toLocaleString('ar-EG')} ميكس`
        ).catch(() => {});

        if (res.target_reached) {
          setCurrentStep('completed');
          addSingleLog(
            `[🎉] مبروك! تم الوصول للهدف بنجاح (${(res.final_mix || 0).toLocaleString('ar-EG')} ميكس).`,
            'success'
          );
          toast.success('تم الوصول لرصيد الميكسات المستهدف بنجاح!');
          showVipNotification(
            '🏆 تم الوصول للهدف بنجاح!',
            `مبروك! وصل رصيد الأونر إلى ${(res.final_mix || 0).toLocaleString('ar-EG')} ميكس.`
          );
          sendVipRemotePushNotification(
            '🏆 تم تحقيق الهدف بنجاح!',
            `مبروك! وصل رصيد الأونر إلى ${(res.final_mix || 0).toLocaleString('ar-EG')} ميكس.`
          ).catch(() => {});
          break;
        }

        // Delay countdown between cycles
        if (delaySeconds > 0 && !stopRequestedRef.current) {
          setCurrentStep('cooldown');
          addSingleLog(`[*] استراحة ${delaySeconds} ثانية قبل الدورة القادمة...`, 'info');
          for (let sec = delaySeconds; sec > 0; sec--) {
            if (stopRequestedRef.current) break;
            setCountdownSeconds(sec);
            setStepMessage(`استراحة الدورة القادمة (${sec}ث متبقية)...`);
            await new Promise((r) => setTimeout(r, 1000));
          }
          setCountdownSeconds(null);
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (isNetworkGlitch(errMsg) && consecutiveNetworkErrors < MAX_NETWORK_RETRIES) {
          consecutiveNetworkErrors++;
          addSingleLog(
            `[🌐] انقطاع بالإنترنت/الشبكة أثناء الدورة #${cycleCount}. جاري المحافظة على الدورة وإعادة المحاولة (${consecutiveNetworkErrors}/${MAX_NETWORK_RETRIES})...`,
            'warn'
          );
          setStepMessage(`إعادة الاتصال بالإنترنت (${consecutiveNetworkErrors}/${MAX_NETWORK_RETRIES})...`);
          await new Promise((r) => setTimeout(r, 4000));
          cycleCount -= 1;
          continue;
        }

        addSingleLog(`[-] خطأ في الدورة: ${errMsg}`, 'error');
        toast.error('حدث خطأ في الدورة التلقائية');
        showVipNotification('❌ خطأ في الدورة التلقائية', errMsg || 'تعذر استكمال الدورة');
        break;
      }
    }

    await disableVipBackgroundExecution();
    setLoopRunning(false);
    setCountdownSeconds(null);
    setCurrentStep('idle');
    setStepMessage(null);
    addSingleLog(`[*] تم إيقاف الدورة التلقائية.`, 'info');
    onRefresh();
  };

  const handleStopAutoLoop = async () => {
    stopRequestedRef.current = true;
    await disableVipBackgroundExecution();
    setLoopRunning(false);
    setCountdownSeconds(null);
    setCurrentStep('idle');
    setStepMessage('جاري الإيقاف...');
    addSingleLog(`[!] تم طلب إيقاف الدورة التلقائية من قبل المستخدم.`, 'warn');
    toast.info('جاري إيقاف الدورة التلقائية...');
  };

  // Clean up background lock on unmount
  useEffect(() => {
    return () => {
      disableVipBackgroundExecution().catch(() => {});
    };
  }, []);

  if (!session) return null;

  return (
    <div className="space-y-2 max-w-7xl mx-auto" dir="rtl">
      {/* ── 1. Live 5-Step Compact Horizontal Pipeline Strip (Slim & Visible) ── */}
      <VipCycleStepper
        currentStep={currentStep}
        stepMessage={stepMessage}
        isRunning={loopRunning}
      />

      {/* ── 2. Responsive Side-by-Side Horizontal Layout for Mobile & Desktop ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-2.5 items-start">
        {/* Left Column (lg: 5 cols): Controls & Sessions Overview */}
        <div className="lg:col-span-5 space-y-2">
          {/* Master Info Card */}
          <VipUnifiedMasterCard
            session={session}
            onRefreshAll={() => handleCheckStatus(false)}
            refreshing={checkingStatus || refreshing}
            onAddChild={handleAddChild}
            addingChild={addingChild}
            onChangePlan={handleChangePlan}
            changingPlan={changingPlan}
          />

          {/* Auto Loop Controller */}
          <VipAutoLoopCard
            session={session}
            onStartLoop={handleStartAutoLoop}
            onStopLoop={handleStopAutoLoop}
            isRunning={loopRunning}
            isPaused={false}
            currentCycle={loopCycle}
            countdownSeconds={countdownSeconds}
            stepMessage={stepMessage}
          />
        </div>

        {/* Right Column (lg: 7 cols): Live EtisalatBot Terminal Console */}
        <div className="lg:col-span-7">
          <VipTerminalLogs
            logs={terminalLogs}
            onClear={() => setTerminalLogs([])}
            isRunning={loopRunning || checkingStatus || addingChild || changingPlan}
          />
        </div>
      </div>
    </div>
  );
}
