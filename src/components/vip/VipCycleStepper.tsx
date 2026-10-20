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
  {
    key: 'parking',
    num: 1,
    title: 'ركن الميكسات',
    desc: 'نقل ميكسات الأونر للفرد فوراً',
    icon: ArrowDownLeft,
  },
  {
    key: 'migrating',
    num: 2,
    title: 'ترحيل النظام',
    desc: 'التبديل بين 270 و 180',
    icon: ArrowLeftRight,
  },
  {
    key: 'waiting_server',
    num: 3,
    title: 'تأكيد السيرفر',
    desc: 'فحص كل ثانيتين لنزول الميكسات',
    icon: Clock,
  },
  {
    key: 'recovering',
    num: 4,
    title: 'استرجاع فوري',
    desc: 'إعادة ميكسات الفرد للأونر',
    icon: ArrowUpRight,
  },
  {
    key: 'cooldown',
    num: 5,
    title: 'اكتمال واستراحة',
    desc: 'تحديث الرصيد والعد التنازلي',
    icon: Sparkles,
  },
];

export function VipCycleStepper({ currentStep, stepMessage, isRunning = false }: Props) {
  const getStepIndex = (key: string) => {
    switch (key) {
      case 'auth':
      case 'parking':
        return 0;
      case 'migrating':
        return 1;
      case 'waiting_server':
        return 2;
      case 'recovering':
        return 3;
      case 'cooldown':
      case 'completed':
        return 4;
      default:
        return -1;
    }
  };

  const activeIndex = getStepIndex(currentStep);

  return (
    <Card className="border border-border/80 bg-card/95 shadow-xs overflow-hidden" dir="rtl">
      <CardContent className="p-2 sm:p-2.5">
        {/* Header indicator - Compact row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-2 w-2">
              {isRunning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isRunning ? 'bg-emerald-500' : 'bg-zinc-500'
                }`}
              />
            </span>
            <span className="text-[11px] font-black text-foreground">
              مسار الدورة (Live Pipeline)
            </span>
          </div>

          {stepMessage ? (
            <Badge
              variant="outline"
              className="text-[9.5px] font-mono px-1.5 py-0 border-primary/30 text-primary bg-primary/5 max-w-[200px] sm:max-w-xs truncate"
            >
              {stepMessage}
            </Badge>
          ) : (
            <span className="text-[9.5px] text-muted-foreground truncate">
              فحص لحظي مستمر
            </span>
          )}
        </div>

        {/* 5-Step Compact Horizontal Strip */}
        <div className="grid grid-cols-5 gap-1">
          {STEPS.map((step, idx) => {
            const isCompleted = activeIndex > idx;
            const isCurrent = activeIndex === idx && isRunning;
            const Icon = step.icon;

            return (
              <div
                key={step.key}
                className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 p-1 sm:p-1.5 rounded-md border text-center transition-all ${
                  isCurrent
                    ? 'border-emerald-500 bg-emerald-500/15 shadow-xs ring-1 ring-emerald-500/40 text-emerald-400'
                    : isCompleted
                    ? 'border-border/50 bg-muted/40 text-muted-foreground'
                    : 'border-border/30 bg-muted/15 text-muted-foreground/60'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
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

                <div className="min-w-0 flex flex-col text-right">
                  <span className={`text-[10px] leading-tight font-bold truncate ${isCurrent ? 'text-emerald-400' : 'text-foreground'}`}>
                    {step.title}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
