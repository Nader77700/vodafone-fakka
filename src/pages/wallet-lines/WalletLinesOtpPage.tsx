/**
 * WalletLinesOtpPage — OTP UI — حقل واحد يدعم الكتابة اليدوية والـ Paste
 * - حقل واحد رقمي بدلاً من 6 خانات منفصلة لمنع مشكلة Focus
 * - يدعم Paste للكود كاملاً تلقائياً
 * - المستخدم يكتب أو يلصق الكود بنفسه — لا قراءة SMS تلقائية
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, XCircle, Loader2, RefreshCw, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { walletLinesService } from '@/services/walletLinesService';

const OTP_LENGTH = 6;
const COUNTDOWN_SEC = 60;

export default function WalletLinesOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const phone: string = (location.state as { phone?: string })?.phone ?? '';

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const [canResend, setCanResend] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Countdown
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const isComplete = otp.length === OTP_LENGTH;
  const isDisabled = loading || success;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // أرقام فقط، بحد أقصى OTP_LENGTH
    const val = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(val);
    setErrorMsg(null);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (text) {
      setOtp(text);
      setErrorMsg(null);
    }
  }

  async function handleVerify() {
    if (!isComplete) return;
    setLoading(true);
    setErrorMsg(null);
    const result = await walletLinesService.verifyOtp({ phone, otp });
    setLoading(false);
    if (!result.success) {
      setErrorMsg(result.userMessage ?? 'رمز التحقق غير صحيح.');
      setOtp('');
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    setSuccess(true);
    // بعد تأكيد OTP لإنشاء الحساب، يعود المستخدم لتسجيل الدخول
    setTimeout(() => navigate('/wallet-lines/login', { replace: true }), 900);
  }

  function handleResend() {
    setCountdown(COUNTDOWN_SEC);
    setCanResend(false);
    setOtp('');
    setErrorMsg(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // عرض الكود بصريًا كـ dots/digits مع مسافات بين كل رقم
  const displayOtp = otp.padEnd(OTP_LENGTH, '·').split('').join(' ');

  return (
    <div className="min-h-screen pb-28 flex flex-col" dir="rtl"
      style={{ background: 'var(--gradient-background)' }}>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 py-4">
          <button onClick={() => navigate(-1)} disabled={isDisabled}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95">
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div>
            <h1 className="text-base font-black text-white">رمز التحقق</h1>
            <p className="text-[10px] text-muted-foreground">تأكيد رقم الهاتف</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-8 flex flex-col gap-6">

        {/* إرشاد */}
        <div className="text-center space-y-1.5">
          <p className="text-sm text-white/70 font-medium">تم إرسال رمز التحقق إلى</p>
          <p className="text-base font-black text-white font-mono" dir="ltr">
            {phone || 'رقمك المسجل'}
          </p>
          <p className="text-xs text-white/40">أدخل الرمز المكوّن من {OTP_LENGTH} أرقام — يمكنك لصقه مباشرة</p>
        </div>

        {/* حقل OTP الموحّد */}
        <div className="space-y-3">
          {/* العرض البصري للأرقام */}
          <div className="flex items-center justify-center gap-1" dir="ltr" aria-hidden="true">
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <div key={i}
                className={`w-11 h-14 rounded-2xl flex items-center justify-center text-xl font-black transition-all duration-150
                  ${otp[i]
                    ? errorMsg
                      ? 'border-2 border-red-400/60 bg-red-500/8 text-red-300'
                      : 'border-2 border-indigo-400/70 bg-indigo-500/10 text-white'
                    : i === otp.length
                      ? 'border-2 border-indigo-400/40 bg-indigo-500/5 text-transparent'
                      : 'border-2 border-white/10 bg-white/3 text-transparent'
                  }`}>
                {otp[i] || ''}
              </div>
            ))}
          </div>

          {/* الـ Input الحقيقي — مخفي بصريًا لكن accessible */}
          <div className="relative">
            <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d*"
              maxLength={OTP_LENGTH}
              value={otp}
              onChange={handleChange}
              onPaste={handlePaste}
              disabled={isDisabled}
              placeholder="اكتب أو الصق الرمز هنا"
              className={`w-full h-12 pr-9 pl-4 rounded-xl text-center text-base font-mono tracking-widest outline-none transition-all duration-200
                bg-white/5 text-white placeholder:text-white/20
                focus:ring-2 focus:ring-indigo-400/50 focus:bg-indigo-500/5
                ${errorMsg ? 'border border-red-400/50' : 'border border-white/10'}
                ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              aria-label="رمز التحقق المكوّن من 6 أرقام"
            />
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/25 bg-red-500/8">
            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{errorMsg}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border border-green-500/25 bg-green-500/8">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <p className="text-xs text-green-300 font-semibold">تم التحقق بنجاح...</p>
          </div>
        )}

        {/* زر التحقق */}
        <Button onClick={handleVerify} disabled={isDisabled || !isComplete}
          className="w-full h-12 text-sm font-black rounded-xl"
          style={{ background: success ? 'rgba(34,197,94,0.85)' : undefined }}>
          {loading
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جاري التحقق...</span>
            : success
            ? <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> تم</span>
            : 'تحقق'}
        </Button>

        {/* إعادة الإرسال */}
        <div className="text-center">
          {canResend ? (
            <button onClick={handleResend} disabled={isDisabled}
              className="flex items-center gap-2 mx-auto text-xs text-indigo-400 font-semibold hover:underline">
              <RefreshCw className="w-3.5 h-3.5" /> إعادة إرسال الرمز
            </button>
          ) : (
            <p className="text-xs text-white/35">
              إعادة الإرسال بعد{' '}
              <span className="text-white/70 font-bold tabular-nums">{countdown}</span> ثانية
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
