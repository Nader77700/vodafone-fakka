// P6: بانر وضع Offline — يظهر شريط علوي ثابت عند انقطاع الإنترنت
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useState, useEffect } from 'react';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  // نُظهر "عاد الاتصال" لمدة قصيرة ثم نختفي تماماً
  const [justReconnected, setJustReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setJustReconnected(false);
    } else if (wasOffline) {
      setJustReconnected(true);
      const t = setTimeout(() => { setJustReconnected(false); setWasOffline(false); }, 2500);
      return () => clearTimeout(t);
    }
  }, [isOnline, wasOffline]);

  if (isOnline && !justReconnected) return null;

  return (
    <div
      dir="rtl"
      className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold transition-all duration-300"
      style={{
        background: isOnline
          ? 'linear-gradient(90deg, #00512b, #006633)'
          : 'linear-gradient(90deg, #1a0000, #3d0000)',
        color: '#fff',
        boxShadow: isOnline
          ? '0 2px 12px rgba(0,200,100,0.3)'
          : '0 2px 12px rgba(230,0,0,0.3)',
      }}
    >
      {isOnline ? (
        <><Wifi className="w-3.5 h-3.5" /> عاد الاتصال بالإنترنت</>
      ) : (
        <><WifiOff className="w-3.5 h-3.5" /> لا يوجد اتصال بالإنترنت — وضع عدم الاتصال</>
      )}
    </div>
  );
}
