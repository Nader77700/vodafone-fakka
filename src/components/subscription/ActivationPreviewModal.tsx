// نافذة معاينة التفعيل — تعرض كافة تفاصيل الكود قبل التفعيل
import { useState } from 'react';
import {
  Loader2, Key, Plus, ArrowLeft, CheckCircle, Calendar,
  Users, Shield, Zap, Gift, Clock, Info, MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { getActivationPreview, activateLicenseKey } from '@/lib/api';
import { getStableDeviceIdentity } from '@/lib/deviceFingerprint';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const WA_NUMBER = '201222692182';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onSuccess: () => void;
}

type PreviewData = Awaited<ReturnType<typeof getActivationPreview>>;

function CodeTypeLabel({ type }: { type: string }) {
  if (type === 'trial') return <span className="flex items-center gap-1 text-warning font-bold"><Zap className="w-3.5 h-3.5" />تجريبي</span>;
  if (type === 'gift')  return <span className="flex items-center gap-1 text-success font-bold"><Gift className="w-3.5 h-3.5" />هدية</span>;
  return <span className="flex items-center gap-1 text-primary font-bold"><Shield className="w-3.5 h-3.5" />مدفوع</span>;
}

function PreviewRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-border/50 last:border-0 gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="text-right">
        <span className="text-xs font-semibold">{value}</span>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function InvalidCodeCard({ errorCode, error, onClose }: { errorCode?: string; error?: string; onClose: () => void }) {
  const reasons: Record<string, { icon: string; title: string; hint: string }> = {
    INVALID:          { icon: '❌', title: 'كود غير صحيح',         hint: 'تأكد من إدخال الكود بشكل صحيح دون مسافات' },
    DISABLED:         { icon: '🚫', title: 'الكود معطّل',          hint: 'هذا الكود تم تعطيله من قبل الإدارة' },
    EXPIRED:          { icon: '⏰', title: 'الكود منتهي الصلاحية', hint: 'انتهت صلاحية هذا الكود ولا يمكن استخدامه' },
    USED:             { icon: '✔️', title: 'الكود مستخدم مسبقاً', hint: 'تم استخدام هذا الكود من قبل' },
    MAX_USERS:        { icon: '👥', title: 'وصل للحد الأقصى',      hint: 'تم الوصول للحد الأقصى من المستخدمين لهذا الكود' },
    MAX_USES_PER_USER:{ icon: '🔢', title: 'تجاوزت حد الاستخدام', hint: 'استنفذت الحد الأقصى من الاستخدامات لهذا الكود' },
    ALREADY_USED:     { icon: '🔄', title: 'مفعّل مسبقاً',        hint: 'سبق أن فعّلت هذا الكود على حسابك' },
  };
  const info = reasons[errorCode ?? ''] ?? { icon: '⚠️', title: 'خطأ في التفعيل', hint: error ?? 'حدث خطأ غير متوقع' };
  const waMsg = encodeURIComponent(`مرحباً، أواجه مشكلة في تفعيل الكود\nرمز الخطأ: ${errorCode ?? 'UNKNOWN'}\n${error ?? ''}`);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-destructive/8 border border-destructive/20 space-y-2 text-center">
        <p className="text-2xl">{info.icon}</p>
        <p className="text-sm font-bold text-destructive">{info.title}</p>
        <p className="text-xs text-muted-foreground text-pretty">{info.hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`https://wa.me/${WA_NUMBER}?text=${waMsg}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 h-10 rounded-lg text-xs font-semibold border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-all"
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
          واتساب
        </a>
        <Button variant="outline" className="h-10 border-border text-xs" onClick={onClose}>
          حاول مجدداً
        </Button>
      </div>
    </div>
  );
}

export default function ActivationPreviewModal({ open, onOpenChange, userId, onSuccess }: Props) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [activating, setActivating] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const { profile } = useAuth();

  const handleCheck = async () => {
    if (!code.trim()) { toast.error('أدخل كود التفعيل'); return; }
    setChecking(true);
    const res = await getActivationPreview(userId, code.trim().toUpperCase());
    setPreview(res);
    setChecking(false);
    if (!res.valid) toast.error(res.error ?? 'كود غير صحيح');
  };

  const handleActivate = async () => {
    if (!preview?.valid) return;
    setActivating(true);
    const identity = getStableDeviceIdentity();
    const res = await activateLicenseKey(userId, code.trim().toUpperCase(), {
      deviceFp: identity.device_fp,
      hardwareHash: identity.hardware_hash,
      nativeId: identity.device_id,
    });
    setActivating(false);
    if (res.success) {
      toast.success(preview.currentDays > 0
        ? `تم التجديد! الإجمالي ${preview.totalDays} يوم 🎉`
        : 'تم تفعيل الاشتراك بنجاح 🎉');
      setCode(''); setPreview(null);
      onOpenChange(false);
      onSuccess();
    } else {
      toast.error(res.error ?? 'حدث خطأ أثناء التفعيل');
      // أعد تحميل الـ preview لتحديث حالة الخطأ
      const freshPreview = await getActivationPreview(userId, code.trim().toUpperCase());
      setPreview(freshPreview);
    }
  };

  const reset = () => { setCode(''); setPreview(null); };
  const handleInvalidClose = () => { setPreview(null); setCode(''); };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" /> تفعيل كود جديد
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* حالة الخطأ — كود غير صالح */}
          {preview && !preview.valid && (
            <InvalidCodeCard errorCode={preview.errorCode} error={preview.error} onClose={handleInvalidClose} />
          )}

          {/* إدخال الكود — يظهر فقط عندما لا يوجد preview */}
          {!preview && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm font-normal text-muted-foreground">كود التفعيل</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 bg-background border-border font-mono text-sm uppercase tracking-widest"
                    placeholder="NAFK-XXXX-XXXX-XXXX"
                    value={code}
                    onChange={e => { setCode(e.target.value.toUpperCase()); }}
                    onKeyDown={e => e.key === 'Enter' && handleCheck()}
                    autoFocus
                  />
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                    onClick={handleCheck} disabled={checking || !code.trim()}>
                    {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'فحص'}
                  </Button>
                </div>
              </div>

              {/* زر واتساب للشراء */}
              <div className="pt-1 border-t border-border/50">
                <p className="text-xs text-muted-foreground text-center mb-2">ليس لديك كود تفعيل؟</p>
                <a
                  href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(
                    `أرغب في الحصول على اشتراك Vodafone Fakka Premium.\n` +
                    `اسم المستخدم: ${profile?.username ?? 'غير محدد'}\n` +
                    `رقم الهاتف: ${profile?.phone ?? 'غير محدد'}\n` +
                    `برجاء إرسال تفاصيل التفعيل.`
                  )}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-10 rounded-xl text-sm font-semibold border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-all"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  تواصل معنا عبر واتساب للاشتراك
                </a>
              </div>
            </div>
          )}

          {/* بطاقة المعاينة الكاملة */}
          {preview?.valid && (
            <div className="space-y-4">
              {/* نوع الكود + أيام */}
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/15 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">معاينة الكود</p>
                  <CodeTypeLabel type={preview.codeType} />
                </div>

                {/* الأيام: حالية + جديدة = إجمالي */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 text-center bg-card rounded-lg p-3 border border-border min-w-0">
                    <p className="text-xl font-black tabular-nums">{preview.currentDays}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">أيام حالية</p>
                  </div>
                  <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 text-center bg-primary/10 rounded-lg p-3 border border-primary/20 min-w-0">
                    <p className="text-xl font-black tabular-nums text-primary">{preview.newDays}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">أيام الكود</p>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 text-center bg-success/10 rounded-lg p-3 border border-success/20 min-w-0">
                    <p className="text-xl font-black tabular-nums text-success">{preview.totalDays}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">الإجمالي</p>
                  </div>
                </div>

                {/* تفاصيل الكود */}
                <div className="bg-card rounded-xl border border-border px-3 py-1">
                  <PreviewRow
                    label="ينتهي في"
                    value={new Date(preview.newExpiry).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
                  />
                  {preview.allowedUsers !== null && (
                    <PreviewRow
                      label="المستخدمون المسموح"
                      value={<span className="flex items-center gap-1"><Users className="w-3 h-3" />{preview.allowedUsers} مستخدم</span>}
                      sub={preview.remainingUses !== null ? `المتبقي: ${preview.remainingUses}` : undefined}
                    />
                  )}
                  <PreviewRow
                    label="استخدامات لكل مستخدم"
                    value={
                      preview.usesPerUser !== null
                        ? <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{preview.usesPerUser} مرة</span>
                        : <span className="flex items-center gap-1 text-primary font-bold">♾️ غير محدود</span>
                    }
                  />
                  {preview.expiryDate && (
                    <PreviewRow
                      label="تاريخ انتهاء الكود"
                      value={<span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(preview.expiryDate).toLocaleDateString('en-GB')}</span>}
                    />
                  )}
                  <PreviewRow
                    label="وضع الانتهاء"
                    value={
                      preview.expirationMode === 'BY_DATE' ? 'بتاريخ الانتهاء' :
                      preview.expirationMode === 'BY_USAGE' ? 'عند نفاد الحصة' :
                      'الأقرب (تاريخ أو حصة)'
                    }
                  />
                  {preview.notes && (
                    <PreviewRow
                      label="ملاحظة"
                      value={<span className="flex items-center gap-1"><Info className="w-3 h-3" />{preview.notes}</span>}
                    />
                  )}
                </div>

                {preview.currentDays > 0 && (
                  <p className="text-[10px] text-success text-center">
                    ✓ لن تفقد أيامك المتبقية — يتم الدمج تراكمياً
                  </p>
                )}

                {preview.expirationMode === 'BY_USAGE' && (
                  <p className="text-[10px] text-warning text-center flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" />
                    ينتهي عند نفاد الحصة
                  </p>
                )}
              </div>

              <button
                onClick={reset}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 block"
              >
                تغيير الكود
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="border-border" onClick={() => { onOpenChange(false); reset(); }}>
            إلغاء
          </Button>
          {preview?.valid && (
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
              onClick={handleActivate} disabled={activating}>
              {activating
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><CheckCircle className="w-4 h-4" /> تأكيد التفعيل</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

