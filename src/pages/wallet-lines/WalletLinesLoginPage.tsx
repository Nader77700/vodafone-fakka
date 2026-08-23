/**
 * WalletLinesLoginPage — Login UI — PHASE 3 (Session Persistence)
 * - يتحقق تلقائياً من وجود جلسة محفوظة عند الدخول
 * - لو جلسة موجودة → يتجاوز Login مباشرة إلى National ID
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Phone, Lock, Eye, EyeOff, CheckCircle2, XCircle, Loader2, Info, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { walletLinesService } from '@/services/walletLinesService';
import { useIsLight } from '@/contexts/ThemeContext';

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
  const L = useIsLight();

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
      style={{ background: L ? '#f5f7fa' : 'linear-gradient(180deg, #080d14 0%, #0a0a12 100%)' }}>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{
          background: L ? 'rgba(255,255,255,0.96)' : 'rgba(8,13,20,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
        }}>
        <div className="flex items-center gap-3 py-4">
          <button onClick={() => navigate('/wallet-lines')} disabled={isDisabled}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all"
            style={{
              border: `1px solid ${L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`,
              background: L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
            }}>
            <ArrowRight className="w-4 h-4" style={{ color: L ? '#1a1a2e' : '#ffffff' }} />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-black" style={{ color: L ? '#1a1a2e' : '#ffffff' }}>تسجيل الدخول</h1>
            <p className="text-[10px] text-muted-foreground">خدمات الخطوط والمحافظ</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-4 pt-5 flex flex-col gap-5" noValidate>

        {/* توضيح My NTRA */}
        <div className="rounded-2xl p-3.5"
          style={{
            border: `1px solid ${L ? 'rgba(99,102,241,0.20)' : 'rgba(99,102,241,0.20)'}`,
            background: L ? 'rgba(99,102,241,0.05)' : 'rgba(99,102,241,0.06)',
          }}>
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed"
              style={{ color: L ? 'rgba(0,0,0,0.60)' : 'rgba(255,255,255,0.65)' }}>
              سجّل الدخول باستخدام حسابك الرسمي على My NTRA للوصول إلى بيانات الخطوط والمحافظ المسجلة باسمك.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/25"
            style={{ background: L ? 'rgba(220,38,38,0.05)' : 'rgba(220,38,38,0.08)' }}>
            <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed" style={{ color: L ? '#dc2626' : '#f87171' }}>{errorMsg}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border border-green-500/25"
            style={{ background: L ? 'rgba(34,197,94,0.05)' : 'rgba(34,197,94,0.08)' }}>
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <p className="text-xs font-semibold" style={{ color: L ? '#16a34a' : '#86efac' }}>تم تسجيل الدخول بنجاح...</p>
          </div>
        )}

        {/* رقم الهاتف */}
        <div className="space-y-1.5">
          <Label htmlFor="wl-phone" className="text-sm font-semibold"
            style={{ color: L ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.80)' }}>رقم الهاتف</Label>
          <div className="relative">
            <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: L ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' }} />
            <Input
              id="wl-phone" type="tel" inputMode="numeric" placeholder="01XXXXXXXXX"
              value={phone} onChange={e => { setPhone(e.target.value); if (phoneErr) setPhoneErr(null); setErrorMsg(null); }}
              onBlur={() => setPhoneErr(validatePhone(phone))}
              disabled={isDisabled} maxLength={11}
              className="pr-9 text-left placeholder:text-left font-mono" dir="ltr"
              style={{
                background: L ? '#ffffff' : 'rgba(255,255,255,0.04)',
                borderColor: phoneErr ? (L ? '#dc2626' : 'rgba(220,38,38,0.6)') : (L ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)'),
                color: L ? '#1a1a2e' : '#ffffff',
              }}
              aria-invalid={!!phoneErr}
            />
          </div>
          {phoneErr && <p className="text-[11px] text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3" />{phoneErr}</p>}
        </div>

        {/* كلمة المرور */}
        <div className="space-y-1.5">
          <Label htmlFor="wl-pass" className="text-sm font-semibold"
            style={{ color: L ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.80)' }}>كلمة المرور</Label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: L ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' }} />
            <Input
              id="wl-pass" type={showPass ? 'text' : 'password'} placeholder="كلمة المرور"
              value={password} onChange={e => { setPassword(e.target.value); if (passErr) setPassErr(null); setErrorMsg(null); }}
              onBlur={() => setPassErr(validatePassword(password))}
              disabled={isDisabled} className="pr-9 pl-10"
              style={{
                background: L ? '#ffffff' : 'rgba(255,255,255,0.04)',
                borderColor: passErr ? (L ? '#dc2626' : 'rgba(220,38,38,0.6)') : (L ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)'),
                color: L ? '#1a1a2e' : '#ffffff',
              }}
              aria-invalid={!!passErr}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)}
              className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: L ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' }}
              aria-label={showPass ? 'إخفاء' : 'إظهار'}>
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {passErr && <p className="text-[11px] text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3" />{passErr}</p>}
        </div>

        <Button type="submit" disabled={isDisabled}
          className="w-full h-12 text-sm font-black rounded-xl mt-2"
          style={{ background: success ? 'rgba(34,197,94,0.85)' : undefined }}>
          {loading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />جاري التحقق...</span>
            : success ? <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />تم الدخول</span>
            : 'تسجيل الدخول إلى My NTRA'}
        </Button>

        {/* Forgot password */}
        <div className="flex items-center justify-center">
          <button type="button" onClick={() => navigate('/wallet-lines/change-password')} disabled={isDisabled}
            className="text-xs text-amber-500 hover:text-amber-600 font-semibold transition-colors">
            نسيت كلمة السر؟ / تغيير كلمة السر
          </button>
        </div>

        <div className="rounded-2xl p-4 space-y-3"
          style={{
            border: `1px solid ${L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
            background: L ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
          }}>
          <p className="text-center text-xs leading-relaxed"
            style={{ color: L ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.60)' }}>
            ليس لديك حساب على My NTRA؟<br />يمكنك إنشاء حساب جديد من هنا.
          </p>
          <button type="button" onClick={() => navigate('/wallet-lines/register')} disabled={isDisabled}
            className="w-full h-11 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] border"
            style={{ background: L ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.12)', borderColor: L ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.25)', color: L ? '#16a34a' : '#86efac' }}>
            <Users className="w-4 h-4" />
            إنشاء حساب My NTRA جديد
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground/60 mt-2">
          <span className="text-indigo-400/60 font-bold">تسجيل الدخول</span>
          <span>←</span><span>التحقق بالرقم القومي</span>
          <span>←</span><span>النتائج</span>
        </div>
      </form>
    </div>
  );
}
