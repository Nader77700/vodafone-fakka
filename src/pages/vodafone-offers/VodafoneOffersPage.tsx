/**
 * VodafoneOffersPage — الصفحة الرئيسية لقسم عروض واشتراكات فودافون
 * التصميم القديم: بطاقة تعريفية + بطاقة تسجيل الدخول، ثم اشتراكات وعروض بعد الدخول
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Zap, Wifi, MoreHorizontal, CalendarDays, Wallet, Tag,
  CheckCircle2, PhoneCall, LogOut, Loader2,
} from 'lucide-react';
import VodafoneLoginGate from './VodafoneLoginGate';
import UpcomingSubscriptionsSection from './UpcomingSubscriptionsSection';
import { useAnaVodafoneSession } from './useAnaVodafoneSession';
import { useVodafoneNetworkStatus } from './useVodafoneNetworkStatus';
import { useTheme } from '@/contexts/ThemeContext';
import type { VodafoneSubscription } from '@/lib/api';

function formatPhone(phone: string): string {
  return phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
}

const menuItems = [
  {
    id: 'flex',
    label: 'عروض فليكس',
    desc: 'تصفّح باقات Flex المختلفة',
    icon: Zap,
    to: '/vodafone-offers/flex',
    color: '#E60000',
  },
  {
    id: 'internet',
    label: 'عروض الإنترنت',
    desc: 'باقات إنترنت شهرية وأسبوعية',
    icon: Wifi,
    to: '/vodafone-offers/internet',
    color: '#38bdf8',
  },
  {
    id: 'other',
    label: 'عروض أخرى',
    desc: 'عروض متنوعة من فودافون',
    icon: MoreHorizontal,
    to: '/vodafone-offers/other',
    color: '#a78bfa',
  },
];

function MenuCard({ item }: { item: typeof menuItems[0] }) {
  const navigate = useNavigate();
  const Icon = item.icon;
  const { isDark } = useTheme();
  const L = !isDark;

  return (
    <button
      onClick={() => navigate(item.to)}
      className="group relative w-full rounded-[20px] p-4 text-right transition-all active:scale-[0.98] overflow-hidden"
      style={{
        background: L ? '#ffffff' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: L ? '0 1px 6px rgba(0,0,0,0.05)' : 'none',
      }}
    >
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-300 pointer-events-none group-hover:opacity-100"
        style={{ background: `radial-gradient(circle at 80% 20%, ${item.color}18 0%, transparent 60%)` }}
      />
      <div className="relative z-10 flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${item.color}15`, border: `1px solid ${item.color}30` }}
        >
          <Icon className="w-5 h-5" style={{ color: item.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black mb-0.5 truncate"
            style={{ color: L ? '#1a1a2e' : '#ffffff' }}>{item.label}</h3>
          <p className="text-[11px] truncate"
            style={{ color: L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>{item.desc}</p>
        </div>
        <ArrowRight className="w-4 h-4 rotate-180 transition-colors shrink-0"
          style={{ color: L ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.30)' }} />
      </div>
    </button>
  );
}

function SessionCard({
  phone,
  logout,
  logoutLoading,
}: {
  phone: string;
  logout: () => void;
  logoutLoading: boolean;
}) {
  return (
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
      <div className="p-3.5">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <PhoneCall className="w-3.5 h-3.5 text-white/70" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-white/40 mb-0.5">رقم الهاتف المسجّل</p>
            <p className="text-sm font-black text-white font-mono tracking-wide truncate">{formatPhone(phone)}</p>
          </div>
          <button
            onClick={logout}
            disabled={logoutLoading}
            className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
          >
            {logoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            <span>خروج</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function RechargeShortcutCard({ ready, onClick }: { ready: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!ready}
      className="group relative w-full rounded-[20px] p-4 text-right transition-all active:scale-[0.98] disabled:opacity-50 overflow-hidden"
      style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)' }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <Wallet className="w-5 h-5 text-green-400" />
        </div>
        <div className="flex-1 min-w-0 text-right">
          <h3 className="text-sm font-black text-white mb-0.5 truncate">شحن الرصيد</h3>
          <p className="text-[11px] text-white/45 truncate">
            {ready ? 'فتح نظام الشحن الأساسي' : 'غير متاح — تأكد من اتصال الشبكة'}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-white/30 rotate-180 group-hover:text-white/70 transition-colors shrink-0" />
      </div>
    </button>
  );
}

export default function VodafoneOffersPage() {
  const navigate = useNavigate();
  const {
    session, loading: sessionLoading, logoutLoading, logout,
  } = useAnaVodafoneSession();
  const { ready: rechargeReady } = useVodafoneNetworkStatus();
  const { isDark } = useTheme();
  const L = !isDark;

  useEffect(() => {
    if (!sessionLoading && session?.is_valid) {
      // لا شيء إضافي — الـ UpcomingSubscriptionsSection تجلب البيانات تلقائياً
    }
  }, [sessionLoading, session]);

  function handleRecharge(sub: VodafoneSubscription) {
    if (!sub.price) return;
    navigate('/balance-charge', { state: { productPrice: sub.price } });
  }

  return (
    <div
      className="min-h-screen pb-28 flex flex-col"
      dir="rtl"
      style={{ background: L ? '#f5f7fa' : 'linear-gradient(180deg,#080d14 0%,#0a0a12 100%)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{
          background: L ? 'rgba(255,255,255,0.96)' : 'rgba(8,13,20,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
        }}
      >
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={() => navigate('/networks')}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all shrink-0"
            style={{
              border: `1px solid ${L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`,
              background: L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
            }}
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4" style={{ color: L ? '#1a1a2e' : '#ffffff' }} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black leading-tight truncate"
              style={{ color: L ? '#1a1a2e' : '#ffffff' }}>عروض واشتراكات فودافون</h1>
            <p className="text-[10px] text-muted-foreground">أنا فودافون</p>
          </div>
          <div
            className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
            style={{ background: 'rgba(230,0,0,0.12)', color: '#E60000', border: '1px solid rgba(230,0,0,0.25)' }}
          >
            <Tag className="w-3 h-3" />
            <span>عروض</span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4 max-w-lg mx-auto w-full">
        {/* بطاقة تعريفية */}
        <div
          className="relative rounded-[20px] overflow-hidden p-4"
          style={{
            background: L
              ? 'linear-gradient(135deg,rgba(230,0,0,0.06),rgba(255,255,255,0.95))'
              : 'linear-gradient(135deg,rgba(230,0,0,0.18),rgba(8,13,20,0.9))',
            border: `1px solid ${L ? 'rgba(230,0,0,0.15)' : 'rgba(230,0,0,0.2)'}`,
          }}
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 20% 50%,rgba(230,0,0,0.15) 0%,transparent 60%)' }}
          />
          <div className="relative z-10 flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.25)' }}
            >
              <Tag className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-black mb-0.5"
                style={{ color: L ? '#1a1a2e' : '#ffffff' }}>عروض واشتراكات فودافون</h2>
              <p className="text-[11px] leading-relaxed"
                style={{ color: L ? 'rgba(0,0,0,0.52)' : 'rgba(255,255,255,0.55)' }}>
                سجّل دخولك لعرض اشتراكاتك والعروض الشخصية المتاحة على رقمك.
              </p>
            </div>
          </div>
        </div>

        {/* بوابة الدخول + المحتوى بعده */}
        <VodafoneLoginGate>
          <div className="space-y-4">
            {session?.is_valid && session.phone && (
              <SessionCard
                phone={session.phone}
                logout={logout}
                logoutLoading={logoutLoading}
              />
            )}

            <UpcomingSubscriptionsSection
              rechargeReady={rechargeReady}
              onRecharge={handleRecharge}
            />

            {/* أقسام العروض */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#E60000' }} />
                <h3 className="text-sm font-black"
                  style={{ color: L ? '#1a1a2e' : '#ffffff' }}>العروض المتاحة</h3>
              </div>
              <div className="space-y-3">
                {menuItems.map((item) => (
                  <MenuCard key={item.id} item={item} />
                ))}
              </div>
            </div>

            {/* اختصار شحن الرصيد */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#4ade80' }} />
                <h3 className="text-sm font-black"
                  style={{ color: L ? '#1a1a2e' : '#ffffff' }}>شحن الرصيد</h3>
              </div>
              <RechargeShortcutCard
                ready={rechargeReady}
                onClick={() => navigate('/balance-charge')}
              />
            </div>
          </div>
        </VodafoneLoginGate>
      </div>
    </div>
  );
}
