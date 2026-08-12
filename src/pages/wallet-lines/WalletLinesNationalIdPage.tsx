/**
 * WalletLinesNationalIdPage — PHASE 3 (Session Persistence)
 * - يُحمِّل الرقم القومي المحفوظ من localStorage تلقائياً
 * - يحفظ الرقم القومي بعد كل استعلام ناجح
 */

import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, IdCard, ShieldCheck, XCircle, CheckCircle2, Loader2, LogOut, User, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { walletLinesService } from '@/services/walletLinesService';

function validateNationalId(v: string): string | null {
  if (!v) return 'الرقم القومي مطلوب';
  if (!/^\d+$/.test(v)) return 'أرقام فقط — لا يُسمح بالحروف';
  if (v.length !== 14) return `يجب أن يكون 14 رقمًا (أدخلت ${v.length})`;
  return null;
}

export default function WalletLinesNationalIdPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const token: string = (location.state as { token?: string })?.token ?? '';

  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const isDisabled = loading || success;

  // بيانات الحساب القادمة من My NTRA
  const userFullName = walletLinesService.getSavedFullName() ?? '—';
  const userEmail = walletLinesService.getSavedEmail() ?? '—';

  // ── تحميل الرقم القومي المحفوظ تلقائياً ──────────────────────
  useEffect(() => {
    const saved = walletLinesService.getSavedNationalId();
    if (saved) setValue(saved);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 14);
    setValue(raw);
    setErr(null);
    setErrorMsg(null);
  }

  async function handleVerify(ev: React.FormEvent) {
    ev.preventDefault();
    const v = validateNationalId(value);
    if (v) { setErr(v); return; }

    setLoading(true);
    setErrorMsg(null);

    const result = await walletLinesService.lookupByNationalId(value, token);
    setLoading(false);

    if (!result.success) {
      // أي خطأ (بما فيه انتهاء الجلسة) يُعرض داخل نفس الشاشة بدون إعادة توجيه
      setErrorMsg(result.userMessage ?? 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
      return;
    }

    setSuccess(true);
    setTimeout(() => navigate('/wallet-lines/results', { state: { result: result.data } }), 900);
  }

  function handleLogout() {
    walletLinesService.logout();
    navigate('/wallet-lines/login', { replace: true });
  }

  const filled = value.length;

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
          <div className="flex-1">
            <h1 className="text-base font-black text-white">التحقق بالرقم القومي</h1>
            <p className="text-[10px] text-muted-foreground">خطوة أخيرة لعرض النتائج</p>
          </div>
          {/* زر تسجيل الخروج */}
          <button onClick={handleLogout} disabled={isDisabled}
            className="flex items-center gap-1.5 text-[11px] text-red-400/70 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 active:scale-95">
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleVerify} className="flex-1 px-4 pt-6 flex flex-col gap-5" noValidate>

        {/* بيانات حساب My NTRA */}
        <div className="rounded-2xl p-4 border border-indigo-500/20 bg-indigo-500/6 space-y-2">
          <p className="text-[10px] font-bold text-indigo-300/70 uppercase tracking-wide">حساب My NTRA</p>
          <div className="flex items-center gap-2.5 text-sm">
            <User className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-white/55 text-[11px]">الاسم</span>
            <span className="flex-1 text-white font-bold truncate text-left">{userFullName}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-white/55 text-[11px]">البريد</span>
            <span className="flex-1 text-white font-bold truncate text-left" dir="ltr">{userEmail}</span>
          </div>
        </div>

        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/25"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05))' }}>
            <IdCard className="w-8 h-8 text-indigo-400" />
          </div>
          <p className="text-sm text-white/80 font-semibold">أدخل رقمك القومي المكوّن من 14 رقمًا</p>
          <p className="text-[11px] text-white/50 leading-relaxed px-2">
            للتأكد من ارتباط الرقم القومي بحسابك على My NTRA قبل إظهار بيانات الخطوط والمحافظ الكاملة.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wl-nid" className="text-sm font-semibold text-white/80">الرقم القومي</Label>
          <Input
            id="wl-nid" type="text" inputMode="numeric" placeholder="00000000000000"
            value={value} onChange={handleChange}
            onBlur={() => setErr(validateNationalId(value))}
            disabled={isDisabled} maxLength={14}
            className="text-center text-xl font-black tracking-[0.2em] h-14 rounded-xl font-mono"
            dir="ltr" aria-invalid={!!err} autoComplete="off"
          />
          <div className="flex gap-0.5 h-1 rounded-full overflow-hidden bg-white/8">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="flex-1 rounded-full transition-colors duration-200"
                style={{ background: i < filled ? '#6366f1' : 'transparent' }} />
            ))}
          </div>
          <p className="text-[11px] text-center"
            style={{ color: filled === 14 ? '#a5b4fc' : 'rgba(255,255,255,0.3)' }}>
            {filled} / 14 رقم
          </p>
          {err && (
            <p className="text-[11px] text-red-400 flex items-center gap-1 justify-center">
              <XCircle className="w-3 h-3" />{err}
            </p>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-500/25 bg-red-500/8">
            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{errorMsg}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border border-green-500/25 bg-green-500/8">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <p className="text-xs text-green-300 font-semibold">تم التحقق من الرقم القومي بنجاح</p>
          </div>
        )}

        <Button type="submit" disabled={isDisabled || filled !== 14}
          className="w-full h-12 text-sm font-black rounded-xl"
          style={{ background: success ? 'rgba(34,197,94,0.85)' : undefined }}>
          {loading
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />جاري التحقق من الرقم القومي...</span>
            : success ? <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />تم</span>
            : 'تحقق وعرض النتائج'}
        </Button>

        <div className="flex items-start gap-2 p-3 rounded-xl border border-white/6 bg-white/3">
          <ShieldCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-white/40 leading-relaxed">
            رقمك القومي لا يُحفظ ولا يُرسل لأي طرف ثالث — يُستخدم فقط للاستعلام الآمن.
          </p>
        </div>
      </form>
    </div>
  );
}
