import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Phone } from 'lucide-react';

export default function VodafoneCashCenter() {
  const navigate = useNavigate();

  const services = [
    {
      id: 'money-transfer',
      title: 'تحويل الأموال',
      titleEn: 'Money Transfer',
      desc: 'تحويل الأموال لأي رقم Vodafone Cash بسهولة وأمان.',
      icon: <Send className="w-5 h-5 text-white" />,
      color: '#E60000',
      bgImage: 'https://miaoda-site-img.s3cdn.medo.dev/images/KLing_b5e4bc31-8171-46fd-9189-4cc5458a9ef1.jpg',
      path: '/vodafone-cash-center/transfer'
    },
    {
      id: 'recharge-balance',
      title: 'شحن الرصيد',
      titleEn: 'Recharge Balance',
      desc: 'شحن رصيد Vodafone لأي رقم مباشرة من محفظتك.',
      icon: <Phone className="w-5 h-5 text-white" />,
      color: '#E60000',
      bgImage: 'https://miaoda-site-img.s3cdn.medo.dev/images/KLing_15ca0ce1-0365-4506-8f8e-28fd0bd0eb14.jpg',
      path: '/vodafone-cash-center/recharge'
    }
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24 text-white font-cairo selection:bg-[#E60000]/30 selection:text-white">
      {/* ── Top Nav ── */}
      <div className="sticky top-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={() => navigate('/')}
            className="p-2 -mr-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide">Vodafone Cash Center</h1>
            <p className="text-[10px] text-white/50 font-medium">اختر الخدمة التي تريد استخدامها</p>
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
            className="group relative rounded-[28px] overflow-hidden flex flex-col justify-end transition-all duration-500 min-h-[220px] shadow-[0_10px_40px_rgba(0,0,0,0.4)] cursor-pointer hover:scale-[1.02] active:scale-95 hover:shadow-[0_10px_40px_rgba(230,0,0,0.2)]"
          >
            {/* Background Image */}
            <div className="absolute inset-0 w-full h-full">
              <img src={svc.bgImage} alt={svc.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
            </div>

            {/* Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#E60000]/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 mix-blend-overlay" />

            {/* Content Container */}
            <div className="relative z-10 p-5 flex flex-col items-start w-full">
              {/* Top Row: Icon & Title */}
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg backdrop-blur-md border border-white/20 transition-transform duration-500 group-hover:scale-110"
                  style={{ background: `linear-gradient(135deg, ${svc.color} 0%, rgba(230,0,0,0.8) 100%)` }}
                >
                  {svc.icon}
                </div>
                <div className="flex flex-col">
                  <h3 className="text-xl font-black tracking-wide text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-tight">
                    {svc.title}
                  </h3>
                  <span className="text-[10px] text-white/50 uppercase tracking-widest font-bold">
                    {svc.titleEn}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-white/70 font-medium leading-relaxed max-w-[85%] mt-1 drop-shadow-md">
                {svc.desc}
              </p>

              {/* Action Button */}
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
