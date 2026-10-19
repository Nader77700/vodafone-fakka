import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu, CheckCircle2, AlertCircle, Info, ArrowLeftRight, Coins } from 'lucide-react';
import type { VipSupportedSystem } from '@/types/vip';

interface Props {
  systems: VipSupportedSystem[];
}

export function VipSystemEligibilityTab({ systems }: Props) {
  return (
    <div className="space-y-5 max-w-4xl">
      {/* Notice Banner */}
      <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-foreground">قواعد مؤهلية الأنظمة المعيارية (System Eligibility Rules)</p>
          <p className="text-muted-foreground leading-relaxed">
            تتم إدارة معايير الأنظمة المؤهلة ومبالغ التجديد ديناميكياً من الخادم دون تثبيت قيم افتراضية غير موثقة.
            الأنظمة المؤهلة للأتمتة في هذه المرحلة هي أنظمة <strong>حكاية XRP ميكس 6 و 7</strong> مع قيم تجديد 180 و 270 ج.م،
            ولا تُتاح أي خيارات غير مدعومة إلا بعد التحقق الميداني مع المشغل.
          </p>
        </div>
      </div>

      {/* List of Supported Systems */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {systems.map((system) => (
          <Card
            key={system.id}
            className={`border transition-all flex flex-col justify-between ${
              system.is_auto_eligible
                ? 'border-emerald-500/30 bg-card hover:border-emerald-500/50'
                : 'border-border/80 bg-muted/20 opacity-80'
            }`}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Cpu className={`w-4 h-4 ${system.is_auto_eligible ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                  {system.display_name}
                </CardTitle>
                {system.is_auto_eligible ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-xs">
                    مؤهل للأتمتة
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-xs">
                    غير مؤهل حالياً
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs font-mono dir-ltr text-muted-foreground">
                ID: {system.id}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-3 text-xs">
              
              {/* Allowed Transitions */}
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50 space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
                  التحويلات والتبديل المسموح:
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {system.allowed_transitions && system.allowed_transitions.length > 0 ? (
                    system.allowed_transitions.map((target) => (
                      <Badge key={target} variant="secondary" className="text-[10px] dir-ltr font-mono">
                        {target}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-[11px]">لا توجد تحويلات آلية مسموحة</span>
                  )}
                </div>
              </div>

              {/* Renewal Values */}
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50 space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  قيم التجديد المعتمدة بالخادم:
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {system.renewal_values && system.renewal_values.length > 0 ? (
                    system.renewal_values.map((val) => (
                      <span key={val} className="font-semibold text-foreground px-2 py-0.5 rounded-md bg-background border border-border text-xs">
                        {val} ج.م
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-[11px]">غير محددة</span>
                  )}
                </div>
              </div>

              {/* Eligibility Requirements or Unsupported reason */}
              {system.is_auto_eligible ? (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{system.eligibility_requirements}</span>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[11px] flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{system.unsupported_reason || 'غير معتمد في المرحلة الحالية'}</span>
                </div>
              )}

            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
