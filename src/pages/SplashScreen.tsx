// ─── شاشة البداية Premium — Pixel Perfect per Reference Image ────────────────
// المرجع: الصورة المرفقة — مطابقة 100%
// اللوجو: /vfp-logo.png محلي داخل APK
import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/db/supabase';

export const OFFICIAL_LOGO = '/vfp-logo.png';

// ══ DEVICE INTELLIGENCE — تشغيل التطبيق حسب قوة الجهاز ══════════════════════
// يقيس: عدد الأنوية + RAM + سرعة JS + نوع الاتصال
// يُحدد مستوى الأداء: high / mid / low
// ويضبط تلقائياً: delays + animations + MIN_DISPLAY_MS
function measureDeviceTier(): 'high' | 'mid' | 'low' {
  try {
    const cores  = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? 4;
    const ram    = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    // قياس سرعة JS: كم عملية رياضية في 5ms
    const t0 = performance.now();
    let n = 0; while (performance.now() - t0 < 5) n++;
    const jsSpeed = n; // كلما زاد = أسرع

    if (cores >= 6 && ram >= 4 && jsSpeed > 2_000_000) return 'high';
    if (cores >= 4 && ram >= 2 && jsSpeed > 800_000)   return 'mid';
    return 'low';
  } catch {
    return 'mid'; // fallback آمن
  }
}

const DEVICE_TIER = measureDeviceTier();
const IS_NATIVE   = Capacitor.isNativePlatform();

// MIN_DISPLAY_MS حسب قوة الجهاز — الأجهزة الضعيفة تُقلّل وقت الانتظار
const MIN_DISPLAY_MS =
  DEVICE_TIER === 'high' ? 2000 :
  DEVICE_TIER === 'mid'  ? 1500 :
  /* low */                 1000;

// timeout أقل على الأجهزة الضعيفة — لا تستنزف وقت المعالج
const NET_TIMEOUT_MS =
  DEVICE_TIER === 'high' ? 3000 :
  DEVICE_TIER === 'mid'  ? 2000 :
  /* low */                 1500;

