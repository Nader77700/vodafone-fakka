import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Crown,
  Users,
  Phone,
  Sparkles,
  Layers,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  ArrowLeftRight,
  ShieldCheck,
  Cpu,
  Target,
  Repeat,
  Zap,
} from 'lucide-react';
import type { VipSession } from '@/types/vip';
import { getVipPlanDisplayName } from '@/lib/vipApi';

interface Props {
  session: VipSession;
  onRefreshAll: () => Promise<void>;
  refreshing: boolean;
  onAddChild: (childNumber: string) => Promise<void>;
  addingChild: boolean;
  onChangePlan?: (targetPlan: '6' | '7') => Promise<void>;
  changingPlan?: boolean;
}

export function VipUnifiedMasterCard({
  session,
  onRefreshAll,
  refreshing,
  onAddChild,
  addingChild,
  onChangePlan,
  changingPlan,
}: Props) {
  const [openAddChildModal, setOpenAddChildModal] = useState(false);
  const [childPhoneInput, setChildPhoneInput] = useState(
    session.individual_account_identifier || ''
  );

  const planDisplayName = getVipPlanDisplayName(session.owner_current_plan);
  const isSeven =
    session.owner_current_plan?.includes('7') || session.owner_current_plan?.includes('270');
  const isSix =
    session.owner_current_plan?.includes('6') ||
    session.owner_current_plan?.includes('180') ||
    session.owner_current_plan?.includes('951');
  const isSupported = isSeven || isSix;

  const relDetails = (session.relationship_details || {}) as Record<string, any>;
  const ownerName = relDetails.owner_name;
  const childName = relDetails.child_name;
  const totalFamilyMixes =
    (Number(session.owner_mix_balance) || 0) + (Number(session.individual_mix_balance) || 0);

  // Strict check: Only true if verified and linked inside owner's family
  const hasChild =
    session.relationship_verified === true &&
    (session.relationship_status === 'linked_and_verified' ||
      (session.relationship_status as string) === 'verified');

  const formatBalance = (val: number | null | undefined) => {
    if (val === null || val === undefined) {
      return <span className="text-muted-foreground text-xs font-normal">بانتظار الفحص</span>;
    }
    const num = Number(val);
    return (
      <span className="font-mono font-bold text-foreground">
        {num.toLocaleString('en-US')}{' '}
        <span className="text-[11px] font-normal text-muted-foreground">ميكس</span>
      </span>
    );
  };

  const handleConfirmAddChild = async () => {
    if (!childPhoneInput.trim()) return;
    await onAddChild(childPhoneInput.trim());
    setOpenAddChildModal(false);
  };

  return (
    <>
      <div className="space-y-3.5" dir="rtl">
        {/* ══════════════════════════════════════════════════════════ */}
        {/* 1. LUXURY CONSOLE CARD: «نظام أتمتة اتصالات» (Compact) */}
        {/* ══════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border border-primary/30 bg-gradient-to-b from-card via-card/95 to-card/90 shadow-sm relative overflow-hidden p-3 sm:p-4">
          {/* Decorative ambient glow */}
          <div className="absolute top-0 right-1/4 w-72 h-36 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Title Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-border/70 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-inner shrink-0">
                <Cpu className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-sm sm:text-base font-black tracking-wide text-foreground font-mono">
                    || نظام أتمتة اتصالات ||
                  </h2>
                  <Badge className="bg-primary/15 text-primary border-primary/30 text-[9px] px-1.5 py-0 font-bold">
                    جلسة: {session.session_name}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  محرك الأتمتة المباشر المتطابق مع اسكريبت اتصالات بوت (Etisalat VIP Executor)
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshAll}
              disabled={refreshing}
              className="h-7 sm:h-8 text-[11px] sm:text-xs px-2.5 sm:px-3 gap-1.5 border-primary/40 hover:bg-primary/15 text-primary font-bold shadow-sm shrink-0 self-end sm:self-auto"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'جاري الفحص...' : 'فحص شامل وتحديث فوري'}</span>
            </Button>
          </div>

          {/* Console Grid Structure: Row 1 (Owner Details) & Row 2 (Targets & Metrics) */}
          <div className="pt-2.5 space-y-2 font-mono text-xs">
            {/* ═══ Segment 1: Owner & Plan Credentials ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 sm:p-2.5 rounded-lg bg-background/60 border border-border/60">
              {/* Owner Email */}
              <div className="flex flex-col justify-center p-1.5 sm:p-2 rounded bg-card/60 border border-border/40">
                <span className="text-[10px] text-muted-foreground font-sans flex items-center gap-1">
                  || إيميل الأونر:
                </span>
                <span className="text-xs sm:text-sm font-bold text-foreground mt-0.5 truncate" dir="ltr">
                  {session.owner_email || 'البريد غير متوفر'}
                </span>
              </div>

              {/* Owner Phone */}
              <div className="flex flex-col justify-center p-1.5 sm:p-2 rounded bg-card/60 border border-border/40">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-sans flex items-center gap-1">
                    <Phone className="w-3 h-3 text-primary" />
                    || رقم الأونر:
                  </span>
                  {ownerName && (
                    <span className="text-[10px] text-emerald-400 font-sans font-medium truncate max-w-[140px]" title={ownerName}>
                      {ownerName}
                    </span>
                  )}
                </div>
                <span className="text-xs sm:text-sm font-bold text-foreground mt-0.5" dir="ltr">
                  {session.owner_account_identifier || 'يُستخرج بعد الفحص'}
                </span>
              </div>

              {/* Current Plan */}
              <div className="flex flex-col justify-center p-1.5 sm:p-2 rounded bg-card/60 border border-border/40">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-sans flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-500" />
                    || النظام الحالي:
                  </span>
                  {!isSupported && onChangePlan && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onChangePlan('7')}
                      disabled={changingPlan}
                      className="h-5 text-[10px] px-1.5 text-amber-500 hover:bg-amber-500/10 gap-1"
                    >
                      <ArrowLeftRight className="w-2.5 h-2.5" />
                      <span>تحويل إلى 270</span>
                    </Button>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-bold text-amber-400 font-sans truncate">
                    {planDisplayName}
                  </span>
                  {isSeven ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px] px-1 py-0 shrink-0">
                      Parent 7 (270ج)
                    </Badge>
                  ) : isSix ? (
                    <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[9px] px-1 py-0 shrink-0">
                      Parent 6 (180ج)
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[9px] px-1 py-0 shrink-0">
                      غير معروف (سيتم الفحص)
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* ═══ Segment 2: Cycle & Target Status ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 sm:p-2.5 rounded-lg bg-background/60 border border-border/60">
              {/* Current Cycle */}
              <div className="flex flex-col justify-center p-1.5 sm:p-2 rounded bg-card/60 border border-border/40">
                <span className="text-[10px] text-muted-foreground font-sans flex items-center gap-1">
                  <Repeat className="w-3 h-3 text-sky-400" />
                  || الدورة الحالية:
                </span>
                <span className="text-xs sm:text-sm font-extrabold text-sky-400 mt-0.5">
                  {session.current_cycle || 0}
                </span>
              </div>

              {/* Target Mix */}
              <div className="flex flex-col justify-center p-1.5 sm:p-2 rounded bg-card/60 border border-border/40">
                <span className="text-[10px] text-muted-foreground font-sans flex items-center gap-1">
                  <Target className="w-3 h-3 text-rose-400" />
                  || الهدف المطلوب:
                </span>
                <span className="text-xs sm:text-sm font-extrabold text-foreground mt-0.5">
                  {(session.target_mix_balance || 50000).toLocaleString('en-US')}{' '}
                  <span className="text-[11px] font-normal text-muted-foreground font-sans">ميكس</span>
                </span>
              </div>

              {/* Current Mix Balance */}
              <div className="flex flex-col justify-center p-1.5 sm:p-2 rounded bg-card/60 border border-border/40">
                <span className="text-[10px] text-muted-foreground font-sans flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    || رصيد الأونر:
                  </span>
                  {totalFamilyMixes > 0 && (
                    <span className="text-[10px] text-sky-400 font-sans">
                      العائلة: {totalFamilyMixes.toLocaleString('en-US')}
                    </span>
                  )}
                </span>
                <span className="text-xs sm:text-sm font-extrabold text-emerald-400 mt-0.5">
                  {session.owner_mix_balance !== null && session.owner_mix_balance !== undefined
                    ? Number(session.owner_mix_balance).toLocaleString('en-US')
                    : 'بانتظار الفحص'}{' '}
                  <span className="text-[11px] font-normal text-muted-foreground font-sans">ميكس</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* 2. CHILD ACCOUNT & FAMILY LINKAGE MANAGEMENT CARD (Compact) */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Card className="border border-border/80 bg-card/90 shadow-sm" dir="rtl">
          <CardHeader className="p-2.5 sm:p-3 pb-2 border-b border-border/50 flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500 shrink-0">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div>
                <CardTitle className="text-xs font-bold text-foreground">
                  حساب الفرد التابع (Child Account) والربط العائلي
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">
                  إدارة خط الفرد، تأكيد الدعوة التلقائية، وتحويل الميكسات المتبادلة
                </p>
              </div>
            </div>

            {hasChild ? (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[11px] sm:text-xs px-2 py-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                الفرد مربوط بالعائلة ومؤكد
              </Badge>
            ) : (
              <div className="flex items-center gap-1.5">
                <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30 text-[10px] sm:text-xs px-1.5 py-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  غير مضاف في العيلة
                </Badge>
                <Button
                  size="sm"
                  onClick={() => setOpenAddChildModal(true)}
                  disabled={addingChild}
                  className="h-7 text-[11px] sm:text-xs px-2.5 bg-primary text-primary-foreground hover:bg-primary/90 gap-1 font-bold shadow"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>إضافة وتأكيد الفرد</span>
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-2.5 sm:p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {/* Child Email */}
              <div className="p-2.5 rounded-xl bg-background/80 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">البريد الإلكتروني للفرد</span>
                <span className="font-mono text-xs font-bold text-foreground mt-0.5 block truncate" dir="ltr">
                  {session.individual_email || 'غير متوفر'}
                </span>
              </div>

              {/* Child Phone */}
              <div className="p-2.5 rounded-xl bg-background/80 border border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3 text-blue-500" />
                    رقم خط الفرد
                  </span>
                  {childName && (
                    <span className="text-[10px] text-blue-400 font-sans font-medium truncate max-w-[130px]" title={childName}>
                      {childName}
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs font-bold text-foreground mt-0.5 block truncate" dir="ltr">
                  {session.individual_account_identifier || 'غير محدد'}
                </span>
              </div>

              {/* Family Status */}
              <div className="p-2.5 rounded-xl bg-background/80 border border-border/60">
                <span className="text-[10px] text-muted-foreground block">حالة إضافة الفرد للعائلة</span>
                <div className="mt-1">
                  {hasChild ? (
                    <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 w-fit">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      مضاف داخل الأونر
                    </Badge>
                  ) : (
                    <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1 w-fit">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      غير مضاف داخل الأونر
                    </Badge>
                  )}
                </div>
              </div>

              {/* Child Mix Balance */}
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <span className="text-[10px] text-muted-foreground block">رصيد ميكسات الفرد المتوفرة</span>
                <div className="mt-0.5">{formatBalance(session.individual_mix_balance)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Dialog: Add Child with Automatic Invitation & Acceptance ── */}
      <Dialog open={openAddChildModal} onOpenChange={setOpenAddChildModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg p-5" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              إضافة وتأكيد فرد جديد في العائلة (Add Child)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              وفقاً لمنطق اسكريبت اتصالات بوت المعتمد، سيقوم النظام تلقائياً بتجديد باقة الأونر (270) وإرسال دعوة إضافة للرقم، ثم تسجيل الدخول لحساب الفرد وتجديد باقته لقبول الدعوة فورياً، ثم إعادة فحص حساب الأونر للتأكد.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                رقم هاتف الفرد المراد إضافته:
              </label>
              <Input
                placeholder="مثال: 011xxxxxxxx أو 01140427996"
                value={childPhoneInput}
                onChange={(e) => setChildPhoneInput(e.target.value)}
                className="font-mono text-sm h-9"
                dir="ltr"
              />
              <p className="text-[10px] text-muted-foreground">
                يمكن إدخال الرقم بالصيغة المحلية (01xxxxxxxxx) أو الدولية (201xxxxxxxxx).
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/60 border border-border/80 text-[11px] text-muted-foreground space-y-1">
              <span className="font-bold text-foreground block">خطوات التنفيذ التلقائي (من السكريبت):</span>
              <p>1. تجديد باقة الأونر حكاية 270 (حركة تنشيطية بنسبة 10%).</p>
              <p>2. إرسال أمر إضافة الفرد عبر خدمة العائلة (addChildRequest).</p>
              <p>3. الدخول التلقائي لحساب الفرد وتجديد باقته لقبول الدعوة فورياً.</p>
              <p>4. فحص حساب الأونر للتأكد من ظهور الفرد بنجاح في fafNumberList.</p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenAddChildModal(false)}
              disabled={addingChild}
              className="text-xs"
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmAddChild}
              disabled={addingChild || !childPhoneInput.trim()}
              className="text-xs font-bold gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{addingChild ? 'جاري التنفيذ التلقائي...' : 'بدء إضافة وتأكيد الفرد'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
