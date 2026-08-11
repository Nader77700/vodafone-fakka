import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogIn, Loader2, CheckCircle2, Eye, EyeOff, PhoneCall, RefreshCw,
  PackageX, AlertCircle, TriangleAlert, Banknote, XCircle, LogOut,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import VodafoneOffersShell from './VodafoneOffersShell';
import UpcomingSubscriptionCard from './UpcomingSubscriptionCard';
import { useAnaVodafoneSession } from './useAnaVodafoneSession';
import { useUpcomingSubscriptions } from './useUpcomingSubscriptions';
import type { VodafoneSubscription } from '@/lib/api';

function formatPhone(phone: string): string {
  return phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
}

export default function UpcomingSubscriptionsPage() {
  const navigate = useNavigate();
  const {
    session, loading: sessionLoading, loginLoading, loginError, loginSuccess,
    logoutLoading, login, logout, refresh, clearLoginError,
  } = useAnaVodafoneSession();

  const {
    subscriptions, loading: subsLoading, error: subsError, code: subsCode,
    chargeEnabled, cancellingId, chargingId, cancelSuccess, cancelError,
    chargeSuccess, chargeError, load, cancel, charge,
    clearCancelError, clearCancelSuccess, clearChargeError, clearChargeSuccess,
  } = useUpcomingSubscriptions();

  const [showLogin, setShowLogin] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [confirmSub, setConfirmSub] = useState<VodafoneSubscription | null>(null);
  const [chargeSub, setChargeSub] = useState<VodafoneSubscription | null>(null);

  const totalPrice = subscriptions
    .filter((s) => s.price != null)
    .reduce((acc, s) => acc + parseFloat(s.price ?? '0'), 0);
  const hasPrices = subscriptions.some((s) => s.price != null);

  async function handleLogin() {
    const p = phone.trim();
    if (!p || !password) { clearLoginError(); setTimeout(() => alert('يرجى إدخال رقم الهاتف وكلمة المرور'), 0); return; }
    if (!p.startsWith('01') || p.length !== 11) { clearLoginError(); setTimeout(() => alert('رقم الهاتف غير صحيح — 11 رقم يبدأ بـ 01'), 0); return; }
    const ok = await login(p, password);
    if (ok) {
      setTimeout(() => {
        setShowLogin(false);
        load();
      }, 1300);
    }
  }

  function handleCancel(sub: VodafoneSubscription) {
    setConfirmSub(sub);
  }

  async function handleCancelConfirm() {
    if (!confirmSub) return;
    const sub = confirmSub;
    setConfirmSub(null);
    await cancel(sub);
  }

  function handleCharge(sub: VodafoneSubscription) {
    setChargeSub(sub);
  }

  async function handleChargeConfirm() {
    if (!chargeSub) return;
    const sub = chargeSub;
    setChargeSub(null);
    const base = parseFloat(sub.price ?? '0');
    const tax = parseFloat((base * 0.43).toFixed(2));
    const total = parseFloat((base + tax).toFixed(2));
    await charge(sub, { base_price: base, tax_rate: 0.43, tax_amount: tax, total });
  }

  return (
    <VodafoneOffersShell title="الاشتراكات القادمة" subtitle="إدارة اشتراكات أنا فودافون">
      <div className="space-y-4">
        {/* رسائل الحالة */}
        {cancelSuccess && (
          <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
            <p className="text-[12px] font-bold" style={{ color: '#86efac' }}>{cancelSuccess}</p>
            <button onClick={clearCancelSuccess} className="text-[10px] text-white/50 mr-auto">إغلاق</button>
          </div>
        )}
        {cancelError && (
          <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
            <p className="text-[12px] font-medium" style={{ color: '#fca5a5' }}>{cancelError}</p>
            <button onClick={clearCancelError} className="text-[10px] text-white/50 mr-auto">إغلاق</button>
          </div>
        )}
        {chargeSuccess && (
          <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
            <p className="text-[12px] font-bold" style={{ color: '#86efac' }}>{chargeSuccess}</p>
            <button onClick={clearChargeSuccess} className="text-[10px] text-white/50 mr-auto">إغلاق</button>
          </div>
        )}
        {chargeError && (
          <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
            <p className="text-[12px] font-medium" style={{ color: '#fca5a5' }}>{chargeError}</p>
            <button onClick={clearChargeError} className="text-[10px] text-white/50 mr-auto">إغلاق</button>
          </div>
        )}

        {sessionLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>
        ) : session?.is_valid ? (
          <>
            {/* بطاقة الجلسة */}
            <div className="rounded-[20px] overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2.5 px-4 py-2.5"
                style={{ background: 'rgba(34,197,94,0.1)', borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#4ade80' }} />
                <span className="text-xs font-black" style={{ color: '#4ade80' }}>تم تسجيل الدخول</span>
              </div>
              <div className="p-3.5 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <PhoneCall className="w-3.5 h-3.5 text-white/70" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-white/40 mb-0.5">رقم الهاتف المسجّل</p>
                    <p className="text-sm font-black text-white font-mono tracking-wide truncate">{formatPhone(session.phone)}</p>
                  </div>
                </div>
              </div>
              <div className="px-3.5 pb-3.5">
                <button onClick={logout} disabled={logoutLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  {logoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  تسجيل الخروج
                </button>
              </div>
            </div>

            {/* الاشتراكات */}
            <div>
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#E60000' }} />
                  <h3 className="text-sm font-black text-white truncate">الاشتراكات القادمة</h3>
                  {!subsLoading && subscriptions.length > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: 'rgba(230,0,0,0.15)', color: '#ff6b6b', border: '1px solid rgba(230,0,0,0.25)' }}>
                      {subscriptions.length}
                    </span>
                  )}
                </div>
                <button onClick={() => load()} disabled={subsLoading || !!cancellingId}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-white/50 hover:text-white/80 transition-colors disabled:opacity-40 shrink-0">
                  <RefreshCw className={`w-3.5 h-3.5 ${subsLoading ? 'animate-spin' : ''}`} />
                  تحديث
                </button>
              </div>

              {subsLoading ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-[18px]"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Loader2 className="w-6 h-6 animate-spin text-white/40" />
                  <p className="text-[12px] text-white/35">جاري جلب الاشتراكات...</p>
                </div>
              ) : subsError ? (
                <div className="flex flex-col items-center gap-4 py-12 px-5 rounded-[18px]"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <TriangleAlert className="w-5 h-5" style={{ color: '#f87171' }} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black text-white/90 mb-1">
                      {subsCode === 'SESSION_EXPIRED' ? 'انتهت صلاحية الجلسة' : 'فشل جلب الاشتراكات'}
                    </p>
                    <p className="text-[12px] text-white/45 leading-relaxed max-w-[260px]">{subsError}</p>
                  </div>
                  <button
                    onClick={subsCode === 'SESSION_EXPIRED' ? () => setShowLogin(true) : () => load()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-black text-white active:scale-[0.97] transition-all bg-primary hover:bg-primary/90">
                    {subsCode === 'SESSION_EXPIRED' ? <><LogIn className="w-4 h-4" /> تسجيل الدخول مجدداً</> : <><RefreshCw className="w-4 h-4" /> إعادة المحاولة</>}
                  </button>
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-14 rounded-[18px]"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <PackageX className="w-6 h-6 text-white/30" />
                  </div>
                  <div className="text-center px-4">
                    <p className="text-sm font-black text-white/60 mb-1">لا توجد اشتراكات قادمة</p>
                    <p className="text-[11px] text-white/30 leading-relaxed">لا توجد اشتراكات قادمة مرتبطة بهذا الرقم حالياً</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {subscriptions.map((sub) => (
                    <UpcomingSubscriptionCard
                      key={sub.id || sub.type}
                      sub={sub}
                      onCancel={handleCancel}
                      onCharge={handleCharge}
                      cancellingId={cancellingId}
                      chargingId={chargingId}
                      chargeEnabled={chargeEnabled}
                    />
                  ))}
                  {hasPrices && (
                    <div className="rounded-[18px] px-4 py-4 flex items-center justify-between"
                      style={{ background: 'rgba(230,0,0,0.07)', border: '1px solid rgba(230,0,0,0.15)' }}>
                      <div className="flex items-center gap-2">
                        <Banknote className="w-4 h-4" style={{ color: '#ff6b6b' }} />
                        <span className="text-[12px] font-bold text-white/60">إجمالي الاشتراكات</span>
                      </div>
                      <span className="text-base font-black text-white">
                        {totalPrice.toFixed(2)} <span className="text-[11px] text-white/50">جنيه</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* غير مسجّل الدخول */
          <div className="rounded-[20px] overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex flex-col items-center gap-4 px-5 py-8">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.25)' }}>
                <LogIn className="w-6 h-6" style={{ color: '#ff6b6b' }} />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-black text-white mb-1">سجّل دخولك</h3>
                <p className="text-[11px] text-white/45 leading-relaxed max-w-[240px] mx-auto">
                  سجّل دخولك بحساب أنا فودافون للوصول إلى اشتراكاتك وعروضك الشخصية.
                </p>
              </div>
              <button onClick={() => setShowLogin(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm text-white active:scale-[0.97] transition-all bg-primary hover:bg-primary/90">
                <LogIn className="w-4 h-4" />
                تسجيل الدخول
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog تسجيل الدخول */}
      <Dialog open={showLogin} onOpenChange={(o) => { if (!loginLoading) setShowLogin(o); }}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] md:max-w-lg rounded-[24px] p-0 overflow-hidden"
          dir="rtl"
          style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <DialogHeader className="px-5 pt-5 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(230,0,0,0.18)', border: '1px solid rgba(230,0,0,0.3)' }}>
                <LogIn className="w-4 h-4" style={{ color: '#ff6b6b' }} />
              </div>
              <DialogTitle className="text-base font-black text-white">تسجيل الدخول — أنا فودافون</DialogTitle>
            </div>
          </DialogHeader>
          <div className="px-5 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-bold text-white/70">رقم الموبايل</Label>
              <Input type="tel" inputMode="numeric" placeholder="01XXXXXXXXX"
                value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g,'').slice(0,11)); clearLoginError(); }}
                disabled={loginLoading || loginSuccess} maxLength={11}
                className="h-12 text-base font-mono tracking-wider text-right bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-red-500/30 focus-visible:border-red-500/50 rounded-xl px-4"
                autoComplete="tel" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-bold text-white/70">كلمة مرور «أنا فودافون»</Label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                  value={password} onChange={(e) => { setPassword(e.target.value); clearLoginError(); }}
                  disabled={loginLoading || loginSuccess}
                  className="h-12 text-base pr-4 pl-12 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-red-500/30 focus-visible:border-red-500/50 rounded-xl"
                  autoComplete="current-password"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !loginLoading) handleLogin(); }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  disabled={loginLoading || loginSuccess}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                  tabIndex={-1} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {loginError && (
              <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
                <p className="text-[12px] font-medium leading-relaxed" style={{ color: '#fca5a5' }}>{loginError}</p>
              </div>
            )}
            {loginSuccess && (
              <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
                <p className="text-[12px] font-bold" style={{ color: '#86efac' }}>تم تسجيل الدخول بنجاح ✓</p>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="ghost" onClick={() => setShowLogin(false)} disabled={loginLoading || loginSuccess}
                className="flex-1 h-12 rounded-xl font-bold text-white/60 border border-white/10 hover:bg-white/5">
                إلغاء
              </Button>
              <button onClick={handleLogin} disabled={loginLoading || loginSuccess}
                className="flex-1 h-12 rounded-xl font-black text-white text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
                style={{ background: loginSuccess ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#E60000,#b30000)' }}>
                {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                 loginSuccess ? <CheckCircle2 className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                {loginSuccess ? 'تم الدخول' : 'تسجيل الدخول'}
              </button>
            </div>
            <p className="text-[10px] text-white/25 text-center">
              بياناتك محمية — لا تُرسل كلمة المرور أو Token للمتصفح
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* AlertDialog تأكيد إلغاء الاشتراك */}
      <AlertDialog open={!!confirmSub} onOpenChange={(o) => { if (!o) setConfirmSub(null); }}>
        <AlertDialogContent
          className="max-w-[calc(100%-2rem)] md:max-w-lg rounded-[24px]"
          dir="rtl"
          style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <TriangleAlert className="w-5 h-5" style={{ color: '#f87171' }} />
              </div>
              <AlertDialogTitle className="text-base font-black text-white">تأكيد إلغاء الاشتراك</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-[13px] text-white/55 leading-relaxed">
              هل أنت متأكد من إلغاء اشتراك
              <span className="font-black text-white/80 mx-1">«{confirmSub?.description || confirmSub?.type || 'هذا الاشتراك'}»</span>؟
              لا يمكن التراجع عن هذه العملية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 flex-row-reverse sm:flex-row-reverse">
            <AlertDialogCancel className="flex-1 h-11 rounded-xl font-bold border-white/10 bg-white/5 text-white/70 hover:bg-white/10">
              تراجع
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm}
              className="flex-1 h-11 rounded-xl font-black text-white border-0"
              style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}>
              نعم، إلغاء الاشتراك
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog تأكيد الشحن */}
      <Dialog open={!!chargeSub} onOpenChange={(o) => { if (!o) setChargeSub(null); }}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] md:max-w-lg rounded-[24px] p-0 overflow-hidden"
          dir="rtl"
          style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <DialogHeader className="px-5 pt-5 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                <Banknote className="w-4 h-4" style={{ color: '#4ade80' }} />
              </div>
              <DialogTitle className="text-base font-black text-white">تأكيد الشحن</DialogTitle>
            </div>
          </DialogHeader>
          <div className="px-5 py-5 space-y-4">
            <div className="rounded-xl p-3.5 space-y-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/50">الباقة / العرض</span>
                <span className="text-[12px] font-black text-white text-right truncate flex-1">
                  {chargeSub?.description || chargeSub?.type || 'باقة'}
                </span>
              </div>
            </div>
            <div className="rounded-xl p-3.5 space-y-2"
              style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/50">السعر الأساسي</span>
                <span className="text-[12px] font-black text-white">{parseFloat(chargeSub?.price || '0').toFixed(2)} ج.م</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/50">الضريبة (43%)</span>
                <span className="text-[12px] font-black text-white/70">{(parseFloat(chargeSub?.price || '0') * 0.43).toFixed(2)} ج.م</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1.5"
                style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-[12px] font-bold text-white/80">الإجمالي النهائي</span>
                <span className="text-base font-black" style={{ color: '#4ade80' }}>
                  {(parseFloat(chargeSub?.price || '0') * 1.43).toFixed(2)} ج.م
                </span>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="ghost" onClick={() => setChargeSub(null)} disabled={!!chargingId}
                className="flex-1 h-12 rounded-xl font-bold text-white/60 border border-white/10 hover:bg-white/5">
                تراجع
              </Button>
              <button onClick={handleChargeConfirm} disabled={!!chargingId}
                className="flex-1 h-12 rounded-xl font-black text-white text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
                {chargingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                تأكيد الشحن
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </VodafoneOffersShell>
  );
}
