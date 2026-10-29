import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  FlaskConical,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Server,
  Layers,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import type { VipSession } from '@/types/vip';

interface Props {
  session: VipSession;
  onRefresh: () => void;
  onRunSimulation?: (scenario: string) => Promise<void>;
  isRunning?: boolean;
}

export const SIMULATION_SCENARIOS = [
  {
    id: 'scenario_differing_balances',
    title: 'اختلاف أرصدة الحسابين',
    desc: 'محاكاة وجود 15,400 ميكس بالأونر و 74,250 بالفرد وفحص المزامنة المستقلة',
    badge: 'فحص التمايز',
  },
  {
    id: 'scenario_delayed_response',
    title: 'تأخر استجابة السيرفر',
    desc: 'محاكاة تأخير شبكي 3 ثوانٍ وفحص عدم تكرار الأوامر وسلوك الانتظار',
    badge: 'مهلة الشبكة',
  },
  {
    id: 'scenario_read_failure',
    title: 'فشل قراءة الرصيد',
    desc: 'محاكاة تعذر قراءة الرصيد والتأكد من إرجاع «تعذر قراءة الرصيد» وليس 0',
    badge: 'منع تصفير الرصيد',
  },
  {
    id: 'scenario_delayed_balance_update',
    title: 'تأخر تحديث الرصيد بعد نجاح الطلب',
    desc: 'محاكاة قبول أمر التحويل مع تأخر انعكاسه بمقسم اتصالات وفحص حلقة التدقيق',
    badge: 'تدقيق المزامنة',
  },
  {
    id: 'scenario_session_switch',
    title: 'تبديل الجلسة بين الأونر والفرد',
    desc: 'التحقق من عزل جلستي الأونر والفرد التام وعدم تداخل الرموز والملفات',
    badge: 'عزل الجلسات',
  },
  {
    id: 'scenario_connection_loss',
    title: 'انقطاع الاتصال بعد إرسال الطلب',
    desc: 'فحص الحماية من تلف البيانات واسترجاع الرصيد عند انقطاع الخط',
    badge: 'حماية الرصيد',
  },
  {
    id: 'scenario_prevent_duplicate_transfer',
    title: 'منع تكرار التحويل',
    desc: 'التحقق المسبق لمنع تكرار التحويل واستهلاك الحد الشهري (BE_SDP_361)',
    badge: 'منع الازدواج',
  },
  {
    id: 'scenario_target_reached',
    title: 'توقف الدورة عند بلوغ الهدف',
    desc: 'تجاوز رصيد الأونر للهدف المطلوب (50,000 ميكس) وإيقاف الدورة تلقائياً',
    badge: 'بلوغ الهدف',
  },
];

export function VipSimulationPanel({ session, onRefresh, onRunSimulation, isRunning = false }: Props) {
  const [isSimActive, setIsSimActive] = useState<boolean>(session.is_simulation_mode || false);
  const [selectedScenario, setSelectedScenario] = useState<string>(session.simulation_scenario || 'scenario_differing_balances');
  const [saving, setSaving] = useState(false);

  const handleToggleSimulation = async (checked: boolean) => {
    setIsSimActive(checked);
    setSaving(true);
    try {
      await supabase
        .from('vip_sessions')
        .update({
          is_simulation_mode: checked,
          simulation_scenario: checked ? selectedScenario : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      toast.success(checked ? 'تم تفعيل وضع المحاكاة الآمن (بدون استهلاك)' : 'تم إيقاف وضع المحاكاة والعودة للوضع الحي');
      onRefresh();
    } catch {
      toast.error('فشل تحديث وضع المحاكاة');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectScenario = async (scId: string) => {
    setSelectedScenario(scId);
    if (isSimActive) {
      try {
        await supabase
          .from('vip_sessions')
          .update({
            simulation_scenario: scId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id);
        toast.info(`تم اختيار سيناريو الاختبار: ${SIMULATION_SCENARIOS.find(s => s.id === scId)?.title}`);
        onRefresh();
      } catch {}
    }
  };

  return (
    <Card className="border border-purple-500/30 bg-card/90 shadow-xs relative overflow-hidden mb-3" dir="rtl">
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />

      <CardHeader className="p-2.5 sm:p-3 pb-2 border-b border-border/50 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <FlaskConical className="w-3.5 h-3.5" />
          </div>
          <div>
            <CardTitle className="text-xs font-bold text-foreground flex items-center gap-1.5">
              بيئة المحاكاة والاختبار الآمن (8 حالات حدية)
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              اختبار كامل لدورة الـ 13 خطوة دون استهلاك رصيد فعلي أو مساس بالخطوط
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-foreground">
            {isSimActive ? 'المحاكاة نشطة' : 'الوضع الحي'}
          </span>
          <Switch
            checked={isSimActive}
            onCheckedChange={handleToggleSimulation}
            disabled={saving || isRunning}
          />
        </div>
      </CardHeader>

      <CardContent className="p-2.5 sm:p-3 space-y-2">
        {isSimActive ? (
          <>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[11px] font-bold text-foreground">اختر سيناريو الاختبار الحدي:</span>
              <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-300 border-purple-500/30">
                اختبار معزول 100%
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {SIMULATION_SCENARIOS.map((sc) => {
                const isSelected = selectedScenario === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => handleSelectScenario(sc.id)}
                    className={`text-right p-2 rounded-lg border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-purple-500/15 border-purple-500/60 shadow-xs'
                        : 'bg-muted/40 border-border/60 hover:border-border hover:bg-muted/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1 w-full">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1">
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                        {sc.title}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 font-sans border-border">
                        {sc.badge}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {sc.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 text-center">
            <p className="text-[11px] text-muted-foreground">
              وضع المحاكاة معطل حالياً وتعمل الدورة على النظام الحي الفعلي. قم بتفعيل المفتاح أعلاه لاختبار الحالات الـ 8 دون استهلاك رصيد.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
