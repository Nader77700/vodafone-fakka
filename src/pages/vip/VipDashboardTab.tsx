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

    // Check and resume active loop if running in cloud or saved in storage
    vipRunnerService.resumeLoopIfActive(session.id, session.target_mix_balance, session.cycle_delay_seconds)
      .then((resumed) => {
        if (resumed) {
          setLoopRunning(true);
        }
      })
      .catch(() => {});

    // Initial server logs fetch: If client runner logs are empty, load complete persisted audit logs from server DB
    const runnerState = vipRunnerService.getState(session.id);
    if (!runnerState.logs || runnerState.logs.length === 0) {
      fetchVipSessionServerLogs(session.id).then((serverLogs) => {
        if (serverLogs && serverLogs.length > 0) {
          setTerminalLogs(serverLogs);
        }
      }).catch((err) => console.warn('[VipDashboardTab] Fetch server logs error:', err));
    }

    // Handle return from background (e.g., coming back from WhatsApp or unlocking screen)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && session?.id) {
        // Silently fetch the latest server-side database state and cycle updates
        onRefresh();
        vipRunnerService.resumeLoopIfActive(session.id, session.target_mix_balance, session.cycle_delay_seconds)
          .then((resumed) => {
            if (resumed) setLoopRunning(true);
          })
          .catch(() => {});
        fetchVipSessionServerLogs(session.id).then((serverLogs) => {
          if (serverLogs && serverLogs.length > 0) {
            setTerminalLogs(serverLogs);
          }
        }).catch(() => {});

        // Immediately update curtain sticky notification with latest balance and cycle
        const curCycle = Math.max(loopCycle, session.current_cycle || 0);
        const curMix = Number(session.owner_mix_balance) || 0;
        const curTarget = Number(session.target_mix_balance) || 100000;
        if (session.operation_state === 'running' || session.automation_enabled) {
          showVipPersistentNotification(
            session.id,
            `الدورة #${curCycle} ناجحة | الرصيد: ${curMix.toLocaleString('ar-EG')} ميكس | الهدف: ${curTarget.toLocaleString('ar-EG')}`
          ).catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Heartbeat sync interval when session is running to stream server cloud execution updates
    const syncInterval = setInterval(() => {
      const isActuallyRunning =
        session?.id &&
        session.operation_state !== 'stopped' &&
        session.operation_state !== 'completed' &&
        session.operation_state !== 'paused' &&
        (session.operation_state === 'running' ||
          session.automation_enabled === true ||
          vipRunnerService.isRunning(session.id));

      if (isActuallyRunning) {
        onRefresh();
        fetchVipSessionServerLogs(session.id).then((serverLogs) => {
          if (serverLogs && serverLogs.length > 0) {
            setTerminalLogs((prev) => {
              const currentRunner = vipRunnerService.getState(session.id);
              if (currentRunner.isRunning && currentRunner.logs && currentRunner.logs.length > 0) {
                return currentRunner.logs;
              }
              return serverLogs;
            });
          }
        }).catch(() => {});
      }
    }, 6000);

    return () => {
      unsubscribe();
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session?.id, onRefresh]);

  // Unified Session with Live Real-time Statistics
  const displaySession = useMemo(() => {
    if (!session) return session;
    const effectiveOwnerMix = liveOwnerMix !== null ? liveOwnerMix : session.owner_mix_balance;
    const effectiveChildMix = liveChildMix !== null ? liveChildMix : session.individual_mix_balance;
    const targetMix = session.target_mix_balance || 50000;
    const isTargetReached = targetMix > 0 && (Number(effectiveOwnerMix) || 0) >= targetMix;
    const isCompleted = isTargetReached || currentStep === 'completed' || session.operation_state === 'completed';

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
          const parsed = parseBalancesFromLog(liveLog.message);
          if (parsed.ownerMix !== undefined) setLiveOwnerMix(parsed.ownerMix);
          if (parsed.childMix !== undefined) setLiveChildMix(parsed.childMix);
          if (parsed.ownerPlan) setLivePlan(parsed.ownerPlan);
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
      await vipRunnerService.startLoop(session.id, targetMix, delaySeconds);
      toast.success('تم تشغيل دورة اتصالات VIP التلقائية في الخلفية!');
    } catch (err: any) {
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

          {/* Auto Loop Controller */}
          <VipAutoLoopCard
            session={displaySession}
            onStartLoop={handleStartAutoLoop}
            onStopLoop={handleStopAutoLoop}
            isRunning={
              displaySession.operation_state !== 'stopped' &&
              displaySession.operation_state !== 'completed' &&
              displaySession.operation_state !== 'paused' &&
              (loopRunning ||
                displaySession.operation_state === 'running' ||
                displaySession.automation_enabled === true ||
                vipRunnerService.isRunning(session.id))
            }
            isServerRunning={
              displaySession.operation_state !== 'stopped' &&
              displaySession.operation_state !== 'completed' &&
              displaySession.operation_state !== 'paused' &&
              (displaySession.operation_state === 'running' ||
                displaySession.automation_enabled === true)
            }
            isPaused={displaySession.operation_state === 'paused'}
            currentCycle={Math.max(loopCycle, displaySession.current_cycle || 0)}
            countdownSeconds={countdownSeconds}
            stepMessage={stepMessage}
            isDelegatedUser={isDelegatedUser}
            vipAccess={vipAccess}
          />
        </div>

        {/* Right Column (lg: 7 cols): Live Real-Time Balance Strip & Terminal Console */}
        <div className="lg:col-span-7 space-y-2">
          <VipLiveBalanceStrip
            session={displaySession}
            liveOwnerMix={liveOwnerMix}
            liveChildMix={liveChildMix}
            livePlan={livePlan}
            currentStep={currentStep}
            stepMessage={stepMessage}
            isRunning={loopRunning || checkingStatus || addingChild || changingPlan}
          />

          <VipTerminalLogs
            logs={terminalLogs}
            onClear={handleClearLogs}
            isRunning={loopRunning || checkingStatus || addingChild || changingPlan}
            isDelegatedUser={isDelegatedUser}
          />
        </div>
      </div>

      {/* Smart Release & MINION Management Card (Integrated directly inside active session details) */}
      <div className="mt-3">
        <VipReleaseAndMinionCard
          activeSession={displaySession}
          onRefresh={onRefresh}
          isDelegatedUser={isDelegatedUser}
        />
      </div>
    </div>
  );
}
