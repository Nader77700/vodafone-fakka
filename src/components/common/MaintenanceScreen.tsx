// MaintenanceScreen — يظهر بدلاً من التطبيق إذا ff_maintenance_mode = true
// يُتحكّم فيه من لوحة الإدارة فوراً بدون APK جديد
import { RefreshCw, MessageCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { Capacitor } from '@capacitor/core';

// ── Shared UI Elements from Splash (Premium Look) ──
const IS_NATIVE = Capacitor.isNativePlatform();

const NODES = [
  { x: 18, y: 8 }, { x: 45, y: 5 }, { x: 72, y: 9 }, { x: 90, y: 18 },
  { x: 8,  y: 28 }, { x: 35, y: 22 }, { x: 60, y: 18 }, { x: 82, y: 30 },
  { x: 12, y: 45 }, { x: 55, y: 40 }, { x: 78, y: 48 }, { x: 92, y: 55 },
  { x: 25, y: 60 }, { x: 48, y: 62 }, { x: 70, y: 65 }, { x: 88, y: 72 },
  { x: 5,  y: 72 }, { x: 32, y: 78 }, { x: 58, y: 80 },
];
const EDGES: [number,number][] = [
  [0,1],[1,2],[2,3],[0,4],[1,5],[2,6],[3,7],
  [4,8],[5,9],[6,10],[7,11],[8,12],[9,13],[10,14],[11,15],
  [4,5],[5,6],[6,7],[8,9],[9,10],[10,11],[12,13],[13,14],
  [16,17],[17,18],[12,16],[13,17],[14,18],
];

function ConstellationBg() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      {EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={`${NODES[a].x}%`} y1={`${NODES[a].y}%`}
          x2={`${NODES[b].x}%`} y2={`${NODES[b].y}%`}
          stroke="rgba(180,0,0,0.25)" strokeWidth="0.15"
        />
      ))}
      {NODES.map((n, i) => (
        <circle key={i} cx={`${n.x}%`} cy={`${n.y}%`} r="0.5"
          fill="#E60000" opacity="0.7"
          style={IS_NATIVE ? { opacity: 0.6 } : { animation: `node-pulse ${2 + (i % 3)}s ${(i * 0.3) % 2}s ease-in-out infinite alternate` }}
        />
      ))}
    </svg>
  );
}

