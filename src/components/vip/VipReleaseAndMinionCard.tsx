import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  UserMinus,
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Terminal,
  Zap,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { VipSession } from '@/types/vip';
import {
  executeFullReleaseAndMinion,
  executeRemoveChildMulti,
  executeMigrateChildToMinion,
  executeVipRenewBundle,
  executeSmartEjectionSequence,
  updateVipAutoEjectSetting,
  executeVipCheckStatusStream,
  type VipExecutionLog,
} from '@/lib/vipApi';

interface Props {
  activeSession: VipSession;
  onRefresh?: () => void;
}

export function VipReleaseAndMinionCard({ activeSession, onRefresh }: Props) {
  const session = activeSession;

  // Configuration settings
  const [childNumber, setChildNumber] = useState<string>(
    session.individual_account_identifier || ''
  );
  const [phase1Count, setPhase1Count] = useState<number>(5);
  const [removeDelaySec, setRemoveDelaySec] = useState<number>(2);
  const [cooldownSec, setCooldownSec] = useState<number>(10);
  const [phase2Count, setPhase2Count] = useState<number>(2);
  const [includeMinion, setIncludeMinion] = useState<boolean>(false);
  const [migrateCount, setMigrateCount] = useState<number>(3);
  const [minionDelaySec, setMinionDelaySec] = useState<number>(2);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Execution states
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStage, setCurrentStage] = useState<string>('idle');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [logs, setLogs] = useState<VipExecutionLog[]>([]);
  const [phase1Orders, setPhase1Orders] = useState<string[]>([]);
  const [minionOrders, setMinionOrders] = useState<string[]>([]);

  // Auto-Eject setting state
  const [autoEjectEnabled, setAutoEjectEnabled] = useState<boolean>(
    session.auto_eject_child_on_complete ?? false
  );
  const [isUpdatingAutoEject, setIsUpdatingAutoEject] = useState<boolean>(false);
  const [isCheckingStrict, setIsCheckingStrict] = useState<boolean>(false);

  // Sync state when session changes
  React.useEffect(() => {
    setAutoEjectEnabled(session.auto_eject_child_on_complete ?? false);
  }, [session.id, session.auto_eject_child_on_complete]);

  const handleToggleAutoEject = async (newVal: boolean) => {
    setAutoEjectEnabled(newVal);
    setIsUpdatingAutoEject(true);
    try {
      await updateVipAutoEjectSetting(session.id, newVal);
      toast.success(
        newVal
          ? 'تم تفعيل خيار إخراج الفرد تلقائياً بعد اكتمال الجلسة بنجاح!'
          : 'تم تعطيل خيار الإخراج التلقائي للفرد.'
      );
      onRefresh?.();
    } catch (e: any) {
      setAutoEjectEnabled(!newVal);
      toast.error('تعذر تحديث إعداد الإخراج التلقائي: ' + (e?.message || ''));
    } finally {
      setIsUpdatingAutoEject(false);
    }
  };

  // Individual action loading states
  const [isRemoving, setIsRemoving] = useState<boolean>(false);
  const [isRenewing, setIsRenewing] = useState<boolean>(false);
  const [isMigrating, setIsMigrating] = useState<boolean>(false);

  const addLocalLog = (message: string, level: VipExecutionLog['level'] = 'info') => {
    const time = new Date().toLocaleTimeString('ar-EG', { hour12: false });
    setLogs((prev) => [...prev, { time, level, message }]);
  };

  // 1. One-Click Smart Ejection Sequence (The requested 5-step master sequence)
  const handleRunSmartEjectionSequence = async () => {
    const targetChild = (childNumber || session.individual_account_identifier || '').trim();
    if (!targetChild) {
      toast.error('يرجى تحديد رقم خط الفرد المراد إخراجه.');
      return;
    }

    setIsRunning(true);
    setCurrentStage('smart_eject');
    setProgressPercent(20);
    setLogs([]);
    setPhase1Orders([]);
    setMinionOrders([]);

    addLocalLog(`[🚀] إطلاق تسلسل الإخراج الذكي المعتمد (5 خطوات) للجلسة: ${session.session_name}`, 'info');
    addLocalLog(`[*] خط الفرد: ${targetChild} | خط الأونر: ${session.owner_account_identifier || 'حساب الجلسة'}`, 'info');

    try {
      const res = await executeSmartEjectionSequence(session.id, {
        child_number: targetChild,
      });

      if (res.logs && res.logs.length > 0) {
        setLogs(res.logs);
      }
      if ((res as any).orders) {
        setPhase1Orders((res as any).orders);
      }
      if ((res as any).minion_orders) {
        setMinionOrders((res as any).minion_orders);
      }

      if (res.success) {
        setProgressPercent(100);
        setCurrentStage('completed');
        toast.success(res.message || 'اكتمل تسلسل الإخراج الذكي بنجاح تام وتم فك ارتباط الفرد بالسيرفر!');
        onRefresh?.();
      } else {
        setProgressPercent(75);
        setCurrentStage('error');
        toast.error(res.error || 'تم تنفيذ الخطوات مع ملاحظات خادم اتصالات.');
      }
    } catch (err: any) {
      addLocalLog(`[-] فشل الاتصال: ${err?.message || 'خطأ غير متوقع'}`, 'error');
      setCurrentStage('error');
      toast.error('تعذر استكمال السكريبت: ' + (err?.message || 'خطأ اتصال'));
    } finally {
      setIsRunning(false);
    }
  };

  // 1. One-Click Full Automated Sequence
  const handleRunFullSequence = async () => {
    const targetChild = (childNumber || session.individual_account_identifier || '').trim();
    if (!targetChild) {
      toast.error('يرجى تحديد رقم خط الفرد المراد إخراجه وتحويله لنظام أهلا أقوى كارت.');
      return;
    }

    setIsRunning(true);
    setCurrentStage('phase1');
    setProgressPercent(15);
    setLogs([]);
    setPhase1Orders([]);
    setMinionOrders([]);

    addLocalLog(`[🚀] إطلاق سكريبت فك الارتباط الكامل والتحويل لنظام MINION للجلسة: ${session.session_name}`, 'info');
    addLocalLog(`[*] خط الفرد: ${targetChild} | خط الأونر: ${session.owner_account_identifier || 'حساب الجلسة'}`, 'info');

    try {
      const res = await executeFullReleaseAndMinion(session.id, {
        child_number: targetChild,
        phase1_count: phase1Count,
        cooldown_seconds: cooldownSec,
        phase2_count: phase2Count,
        migrate_count: migrateCount,
        include_minion: includeMinion,
        remove_delay_seconds: removeDelaySec,
        minion_delay_seconds: minionDelaySec,
      });

      if (res.logs && res.logs.length > 0) {
        setLogs(res.logs);
      }

      if (res.phase1_orders) {
        setPhase1Orders(res.phase1_orders);
      }
      if (res.minion_orders) {
        setMinionOrders(res.minion_orders);
      }

      if (res.success) {
        setProgressPercent(100);
        setCurrentStage('completed');
        toast.success(res.message || 'اكتملت عملية إخراج الفرد والتحويل لأهلا أقوى كارت بنجاح!');
        onRefresh?.();
      } else {
        setProgressPercent(80);
        setCurrentStage('error');
        toast.error(res.error || 'حدث خطأ أثناء تنفيذ بعض خطوات الإخراج والتحويل.');
      }
    } catch (err: any) {
      addLocalLog(`[-] فشل الاتصال: ${err?.message || 'خطأ غير متوقع'}`, 'error');
      setCurrentStage('error');
      toast.error('تعذر استكمال السكريبت: ' + (err?.message || 'خطأ اتصال'));
    } finally {
      setIsRunning(false);
    }
  };

  // 2. Individual: Multi-Remove Child
  const handleRemoveChildOnly = async () => {
    const targetChild = (childNumber || session.individual_account_identifier || '').trim();
    if (!targetChild) {
      toast.error('يرجى تحديد رقم الفرد.');
      return;
    }

    setIsRemoving(true);
    addLocalLog(`[*] بدء إرسال أمر إخراج الفرد (${phase1Count} مرات بفاصل ${removeDelaySec}ث)...`, 'info');
    try {
      const res = await executeRemoveChildMulti(session.id, phase1Count, targetChild, removeDelaySec);
      if (res.logs && res.logs.length > 0) {
        setLogs(res.logs);
      }
      if (res.success) {
        toast.success(res.message || `تم إرسال أوامر الإخراج بنجاح!`);
        onRefresh?.();
      } else {
        toast.error(res.error || 'فشل إرسال أوامر الإخراج');
      }
    } catch (err: any) {
      toast.error('خطأ: ' + (err?.message || 'تعذر الاتصال'));
    } finally {
      setIsRemoving(false);
    }
  };

  // 3. Individual: Renew Owner Bundle
  const handleRenewOwnerBundle = async () => {
    setIsRenewing(true);
    addLocalLog(`[*] بدء تجديد باقة الأونر...`, 'info');
    try {
      const res = await executeVipRenewBundle(session.id);
      if (res.logs && res.logs.length > 0) {
        setLogs(res.logs);
      }
      if (res.success) {
        toast.success(res.message || 'تم تجديد باقة الأونر بنجاح!');
        onRefresh?.();
      } else {
        toast.error(res.error || 'فشل تجديد الباقة');
      }
    } catch (err: any) {
      toast.error('خطأ: ' + (err?.message || 'تعذر الاتصال'));
    } finally {
      setIsRenewing(false);
    }
  };

  // 4. Individual: Migrate to MINION
  const handleMigrateMinionOnly = async () => {
    const targetChild = (childNumber || session.individual_account_identifier || '').trim();
    if (!targetChild) {
      toast.error('يرجى تحديد رقم الفرد.');
      return;
    }

    setIsMigrating(true);
    addLocalLog(`[*] بدء إرسال أمر التحويل لنظام أهلا أقوى كارت (MINION) (${migrateCount} مرات بفاصل ${minionDelaySec}ث)...`, 'info');
    try {
      const res = await executeMigrateChildToMinion(session.id, migrateCount, targetChild, minionDelaySec);
      if (res.logs && res.logs.length > 0) {
        setLogs(res.logs);
      }
      if (res.success) {
        toast.success(res.message || 'تم إرسال أوامر التحويل لأهلا أقوى كارت بنجاح!');
        onRefresh?.();
      } else {
        toast.error(res.error || 'فشل التحويل لنظام MINION');
      }
    } catch (err: any) {
      toast.error('خطأ: ' + (err?.message || 'تعذر الاتصال'));
    } finally {
      setIsMigrating(false);
    }
  };

  // 5. Individual: Strict Server Family Verification
  const handleStrictFamilyCheck = async () => {
    setIsCheckingStrict(true);
    addLocalLog(`[*] بدء الفحص الصارم المباشر من سيرفر اتصالات لعائلة الأونر والتأكد من وجود الفرد...`, 'info');
    try {
      const res = await executeVipCheckStatusStream(session.id);
      if (res.logs && res.logs.length > 0) {
        setLogs(res.logs);
      }
      if (res.success) {
        const found = (res as any).owner?.has_child_in_family;
        if (found) {
          toast.success(`تأكيد السيرفر: الفرد مضاف داخل العائلة (${(res as any).owner?.child_number_found || ''})`);
        } else {
          toast.info('تأكيد السيرفر: لا يوجد أي فرد مسجل داخل عائلة الأونر حالياً (الفرد خارج العائلة).');
        }
        onRefresh?.();
      } else {
        toast.error(res.error || 'تعذر استكمال الفحص');
      }
    } catch (err: any) {
      toast.error('خطأ: ' + (err?.message || 'تعذر الاتصال'));
    } finally {
      setIsCheckingStrict(false);
    }
  };

  const copyLogs = () => {
    const text = logs.map((l) => `[${l.time}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('تم نسخ السجلات إلى الحافظة');
  };

  return (
    <Card className="border-2 border-amber-500/30 bg-gradient-to-b from-card to-amber-500/5 shadow-md overflow-hidden">
      <CardHeader className="p-4 pb-3 border-b border-border/60 bg-amber-500/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <UserMinus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm md:text-base font-bold text-foreground">
                  إخراج الفرد وتحويله لنظام أهلا أقوى كارت (MINION)
                </CardTitle>
                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/40 text-[10px] px-1.5 py-0 font-medium">
                  MAB Script
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                فك تعليق الفرد بحساب الأونر عبر تكرار الإخراج وتجديد الباقة والترحيل لنظام MINION
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Badge variant="outline" className="text-[11px] font-mono border-border">
              خط الفرد: {targetChildDisplay(childNumber || session.individual_account_identifier)}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* ── AUTO-EJECT TOGGLE BANNER ── */}
        <div className="p-3.5 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-background/80 to-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <Label htmlFor="auto-eject-switch" className="text-xs sm:text-sm font-bold text-foreground cursor-pointer">
                الإخراج التلقائي للفرد بعد اكتمال الجلسة (Auto-Eject on Complete)
              </Label>
              <Badge className={`text-[10px] px-2 py-0.5 font-semibold ${autoEjectEnabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground'}`}>
                {autoEjectEnabled ? 'مفعّل تلقائياً ✓' : 'معطّل يدوي'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              عند تفعيل هذا الخيار، فور اكتمال الجلسة أو الوصول للحد الأقصى، سينتقل النظام تلقائياً لتنفيذ تسلسل الإخراج المعتمد (تجديد باقة الأونر ➔ انتظار استقرار الميكسات للفرد ➔ 5 محاولات إخراج بفاصل 20 ثانية ➔ فحص صارم وتكرار ➔ الترحيل لـ MINION لحل التعليق 100%).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Switch
              id="auto-eject-switch"
              checked={autoEjectEnabled}
              disabled={isUpdatingAutoEject}
              onCheckedChange={handleToggleAutoEject}
            />
          </div>
        </div>

        {/* Target Child Input & Parameters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-xl border border-border/80 bg-background/50">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">رقم هاتف الفرد المراد إخراجه</Label>
            <Input
              value={childNumber}
              onChange={(e) => setChildNumber(e.target.value)}
              placeholder="مثال: 01140427996"
              className="h-8 text-xs font-mono text-left"
              dir="ltr"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">تكرار الإخراج الأولي</Label>
            <Input
              type="number"
              min={1}
              max={15}
              value={phase1Count}
              onChange={(e) => setPhase1Count(Number(e.target.value) || 5)}
              className="h-8 text-xs font-mono text-center"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">فاصل الأمان بين طلبات الإخراج</Label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                max={10}
                value={removeDelaySec}
                onChange={(e) => setRemoveDelaySec(Number(e.target.value) || 2)}
                className="h-8 text-xs font-mono text-center"
              />
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">ثوانٍ</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">فترة التهدئة قبل التجديد</Label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={3}
                max={60}
                value={cooldownSec}
                onChange={(e) => setCooldownSec(Number(e.target.value) || 10)}
                className="h-8 text-xs font-mono text-center"
              />
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">ثوانٍ</span>
            </div>
          </div>
        </div>

        {/* Optional MINION Migration Toggle Box */}
        <div className="p-3 rounded-xl border border-border bg-card/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="include-minion-switch" className="text-xs font-semibold cursor-pointer">
                ترحيل خط الفرد تلقائياً لنظام أهلا أقوى كارت (MINION)
              </Label>
              <Badge variant="outline" className={`text-[10px] ${includeMinion ? 'text-amber-500 border-amber-500/40 bg-amber-500/10' : 'text-muted-foreground'}`}>
                {includeMinion ? 'مفعّل' : 'معطّل (موصى به لتفادي تعليق SDP)'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {includeMinion
                ? `سيتم إرسال ${migrateCount} طلبات تحويل لنظام MINION بفاصل ${minionDelaySec}ث بعد إخراج الفرد وتجديد الباقة.`
                : 'يكتفي بإخراج الفرد وتجديد باقة الأونر دون محاولة تغيير خط الفرد لنظام MINION.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {includeMinion && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={migrateCount}
                  onChange={(e) => setMigrateCount(Number(e.target.value) || 3)}
                  className="h-7 w-14 text-xs font-mono text-center"
                />
                <span className="text-[10px] text-muted-foreground">مرات</span>
              </div>
            )}
            <Switch
              id="include-minion-switch"
              checked={includeMinion}
              onCheckedChange={setIncludeMinion}
            />
          </div>
        </div>

        {/* ── MODE 1: ONE-CLICK AUTOMATED EXECUTION BUTTONS ── */}
        {/* 1A. THE REQUESTED SMART 5-STEP PROTOCOL */}
        <div className="p-3.5 rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-500/20 via-card to-amber-500/10 flex flex-col md:flex-row items-center justify-between gap-3 shadow-md">
          <div className="space-y-1 text-right w-full md:w-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs md:text-sm font-bold text-foreground">
                تسلسل الإخراج الذكي الكامل (5 خطوات معتمدة)
              </span>
              <Badge className="bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0">
                الحل الموصى به
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              1. تجديد باقة الأونر ➔ 2. انتظار استقرار ميكسات الفرد ➔ 3. إخراج الفرد 5 مرات بفاصل 20ث ➔ 4. فحص صارم (وتكرار بعد 60ث إذا لزم) ➔ 5. الحل الحاسم: تحويل لـ MINION لفك التعليق نهائياً
            </p>
          </div>

          <Button
            onClick={handleRunSmartEjectionSequence}
            disabled={isRunning || isRemoving || isRenewing || isMigrating || isCheckingStrict}
            className="w-full md:w-auto shrink-0 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs h-9 px-5 gap-2 shadow-sm"
          >
            {isRunning && currentStage === 'smart_eject' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>جاري تسلسل الإخراج الذكي...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>تشغيل التسلسل الذكي الآن</span>
              </>
            )}
          </Button>
        </div>

        {/* 1B. Custom Sequence */}
        <div className="p-3 rounded-xl border border-border/70 bg-card/60 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="space-y-0.5 text-right w-full md:w-auto">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-semibold text-foreground">
                التشغيل المخصص: إخراج الفرد ({phase1Count}x) {includeMinion ? 'والتحويل لـ MINION' : 'وتجديد الباقة'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              ينفذ: {phase1Count}x إخراج للفرد (بفاصل {removeDelaySec}ث) ➔ انتظار {cooldownSec}ث ➔ تجديد باقة الأونر{includeMinion ? ` ➔ ${migrateCount}x ترحيل لـ MINION (بفاصل ${minionDelaySec}ث)` : ' (تخطي MINION)'}
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleRunFullSequence}
            disabled={isRunning || isRemoving || isRenewing || isMigrating || isCheckingStrict}
            className="w-full md:w-auto shrink-0 text-xs h-8 px-4 gap-1.5 border-border hover:bg-accent"
          >
            {isRunning && currentStage !== 'smart_eject' ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>جاري التنفيذ...</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                <span>تشغيل مخصص</span>
              </>
            )}
          </Button>
        </div>

        {/* Progress Bar during Full Run */}
        {isRunning && (
          <div className="space-y-1.5 p-3 rounded-xl border border-border bg-card/60">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-amber-500 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                المرحلة النشطة: {getStageLabel(currentStage)}
              </span>
              <span className="font-mono text-muted-foreground">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-1.5 bg-muted" />
          </div>
        )}

        {/* ── MODE 2: INDIVIDUAL MANUAL STEPS ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              الأوامر المنفصلة (تشغيل خطوة بخطوة عند الحاجة):
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-2 gap-1"
            >
              {showAdvanced ? (
                <>
                  <span>إخفاء التفاصيل</span>
                  <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  <span>عرض التفاصيل</span>
                  <ChevronDown className="w-3 h-3" />
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* Step 1: Renew Bundle */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRenewOwnerBundle}
              disabled={isRunning || isRemoving || isRenewing || isMigrating || isCheckingStrict}
              className="h-8 text-xs border-primary/30 hover:border-primary/60 hover:bg-primary/5 justify-start gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-primary ${isRenewing ? 'animate-spin' : ''}`} />
              <span className="truncate">1. تجديد باقة الأونر</span>
            </Button>

            {/* Step 2: Remove child multi */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveChildOnly}
              disabled={isRunning || isRemoving || isRenewing || isMigrating || isCheckingStrict}
              className="h-8 text-xs border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5 justify-start gap-2"
            >
              <UserMinus className={`w-3.5 h-3.5 text-amber-500 ${isRemoving ? 'animate-spin' : ''}`} />
              <span className="truncate">2. إخراج الفرد (5x بـ 20ث)</span>
            </Button>

            {/* Step 3: Strict Server Family Check */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleStrictFamilyCheck}
              disabled={isRunning || isRemoving || isRenewing || isMigrating || isCheckingStrict}
              className="h-8 text-xs border-blue-500/30 hover:border-blue-500/60 hover:bg-blue-500/5 justify-start gap-2"
            >
              <ShieldCheck className={`w-3.5 h-3.5 text-blue-400 ${isCheckingStrict ? 'animate-spin' : ''}`} />
              <span className="truncate">3. فحص الخادم الصارم</span>
            </Button>

            {/* Step 4: Migrate to MINION */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleMigrateMinionOnly}
              disabled={isRunning || isRemoving || isRenewing || isMigrating || isCheckingStrict}
              className="h-8 text-xs border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5 justify-start gap-2"
            >
              <Zap className={`w-3.5 h-3.5 text-emerald-500 ${isMigrating ? 'animate-spin' : ''}`} />
              <span className="truncate">4. تحويل لـ MINION (4x)</span>
            </Button>
          </div>
        </div>

        {/* Live Terminal & Response Orders */}
        {logs.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-primary" />
                سجل تنفيذ سكريبت الإخراج والتحويل ({logs.length} رسالة)
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyLogs}
                className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-1.5 gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>نسخ السجل</span>
              </Button>
            </div>

            <div className="p-2.5 rounded-xl border border-border bg-black/90 font-mono text-[11px] text-zinc-300 max-h-48 overflow-y-auto space-y-1 dir-ltr text-left">
              {logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`leading-relaxed ${
                    log.level === 'error'
                      ? 'text-red-400'
                      : log.level === 'warn'
                      ? 'text-amber-400'
                      : log.level === 'success'
                      ? 'text-emerald-400'
                      : 'text-zinc-300'
                  }`}
                >
                  <span className="text-zinc-500 mr-1.5">[{log.time}]</span>
                  {log.message}
                </div>
              ))}
            </div>

            {/* Orders Badge Strip if any captured */}
            {(phase1Orders.length > 0 || minionOrders.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px]">
                {phase1Orders.length > 0 && (
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 gap-1 font-mono">
                    <CheckCircle2 className="w-3 h-3" />
                    أوامر الإخراج المقبولة: {phase1Orders.length}
                  </Badge>
                )}
                {minionOrders.length > 0 && (
                  <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1 font-mono">
                    <Zap className="w-3 h-3" />
                    أوامر تحويل MINION: {minionOrders.length}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function targetChildDisplay(dial?: string | null): string {
  if (!dial) return 'غير محدد';
  return dial;
}

function getStageLabel(stage: string): string {
  switch (stage) {
    case 'phase1':
      return 'المرحلة 1: إرسال أوامر الإخراج المتكررة لفك التعليق بالسيرفر...';
    case 'cooldown':
      return 'المرحلة 2: فترة التهدئة والانتظار...';
    case 'renew':
      return 'المرحلة 3: تجديد باقة الأونر...';
    case 'phase2':
      return 'المرحلة 4: إرسال أوامر الإخراج التأكيدية...';
    case 'minion':
      return 'المرحلة 5: تحويل خط الفرد لنظام أهلا أقوى كارت (MINION)...';
    case 'completed':
      return 'اكتملت جميع المراحل بنجاح!';
    case 'error':
      return 'انتهى مع وجود ملاحظات.';
    default:
      return 'جاري العمل...';
  }
}
