import React from 'react';
import { Crown, Users, Sparkles, Activity, Clock, CheckCircle2, AlertCircle, RefreshCw, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { VipSession } from '@/types/vip';

interface Props {
  session: VipSession;
  liveOwnerMix: number | null;
  liveChildMix: number | null;
  livePlan: string | null;
  currentStep: string;
  stepMessage: string | null;
  isRunning: boolean;
}

export function VipLiveBalanceStrip({
  session,
  liveOwnerMix,
  liveChildMix,
  livePlan,
  currentStep,
  stepMessage,
  isRunning,
}: Props) {
  // Determine real-time balances: prioritize live stream parsed balance, fall back to session
  const rawOwnerMix = liveOwnerMix !== null && liveOwnerMix !== undefined ? liveOwnerMix : session.owner_mix_balance;
  const rawChildMix = liveChildMix !== null && liveChildMix !== undefined ? liveChildMix : session.individual_mix_balance;

  const isOwnerUnreadable = session.owner_balance_status === 'unable_to_read' || (rawOwnerMix === null && !isRunning);
  const isChildUnreadable = session.individual_balance_status === 'unable_to_read' || (rawChildMix === null && !isRunning);

  // Dynamic balance adjustments during parked steps
  let displayOwnerMix = rawOwnerMix ?? 0;
  let displayChildMix = rawChildMix ?? 0;
  const isParkedStep = ['parking', 'step_5_transfer_owner_to_child', 'step_6_verify_post_transfer', 'migrating', 'step_7_request_plan_change', 'step_8_monitor_plan_change', 'step_9_verify_child_post_change'].includes(currentStep);

  if (isParkedStep && (rawChildMix ?? 0) > 0) {
    if ((rawOwnerMix ?? 0) >= (rawChildMix ?? 0) * 0.85) {
      displayOwnerMix = Math.max(0, (rawOwnerMix ?? 0) - (rawChildMix ?? 0));
    }
  } else if (['recovering', 'step_10_transfer_child_to_owner', 'step_11_reread_balances', 'step_12_renew_owner_final', 'step_13_record_final_result', 'cooldown'].includes(currentStep)) {
    displayChildMix = 0;
  }

  const ownerMix = displayOwnerMix;
  const childMix = displayChildMix;
  const totalCombined = isOwnerUnreadable
    ? (isChildUnreadable ? null : childMix)
    : (isParkedStep && (rawChildMix ?? 0) > 0 && (rawOwnerMix ?? 0) >= (rawChildMix ?? 0) * 0.85
      ? (rawOwnerMix ?? 0)
      : (ownerMix + childMix));

  const activePlan = livePlan || session.owner_current_plan || 'حكاية ميكسات 180';

  // Helper: format ISO timestamp into localized Egyptian Arabic time string (e.g. 14:32:05)
  const formatTime = (iso?: string | null) => {
    if (!iso) return 'لم تُقرأ بعد';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('ar-EG', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'لم تُقرأ بعد';
    }
  };

  const getStatusBadge = (status?: string, isUnreadable?: boolean) => {
    if (isUnreadable || status === 'unable_to_read') {
      return (
        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 bg-rose-500/20 text-rose-400 border border-rose-500/30 gap-1 font-sans">
          <AlertCircle className="w-2.5 h-2.5" />
          تعذر قراءة الرصيد
        </Badge>
      );
    }
    if (status === 'pending_verification') {
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 font-sans">
          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
          قيد التحقق
        </Badge>
      );
    }
    if (status === 'in_progress' || isRunning) {
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-primary/30 gap-1 font-sans animate-pulse">
          <RefreshCw className="w-2.5 h-2.5" />
          قيد التحديث
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1 font-sans">
        <CheckCircle2 className="w-2.5 h-2.5" />
        مؤكدة
      </Badge>
    );
  };

  return (
    <div
      className="w-full mb-3 rounded-xl border border-primary/30 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-2.5 sm:p-3 shadow-md backdrop-blur-md relative overflow-hidden"
      dir="rtl"
    >
      {/* Top indicator bar */}
      <div className={`absolute top-0 inset-x-0 h-0.5 ${isRunning ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-primary animate-pulse' : 'bg-primary/30'}`} />

      {/* Main Strip: Header & Summary in One Slim Line */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRunning ? 'bg-emerald-400 opacity-75' : 'bg-zinc-500 opacity-30'}`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isRunning ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            </span>
            <span className="text-[11px] font-bold text-zinc-200 tracking-wide">
              الرصد المباشر للأرصدة المستقلة
            </span>
          </div>

          {session.is_simulation_mode && (
            <Badge className="text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-300 border-purple-500/40 gap-1 font-mono">
              <FlaskConical className="w-3 h-3" />
              وضع المحاكاة ({session.simulation_scenario || 'اختبار آمن'})
            </Badge>
          )}

          {stepMessage && (
            <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[200px] sm:max-w-[320px]" title={stepMessage}>
              ({stepMessage})
            </span>
          )}
        </div>

        {/* Current Active Plan Badge */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <span className="text-[10px] text-zinc-400 font-medium">النظام المعتمد للأونر:</span>
          {activePlan.includes('270') || activePlan.includes('Parent_7') ? (
            <Badge className="text-[10px] px-2 py-0.5 font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm">
              ⚡ {activePlan}
            </Badge>
          ) : (
            <Badge className="text-[10px] px-2 py-0.5 font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
              📦 {activePlan}
            </Badge>
          )}
        </div>
      </div>

      {/* 4-Item Live Metrics Grid: Owner, Child, Combined, Target */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
        {/* 1. Real-Time Owner Mixes */}
        <div className="p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 shadow-inner flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Crown className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] font-bold text-zinc-200">رصيد الأونر</span>
            </div>
            {getStatusBadge(session.owner_balance_status, isOwnerUnreadable)}
          </div>

          <div className="text-sm sm:text-base font-bold font-mono tracking-tight mt-0.5">
            {isOwnerUnreadable ? (
              <span className="text-rose-400 text-xs font-sans font-bold">تعذر قراءة الرصيد</span>
            ) : (
              <span className="text-zinc-100">
                {ownerMix.toLocaleString('en-US')}{' '}
                <span className="text-[10px] font-normal text-zinc-400 font-sans">ميكس</span>
              </span>
            )}
          </div>

          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1 mt-1 pt-1 border-t border-zinc-800/60">
            <Clock className="w-2.5 h-2.5" />
            <span>آخر قراءة: {formatTime(session.last_owner_refresh_at)}</span>
          </div>
        </div>

        {/* 2. Real-Time Child Parked Mixes */}
        <div className="p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 shadow-inner flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                <Users className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] font-bold text-zinc-200">رصيد الفرد</span>
            </div>
            {getStatusBadge(session.individual_balance_status, isChildUnreadable)}
          </div>

          <div className="text-sm sm:text-base font-bold font-mono tracking-tight mt-0.5">
            {isChildUnreadable ? (
              <span className="text-rose-400 text-xs font-sans font-bold">تعذر قراءة الرصيد</span>
            ) : (
              <span className="text-zinc-100">
                {childMix.toLocaleString('en-US')}{' '}
                <span className="text-[10px] font-normal text-zinc-400 font-sans">ميكس</span>
              </span>
            )}
          </div>

          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1 mt-1 pt-1 border-t border-zinc-800/60">
            <Clock className="w-2.5 h-2.5" />
            <span>آخر قراءة: {formatTime(session.last_individual_refresh_at)}</span>
          </div>
        </div>

        {/* 3. Combined Total Mixes */}
        <div className="p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 shadow-inner flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] font-bold text-zinc-200">إجمالي الميكسات</span>
            </div>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-sans">
              حساب مجمّع
            </Badge>
          </div>

          <div className="text-sm sm:text-base font-black font-mono tracking-tight text-emerald-400 mt-0.5">
            {totalCombined === null ? (
              <span className="text-amber-400 text-xs font-sans">في انتظار تأكيد القراءة</span>
            ) : (
              <span>
                {totalCombined.toLocaleString('en-US')}{' '}
                <span className="text-[10px] font-normal text-zinc-400 font-sans">ميكس</span>
              </span>
            )}
          </div>

          <div className="text-[10px] text-zinc-400 font-sans flex items-center gap-1 mt-1 pt-1 border-t border-zinc-800/60">
            <span>يشمل ميكسات الأونر + الفرد المركونة</span>
          </div>
        </div>

        {/* 4. Target vs Current Progress */}
        <div className="p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 shadow-inner flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                <Activity className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] font-bold text-zinc-200">الهدف المطلوب</span>
            </div>
            {totalCombined !== null && (
              <span className="text-[10px] font-mono font-bold text-purple-400">
                {Math.round(((totalCombined) / (session.target_mix_balance || 50000)) * 100)}%
              </span>
            )}
          </div>

          <div className="text-sm sm:text-base font-bold font-mono text-zinc-100 tracking-tight mt-0.5">
            {(session.target_mix_balance || 50000).toLocaleString('en-US')}{' '}
            <span className="text-[10px] font-normal text-zinc-400 font-sans">ميكس</span>
          </div>

          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1 mt-1 pt-1 border-t border-zinc-800/60">
            <span>المتبقي: {totalCombined !== null ? Math.max(0, (session.target_mix_balance || 50000) - totalCombined).toLocaleString('en-US') : '—'} ميكس</span>
          </div>
        </div>
      </div>
    </div>
  );
}
