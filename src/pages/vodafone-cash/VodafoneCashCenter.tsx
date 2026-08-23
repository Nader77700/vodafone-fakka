import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Phone, Wallet, ChevronRight } from 'lucide-react';
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
      style={{ background: L ? '#f5f7fa' : '#0A0A0A' }}>
      {/* ── Top Nav ── */}
      <div className="sticky top-0 z-50 backdrop-blur-xl border-b"
        style={{
          background: L ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,10,0.80)',
          borderColor: L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
          boxShadow: L ? '0 2px 12px rgba(0,0,0,0.06)' : '0 4px 30px rgba(0,0,0,0.2)',
        }}>
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={() => navigate('/')}
            className="p-2 -mr-2 rounded-full transition-colors"
            style={{ color: L ? '#111827' : '#ffffff' }}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide"
              style={{ color: L ? '#111827' : '#ffffff' }}>Vodafone Cash Center</h1>
            <p className="text-[10px] font-medium"
              style={{ color: L ? '#6b7280' : 'rgba(255,255,255,0.55)' }}>اختر الخدمة التي تريد استخدامها</p>
          </div>
          <div className="w-10"></div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 pt-6 space-y-5">
        {services.map(svc => (
          <div
            key={svc.id}
            onClick={() => navigate(svc.path)}
            className="group relative rounded-[24px] overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
            style={L ? {
              background: 'linear-gradient(145deg,#ffffff 0%,#fafafa 100%)',
              border: '1.5px solid rgba(0,0,0,0.08)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
            } : {
              boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            }}
          >
            {/* ── Light mode: structured card ── */}
            {L ? (
              <>
                {/* Top accent */}
                <div className="h-[3px] w-full"
                  style={{ background: `linear-gradient(90deg,${svc.color} 0%,rgba(247,201,72,0.6) 100%)` }} />
                <div className="p-4 flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: `linear-gradient(135deg,${svc.color} 0%,rgba(180,0,0,0.85) 100%)`,
                      boxShadow: `0 4px 12px ${svc.color}35`,
                    }}>
                    {svc.icon}
                  </div>
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-black" style={{ color: '#111827' }}>{svc.title}</h3>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: '#9ca3af' }}>
                      {svc.titleEn}
                    </p>
                    <p className="text-xs mt-1.5 leading-relaxed" style={{ color: '#4b5563' }}>{svc.desc}</p>
                  </div>
                  {/* Arrow */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(230,0,0,0.07)', border: '1px solid rgba(230,0,0,0.15)' }}>
                    <ChevronRight className="w-4 h-4 rotate-180" style={{ color: '#cc0000' }} />
                  </div>
                </div>
              </>
            ) : (
              /* ── Dark mode: image card ── */
              <>
                <div className="absolute inset-0 w-full h-full" style={{ minHeight: 220 }}>
                  <img src={svc.bgImage} alt={svc.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent opacity-90" />
                <div className="relative z-10 p-5 flex flex-col items-start w-full min-h-[220px] justify-end">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg backdrop-blur-md border border-white/10"
                      style={{ background: `linear-gradient(135deg,${svc.color} 0%,rgba(230,0,0,0.8) 100%)` }}>
                      {svc.icon}
                    </div>
                    <div className="flex flex-col">
                      <h3 className="text-xl font-black tracking-wide text-white leading-tight">{svc.title}</h3>
                      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>{svc.titleEn}</span>
                    </div>
                  </div>
                  <p className="text-sm text-white/60 font-medium leading-relaxed max-w-[85%] mt-1">{svc.desc}</p>
                  <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold text-white backdrop-blur-sm">
                    الدخول <ArrowLeft className="w-3 h-3 ml-1 rotate-180" />
                  </div>
                </div>
                <div className="absolute inset-0 rounded-[24px] border border-white/8 group-hover:border-[#E60000]/50 transition-colors pointer-events-none" />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
