/**
 * WalletLinesResultsPage — شاشة النتائج — PHASE 1
 * يعرض: المحافظ المسجلة + الخطوط المسجلة لـ 4 شركات.
 * فصل كامل بين: بيانات موجودة / لا توجد / خدمة غير متاحة / API لم يرجع / خطأ / Loading.
 */

import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Wallet, Phone, CheckCircle2, XCircle, AlertTriangle, WifiOff, Loader2, MinusCircle, HelpCircle } from 'lucide-react';
import type { WalletLinesResult, WalletInfo, LineInfo, TelecomCarrier } from '@/lib/walletLinesInterfaces';
import type { DataAvailability } from '@/lib/walletLinesErrors';

// ── fallback فارغ عند غياب البيانات ──────────────────────────────
const CARRIERS = ['vodafone', 'orange', 'etisalat', 'we'] as const;
type CarrierKey = typeof CARRIERS[number];
const CARRIER_NAMES: Record<CarrierKey, string> = {
  vodafone: 'Vodafone', orange: 'Orange', etisalat: 'Etisalat', we: 'WE',
};
const EMPTY_RESULT: WalletLinesResult = {
  wallets: CARRIERS.map(c => ({ carrier: c, carrierName: CARRIER_NAMES[c], availability: 'no_response', walletNumbers: [] })),
  lines:   CARRIERS.map(c => ({ carrier: c, carrierName: CARRIER_NAMES[c], availability: 'no_response', lineNumbers: [] })),
  fetchedAt: new Date().toISOString(),
};

// ── لوغو + لون لكل شركة ──────────────────────────────────────────
const CARRIER_META: Record<TelecomCarrier, { name: string; color: string; emoji: string }> = {
  vodafone: { name: 'Vodafone', color: '#E60000', emoji: '🔴' },
  orange:   { name: 'Orange',   color: '#FF7900', emoji: '🟠' },
  etisalat: { name: 'e& (Etisalat)', color: '#00A651', emoji: '🟢' },
  we:       { name: 'WE',       color: '#6D42C4', emoji: '🟣' },
};

