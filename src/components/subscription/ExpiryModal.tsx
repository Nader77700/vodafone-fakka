// نافذة انتهاء الاشتراك / تعليقه — PHASE 7: شاشة التعليق بالسبب + زر الدعم
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, RefreshCw, MessageCircle, PauseCircle, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const WA_NUMBER = '201222692182';

interface Props {
  open: boolean;
  reason?: 'expired' | 'trial_exhausted' | 'suspended';
  suspendReason?: string | null;
}

export default function ExpiryModal({ open, reason = 'expired', suspendReason }: Props) {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const isSuspended      = reason === 'suspended';
  const isTrialExhausted = reason === 'trial_exhausted';

  // redirect تلقائي فقط عند الانتهاء/النفاد — ليس عند التعليق
  useEffect(() => {
    if (!open || isSuspended) return;
    const t = setTimeout(() => navigate('/activate', { replace: true }), 5000);
    return () => clearTimeout(t);
  }, [open, isSuspended, navigate]);

  if (!open) return null;

  const waMsg = encodeURIComponent(
    `أريد التواصل بشأن اشتراك Vodafone Fakka Premium.\n` +
    `اسم المستخدم: ${profile?.username ?? 'غير محدد'}\n` +
    `رقم الهاتف: ${profile?.phone ?? 'غير محدد'}\n` +
    (isSuspended ? `الحالة: اشتراك معلق — ${suspendReason ?? 'غير محدد'}` : '')
  );

  // ── PHASE 7: شاشة التعليق ───────────────────────────────────────────
  if (isSuspended) {
    return (
      <div className="fixed inset-0 z-[100] bg-background/96 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-sm bg-card border border-warning/30 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="bg-warning/10 border-b border-warning/20 p-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-warning/15 border-2 border-warning/30 flex items-center justify-center mx-auto">
              <PauseCircle className="w-8 h-8 text-warning" />
            </div>
            <div>
              <h2 className="text-lg font-black text-balance">تم تعليق اشتراكك</h2>
              <p className="text-sm text-muted-foreground mt-1 text-pretty">
                تم تعليق اشتراكك بواسطة الإدارة مؤقتاً
              </p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {suspendReason && (
              <div className="p-3 bg-warning/8 rounded-xl border border-warning/20 text-center space-y-1">
                <p className="text-[11px] text-muted-foreground font-medium">سبب التعليق</p>
                <p className="text-sm font-bold text-warning">{suspendReason}</p>
              </div>
            )}
            <div className="p-3 bg-muted/20 rounded-xl border border-border text-center">
              <p className="text-xs text-muted-foreground leading-relaxed">
                لا تقلق — لم يتم حذف أي بيانات. تواصل مع الدعم لحل المشكلة.
              </p>
            </div>
            <Button
              className="w-full gap-2 h-11 text-sm font-semibold bg-warning hover:bg-warning/90 text-warning-foreground"
              onClick={() => window.open(`https://wa.me/${WA_NUMBER}?text=${waMsg}`, '_blank')}>
              <Headphones className="w-4 h-4" />
              تواصل مع الدعم
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2 h-11 text-sm font-semibold border-success/30 text-success hover:bg-success/10"
              onClick={() => window.open(`https://wa.me/${WA_NUMBER}?text=${waMsg}`, '_blank')}>
              <MessageCircle className="w-4 h-4" />
              واتساب الدعم الفني
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── حالة الانتهاء / النفاد ──────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-destructive/10 border-b border-destructive/20 p-6 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-destructive/15 border-2 border-destructive/30 flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-black text-balance">
              {isTrialExhausted ? 'انتهت حصتك التجريبية' : 'انتهى اشتراكك'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 text-pretty">
              {isTrialExhausted
                ? 'لقد استهلكت جميع العمليات المتاحة في الفترة التجريبية'
                : 'انتهت صلاحية اشتراكك — يُرجى التجديد للاستمرار'}
            </p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-muted/30 rounded-xl border border-border text-center">
            <p className="text-xs text-muted-foreground">سيتم تحويلك تلقائياً لصفحة التفعيل</p>
            <p className="text-lg font-black text-primary mt-1">خلال 5 ثوانٍ</p>
          </div>
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-11 text-sm font-semibold"
            onClick={() => navigate('/activate', { replace: true })}>
            <RefreshCw className="w-4 h-4" />
            تفعيل الاشتراك الآن
          </Button>
          <Button
            variant="outline"
            className="w-full border-success/30 text-success hover:bg-success/10 hover:text-success gap-2 h-11 text-sm font-semibold"
            onClick={() => {
              const msg = encodeURIComponent(
                `أريد تجديد اشتراك Vodafone Fakka Premium.\n` +
                `اسم المستخدم: ${profile?.username ?? 'غير محدد'}\n` +
                `رقم الهاتف: ${profile?.phone ?? 'غير محدد'}`
              );
              window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank');
            }}>
            <MessageCircle className="w-4 h-4" />
            تواصل عبر واتساب
          </Button>
        </div>
      </div>
    </div>
  );
}
