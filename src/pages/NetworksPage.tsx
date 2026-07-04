// صفحة الشبكات الرئيسية — بطاقة eSIM + 4 شبكات
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, ChevronLeft, Zap, Clock, Wifi } from 'lucide-react';
import AppFooter from '@/components/common/AppFooter';
import { getESimSettings } from '@/lib/esimApi';
import type { ESimSettings } from '@/types/esim';

const BLUE = '#1E6FFF';
const BLUE_GLOW = 'rgba(30,111,255,0.22)';

// ── بطاقة eSIM ──────────────────────────────────────────────────────────────
function ESimCard({ settings }: { settings: ESimSettings | null }) {
  const navigate = useNavigate();

  // مخفي للمستخدمين العاديين فقط إذا status=hidden
  if (settings?.section_status === 'hidden') return null;

  return (
    <div
      onClick={() => navigate('/networks/esim')}
      className="relative rounded-2xl overflow-hidden cursor-pointer select-none transition-all duration-200 active:scale-[0.97] hover:scale-[1.01]"
      style={{
        background: `linear-gradient(135deg,${BLUE}18,${BLUE}08)`,
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${BLUE}45`,
        boxShadow: `0 4px 24px ${BLUE_GLOW}, 0 1px 0 rgba(255,255,255,0.04) inset`,
      }}
    >
      {/* Glow layer */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 60% at 15% 50%,${BLUE}14,transparent)` }} />
      {/* شريط Glow علوي */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${BLUE}90,transparent)` }} />

      {/* شارة جديد */}
      <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-full text-[9px] font-black"
        style={{ background: `${BLUE}25`, border: `1px solid ${BLUE}50`, color: BLUE }}>
        جديد ✨
      </div>

      <div className="relative p-4 flex items-center gap-4">
        {/* أيقونة */}
        <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg,${BLUE}28,${BLUE}14)`,
            border: `1.5px solid ${BLUE}45`,
            boxShadow: `0 2px 12px ${BLUE_GLOW}`,
          }}>
          <Wifi className="w-6 h-6" style={{ color: BLUE }} />
        </div>

        {/* البيانات */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-base font-black text-foreground">eSIM</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${BLUE}22`, color: BLUE, border: `1px solid ${BLUE}35` }}>
              شرائح إلكترونية
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground text-pretty leading-relaxed line-clamp-2">
            احصل على شرائح eSIM جاهزة للتفعيل فوراً بسرعات عالية، بدون VPN، مع أفضل تغطية داخل مصر.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3" style={{ color: BLUE }} />
              <span className="text-[10px] font-semibold" style={{ color: BLUE }}>تفعيل فوري</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">بدون VPN</span>
            </div>
          </div>
        </div>

        {/* سهم */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: `${BLUE}22`, border: `1px solid ${BLUE}35` }}>
          <ChevronLeft className="w-4 h-4" style={{ color: BLUE }} />
        </div>
      </div>
    </div>
  );
}

export interface NetworkConfig {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  color: string;
  glowColor: string;
  bgGradient: string;
  borderColor: string;
  logo: string; // SVG inline or emoji fallback
  serviceCount: number;
  route: string;
}