// ── بادج حالة البيانات ────────────────────────────────────────────
function AvailabilityBadge({ avail }: { avail: DataAvailability }) {
  const map: Record<DataAvailability, { label: string; color: string; icon: React.ReactNode }> = {
    loaded:      { label: 'مسجل',         color: '#22c55e', icon: <CheckCircle2 className="w-3 h-3" /> },
    empty:       { label: 'لا توجد بيانات', color: '#6b7280', icon: <MinusCircle className="w-3 h-3" /> },
    unavailable: { label: 'غير متاح',      color: '#f59e0b', icon: <AlertTriangle className="w-3 h-3" /> },
    no_response: { label: 'لم يرد',        color: '#6b7280', icon: <HelpCircle className="w-3 h-3" /> },
    conn_error:  { label: 'خطأ اتصال',     color: '#ef4444', icon: <WifiOff className="w-3 h-3" /> },
    invalid:     { label: 'استجابة غير صالحة', color: '#ef4444', icon: <XCircle className="w-3 h-3" /> },
    loading:     { label: 'جاري التحميل',  color: '#6366f1', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  };
  const m = map[avail] ?? map.empty;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}30` }}>
      {m.icon}{m.label}
    </span>
  );
}

// ── كرت محفظة شركة واحدة ─────────────────────────────────────────
function WalletCard({ w }: { w: WalletInfo }) {
  const meta = CARRIER_META[w.carrier];
  return (
    <div className="rounded-2xl p-4 border border-white/8 bg-white/3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.emoji}</span>
          <span className="text-sm font-black" style={{ color: meta.color }}>{meta.name}</span>
        </div>
        <AvailabilityBadge avail={w.availability} />
      </div>

      {w.availability === 'loaded' && (
        <div className="space-y-1.5 text-xs text-white/60 pr-2">
          {w.registeredName && (
            <div className="flex items-center justify-between">
              <span>الاسم المسجل</span>
              <span className="text-white/85 font-semibold">{w.registeredName}</span>
            </div>
          )}
          {w.walletCount !== undefined && (
            <div className="flex items-center justify-between">
              <span>عدد المحافظ</span>
              <span className="text-white/85 font-bold">{w.walletCount}</span>
            </div>
          )}
          {w.walletNumbers?.map(n => (
            <div key={n} className="flex items-center justify-between">
              <span>رقم المحفظة</span>
              <span className="font-mono text-white/75" dir="ltr">{n}</span>
            </div>
          ))}
          {w.registrationDate && (
            <div className="flex items-center justify-between">
              <span>تاريخ التسجيل</span>
              <span className="text-white/75">{w.registrationDate}</span>
            </div>
          )}
          {w.walletStatus && (
            <div className="flex items-center justify-between">
              <span>الحالة</span>
              <span className="text-green-400 font-semibold">{w.walletStatus}</span>
            </div>
          )}
        </div>
      )}

      {w.availability !== 'loaded' && w.availability !== 'loading' && (
        <p className="text-[11px] text-white/35 pr-2">
          {w.availability === 'empty' && 'لا توجد محافظ مسجلة لهذه الشركة.'}
          {w.availability === 'unavailable' && 'خدمة هذه الشركة غير متاحة حاليًا.'}
          {w.availability === 'no_response' && 'لم ترجع هذه الشركة أي بيانات.'}
          {w.availability === 'conn_error' && 'تعذّر الاتصال بهذه الشركة.'}
          {w.availability === 'invalid' && 'استجابة غير صالحة من هذه الشركة.'}
        </p>
      )}
    </div>
  );
}

// ── كرت خطوط شركة واحدة ──────────────────────────────────────────
function LineCard({ l }: { l: LineInfo }) {
  const meta = CARRIER_META[l.carrier];
  return (
    <div className="rounded-2xl p-4 border border-white/8 bg-white/3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.emoji}</span>
          <span className="text-sm font-black" style={{ color: meta.color }}>{meta.name}</span>
        </div>
        <AvailabilityBadge avail={l.availability} />
      </div>

      {l.availability === 'loaded' && (
        <div className="space-y-1.5 text-xs text-white/60 pr-2">
          {l.lineCount !== undefined && (
            <div className="flex items-center justify-between">
              <span>عدد الخطوط</span>
              <span className="text-white/85 font-bold">{l.lineCount}</span>
            </div>
          )}
          {l.lineNumbers?.map((n, i) => (
            <div key={n} className="flex items-center justify-between">
              <span>خط {i + 1}</span>
              <span className="font-mono text-white/75" dir="ltr">{n}</span>
            </div>
          ))}
          {l.serviceStatus && (
            <div className="flex items-center justify-between">
              <span>حالة الخدمة</span>
              <span className="text-green-400 font-semibold">{l.serviceStatus}</span>
            </div>
          )}
        </div>
      )}

      {l.availability === 'empty' && (
        <p className="text-[11px] text-white/35 pr-2">لا توجد خطوط مسجلة لهذه الشركة.</p>
      )}
      {l.availability === 'unavailable' && (
        <p className="text-[11px] text-white/35 pr-2">خدمة هذه الشركة غير متاحة حاليًا.</p>
      )}
      {l.availability === 'no_response' && (
        <p className="text-[11px] text-white/35 pr-2">لم ترجع هذه الشركة أي بيانات.</p>
      )}
      {l.availability === 'conn_error' && (
        <p className="text-[11px] text-white/35 pr-2">تعذّر الاتصال بهذه الشركة.</p>
      )}
    </div>
  );
}

// ── الصفحة الرئيسية ────────────────────────────────────────────────
export default function WalletLinesResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const result: WalletLinesResult = (location.state as { result?: WalletLinesResult })?.result ?? EMPTY_RESULT;

  const walletsLoaded = result.wallets.filter(w => w.availability === 'loaded').length;
  const linesLoaded = result.lines.filter(l => l.availability === 'loaded').length;

  return (
    <div className="min-h-screen pb-28" dir="rtl"
      style={{ background: 'linear-gradient(180deg, #080d14 0%, #0a0a12 100%)' }}>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 py-4">
          <button onClick={() => navigate('/wallet-lines')}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95">
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-black text-white">النتائج</h1>
            <p className="text-[10px] text-muted-foreground">بيانات الخطوط والمحافظ</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
            {new Date(result.fetchedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-6">

        {/* ملخص سريع */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-3 border border-indigo-500/20 bg-indigo-500/6 text-center">
            <Wallet className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
            <p className="text-lg font-black text-white">{walletsLoaded}</p>
            <p className="text-[10px] text-white/45">محافظ مسجلة</p>
          </div>
          <div className="rounded-2xl p-3 border border-green-500/20 bg-green-500/6 text-center">
            <Phone className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <p className="text-lg font-black text-white">{linesLoaded}</p>
            <p className="text-[10px] text-white/45">شركات بخطوط</p>
          </div>
        </div>

        {/* ── قسم المحافظ ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-black text-white">المحافظ المسجلة</h2>
          </div>
          <div className="space-y-2">
            {result.wallets.map(w => <WalletCard key={w.carrier} w={w} />)}
          </div>
        </div>

        {/* ── قسم الخطوط ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-4 h-4 text-green-400" />
            <h2 className="text-sm font-black text-white">الخطوط المسجلة</h2>
          </div>
          <div className="space-y-2">
            {result.lines.map(l => <LineCard key={l.carrier} l={l} />)}
          </div>
        </div>

        {/* دليل حالات البيانات */}
        <div className="rounded-2xl p-4 border border-white/6 bg-white/2 space-y-2">
          <p className="text-[11px] font-bold text-white/40 mb-2">دليل الحالات</p>
          {([
            ['loaded', 'بيانات موجودة'],
            ['empty', 'لا توجد بيانات (الاستجابة صحيحة)'],
            ['unavailable', 'الخدمة غير متاحة'],
            ['no_response', 'API لم يرجع بيانات'],
            ['conn_error', 'خطأ في الاتصال'],
          ] as [DataAvailability, string][]).map(([a, label]) => (
            <div key={a} className="flex items-center justify-between">
              <AvailabilityBadge avail={a} />
              <span className="text-[10px] text-white/35">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
