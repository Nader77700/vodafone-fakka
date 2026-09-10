// OfflineBanner — شريط خفيف وشفاف يناسب الوضع الفاتح والداكن
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useState, useEffect } from 'react';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [justReconnected, setJustReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setJustReconnected(false);
      // تأخير بسيط لـ animation entrance
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    } else if (wasOffline) {
      setJustReconnected(true);
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        setTimeout(() => { setJustReconnected(false); setWasOffline(false); }, 300);
      }, 2000);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [isOnline, wasOffline]);

  if (isOnline && !justReconnected) return null;

  return (
    <div
      dir="rtl"
      className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold transition-all duration-300"
      style={{
        // شفاف ومتوافق مع كلا الوضعين — لا hardcoded داكن
        background: isOnline
          ? 'rgba(22, 163, 74, 0.15)'
          : 'rgba(220, 38, 38, 0.12)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: isOnline
          ? '1px solid rgba(22, 163, 74, 0.25)'
          : '1px solid rgba(220, 38, 38, 0.2)',
        color: isOnline ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
      }}
    >
      {isOnline ? (
        <><Wifi className="w-3 h-3 shrink-0" /><span>عاد الاتصال بالإنترنت</span></>
      ) : (
        <><WifiOff className="w-3 h-3 shrink-0" /><span>لا يوجد اتصال بالإنترنت</span></>
      )}
    </div>
  );
}
