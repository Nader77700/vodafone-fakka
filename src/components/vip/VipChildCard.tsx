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
import { Users, UserPlus, Phone, CheckCircle2, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import type { VipSession } from '@/types/vip';

interface Props {
  session: VipSession;
  onAddChild: (childNumber: string) => Promise<void>;
  addingChild: boolean;
}

export function VipChildCard({ session, onAddChild, addingChild }: Props) {
  const [openAddModal, setOpenAddModal] = useState(false);
  const [childPhoneInput, setChildPhoneInput] = useState('');

  const hasChild =
    session.relationship_verified ||
    !!session.individual_account_identifier ||
    (session.relationship_status as string) === 'verified' ||
    session.relationship_status === 'linked_and_verified';

  const formatBalance = (val: number | null | undefined) => {
    if (session.individual_balance_status === 'unable_to_read') {
      return <Badge variant="destructive" className="text-[10px] px-1.5 py-0 bg-rose-500/20 text-rose-400 border border-rose-500/30">تعذر قراءة الرصيد</Badge>;
    }
    if (val === null || val === undefined) {
      return <span className="text-muted-foreground text-xs font-normal">بانتظار الفحص</span>;
    }
    return (
      <span className="font-mono font-bold text-foreground">
        {val.toLocaleString('ar-EG')} <span className="text-xs font-normal text-muted-foreground">ميكس</span>
      </span>
    );
  };

  const handleSubmitAddChild = async () => {
    if (!childPhoneInput.trim()) return;
    await onAddChild(childPhoneInput.trim());
    setOpenAddModal(false);
    setChildPhoneInput('');
  };

  return (
    <>
      <Card className="border border-border/80 bg-card/90 shadow-sm relative overflow-hidden" dir="rtl">
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />

        <CardHeader className="p-3 pb-2 border-b border-border/50 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-xs font-bold text-foreground">بيانات وحالة الفرد (Child Line)</CardTitle>
              <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                {session.individual_email || 'البريد غير متوفر'}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenAddModal(true)}
            disabled={addingChild}
            className="h-7 text-xs px-2 gap-1 border-primary/30 text-primary hover:bg-primary/10"
          >
            <UserPlus className="w-3 h-3" />
            <span>إضافة فرد جديد</span>
          </Button>
        </CardHeader>

        <CardContent className="p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            {/* Phone Number */}
            <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
              <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
                <Phone className="w-3 h-3 text-blue-500" />
                رقم خط الفرد
              </span>
              <span className="font-mono text-xs font-bold text-foreground mt-0.5 block truncate">
                {session.individual_account_identifier || 'غير مضاف بالعائلة'}
              </span>
            </div>

            {/* Relationship Status: هل يوجد فرد داخل الأونر ولا لا */}
            <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
              <span className="text-[10px] text-muted-foreground block">حالة ربط العائلة</span>
              <div className="mt-0.5 flex items-center gap-1">
                {hasChild ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    يوجد فرد مربوط
                  </Badge>
                ) : (
                  <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1">
                    <AlertCircle className="w-2.5 h-2.5" />
                    لا يوجد فرد مضاف
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Child Mix Balance */}
          <div className="p-2.5 rounded-lg bg-gradient-to-l from-blue-500/10 via-background to-background border border-blue-500/20 flex items-center justify-between">
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
                variant="ghost"
                size="sm"
                onClick={() => setOpenAddModal(true)}
                className="h-6 text-[10px] px-2 text-primary hover:underline p-0"
              >
                ربط الآن
              </Button>
            )}
          </div>

          {/* Quota system info badge according to plan */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1 pt-0.5 border-t border-border/40">
            <span>حصة الفرد المخصصة:</span>
            <span className="font-semibold text-primary">
              {session.owner_current_plan?.includes('180')
                ? '800 ميكس (نظام حكاية 180)'
                : '1,300 ميكس (نظام حكاية 270)'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Dialog: Add Child Flow matching Script Exactly ── */}
      <Dialog open={openAddModal} onOpenChange={setOpenAddModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg p-5" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              إضافة وتأكيد فرد جديد في العائلة (Add Child)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              وفقاً لمنطق السكريبت المرجعي، سيقوم النظام بإرسال دعوة إضافة للرقم المحدد من حساب الأونر بنسبة 10%، ثم تسجيل الدخول لحساب الفرد تلقائياً لتأكيد وقبول الدعوة وتحديث قائمة العائلة (fafNumberList).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">رقم هاتف الفرد المراد إضافته:</label>
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
              onClick={() => setOpenAddModal(false)}
              disabled={addingChild}
              className="text-xs"
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitAddChild}
              disabled={addingChild || !childPhoneInput.trim()}
              className="text-xs gap-1.5"
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
