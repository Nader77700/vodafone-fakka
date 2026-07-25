// شاشة تعارض الجلسة — الحساب مفتوح على جهاز آخر
import { useState, useEffect } from 'react';
import { Shield, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';

export default function SessionConflictScreen() {
  const { signOut, user, claimSession } = useAuth();
  const [deviceModel, setDeviceModel] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      supabase.from('profiles').select('active_device_model').eq('id', user.id).maybeSingle()
        .then(({ data }: { data: any }) => {
          if (data?.active_device_model) setDeviceModel(data.active_device_model);
        });
    }
  }, [user?.id]);

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
        <p className="text-sm text-muted-foreground text-center mb-2 leading-relaxed">
          تم تسجيل الدخول بهذا الحساب من جهاز مختلف.
          يُسمح بجلسة واحدة فقط في نفس الوقت.
        </p>
        
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 mb-8">
          <p className="text-sm font-semibold text-destructive text-center">
            الرجاء تسجيل الخروج أولاً من الهاتف الآخر
          </p>
          {deviceModel && (
            <p className="text-xs font-medium text-center text-muted-foreground mt-2" dir="ltr">
              Device: {deviceModel}
            </p>
          )}
          <p className="text-xs text-muted-foreground text-center mt-3">
            تعدد الأجهزة يسبب تعارض في العمليات ويضر بالنظام. يرجى استخدام جهاز واحد فقط لضمان استقرار حسابك.
          </p>
        </div>

        {/* بطاقة الخيارات */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          {/* الاستمرار على هذا الجهاز (استرداد الجلسة) */}
          <Button
            variant="default"
            className="w-full gap-2"
            onClick={claimSession}
          >
            <Shield className="w-4 h-4" />
            الاستمرار على هذا الجهاز
          </Button>

          {/* تسجيل الخروج من هذا الجهاز */}
          <Button
            variant="outline"
            className="w-full gap-2 border-destructive/20 text-destructive hover:bg-destructive/10"
            onClick={signOut}
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج من هذا الجهاز
          </Button>
        </div>
      </div>
    </div>
  );
}
