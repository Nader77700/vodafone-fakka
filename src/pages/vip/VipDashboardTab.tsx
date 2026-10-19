import React, { useState, useRef } from 'react';
import { toast } from 'sonner';

import type { VipDashboardData, VipSession } from '@/types/vip';
import {
  executeVipCheckStatus,
  executeVipAddChild,
  executeVipChangePlan,
  executeVipRunSingleCycle,
  type VipExecutionLog,
} from '@/lib/vipApi';

import { VipUnifiedMasterCard } from '@/components/vip/VipUnifiedMasterCard';
import { VipAutoLoopCard } from '@/components/vip/VipAutoLoopCard';
import { VipTerminalLogs } from '@/components/vip/VipTerminalLogs';

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

  // Auto Loop States
  const [loopRunning, setLoopRunning] = useState(false);
  const [loopCycle, setLoopCycle] = useState(session?.current_cycle || 0);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
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

  // 1. Comprehensive check status
  const handleCheckStatus = async (silent = false) => {
    if (!session) return;
    setCheckingStatus(true);
    if (!silent) {
      addSingleLog(`[*] بدء فحص شامل وتسجيل دخول للجلسة «${session.session_name}»...`, 'info');
    }
    try {
      const res = await executeVipCheckStatus(session.id);
      appendLogs(res.logs);
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

  // 4. Auto Loop Controller: Executes full cycles sequentially with auto-plan migration
  const handleStartAutoLoop = async (targetMix: number, delaySeconds: number) => {
    if (!session) return;
    stopRequestedRef.current = false;
    setLoopRunning(true);
    addSingleLog(`==================================================`, 'info');
    addSingleLog(
      `=== بدء تشغيل الدورة التلقائية (الهدف: ${targetMix.toLocaleString('ar-EG')} ميكس | الانتظار: ${delaySeconds}ث) ===`,
      'success'
    );

    let cycleCount = loopCycle;

    while (!stopRequestedRef.current) {
      cycleCount += 1;
      setLoopCycle(cycleCount);
      setStepMessage(`جاري تنفيذ الدورة #${cycleCount} (فحص ⟵ تجديد ⟵ تحويل ⟵ ترحيل ⟵ استرجاع)...`);

      try {
        const res = await executeVipRunSingleCycle(session.id);
        appendLogs(res.logs);

        if (!res.success) {
          addSingleLog(`[-] توقفت الدورة: ${res.error || 'حدث خطأ'}`, 'error');
          toast.error(res.error || 'توقفت الدورة التلقائية');
          break;
        }

        onRefresh();

        if (res.target_reached) {
          addSingleLog(
            `[🎉] مبروك! تم الوصول للهدف بنجاح (${(res.final_mix || 0).toLocaleString('ar-EG')} ميكس).`,
            'success'
          );
          toast.success('تم الوصول لرصيد الميكسات المستهدف بنجاح!');
          break;
        }

        // Delay countdown between cycles
        if (delaySeconds > 0 && !stopRequestedRef.current) {
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
        addSingleLog(`[-] خطأ في الدورة: ${err?.message || err}`, 'error');
        toast.error('حدث خطأ في الدورة التلقائية');
        break;
      }
    }

    setLoopRunning(false);
    setCountdownSeconds(null);
    setStepMessage(null);
    addSingleLog(`[*] تم إيقاف الدورة التلقائية.`, 'info');
    onRefresh();
  };

  const handleStopAutoLoop = () => {
    stopRequestedRef.current = true;
    setLoopRunning(false);
    setCountdownSeconds(null);
    setStepMessage('جاري الإيقاف...');
    addSingleLog(`[!] تم طلب إيقاف الدورة التلقائية من قبل المستخدم.`, 'warn');
    toast.info('جاري إيقاف الدورة التلقائية...');
  };

  if (!session) return null;

  return (
    <div className="space-y-3.5 max-w-5xl mx-auto" dir="rtl">
      {/* ── 1. Unified Master Card: «نظام أتمتة اتصالات» (Screenshot 2 Match) ── */}
      <VipUnifiedMasterCard
        session={session}
        onRefreshAll={() => handleCheckStatus(false)}
        refreshing={checkingStatus || refreshing}
        onAddChild={handleAddChild}
        addingChild={addingChild}
        onChangePlan={handleChangePlan}
        changingPlan={changingPlan}
      />

      {/* ── 2. Simplified Auto Loop Controller ── */}
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

      {/* ── 3. Live EtisalatBot Terminal Logs ── */}
      <VipTerminalLogs
        logs={terminalLogs}
        onClear={() => setTerminalLogs([])}
        isRunning={loopRunning || checkingStatus || addingChild || changingPlan}
      />
    </div>
  );
}
