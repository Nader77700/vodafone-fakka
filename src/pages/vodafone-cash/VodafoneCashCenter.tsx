import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Phone, Wallet } from 'lucide-react';
import { useIsLight } from '@/contexts/ThemeContext';

export default function VodafoneCashCenter() {
  const navigate = useNavigate();
  const L = useIsLight();

  const services = [
    {
      id: 'money-transfer',
      title: 'تحويل الأموال',
      titleEn: 'Money Transfer',
      desc: 'تحويل الأموال لأي رقم Vodafone Cash بسهولة وأمان.',
      icon: <Send className="w-5 h-5" style={{ color: '#ffffff' }} />,
      color: '#E60000',
      bgImage: 'https://miaoda-site-img.s3cdn.medo.dev/images/KLing_b5e4bc31-8171-46fd-9189-4cc5458a9ef1.jpg',
      path: '/vodafone-cash-center/transfer'
    },
    {
      id: 'recharge-balance',
      title: 'شحن الرصيد',
      titleEn: 'Recharge Balance',
      desc: 'شحن رصيد Vodafone لأي رقم مباشرة من محفظتك.',
      icon: <Phone className="w-5 h-5" style={{ color: '#ffffff' }} />,
      color: '#E60000',
      bgImage: 'https://miaoda-site-img.s3cdn.medo.dev/images/KLing_15ca0ce1-0365-4506-8f8e-28fd0bd0eb14.jpg',
      path: '/vodafone-cash-center/recharge'
    },
    {
      id: 'wallet-balance',
      title: 'رصيد المحفظة وسجل العمليات',
      titleEn: 'Wallet Balance & History',
      desc: 'استعلم عن رصيد محفظتك وتصفح سجل كل عملياتك.',
      icon: <Wallet className="w-5 h-5" style={{ color: '#ffffff' }} />,
      color: '#6B21A8',
      bgImage: 'https://miaoda-site-img.s3cdn.medo.dev/images/KLing_b5e4bc31-8171-46fd-9189-4cc5458a9ef1.jpg',
      path: '/vodafone-cash-center/wallet-balance'
    }
  ];

  return (
    <div className="min-h-screen pb-24 font-cairo selection:bg-[#E60000]/30"
      dir="rtl"
      style={{ background: L ? '#f5f7fa' : '#0A0A0A', color: L ? '#1a1a2e' : '#ffffff' }}>
      {/* ── Top Nav ── */}
      <div className="sticky top-0 z-50 backdrop-blur-xl border-b shadow-[0_4px_30px_rgba(0,0,0,0.2)]"
        style={{
          background: L ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,10,0.80)',
          borderColor: L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)',
        }}>
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={() => navigate('/')}
            className="p-2 -mr-2 rounded-full transition-colors"
            style={{ color: L ? '#1a1a2e' : '#ffffff' }}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide" style={{ color: L ? '#1a1a2e' : '#ffffff' }}>Vodafone Cash Center</h1>
            <p className="text-[10px] font-medium" style={{ color: L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.50)' }}>اختر الخدمة التي تريد استخدامها</p>
          </div>
          <div className="w-10"></div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 pt-6 space-y-6">
        {services.map(svc => (
          <div
            key={svc.id}
            onClick={() => navigate(svc.path)}
            className="group relative rounded-[28px] overflow-hidden flex flex-col justify-end transition-all duration-500 min-h-[220px] cursor-pointer hover:scale-[1.02] active:scale-95"
            style={{ boxShadow: L ? '0 8px 32px rgba(0,0,0,0.12)' : '0 10px 40px rgba(0,0,0,0.4)' }}
          >
            {/* Background Image */}
            <div className="absolute inset-0 w-full h-full">
              <img src={svc.bgImage} alt={svc.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
            </div>

            {/* Overlay — always dark over image for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent opacity-90" />

            {/* Content Container */}
            <div className="relative z-10 p-5 flex flex-col items-start w-full">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg backdrop-blur-md border border-white/20 transition-transform duration-500 group-hover:scale-110"
                  style={{ background: `linear-gradient(135deg, ${svc.color} 0%, rgba(230,0,0,0.8) 100%)` }}
                >
                  {svc.icon}
                </div>
                <div className="flex flex-col">
                  <h3 className="text-xl font-black tracking-wide text-foreground leading-tight">
                    {svc.title}
                  </h3>
                  <span className="text-[10px] text-white/50 uppercase tracking-widest font-bold">
                    {svc.titleEn}
                  </span>
                </div>
              </div>
              <p className="text-sm text-white/70 font-medium leading-relaxed max-w-[85%] mt-1 drop-shadow-md">
                {svc.desc}
              </p>
              <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-white/90 backdrop-blur-sm transition-all duration-300 group-hover:bg-white/20 group-hover:border-white/30 group-hover:text-white">
                الدخول <ArrowLeft className="w-3 h-3 ml-1 rotate-180" />
              </div>
            </div>

            {/* Border Glow */}
            <div className="absolute inset-0 rounded-[28px] border border-white/10 transition-colors duration-500 group-hover:border-[#E60000]/50 pointer-events-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
