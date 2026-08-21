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
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          إذا كنت تعتقد أن هذا الحظر تم بالخطأ، تواصل مع المطور الرسمي للتطبيق.
        </p>
        <a 
          href="https://wa.me/201222692182"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-full bg-[#25D366] text-white py-3 rounded-lg gap-2 text-sm font-bold shadow-lg shadow-[#25D366]/20 transition-transform active:scale-95"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.305-.885-.653-1.48-1.459-1.653-1.756-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
          </svg>
          تواصل مع المطور الرسمي (واتساب)
        </a>
      </div>

      {/* كود خطأ صغير في الأسفل */}
      <p className="mt-8 text-[10px] text-muted-foreground/40 font-mono">
        ERR_DEVICE_BANNED
      </p>
    </div>
  );
}
