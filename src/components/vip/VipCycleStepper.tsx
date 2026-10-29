import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Sparkles,
} from 'lucide-react';

export type VipStepKey = 'idle' | 'auth' | 'parking' | 'migrating' | 'waiting_server' | 'recovering' | 'cooldown' | 'completed' | 'safety_stop';

interface Props {
  currentStep: string;
  stepMessage?: string | null;
  isRunning?: boolean;
}

const STEPS = [
  { key: 'parking', num: 1, title: 'ركن الميكسات', icon: ArrowDownLeft },
  { key: 'migrating', num: 2, title: 'ترحيل النظام', icon: ArrowLeftRight },
  { key: 'waiting_server', num: 3, title: 'تأكيد الترحيل', icon: Clock },
  { key: 'recovering', num: 4, title: 'استرجاع فوري', icon: ArrowUpRight },
  { key: 'cooldown', num: 5, title: 'اكتمال واستراحة', icon: Sparkles },
];

export function VipCycleStepper({ currentStep, stepMessage, isRunning = false }: Props) {
  const getStepIndex = (key: string) => {
    switch (key) {
      case 'auth':
      case 'parking':
      case 'step_5_transfer_owner_to_child':
        return 0;
      case 'migrating':
      case 'step_7_request_plan_change':
        return 1;
      case 'waiting_server':
      case 'step_8_monitor_plan_change':
        return 2;
      case 'recovering':
      case 'step_10_transfer_child_to_owner':
        return 3;
      case 'cooldown':
      case 'completed':
      case 'step_13_record_final_result':
        return 4;
      default:
        return -1;
    }
  };

  const activeIndex = getStepIndex(currentStep);

  return (
    <Card className="w-full border border-border/80 bg-card/90 shadow-xs overflow-hidden" dir="rtl">
      <CardContent className="p-1.5 sm:p-2">
        {/* Compact Horizontal Steps Strip */}
        <div className="grid grid-cols-5 gap-1 items-center">
          {STEPS.map((step, idx) => {
            const isCompleted = activeIndex > idx;
            const isCurrent = activeIndex === idx && isRunning;
            const Icon = step.icon;

            return (
              <div
                key={step.key}
                className={`flex items-center justify-center gap-1 p-1 rounded-md border text-center transition-all ${
                  isCurrent
                    ? 'border-emerald-500 bg-emerald-500/15 shadow-xs ring-1 ring-emerald-500/40 text-emerald-400'
                    : isCompleted
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400/90'
                    : 'border-border/40 bg-muted/20 text-muted-foreground/60'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8.5px] font-bold shrink-0 ${
                    isCurrent
                      ? 'bg-emerald-500 text-white animate-pulse'
                      : isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCurrent ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                  ) : (
                    <span>{step.num}</span>
                  )}
                </div>

                <span className={`text-[10px] leading-none font-bold truncate ${isCurrent ? 'text-emerald-400' : 'text-foreground'}`}>
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
