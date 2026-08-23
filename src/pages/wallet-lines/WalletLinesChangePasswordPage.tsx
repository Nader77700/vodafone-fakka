/**
 * WalletLinesChangePasswordPage — PHASE 2
 * Flow مستقل لتغيير كلمة السر داخل قسم My NTRA
 * خطوات: رقم الهاتف → OTP → كلمة سر جديدة → نجاح
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Phone, KeyRound, Lock, CheckCircle2, XCircle,
  Loader2, Eye, EyeOff, Clock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { walletLinesService } from '@/services/walletLinesService';

function validatePhone(value: string): string | null {
  if (!value) return 'رقم الهاتف مطلوب';
  if (!/^01[0125]\d{8}$/.test(value)) return 'رقم هاتف مصري غير صحيح (01x + 8 أرقام)';
  return null;
}

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function WalletLinesChangePasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<'phone' | 'otp' | 'password' | 'success'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationKey, setVerificationKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // مراقبة الحظر وعداد إعادة الإرسال
  useEffect(() => {
    const update = () => {
      setLockoutRemaining(walletLinesService.getPasswordResetLockoutRemaining());
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  function handleBackToLogin() {
    navigate('/wallet-lines/login', { replace: true });
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const err = validatePhone(phone);
    if (err) { setErrorMsg(err); return; }
    if (walletLinesService.isPasswordResetLockedOut()) {
      setErrorMsg(`تم تجاوز الحد الأقصى للمحاولات. يرجى الانتظار ${Math.ceil(lockoutRemaining / 60)} دقيقة.`);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const result = await walletLinesService.requestPasswordResetOtp(phone);
    setLoading(false);

    if (!result.success) {
      setErrorMsg(result.userMessage ?? 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقًا.');
      setLockoutRemaining(walletLinesService.getPasswordResetLockoutRemaining());
      return;
    }

    setOtp('');
    setStep('otp');
    setResendCooldown(60);
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || walletLinesService.isPasswordResetLockedOut()) return;
    setLoading(true);
    setErrorMsg(null);

    const result = await walletLinesService.requestPasswordResetOtp(phone);
    setLoading(false);

    if (!result.success) {
      setErrorMsg(result.userMessage ?? 'فشل إرسال رمز التحقق. يرجى المحاولة لاحقًا.');
      setLockoutRemaining(walletLinesService.getPasswordResetLockoutRemaining());
      return;
    }

    setResendCooldown(60);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < 1) { setErrorMsg('يرجى إدخال رمز التحقق.'); return; }
    if (walletLinesService.isPasswordResetLockedOut()) {
      setErrorMsg(`تم تجاوز الحد الأقصى للمحاولات. يرجى الانتظار ${Math.ceil(lockoutRemaining / 60)} دقيقة.`);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const result = await walletLinesService.verifyPasswordResetOtp(phone, otp);
    setLoading(false);

    if (!result.success) {
      setErrorMsg(result.userMessage ?? 'رمز التحقق غير صحيح. يرجى المحاولة مرة أخرى.');
      setOtp('');
      setLockoutRemaining(walletLinesService.getPasswordResetLockoutRemaining());
      return;
    }

    if (result.data?.verificationKey) {
      setVerificationKey(result.data.verificationKey);
      setPassword('');
      setConfirmPassword('');
      setStep('password');
    } else {
      setErrorMsg('فشل استلام مفتاح التحقق. يرجى المحاولة لاحقًا.');
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const result = await walletLinesService.resetPassword(phone, password, confirmPassword, verificationKey);
    if (!result.success) {
      setErrorMsg(result.userMessage ?? 'فشل تغيير كلمة السر. يرجى المحاولة لاحقًا.');
      return;
    }

    setStep('success');
  }

  const isLockedOut = lockoutRemaining > 0;

  return (
    <div className="min-h-screen pb-28 flex flex-col" dir="rtl"
      style={{ background: 'linear-gradient(180deg, #080d14 0%, #0a0a12 100%)' }}>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 py-4">
          <button onClick={handleBackToLogin}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all">
            <ArrowRight className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-black text-foreground">تغيير كلمة السر</h1>
            <p className="text-[10px] text-muted-foreground">خدمات الخطوط والمحافظ</p>
          </div>
        </div>
      </div>

      {/* محتوى الخطوات */}
      <div className="flex-1 px-4 pt-5 flex flex-col gap-5">
        {/* مؤشر الخطوات */}
        <div className="flex items-center justify-center gap-2">
          {(['phone', 'otp', 'password', 'success'] as const).map((s, i) => {
            const active = step === s;
            const done = ['phone', 'otp', 'password', 'success'].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                  active ? 'bg-amber-500 text-amber-950' : done ? 'bg-green-500 text-green-950' : 'bg-white/10 text-white/40'
                }`}>
                  {done ? '✓' : i + 1}
                </div>
                {i < 3 && <div className={`w-8 h-0.5 ${done ? 'bg-green-500' : 'bg-white/10'}`} />}
              </div>
            );
          })}
        </div>

        {/* رسالة خطأ عامة */}
        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/25 bg-red-500/8">
            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* الخطوة 1: رقم الهاتف */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="rounded-2xl p-4 border border-white/8 bg-white/3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                  <Phone className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground">أدخل رقم الهاتف</h2>
                  <p className="text-[10px] text-white/50">سنرسل رمز التحقق إلى رقم الهاتف المسجل.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cp-phone" className="text-sm font-semibold text-white/80">رقم الهاتف</Label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <Input
                    id="cp-phone" type="tel" inputMode="numeric" maxLength={11}
                    value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 11)); setErrorMsg(null); }}
                    placeholder="01XXXXXXXXX"
                    disabled={loading}
                    className="pr-10 text-left placeholder:text-left font-mono h-12 rounded-xl"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={loading || isLockedOut}
              className="w-full h-12 text-sm font-black rounded-xl bg-amber-500 hover:bg-amber-600 text-amber-950">
              {loading ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />جاري الإرسال...</span>
              ) : (
                <span className="flex items-center gap-2"><KeyRound className="w-4 h-4" />إرسال رمز التحقق</span>
              )}
            </Button>

            {isLockedOut && (
              <div className="flex items-center gap-2 justify-center text-amber-400 text-xs">
                <Clock className="w-4 h-4" />
                <span>مدة الحظر المتبقية: {formatRemaining(lockoutRemaining)}</span>
              </div>
            )}

            <button type="button" onClick={handleBackToLogin}
              className="w-full text-center text-xs text-white/50 hover:text-white/80 transition-colors">
              العودة لتسجيل الدخول
            </button>
          </form>
        )}

        {/* الخطوة 2: OTP */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="rounded-2xl p-4 border border-white/8 bg-white/3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground">التحقق من الرمز</h2>
                  <p className="text-[10px] text-white/50">تم إرسال رمز التحقق إلى الرقم التالي.</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/6 px-3 py-2">
                <Phone className="w-4 h-4 text-indigo-400" />
                <p className="text-sm font-mono font-bold text-white/90" dir="ltr">{maskPhone(phone)}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cp-otp" className="text-sm font-semibold text-white/80">رمز التحقق</Label>
                <Input
                  id="cp-otp" type="text" inputMode="numeric" maxLength={6}
                  value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrorMsg(null); }}
                  placeholder="ادخل رمز التحقق"
                  disabled={loading}
                  className="text-center text-2xl font-black tracking-[0.3em] h-14 rounded-xl font-mono"
                  dir="ltr"
                />
              </div>
            </div>

            <Button type="submit" disabled={loading || isLockedOut || otp.length === 0}
              className="w-full h-12 text-sm font-black rounded-xl bg-amber-500 hover:bg-amber-600 text-amber-950">
              {loading ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />جاري التحقق...</span>
              ) : (
                <span className="flex items-center gap-2"><KeyRound className="w-4 h-4" />تأكيد</span>
              )}
            </Button>

            <div className="flex items-center justify-center gap-4">
              <button type="button" onClick={handleResendOtp}
                disabled={loading || resendCooldown > 0 || isLockedOut}
                className="text-xs text-white/60 hover:text-white/90 disabled:text-white/30 disabled:cursor-not-allowed transition-colors">
                {resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown} ثانية` : 'إعادة إرسال الرمز'}
              </button>
            </div>

            {isLockedOut && (
              <div className="flex items-center gap-2 justify-center text-amber-400 text-xs">
                <Clock className="w-4 h-4" />
                <span>مدة الحظر المتبقية: {formatRemaining(lockoutRemaining)}</span>
              </div>
            )}

            <button type="button" onClick={handleBackToLogin}
              className="w-full text-center text-xs text-white/50 hover:text-white/80 transition-colors">
              إلغاء والعودة لتسجيل الدخول
            </button>
          </form>
        )}

        {/* الخطوة 3: كلمة السر الجديدة */}
        {step === 'password' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="rounded-2xl p-4 border border-white/8 bg-white/3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center border border-green-500/20">
                  <Lock className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground">إنشاء كلمة سر جديدة</h2>
                  <p className="text-[10px] text-white/50">كلمة السر يجب أن تكون 6 أحرف على الأقل.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cp-password" className="text-sm font-semibold text-white/80">كلمة السر الجديدة</Label>
                <div className="relative">
                  <Input
                    id="cp-password" type={showPassword ? 'text' : 'password'}
                    value={password} onChange={e => { setPassword(e.target.value); setErrorMsg(null); }}
                    placeholder="أدخل كلمة السر الجديدة"
                    disabled={loading}
                    className="pl-10 h-12 rounded-xl"
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cp-confirm" className="text-sm font-semibold text-white/80">تأكيد كلمة السر</Label>
                <div className="relative">
                  <Input
                    id="cp-confirm" type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setErrorMsg(null); }}
                    placeholder="أعد إدخال كلمة السر"
                    disabled={loading}
                    className="pl-10 h-12 rounded-xl"
                  />
                  <button type="button" onClick={() => setShowConfirm(p => !p)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button type="submit" disabled={loading}
              className="w-full h-12 text-sm font-black rounded-xl bg-green-500 hover:bg-green-600 text-green-950">
              {loading ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />جاري التغيير...</span>
              ) : (
                <span className="flex items-center gap-2"><Lock className="w-4 h-4" />تغيير كلمة السر</span>
              )}
            </Button>

            <button type="button" onClick={handleBackToLogin}
              className="w-full text-center text-xs text-white/50 hover:text-white/80 transition-colors">
              إلغاء والعودة لتسجيل الدخول
            </button>
          </form>
        )}

        {/* الخطوة 4: نجاح */}
        {step === 'success' && (
          <div className="rounded-2xl p-5 border border-green-500/20 bg-green-500/8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto border border-green-500/30">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-black text-foreground">تم تغيير كلمة السر بنجاح</h2>
              <p className="text-xs text-white/60">يمكنك الآن تسجيل الدخول باستخدام كلمة السر الجديدة.</p>
            </div>
            <Button onClick={handleBackToLogin}
              className="w-full h-12 text-sm font-black rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15">
              <span className="flex items-center gap-2"><ArrowRight className="w-4 h-4" />العودة لتسجيل الدخول</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
