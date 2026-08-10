/**
 * WalletLinesResultsPage — PHASE 3
 * - زر "إظهار الأرقام كاملة" → OTP Dialog → عرض أرقام كاملة تحت قسم الخطوط
 * - زر تسجيل الخروج في الـ Header
 * - الجلسة تُحفظ حتى تسجيل الخروج
 */

import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowRight, Wallet, Phone, CheckCircle2, XCircle, AlertTriangle,
  WifiOff, Loader2, MinusCircle, HelpCircle, Eye, LogOut, KeyRound,
} from 'lucide-react';
import type { WalletLinesResult, WalletInfo, LineInfo, TelecomCarrier } from '@/lib/walletLinesInterfaces';
import type { DataAvailability } from '@/lib/walletLinesErrors';
import { walletLinesService } from '@/services/walletLinesService';
import type { FullNumbersData } from '@/services/walletLinesService';

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

const CARRIER_META: Record<TelecomCarrier, { name: string; color: string; emoji: string }> = {
  vodafone: { name: 'Vodafone',      color: '#E60000', emoji: '🔴' },
  orange:   { name: 'Orange',        color: '#FF7900', emoji: '🟠' },
  etisalat: { name: 'e& (Etisalat)', color: '#00A651', emoji: '🟢' },
  we:       { name: 'WE',            color: '#6D42C4', emoji: '🟣' },
};

