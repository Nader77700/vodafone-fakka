import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowRight, Shield, Zap, Smartphone } from 'lucide-react';
import VodafoneOffersShell from './VodafoneOffersShell';

export default function BalanceRechargeShortcutPage() {
  const navigate = useNavigate();

  return (
    <VodafoneOffersShell title="شحن الرصيد" subtitle="اختصار لنظام الشحن الأساسي">
      <div className="space-y-4">
        {/* بطاقة تعريفية */}
        <div
          className="relative rounded-[20px] overflow-hidden p-4"
          style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.15),rgba(8,13,20,0.9))', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 20% 50%,rgba(34,197,94,0.25) 0%,transparent 60%)' }}
          />
          <div className="relative z-10 flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.35)' }}
            >
              <Wallet className="w-4 h-4" style={{ color: '#4ade80' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-black text-white mb-0.5">شحن الرصيد</h2>
              <p className="text-[11px] text-white/55 leading-relaxed">
                هذا الاختصار يفتح نظام شحن الرصيد الأساسي الموجود في التطبيق. لا يوجد نظام شحن جديد هنا.
              </p>
            </div>
          </div>
        </div>

        {/* مميزات النظام الأساسي */}
        <div className="space-y-2.5">
          <FeatureRow
            icon={Smartphone}
            title="نفس واجهة الشحن"
            desc="نظام الشحن الأصلي مع حفظ الجلسة والكروت المحفوظة."
          />
          <FeatureRow
            icon={Shield}
            title="فحص شبكة Vodafone Cash"
            desc="نظام فحص الشبكة والكشف عن Bridge محفوظ كما هو في النظام الأساسي."
          />
          <FeatureRow
            icon={Zap}
            title="سريع وآمن"
            desc="جميع عمليات الشحن تسجل في سجل العمليات كالمعتاد."
          />
        </div>

        {/* زر فتح النظام الأساسي */}
        <button
          onClick={() => navigate('/balance-charge')}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[13px] font-black text-white transition-all active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', boxShadow: '0 4px 20px rgba(22,163,74,0.25)' }}
        >
          <Wallet className="w-4 h-4" />
          فتح نظام الشحن الأساسي
          <ArrowRight className="w-4 h-4 rotate-180" />
        </button>

        <p className="text-[10px] text-white/30 text-center px-4 leading-relaxed">
          الضغط على الزر ينقلك إلى صفحة الشحن الرئيسية ضمن نفس التطبيق.
        </p>
      </div>
    </VodafoneOffersShell>
  );
}

function FeatureRow({ icon: Icon, title, desc }: { icon: typeof Wallet; title: string; desc: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <Icon className="w-4 h-4 text-white/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-black text-white mb-0.5">{title}</p>
        <p className="text-[10px] text-white/45 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