export const NETWORKS: NetworkConfig[] = [
  {
    id: 'vodafone',
    name: 'Vodafone',
    nameAr: 'فودافون',
    description: 'أكبر شبكة اتصالات في مصر. فكة، دقائق، إنترنت وباقات متنوعة.',
    color: '#E60000',
    glowColor: 'rgba(230,0,0,0.25)',
    bgGradient: 'linear-gradient(135deg,rgba(230,0,0,0.15),rgba(180,0,0,0.05))',
    borderColor: 'rgba(230,0,0,0.35)',
    logo: '🔴',
    serviceCount: 0,
    route: '/networks/vodafone',
  },
  {
    id: 'orange',
    name: 'Orange',
    nameAr: 'أورانج',
    description: 'شبكة أورانج مصر بخدمات الاتصالات والإنترنت عالي السرعة.',
    color: '#FF6600',
    glowColor: 'rgba(255,102,0,0.25)',
    bgGradient: 'linear-gradient(135deg,rgba(255,102,0,0.15),rgba(200,80,0,0.05))',
    borderColor: 'rgba(255,102,0,0.35)',
    logo: '🟠',
    serviceCount: 0,
    route: '/networks/orange',
  },
  {
    id: 'etisalat',
    name: 'Etisalat',
    nameAr: 'اتصالات',
    description: 'شبكة اتصالات المتحدة — جودة عالية وتغطية واسعة في مصر.',
    color: '#00AA00',
    glowColor: 'rgba(0,170,0,0.25)',
    bgGradient: 'linear-gradient(135deg,rgba(0,170,0,0.15),rgba(0,130,0,0.05))',
    borderColor: 'rgba(0,170,0,0.35)',
    logo: '🟢',
    serviceCount: 0,
    route: '/networks/etisalat',
  },
  {
    id: 'we',
    name: 'WE',
    nameAr: 'وي',
    description: 'شبكة المصرية للاتصالات — الجيل الرابع والخدمات الرقمية.',
    color: '#7B2FBE',
    glowColor: 'rgba(123,47,190,0.25)',
    bgGradient: 'linear-gradient(135deg,rgba(123,47,190,0.15),rgba(90,20,160,0.05))',
    borderColor: 'rgba(123,47,190,0.35)',
    logo: '🟣',
    serviceCount: 0,
    route: '/networks/we',
  },
];

function NetworkCard({ network }: { network: NetworkConfig }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(network.route)}
      className="relative rounded-2xl overflow-hidden cursor-pointer select-none transition-all duration-200 active:scale-[0.97] hover:scale-[1.01]"
      style={{
        background: network.bgGradient,
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${network.borderColor}`,
        boxShadow: `0 4px 24px ${network.glowColor}, 0 1px 0 rgba(255,255,255,0.04) inset`,
      }}
    >
      {/* Glow layer */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 60% at 15% 50%, ${network.glowColor.replace('0.25)', '0.12)')}, transparent)` }} />

      <div className="relative p-4 flex items-center gap-4">
        {/* شعار الشبكة */}
        <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black"
          style={{ background: `linear-gradient(135deg,${network.color}22,${network.color}11)`, border: `1.5px solid ${network.borderColor}` }}>
          {network.logo}
        </div>

        {/* بيانات الشبكة */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-base font-black text-foreground">{network.name}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${network.color}22`, color: network.color, border: `1px solid ${network.borderColor}` }}>
              {network.nameAr}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground text-pretty leading-relaxed line-clamp-2">{network.description}</p>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3" style={{ color: network.color }} />
              <span className="text-[10px] font-semibold" style={{ color: network.color }}>
                {network.serviceCount > 0 ? `${network.serviceCount} خدمة` : 'تحت التطوير'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">قريباً</span>
            </div>
          </div>
        </div>

        {/* سهم */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-transform"
          style={{ background: `${network.color}22`, border: `1px solid ${network.borderColor}` }}>
          <ChevronLeft className="w-4 h-4" style={{ color: network.color }} />
        </div>
      </div>
    </div>
  );
}

export default function NetworksPage() {
  const [esimSettings, setEsimSettings] = useState<ESimSettings | null>(null);

  useEffect(() => {
    getESimSettings().then(s => setEsimSettings(s));
  }, []);

  return (
    <div className="min-h-screen pb-6 page-enter" dir="rtl">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.20),rgba(180,0,0,0.10))', border: '1.5px solid rgba(230,0,0,0.30)' }}>
            <Radio className="w-5 h-5" style={{ color: '#E60000' }} />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground text-balance">📡 شبكات أخرى</h1>
            <p className="text-[11px] text-muted-foreground">اختر شبكتك واستعرض جميع الخدمات</p>
          </div>
        </div>
      </div>

      {/* بطاقات */}
      <div className="px-4 space-y-3">
        {/* ── eSIM أولاً ── */}
        <ESimCard settings={esimSettings} />

        {/* ── شبكات أخرى ── */}
        {NETWORKS.map(network => (
          <NetworkCard key={network.id} network={network} />
        ))}
      </div>

      <AppFooter />
    </div>
  );
}
