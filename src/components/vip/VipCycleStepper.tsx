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

export type VipStepKey = 'idle' | 'auth' | 'parking' | 'migrating' | 'waiting_server' | 'recovering' | 'cooldown' | 'completed';

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
    <Card className="border border-border/70 bg-card/95 shadow-sm overflow-hidden" dir="rtl">
      <CardContent className="p-2.5 sm:p-3">
        {/* Header indicator */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
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
            <span className="text-xs font-bold text-foreground">
              مسار الدورة اللحظي (Live Step Pipeline)
            </span>
          </div>

          {stepMessage ? (
            <Badge
              variant="outline"
              className="text-[10px] font-mono px-2 py-0 border-primary/30 text-primary bg-primary/5 max-w-[240px] truncate"
            >
              {stepMessage}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              فحص نزول الميكسات مطبق تلقائياً كل ثانيتين
            </span>
          )}
        </div>

        {/* 5-Step Compact Pipeline */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {STEPS.map((step, idx) => {
            const isCompleted = activeIndex > idx;
            const isCurrent = activeIndex === idx && isRunning;
            const Icon = step.icon;

            return (
              <div
                key={step.key}
                className={`relative flex flex-col items-center text-center p-1.5 sm:p-2 rounded-lg border transition-all ${
                  isCurrent
                    ? 'border-emerald-500/60 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/30'
                    : isCompleted
                    ? 'border-border/60 bg-muted/40 text-muted-foreground'
                    : 'border-border/40 bg-muted/20 opacity-70'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mb-1 transition-colors ${
                    isCurrent
                      ? 'bg-emerald-500 text-white animate-pulse'
                      : isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span>{step.num}</span>
                  )}
                </div>

                <span
                  className={`text-[10px] sm:text-xs font-bold leading-tight line-clamp-1 ${
                    isCurrent ? 'text-emerald-400' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {step.title}
                </span>

                <span className="hidden sm:block text-[9px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">
                  {step.desc}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
