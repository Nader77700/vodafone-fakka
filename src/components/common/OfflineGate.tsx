// OfflineGate — Overlay يظهر فوق التطبيق عند انقطاع الإنترنت
// ✅ لا يُدمر children — يحفظ الـ Route والـ state الحالي
// ✅ عند عودة الإنترنت يختفي تلقائياً بدون reload
// ✅ زر "إعادة المحاولة" يُشغّل فحصاً حقيقياً بدون window.location.reload
import { WifiOff, RefreshCw, Wifi, Shield, Zap } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useState, useCallback, useEffect, useRef } from 'react';

interface OfflineGateProps {
  children: React.ReactNode;
}

export default function OfflineGate({ children }: OfflineGateProps) {
  const { isOnline, recheckNow } = useOnlineStatus();
  const [checking, setChecking] = useState(false);
  const [dots, setDots] = useState('');
  // showOverlay: هل الـ overlay موجود في الـ DOM
  const [showOverlay, setShowOverlay] = useState(!navigator.onLine);
  // showContent: هل المحتوى مرئي (لـ animation)
  const [showContent, setShowContent] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // إظهار/إخفاء الـ overlay مع animation — بدون تدمير children
  useEffect(() => {
    if (!isOnline) {
      // انقطاع: أضِف overlay فوراً ثم fade in
      setShowOverlay(true);
      const t = setTimeout(() => setShowContent(true), 80);
      return () => clearTimeout(t);
    } else {
      // عودة: fade out أولاً ثم أزِل من DOM
      setChecking(false);
      setShowContent(false);
      const t = setTimeout(() => setShowOverlay(false), 380);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  // نقاط متحركة أثناء الفحص
  useEffect(() => {
    if (!checking) { setDots(''); return; }
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(t);
  }, [checking]);

  // زر إعادة المحاولة — يُشغّل recheckNow() بدون reload
  const handleRetry = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    await recheckNow();
    // أعطِ 2 ثانية للـ state يتحدّث، ثم أوقف spinner إذا لم يُغلق overlay
    retryTimerRef.current = setTimeout(() => setChecking(false), 2500);
  }, [checking, recheckNow]);

  return (
    <>
      {/* ── التطبيق الأصلي — يبقى مُحمَّلاً دائماً (يحفظ Route + state) ── */}
      <div
        aria-hidden={showOverlay}
        style={{ pointerEvents: showOverlay ? 'none' : undefined }}
      >
        {children}
      </div>

      {/* ── Offline Overlay — يظهر فوق التطبيق فقط عند الانقطاع ── */}
      {showOverlay && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
          style={{
            background: 'hsl(var(--background))',
            opacity: showContent ? 1 : 0,
            transition: 'opacity 0.35s ease',
          }}
          dir="rtl"
        >
          {/* خلفية ديكورية — حلقات متداخلة */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ width: 520, height: 520, borderRadius: '50%', border: '1px solid rgba(220,38,38,0.06)' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ width: 380, height: 380, borderRadius: '50%', border: '1px solid rgba(220,38,38,0.08)' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ width: 260, height: 260, borderRadius: '50%', border: '1px solid rgba(220,38,38,0.10)' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[65%]"
              style={{ width: 300, height: 300, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(220,38,38,0.06) 0%, transparent 70%)' }} />
          </div>

          {/* المحتوى الرئيسي */}
          <div
            className="relative flex flex-col items-center justify-center flex-1 px-8 gap-0"
            style={{
              transform: showContent ? 'translateY(0)' : 'translateY(16px)',
              transition: 'transform 0.4s ease',
            }}
          >
            {/* شعار التطبيق */}
            <div className="mb-6 flex flex-col items-center gap-3">
              <div className="relative">
                <img
                  src="/vfp-logo.png"
                  alt="Vodafone Fakka Premium"
                  className="w-20 h-20 rounded-2xl object-cover"
                  style={{ boxShadow: '0 8px 32px rgba(220,38,38,0.2)' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div
                  className="absolute -bottom-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: 'hsl(var(--background))', border: '2px solid rgba(220,38,38,0.4)' }}
                >
                  <WifiOff className="w-3.5 h-3.5" style={{ color: 'rgb(220,38,38)' }} />
                </div>
              </div>
              <div className="text-center">
                <p className="text-base font-black text-foreground leading-tight">Vodafone Fakka</p>
                <p className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>Premium</p>
              </div>
            </div>

            {/* أيقونة WifiOff كبيرة */}
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6"
              style={{
                background: 'rgba(220,38,38,0.07)',
                border: '1.5px solid rgba(220,38,38,0.18)',
                boxShadow: '0 4px 24px rgba(220,38,38,0.08)',
              }}
            >
              <WifiOff className="w-11 h-11" style={{ color: 'rgb(220,38,38)' }} />
            </div>

            {/* النص */}
            <h1 className="text-2xl font-black text-foreground text-center mb-3 leading-tight">
              لا يوجد اتصال بالإنترنت
            </h1>
            <p className="text-sm text-center leading-relaxed max-w-xs mb-8"
              style={{ color: 'hsl(var(--muted-foreground))' }}>
              يتطلب التطبيق اتصالاً بالإنترنت للعمل بشكل صحيح.
              تأكد من تفعيل البيانات أو الواي فاي ثم حاول مجدداً.
            </p>

            {/* نصائح */}
            <div
              className="w-full max-w-xs rounded-2xl p-4 mb-8 flex flex-col gap-3"
              style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            >
              {[
                { icon: Wifi,   text: 'تأكد من تفعيل الواي فاي أو بيانات الجوال' },
                { icon: Shield, text: 'تحقق من أن VPN لا يعيق الاتصال' },
                { icon: Zap,    text: 'أعد تشغيل الواي فاي أو الموبايل داتا' },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.15)' }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: 'rgb(220,38,38)' }} />
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>{text}</p>
                </div>
              ))}
            </div>

            {/* زر إعادة المحاولة */}
            <button
              className="flex items-center gap-2.5 px-8 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.96]"
              style={{
                background: checking ? 'rgba(220,38,38,0.08)' : 'linear-gradient(135deg, #E60000, #c00000)',
                border: checking ? '1.5px solid rgba(220,38,38,0.25)' : '1.5px solid rgba(220,38,38,0.4)',
                color: checking ? 'rgb(220,38,38)' : '#fff',
                boxShadow: checking ? 'none' : '0 4px 20px rgba(220,38,38,0.3)',
              }}
              onClick={handleRetry}
              disabled={checking}
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? `جارٍ الفحص${dots}` : 'إعادة المحاولة'}
            </button>
          </div>

          {/* Footer */}
          <div className="relative pb-8 flex flex-col items-center gap-1">
            <p className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground) / 0.4)' }}>
              Vodafone Fakka Premium · by Nader Akram
            </p>
          </div>
        </div>
      )}
    </>
  );
}
