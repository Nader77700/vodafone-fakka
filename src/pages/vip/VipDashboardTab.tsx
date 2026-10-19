import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown, RefreshCw, Zap, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import type { VipDashboardData, VipSession } from '@/types/vip';
import {
  executeVipCheckStatus,
  executeVipAddChild,
  executeVipRenewBundle,
  executeVipTransferToChild,
  executeVipChangePlan,
  executeVipReturnChildMixes,
  executeVipRunSingleCycle,
  type VipExecutionLog,
} from '@/lib/vipApi';

import { VipOwnerCard } from '@/components/vip/VipOwnerCard';
import { VipChildCard } from '@/components/vip/VipChildCard';
import { VipPlanCard } from '@/components/vip/VipPlanCard';
import { VipManualActionsBar } from '@/components/vip/VipManualActionsBar';
import { VipAutoLoopCard } from '@/components/vip/VipAutoLoopCard';
import { VipTerminalLogs } from '@/components/vip/VipTerminalLogs';

interface Props {
  data: VipDashboardData;
  activeSession: VipSession;
  onRefresh: () => void;
  refreshing: boolean;
  onNavigateTab: (tab: string) => void;
}

export function VipDashboardTab({
  activeSession,
  onRefresh,
  refreshing,
  onNavigateTab,
}: Props) {
  const session = activeSession;

  // Terminal Logs State
  const [terminalLogs, setTerminalLogs] = useState<VipExecutionLog[]>([
    {
      time: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
      level: 'info',
      message: `[+] تم تحميل جلسة «${session.session_name}». جاهز لتنفيذ أوامر EtisalatBot.`,
    },
  ]);

  // Action Loading States
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);

  // Auto Loop States
  const [loopRunning, setLoopRunning] = useState(false);
  const [loopPaused, setLoopPaused] = useState(false);
  const [loopCycle, setLoopCycle] = useState(session.current_cycle || 0);
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

  // 1. Manual Action: Check Status
  const handleCheckStatus = async () => {
    setLoadingAction('check_status');
    addSingleLog(`[*] بدء فحص شامل للجلسة «${session.session_name}»...`, 'info');
    try {
      const res = await executeVipCheckStatus(session.id);
      appendLogs(res.logs);
      if (res.success) {
        toast.success('تم فحص الحالة وتحديث البيانات بنجاح!');
        onRefresh();
      } else {
        toast.error(res.error || 'فشل فحص الحالة');
      }
    } catch (err: any) {
      addSingleLog(`[-] خطأ أثناء فحص الحالة: ${err?.message || err}`, 'error');
      toast.error(err?.message || 'تعذر الاتصال بالخادم');
    } finally {
      setLoadingAction(null);
    }
  };

  // 2. Manual Action: Add Child
  const handleAddChild = async (childNumber: string) => {
    setAddingChild(true);
    addSingleLog(`[*] بدء إجراء إضافة الفرد (${childNumber}) وتأكيد الدعوة...`, 'info');
    try {
      const res = await executeVipAddChild(session.id, childNumber);
      appendLogs(res.logs);
      if (res.success) {
        toast.success(res.message || 'تمت إضافة وتأكيد الفرد بنجاح!');
        onRefresh();
      } else {
        toast.error(res.error || 'فشل إضافة الفرد');
      }
    } catch (err: any) {
      addSingleLog(`[-] خطأ أثناء إضافة الفرد: ${err?.message || err}`, 'error');
      toast.error(err?.message || 'تعذر إضافة الفرد');
    } finally {
      setAddingChild(false);
    }
  };

  // 3. Manual Action: Renew Bundle
  const handleRenewBundle = async () => {
    setLoadingAction('renew_bundle');
    addSingleLog(`[*] إرسال طلب تجديد الباقة للأونر...`, 'info');
    try {
      const res = await executeVipRenewBundle(session.id);
      appendLogs(res.logs);
      if (res.success) {
        toast.success(res.message || 'تم تجديد الباقة بنجاح!');
        onRefresh();
      } else {
        toast.error(res.error || 'فشل تجديد الباقة');
      }
    } catch (err: any) {
      addSingleLog(`[-] خطأ أثناء تجديد الباقة: ${err?.message || err}`, 'error');
      toast.error(err?.message || 'تعذر تجديد الباقة');
    } finally {
      setLoadingAction(null);
    }
  };

  // 4. Manual Action: Transfer to Child
  const handleTransferToChild = async () => {
    setLoadingAction('transfer_to_child');
    addSingleLog(`[*] طلب تحويل كامل ميكسات الأونر للفرد...`, 'info');
    try {
      const res = await executeVipTransferToChild(session.id);
      appendLogs(res.logs);
      if (res.success) {
        toast.success(res.message || 'تم تحويل الميكسات بنجاح!');
        onRefresh();
      } else {
        toast.error(res.error || 'فشل تحويل الميكسات');
      }
    } catch (err: any) {
      addSingleLog(`[-] خطأ أثناء التحويل للفرد: ${err?.message || err}`, 'error');
      toast.error(err?.message || 'تعذر تحويل الميكسات');
    } finally {
      setLoadingAction(null);
    }
  };

  // 5. Manual Action: Change Plan
  const handleChangePlan = async (targetPlan?: '6' | '7') => {
    setLoadingAction('change_plan');
    setChangingPlan(true);
    addSingleLog(`[*] إرسال أمر ترحيل النظام...`, 'info');
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
      setLoadingAction(null);
      setChangingPlan(false);
    }
  };

  // 6. Manual Action: Return Child Mixes
  const handleReturnChildMixes = async () => {
    setLoadingAction('return_child_mixes');
    addSingleLog(`[*] بدء استرجاع ميكسات الفرد إلى الأونر...`, 'info');
    try {
      const res = await executeVipReturnChildMixes(session.id);
      appendLogs(res.logs);
      if (res.success) {
        toast.success(res.message || 'تم استرجاع الميكسات بنجاح!');
        onRefresh();
      } else {
        toast.error(res.error || 'فشل استرجاع ميكسات الفرد');
      }
    } catch (err: any) {
      addSingleLog(`[-] خطأ أثناء استرجاع ميكسات الفرد: ${err?.message || err}`, 'error');
      toast.error(err?.message || 'تعذر استرجاع الميكسات');
    } finally {
      setLoadingAction(null);
    }
  };

  // 7. Auto Loop Controller: Executes full cycles sequentially with delays matching Python script
  const handleStartAutoLoop = async (targetMix: number, delaySeconds: number) => {
    stopRequestedRef.current = false;
    setLoopRunning(true);
    setLoopPaused(false);
    addSingleLog(`==================================================`, 'info');
    addSingleLog(
      `=== بدء تشغيل الدورة التلقائية (الهدف: ${targetMix.toLocaleString('ar-EG')} ميكس | الانتظار: ${delaySeconds}ث) ===`,
      'success'
    );

    let cycleCount = loopCycle;

    while (!stopRequestedRef.current) {
      cycleCount += 1;
      setLoopCycle(cycleCount);
      setStepMessage(`جاري تنفيذ الدورة #${cycleCount} (تجديد ⟵ تحويل ⟵ ترحيل ⟵ استرجاع)...`);

      try {
        const res = await executeVipRunSingleCycle(session.id);
        appendLogs(res.logs);

        if (!res.success) {
          addSingleLog(`[-] توقفت الدورة التلقائية: ${res.error || 'حدث خطأ'}`, 'error');
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

        // Delay between cycles
        if (delaySeconds > 0 && !stopRequestedRef.current) {
          addSingleLog(`[*] استراحة ${delaySeconds} ثانية قبل بدء الدورة القادمة...`, 'info');
          for (let sec = delaySeconds; sec > 0; sec--) {
            if (stopRequestedRef.current) break;
            setCountdownSeconds(sec);
            setStepMessage(`استراحة الدورة القادمة (${sec}ث متبقية)...`);
            await new Promise((r) => setTimeout(r, 1000));
          }
          setCountdownSeconds(null);
        }
      } catch (err: any) {
        addSingleLog(`[-] خطأ فادح أثناء تنفيذ الدورة: ${err?.message || err}`, 'error');
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
    setStepMessage('تم طلب الإيقاف...');
    addSingleLog(`[!] تم طلب إيقاف الدورة التلقائية من قبل المستخدم.`, 'warn');
    toast.info('جاري إيقاف الدورة التلقائية...');
  };

  return (
    <div className="space-y-3 max-w-5xl" dir="rtl">
      {/* ── Top Header Banner ── */}
      <div className="flex items-center justify-between gap-2 p-3 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-foreground truncate">
                جلسة «{session.session_name}»
              </span>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0">
                VIP Etisalat Engine
              </Badge>
              {loopRunning && (
                <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] px-1.5 py-0 animate-pulse">
                  الأتمتة نشطة (#{loopCycle})
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {session.owner_email || 'الأونر لم يُحدد'} ⟵ {session.individual_email || 'الفرد لم يُحدد'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-7 text-xs px-2 gap-1 border-border"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">تحديث</span>
          </Button>
        </div>
      </div>

      {/* ── Section 1: Owner Card & Child Card (Side by Side) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Owner Card */}
        <VipOwnerCard
          session={session}
          onQuickCheck={handleCheckStatus}
          checking={loadingAction === 'check_status'}
        />

        {/* Child Card with Real Add Child Flow */}
        <VipChildCard
          session={session}
          onAddChild={handleAddChild}
          addingChild={addingChild}
        />
      </div>

      {/* ── Section 2: Plan Migration Card (Parent 7 270EGP <-> Parent 6 180EGP) ── */}
      <VipPlanCard
        session={session}
        onChangePlan={handleChangePlan}
        changingPlan={changingPlan}
      />

      {/* ── Section 3: Manual Direct Action Triggers Bar ── */}
      <VipManualActionsBar
        onCheckStatus={handleCheckStatus}
        onRenewBundle={handleRenewBundle}
        onTransferToChild={handleTransferToChild}
        onChangePlan={() => handleChangePlan()}
        onReturnChildMixes={handleReturnChildMixes}
        loadingAction={loadingAction}
      />

      {/* ── Section 4: Auto Loop Controller Card ── */}
      <VipAutoLoopCard
        session={session}
        onStartLoop={handleStartAutoLoop}
        onStopLoop={handleStopAutoLoop}
        isRunning={loopRunning}
        isPaused={loopPaused}
        currentCycle={loopCycle}
        countdownSeconds={countdownSeconds}
        stepMessage={stepMessage}
      />

      {/* ── Section 5: Live Terminal Logs Screen ── */}
      <VipTerminalLogs
        logs={terminalLogs}
        onClear={() => setTerminalLogs([])}
        isRunning={loopRunning || loadingAction !== null}
      />
    </div>
  );
}