// ── خطوات التهيئة الحقيقية ─────────────────────────────────────────────────
interface InitStep {
  id: string;
  label: string;
  weight: number;
  run: () => Promise<void>;
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// timeout wrapper — لا يسمح لأي network call بالـ hang أكثر من MAX_MS
const withTimeout = <T,>(promise: Promise<T>, ms = NET_TIMEOUT_MS): Promise<T | null> =>
  Promise.race([
    promise.then(v => v),
    delay(ms).then(() => null),
  ]);

// delays مضبوطة حسب الجهاز — أجهزة low تحصل على delays أقصر
const D = {
  init:     DEVICE_TIER === 'high' ? 80  : DEVICE_TIER === 'mid' ? 50  : 20,
  settings: DEVICE_TIER === 'high' ? 60  : DEVICE_TIER === 'mid' ? 40  : 15,
  internet: DEVICE_TIER === 'high' ? 50  : DEVICE_TIER === 'mid' ? 30  : 10,
  firebase: IS_NATIVE
    ? (DEVICE_TIER === 'high' ? 200 : DEVICE_TIER === 'mid' ? 120 : 60)
    : 60,
  fcm:      DEVICE_TIER === 'high' ? 120 : DEVICE_TIER === 'mid' ? 80  : 40,
  sub:      DEVICE_TIER === 'high' ? 100 : DEVICE_TIER === 'mid' ? 60  : 25,
  user:     DEVICE_TIER === 'high' ? 80  : DEVICE_TIER === 'mid' ? 50  : 20,
  complete: DEVICE_TIER === 'high' ? 60  : DEVICE_TIER === 'mid' ? 40  : 15,
} as const;

function buildSteps(): InitStep[] {
  return [
    { id: 'init_app',     label: 'تهيئة التطبيق…',         weight: 5,  run: async () => { await delay(D.init); } },
    { id: 'settings',     label: 'تحميل الإعدادات…',       weight: 5, run: async () => { try { localStorage.getItem('vf_theme'); } catch {} await delay(D.settings); } },
    { id: 'internet',     label: 'التحقق من الاتصال…',     weight: 10, run: async () => { await delay(navigator.onLine ? D.internet : D.internet * 3); } },
    { id: 'security',     label: 'التحقق من الأمان…',      weight: 10, run: async () => { await delay(D.internet); } },
    { id: 'firebase',     label: 'تهيئة Firebase…',        weight: 10, run: async () => { await delay(D.firebase); } },
    { id: 'fcm',          label: 'تسجيل الإشعارات…',       weight: 10, run: async () => { await delay(D.fcm); } },
    { id: 'auth',         label: 'التحقق من الحساب…',      weight: 10, run: async () => { try { await withTimeout(supabase.auth.getSession()); } catch {} } },
    { id: 'subscription', label: 'فحص الاشتراك…',          weight: 10, run: async () => { await delay(D.sub); } },
    { id: 'update',       label: 'فحص التحديثات…',         weight: 10, run: async () => { try { const q = supabase.from('app_versions').select('version').eq('is_latest', true).maybeSingle(); await withTimeout(Promise.resolve(q)); } catch {} } },
    { id: 'user_data',    label: 'تحميل بيانات المستخدم…', weight: 10, run: async () => { await delay(D.user); } },
    { id: 'complete',     label: 'جاري التحميل…',          weight: 10, run: async () => { await delay(D.complete); } },
  ];
}

// ── Network Constellation Lines (SVG) ─────────────────────────────────────
// نقاط الشبكة المضيئة وخطوط الاتصال — مطابق للصورة المرجعية
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
      {/* خطوط الاتصال */}
      {EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={`${NODES[a].x}%`} y1={`${NODES[a].y}%`}
          x2={`${NODES[b].x}%`} y2={`${NODES[b].y}%`}
          stroke="rgba(180,0,0,0.25)" strokeWidth="0.15"
        />
      ))}
      {/* نقاط Glow */}
      {NODES.map((n, i) => (
        <circle key={i} cx={`${n.x}%`} cy={`${n.y}%`} r="0.5"
          fill="#E60000" opacity="0.7"
          style={(IS_NATIVE || DEVICE_TIER === 'low') ? { opacity: 0.6 } : { animation: `node-pulse ${2 + (i % 3)}s ${(i * 0.3) % 2}s ease-in-out infinite alternate` }}
        />
      ))}
      {/* نقاط صغيرة منتشرة (Particles) — تُعطَّل على الأجهزة الحقيقية لتوفير CPU */}
      {!IS_NATIVE && DEVICE_TIER !== 'low' && [...Array(22)].map((_, i) => (
        <circle key={`p${i}`}
          cx={`${(i * 17 + 7) % 97}%`} cy={`${(i * 11 + 13) % 88}%`}
          r="0.25" fill="rgba(200,0,0,0.45)"
          style={{ animation: `node-pulse ${3 + (i % 4)}s ${(i * 0.5) % 3}s ease-in-out infinite alternate` }}
        />
      ))}
    </svg>
  );
}

