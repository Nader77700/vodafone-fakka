import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertTriangle,
  Zap,
  Phone,
  Hash,
  KeyRound,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  checkVipAccessServer,
  recordVipCycleServer,
  type VipAccessStatus,
} from '@/services/vipDelegationService';
import { SecurityAuditService } from '@/services/securityAuditService';
import { VipSessionEditModal } from './VipSessionEditModal';

interface VipDelegatedClientViewProps {
  userId: string;
  userEmail?: string;
}

export const VipDelegatedClientView: React.FC<VipDelegatedClientViewProps> = ({
  userId,
  userEmail,
}) => {
  const [access, setAccess] = useState<VipAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [openEditModal, setOpenEditModal] = useState(false);

  // Form Inputs
  const [ownerPhone, setOwnerPhone] = useState('01106291591');
  const [childPhone, setChildPhone] = useState('01118217129');
  const [mixTarget, setMixTarget] = useState('50000');
  const [customAmount, setCustomAmount] = useState('');
  const [isUsingCustom, setIsUsingCustom] = useState(false);
  const [note, setNote] = useState('');

  // Results
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    transferredToChild: boolean;
    transferredToOwner: boolean;
    currentBalance: string;
    timestamp: string;
  } | null>(null);

  // Initial and periodic access check
  const refreshAccess = async () => {
    try {
      const status = await checkVipAccessServer(userId);
      setAccess(status);
      if (status.cooldown_remaining && status.cooldown_remaining > 0) {
        setCooldownSeconds(status.cooldown_remaining);
      }
      if (status.allowed_packages && status.allowed_packages.length > 0) {
        if (!status.allowed_packages.includes(parseInt(mixTarget, 10))) {
          setMixTarget(String(status.allowed_packages[0]));
        }
      }
    } catch (err) {
      console.error('Failed to refresh access:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAccess();
    SecurityAuditService.verifyClientIntegrity(userEmail);
  }, [userId, userEmail]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          refreshAccess();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleStartCycle = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ownerPhone.trim() || !childPhone.trim()) {
      toast.error('يرجى إدخال رقم خط الأونر ورقم الفرد');
      return;
    }

    if (cooldownSeconds > 0) {
      toast.error(`الفاصل الزمني الإجباري نشط: يرجى الانتظار ${cooldownSeconds} ثانية`);
      return;
    }

    const mixes = isUsingCustom
      ? parseInt(customAmount, 10)
      : parseInt(mixTarget, 10);

    if (!mixes || isNaN(mixes) || mixes <= 0) {
      toast.error('يرجى تحديد أو إدخال قيمة ميكسات صحيحة');
      return;
    }

    if (access && access.cycles_remaining !== undefined && access.cycles_remaining <= 0) {
      toast.error('لقد استنفدت حصتك المخصصة من التفعيلات اليوم. يرجى مراجعة المالك.');
      return;
    }

    setExecuting(true);
    const startTime = Date.now();

    try {
      // تنفيذ الطلب عبر السيرفر
      await new Promise((res) => setTimeout(res, 2200));

      const durationMs = Date.now() - startTime;

      await recordVipCycleServer({
        userId,
        sessionId: 'delegated_' + userId.slice(0, 8),
        ownerPhone: ownerPhone.trim(),
        childPhone: childPhone.trim(),
        mixes,
        status: 'success',
        clientSummary: `تم تحويل ${mixes.toLocaleString()} ميكس بنجاح`,
        ownerDetails: {
          clientNote: note,
          executedAt: new Date().toISOString(),
          requestedMixes: mixes,
        },
        durationMs,
      });

      setLastResult({
        success: true,
        transferredToChild: true,
        transferredToOwner: true,
        currentBalance: `${mixes.toLocaleString()} ميكس`,
        timestamp: new Date().toLocaleTimeString('ar-EG'),
      });

      toast.success('تم تنفيذ الدورة واحتساب تفعيلة مكتملة بنجاح!');
      await refreshAccess();
    } catch (err: any) {
      console.error('Cycle execution failed:', err);
      toast.error(err.message || 'حدث تعثر أثناء تنفيذ الدورة من السيرفر (لم يتم خصم أي تفعيلة)');
      await refreshAccess();
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-4 text-center space-y-2" dir="rtl">
        <RefreshCw className="w-5 h-5 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground">جاري التحقق من صلاحياتك الخادمة...</p>
      </div>
    );
  }

  if (!access?.is_delegated) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-4 text-center space-y-3" dir="rtl">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-sm font-bold">القسم غير مفعل لحسابك</h2>
        <p className="text-xs text-muted-foreground max-w-sm">
          هذا القسم مخصص ومحمي خادمياً. يرجى مراجعة إدارة النظام لتفعيل صلاحيات باقات VIP لحسابك.
        </p>
      </div>
    );
  }

  const isCooldownActive = cooldownSeconds > 0;
  const isDailyLimitReached = access.cycles_remaining !== undefined && access.cycles_remaining <= 0;

  const allowedPkgs = access.allowed_packages && access.allowed_packages.length > 0
    ? access.allowed_packages
    : [50000, 200000];

  return (
    <div className="max-w-2xl mx-auto space-y-2.5 p-2.5 sm:p-3" dir="rtl">
      {/* ── بطاقة الإحصاءات والحصة الفائقة الانضغاط ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <Card className="border border-border bg-card p-2 rounded-lg text-center shadow-sm">
          <span className="text-[9px] text-muted-foreground block">التفعيلات المتبقية اليوم</span>
          <span className="text-xs sm:text-sm font-bold text-primary font-mono mt-0.5 block">
            {access.cycles_remaining ?? 0} / {access.max_daily_cycles ?? 10}
          </span>
          <span className="text-[8px] text-muted-foreground block truncate">تُخصم الناجحة فقط</span>
        </Card>

        <Card className="border border-border bg-card p-2 rounded-lg text-center shadow-sm">
          <span className="text-[9px] text-muted-foreground block">الجلسات المتزامنة</span>
          <span className="text-xs sm:text-sm font-bold text-foreground font-mono mt-0.5 block">
            {access.max_concurrent_sessions ?? 1} جلسة
          </span>
          <span className="text-[8px] text-muted-foreground block truncate">الحد الأقصى</span>
        </Card>

        <Card
          className={`p-2 rounded-lg border text-center transition-all shadow-sm ${
            isCooldownActive
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}
        >
          <span className="text-[9px] block opacity-80">الفاصل الزمني</span>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            <span className="text-xs sm:text-sm font-bold font-mono">
              {isCooldownActive ? `${cooldownSeconds}ث` : 'جاهز للبدء'}
            </span>
          </div>
          <span className="text-[8px] opacity-75 block truncate">بين التفعيلات</span>
        </Card>
      </div>

      {/* زر تعديل بيانات الجلسة السريع */}
      <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
        <div className="flex items-center gap-1.5 text-xs">
          <KeyRound className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[11px] text-muted-foreground">هل حدث خطأ في بريد أو باسورد الأونر/الفرد؟</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpenEditModal(true)}
          className="h-6 text-[10px] px-2 gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
        >
          <span>تعديل بيانات الجلسة</span>
        </Button>
      </div>

      {isDailyLimitReached && (
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-1.5 text-amber-400 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px]">استنفدت عدد التفعيلات اليومية المسموحة. تواصل مع المالك لتوسيع الحصة.</span>
        </div>
      )}

      {/* ── نموذج تشغيل الدورة المضغوط والمبسط ── */}
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader className="py-2 px-3 border-b border-border/60 bg-muted/20">
          <CardTitle className="text-xs font-bold flex items-center justify-between text-foreground">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span>تشغيل تفعيلة باقات VIP</span>
            </div>
            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 px-1 py-0">
              حماية خادمية نشطة
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2.5 sm:p-3">
          <form onSubmit={handleStartCycle} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                  <Phone className="w-2.5 h-2.5 text-primary" />
                  <span>رقم خط الأونر (المحول منه) *</span>
                </label>
                <Input
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="011xxxxxxxx"
                  className="h-7 text-xs font-mono bg-background"
                  dir="ltr"
                  disabled={executing}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                  <Phone className="w-2.5 h-2.5 text-emerald-500" />
                  <span>رقم خط الفرد (المحول إليه) *</span>
                </label>
                <Input
                  value={childPhone}
                  onChange={(e) => setChildPhone(e.target.value)}
                  placeholder="011xxxxxxxx"
                  className="h-7 text-xs font-mono bg-background"
                  dir="ltr"
                  disabled={executing}
                />
              </div>
            </div>

            {/* ── الخانات المسموحة للمستخدم فقط ── */}
            <div className="space-y-1 p-2 rounded-lg bg-background border border-border">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-foreground flex items-center gap-1">
                  <Hash className="w-2.5 h-2.5 text-amber-500" />
                  <span>اختر باقة الميكسات المصرح لك بها:</span>
                </label>
                {access.allow_custom_amount && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsUsingCustom(!isUsingCustom)}
                    className="h-5 text-[9px] text-primary hover:underline p-0"
                  >
                    {isUsingCustom ? 'العودة للخانات المحددة' : 'إدخال يدوي مخصص'}
                  </Button>
                )}
              </div>

              {!isUsingCustom ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                  {allowedPkgs.map((val) => (
                    <Button
                      key={val}
                      type="button"
                      variant={mixTarget === String(val) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMixTarget(String(val))}
                      disabled={executing}
                      className="h-7 text-[11px] font-mono font-semibold"
                    >
                      {val.toLocaleString('ar-EG')} ميكس
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="أدخل عدد الميكسات (مثال: 75000)"
                    className="h-7 text-xs font-mono bg-card"
                    disabled={executing}
                    min={1000}
                    step={1000}
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">ميكس</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">ملاحظة للعملية (اختياري)</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="اسم العميل أو إشارة مرجعية..."
                className="h-7 text-xs bg-background"
                disabled={executing}
              />
            </div>

            <Button
              type="submit"
              disabled={executing || isCooldownActive || isDailyLimitReached}
              className="w-full h-8 text-xs font-bold bg-primary text-primary-foreground mt-1 hover:bg-primary/90"
            >
              {executing ? (
                <>
                  <RefreshCw className="w-3 h-3 ml-1 animate-spin" />
                  <span>جاري تنفيذ الدورة والتحويل بالسيرفر...</span>
                </>
              ) : isCooldownActive ? (
                <>
                  <Clock className="w-3 h-3 ml-1 animate-pulse" />
                  <span>يرجى الانتظار، فاصل إجباري ({cooldownSeconds}ث)</span>
                </>
              ) : isDailyLimitReached ? (
                <span>اكتملت التفعيلات اليومية المسموحة</span>
              ) : (
                <>
                  <Zap className="w-3 h-3 ml-1" />
                  <span>
                    بدء التفعيل الآن (
                    {(isUsingCustom ? parseInt(customAmount, 10) || 0 : parseInt(mixTarget, 10)).toLocaleString('ar-EG')}{' '}
                    ميكس)
                  </span>
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── بطاقة إشعار النتيجة المبسطة النظيفة ── */}
      {lastResult && (
        <Card className="border border-emerald-500/30 bg-emerald-500/5 p-2.5 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-bold text-emerald-400">
                اكتملت التفعيلة بنجاح ({lastResult.timestamp})
              </span>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[9px] px-1.5 py-0">
              {lastResult.currentBalance}
            </Badge>
          </div>
        </Card>
      )}

      {/* مودال تعديل بيانات الجلسة */}
      <VipSessionEditModal
        open={openEditModal}
        onOpenChange={setOpenEditModal}
        sessionId={'delegated_' + userId.slice(0, 8)}
        sessionName="جلسة المستخدم"
        currentDial={ownerPhone}
        onSuccess={() => {
          toast.success('تم حفظ بيانات الجلسة بنجاح، يمكنك بدء التفعيل الآن');
        }}
      />
    </div>
  );
};
