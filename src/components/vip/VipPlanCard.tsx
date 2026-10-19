import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Layers, ArrowLeftRight, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import type { VipSession } from '@/types/vip';

interface Props {
  session: VipSession;
  onChangePlan: (targetPlan: '6' | '7') => Promise<void>;
  changingPlan: boolean;
}

export function VipPlanCard({ session, onChangePlan, changingPlan }: Props) {
  const currentPlan = session.owner_current_plan || '';
  const isSeven = currentPlan.includes('7') || currentPlan.includes('270');
  const isSix = currentPlan.includes('6') || currentPlan.includes('180');
  const isSupported = isSeven || isSix;

  return (
    <Card className="border border-border/80 bg-card/90 shadow-sm" dir="rtl">
      <CardHeader className="p-3 pb-2 border-b border-border/50 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-xs font-bold text-foreground">فحص وترحيل النظام (Plan Migration)</CardTitle>
            <p className="text-[10px] text-muted-foreground">
              التبديل بين أنظمة حكاية عيلة (Parent 7 بـ 270ج ⟵⟶ Parent 6 بـ 180ج)
            </p>
          </div>
        </div>

        {isSupported ? (
          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            نظام مدعوم للعيلة
          </Badge>
        ) : (
          <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            يحتاج تحويل لـ 270
          </Badge>
        )}
      </CardHeader>

      <CardContent className="p-3 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {/* Plan 1: Parent 7 */}
          <div
            className={`p-2.5 rounded-lg border transition-all ${
              isSeven
                ? 'bg-primary/10 border-primary/40 shadow-sm'
                : 'bg-muted/30 border-border/60 hover:border-border'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground font-mono">Hekaya Parent 7</span>
              <span className="font-bold text-primary text-xs">270 جنيه</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              النظام الأساسي الأكبر لميزة العائلة ومضاعفة رصيد الميكسات
            </p>
            {isSeven ? (
              <Badge className="mt-2 bg-primary text-primary-foreground text-[9px] px-1 py-0">النظام النشط الآن</Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onChangePlan('7')}
                disabled={changingPlan}
                className="mt-2 h-6 text-[10px] px-2 w-full gap-1 border-border hover:bg-muted"
              >
                <ArrowLeftRight className="w-2.5 h-2.5" />
                تحويل إلى Parent 7
              </Button>
            )}
          </div>

          {/* Plan 2: Parent 6 */}
          <div
            className={`p-2.5 rounded-lg border transition-all ${
              isSix
                ? 'bg-primary/10 border-primary/40 shadow-sm'
                : 'bg-muted/30 border-border/60 hover:border-border'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground font-mono">Hekaya Parent 6</span>
              <span className="font-bold text-blue-500 text-xs">180 جنيه</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              نظام التبديل الدائري (معرّف RatePlanID: 951) لنزول الميكسات
            </p>
            {isSix ? (
              <Badge className="mt-2 bg-primary text-primary-foreground text-[9px] px-1 py-0">النظام النشط الآن</Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onChangePlan('6')}
                disabled={changingPlan}
                className="mt-2 h-6 text-[10px] px-2 w-full gap-1 border-border hover:bg-muted"
              >
                <ArrowLeftRight className="w-2.5 h-2.5" />
                تحويل إلى Parent 6
              </Button>
            )}
          </div>
        </div>

        {!isSupported && (
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
            <span className="text-[11px] text-amber-500">
              النظام الحالي لا يدعم العيلة. انقر للتحويل إلى نظام 270 كما يفعل السكريبت في البداية:
            </span>
            <Button
              size="sm"
              onClick={() => onChangePlan('7')}
              disabled={changingPlan}
              className="h-7 text-xs px-2.5 bg-amber-500 hover:bg-amber-600 text-black font-bold shrink-0"
            >
              تحويل إلى 270 الآن
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
