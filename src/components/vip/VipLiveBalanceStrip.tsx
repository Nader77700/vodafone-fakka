import React from 'react';
import { Crown, Users, Layers, Zap, Activity, ShieldCheck, ArrowRightLeft, Sparkles } from 'lucide-react';
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
  const rawOwnerMix = liveOwnerMix !== null && liveOwnerMix !== undefined ? liveOwnerMix : (session.owner_mix_balance || 0);
  const rawChildMix = liveChildMix !== null && liveChildMix !== undefined ? liveChildMix : (session.individual_mix_balance || 0);

  // DYNAMIC BALANCE DE-DUPLICATION (منع التكرار الوهمي للرصيد وضبط دقة العدادات):
  // During parking/migrating/checking_drop, if the mixes were transferred to child:
  // The child now holds the parked quota. If rawOwnerMix still reflects the pre-transfer snapshot,
  // adjust owner balance to reflect what actually remains at the owner, so totalCombined is 100% accurate!
  let displayOwnerMix = rawOwnerMix;
  let displayChildMix = rawChildMix;
  const isParkedStep = ['parking', 'migrating', 'checking_drop'].includes(currentStep);

  if (isParkedStep && rawChildMix > 0) {
    if (rawOwnerMix >= rawChildMix * 0.85) {
      displayOwnerMix = Math.max(0, rawOwnerMix - rawChildMix);
    }
  } else if (currentStep === 'recovering' || currentStep === 'cooldown' || currentStep === 'verifying') {
    // Recovering or completed recovery: child is zeroed, all quota is at owner
    displayChildMix = 0;
  }

  const ownerMix = displayOwnerMix;
  const childMix = displayChildMix;
  const totalCombined = isParkedStep && rawChildMix > 0 && rawOwnerMix >= rawChildMix * 0.85
    ? rawOwnerMix // Total is the original balance safely preserved at the child + owner remaining
    : (ownerMix + childMix);
  const activePlan = livePlan || session.owner_current_plan || 'حكاية ميكسات 180';

  // Step label & color badge
  const getStepBadge = () => {
    switch (currentStep) {
      case 'parking':
        return { label: 'ركن الميكسات عند الفرد', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
      case 'migrating':
        return { label: 'ترحيل النظام بالسيرفر', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
      case 'checking_drop':
        return { label: 'فحص نزول رصيد الباقة', color: 'bg-sky-500/15 text-sky-400 border-sky-500/30' };
      case 'recovering':
        return { label: 'استرجاع الرصيد للأونر', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
      case 'verifying':
        return { label: 'تأكيد المزامنة النهائية', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
      case 'cooldown':
        return { label: 'استراحة بين الدورات', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' };
      case 'safety_stop':
        return { label: 'توقف أمان حماية الميكسات', color: 'bg-rose-500/20 text-rose-400 border-rose-500/40' };
      case 'stopped':
      case 'idle':
      default:
        return { label: isRunning ? 'الدورة نشطة' : 'جاهز للتشغيل', color: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
    }
  };

  const stepBadge = getStepBadge();

  return (
    <div
      className="w-full mb-2 rounded-xl border border-primary/30 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-2.5 sm:p-3 shadow-md backdrop-blur-md relative overflow-hidden"
      dir="rtl"
    >
      {/* Subtle top indicator bar */}
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
              الرصد اللحظي للرصيد والمزامنة
            </span>
          </div>

          <Badge className={`text-[10px] px-1.5 py-0 font-medium ${stepBadge.color}`}>
            {stepBadge.label}
          </Badge>

          {stepMessage && (
            <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[220px] sm:max-w-[340px]" title={stepMessage}>
              ({stepMessage})
            </span>
          )}
        </div>

        {/* Current Active Plan Badge */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <span className="text-[10px] text-zinc-400 font-medium">النظام المعتمد:</span>
          {activePlan.includes('270') || activePlan.includes('Parent_7') ? (
            <Badge className="text-[10px] px-2 py-0.5 font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm">
              ⚡ {activePlan}
            </Badge>
          ) : activePlan.includes('180') || activePlan.includes('170') || activePlan.includes('Parent_6') ? (
            <Badge className="text-[10px] px-2 py-0.5 font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
              📦 {activePlan}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono border-primary/40 text-primary bg-primary/5">
              {activePlan}
            </Badge>
          )}
        </div>
      </div>

      {/* 4-Item Compact Live Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 pt-2">
        {/* 1. Real-Time Owner Mixes */}
        <div className="flex items-center gap-2 p-1.5 sm:p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 shadow-inner">
          <div className="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Crown className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-zinc-400 font-sans leading-none flex items-center justify-between">
              <span>رصيد الأونر</span>
              {ownerMix > 0 && <span className="text-[9px] text-emerald-400 font-mono font-bold">نشط</span>}
            </div>
            <div className="text-xs sm:text-sm font-bold font-mono text-zinc-100 tracking-tight mt-0.5 truncate">
              {ownerMix.toLocaleString('en-US')}{' '}
              <span className="text-[9px] font-normal text-zinc-400 font-sans">ميكس</span>
            </div>
          </div>
        </div>

        {/* 2. Real-Time Child Parked Mixes */}
        <div className="flex items-center gap-2 p-1.5 sm:p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 shadow-inner">
          <div className="w-7 h-7 rounded-md bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-zinc-400 font-sans leading-none flex items-center justify-between">
              <span>رصيد الفرد</span>
              {childMix > 0 ? (
                <span className="text-[9px] text-sky-400 font-mono font-bold">مركون</span>
              ) : (
                <span className="text-[9px] text-zinc-500 font-mono">مسترجع</span>
              )}
            </div>
            <div className="text-xs sm:text-sm font-bold font-mono text-zinc-100 tracking-tight mt-0.5 truncate">
              {childMix.toLocaleString('en-US')}{' '}
              <span className="text-[9px] font-normal text-zinc-400 font-sans">ميكس</span>
            </div>
          </div>
        </div>

        {/* 3. Combined Total Mixes */}
        <div className="flex items-center gap-2 p-1.5 sm:p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 shadow-inner">
          <div className="w-7 h-7 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-zinc-400 font-sans leading-none">
              إجمالي الميكسات
            </div>
            <div className="text-xs sm:text-sm font-black font-mono text-emerald-400 tracking-tight mt-0.5 truncate">
              {totalCombined.toLocaleString('en-US')}{' '}
              <span className="text-[9px] font-normal text-zinc-400 font-sans">ميكس</span>
            </div>
          </div>
        </div>

        {/* 4. Target vs Current Progress */}
        <div className="flex items-center gap-2 p-1.5 sm:p-2 rounded-lg bg-zinc-900/90 border border-zinc-800/80 shadow-inner">
          <div className="w-7 h-7 rounded-md bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-zinc-400 font-sans leading-none flex items-center justify-between">
              <span>الهدف المطلوب</span>
              <span className="text-[9px] font-mono text-purple-400">
                {Math.round((totalCombined / (session.target_mix_balance || 50000)) * 100)}%
              </span>
            </div>
            <div className="text-xs sm:text-sm font-bold font-mono text-zinc-100 tracking-tight mt-0.5 truncate">
              {(session.target_mix_balance || 50000).toLocaleString('en-US')}{' '}
              <span className="text-[9px] font-normal text-zinc-400 font-sans">ميكس</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
