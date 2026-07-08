// شاشة تعارض الجلسة — الحساب مفتوح على جهاز آخر
import { Shield, LogOut, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export default function SessionConflictScreen() {
  const { signOut, claimSession } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        {/* أيقونة التحذير */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Shield className="w-10 h-10 text-destructive" />
          </div>
        </div>

        {/* العنوان */}
        <h1 className="text-xl font-bold text-foreground text-center mb-2">
          حسابك مفتوح على جهاز آخر
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-8 leading-relaxed">
          تم تسجيل الدخول بهذا الحساب من جهاز مختلف.
          يُسمح بجلسة واحدة فقط في نفس الوقت.
        </p>

        {/* بطاقة الخيارات */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          {/* الاستمرار على هذا الجهاز */}
          <Button
            className="w-full gap-2"
            onClick={claimSession}
          >
            <Smartphone className="w-4 h-4" />
            الاستمرار على هذا الجهاز
          </Button>

          {/* تسجيل الخروج */}
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={signOut}
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          لا يمكن استخدام التطبيق قبل اختيار أحد الخيارين
        </p>
      </div>
    </div>
  );
}
