/**
 * VodafoneOffersPage — الصفحة الرئيسية لقسم عروض واشتراكات فودافون
 * PHASE 1: 5 اختصارات تفتح صفحات داخلية بدون Redirect أو Sidebar عالق
 */

import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Zap, Wifi, MoreHorizontal, CalendarDays, Wallet, Tag,
} from 'lucide-react';

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
  {
    id: 'subscriptions',
    label: 'الاشتراكات القادمة',
    desc: 'إدارة اشتراكاتك القادمة',
    icon: CalendarDays,
    to: '/vodafone-offers/subscriptions',
    color: '#fbbf24',
  },
  {
    id: 'recharge',
    label: 'شحن الرصيد',
    desc: 'شحن الرصيد عبر نظام الشحن الأساسي',
    icon: Wallet,
    to: '/vodafone-offers/recharge',
    color: '#4ade80',
  },
];

function MenuCard({ item }: { item: typeof menuItems[0] }) {
  const navigate = useNavigate();
  const Icon = item.icon;

  return (
    <button
      onClick={() => navigate(item.to)}
      className="group relative w-full rounded-[20px] p-4 text-right transition-all active:scale-[0.98] overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-300 pointer-events-none"
        style={{ opacity: 0, background: `radial-gradient(circle at 80% 20%, ${item.color}18 0%, transparent 60%)` }}
      />
      <style>{`
        .group:hover ~ div, .group:hover > div:first-child { opacity: 1; }
      `}</style>
      <div className="relative z-10 flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${item.color}15`, border: `1px solid ${item.color}30` }}
        >
          <Icon className="w-5 h-5" style={{ color: item.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-white mb-0.5 truncate">{item.label}</h3>
          <p className="text-[11px] text-white/45 truncate">{item.desc}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-white/30 rotate-180 group-hover:text-white/70 transition-colors shrink-0" />
      </div>
    </button>
  );
}

export default function VodafoneOffersPage() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen pb-28 flex flex-col"
      dir="rtl"
      style={{ background: 'linear-gradient(180deg,#080d14 0%,#0a0a12 100%)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={() => navigate('/networks')}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all shrink-0"
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black text-white leading-tight truncate">عروض واشتراكات فودافون</h1>
            <p className="text-[10px] text-muted-foreground">أنا فودافون</p>
          </div>
          <div
            className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
            style={{ background: 'rgba(230,0,0,0.15)', color: '#ff6b6b', border: '1px solid rgba(230,0,0,0.3)' }}
          >
            <Tag className="w-3 h-3" />
            <span className="hidden xs:inline">عروض</span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4 max-w-lg mx-auto w-full">
        {/* بطاقة تعريفية */}
        <div
          className="relative rounded-[20px] overflow-hidden p-4"
          style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.18),rgba(8,13,20,0.9))', border: '1px solid rgba(230,0,0,0.2)' }}
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 20% 50%,rgba(230,0,0,0.3) 0%,transparent 60%)' }}
          />
          <div className="relative z-10 flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(230,0,0,0.2)', border: '1px solid rgba(230,0,0,0.35)' }}
            >
              <Tag className="w-4 h-4" style={{ color: '#ff6b6b' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-black text-white mb-0.5">عروض واشتراكات فودافون</h2>
              <p className="text-[11px] text-white/55 leading-relaxed">
                اختر القسم الذي تريد تصفّحه. جميع الأقسام تعمل داخل التطبيق.
              </p>
            </div>
          </div>
        </div>

        {/* قائمة الاختصارات */}
        <div className="space-y-3">
          {menuItems.map((item) => (
            <MenuCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
