// شاشة انتظار تفعيل الاشتراك — تظهر عند ربط المستخدم بتاجر قبل تفعيل الاشتراك
// لا تحتوي على أرقام تواصل أو أي تفاصيل إضافية
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Building2, Clock, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function MerchantPendingScreen() {
  const { data, refresh } = useMerchantClient();
  const { profile }       = useAuth();
  const [refreshing, setRefreshing]     = useState(false);

  const brandColor = data?.merchant?.brand_color ?? '#E60000';

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.info('تم تسجيل الخروج');
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-background p-6"
      dir="rtl"
    >
      {/* خلفية ضوئية */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-[120px] opacity-10"
          style={{ background: brandColor }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-sm w-full">
        {/* أيقونة التاجر */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center border-2"
          style={{
            background:   `${brandColor}14`,
            borderColor:  `${brandColor}35`,
            boxShadow:    `0 0 32px ${brandColor}20`,
          }}
        >
          {data?.merchant?.logo_url ? (
            <img
              src={data.merchant.logo_url}
              alt={data.merchant.name}
              className="w-full h-full rounded-3xl object-cover"
            />
          ) : (
            <Building2 className="w-9 h-9" style={{ color: brandColor }} />
          )}
        </div>

        {/* أيقونة الساعة */}
        <div className="flex items-center justify-center gap-2">
          <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-warning" />
          </div>
          <span
            className="text-xs font-semibold text-warning px-3 py-1 rounded-full border"
            style={{ background: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.25)' }}
          >
            في انتظار التفعيل
          </span>
        </div>

        {/* النص */}
        <div className="space-y-2">
          <h1 className="text-xl font-black">
            مرحباً، <span style={{ color: brandColor }}>{profile?.username ?? ''}</span> 👋
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            تم ربط حسابك بـ
            <span className="font-bold text-foreground"> {data?.merchant?.name ?? 'التاجر'} </span>
            بنجاح.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            يرجى التواصل مع تاجرك لتفعيل اشتراكك والبدء في استخدام الخدمة.
          </p>
        </div>

        {/* بطاقة التاجر */}
        <div
          className="w-full rounded-2xl p-4 border flex items-center gap-3"
          style={{ background: `${brandColor}0a`, borderColor: `${brandColor}25` }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${brandColor}18` }}
          >
            <Building2 className="w-5 h-5" style={{ color: brandColor }} />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-xs text-muted-foreground">تاجرك المعتمد</p>
            <p className="text-sm font-black truncate" style={{ color: brandColor }}>
              {data?.merchant?.name ?? '—'}
            </p>
          </div>
        </div>

        {/* أزرار */}
        <div className="flex flex-col gap-3 w-full">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'جارٍ التحديث…' : 'تحديث الحالة'}
          </Button>
          <Button
            variant="ghost"
            className="w-full gap-2 text-muted-foreground hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Vodafone Fakka Premium · Merchant Service
        </p>
      </div>
    </div>
  );
}
