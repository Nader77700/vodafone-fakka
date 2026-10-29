import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Clock,
  ArrowDownLeft,
  CheckCircle2,
  ArrowLeftRight,
  Eye,
  Users,
  ArrowUpRight,
  RotateCcw,
  Sparkles,
  Award,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { VIP_STANDARD_13_STEPS, VipStepKey } from '@/types/vip';

interface Props {
  currentStep: string;
  stepMessage?: string | null;
  isRunning?: boolean;
}

const STEP_ICONS: Record<string, React.ElementType> = {
  step_1_auth_check: ShieldCheck,
  step_2_read_initial_status: Search,
  step_3_renew_owner_initial: RefreshCw,
  step_4_wait_and_recheck: Clock,
  step_5_transfer_owner_to_child: ArrowDownLeft,
  step_6_verify_post_transfer: CheckCircle2,
  step_7_request_plan_change: ArrowLeftRight,
  step_8_monitor_plan_change: Eye,
  step_9_verify_child_post_change: Users,
  step_10_transfer_child_to_owner: ArrowUpRight,
  step_11_reread_balances: RotateCcw,
  step_12_renew_owner_final: Sparkles,
  step_13_record_final_result: Award,
};

export function VipCycleStepper({ currentStep, stepMessage, isRunning = false }: Props) {
  // Map currentStep to 1-based index (1..13)
  const getActiveStepNumber = (step: string): number => {
    const found = VIP_STANDARD_13_STEPS.find((s) => s.key === step);
    if (found) return found.num;
    // Map legacy / short names to 13 steps
    switch (step) {
      case 'auth':
      case 'step_1_auth_check':
        return 1;
      case 'step_2_read_initial_status':
        return 2;
      case 'step_3_renew_owner_initial':
        return 3;
      case 'step_4_wait_and_recheck':
        return 4;
      case 'parking':
      case 'step_5_transfer_owner_to_child':
        return 5;
      case 'step_6_verify_post_transfer':
        return 6;
      case 'migrating':
      case 'step_7_request_plan_change':
        return 7;
      case 'waiting_server':
      case 'step_8_monitor_plan_change':
        return 8;
      case 'step_9_verify_child_post_change':
        return 9;
      case 'recovering':
      case 'step_10_transfer_child_to_owner':
        return 10;
      case 'step_11_reread_balances':
        return 11;
      case 'step_12_renew_owner_final':
        return 12;
      case 'cooldown':
      case 'completed':
      case 'step_13_record_final_result':
        return 13;
      default:
        return 0;
    }
  };

  const activeNum = getActiveStepNumber(currentStep);
  const isFailed = currentStep === 'error' || currentStep === 'safety_stop';

  return (
    <Card className="border border-border/80 bg-card/95 shadow-xs overflow-hidden mb-3" dir="rtl">
      <CardContent className="p-2 sm:p-3">
        {/* Header indicator */}
        <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-border/40">
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2.5 w-2.5">
              {isRunning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isFailed
                    ? 'bg-rose-500'
                    : isRunning
                    ? 'bg-emerald-500'
                    : activeNum === 13
                    ? 'bg-primary'
                    : 'bg-muted-foreground'
                }`}
              />
            </span>
            <span className="text-xs font-bold text-foreground">
              تسلسل دورة الأتمتة القياسية (13 خطوة مؤكدة)
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {activeNum > 0 && activeNum <= 13 && (
              <Badge variant="outline" className="text-[10px] font-mono font-bold bg-primary/10 text-primary border-primary/30">
                الخطوة {activeNum} من 13
              </Badge>
            )}
            {isFailed && (
              <Badge variant="destructive" className="text-[10px] gap-1">
                <AlertTriangle className="w-3 h-3" />
                فشلت الدورة
              </Badge>
            )}
            {stepMessage && (
              <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px] sm:max-w-[320px]">
                {stepMessage}
              </span>
            )}
          </div>
        </div>

        {/* 13 Steps Horizontal Flow / Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 lg:grid-cols-13 gap-1.5">
          {VIP_STANDARD_13_STEPS.map((step) => {
            const Icon = STEP_ICONS[step.key] || Clock;
            const isCompleted = activeNum > step.num;
            const isCurrent = activeNum === step.num;
            const isPending = activeNum < step.num;

            let stateClasses = 'bg-muted/30 border-border/40 text-muted-foreground opacity-60';
            if (isCurrent) {
              stateClasses = isFailed
                ? 'bg-rose-500/15 border-rose-500/50 text-rose-400 font-bold shadow-xs'
                : 'bg-primary/15 border-primary text-primary font-bold shadow-xs animate-pulse';
            } else if (isCompleted) {
              stateClasses = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-medium';
            }

            return (
              <div
                key={step.key}
                className={`relative flex flex-col items-center text-center p-1.5 rounded-lg border transition-all ${stateClasses}`}
                title={`${step.num}. ${step.title}: ${step.desc}`}
              >
                {/* Step number badge */}
                <span className="text-[9px] font-mono font-bold leading-none mb-1 opacity-75">
                  {step.num}
                </span>

                {/* Step Icon */}
                <div className="w-5 h-5 flex items-center justify-center mb-1">
                  {isCurrent && isRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>

                {/* Title */}
                <span className="text-[10px] leading-tight font-sans line-clamp-1">
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
