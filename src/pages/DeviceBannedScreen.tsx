// شاشة حظر الجهاز — تظهر عند محاولة تسجيل الدخول أو إنشاء حساب من جهاز محظور
import { ShieldX, Phone } from 'lucide-react';

interface Props {
  reason?: string;
  bannedAt?: string;
}

export default function DeviceBannedScreen({ reason, bannedAt }: Props) {
  const formatDate = (d?: string) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return d; }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-white"
    >
      {/* أيقونة الحظر */}
      <div className="w-24 h-24 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center mb-6">
        <ShieldX className="w-12 h-12 text-destructive" />
      </div>

      {/* العنوان */}
      <h1 className="text-2xl font-bold text-destructive mb-2 text-center">
        تم حظر هذا الجهاز
      </h1>
      <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs leading-relaxed">
        لا يمكن استخدام تطبيق Vodafone Fakka من هذا الجهاز.
        لن تتمكن من تسجيل الدخول أو إنشاء حساب جديد.
      </p>

      {/* سبب الحظر */}
      {reason && (
        <div className="w-full max-w-sm bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-4 text-right">
          <p className="text-xs text-muted-foreground mb-1">سبب الحظر</p>
          <p className="text-sm font-medium text-foreground">{reason}</p>
          {bannedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              تاريخ الحظر: {formatDate(bannedAt)}
            </p>
          )}
        </div>
      )}

      {/* معلومات التواصل */}
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-4 text-right">
        <div className="flex items-center gap-2 mb-2">
          <Phone className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-semibold">هل تعتقد أن هذا خطأ؟</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          إذا كنت تعتقد أن هذا الحظر تم بالخطأ، تواصل مع الدعم الفني عبر المسؤول المباشر وأعطه معرّف جهازك.
        </p>
      </div>

      {/* كود خطأ صغير في الأسفل */}
      <p className="mt-8 text-[10px] text-muted-foreground/40 font-mono">
        ERR_DEVICE_BANNED
      </p>
    </div>
  );
}
