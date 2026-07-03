// شاشة توقف التاجر — تظهر عند تعليق/إيقاف التاجر
// Merchant Client Mode — Phase 8
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import { Building2, ShieldAlert, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

const STATUS_MSG: Record<string, { title: string; body: string; icon: string }> = {
  suspended: {
    title: 'الحساب التجاري موقوف مؤقتاً',
    body:  'تواصل مع تاجرك لإعادة تفعيل الخدمة.',
    icon:  '⏸️',
  },
  disabled: {
    title: 'الخدمة معطّلة',
    body:  'تم تعطيل حساب التاجر المرتبط بحسابك. يرجى التواصل معه.',
    icon:  '🔒',
  },
  blocked: {
    title: 'الحساب التجاري محظور',
    body:  'تم حظر حساب التاجر. يرجى التواصل بالدعم الفني.',
    icon:  '🚫',
  },
};

export default function MerchantClientSuspended() {
  const { data, refresh } = useMerchantClient();
  const status  = data?.merchant?.status ?? 'suspended';
  const info    = STATUS_MSG[status] ?? STATUS_MSG.suspended;
  const brandColor = data?.merchant?.brand_color ?? '#E60000';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.info('تم تسجيل الخروج');
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-6"
      dir="rtl"
    >
      {/* خلفية ضوئية */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-[120px] opacity-10"
          style={{ background: brandColor }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-6 text-center">
        {/* أيقونة التاجر */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto border-2"
          style={{ background: `${brandColor}15`, borderColor: `${brandColor}30` }}
        >
          {data?.merchant.logo_url ? (
            <img src={data.merchant.logo_url} alt={data.merchant.name}
              className="w-14 h-14 rounded-xl object-cover" />
          ) : (
            <Building2 className="w-9 h-9" style={{ color: brandColor }} />
          )}
        </div>

        <div className="space-y-2">
          <div className="text-4xl">{info.icon}</div>
          <h1 className="text-xl font-black text-foreground">{info.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{info.body}</p>
          {data?.merchant.name && (
            <p className="text-xs text-muted-foreground">
              التاجر: <span className="font-semibold" style={{ color: brandColor }}>{data.merchant.name}</span>
            </p>
          )}
        </div>

        {/* أيقونة التحذير */}
        <div className="bg-warning/10 border border-warning/20 rounded-2xl p-4 flex items-start gap-3 text-right">
          <ShieldAlert className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning leading-relaxed">
            جميع الخدمات معطّلة مؤقتاً حتى يعود التاجر لحالة نشطة.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button variant="outline" className="gap-2" onClick={refresh}>
            <RefreshCw className="w-4 h-4" />
            التحقق من الحالة
          </Button>
          <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </Button>
        </div>
      </div>
    </div>
  );
}
