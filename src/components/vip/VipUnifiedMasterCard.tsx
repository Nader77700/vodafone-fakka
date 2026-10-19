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
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import type { VipSession } from '@/types/vip';

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

  const isSeven =
    session.owner_current_plan?.includes('7') || session.owner_current_plan?.includes('270');
  const isSix =
    session.owner_current_plan?.includes('6') ||
    session.owner_current_plan?.includes('180') ||
    session.owner_current_plan?.includes('951');
  const isSupported = isSeven || isSix;

  const hasChild =
    session.relationship_verified ||
    !!session.individual_account_identifier ||
    (session.relationship_status as string) === 'verified' ||
    session.relationship_status === 'linked_and_verified';

  const formatBalance = (val: number | null | undefined) => {
    if (val === null || val === undefined) {
      return <span className="text-muted-foreground text-xs font-normal">بانتظار الفحص</span>;
    }
    return (
      <span className="font-mono font-bold text-foreground">
        {val.toLocaleString('ar-EG')}{' '}
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
      <Card
        className="border-2 border-primary/20 bg-card/95 shadow-md relative overflow-hidden"
        dir="rtl"
      >
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        {/* ── Header Row ── */}
        <CardHeader className="p-3.5 pb-2.5 border-b border-border/60 flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-bold text-foreground">
                  تفاصيل وبيانات الجلسة «{session.session_name}»
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/5 font-mono"
                >
                  VIP Active
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                فحص وتسجيل دخول مباشر عبر محرك اتصالات مع تحديث الأرصدة والأنظمة وحالة العائلة
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshAll}
            disabled={refreshing}
            className="h-8 text-xs px-2.5 gap-1.5 border-primary/30 hover:bg-primary/10 text-primary font-bold shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'جاري الفحص المباشر...' : 'فحص شامل وتحديث فوري'}</span>
          </Button>
        </CardHeader>

        <CardContent className="p-3.5 space-y-3.5">
          {/* ── 2 Columns: Owner Info & Child Info ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* ═══ Right Side: Owner Line ═══ */}
            <div className="p-3 rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent space-y-2.5">
              <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center text-amber-500">
                    <Crown className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-foreground">حساب الأونر (Owner)</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[170px]" dir="ltr">
                  {session.owner_email || 'البريد غير متوفر'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Phone */}
                <div className="p-2 rounded-lg bg-background/80 border border-border/60">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3 text-primary" />
                    رقم خط الأونر
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground mt-0.5 block truncate" dir="ltr">
                    {session.owner_account_identifier || 'يُستخرج بعد الفحص'}
                  </span>
                </div>

                {/* Plan */}
                <div className="p-2 rounded-lg bg-background/80 border border-border/60">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-500" />
                    النظام الحالي
                  </span>
                  <div className="mt-0.5">
                    {isSeven ? (
                      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] px-1 py-0">
                        Parent 7 (270ج)
                      </Badge>
                    ) : isSix ? (
                      <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px] px-1 py-0">
                        Parent 6 (180ج)
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px] px-1 py-0 truncate">
                        {session.owner_current_plan || 'غير محدد (سيتم ضبطه)'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Owner Balance */}
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center text-amber-500">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">رصيد ميكسات الأونر المتبقية</span>
                    <div className="text-sm">{formatBalance(session.owner_mix_balance)}</div>
                  </div>
                </div>

                {!isSupported && onChangePlan && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onChangePlan('7')}
                    disabled={changingPlan}
                    className="h-6 text-[10px] px-2 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 gap-1"
                  >
                    <ArrowLeftRight className="w-2.5 h-2.5" />
                    <span>تحويل إلى 270</span>
                  </Button>
                )}
              </div>
            </div>

            {/* ═══ Left Side: Child Line ═══ */}
            <div className="p-3 rounded-xl border border-blue-500/30 bg-gradient-to-b from-blue-500/5 to-transparent space-y-2.5">
              <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center text-blue-500">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-foreground">حساب الفرد (Child)</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[170px]" dir="ltr">
                  {session.individual_email || 'البريد غير متوفر'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Child Phone */}
                <div className="p-2 rounded-lg bg-background/80 border border-border/60">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3 text-blue-500" />
                    رقم خط الفرد
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground mt-0.5 block truncate" dir="ltr">
                    {session.individual_account_identifier || 'غير مضاف بالعائلة'}
                  </span>
                </div>

                {/* Family Linkage Status Indicator */}
                <div className="p-2 rounded-lg bg-background/80 border border-border/60">
                  <span className="text-[10px] text-muted-foreground block">حالة إضافة الفرد للعائلة</span>
                  <div className="mt-0.5">
                    {hasChild ? (
                      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        الفرد مربوط بالعائلة
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        غير مضاف داخل الأونر
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Child Balance & Direct Add Child Action */}
              <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center text-blue-500">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">رصيد ميكسات الفرد المتوفرة</span>
                    <div className="text-sm">{formatBalance(session.individual_mix_balance)}</div>
                  </div>
                </div>

                {hasChild ? (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">
                    جاهز للتحويل
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setOpenAddChildModal(true)}
                    disabled={addingChild}
                    className="h-7 text-xs px-2.5 bg-primary text-primary-foreground hover:bg-primary/90 gap-1 font-bold shadow"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>إضافة وتأكيد الفرد الآن</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Dialog: Add Child with Automatic Invitation & Acceptance ── */}
      <Dialog open={openAddChildModal} onOpenChange={setOpenAddChildModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg p-5" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              إضافة وتأكيد فرد جديد في العائلة (Add Child)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              وفقاً لمنطق السكريبت المعتمد، سيقوم النظام بإرسال دعوة إضافة للرقم المحدد من حساب الأونر بنسبة 10%، ثم تسجيل الدخول لحساب الفرد لتأكيد وقبول الدعوة تلقائياً وتحديث قائمة العائلة (fafNumberList).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                رقم هاتف الفرد المراد إضافته:
              </label>
              <Input
                placeholder="مثال: 011xxxxxxxx أو 01286398851"
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
              <span className="font-bold text-foreground block">خطوات التنفيذ التلقائي:</span>
              <p>1. إرسال أمر <code className="text-primary font-mono font-bold">addChildRequest</code> من حساب الأونر.</p>
              <p>2. تسجيل دخول حساب الفرد واستدعاء الاستهلاك لتأكيد الارتباط.</p>
              <p>3. إعادة فحص حساب الأونر للتأكد من نزول الرقم في قائمة العيلة.</p>
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
              className="text-xs gap-1.5 font-bold"
            >
              {addingChild ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري الإرسال وتأكيد الفرد...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>إرسال وتأكيد الإضافة الآن</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
