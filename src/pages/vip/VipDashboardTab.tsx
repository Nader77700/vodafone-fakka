import React, { useState, useRef, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import type { VipDashboardData, VipSession } from '@/types/vip';
import type { VipAccessStatus } from '@/services/vipDelegationService';
import {
  executeVipCheckStatusStream,
  executeVipAddChild,
  executeVipChangePlan,
  executeVipAdoptLiveBalance,
  executeVipRunSingleCycleStream,
  fetchVipSessionServerLogs,
  type VipExecutionLog,
} from '@/lib/vipApi';
import {
  enableVipBackgroundExecution,
  disableVipBackgroundExecution,
  showVipNotification,
  showVipPersistentNotification,
  sendVipRemotePushNotification,
  requestVipNotificationPermission,
} from '@/lib/vipBackgroundManager';
import { vipRunnerService, VipRunnerState } from '@/lib/vipRunnerService';

import { VipUnifiedMasterCard } from '@/components/vip/VipUnifiedMasterCard';
import { VipAutoLoopCard } from '@/components/vip/VipAutoLoopCard';
import { VipReleaseAndMinionCard } from '@/components/vip/VipReleaseAndMinionCard';
import { VipTerminalLogs } from '@/components/vip/VipTerminalLogs';
import { VipCycleStepper } from '@/components/vip/VipCycleStepper';
import { VipLiveBalanceStrip } from '@/components/vip/VipLiveBalanceStrip';
import { parseBalancesFromLog } from '@/lib/vipRunnerService';

interface Props {
  data: VipDashboardData;
  activeSession: VipSession;
  onRefresh: () => void;
  refreshing: boolean;
  onNavigateTab?: (tab: string) => void;
  isDelegatedUser?: boolean;
  vipAccess?: VipAccessStatus | null;
}

export function VipDashboardTab({
  activeSession,
  onRefresh,
  refreshing,
  onNavigateTab,
  isDelegatedUser = false,
  vipAccess = null,
}: Props) {
  const session = activeSession;

  // Terminal Logs State
  const [terminalLogs, setTerminalLogs] = useState<VipExecutionLog[]>(() => {
    if (session?.id) {
      const runnerState = vipRunnerService.getState(session.id);
      if (runnerState.logs && runnerState.logs.length > 0) {
        return runnerState.logs;
      }
    }
    return [
      {
        time: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
        level: 'info',
        message: `[+] تم تحميل جلسة «${session?.session_name || 'VIP'}». جاهز لبدء العمليات مع Etisalat VIP Bot.`,
      },
    ];
  });

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

  // Live Real-Time Card Synchronizer
  const [liveOwnerMix, setLiveOwnerMix] = useState<number | null>(() => {
    if (session?.id) {
      const runnerState = vipRunnerService.getState(session.id);
      if (runnerState.latestOwnerMix !== undefined) return runnerState.latestOwnerMix;
    }
    return session?.owner_mix_balance !== undefined ? session.owner_mix_balance : null;
  });
  const [liveChildMix, setLiveChildMix] = useState<number | null>(() => {
    if (session?.id) {
      const runnerState = vipRunnerService.getState(session.id);
      if (runnerState.latestChildMix !== undefined) return runnerState.latestChildMix;
    }
    return session?.individual_mix_balance !== undefined ? session.individual_mix_balance : null;
  });
  const [livePlan, setLivePlan] = useState<string | null>(() => {
    if (session?.id) {
      const runnerState = vipRunnerService.getState(session.id);
      if (runnerState.latestOwnerPlan) return runnerState.latestOwnerPlan;
    }
    return session?.owner_current_plan || null;
  });
  const lastCycleRef = useRef<number>(session?.current_cycle || 0);

  // Keep ref for auto loop cancel
  const stopRequestedRef = useRef(false);

  // Atomic State Reset whenever session ID changes
  useEffect(() => {
    if (!session?.id) return;
    const runnerState = vipRunnerService.getState(session.id);
    
    setLoopRunning(runnerState.isRunning);
    setLoopCycle(runnerState.cycleCount || session.current_cycle || 0);
    setCurrentStep(runnerState.currentStep || 'idle');
    setStepMessage(runnerState.stepMessage || 'جاهز لبدء الدورة');
    setCountdownSeconds(null);
    setCheckingStatus(false);
    setAddingChild(false);
    setChangingPlan(false);
    lastCycleRef.current = session.current_cycle || 0;

    setLiveOwnerMix(
      runnerState.latestOwnerMix !== undefined
        ? runnerState.latestOwnerMix
        : (session.owner_mix_balance !== undefined ? session.owner_mix_balance : null)
    );
    setLiveChildMix(
      runnerState.latestChildMix !== undefined
        ? runnerState.latestChildMix
        : (session.individual_mix_balance !== undefined ? session.individual_mix_balance : null)
    );
    setLivePlan(runnerState.latestOwnerPlan || session.owner_current_plan || null);

    if (runnerState.logs && runnerState.logs.length > 0) {
      setTerminalLogs(runnerState.logs);
    } else {
      setTerminalLogs([
        {
          time: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
          level: 'info',
          message: `[+] تم تحميل جلسة «${session.session_name || 'VIP'}». جاهز لبدء العمليات مع Etisalat VIP Bot.`,
        },
      ]);
    }
  }, [session?.id, session?.session_name, session?.current_cycle, session?.owner_mix_balance, session?.individual_mix_balance, session?.owner_current_plan]);

  // Subscribe to Persistent VIP Runner Service
  useEffect(() => {
    if (!session?.id) return;

    const unsubscribe = vipRunnerService.subscribe(session.id, (state) => {
      setLoopRunning(state.isRunning);
      setLoopCycle(state.cycleCount);
      setCurrentStep(state.currentStep);
      setStepMessage(state.stepMessage);
      if (state.logs && state.logs.length > 0) {
        setTerminalLogs(state.logs);
      }
      setLiveOwnerMix(
        state.latestOwnerMix !== undefined
          ? state.latestOwnerMix
          : (session.owner_mix_balance !== undefined ? session.owner_mix_balance : null)
      );
      setLiveChildMix(
        state.latestChildMix !== undefined
          ? state.latestChildMix
          : (session.individual_mix_balance !== undefined ? session.individual_mix_balance : null)
      );
      setLivePlan(
        state.latestOwnerPlan || session.owner_current_plan || null
      );

      // Auto-refresh full session data when a cycle completes
      if (state.cycleCount > lastCycleRef.current) {
        lastCycleRef.current = state.cycleCount;
        onRefresh();
      }
    });

    // Handle return from background (e.g., coming back from WhatsApp or unlocking screen)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && session?.id) {
        // Silently refresh current session data from database without disturbing terminal logs or auto-starting
        onRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session?.id, onRefresh]);

  // Unified Session with Live Real-time Statistics
  const displaySession = useMemo(() => {
    if (!session) return session;
    const effectiveOwnerMix = liveOwnerMix !== null ? liveOwnerMix : session.owner_mix_balance;
    const effectiveChildMix = liveChildMix !== null ? liveChildMix : session.individual_mix_balance;
    const targetMix = session.target_mix_balance || 50000;
    // Target reached is only true if runner loop actually ran and hit the target, OR if session is explicitly marked completed in DB
    const isTargetReached = (loopRunning || session.operation_state === 'completed') && targetMix > 0 && (Number(effectiveOwnerMix) || 0) >= targetMix;
    const isCompleted = session.operation_state === 'completed' || (isTargetReached && loopRunning) || (currentStep === 'completed' && loopRunning);

    return {
      ...session,
      owner_mix_balance: effectiveOwnerMix,
      individual_mix_balance: effectiveChildMix,
      owner_current_plan: livePlan || session.owner_current_plan,
      current_cycle: Math.max(loopCycle, session.current_cycle || 0),
      operation_state: isCompleted ? 'completed' : session.operation_state,
      automation_enabled: isCompleted ? false : session.automation_enabled,
    };
  }, [session, liveOwnerMix, liveChildMix, livePlan, loopCycle, currentStep]);

  // Auto-sync persistent curtain notification on device when live cycle or balance advances
  useEffect(() => {
    if (
      session?.id &&
      (loopRunning || session.automation_enabled || session.operation_state === 'running') &&
      displaySession.operation_state !== 'completed'
    ) {
      const curCycle = displaySession.current_cycle || 0;
      const curMix = Number(displaySession.owner_mix_balance) || 0;
      const curTarget = Number(displaySession.target_mix_balance) || 100000;
      if (curCycle > 0 || curMix > 0) {
        showVipPersistentNotification(
          session.id,
          `الدورة #${curCycle} ناجحة | الرصيد: ${curMix.toLocaleString('ar-EG')} ميكس | الهدف: ${curTarget.toLocaleString('ar-EG')}`
        ).catch(() => {});
      }
    }
  }, [
    session?.id,
    displaySession.current_cycle,
    displaySession.owner_mix_balance,
    loopRunning,
    session?.automation_enabled,
    session?.operation_state,
    displaySession.operation_state,
  ]);

  const appendLogs = (newLogs?: VipExecutionLog[]) => {
    if (!newLogs || newLogs.length === 0) return;
    setTerminalLogs((prev) => [...prev, ...newLogs].slice(-50));
  };

  const addSingleLog = (
    message: string,
    level: 'info' | 'success' | 'warn' | 'error' = 'info'
  ) => {
    const time = new Date().toLocaleTimeString('ar-EG', { hour12: false });
    setTerminalLogs((prev) => [...prev, { time, level, message }].slice(-50));
  };

  // 1. Comprehensive check status with real-time SSE stream
  const handleCheckStatus = async (silent = false) => {
    if (!session) return;
    setCheckingStatus(true);
    if (!silent) {
      addSingleLog(`[*] بدء فحص شامل وتسجيل دخول للجلسة «${session.session_name}»...`, 'info');
    }
    try {
      let streamLogBuffer: VipExecutionLog[] = [];
      let streamFlushTimer: any = null;

      const flushBuffer = () => {
        if (streamLogBuffer.length > 0) {
          const toAdd = streamLogBuffer;
          streamLogBuffer = [];
          setTerminalLogs((prev) => [...prev, ...toAdd].slice(-300));
        }
      };

      const res = await executeVipCheckStatusStream(session.id, undefined, {
        onLog: (liveLog) => {
          streamLogBuffer.push(liveLog);
          if (!streamFlushTimer) {
            streamFlushTimer = setTimeout(() => {
              streamFlushTimer = null;
              flushBuffer();
            }, 100);
          }
          const parsed = parseBalancesFromLog(liveLog.message);
          if (parsed.ownerMix !== undefined) setLiveOwnerMix(parsed.ownerMix);
          if (parsed.childMix !== undefined) setLiveChildMix(parsed.childMix);
          if (parsed.ownerPlan) setLivePlan(parsed.ownerPlan);
        },
      });

      if (streamFlushTimer) {
        clearTimeout(streamFlushTimer);
      }
      flushBuffer();

      if (res.success) {
        if (typeof res.owner_mix_balance === 'number') {
          setLiveOwnerMix(res.owner_mix_balance);
        }
        if (typeof res.child_mix_balance === 'number') {
          setLiveChildMix(res.child_mix_balance);
        }
        if (res.owner_plan) {
          setLivePlan(res.owner_plan);
        }
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

  const [adoptingBalance, setAdoptingBalance] = useState(false);

  // 3b. Adopt Live Balance & Unblock Session
  const handleAdoptLiveBalance = async () => {
    if (!session) return;
    setAdoptingBalance(true);
    addSingleLog(`[*] بدء اعتماد الرصيد الفعلي المباشر وفك حظر الجلسة «${session.session_name}»...`, 'info');
    try {
      const res = await executeVipAdoptLiveBalance(session.id);
      appendLogs(res.logs);
      if (res.success) {
        toast.success(res.message || 'تم اعتماد الرصيد الفعلي وفك الحظر بنجاح!');
        if (res.owner_mix_balance !== undefined) setLiveOwnerMix(res.owner_mix_balance);
        if (res.child_mix_balance !== undefined) setLiveChildMix(res.child_mix_balance);
        if (res.owner_plan) setLivePlan(res.owner_plan);
        onRefresh();
      } else {
        toast.error(res.error || 'فشل اعتماد الرصيد');
      }
    } catch (err: any) {
      addSingleLog(`[-] خطأ أثناء اعتماد الرصيد: ${err?.message || err}`, 'error');
      toast.error(err?.message || 'تعذر اعتماد الرصيد');
    } finally {
      setAdoptingBalance(false);
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

  // 4. Auto Loop Controller: Executes via Persistent Background Runner Service
  const handleStartAutoLoop = async (targetMix: number, delaySeconds: number) => {
    if (!session) return;
    try {
      setLoopRunning(true);
      setStepMessage('جاري تشغيل دورة اتصالات VIP التلقائية في الخلفية...');
      await vipRunnerService.startLoop(session.id, targetMix, delaySeconds);
      toast.success('تم تشغيل دورة اتصالات VIP التلقائية في الخلفية!');
    } catch (err: any) {
      setLoopRunning(false);
      toast.error('تعذر تشغيل الدورة: ' + (err?.message || ''));
    }
  };

  const handleStopAutoLoop = async () => {
    if (!session) return;
    try {
      setLoopRunning(false);
      setStepMessage('تم إيقاف الدورة التلقائية');
      await vipRunnerService.stopLoop(session.id, 'طلب المستخدم');
      toast.info('تم إيقاف الدورة التلقائية بنجاح');
      onRefresh();
    } catch (err: any) {
      toast.error('تعذر إيقاف الدورة: ' + (err?.message || ''));
    }
  };

  const handleClearLogs = () => {
    if (session?.id) {
      vipRunnerService.clearLogs(session.id);
    }
    setTerminalLogs([]);
  };

  if (!session) return null;

  return (
    <div className="space-y-2 max-w-7xl mx-auto" dir="rtl">
      {/* ── 1. Live Horizontal Independent Balances Strip (Full Width) ── */}
      <VipLiveBalanceStrip
        session={displaySession}
        liveOwnerMix={liveOwnerMix}
        liveChildMix={liveChildMix}
        livePlan={livePlan}
        currentStep={currentStep}
        stepMessage={stepMessage}
        isRunning={loopRunning || checkingStatus || addingChild || changingPlan}
      />

      {/* ── 2. Live 5-Step Compact Horizontal Pipeline Strip (Slim & Visible) ── */}
      <VipCycleStepper
        currentStep={currentStep}
        stepMessage={stepMessage}
        isRunning={loopRunning}
      />

      {/* ── 3. Auto Loop Controller (Slim & Direct Controls) ── */}
      <VipAutoLoopCard
        session={displaySession}
        onStartLoop={handleStartAutoLoop}
        onStopLoop={handleStopAutoLoop}
        onRefresh={onRefresh}
        isRunning={
          loopRunning ||
          vipRunnerService.isRunning(session.id)
        }
        isPaused={displaySession.operation_state === 'paused'}
        currentCycle={Math.max(loopCycle, displaySession.current_cycle || 0)}
        countdownSeconds={countdownSeconds}
        stepMessage={stepMessage}
        isDelegatedUser={isDelegatedUser}
        vipAccess={vipAccess}
      />

      {/* ── 4. Main Live Terminal Screen (Full Width, Luxurious, Zero Lag) ── */}
      <VipTerminalLogs
        logs={terminalLogs}
        onClear={handleClearLogs}
        isRunning={loopRunning || checkingStatus || addingChild || changingPlan}
        isDelegatedUser={isDelegatedUser}
      />

      {/* ── 5. Master Account Information (Compact details below console) ── */}
      <VipUnifiedMasterCard
        session={displaySession}
        onRefreshAll={() => handleCheckStatus(false)}
        refreshing={checkingStatus || refreshing}
        onAddChild={handleAddChild}
        addingChild={addingChild}
        onChangePlan={handleChangePlan}
        changingPlan={changingPlan}
        onAdoptLiveBalance={handleAdoptLiveBalance}
        adoptingBalance={adoptingBalance}
      />
    </div>
  );
}