function CarrierLogos() {
  return (
    <>
      <div style={{ position: 'absolute', top: '12%', left: '6%', opacity: 0.22, pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(230,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 3px' }}>
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
            <path d="M11 0C7 0 4 3 4 7s3 7 7 7 7-3 7-7-3-7-7-7zm-1 10.5L5.5 6l1.4-1.4L10 7.7l5.1-5.1L16.5 4 10 10.5z" fill="white"/>
          </svg>
        </div>
        <span style={{ color: 'white', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em' }}>vodafone</span>
      </div>
      <div style={{ position: 'absolute', top: '11%', right: '5%', opacity: 0.28, pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ width: 42, height: 30, borderRadius: 6, background: 'rgba(200,90,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 3px' }}>
          <span style={{ color: 'white', fontSize: 11, fontWeight: 900, letterSpacing: '-0.03em' }}>orange</span>
        </div>
        <span style={{ color: 'rgba(200,90,0,0.7)', fontSize: 7, fontWeight: 500 }}>™</span>
      </div>
      <div style={{ position: 'absolute', top: '38%', left: '4%', opacity: 0.22, pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 3px' }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path d="M18 4C10.3 4 4 10.3 4 18s6.3 14 14 14 14-6.3 14-14S25.7 4 18 4zm0 5c2.5 0 4.8.8 6.7 2.1L10.1 24.7C8.8 22.8 8 20.5 8 18c0-5.5 4.5-9 10-9zm0 18c-2.5 0-4.8-.8-6.7-2.1l14.6-13.6c1.3 1.9 2.1 4.2 2.1 6.7 0 5-4.5 9-10 9z" fill="rgba(80,160,50,0.9)"/>
          </svg>
        </div>
        <span style={{ color: 'rgba(80,160,50,0.8)', fontSize: 9, fontWeight: 700, letterSpacing: '0.02em' }}>etisalat</span>
      </div>
      <div style={{ position: 'absolute', top: '39%', right: '5%', opacity: 0.22, pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 3px' }}>
          <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
            <path d="M19 4C11 4 4 11 4 19c0 4 1.5 7.5 4 10.2L26.2 8A14.8 14.8 0 0 0 19 4zm8.8 5.5L14.5 32c.3.1.6.2 1 .2A3 3 0 0 0 18.5 31h1l8.3-21.5zM10 28c2.3 2.2 5.4 3.5 9 3.5 6.1 0 11.3-4 13.2-9.5L27 13 10 28z" fill="rgba(120,80,180,0.9)"/>
          </svg>
        </div>
        <span style={{ color: 'rgba(120,80,180,0.8)', fontSize: 10, fontWeight: 900, letterSpacing: '0.05em' }}>we</span>
      </div>
    </>
  );
}

function CrownIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 24 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFE57A"/>
          <stop offset="45%"  stopColor="#D4A017"/>
          <stop offset="100%" stopColor="#8B6000"/>
        </linearGradient>
      </defs>
      <polygon points="2,16 5,5 10,11 12,2 14,11 19,5 22,16" fill="url(#cg)" stroke="rgba(255,200,40,0.5)" strokeWidth="0.5"/>
      <circle cx="2"  cy="5"  r="2" fill="#FFD700"/>
      <circle cx="12" cy="2"  r="2" fill="#FFD700"/>
      <circle cx="22" cy="5"  r="2" fill="#FFD700"/>
      <rect x="2" y="15" width="20" height="2" rx="1" fill="url(#cg)"/>
    </svg>
  );
}

function RedWave() {
  return (
    <div style={{
      position: 'absolute', bottom: 0, right: 0,
      width: '75%', height: '22%',
      pointerEvents: 'none', zIndex: 1,
      opacity: 0.55,
    }}>
      <svg width="100%" height="100%" viewBox="0 0 300 180" preserveAspectRatio="xMaxYMax meet" fill="none">
        <defs>
          <radialGradient id="wg" cx="80%" cy="80%" r="70%">
            <stop offset="0%"   stopColor="rgba(200,0,0,0.6)"/>
            <stop offset="60%"  stopColor="rgba(120,0,0,0.3)"/>
            <stop offset="100%" stopColor="rgba(0,0,0,0)"/>
          </radialGradient>
        </defs>
        <path d="M300 180 C260 140, 220 160, 180 130 C140 100, 120 140, 80 120 C50 105, 20 140, 0 130 L0 180 Z"
          fill="url(#wg)" opacity="0.7"/>
        <path d="M300 180 C270 150, 230 170, 200 145 C170 120, 150 155, 120 140 C90 125, 50 160, 30 150 L0 160 L0 180 Z"
          fill="rgba(180,0,0,0.35)"/>
      </svg>
    </div>
  );
}

export default function MaintenanceScreen() {
  const { config, refresh } = useRuntimeConfig();
  const msg = config.ui.ui_maintenance_msg || 'التطبيق تحت الصيانة مؤقتاً لتحديث الأنظمة. نعود إليكم قريباً 🔧';
  const waLink = config.ui.ui_support_whatsapp;
  const groupLink = 'https://chat.whatsapp.com/JXqhDL16tUJIMhEa1s7xgp';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', overflow: 'hidden',
      background: `
        radial-gradient(ellipse 90% 55% at 50% 5%,  rgba(80,0,0,0.7)  0%, transparent 65%),
        radial-gradient(ellipse 60% 40% at 85% 90%, rgba(80,0,0,0.5)  0%, transparent 55%),
        radial-gradient(ellipse 50% 35% at 10% 85%, rgba(50,0,0,0.35) 0%, transparent 50%),
        #050000
      `,
    }}>
      <ConstellationBg />
      <CarrierLogos />
      <RedWave />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: 420,
        padding: '0 24px',
      }}>
        {/* اللوجو */}
        <div style={{
          position: 'relative',
          marginBottom: 20,
          animation: IS_NATIVE ? 'none' : 'logo-float 4s ease-in-out infinite',
        }}>
          <div style={{
            position: 'absolute', inset: -20,
            borderRadius: 36,
            background: 'radial-gradient(circle, rgba(200,0,0,0.35) 0%, transparent 70%)',
            filter: 'blur(16px)',
            pointerEvents: 'none',
          }}/>
          <div style={{
            width: 120, height: 120,
            borderRadius: 24,
            padding: 2.5,
            background: 'linear-gradient(135deg, rgba(200,150,0,0.9) 0%, rgba(255,220,80,0.6) 40%, rgba(120,80,0,0.8) 60%, rgba(200,150,0,0.9) 100%)',
            boxShadow: '0 0 30px rgba(200,0,0,0.5), 0 0 60px rgba(150,0,0,0.25), 0 8px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{
              width: '100%', height: '100%',
              borderRadius: 22, overflow: 'hidden',
              background: 'radial-gradient(ellipse at 40% 30%, #1a0000 0%, #080000 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(200,0,0,0.2)',
            }}>
              <img src="/vfp-logo.png" alt="Vodafone Fakka Premium" style={{ width: '88%', height: '88%', objectFit: 'contain' }} />
            </div>
          </div>
        </div>

        {/* النص الرئيسي */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <CrownIcon size={20} />
        </div>
        <h1 style={{
          margin: '4px 0 0 0', padding: 0,
          textAlign: 'center',
          fontSize: 28,
          fontWeight: 900, lineHeight: 1.1,
          whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#E60000', textShadow: '0 0 20px rgba(230,0,0,0.55)' }}>وضع</span>
          {' '}
          <span style={{ color: '#FFFFFF', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>الصيانة</span>
        </h1>
        
        <p style={{
          margin: '16px 0 32px 0',
          textAlign: 'center',
          fontSize: 15,
          color: 'rgba(255,255,255,0.75)',
          fontWeight: 400, letterSpacing: '0.02em',
          lineHeight: 1.6,
        }}>
          {msg}
        </p>

        {/* أزرار الإجراءات */}
        <div className="flex flex-col gap-3 w-full max-w-[280px]">
          {waLink && (
            <Button 
              className="w-full h-12 text-md gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white border-0" 
              onClick={() => window.open(waLink, '_blank')}
            >
              <MessageCircle className="h-5 w-5" />
              تواصل مع المطور
            </Button>
          )}

          <Button 
            className="w-full h-12 text-md gap-2 bg-[#075E54] hover:bg-[#054c44] text-white border-0" 
            onClick={() => window.open(groupLink, '_blank')}
          >
            <Users className="h-5 w-5" />
            جروب واتساب للتحديثات
          </Button>
          
          <Button variant="outline" onClick={refresh} className="w-full h-12 text-md gap-2 bg-transparent border-white/20 text-white hover:bg-white/10 mt-2">
            <RefreshCw className="h-5 w-5" />
            تحديث الصفحة
          </Button>
        </div>
      </div>

      <div style={{
        position: 'relative', zIndex: 10,
        width: '100%', textAlign: 'center',
        paddingBottom: 'max(20px, 5vh)',
        direction: 'rtl',
      }}>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>
          نشكركم على تفهمكم وصبركم
        </p>
      </div>

      <style>{`
        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-7px); }
        }
        @keyframes node-pulse {
          0%   { opacity: 0.3; }
          100% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
