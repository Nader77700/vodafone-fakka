// صفحة WE — تفاصيل الشبكة وخدماتها
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Radio, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppFooter from '@/components/common/AppFooter';
import { COMING_SOON_SERVICES } from '@/pages/networks/_services';

const NETWORK = {
  name: 'WE',
  nameAr: 'وي',
  color: '#7B2FBE',
  description: 'شبكة المصرية للاتصالات WE — خدمات الجيل الرابع والإنترنت الفائق والحلول الرقمية المتكاملة.',
  logo: '🟣',
};

export default function WEPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen pb-6 page-enter" dir="rtl">
      {/* Header */}
      <div className="relative overflow-hidden rounded-b-3xl mb-4"
        style={{ background: 'linear-gradient(135deg,rgba(123,47,190,0.18),rgba(90,20,160,0.08),rgba(0,0,0,0.80))', borderBottom: '1.5px solid rgba(123,47,190,0.25)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 20% 50%,rgba(123,47,190,0.12),transparent)' }} />
        <div className="relative px-4 pt-5 pb-6">
          <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/networks')}>
            <ChevronRight className="w-4 h-4" />
            الشبكات
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black"
              style={{ background: 'linear-gradient(135deg,rgba(123,47,190,0.25),rgba(90,20,160,0.15))', border: '2px solid rgba(123,47,190,0.40)' }}>
              {NETWORK.logo}
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground">{NETWORK.name}</h1>
              <p className="text-sm font-bold" style={{ color: NETWORK.color }}>{NETWORK.nameAr}</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px] text-pretty">{NETWORK.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Radio className="w-4 h-4" style={{ color: NETWORK.color }} />
          <h2 className="text-sm font-black text-foreground">الخدمات المتاحة</h2>
        </div>
        <div className="rounded-2xl p-5 text-center space-y-3"
          style={{ background: 'rgba(123,47,190,0.06)', border: '1.5px solid rgba(123,47,190,0.20)' }}>
          <div className="text-3xl">🚧</div>
          <div>
            <p className="text-sm font-black text-foreground">تحت التطوير</p>
            <p className="text-[11px] text-muted-foreground mt-1 text-pretty">
              نعمل حالياً على تطوير خدمات هذه الشبكة.<br />
              سيتم إضافة جميع العروض والخدمات قريباً.
            </p>
          </div>
          <div className="flex items-center justify-center gap-1 text-[10px] font-semibold"
            style={{ color: NETWORK.color }}>
            <Clock className="w-3 h-3" />
            قريباً
          </div>
        </div>
        <p className="text-xs font-bold text-muted-foreground pt-2">خدمات قادمة</p>
        <div className="grid grid-cols-2 gap-3">
          {COMING_SOON_SERVICES.map(service => (
            <div key={service.id} className="rounded-xl p-3 space-y-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${NETWORK.color}18`, border: `1px solid ${NETWORK.color}25` }}>
                  <service.icon className="w-4 h-4" style={{ color: NETWORK.color }} />
                </div>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                  style={{ background: `${NETWORK.color}18`, color: NETWORK.color, border: `1px solid ${NETWORK.color}30` }}>
                  قريباً
                </span>
              </div>
              <div>
                <p className="text-[11px] font-bold text-foreground">{service.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 text-pretty">{service.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pt-5">
        <Button className="w-full h-11 font-bold gap-2"
          style={{ background: 'linear-gradient(90deg,#7B2FBE,#5A14A0)' }}
          onClick={() => navigate('/networks')}>
          <ChevronRight className="w-4 h-4" />
          العودة للشبكات
        </Button>
      </div>
      <AppFooter />
    </div>
  );
}
