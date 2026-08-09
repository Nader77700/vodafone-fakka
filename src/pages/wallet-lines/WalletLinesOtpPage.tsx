/**
 * WalletLinesOtpPage — OTP UI — PHASE 2 (Real API)
 * 6 خانات OTP + Countdown + إعادة إرسال + Loading/Error/Success.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { walletLinesService } from '@/services/walletLinesService';

const OTP_LENGTH = 6;
const COUNTDOWN_SEC = 60;

export default function WalletLinesOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const phone: string = (location.state as { phone?: string })?.phone ?? '';

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const otp = digits.join('');
  const isComplete = otp.length === OTP_LENGTH && digits.every(d => d !== '');
  const isDisabled = loading || success;

  function handleDigit(idx: number, val: string) {
    const clean = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = clean;
    setDigits(next);
    setErrorMsg(null);
    if (clean && idx < OTP_LENGTH - 1) inputRefs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!digits[idx] && idx > 0) {
        const next = [...digits]; next[idx - 1] = '';
        setDigits(next);
        inputRefs.current[idx - 1]?.focus();
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    const next = Array(OTP_LENGTH).fill('');
    text.split('').forEach((c, i) => { if (i < OTP_LENGTH) next[i] = c; });
    setDigits(next);
    inputRefs.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  }

  async function handleVerify() {
    if (!isComplete) return;
    setLoading(true);
    setErrorMsg(null);
    const result = await walletLinesService.verifyOtp({ phone, otp });
    setLoading(false);
    if (!result.success) {
      setErrorMsg(result.userMessage ?? 'رمز التحقق غير صحيح.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      return;
    }
    setSuccess(true);
    // بعد OTP ناجح → الـ sessionKey محفوظ في sessionStorage من خطوة login
    // ننتقل لشاشة الرقم القومي مباشرة
    setTimeout(() => navigate('/wallet-lines/national-id', { state: { token: result.data?.token ?? '' } }), 900);
  }

  function handleResend() {
    setCountdown(COUNTDOWN_SEC);
    setCanResend(false);
    setDigits(Array(OTP_LENGTH).fill(''));
    setErrorMsg(null);
    inputRefs.current[0]?.focus();
  }

  return (
    <div className="min-h-screen pb-28 flex flex-col" dir="rtl"
      style={{ background: 'linear-gradient(180deg, #080d14 0%, #0a0a12 100%)' }}>

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
          <p className="text-sm text-white/70 font-medium">
            تم إرسال رمز التحقق إلى
          </p>
          <p className="text-base font-black text-white font-mono" dir="ltr">
            {phone || 'رقمك المسجل'}
          </p>
        </div>

        {/* OTP inputs */}
        <div className="flex items-center justify-center gap-3" onPaste={handlePaste} dir="ltr">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={isDisabled}
              className={`w-14 h-14 text-center text-2xl font-black rounded-2xl border-2 bg-white/5 text-white outline-none transition-all duration-200
                focus:border-indigo-400 focus:bg-indigo-500/10
                ${d ? 'border-indigo-400/60' : 'border-white/15'}
                ${errorMsg ? 'border-red-400/60 bg-red-500/8' : ''}
                ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              aria-label={`الرقم ${i + 1}`}
            />
          ))}
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
          {loading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جاري التحقق...</span>
            : success ? <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> تم</span>
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
