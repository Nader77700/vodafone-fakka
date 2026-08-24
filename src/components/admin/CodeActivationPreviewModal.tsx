// مودال معاينة الكود قبل التفعيل الإجباري
// يعرض: بيانات الكود + الاستخدام السابق + تأكيد Override مع سبب
import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle, XCircle, AlertTriangle, Key, User, Calendar,
  Loader2, ShieldAlert, Info, Clock,
} from 'lucide-react';
import { getCodeActivationInfo, type CodeActivationInfo } from '@/lib/api';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface CodeActivationPreviewModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  targetUsername: string;
  onConfirm: (code: string, overrideReason: string) => Promise<void>;
}

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}

const CODE_TYPE_LABEL: Record<string, string> = {
  paid:    'مدفوع',
  trial:   'تجريبي',
  gift:    'هدية',
};
const CODE_STATUS_STYLE: Record<string, string> = {
  active:   'text-success bg-success/10 border-success/20',
  used:     'text-warning bg-warning/10 border-warning/20',
  disabled: 'text-destructive bg-destructive/10 border-destructive/20',
  expired:  'text-muted-foreground bg-muted/20 border-border',
};

export default function CodeActivationPreviewModal({
  open,
  onOpenChange,
  userId,
  targetUsername,
  onConfirm,
}: CodeActivationPreviewModalProps) {
  const [code,         setCode]         = useState('');
  const [info,         setInfo]         = useState<CodeActivationInfo | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [confirming,   setConfirming]   = useState(false);
  const [reason,       setReason]       = useState('');
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // إعادة تعيين عند فتح المودال
  useEffect(() => {
    if (!open) {
      setCode(''); setInfo(null); setLoading(false);
      setConfirming(false); setReason(''); setShowConfirm(false); setError(null);
    }
  }, [open]);

  const handleLookup = useCallback(async () => {
    if (!code.trim()) return;
    setLoading(true); setInfo(null); setError(null); setShowConfirm(false);
    const result = await getCodeActivationInfo(userId, code.trim().toUpperCase());
    setInfo(result);
    if (!result.valid && result.error) setError(result.error);
    setLoading(false);
  }, [code, userId]);

  const handleConfirm = async () => {
    if (!info?.valid || !reason.trim()) return;
    setConfirming(true);
    try {
      await onConfirm(code.trim().toUpperCase(), reason.trim());
      onOpenChange(false);
    } finally {
      setConfirming(false);
    }
  };

  const hasOverride = !!info?.prevActivation;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-5 h-5 text-warning" />
            تفعيل كود إجباري — {targetUsername}
          </DialogTitle>
        </DialogHeader>

        {/* حقل البحث عن الكود */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold">كود التفعيل</Label>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setInfo(null); setShowConfirm(false); setError(null); }}
              placeholder="أدخل الكود..."
              className="flex-1 font-mono text-sm tracking-widest"
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-10 gap-1 shrink-0"
              disabled={!code.trim() || loading}
              onClick={handleLookup}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              فحص
            </Button>
          </div>

          {/* خطأ */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm">
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Skeleton */}
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          )}

          {/* نتيجة الفحص */}
          {info?.valid && !loading && (
            <div className="space-y-3">

              {/* بطاقة الكود */}
              <div className="p-3 rounded-xl border border-border bg-muted/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-primary" /> تفاصيل الكود
                  </span>
                  <span className={cn('text-[11px] px-2 py-0.5 rounded-full border font-semibold', CODE_STATUS_STYLE[info.status] ?? 'text-muted-foreground')}>
                    {info.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">النوع</span>
                  <span className="font-semibold">{CODE_TYPE_LABEL[info.codeType] ?? info.codeType}</span>
                  <span className="text-muted-foreground">المدة</span>
                  <span className="font-semibold">{info.durationDays} يوم</span>
                  <span className="text-muted-foreground">حد العمليات</span>
                  <span className="font-semibold">{info.opsLimit ?? 'غير محدود'}</span>
                  <span className="text-muted-foreground">المستخدمون</span>
                  <span className="font-semibold">{info.usedCount} / {info.allowedUsers ?? '∞'}</span>
                  {info.expiryDate && (
                    <>
                      <span className="text-muted-foreground">ينتهي</span>
                      <span className="font-semibold">{fmt(info.expiryDate)}</span>
                    </>
                  )}
                  {info.notes && (
                    <>
                      <span className="text-muted-foreground">ملاحظات</span>
                      <span className="font-semibold text-pretty">{info.notes}</span>
                    </>
                  )}
                </div>
              </div>

              {/* معاينة الاشتراك الجديد */}
              <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" /> معاينة الاشتراك الجديد
                </span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">الأيام الحالية المتبقية</span>
                  <span className="font-semibold">{info.currentDays} يوم</span>
                  <span className="text-muted-foreground">أيام الكود</span>
                  <span className="font-semibold">{info.newDays} يوم</span>
                  <span className="text-muted-foreground">الانتهاء الجديد</span>
                  <span className="font-semibold text-success">{fmt(info.newExpiry)}</span>
                </div>
              </div>

              {/* تحذير Override — إذا كان الكود مستخدماً مسبقاً */}
              {hasOverride && info.prevActivation && (
                <div className="p-3 rounded-xl border border-warning/30 bg-warning/10 space-y-2">
                  <div className="flex items-center gap-2 text-warning text-xs font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    هذا الكود مفعَّل مسبقاً — سيتم تخطي القيود
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">المستخدم السابق</span>
                    <span className="font-semibold flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {info.prevActivation.username ?? info.prevActivation.email ?? info.prevActivation.userId.slice(0, 8)}
                    </span>
                    <span className="text-muted-foreground">تاريخ التفعيل</span>
                    <span className="font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmt(info.prevActivation.activatedAt)}
                    </span>
                    {info.prevActivation.subscriptionStatus && (
                      <>
                        <span className="text-muted-foreground">حالة الاشتراك</span>
                        <span className="font-semibold">{info.prevActivation.subscriptionStatus}</span>
                      </>
                    )}
                    {info.prevActivation.subscriptionExpiry && (
                      <>
                        <span className="text-muted-foreground">انتهاء اشتراكه</span>
                        <span className="font-semibold">{fmt(info.prevActivation.subscriptionExpiry)}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* حقل السبب */}
              {!showConfirm ? (
                <Button
                  className="w-full gap-2"
                  variant={hasOverride ? 'default' : 'default'}
                  onClick={() => setShowConfirm(true)}
                >
                  <CheckCircle className="w-4 h-4" />
                  {hasOverride ? 'متابعة — تفعيل إجباري' : 'متابعة للتفعيل'}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-1.5 text-xs text-warning">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    سيُسجَّل هذا الإجراء في سجل التدقيق
                  </div>
                  <Label className="text-xs font-semibold">سبب التفعيل الإجباري *</Label>
                  <Textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="اذكر سبب تخطي القيود..."
                    className="text-sm min-h-[72px]"
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {showConfirm && info?.valid && (
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setShowConfirm(false); setReason(''); }}
              disabled={confirming}
            >
              رجوع
            </Button>
            <Button
              className="flex-1 bg-warning hover:bg-warning/90 text-warning-foreground gap-1.5"
              disabled={confirming || !reason.trim()}
              onClick={handleConfirm}
            >
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
              تأكيد التفعيل الإجباري
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