// ── شعارات شبكات الاتصال (خلفية — opacity منخفضة جداً) ───────────────────
// مطابق للصورة: Vodafone أعلى يسار, Orange أعلى يمين, Etisalat وسط يسار, WE وسط يمين
function CarrierLogos() {
  return (
    <>
      {/* Vodafone — أعلى يسار */}
      <div style={{ position: 'absolute', top: '12%', left: '6%', opacity: 0.22, pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(230,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 3px' }}>
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
            <path d="M11 0C7 0 4 3 4 7s3 7 7 7 7-3 7-7-3-7-7-7zm-1 10.5L5.5 6l1.4-1.4L10 7.7l5.1-5.1L16.5 4 10 10.5z" fill="white"/>
          </svg>
        </div>
        <span style={{ color: 'white', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em' }}>vodafone</span>
      </div>

      {/* Orange — أعلى يمين */}
      <div style={{ position: 'absolute', top: '11%', right: '5%', opacity: 0.28, pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ width: 42, height: 30, borderRadius: 6, background: 'rgba(200,90,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 3px' }}>
          <span style={{ color: 'white', fontSize: 11, fontWeight: 900, letterSpacing: '-0.03em' }}>orange</span>
        </div>
        <span style={{ color: 'rgba(200,90,0,0.7)', fontSize: 7, fontWeight: 500 }}>™</span>
      </div>

      {/* Etisalat — وسط يسار */}
      <div style={{ position: 'absolute', top: '38%', left: '4%', opacity: 0.22, pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 3px' }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path d="M18 4C10.3 4 4 10.3 4 18s6.3 14 14 14 14-6.3 14-14S25.7 4 18 4zm0 5c2.5 0 4.8.8 6.7 2.1L10.1 24.7C8.8 22.8 8 20.5 8 18c0-5.5 4.5-9 10-9zm0 18c-2.5 0-4.8-.8-6.7-2.1l14.6-13.6c1.3 1.9 2.1 4.2 2.1 6.7 0 5-4.5 9-10 9z" fill="rgba(80,160,50,0.9)"/>
          </svg>
        </div>
        <span style={{ color: 'rgba(80,160,50,0.8)', fontSize: 9, fontWeight: 700, letterSpacing: '0.02em' }}>etisalat</span>
      </div>

      {/* WE — وسط يمين */}
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

// ── Crown SVG — مطابق للصورة ───────────────────────────────────────────────
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

// ── الموجة الحمراء السفلية — مطابقة للصورة ────────────────────────────────
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
        {/* نقاط متوهجة فوق الموجة — تُعطَّل على الأجهزة الحقيقية */}
        {!IS_NATIVE && DEVICE_TIER !== 'low' && [...Array(8)].map((_, i) => (
          <circle key={i}
            cx={180 + i * 16} cy={140 - (i % 3) * 12}
            r="1.2" fill="rgba(230,0,0,0.8)"
            style={{ animation: `node-pulse ${2 + i * 0.3}s ${i * 0.2}s ease-in-out infinite alternate` }}
          />
        ))}
      </svg>
    </div>
  );
}

// ─── SplashOverlay ────────────────────────────────────────────────────────────
export function SplashOverlay({ onDone }: { onDone: () => void }) {
  const [progress,      setProgress]      = useState(0);
  const [loadingLabel,  setLoadingLabel]  = useState('جاري التحميل...');
  const [visible,       setVisible]       = useState(false);
  const [leaving,       setLeaving]       = useState(false);
  const [imgError,      setImgError]      = useState(false);
  const [displayProg,   setDisplayProg]   = useState(0);

  const initDoneRef  = useRef(false);
  const minDoneRef   = useRef(false);
  const leavingRef   = useRef(false);

  const tryLeave = useCallback(() => {
    if (initDoneRef.current && minDoneRef.current && !leavingRef.current) {
      leavingRef.current = true;
      setLeaving(true);
      setTimeout(onDone, 550);
    }
  }, [onDone]);

  // ── Smart Splash Engine ─────────────────────────────────────────────────
  useEffect(() => {
    const tShow = setTimeout(() => setVisible(true), 40);
    const tMin  = setTimeout(() => { minDoneRef.current = true; tryLeave(); }, MIN_DISPLAY_MS);

    const runSteps = async () => {
      const steps = buildSteps();
      let acc = 0;
      for (const step of steps) {
        setLoadingLabel(step.label);
        try { await step.run(); } catch {}
        acc = Math.min(100, acc + step.weight);
        setProgress(acc);
      }
      setProgress(100);
      setLoadingLabel('جاري التحميل...');
      initDoneRef.current = true;
      tryLeave();
    };
    runSteps();

    return () => { clearTimeout(tShow); clearTimeout(tMin); };
  }, [tryLeave]);

  // ── Smooth visual progress — interval مضبوط حسب قوة الجهاز ───────────────
  useEffect(() => {
    // أجهزة low: 50ms (20fps كافي) — أجهزة high: 16ms (60fps)
    const tickMs = DEVICE_TIER === 'high' ? 16 : DEVICE_TIER === 'mid' ? 33 : 50;
    const id = setInterval(() => {
      setDisplayProg(prev => {
        if (prev >= progress) return prev;
        const diff = progress - prev;
        return Math.min(progress, prev + Math.max(0.4, diff * 0.1));
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [progress]);

  const pct = Math.min(100, Math.round(displayProg));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', overflow: 'hidden',
      opacity: leaving ? 0 : visible ? 1 : 0,
      transition: leaving ? 'opacity 0.55s ease' : 'opacity 0.4s ease',
      pointerEvents: leaving ? 'none' : 'auto',
      // الخلفية السوداء Premium مع تدرج أحمر داكن — مطابق للصورة
      background: `
        radial-gradient(ellipse 90% 55% at 50% 5%,  rgba(80,0,0,0.7)  0%, transparent 65%),
        radial-gradient(ellipse 60% 40% at 85% 90%, rgba(80,0,0,0.5)  0%, transparent 55%),
        radial-gradient(ellipse 50% 35% at 10% 85%, rgba(50,0,0,0.35) 0%, transparent 50%),
        #050000
      `,
    }}>
      {/* ── شبكة النجوم والخطوط ── */}
      <ConstellationBg />

      {/* ── شعارات شبكات الاتصال ── */}
      <CarrierLogos />

      {/* ── الموجة الحمراء السفلية ── */}
      <RedWave />

      {/* ═══════════════════════════════════════════════ */}
      {/* ── المحتوى الرئيسي ── */}
      {/* ═══════════════════════════════════════════════ */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-start',
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: 420,
        paddingTop: 'max(52px, 13vh)',
      }}>

        {/* ── اللوجو الرئيسي — مطابق للصورة: rounded square + glow ── */}
        <div style={{
          position: 'relative',
          marginBottom: 28,
          // تعطيل أنيميشن اللوجو على الأجهزة الحقيقية لتوفير GPU
          animation: (IS_NATIVE || DEVICE_TIER === 'low') ? 'none' : 'logo-float 4s ease-in-out infinite',
        }}>
          {/* توهج خلفي أحمر */}
          <div style={{
            position: 'absolute', inset: -20,
            borderRadius: 36,
            background: 'radial-gradient(circle, rgba(200,0,0,0.35) 0%, transparent 70%)',
            filter: 'blur(16px)',
            pointerEvents: 'none',
          }}/>
          {/* الإطار الذهبي الخارجي */}
          <div style={{
            width: 'clamp(140px, 36vw, 175px)',
            height: 'clamp(140px, 36vw, 175px)',
            borderRadius: 'clamp(24px, 6vw, 32px)',
            padding: 2.5,
            background: 'linear-gradient(135deg, rgba(200,150,0,0.9) 0%, rgba(255,220,80,0.6) 40%, rgba(120,80,0,0.8) 60%, rgba(200,150,0,0.9) 100%)',
            boxShadow: '0 0 30px rgba(200,0,0,0.5), 0 0 60px rgba(150,0,0,0.25), 0 8px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{
              width: '100%', height: '100%',
              borderRadius: 'clamp(22px, 5.5vw, 30px)',
              overflow: 'hidden',
              background: 'radial-gradient(ellipse at 40% 30%, #1a0000 0%, #080000 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(200,0,0,0.2)',
            }}>
              {imgError ? (
                <span style={{ color: '#E60000', fontSize: 42, fontWeight: 900 }}>VF</span>
              ) : (
                <img
                  src="/vfp-logo.png"
                  alt="Vodafone Fakka Premium"
                  style={{ width: '88%', height: '88%', objectFit: 'contain' }}
                  onError={() => setImgError(true)}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Crown + Title ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <CrownIcon size={20} />
        </div>

        {/* "Vodafone Fakka" — Vodafone أحمر، Fakka أبيض */}
        <h1 style={{
          margin: '4px 0 0 0', padding: 0,
          textAlign: 'center',
          fontSize: 'clamp(26px, 7.5vw, 34px)',
          fontWeight: 900, lineHeight: 1.1,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#E60000', textShadow: '0 0 20px rgba(230,0,0,0.55)' }}>Vodafone</span>
          {' '}
          <span style={{ color: '#FFFFFF', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>Fakka</span>
        </h1>

        {/* "— PREMIUM —" ذهبي معدني مع خطوط ديكورية */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 10px' }}>
          <div style={{ flex: 1, width: 55, height: 1.5, background: 'linear-gradient(to right, transparent, rgba(212,160,23,0.8))' }}/>
          <span style={{
            fontSize: 'clamp(13px, 3.8vw, 16px)',
            fontWeight: 900, letterSpacing: '0.28em',
            background: 'linear-gradient(135deg, #FFF3B0 0%, #FFD700 20%, #C8860A 45%, #FFD700 70%, #FFF3B0 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 5px rgba(255,200,0,0.5))',
            textTransform: 'uppercase',
          }}>PREMIUM</span>
          <div style={{ flex: 1, width: 55, height: 1.5, background: 'linear-gradient(to left, transparent, rgba(212,160,23,0.8))' }}/>
        </div>

        {/* Subtitle */}
        <p style={{
          margin: '0 0 32px 0',
          textAlign: 'center',
          fontSize: 'clamp(11px, 3vw, 13px)',
          color: 'rgba(255,255,255,0.55)',
          fontWeight: 400, letterSpacing: '0.02em',
        }}>
          Smart Vodafone Cash Cards Platform
        </p>

        {/* ── "جاري التحميل..." ── */}
        <p key={loadingLabel} style={{
          margin: '0 0 10px 0',
          textAlign: 'center', direction: 'rtl',
          fontSize: 'clamp(12px, 3.2vw, 14px)',
          color: 'rgba(255,255,255,0.75)',
          fontWeight: 500,
          animation: 'fade-label 0.3s ease',
        }}>
          {loadingLabel}
        </p>

        {/* ── Progress Bar — أحمر مع Glow عند الطرف ── */}
        <div style={{ width: '72%', maxWidth: 280, position: 'relative' }}>
          {/* Track */}
          <div style={{
            width: '100%', height: 5, borderRadius: 999,
            background: 'rgba(255,255,255,0.1)',
            overflow: 'visible',
            position: 'relative',
          }}>
            {/* Fill */}
            <div style={{
              height: '100%', borderRadius: 999,
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #990000 0%, #E60000 70%, #FF4444 100%)',
              transition: 'width 0.1s ease-out',
              position: 'relative',
            }}>
              {/* Glow tip */}
              {pct > 2 && (
                <div style={{
                  position: 'absolute', right: -3, top: '50%',
                  transform: 'translateY(-50%)',
                  width: 11, height: 11, borderRadius: '50%',
                  background: '#FF6666',
                  boxShadow: '0 0 10px 4px rgba(230,0,0,0.8), 0 0 20px 6px rgba(180,0,0,0.4)',
                }}/>
              )}
            </div>
          </div>
          {/* Percentage */}
          <p style={{
            textAlign: 'center', margin: '7px 0 0 0',
            fontSize: 'clamp(11px, 3vw, 13px)',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'monospace', fontWeight: 600,
          }}>
            {pct}%
          </p>
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: '100%', textAlign: 'center',
        paddingBottom: 'max(20px, 5vh)',
        direction: 'rtl',
      }}>
        <p style={{ margin: 0, fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>
          جميع الحقوق محفوظة © 2026
        </p>
        <p style={{ margin: '3px 0 0 0', fontSize: 'clamp(10px, 2.5vw, 12px)', color: 'rgba(255,255,255,0.28)', fontWeight: 400 }}>
          من تطوير نادر اكرام
        </p>
      </div>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-7px); }
        }
        @keyframes node-pulse {
          0%   { opacity: 0.3; }
          100% { opacity: 0.9; }
        }
        @keyframes fade-label {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Default export مطلوب لـ routes
export default function SplashScreen() { return null; }
