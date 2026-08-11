/**
 * VodafoneOffersPage — عروض واشتراكات فودافون
 * PHASE 1 + PHASE 2: تسجيل الدخول + الاشتراكات القادمة + إلغاء الاشتراك
 * Token يُحفظ ويُستخدم Server-Side فقط — لا يصل للـ Frontend أبداً
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, LogIn, Eye, EyeOff, Loader2, CheckCircle2,
  Tag, LogOut, ShieldCheck, AlertCircle, PhoneCall,
  RefreshCw, PackageX, Banknote, ListChecks, XCircle,
  TriangleAlert,
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
import {
  anaVodafoneLogin,
  getAnaVodafoneSession,
  anaVodafoneLogout,
  getUpcomingSubscriptions,
  cancelVodafoneSubscription,
  chargeVodafoneSubscription,
  getVodafoneChargeEnabled,
  type AnaVodafoneSession,
  type VodafoneSubscription,
  type ChargeBreakdown,
} from '@/lib/api';

// ── مساعدات ─────────────────────────────────────────────────────
function formatPhone(phone: string): string {
  return phone.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
}

function formatExpiry(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleString('ar-EG', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return isoDate; }
}

function getStatusMeta(status: string) {
  const s = (status ?? '').toLowerCase();
  if (s === 'active' || s === 'مفعلة')
    return { label: 'مفعّلة',        color: '#4ade80', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.25)' };
  if (s === 'inactive' || s === 'غير مفعلة')
    return { label: 'غير مفعّلة',    color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.2)' };
  if (s === 'pending')
    return { label: 'قيد الانتظار', color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',   border: 'rgba(251,191,36,0.25)' };
  return   { label: status || 'غير محدد', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' };
}

// ── بطاقة اشتراك واحد ────────────────────────────────────────────
function SubscriptionCard({
  sub, onCancel, onCharge, cancellingId, chargingId, chargeEnabled,
}: {
  sub: VodafoneSubscription;
  onCancel: (sub: VodafoneSubscription) => void;
  onCharge: (sub: VodafoneSubscription) => void;
  cancellingId: string | null;
  chargingId: string | null;
  chargeEnabled: boolean;
}) {
  const isCancelling = cancellingId === sub.id;
  const isCharging   = chargingId === sub.id;
  const st = getStatusMeta(sub.status);
  const displayName = sub.description || sub.type || 'باقة';
  const canCancel = !!sub.id && !!sub.enc_product_id;
  const canCharge = canCancel && sub.price && chargeEnabled;

  return (
    <div
      className="rounded-[18px] overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* رأس */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.25)' }}
          >
            <ListChecks className="w-4 h-4" style={{ color: '#ff6b6b' }} />
          </div>
          <p className="text-[13px] font-black text-white truncate">{displayName}</p>
        </div>
        <span
          className="text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 mr-2"
          style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}
        >
          {st.label}
        </span>
      </div>

      {/* تفاصيل */}
      <div className="px-4 py-3 space-y-2">
        {sub.price && (
          <div className="flex items-center gap-2">
            <Banknote className="w-3.5 h-3.5 shrink-0 text-white/40" />
            <span className="text-[11px] text-white/45">السعر:</span>
            <span className="text-[12px] font-black text-white/90">{sub.price} جنيه</span>
          </div>
        )}
        {sub.type && sub.description && sub.type !== sub.description && (
          <div className="flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 shrink-0 text-white/40" />
            <span className="text-[11px] text-white/45">النوع:</span>
            <span className="text-[11px] text-white/70 truncate">{sub.type}</span>
          </div>
        )}
      </div>

      {/* الأزرار */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        {canCharge && (
          <button
            onClick={() => onCharge(sub)}
            disabled={isCharging || !!chargingId}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.2)',
              color: '#4ade80',
            }}
          >
            {isCharging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Banknote className="w-3.5 h-3.5" />}
            {isCharging ? 'جاري الشحن...' : 'شحن'}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancel(sub)}
            disabled={isCancelling || !!cancellingId}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171',
            }}
          >
            {isCancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            {isCancelling ? 'جاري الإلغاء...' : 'إلغاء الاشتراك'}
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ══════════════════════════════════════════════════════════════════
export default function VodafoneOffersPage() {
  const navigate = useNavigate();

  const [session, setSession]             = useState<AnaVodafoneSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [showModal, setShowModal]         = useState(false);
  const [phone, setPhone]                 = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [loginLoading, setLoginLoading]   = useState(false);
  const [loginError, setLoginError]       = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess]   = useState(false);

  const [logoutLoading, setLogoutLoading] = useState(false);

  const [subscriptions, setSubscriptions] = useState<VodafoneSubscription[]>([]);
  const [subsLoading, setSubsLoading]     = useState(false);
  const [subsError, setSubsError]         = useState<string | null>(null);
  const [subsCode, setSubsCode]           = useState<string | null>(null);

  const [confirmSub, setConfirmSub]       = useState<VodafoneSubscription | null>(null);
  const [cancellingId, setCancellingId]   = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [cancelError, setCancelError]     = useState<string | null>(null);

  // ── الشحن ──
  const [chargeEnabled, setChargeEnabled] = useState(false);
  const [chargeSub, setChargeSub]         = useState<VodafoneSubscription | null>(null);
  const [chargeBreakdown, setChargeBreakdown] = useState<ChargeBreakdown | null>(null);
  const [chargingId, setChargingId]     = useState<string | null>(null);
  const [chargeSuccess, setChargeSuccess] = useState<string | null>(null);
  const [chargeError, setChargeError]     = useState<string | null>(null);
  const [chargeShowConfirm, setChargeShowConfirm] = useState(false);

  // ── جلب الجلسة ──
  async function loadSession(): Promise<AnaVodafoneSession | null> {
    setSessionLoading(true);
    const s = await getAnaVodafoneSession();
    setSession(s);
    setSessionLoading(false);
    return s;
  }

  // ── جلب الاشتراكات ──
  const loadSubscriptions = useCallback(async (clearMessages = true) => {
    setSubsLoading(true);
    setSubsError(null);
    setSubsCode(null);
    // مسح رسائل الإلغاء عند كل تحديث؛ رسائل الشحن تُمسح فقط عند طلب صريح
    if (clearMessages) {
      setCancelSuccess(null);
      setCancelError(null);
    }
    const [result, enabled] = await Promise.all([
      getUpcomingSubscriptions(),
      getVodafoneChargeEnabled(),
    ]);
    setChargeEnabled(enabled);
    setSubsLoading(false);
    if (!result.success) {
      setSubsError(result.error ?? 'فشل جلب الاشتراكات');
      setSubsCode(result.code ?? null);
      return;
    }
    setSubscriptions(result.subscriptions ?? []);
  }, []);

  useEffect(() => {
    loadSession().then((s) => { if (s?.is_valid) loadSubscriptions(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openModal() {
    setPhone(''); setPassword(''); setShowPassword(false);
    setLoginError(null); setLoginSuccess(false);
    setShowModal(true);
  }

  async function handleLogin() {
    setLoginError(null);
    const p = phone.trim();
    if (!p || !password) { setLoginError('يرجى إدخال رقم الهاتف وكلمة المرور'); return; }
    if (!p.startsWith('01') || p.length !== 11) { setLoginError('رقم الهاتف غير صحيح — 11 رقم يبدأ بـ 01'); return; }
    setLoginLoading(true);
    const result = await anaVodafoneLogin(p, password);
    setLoginLoading(false);
    if (!result.success) { setLoginError(result.error ?? 'فشل تسجيل الدخول'); return; }
    setLoginSuccess(true);
    setTimeout(async () => {
      setShowModal(false);
      setLoginSuccess(false);
      const s = await loadSession();
      if (s?.is_valid) loadSubscriptions();
    }, 1200);
  }

  async function handleLogout() {
    setLogoutLoading(true);
    await anaVodafoneLogout();
    setSession(null);
    setSubscriptions([]);
    setSubsError(null);
    setLogoutLoading(false);
  }

  async function handleCancelConfirm() {
    if (!confirmSub?.id || !confirmSub?.enc_product_id) return;
    const { id, enc_product_id } = confirmSub;
    setConfirmSub(null);
    setCancellingId(id);
    setCancelSuccess(null);
    setCancelError(null);
    const result = await cancelVodafoneSubscription(id, enc_product_id);
    setCancellingId(null);
    if (!result.success) {
      setCancelError(result.error ?? 'فشل إلغاء الاشتراك');
      if (result.code === 'SESSION_EXPIRED') await loadSession();
      return;
    }
    setCancelSuccess('تم إلغاء الاشتراك بنجاح ✓');
    await loadSubscriptions(false); // لا تمسح رسالة النجاح الآن
  }

  // ── ملاحظات الشحن ──
  function openChargeModal(sub: VodafoneSubscription) {
    if (!sub.price || !sub.enc_product_id || !sub.id) return;
    const base = parseFloat(sub.price);
    const tax  = parseFloat((base * 0.43).toFixed(2));
    const total = parseFloat((base + tax).toFixed(2));
    setChargeSub(sub);
    setChargeBreakdown({ base_price: base, tax_rate: 0.43, tax_amount: tax, total });
    setChargeError(null);
    setChargeSuccess(null);
    setChargeShowConfirm(true);
  }

  function closeChargeModal() {
    if (chargingId) return; // منع الإغلاق أثناء الشحن
    setChargeSub(null);
    setChargeBreakdown(null);
    setChargeShowConfirm(false);
  }

  async function handleChargeConfirm() {
    if (!chargeSub?.id || !chargeSub?.enc_product_id || !chargeBreakdown) return;
    // منع التكرار: ضبط chargingId قبل إغلاق الـ Dialog
    const subId = chargeSub.id;
    const encId = chargeSub.enc_product_id;
    const desc  = chargeSub.description || chargeSub.type || 'باقة';
    const price = chargeSub.price || '0';
    const operationId = crypto.randomUUID();

    setChargingId(subId); // ← أولًا (يمنع أي نقر مكرر على الفور)
    setChargeShowConfirm(false);
    setChargeSuccess(null);
    setChargeError(null);

    const result = await chargeVodafoneSubscription(subId, encId, desc, price, operationId);

    setChargingId(null);
    if (!result.success) {
      setChargeError(result.error ?? 'فشل في عملية الشحن');
      if (result.code === 'SESSION_EXPIRED') await loadSession();
      return;
    }
    setChargeSuccess(result.message ?? 'تم احتساب مبلغ الشحن بنجاح ✓');
    await loadSubscriptions(false); // لا تمسح رسالة النجاح الآن
  }

  const totalPrice = subscriptions
    .filter((s) => s.price != null)
    .reduce((acc, s) => acc + parseFloat(s.price ?? '0'), 0);
  const hasPrices = subscriptions.some((s) => s.price != null);

  return (
    <div
      className="min-h-screen pb-28 flex flex-col"
      dir="rtl"
      style={{ background: 'linear-gradient(180deg,#080d14 0%,#0a0a12 100%)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3 py-4">
          <button onClick={() => navigate('/services')}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all"
            aria-label="رجوع">
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-white leading-tight">عروض واشتراكات فودافون</h1>
            <p className="text-[10px] text-muted-foreground">أنا فودافون</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(230,0,0,0.15)', color: '#ff6b6b', border: '1px solid rgba(230,0,0,0.3)' }}>
            <Tag className="w-3 h-3" />عروض
          </div>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-5">

        {/* بطاقة تعريفية */}
        <div className="relative rounded-[22px] overflow-hidden p-5"
          style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.18),rgba(8,13,20,0.9))', border: '1px solid rgba(230,0,0,0.2)' }}>
          <div className="absolute inset-0 opacity-30 pointer-events-none"
            style={{ background: 'radial-gradient(circle at 20% 50%,rgba(230,0,0,0.3) 0%,transparent 60%)' }} />
          <div className="relative z-10 flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(230,0,0,0.2)', border: '1px solid rgba(230,0,0,0.35)' }}>
              <Tag className="w-5 h-5" style={{ color: '#ff6b6b' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-white mb-1">عروض واشتراكات فودافون</h2>
              <p className="text-[12px] text-white/55 leading-relaxed">
                قسم مخصص لعرض وإدارة عروض واشتراكات أنا فودافون مباشرةً من التطبيق.
                {!session?.is_valid && ' سجّل دخولك للوصول إلى اشتراكاتك.'}
              </p>
            </div>
          </div>
        </div>

        {/* محتوى رئيسي */}
        {sessionLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>

        ) : session?.is_valid ? (
          <>
            {/* ── بطاقة الجلسة ── */}
            <div className="rounded-[22px] overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-3 px-4 py-3"
                style={{ background: 'rgba(34,197,94,0.1)', borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
                <span className="text-sm font-black" style={{ color: '#4ade80' }}>تم تسجيل الدخول</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <PhoneCall className="w-4 h-4 text-white/70" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 mb-0.5">رقم الهاتف المسجّل</p>
                    <p className="text-sm font-black text-white font-mono tracking-wide">{formatPhone(session.phone)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <ShieldCheck className="w-4 h-4 text-white/70" />
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 mb-0.5">صلاحية الجلسة حتى</p>
                    <p className="text-[12px] font-bold text-white/80">{formatExpiry(session.expires_at)}</p>
                  </div>
                </div>
              </div>
              <div className="px-4 pb-4">
                <button onClick={handleLogout} disabled={logoutLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  {logoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  تسجيل الخروج
                </button>
              </div>
            </div>

            {/* ── قسم الاشتراكات القادمة ── */}
            <div>
              {/* عنوان + تحديث */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 rounded-full" style={{ background: '#E60000' }} />
                  <h3 className="text-sm font-black text-white">الاشتراكات القادمة</h3>
                  {!subsLoading && subscriptions.length > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(230,0,0,0.15)', color: '#ff6b6b', border: '1px solid rgba(230,0,0,0.25)' }}>
                      {subscriptions.length}
                    </span>
                  )}
                </div>
                <button onClick={() => loadSubscriptions()} disabled={subsLoading || !!cancellingId}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-white/50 hover:text-white/80 transition-colors disabled:opacity-40">
                  <RefreshCw className={`w-3.5 h-3.5 ${subsLoading ? 'animate-spin' : ''}`} />
                  تحديث
                </button>
              </div>

              {/* رسالة نجاح الإلغاء */}
              {cancelSuccess && (
                <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 mb-3"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
                  <p className="text-[12px] font-bold" style={{ color: '#86efac' }}>{cancelSuccess}</p>
                </div>
              )}

              {/* رسالة خطأ الإلغاء */}
              {cancelError && (
                <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 mb-3"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
                  <p className="text-[12px] font-medium" style={{ color: '#fca5a5' }}>{cancelError}</p>
                </div>
              )}

              {/* رسالة نجاح الشحن */}
              {chargeSuccess && (
                <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 mb-3"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
                  <p className="text-[12px] font-bold" style={{ color: '#86efac' }}>{chargeSuccess}</p>
                </div>
              )}

              {/* رسالة خطأ الشحن */}
              {chargeError && (
                <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 mb-3"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
                  <p className="text-[12px] font-medium" style={{ color: '#fca5a5' }}>{chargeError}</p>
                </div>
              )}

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
                    onClick={subsCode === 'SESSION_EXPIRED' ? openModal : () => loadSubscriptions()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-black text-white active:scale-[0.97] transition-all"
                    style={{ background: 'linear-gradient(135deg,#E60000,#b30000)' }}>
                    {subsCode === 'SESSION_EXPIRED'
                      ? <><LogIn className="w-4 h-4" /> تسجيل الدخول مجدداً</>
                      : <><RefreshCw className="w-4 h-4" /> إعادة المحاولة</>}
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
                    <SubscriptionCard
                      key={sub.id || sub.type}
                      sub={sub}
                      onCancel={setConfirmSub}
                      onCharge={openChargeModal}
                      cancellingId={cancellingId}
                      chargingId={chargingId}
                      chargeEnabled={chargeEnabled}
                    />
                  ))}

                  {/* ملخص مالي */}
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
          <div className="rounded-[22px] overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex flex-col items-center gap-4 px-6 py-10">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.25)' }}>
                <LogIn className="w-7 h-7" style={{ color: '#ff6b6b' }} />
              </div>
              <div className="text-center">
                <h3 className="text-base font-black text-white mb-1">سجّل دخولك</h3>
                <p className="text-[12px] text-white/45 leading-relaxed max-w-[260px]">
                  سجّل دخولك بحساب أنا فودافون للوصول إلى اشتراكاتك وعروضك الشخصية.
                </p>
              </div>
              <button onClick={openModal}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm text-white active:scale-[0.97] transition-all"
                style={{ background: 'linear-gradient(135deg,#E60000,#b30000)', boxShadow: '0 4px 20px rgba(230,0,0,0.35)' }}>
                <LogIn className="w-4 h-4" />
                تسجيل الدخول
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal تسجيل الدخول */}
      <Dialog open={showModal} onOpenChange={(o) => { if (!loginLoading) setShowModal(o); }}>
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
                value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g,'').slice(0,11)); setLoginError(null); }}
                disabled={loginLoading || loginSuccess} maxLength={11}
                className="h-12 text-base font-mono tracking-wider text-right bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-red-500/30 focus-visible:border-red-500/50 rounded-xl px-4"
                autoComplete="tel" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-bold text-white/70">كلمة مرور «أنا فودافون»</Label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                  value={password} onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
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
              <Button variant="ghost" onClick={() => setShowModal(false)} disabled={loginLoading || loginSuccess}
                className="flex-1 h-12 rounded-xl font-bold text-white/60 border border-white/10 hover:bg-white/5">
                إلغاء
              </Button>
              <button onClick={handleLogin} disabled={loginLoading || loginSuccess}
                className="flex-1 h-12 rounded-xl font-black text-white text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
                style={{
                  background: loginSuccess ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#E60000,#b30000)',
                  boxShadow: loginSuccess ? '0 4px 16px rgba(22,163,74,0.3)' : '0 4px 16px rgba(230,0,0,0.3)',
                }}>
                {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                 loginSuccess  ? <CheckCircle2 className="w-4 h-4" />     : <LogIn className="w-4 h-4" />}
                {loginSuccess ? 'تم الدخول' : 'تسجيل الدخول'}
              </button>
            </div>
            <p className="text-[10px] text-white/25 text-center">
              🔒 بياناتك محمية — لا تُرسل كلمة المرور أو Token للمتصفح
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog تأكيد الشحن */}
      <Dialog open={chargeShowConfirm} onOpenChange={(o) => { if (!o) closeChargeModal(); }}>
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
            {/* بيانات الباقة */}
            <div className="rounded-xl p-3.5 space-y-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/50">الباقة / العرض</span>
                <span className="text-[12px] font-black text-white text-right truncate flex-1">
                  {chargeSub?.description || chargeSub?.type || 'باقة'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/50">الخط</span>
                <span className="text-[12px] font-black text-white/90 text-left" dir="ltr">
                  {session?.phone ? formatPhone(session.phone) : '—'}
                </span>
              </div>
            </div>

            {/* تفاصيل المبالغ */}
            {chargeBreakdown && (
              <div className="rounded-xl p-3.5 space-y-2"
                style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-white/50">السعر الأساسي</span>
                  <span className="text-[12px] font-black text-white">{chargeBreakdown.base_price.toFixed(2)} ج.م</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-white/50">الضريبة ({(chargeBreakdown.tax_rate * 100).toFixed(0)}%)</span>
                  <span className="text-[12px] font-black text-white/70">{chargeBreakdown.tax_amount.toFixed(2)} ج.م</span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1.5"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-[12px] font-bold text-white/80">الإجمالي النهائي</span>
                  <span className="text-base font-black" style={{ color: '#4ade80' }}>{chargeBreakdown.total.toFixed(2)} ج.م</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="ghost" onClick={closeChargeModal} disabled={!!chargingId}
                className="flex-1 h-12 rounded-xl font-bold text-white/60 border border-white/10 hover:bg-white/5">
                تراجع
              </Button>
              <button onClick={handleChargeConfirm} disabled={!!chargingId}
                className="flex-1 h-12 rounded-xl font-black text-white text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', boxShadow: '0 4px 16px rgba(22,163,74,0.3)' }}>
                {chargingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                تأكيد الشحن
              </button>
            </div>
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
              <span className="font-black text-white/80 mx-1">
                «{confirmSub?.description || confirmSub?.type || 'هذا الاشتراك'}»
              </span>؟
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
    </div>
  );
}
