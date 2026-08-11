/**
 * WalletLinesLoginPage — Login UI — PHASE 3 (Session Persistence)
 * - يتحقق تلقائياً من وجود جلسة محفوظة عند الدخول
 * - لو جلسة موجودة → يتجاوز Login مباشرة إلى National ID
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Phone, Lock, Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { walletLinesService } from '@/services/walletLinesService';

function validatePhone(v: string): string | null {
  if (!v) return 'رقم الهاتف مطلوب';
  if (!/^01[0-2,5]\d{8}$/.test(v)) return 'رقم هاتف مصري غير صحيح (01x + 8 أرقام)';
  return null;
}
function validatePassword(v: string): string | null {
  if (!v) return 'كلمة المرور مطلوبة';
  if (v.length < 6) return 'كلمة المرور 6 أحرف على الأقل';
  return null;
}

export default function WalletLinesLoginPage() {
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [passErr, setPassErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── Auto-restore: لو جلسة وآخر نتيجة محفوظة → تجاوز Login مباشرة للنتائج ──
  useEffect(() => {
    if (!walletLinesService.hasActiveSession()) return;
    const lastResult = walletLinesService.getLastResult();
    if (lastResult) {
      // نتيجة محفوظة → اذهب للنتائج مباشرة
      navigate('/wallet-lines/results', {
        replace: true,
        state: { result: lastResult },
      });
    } else {
      // جلسة بدون نتيجة محفوظة → اذهب للرقم القومي
      navigate('/wallet-lines/national-id', {
        replace: true,
        state: { token: '__restored__' },
      });
    }
  }, [navigate]);

  const isDisabled = loading || success;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pErr = validatePhone(phone);
    const wErr = validatePassword(password);
    setPhoneErr(pErr);
    setPassErr(wErr);
    if (pErr || wErr) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await walletLinesService.login({ phone, password });
      setLoading(false);

      if (!result.success) {
        setErrorMsg(result.userMessage ?? 'حدث خطأ غير متوقع.');
        return;
      }

      setSuccess(true);
      setTimeout(
        () => navigate('/wallet-lines/national-id', { state: { token: result.data?.token } }),
        900,
      );
    } catch (err: unknown) {
      setLoading(false);
      setErrorMsg(`خطأ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="min-h-screen pb-28 flex flex-col" dir="rtl"
      style={{ background: 'linear-gradient(180deg, #080d14 0%, #0a0a12 100%)' }}>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 py-4">
          <button onClick={() => navigate('/wallet-lines')} disabled={isDisabled}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all">
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-black text-white">تسجيل الدخول</h1>
            <p className="text-[10px] text-muted-foreground">خدمات الخطوط والمحافظ</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-4 pt-6 flex flex-col gap-5" noValidate>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/25 bg-red-500/8">
            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border border-green-500/25 bg-green-500/8">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-xs text-green-300 font-semibold">تم تسجيل الدخول بنجاح...</p>
          </div>
        )}

        {/* رقم الهاتف */}
        <div className="space-y-1.5">
          <Label htmlFor="wl-phone" className="text-sm font-semibold text-white/80">رقم الهاتف</Label>
          <div className="relative">
            <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <Input
              id="wl-phone" type="tel" inputMode="numeric" placeholder="01XXXXXXXXX"
              value={phone} onChange={e => { setPhone(e.target.value); if (phoneErr) setPhoneErr(null); setErrorMsg(null); }}
              onBlur={() => setPhoneErr(validatePhone(phone))}
              disabled={isDisabled} maxLength={11}
              className="pr-9 text-left placeholder:text-right font-mono" dir="ltr"
              aria-invalid={!!phoneErr}
            />
          </div>
          {phoneErr && <p className="text-[11px] text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" />{phoneErr}</p>}
        </div>

        {/* كلمة المرور */}
        <div className="space-y-1.5">
          <Label htmlFor="wl-pass" className="text-sm font-semibold text-white/80">كلمة المرور</Label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <Input
              id="wl-pass" type={showPass ? 'text' : 'password'} placeholder="كلمة المرور"
              value={password} onChange={e => { setPassword(e.target.value); if (passErr) setPassErr(null); setErrorMsg(null); }}
              onBlur={() => setPassErr(validatePassword(password))}
              disabled={isDisabled} className="pr-9 pl-10" aria-invalid={!!passErr}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              aria-label={showPass ? 'إخفاء' : 'إظهار'}>
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {passErr && <p className="text-[11px] text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" />{passErr}</p>}
        </div>

        <Button type="submit" disabled={isDisabled}
          className="w-full h-12 text-sm font-black rounded-xl mt-2"
          style={{ background: success ? 'rgba(34,197,94,0.85)' : undefined }}>
          {loading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />جاري التحقق...</span>
            : success ? <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />تم الدخول</span>
            : 'تسجيل الدخول'}
        </Button>

        <p className="text-center text-xs text-white/40">
          ليس لديك حساب؟{' '}
          <button type="button" onClick={() => navigate('/wallet-lines/register')} disabled={isDisabled}
            className="text-indigo-400 font-semibold hover:underline">
            إنشاء حساب جديد
          </button>
        </p>

        <div className="flex items-center justify-center gap-2 text-[10px] text-white/20 mt-2">
          <span className="text-indigo-400/60 font-bold">تسجيل الدخول</span>
          <span>←</span><span>التحقق بالرقم القومي</span>
          <span>←</span><span>النتائج</span>
        </div>
      </form>
    </div>
  );
}
