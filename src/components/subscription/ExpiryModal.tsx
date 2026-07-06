// نافذة انتهاء الاشتراك — تعيق الإغلاق + redirect تلقائي
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, RefreshCw, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const WA_NUMBER = '201222692182';

interface Props {
  open: boolean;
  reason?: 'expired' | 'trial_exhausted';
}

export default function ExpiryModal({ open, reason = 'expired' }: Props) {
  const navigate = useNavigate();
  const { profile } = useAuth();

  // redirect تلقائي بعد 5 ثوانٍ
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => navigate('/activate', { replace: true }), 5000);
    return () => clearTimeout(t);
  }, [open, navigate]);

  if (!open) return null;

  const isTrialExhausted = reason === 'trial_exhausted';

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* رأس الكارت */}
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

        {/* المحتوى */}
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
