import React from 'react';
import { Crown, Users, Layers, Sparkles, Activity } from 'lucide-react';
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
  const rawOwnerMix = liveOwnerMix !== null && liveOwnerMix !== undefined ? liveOwnerMix : (session.owner_mix_balance || 0);
  const rawChildMix = liveChildMix !== null && liveChildMix !== undefined ? liveChildMix : (session.individual_mix_balance || 0);

  let displayOwnerMix = rawOwnerMix;
  let displayChildMix = rawChildMix;
  const isParkedStep = ['parking', 'migrating', 'checking_drop', 'waiting_server'].includes(currentStep);

  if (isParkedStep && rawChildMix > 0) {
    if (rawOwnerMix >= rawChildMix * 0.85) {
      displayOwnerMix = Math.max(0, rawOwnerMix - rawChildMix);
    }
  } else if (currentStep === 'recovering' || currentStep === 'cooldown' || currentStep === 'completed') {
    displayChildMix = 0;
  }

  const ownerMix = displayOwnerMix;
  const childMix = displayChildMix;
  const totalCombined = isParkedStep && rawChildMix > 0 && rawOwnerMix >= rawChildMix * 0.85
    ? rawOwnerMix
    : (ownerMix + childMix);
  const activePlan = livePlan || session.owner_current_plan || 'حكاية ميكسات 180';

  return (
    <div
      className="w-full rounded-xl border border-primary/30 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-2 sm:p-2.5 shadow-md backdrop-blur-md relative overflow-hidden"
      dir="rtl"
    >
      {/* Top running pulse line */}
      <div className={`absolute top-0 inset-x-0 h-0.5 ${isRunning ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-primary animate-pulse' : 'bg-primary/30'}`} />

      {/* Ultra-compact horizontal row with all metrics side-by-side */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Owner Mix */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Crown className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-zinc-400 font-sans block leading-none">رصيد الأونر</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-amber-400 tracking-tight leading-tight">
              {ownerMix.toLocaleString('en-US')} <span className="text-[9px] font-normal text-zinc-400 font-sans">ميكس</span>
            </span>
          </div>
        </div>

        {/* Child Mix */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-zinc-400 font-sans block leading-none">
              رصيد الفرد {childMix > 0 ? <span className="text-sky-400 font-mono">(مركون)</span> : <span className="text-zinc-500 font-mono">(مسترجع)</span>}
            </span>
            <span className="text-xs sm:text-sm font-bold font-mono text-sky-400 tracking-tight leading-tight">
              {childMix.toLocaleString('en-US')} <span className="text-[9px] font-normal text-zinc-400 font-sans">ميكس</span>
            </span>
          </div>
        </div>

        {/* Total Mix */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-zinc-400 font-sans block leading-none">إجمالي الميكسات</span>
            <span className="text-xs sm:text-sm font-black font-mono text-emerald-400 tracking-tight leading-tight">
              {totalCombined.toLocaleString('en-US')} <span className="text-[9px] font-normal text-zinc-400 font-sans">ميكس</span>
            </span>
          </div>
        </div>

        {/* Active Plan & Status */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
            <Layers className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="text-[10.5px] font-mono font-bold text-zinc-200 truncate max-w-[130px]">
              {activePlan}
            </span>
          </div>

          <Badge className={`text-[9.5px] px-1.5 py-0.5 font-bold ${
            isRunning ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-300 border-zinc-700'
          }`}>
            {isRunning ? 'الدورة نشطة' : 'جاهز'}
          </Badge>
        </div>
      </div>
    </div>
  );
}
