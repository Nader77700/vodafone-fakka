/**
 * WalletLinesRegisterPage — Register UI — PHASE 1 (بدون API)
 * 5 حقول + Validation + Show/Hide + Loading/Error/Success.
 * بعد التسجيل → OTP UI.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, User, Phone, Mail, Lock, Eye, EyeOff, CheckCircle2, XCircle, Loader2, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { walletLinesService } from '@/services/walletLinesService';

// ── Validators ────────────────────────────────────────────────────
const validators = {
  fullName: (v: string) => !v.trim() ? 'الاسم مطلوب' : v.trim().length < 3 ? 'الاسم 3 أحرف على الأقل' : null,
  phone: (v: string) => !v ? 'رقم الهاتف مطلوب' : !/^01[0-2,5]\d{8}$/.test(v) ? 'رقم هاتف مصري غير صحيح' : null,
  email: (v: string) => !v ? 'البريد الإلكتروني مطلوب' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'بريد إلكتروني غير صحيح' : null,
  password: (v: string) => !v ? 'كلمة المرور مطلوبة' : v.length < 8 ? 'كلمة المرور 8 أحرف على الأقل' : null,
  confirm: (v: string, pass: string) => !v ? 'تأكيد كلمة المرور مطلوب' : v !== pass ? 'كلمتا المرور غير متطابقتين' : null,
};

export default function WalletLinesRegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', confirm: '' });
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDisabled = loading || success;

  function setField(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => ({ ...e, [k]: null }));
    setErrorMsg(null);
  }

  function validateAll() {
    const e = {
      fullName: validators.fullName(form.fullName),
      phone: validators.phone(form.phone),
      email: validators.email(form.email),
      password: validators.password(form.password),
      confirm: validators.confirm(form.confirm, form.password),
    };
    setErrs(e);
    return !Object.values(e).some(Boolean);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validateAll()) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await walletLinesService.register({
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        password: form.password,
        confirmPassword: form.confirm,
      });
      setLoading(false);

      if (!result.success) {
        setErrorMsg(result.userMessage ?? 'حدث خطأ غير متوقع.');
        return;
      }

      setSuccess(true);
      setTimeout(() => navigate('/wallet-lines/otp', { state: { phone: form.phone } }), 900);
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`فشل التسجيل: ${msg}`);
    }
  }

  const Field = ({
    id, label, icon: Icon, type = 'text', value, field, placeholder, inputMode, maxLength,
    rightEl, dir: fieldDir, className,
  }: {
    id: string; label: string; icon: React.ElementType; type?: string; value: string;
    field: keyof typeof form; placeholder: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    maxLength?: number; rightEl?: React.ReactNode; dir?: string; className?: string;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-semibold text-white/80">{label}</Label>
      <div className="relative">
        <Icon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        <Input
          id={id} type={type} inputMode={inputMode} placeholder={placeholder}
          value={value} maxLength={maxLength}
          onChange={e => setField(field, e.target.value)}
          onBlur={() => {
            const fn = field === 'confirm'
              ? validators.confirm(form.confirm, form.password)
              : (validators[field] as (v: string) => string | null)(form[field]);
            setErrs(e => ({ ...e, [field]: fn }));
          }}
          disabled={isDisabled}
          className={`pr-9 ${rightEl ? 'pl-10' : ''} ${className ?? ''}`}
          dir={fieldDir}
          aria-invalid={!!errs[field]}
        />
        {rightEl}
      </div>
      {errs[field] && (
        <p className="text-[11px] text-red-400 flex items-center gap-1">
          <XCircle className="w-3 h-3" />{errs[field]}
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen pb-28 flex flex-col" dir="rtl"
      style={{ background: 'linear-gradient(180deg, #080d14 0%, #0a0a12 100%)' }}>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 py-4">
          <button onClick={() => navigate('/wallet-lines/login')}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95"
            disabled={isDisabled}>
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div>
            <h1 className="text-base font-black text-white">إنشاء حساب My NTRA</h1>
            <p className="text-[10px] text-muted-foreground">حساب رسمي على منصة الجهاز القومي</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-4 pt-5 flex flex-col gap-5" noValidate>

        {/* توضيح حساب My NTRA الرسمي */}
        <div className="rounded-2xl p-3.5 border border-green-500/20 bg-green-500/6">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[11px] text-white/65 leading-relaxed">
                الحساب الذي يتم إنشاؤه هنا هو حساب <span className="font-bold text-white/85">My NTRA الرسمي</span>، وليس حسابًا خاصًا بالتطبيق.
              </p>
              <p className="text-[10px] text-white/40 leading-relaxed">
                أدخل بياناتك لإنشاء حسابك على My NTRA والوصول إلى خدمة الاستعلام عن الخطوط والمحافظ.
              </p>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/25 bg-red-500/8">
            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 leading-relaxed">{errorMsg}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border border-green-500/25 bg-green-500/8">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <p className="text-xs text-green-300 font-semibold">جاري الانتقال لتأكيد الرمز...</p>
          </div>
        )}

        <Field id="wl-name" label="الاسم بالكامل" icon={User} value={form.fullName} field="fullName" placeholder="الاسم الثلاثي" />
        <Field id="wl-phone" label="رقم الهاتف" icon={Phone} type="tel" inputMode="numeric" value={form.phone} field="phone" placeholder="01XXXXXXXXX" maxLength={11} dir="ltr" className="text-left" />
        <Field id="wl-email" label="البريد الإلكتروني" icon={Mail} type="email" value={form.email} field="email" placeholder="example@email.com" dir="ltr" />

        {/* كلمة المرور */}
        <div className="space-y-1.5">
          <Label htmlFor="wl-reg-pass" className="text-sm font-semibold text-white/80">كلمة المرور</Label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <Input id="wl-reg-pass" type={showPass ? 'text' : 'password'} placeholder="8 أحرف على الأقل"
              value={form.password} onChange={e => setField('password', e.target.value)}
              onBlur={() => setErrs(e => ({ ...e, password: validators.password(form.password) }))}
              disabled={isDisabled} className="pr-9 pl-10" aria-invalid={!!errs.password} />
            <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errs.password && <p className="text-[11px] text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" />{errs.password}</p>}
        </div>

        {/* تأكيد كلمة المرور */}
        <div className="space-y-1.5">
          <Label htmlFor="wl-confirm" className="text-sm font-semibold text-white/80">تأكيد كلمة المرور</Label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <Input id="wl-confirm" type={showConfirm ? 'text' : 'password'} placeholder="أعد كلمة المرور"
              value={form.confirm} onChange={e => setField('confirm', e.target.value)}
              onBlur={() => setErrs(e => ({ ...e, confirm: validators.confirm(form.confirm, form.password) }))}
              disabled={isDisabled} className="pr-9 pl-10" aria-invalid={!!errs.confirm} />
            <button type="button" tabIndex={-1} onClick={() => setShowConfirm(p => !p)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errs.confirm && <p className="text-[11px] text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" />{errs.confirm}</p>}
        </div>

        <Button type="submit" disabled={isDisabled} className="w-full h-12 text-sm font-black rounded-xl mt-1"
          style={{ background: success ? 'rgba(34,197,94,0.85)' : undefined }}>
          {loading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جاري التسجيل...</span>
            : success ? <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> تم التسجيل</span>
            : 'إنشاء الحساب'}
        </Button>

        <p className="text-center text-xs text-white/40">
          لديك حساب؟{' '}
          <button type="button" onClick={() => navigate('/wallet-lines/login')} disabled={isDisabled}
            className="text-indigo-400 font-semibold hover:underline">تسجيل الدخول</button>
        </p>
      </form>
    </div>
  );
}
