import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, PhoneCall, LogOut, Loader2,
} from 'lucide-react';
import VodafoneOffersShell from './VodafoneOffersShell';
import UpcomingSubscriptionsSection from './UpcomingSubscriptionsSection';
import { useAnaVodafoneSession } from './useAnaVodafoneSession';
import { useVodafoneNetworkStatus } from './useVodafoneNetworkStatus';
import type { VodafoneSubscription } from '@/lib/api';

function formatPhone(phone: string): string {
  return phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
}

export default function UpcomingSubscriptionsPage() {
  const navigate = useNavigate();
  const {
    session, loading: sessionLoading, logoutLoading, logout,
  } = useAnaVodafoneSession();
  const { ready: rechargeReady } = useVodafoneNetworkStatus();

  useEffect(() => {
    if (!sessionLoading && !session?.is_valid) {
      // إذا لم يكن المستخدم مسجلاً الدخول، نعيده إلى الصفحة الرئيسية للقسم
      navigate('/vodafone-offers', { replace: true });
    }
  }, [sessionLoading, session, navigate]);

  function handleRecharge(sub: VodafoneSubscription) {
    if (!sub.price) return;
    navigate('/balance-charge', { state: { productPrice: sub.price } });
  }

  if (sessionLoading) {
    return (
      <VodafoneOffersShell title="الاشتراكات القادمة" subtitle="إدارة اشتراكات أنا فودافون">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-white/40" />
        </div>
      </VodafoneOffersShell>
    );
  }

  if (!session?.is_valid) return null;

  return (
    <VodafoneOffersShell title="الاشتراكات القادمة" subtitle="إدارة اشتراكات أنا فودافون">
      <div className="space-y-4">
        {/* بطاقة الجلسة */}
        <div
          className="rounded-[20px] overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
        >
          <div
            className="flex items-center gap-2.5 px-4 py-2.5"
            style={{ background: 'rgba(34,197,94,0.1)', borderBottom: '1px solid rgba(34,197,94,0.15)' }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-400" />
            <span className="text-xs font-black text-green-400">تم تسجيل الدخول</span>
          </div>
          <div className="p-3.5 space-y-2.5">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <PhoneCall className="w-3.5 h-3.5 text-white/70" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-white/40 mb-0.5">رقم الهاتف المسجّل</p>
                <p className="text-sm font-black text-foreground font-mono tracking-wide truncate">{formatPhone(session.phone)}</p>
              </div>
            </div>
          </div>
          <div className="px-3.5 pb-3.5">
            <button
              onClick={logout}
              disabled={logoutLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
            >
              {logoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              تسجيل الخروج
            </button>
          </div>
        </div>

        <UpcomingSubscriptionsSection
          rechargeReady={rechargeReady}
          onRecharge={handleRecharge}
        />
      </div>
    </VodafoneOffersShell>
  );
}
