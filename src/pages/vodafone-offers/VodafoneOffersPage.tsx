/**
 * VodafoneOffersPage — عروض واشتراكات فودافون
 * PHASE 1: تسجيل الدخول فقط + حفظ الجلسة Server-Side
 * لا يوجد أي token في Frontend — كل المصادقة تتم عبر Edge Function
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, LogIn, Eye, EyeOff, Loader2, CheckCircle2,
  Tag, LogOut, ShieldCheck, AlertCircle, PhoneCall,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  anaVodafoneLogin,
  getAnaVodafoneSession,
  anaVodafoneLogout,
  type AnaVodafoneSession,
} from '@/lib/api';

// ── تنسيق رقم الهاتف للعرض ──────────────────────────────────────
function formatPhone(phone: string): string {
  return phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
}

// ── تنسيق تاريخ الانتهاء للعرض ──────────────────────────────────
function formatExpiry(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleString('ar-EG', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

export default function VodafoneOffersPage() {
  const navigate = useNavigate();

  // حالة الجلسة
  const [session, setSession] = useState<AnaVodafoneSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // Modal تسجيل الدخول
  const [showModal, setShowModal] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // تسجيل الخروج
  const [logoutLoading, setLogoutLoading] = useState(false);

  // ── جلب حالة الجلسة عند فتح الصفحة ──────────────────────────
  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    setSessionLoading(true);
    const s = await getAnaVodafoneSession();
    setSession(s);
    setSessionLoading(false);
  }

  // ── فتح Modal وإعادة الضبط ───────────────────────────────────
  function openModal() {
    setPhone('');
    setPassword('');
    setShowPassword(false);
    setLoginError(null);
    setLoginSuccess(false);
    setShowModal(true);
  }

  // ── تسجيل الدخول ─────────────────────────────────────────────
  async function handleLogin() {
    setLoginError(null);
    const trimmedPhone = phone.trim();
    const trimmedPass  = password;

    if (!trimmedPhone || !trimmedPass) {
      setLoginError('يرجى إدخال رقم الهاتف وكلمة المرور');
      return;
    }
    if (!trimmedPhone.startsWith('01') || trimmedPhone.length !== 11) {
      setLoginError('رقم الهاتف غير صحيح — 11 رقم يبدأ بـ 01');
      return;
    }

    setLoginLoading(true);
    const result = await anaVodafoneLogin(trimmedPhone, trimmedPass);
    setLoginLoading(false);

    if (!result.success) {
      setLoginError(result.error ?? 'فشل تسجيل الدخول');
      return;
    }

    // نجاح — أغلق Modal وحدّث الجلسة
    setLoginSuccess(true);
    setTimeout(async () => {
      setShowModal(false);
      setLoginSuccess(false);
      await loadSession();
    }, 1200);
  }

  // ── تسجيل الخروج ─────────────────────────────────────────────
  async function handleLogout() {
    setLogoutLoading(true);
    await anaVodafoneLogout();
    setSession(null);
    setLogoutLoading(false);
  }

  // ── تحقق من صحة إدخال رقم الهاتف ────────────────────────────
  function handlePhoneChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    setPhone(digits);
    setLoginError(null);
  }

  return (
    <div
      className="min-h-screen pb-28 flex flex-col"
      dir="rtl"
      style={{ background: 'linear-gradient(180deg, #080d14 0%, #0a0a12 100%)' }}
    >
      {/* ── Header ── */}
      <div
        className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{
          background: 'rgba(8,13,20,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-3 py-4">
          <button
            onClick={() => navigate('/services')}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all"
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-white leading-tight">عروض واشتراكات فودافون</h1>
            <p className="text-[10px] text-muted-foreground">أنا فودافون</p>
          </div>
          {/* شارة الاتصال */}
          <div
            className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
            style={{
              background: 'rgba(230,0,0,0.15)',
              color: '#ff6b6b',
              border: '1px solid rgba(230,0,0,0.3)',
            }}
          >
            <Tag className="w-3 h-3" />
            عروض
          </div>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-5">

        {/* ── بطاقة تعريفية ── */}
        <div
          className="relative rounded-[22px] overflow-hidden p-5"
          style={{
            background: 'linear-gradient(135deg, rgba(230,0,0,0.18), rgba(8,13,20,0.9))',
            border: '1px solid rgba(230,0,0,0.2)',
          }}
        >
          {/* Glow */}
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 20% 50%, rgba(230,0,0,0.3) 0%, transparent 60%)',
            }}
          />
          <div className="relative z-10 flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(230,0,0,0.2)', border: '1px solid rgba(230,0,0,0.35)' }}
            >
              <Tag className="w-5 h-5" style={{ color: '#ff6b6b' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-white mb-1">عروض واشتراكات فودافون</h2>
              <p className="text-[12px] text-white/55 leading-relaxed">
                قسم مخصص لعرض وإدارة عروض واشتراكات أنا فودافون مباشرةً من التطبيق.
                سجّل دخولك بحساب أنا فودافون للوصول إلى عروضك الشخصية.
              </p>
            </div>
          </div>
        </div>

        {/* ── حالة الجلسة ── */}
        {sessionLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>
        ) : session && session.is_valid ? (
          /* ── مسجّل الدخول ── */
          <div
            className="rounded-[22px] overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
          >
            {/* رأس البطاقة */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{
                background: 'rgba(34,197,94,0.1)',
                borderBottom: '1px solid rgba(34,197,94,0.15)',
              }}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
              <span className="text-sm font-black" style={{ color: '#4ade80' }}>
                تم تسجيل الدخول بنجاح
              </span>
            </div>

            {/* بيانات الجلسة */}
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <PhoneCall className="w-4 h-4 text-white/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-white/40 mb-0.5">رقم الهاتف المسجّل</p>
                  <p className="text-sm font-black text-white font-mono tracking-wide">
                    {formatPhone(session.phone)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <ShieldCheck className="w-4 h-4 text-white/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-white/40 mb-0.5">صلاحية الجلسة حتى</p>
                  <p className="text-[12px] font-bold text-white/80">
                    {formatExpiry(session.expires_at)}
                  </p>
                </div>
              </div>

              {/* قسم جاهز للمرحلة التالية */}
              <div
                className="rounded-xl px-4 py-3 mt-2"
                style={{
                  background: 'rgba(99,102,241,0.1)',
                  border: '1px solid rgba(99,102,241,0.2)',
                }}
              >
                <p className="text-[11px] font-bold mb-0.5" style={{ color: '#a5b4fc' }}>
                  الخدمات المتاحة
                </p>
                <p className="text-[10px] text-white/40 leading-relaxed">
                  سيتم إضافة عرض العروض والاشتراكات وإدارتها في المراحل التالية.
                </p>
              </div>
            </div>

            {/* زر تسجيل الخروج */}
            <div className="px-4 pb-4">
              <button
                onClick={handleLogout}
                disabled={logoutLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#f87171',
                }}
              >
                {logoutLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                تسجيل الخروج
              </button>
            </div>
          </div>
        ) : (
          /* ── غير مسجّل الدخول ── */
          <div
            className="rounded-[22px] overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="flex flex-col items-center gap-4 px-6 py-10">
              {/* أيقونة */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'rgba(230,0,0,0.15)',
                  border: '1px solid rgba(230,0,0,0.25)',
                }}
              >
                <LogIn className="w-7 h-7" style={{ color: '#ff6b6b' }} />
              </div>

              <div className="text-center">
                <h3 className="text-base font-black text-white mb-1">سجّل دخولك</h3>
                <p className="text-[12px] text-white/45 leading-relaxed max-w-[260px]">
                  سجّل دخولك بحساب أنا فودافون للوصول إلى عروضك واشتراكاتك الشخصية.
                </p>
              </div>

              <button
                onClick={openModal}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm text-white active:scale-[0.97] transition-all"
                style={{
                  background: 'linear-gradient(135deg, #E60000, #b30000)',
                  boxShadow: '0 4px 20px rgba(230,0,0,0.35)',
                }}
              >
                <LogIn className="w-4 h-4" />
                تسجيل الدخول
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal تسجيل الدخول ── */}
      <Dialog open={showModal} onOpenChange={(o) => { if (!loginLoading) setShowModal(o); }}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] md:max-w-lg rounded-[24px] p-0 overflow-hidden"
          dir="rtl"
          style={{
            background: '#0d1120',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {/* رأس Modal */}
          <DialogHeader className="px-5 pt-5 pb-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(230,0,0,0.18)', border: '1px solid rgba(230,0,0,0.3)' }}
              >
                <LogIn className="w-4 h-4" style={{ color: '#ff6b6b' }} />
              </div>
              <DialogTitle className="text-base font-black text-white">
                تسجيل الدخول — أنا فودافون
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* جسم Modal */}
          <div className="px-5 py-5 space-y-4">

            {/* حقل رقم الموبايل */}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-bold text-white/70">
                رقم الموبايل
              </Label>
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="01XXXXXXXXX"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                disabled={loginLoading || loginSuccess}
                maxLength={11}
                className="h-12 text-base font-mono tracking-wider text-right bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-red-500/30 focus-visible:border-red-500/50 rounded-xl px-4"
                autoComplete="tel"
                dir="ltr"
              />
            </div>

            {/* حقل كلمة المرور */}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-bold text-white/70">
                كلمة مرور «أنا فودافون»
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
                  disabled={loginLoading || loginSuccess}
                  className="h-12 text-base pr-4 pl-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-red-500/30 focus-visible:border-red-500/50 rounded-xl"
                  autoComplete="current-password"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !loginLoading) handleLogin(); }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loginLoading || loginSuccess}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* رسالة الخطأ */}
            {loginError && (
              <div
                className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
                <p className="text-[12px] font-medium leading-relaxed" style={{ color: '#fca5a5' }}>
                  {loginError}
                </p>
              </div>
            )}

            {/* رسالة النجاح */}
            {loginSuccess && (
              <div
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
                <p className="text-[12px] font-bold" style={{ color: '#86efac' }}>
                  تم تسجيل الدخول بنجاح ✓
                </p>
              </div>
            )}

            {/* الأزرار */}
            <div className="flex gap-3 pt-1">
              {/* إلغاء */}
              <Button
                variant="ghost"
                onClick={() => setShowModal(false)}
                disabled={loginLoading || loginSuccess}
                className="flex-1 h-12 rounded-xl font-bold text-white/60 border border-white/10 hover:bg-white/5"
              >
                إلغاء
              </Button>
              {/* تسجيل الدخول */}
              <button
                onClick={handleLogin}
                disabled={loginLoading || loginSuccess}
                className="flex-1 h-12 rounded-xl font-black text-white text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
                style={{
                  background: loginSuccess
                    ? 'linear-gradient(135deg, #16a34a, #15803d)'
                    : 'linear-gradient(135deg, #E60000, #b30000)',
                  boxShadow: loginSuccess
                    ? '0 4px 16px rgba(22,163,74,0.3)'
                    : '0 4px 16px rgba(230,0,0,0.3)',
                }}
              >
                {loginLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : loginSuccess ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {loginSuccess ? 'تم الدخول' : 'تسجيل الدخول'}
              </button>
            </div>

            {/* تنبيه الأمان */}
            <p className="text-[10px] text-white/25 text-center leading-relaxed">
              🔒 بياناتك محمية — لا تُرسل كلمة المرور أو Token للمتصفح
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
