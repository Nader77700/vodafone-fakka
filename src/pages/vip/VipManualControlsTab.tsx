import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  RefreshCw,
  Send,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCw,
  FileText,
  Info,
  AlertTriangle,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Smartphone,
} from 'lucide-react';
import type { VipDashboardData, VipSupportedSystem, VipSession } from '@/types/vip';
import { VipReleaseAndMinionCard } from '@/components/vip/VipReleaseAndMinionCard';
import {
  submitVipManualOperation,
  executeVipChangePlan,
  executeVipTransferToChild,
  executeVipReturnChildMixes,
  executeVipRenewBundle,
  executeVipCheckStatus,
} from '@/lib/vipApi';

interface Props {
  data: VipDashboardData;
  activeSession: VipSession;
  onRefresh: () => void;
}

type ModalType =
  | 'change_system'
  | 'transfer_to_individual'
  | 'transfer_to_owner'
  | 'renew_bundle'
  | 'refresh_data'
  | 'view_details'
  | null;

export function VipManualControlsTab({ data, activeSession, onRefresh }: Props) {
  const { supported_systems } = data;
  const session = activeSession;

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('5000');

  // Submit manual operation via live Etisalat Engine
  const handleSubmitOperation = async (opType: string, actionLabel: string, planId?: string, amount?: number) => {
    setSubmitting(true);
    try {
      let liveRes: any = null;
      if (opType === 'change_system') {
        const target = planId?.includes('6') ? '6' : '7';
        liveRes = await executeVipChangePlan(session.id, target);
      } else if (opType === 'transfer_to_individual') {
        liveRes = await executeVipTransferToChild(session.id, amount);
      } else if (opType === 'transfer_to_owner') {
        liveRes = await executeVipReturnChildMixes(session.id);
      } else if (opType === 'renew_bundle') {
        liveRes = await executeVipRenewBundle(session.id);
      } else if (opType === 'refresh_data') {
        liveRes = await executeVipCheckStatus(session.id);
      }

      if (liveRes && liveRes.success) {
        toast.success(liveRes.message || 'تم تنفيذ العملية بنجاح عبر محرك اتصالات!');
      } else if (liveRes && !liveRes.success) {
        toast.error(liveRes.error || 'فشل تنفيذ العملية المباشرة');
      } else {
        const res = await submitVipManualOperation(
          opType,
          actionLabel,
          planId,
          amount,
          session.id
        );
        toast.success(res.message || 'تم تسجيل العملية بنجاح');
      }

      setActiveModal(null);
      onRefresh();
    } catch (err: any) {
      console.error('[VipManual] Submit operation failed:', err);
      toast.error('تعذر تنفيذ العملية: ' + (err?.message || 'خطأ غير متوقع'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                التحكم اليدوي المخصص للجلسة: {session.session_name}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                Session Scoped
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              الأونر: <strong className="text-foreground font-mono dir-ltr">{session.owner_account_identifier || 'غير مضبوط'}</strong> • الفرد: <strong className="text-foreground font-mono dir-ltr">{session.individual_account_identifier || 'غير مضبوط'}</strong>
            </p>
          </div>
        </div>

        <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-xs shrink-0 self-end sm:self-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          محرك اتصالات المباشر: جاهز للتشغيل
        </Badge>
      </div>

      {/* Release & MINION Script Suite */}
      <VipReleaseAndMinionCard activeSession={session} onRefresh={onRefresh} />

      {/* Manual Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        
        {/* 1. Change System */}
        <Card className="border border-border/80 bg-card hover:border-primary/40 transition-all flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-blue-500" />
              تغيير النظام يدوياً
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              التبديل بين أنظمة حكاية المؤهلة (Hekaya 6 / 7)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3 text-xs">
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              إرسال طلب تغيير باقة ونظام الخط إلى نظام بديل مدعوم لترحيل الميكسات بأمان.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedSystem(session.owner_current_plan || 'Hekaya_XRP_MIX_Parent_7');
                setActiveModal('change_system');
              }}
              className="w-full text-xs h-8 border-border"
            >
              تحديد النظام وتنفيذ التغيير...
            </Button>
          </CardContent>
        </Card>

        {/* 2. Transfer Mixes to Individual */}
        <Card className="border border-border/80 bg-card hover:border-primary/40 transition-all flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-amber-500" />
              تحويل ميكسات إلى الفرد
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              نقل كمية ميكسات محددة من الأونر إلى حساب الفرد
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3 text-xs">
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              تحويل ميكسات من حساب الأونر إلى الفرد المربوط لتأمينها قبل التجديد أو الترحيل.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTransferAmount('5000');
                setActiveModal('transfer_to_individual');
              }}
              className="w-full text-xs h-8 border-border"
            >
              تحويل ميكسات للفرد...
            </Button>
          </CardContent>
        </Card>

        {/* 3. Transfer Mixes to Owner */}
        <Card className="border border-border/80 bg-card hover:border-primary/40 transition-all flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
              تحويل ميكسات إلى الأونر
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              استرجاع وسحب الميكسات من خط الفرد إلى الأونر
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3 text-xs">
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              إعادة تجميع الميكسات المتوفرة لدى الفرد إلى حساب الأونر لبلوغ الرصيد المستهدف.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTransferAmount('5000');
                setActiveModal('transfer_to_owner');
              }}
              className="w-full text-xs h-8 border-border"
            >
              استرجاع ميكسات للأونر...
            </Button>
          </CardContent>
        </Card>

        {/* 4. Renew Bundle */}
        <Card className="border border-border/80 bg-card hover:border-primary/40 transition-all flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              تجديد الباقة يدوياً
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              تنفيذ دورة تجديد باقة الأونر الفورية
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3 text-xs">
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              إطلاق طلب تجديد باقة حكاية الحالي للخط والتأكد من توافر الرصيد الكافي للتجديد.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal('renew_bundle')}
              className="w-full text-xs h-8 border-border"
            >
              تجديد الباقة الآن...
            </Button>
          </CardContent>
        </Card>

        {/* 5. Sync Account Data */}
        <Card className="border border-border/80 bg-card hover:border-primary/40 transition-all flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-purple-500" />
              تحديث بيانات الحساب
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              استعلام أحدث الأرصدة والباقات من الخادم
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3 text-xs">
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              إرسال طلب استعلام فوري لتحديث رصيد الأونر، رصيد الفرد، وحالة ارتباط الخطين.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal('refresh_data')}
              className="w-full text-xs h-8 border-border"
            >
              طلب استعلام وتحديث البيانات...
            </Button>
          </CardContent>
        </Card>

        {/* 6. View Details */}
        <Card className="border border-border/80 bg-card hover:border-primary/40 transition-all flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              عرض تفاصيل الحسابات
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              ملخص كامل لبيانات الطرفين والارتباط
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3 text-xs">
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              استعراض المعرّفات والأنظمة الحالية وسجلات التدقيق المربوطة بهذه الجلسة.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal('view_details')}
              className="w-full text-xs h-8 border-border"
            >
              استعراض التفاصيل الكاملة
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* ── MODALS WITH EXPLICIT CONFIRMATIONS ── */}

      {/* Modal 1: Change System */}
      <Dialog open={activeModal === 'change_system'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-blue-500" />
              تأكيد طلب تغيير النظام
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              اختر النظام المستهدف لتنفيذ الانتقال لخط الأونر في الجلسة «{session.session_name}».
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الجلسة:</span>
                <span className="font-semibold text-foreground">{session.session_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">خط الأونر:</span>
                <span className="font-mono text-foreground dir-ltr">{session.owner_account_identifier || 'غير محدد'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">النظام الحالي:</span>
                <span className="font-medium text-foreground">{session.owner_current_plan || 'غير محدد'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">النظام الجديد المطلوب</Label>
              <Select value={selectedSystem} onValueChange={setSelectedSystem}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="اختر النظام البديل" />
                </SelectTrigger>
                <SelectContent>
                  {supported_systems.map((sys) => (
                    <SelectItem key={sys.id} value={sys.id} className="text-xs">
                      {sys.display_name} {sys.is_auto_eligible ? '(مؤهل)' : '(غير مؤهل)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-500 text-[11px]">
              <Info className="w-3.5 h-3.5 inline ml-1 shrink-0" />
              سيتم تسجيل الطلب في سجل الجلسة بحالة «بانتظار التكامل» لحين ربط سكريبت المشغل في المرحلة القادمة.
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setActiveModal(null)} className="text-xs h-8 border-border">
              إلغاء
            </Button>
            <Button
              size="sm"
              disabled={submitting || !selectedSystem}
              onClick={() => handleSubmitOperation('change_system', `طلب تغيير النظام إلى ${selectedSystem}`, selectedSystem)}
              className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {submitting ? 'جاري التسجيل...' : 'تأكيد طلب التغيير'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Transfer to Individual */}
      <Dialog open={activeModal === 'transfer_to_individual'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-amber-500" />
              تأكيد تحويل ميكسات إلى الفرد
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              تحديد كمية الميكسات المراد نقلها من الأونر إلى خط الفرد المربوط.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">من (الأونر):</span>
                <span className="font-mono text-foreground dir-ltr">{session.owner_account_identifier || 'غير محدد'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إلى (الفرد):</span>
                <span className="font-mono text-foreground dir-ltr">{session.individual_account_identifier || 'غير محدد'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">كمية الميكسات المراد تحويلها</Label>
              <Input
                type="number"
                min={100}
                step={500}
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="5000"
                className="font-mono text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setActiveModal(null)} className="text-xs h-8 border-border">
              إلغاء
            </Button>
            <Button
              size="sm"
              disabled={submitting || !transferAmount || Number(transferAmount) <= 0}
              onClick={() =>
                handleSubmitOperation(
                  'transfer_to_individual',
                  `تحويل ${Number(transferAmount).toLocaleString('ar-EG')} ميكس للفرد`,
                  undefined,
                  Number(transferAmount)
                )
              }
              className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              {submitting ? 'جاري التسجيل...' : 'تأكيد طلب التحويل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Transfer to Owner */}
      <Dialog open={activeModal === 'transfer_to_owner'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
              تأكيد تحويل ميكسات إلى الأونر
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              سحب الميكسات من خط الفرد وإرجاعها لحساب الأونر.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">من (الفرد):</span>
                <span className="font-mono text-foreground dir-ltr">{session.individual_account_identifier || 'غير محدد'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إلى (الأونر):</span>
                <span className="font-mono text-foreground dir-ltr">{session.owner_account_identifier || 'غير محدد'}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">كمية الميكسات المسترجعة</Label>
              <Input
                type="number"
                min={100}
                step={500}
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="5000"
                className="font-mono text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setActiveModal(null)} className="text-xs h-8 border-border">
              إلغاء
            </Button>
            <Button
              size="sm"
              disabled={submitting || !transferAmount || Number(transferAmount) <= 0}
              onClick={() =>
                handleSubmitOperation(
                  'transfer_to_owner',
                  `استرجاع ${Number(transferAmount).toLocaleString('ar-EG')} ميكس للأونر`,
                  undefined,
                  Number(transferAmount)
                )
              }
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {submitting ? 'جاري التسجيل...' : 'تأكيد طلب السحب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 4: Renew Bundle */}
      <Dialog open={activeModal === 'renew_bundle'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              تأكيد طلب تجديد الباقة
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              تنفيذ دورة التجديد اليدوي لباقة الأونر في الجلسة «{session.session_name}».
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs space-y-1">
            <span className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              تنبيه التحقق من الرصيد:
            </span>
            <p className="text-muted-foreground text-[11px]">
              يتطلب التجديد وجود رصيد كافٍ لتجديد باقة حكاية المختارة.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setActiveModal(null)} className="text-xs h-8 border-border">
              إلغاء
            </Button>
            <Button
              size="sm"
              disabled={submitting}
              onClick={() => handleSubmitOperation('renew_bundle', 'طلب تجديد باقة الأونر يدوياً', session.owner_current_plan || undefined)}
              className="text-xs h-8 bg-primary text-primary-foreground font-semibold"
            >
              {submitting ? 'جاري التسجيل...' : 'تأكيد التجديد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 5: Refresh Data */}
      <Dialog open={activeModal === 'refresh_data'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-purple-500" />
              طلب استعلام وتحديث بيانات الحساب
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              إرسال طلب فحص واستعلام البيانات لأحدث أرصدة الطرفين.
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">
            سيتم توثيق طلب التحديث في سجل عمليات الجلسة، وفي المرحلة القادمة سيقوم محرك المشغل بجلب الأرصدة والبيانات الفعلية من مزود الخدمة.
          </p>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setActiveModal(null)} className="text-xs h-8 border-border">
              إلغاء
            </Button>
            <Button
              size="sm"
              disabled={submitting}
              onClick={() => handleSubmitOperation('sync_account_data', 'طلب استعلام وتحديث أرصدة الحساب')}
              className="text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white font-semibold"
            >
              {submitting ? 'جاري التسجيل...' : 'إرسال طلب الاستعلام'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 6: View Details */}
      <Dialog open={activeModal === 'view_details'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              تفاصيل حسابات الجلسة: {session.session_name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2.5 py-1 text-xs">
            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">معرّف الجلسة:</span>
                <span className="font-mono text-foreground font-semibold dir-ltr">{session.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">حساب الأونر:</span>
                <span className="font-mono text-foreground dir-ltr">{session.owner_account_identifier || 'غير مربوط'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">حساب الفرد:</span>
                <span className="font-mono text-foreground dir-ltr">{session.individual_account_identifier || 'غير مربوط'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">حالة الارتباط:</span>
                <span className="font-medium text-foreground">{session.relationship_verified ? 'مؤكد وموثق' : 'غير مؤكد'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الرصيد المستهدف:</span>
                <span className="font-mono text-foreground font-semibold">{session.target_mix_balance?.toLocaleString('ar-EG')} ميكس</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button size="sm" onClick={() => setActiveModal(null)} className="text-xs h-8">
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