function AvailabilityBadge({ avail }: { avail: DataAvailability }) {
  const map: Record<DataAvailability, { label: string; color: string; icon: React.ReactNode }> = {
    loaded:      { label: 'مسجل',               color: '#22c55e', icon: <CheckCircle2 className="w-3 h-3" /> },
    empty:       { label: 'لا توجد بيانات',      color: '#6b7280', icon: <MinusCircle className="w-3 h-3" /> },
    unavailable: { label: 'غير متاح',            color: '#f59e0b', icon: <AlertTriangle className="w-3 h-3" /> },
    no_response: { label: 'لم يرد',              color: '#6b7280', icon: <HelpCircle className="w-3 h-3" /> },
    conn_error:  { label: 'خطأ اتصال',           color: '#ef4444', icon: <WifiOff className="w-3 h-3" /> },
    invalid:     { label: 'استجابة غير صالحة',   color: '#ef4444', icon: <XCircle className="w-3 h-3" /> },
    loading:     { label: 'جاري التحميل',        color: '#6366f1', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  };
  const m = map[avail] ?? map.empty;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}30` }}>
      {m.icon}{m.label}
    </span>
  );
}

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
          {w.registeredName && <div className="flex items-center justify-between"><span>الاسم المسجل</span><span className="text-white/85 font-semibold">{w.registeredName}</span></div>}
          {w.walletCount !== undefined && <div className="flex items-center justify-between"><span>عدد المحافظ</span><span className="text-white/85 font-bold">{w.walletCount}</span></div>}
          {w.walletNumbers?.map(n => (
            <div key={n} className="flex items-center justify-between">
              <span>رقم المحفظة</span>
              <span className="font-mono text-white/75" dir="ltr">{n}</span>
            </div>
          ))}
          {w.registrationDate && <div className="flex items-center justify-between"><span>تاريخ التسجيل</span><span className="text-white/75">{w.registrationDate}</span></div>}
          {w.walletStatus && <div className="flex items-center justify-between"><span>الحالة</span><span className="text-green-400 font-semibold">{w.walletStatus}</span></div>}
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

function LineCard({ l, fullNums }: { l: LineInfo; fullNums?: string[] }) {
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
          {l.lineCount !== undefined && <div className="flex items-center justify-between"><span>عدد الخطوط</span><span className="text-white/85 font-bold">{l.lineCount}</span></div>}
          {/* الأرقام المشفرة */}
          {l.lineNumbers?.map((n, i) => (
            <div key={n} className="flex items-center justify-between">
              <span>خط {i + 1}</span>
              <span className="font-mono text-white/55" dir="ltr">{n}</span>
            </div>
          ))}
          {l.serviceStatus && <div className="flex items-center justify-between"><span>حالة الخدمة</span><span className="text-green-400 font-semibold">{l.serviceStatus}</span></div>}
          {/* الأرقام الكاملة بعد OTP */}
          {fullNums && fullNums.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
              <p className="text-[10px] font-bold text-amber-400/80 mb-1">الأرقام الكاملة (بعد التحقق)</p>
              {fullNums.map((n, i) => (
                <div key={n} className="flex items-center justify-between">
                  <span className="text-amber-400/60">خط {i + 1} كامل</span>
                  <span className="font-mono font-bold text-amber-300" dir="ltr">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {l.availability === 'empty'       && <p className="text-[11px] text-white/35 pr-2">لا توجد خطوط مسجلة لهذه الشركة.</p>}
      {l.availability === 'unavailable' && <p className="text-[11px] text-white/35 pr-2">خدمة هذه الشركة غير متاحة حاليًا.</p>}
      {l.availability === 'no_response' && <p className="text-[11px] text-white/35 pr-2">لم ترجع هذه الشركة أي بيانات.</p>}
      {l.availability === 'conn_error'  && <p className="text-[11px] text-white/35 pr-2">تعذّر الاتصال بهذه الشركة.</p>}
    </div>
  );
}

// ── OTP Dialog (6 خانات) ─────────────────────────────────────────
function OtpDialog({
  onSubmit,
  onClose,
  onResend,
  loading,
  sending,
  error,
}: {
  onSubmit: (otp: string) => void;
  onClose: () => void;
  onResend: () => void;
  loading: boolean;
  sending: boolean;
  error: string | null;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function handleInput(i: number, val: string) {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(''));
      refs.current[5]?.focus();
    }
  }

  const otp = digits.join('');
  const isComplete = otp.length === 6;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-5" dir="rtl"
        style={{ background: '#0f1520', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* العنوان */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/25 bg-amber-500/10 mb-3">
            {sending ? <Loader2 className="w-6 h-6 text-amber-400 animate-spin" /> : <KeyRound className="w-6 h-6 text-amber-400" />}
          </div>
          <h3 className="text-base font-black text-white">التحقق لإظهار الأرقام كاملة</h3>
          <p className="text-[11px] text-white/45">
            {sending ? 'جاري إرسال رمز التحقق على هاتفك...' : 'أدخل رمز التحقق المرسَل على هاتفك'}
          </p>
        </div>

        {/* خانات OTP */}
        <div className="flex gap-2 justify-center" dir="ltr" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { refs.current[i] = el; }}
              type="text" inputMode="numeric" maxLength={1}
              value={d}
              onChange={e => handleInput(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={loading || sending}
              className="w-11 h-14 text-center text-xl font-black rounded-xl border outline-none transition-all"
              style={{
                background: d ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.05)',
                border: d ? '1.5px solid rgba(251,191,36,0.5)' : '1px solid rgba(255,255,255,0.12)',
                color: '#fbbf24',
                caretColor: '#fbbf24',
              }}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/25 bg-red-500/8">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* أزرار */}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={loading || sending}
            className="flex-1 h-11 text-sm font-semibold rounded-xl border border-white/10 text-white/50 hover:bg-white/5 transition-all">
            إلغاء
          </button>
          <button
            onClick={() => isComplete && !sending && onSubmit(otp)}
            disabled={!isComplete || loading || sending}
            className="flex-1 h-11 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-2"
            style={{
              background: isComplete && !loading && !sending ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(255,255,255,0.06)',
              color: isComplete && !loading && !sending ? '#000' : 'rgba(255,255,255,0.25)',
            }}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />جاري التحقق...</>
             : sending ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الإرسال...</>
             : 'تأكيد'}
          </button>
        </div>

        <button onClick={onResend} disabled={loading || sending}
          className="w-full text-center text-[11px] text-indigo-400/60 hover:text-indigo-400 transition-colors">
          لم يصلك الرمز؟ أعد الإرسال
        </button>
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية ────────────────────────────────────────────────
export default function WalletLinesResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const result: WalletLinesResult =
    (location.state as { result?: WalletLinesResult })?.result ?? EMPTY_RESULT;

  const walletsLoaded = result.wallets.filter(w => w.availability === 'loaded').length;
  const linesLoaded   = result.lines.filter(l => l.availability === 'loaded').length;

  // ── OTP + Full Numbers State ─────────────────────────────────
  const [showOtpDialog, setShowOtpDialog]     = useState(false);
  const [otpLoading, setOtpLoading]           = useState(false);
  const [otpError, setOtpError]               = useState<string | null>(null);
  const [sendingOtp, setSendingOtp]           = useState(false);
  const [sendOtpError, setSendOtpError]       = useState<string | null>(null);
  const [fullNumbers, setFullNumbers]         = useState<FullNumbersData | null>(null);

  const nationalId = walletLinesService.getSavedNationalId();

  async function handleShowFullNumbers() {
    if (!nationalId) { setSendOtpError('الرقم القومي غير محفوظ. أعد الاستعلام.'); return; }
    // افتح الـ Dialog فوراً وأرسل OTP في الخلفية
    setOtpError(null);
    setSendOtpError(null);
    setShowOtpDialog(true);
    setSendingOtp(true);
    const r = await walletLinesService.sendFullNumbersOtp(nationalId);
    setSendingOtp(false);
    if (!r.success) {
      // نوري الخطأ داخل الـ dialog بدل إغلاقه
      setOtpError(r.userMessage ?? 'فشل إرسال رمز التحقق. تأكد من الاتصال بالإنترنت.');
    }
  }

  async function handleOtpSubmit(otp: string) {
    if (!nationalId) return;
    setOtpLoading(true);
    setOtpError(null);
    const r = await walletLinesService.getFullNumbers(nationalId, otp);
    setOtpLoading(false);
    if (!r.success) { setOtpError(r.userMessage ?? 'رمز التحقق غير صحيح.'); return; }
    setFullNumbers(r.data!);
    setShowOtpDialog(false);
  }

  function handleLogout() {
    walletLinesService.logout();
    navigate('/wallet-lines/login', { replace: true });
  }

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
          {/* زر تسجيل الخروج */}
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-[11px] text-red-400/70 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 active:scale-95">
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
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

        {/* ── زر إظهار الأرقام كاملة ── */}
        <div className="space-y-2">
          <button
            onClick={fullNumbers ? undefined : handleShowFullNumbers}
            disabled={sendingOtp || !!fullNumbers}
            className="w-full h-12 rounded-2xl flex items-center justify-center gap-2.5 text-sm font-black transition-all active:scale-98"
            style={{
              background: fullNumbers
                ? 'rgba(251,191,36,0.15)'
                : 'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(217,119,6,0.15))',
              border: '1px solid rgba(251,191,36,0.3)',
              color: '#fbbf24',
            }}>
            {sendingOtp
              ? <><Loader2 className="w-4 h-4 animate-spin" />جاري إرسال رمز التحقق...</>
              : fullNumbers
              ? <><CheckCircle2 className="w-4 h-4 text-amber-400" />تم — الأرقام الكاملة ظاهرة أدناه</>
              : <><Eye className="w-4 h-4" />إظهار الأرقام كاملة (يتطلب OTP)</>}
          </button>
          {sendOtpError && (
            <p className="text-[11px] text-red-400 flex items-center gap-1 justify-center">
              <XCircle className="w-3 h-3" />{sendOtpError}
            </p>
          )}
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

        {/* ── قسم الخطوط (مع الأرقام الكاملة إذا توفرت) ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-4 h-4 text-green-400" />
            <h2 className="text-sm font-black text-white">الخطوط المسجلة</h2>
            {fullNumbers && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
                + أرقام كاملة
              </span>
            )}
          </div>
          <div className="space-y-2">
            {result.lines.map(l => (
              <LineCard
                key={l.carrier}
                l={l}
                fullNums={fullNumbers?.[l.carrier]?.mobileLines}
              />
            ))}
          </div>
        </div>

        {/* دليل الحالات */}
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

      {/* OTP Dialog */}
      {showOtpDialog && (
        <OtpDialog
          onSubmit={handleOtpSubmit}
          onClose={() => { setShowOtpDialog(false); setSendingOtp(false); }}
          onResend={() => { setOtpError(null); handleShowFullNumbers(); }}
          loading={otpLoading}
          sending={sendingOtp}
          error={otpError}
        />
      )}
    </div>
  );
}
