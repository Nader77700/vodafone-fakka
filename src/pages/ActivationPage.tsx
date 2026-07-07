import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  activateLicenseKey, getUserSubscription, calcTimeRemaining, getTrialUsageForUser,
  confirmGiftClaim,
} from '@/lib/api';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';
import DeviceBlockedModal from '@/components/subscription/DeviceBlockedModal';
import type { Subscription } from '@/types/types';
import { toast } from 'sonner';
import { Key, CheckCircle, Calendar, Clock, Shield, AlertTriangle, Zap, X, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import WelcomeGiftBox from '@/components/subscription/WelcomeGiftBox';
import { MyGiftsSection } from '@/components/subscription/WelcomeGiftBox';

const WA_NUMBER = '201222692182';
// الرسالة الافتراضية — ستُستبدل ديناميكياً عند وجود profile
const WA_MSG_SUBSCRIBE_DEFAULT = encodeURIComponent(
  'أرغب في الحصول على اشتراك Vodafone Fakka Premium.\nبرجاء إرسال تفاصيل التفعيل.'
);
const WA_LINK_SUBSCRIBE = `https://wa.me/${WA_NUMBER}?text=${WA_MSG_SUBSCRIBE_DEFAULT}`;

/* ── أيقونة واتساب SVG ── */
function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function WhatsAppButton({ label = 'تواصل للحصول على كود التفعيل', href = WA_LINK_SUBSCRIBE }: { label?: string; href?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 w-full h-11 rounded-lg font-semibold text-sm border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-all"
    >
      <WaIcon />
      {label}
    </a>
  );
}

/* ── مودال الحد الأقصى للمستخدمين ── */
function InvalidCodeDialog({ open, errorCode, errorMsg, onClose }: {
  open: boolean; errorCode: string; errorMsg: string; onClose: () => void;
}) {
  const reasons: Record<string, { icon: string; title: string; hint: string }> = {
    INVALID:           { icon: '❌', title: 'كود غير صحيح',          hint: 'تأكد من إدخال الكود بشكل صحيح دون مسافات زائدة' },
    DISABLED:          { icon: '🚫', title: 'الكود معطّل',           hint: 'هذا الكود تم تعطيله من قبل الإدارة' },
    EXPIRED:           { icon: '⏰', title: 'الكود منتهي الصلاحية',  hint: 'انتهت صلاحية هذا الكود ولا يمكن استخدامه' },
    USED:              { icon: '✔️',  title: 'الكود مستخدم مسبقاً',  hint: 'تم استخدام هذا الكود من قبل' },
    MAX_USERS:         { icon: '👥', title: 'وصل للحد الأقصى',       hint: 'تم الوصول للحد الأقصى من المستخدمين لهذا الكود' },
    MAX_USES_PER_USER: { icon: '🔢', title: 'تجاوزت حد الاستخدام',  hint: 'استنفذت الحد الأقصى من الاستخدامات لهذا الكود' },
    ALREADY_USED:      { icon: '🔄', title: 'مفعّل مسبقاً',         hint: 'سبق أن فعّلت هذا الكود على حسابك' },
  };
  const info = reasons[errorCode] ?? { icon: '⚠️', title: 'خطأ في التفعيل', hint: errorMsg };
  const waMsg = encodeURIComponent(`مرحباً، أواجه مشكلة في تفعيل الكود\nرمز الخطأ: ${errorCode}\n${errorMsg}`);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border text-center" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex flex-col items-center gap-3 pt-2">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 border-2 border-destructive/20 flex items-center justify-center text-3xl">
              {info.icon}
            </div>
            <span className="text-lg font-black">{info.title}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pb-2">
          <p className="text-sm text-muted-foreground text-pretty leading-relaxed">{info.hint}</p>
          <a
            href={`https://wa.me/${WA_NUMBER}?text=${waMsg}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full h-11 rounded-xl font-bold text-sm border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-all"
          >
            <WaIcon />
            تواصل عبر واتساب
          </a>
          <Button variant="outline" className="w-full border-border h-10" onClick={onClose}>
            <X className="w-4 h-4 ml-1.5" />
            حاول مجدداً
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ActivationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [checking, setChecking] = useState(true);
  const [trialInfo, setTrialInfo] = useState<{ opsUsed: number; maxOps: number } | null>(null);
  const [invalidOpen, setInvalidOpen] = useState(false);
  const [invalidError, setInvalidError] = useState<{ msg: string; code: string }>({ msg: '', code: '' });
  const [deviceBlockedOpen, setDeviceBlockedOpen] = useState(false);
  const [deviceBlockerUsername, setDeviceBlockerUsername] = useState('');
  // حماية من الضغط المتكرر — ref متزامن يُعيّن قبل أي await
  const activating = useRef(false);

  // سبب الوصول للصفحة
  const reason = (location.state as { reason?: string } | null)?.reason ?? null;

  useEffect(() => {
    if (!user) return;
    if (profile && (profile.role === 'admin' || profile.role === 'super_admin')) {
      navigate('/home', { replace: true }); return;
    }
    if (!profile) return;
    // مستخدم تابع لتاجر → يُوجَّه مباشرةً لـ /home بدون عرض شاشة التفعيل
    if (profile.merchant_id) {
      navigate('/home', { replace: true }); return;
    }
    Promise.all([getUserSubscription(user.id), getTrialUsageForUser(user.id)]).then(([sub, trial]) => {
      setSubscription(sub);
      if (trial) setTrialInfo({ opsUsed: trial.opsUsed, maxOps: trial.maxOps });
      setChecking(false);
      if (sub?.status === 'active' && reason !== 'trial_exhausted') navigate('/home', { replace: true });
    });
  }, [user, profile, navigate, reason]);

  const handleActivate = async () => {
    if (!code.trim() || !user) { toast.error('يرجى إدخال كود التفعيل'); return; }
    // منع التنفيذ المزدوج — ref متزامن يمنع أي ضغطات متراكمة
    if (activating.current) return;
    activating.current = true;
    setLoading(true);
    let result;
    try {
      const deviceFp = getDeviceFingerprint();
      result = await activateLicenseKey(user.id, code.trim().toUpperCase(), deviceFp);
    } catch {
      // أي خطأ شبكي = فشل فوري بلا إعادة محاولة
      setLoading(false);
      activating.current = false;
      toast.error('فشل الاتصال بالسيرفر — يرجى المحاولة مجدداً');
      return;
    }
    setLoading(false);
    activating.current = false; // السماح بمحاولة جديدة فقط بعد انتهاء هذه
    if (!result.success) {
      const errCode = result.errorCode ?? '';
      if (errCode === 'DEVICE_BLOCKED') {
        setDeviceBlockerUsername(result.blockerUsername ?? 'مستخدم آخر');
        setDeviceBlockedOpen(true);
      } else if (['MAX_USERS', 'MAX_USES_PER_USER', 'ALREADY_USED', 'USED', 'DISABLED', 'EXPIRED', 'INVALID'].includes(errCode)) {
        setInvalidError({ msg: result.error ?? 'الكود غير صالح أو منتهي الصلاحية', code: errCode });
        setInvalidOpen(true);
      } else {
        // عرض الخطأ الحقيقي دائماً — لا رسائل عامة
        const msg = result.error?.trim();
        toast.error(msg && msg.length > 0 ? msg : 'فشل التفعيل — يرجى المحاولة مجدداً');
      }
      return;
    }
    toast.success(result.isTrial ? 'تم تفعيل الكود التجريبي!' : 'تم تفعيل الاشتراك بنجاح!');
    // تحديث فوري — بدون Logout/Refresh ثم عرض شاشة البداية
    const [sub] = await Promise.all([
      getUserSubscription(user.id),
      refreshProfile(),
    ]);
    setSubscription(sub);
    setTimeout(() => navigate('/home', { replace: true }), 1000);
  };

  if (checking) {
    // شاشة تحميل Premium بدلاً من الشاشة السوداء
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 35%, #200000 0%, #0d0000 50%, #000000 100%)' }}>
        <div className="flex flex-col items-center gap-5">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 animate-ping"
              style={{ borderColor: 'rgba(230,0,0,0.2)', animationDuration: '1.5s' }} />
            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-primary/30"
              style={{ background: '#0d0000' }}>
              <img src="https://miaoda-conversation-file.s3cdn.medo.dev/user-bkii4kb9ihvk/app-ck2v94t1nev5/20260623/file_00000000191471f49ddde7c1651efc02.png"
                alt="VFP" className="w-full h-full object-contain p-1" />
            </div>
          </div>
          <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>جارٍ التحقق…</p>
        </div>
      </div>
    );
  }

  const isActivated = subscription?.status === 'active' && reason !== 'trial_exhausted';
  // PHASE 2: real countdown from expiry_date - now
  const countdown = subscription?.expires_at ? calcTimeRemaining(subscription.expires_at) : null;
  const isTrialExhausted = reason === 'trial_exhausted';
  const isExpired = reason === 'expired' || (subscription && subscription.status === 'expired');
  // مستخدم تابع لتاجر → لا نعرض تجربة مجانية أو هدايا
  const isMerchantClient = !!(profile?.merchant_id);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4" dir="rtl">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-primary/10 blur-[80px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm page-enter space-y-4">
        {/* ── شعار ── */}
        <div className="flex flex-col items-center mb-2">
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-3 ${
            isActivated ? 'bg-success/20 border-2 border-success/40' :
            isTrialExhausted ? 'bg-warning/20 border-2 border-warning/40' :
            isExpired ? 'bg-destructive/20 border-2 border-destructive/40' :
            'bg-primary/20 border-2 border-primary/30'
          }`}>
            {isActivated ? <CheckCircle className="w-10 h-10 text-success" />
              : isTrialExhausted ? <Zap className="w-10 h-10 text-warning" />
              : isExpired ? <AlertTriangle className="w-10 h-10 text-destructive" />
              : <Key className="w-10 h-10 text-primary" />}
          </div>
          <h1 className="text-2xl font-black gradient-text text-balance text-center">
            {isActivated ? 'الاشتراك نشط'
              : isTrialExhausted ? 'انتهت الحصة التجريبية'
              : isExpired ? 'انتهى اشتراكك'
              : !subscription ? 'الحساب غير مفعّل'
              : 'تفعيل الاشتراك'}
          </h1>
        </div>

        {/* ── بطاقة الحالة ── */}
        {(isTrialExhausted || isExpired || !subscription) && !isActivated && (
          <div className={`card-premium p-5 space-y-4 border ${
            isTrialExhausted ? 'border-warning/30 bg-warning/5'
            : isExpired ? 'border-destructive/30 bg-destructive/5'
            : 'border-border'
          }`}>
            <div className={`flex items-start gap-3 p-3 rounded-xl ${
              isTrialExhausted ? 'bg-warning/10' : isExpired ? 'bg-destructive/10' : 'bg-muted/30'
            }`}>
              {isTrialExhausted ? <Zap className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                : isExpired ? <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                : <Key className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
              <div className="space-y-0.5">
                <p className={`text-sm font-bold ${
                  isTrialExhausted ? 'text-warning' : isExpired ? 'text-destructive' : 'text-foreground'
                }`}>
                  {isTrialExhausted ? 'انتهت عملياتك التجريبية'
                    : isExpired ? 'انتهت صلاحية اشتراكك'
                    : 'حسابك غير مفعّل بعد'}
                </p>
                <p className="text-xs text-muted-foreground text-pretty">
                  {isTrialExhausted
                    ? `استخدمت ${trialInfo?.opsUsed ?? ''}/${trialInfo?.maxOps ?? ''} عمليات. فعّل اشتراكاً لمواصلة الشحن.`
                    : isExpired ? 'يرجى تجديد اشتراكك للاستمرار في استخدام المنصة.'
                    : 'أدخل كود التفعيل أو تواصل معنا للحصول على كود.'}
                </p>
              </div>
            </div>
            {isMerchantClient ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20">
                <Building2 className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs text-primary font-semibold">تواصل مع تاجرك لتجديد الاشتراك</p>
              </div>
            ) : (
              <WhatsAppButton label="تفعيل اشتراك مدفوع — واتساب" href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`أرغب في الحصول على اشتراك Vodafone Fakka Premium.\nاسم المستخدم: ${profile?.username ?? 'غير محدد'}\nرقم الهاتف: ${profile?.phone ?? 'غير محدد'}\nبرجاء إرسال تفاصيل التفعيل.`)}`} />
            )}
          </div>
        )}

        {/* ── صندوق الهدية الترحيبي — مخفي لمستخدمي التاجر ── */}
        {!isActivated && user && !isMerchantClient && (
          <WelcomeGiftBox userId={user.id} />
        )}

        {/* PHASE 5: هداياي — مخفي لمستخدمي التاجر */}
        {!isActivated && user && !isMerchantClient && (
          <div className="card-premium p-5">
            <MyGiftsSection userId={user.id} />
          </div>
        )}

        {/* ── نموذج التفعيل ── */}
        {!isActivated && (
          <div className="card-premium p-6 space-y-5">
            <p className="text-center text-sm text-muted-foreground">لديك كود تفعيل؟ أدخله أدناه</p>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">كود التفعيل</Label>
              <div className="relative input-premium rounded-lg">
                <Key className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="bg-transparent border-0 focus-visible:ring-0 pr-9 text-right uppercase tracking-widest font-mono"
                  placeholder="NAFK-XXXX-XXXX-XXXX"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleActivate()}
                  maxLength={32}
                />
              </div>
            </div>
            <Button
              className="w-full h-11 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground glow-primary"
              onClick={handleActivate}
              disabled={loading}
            >
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><Key className="w-4 h-4 ml-2" />تفعيل الاشتراك</>}
            </Button>
            <WhatsAppButton label="تواصل للحصول على كود التفعيل" href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`أرغب في الحصول على اشتراك Vodafone Fakka Premium.\nاسم المستخدم: ${profile?.username ?? 'غير محدد'}\nرقم الهاتف: ${profile?.phone ?? 'غير محدد'}\nبرجاء إرسال تفاصيل التفعيل.`)}`} />
          </div>
        )}

        {/* PHASE 3: بطاقة الاشتراك النشط — بيانات المستخدم فقط، بدون أي بيانات إدارية */}
        {isActivated && subscription && (
          <div className="card-premium p-6 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-success/10 border border-success/20">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-success" />
                <span className="text-sm font-semibold text-success">نشط</span>
              </div>
              <span className="text-xs text-muted-foreground">حالة الاشتراك</span>
            </div>
            {/* PHASE 3: فقط نوع + تاريخ التفعيل + تاريخ الانتهاء + الوقت المتبقي */}
            {[
              { icon: Calendar, label: 'تاريخ التفعيل',  value: subscription.activated_at ? new Date(subscription.activated_at).toLocaleDateString('en-GB') : '—' },
              { icon: Calendar, label: 'تاريخ الانتهاء', value: subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString('en-GB') : '—' },
              {
                // PHASE 2: countdown حقيقي بالساعات/الدقائق
                icon: Clock,
                label: 'الوقت المتبقي',
                value: countdown ? (countdown.expired ? 'منتهي' : countdown.labelFull) : '—',
              },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <span className="text-sm font-semibold">{value}</span>
              </div>
            ))}
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => navigate('/home')}>
              الذهاب للرئيسية
            </Button>
          </div>
        )}
      </div>

      {/* نافذة الكود غير الصالح */}
      <InvalidCodeDialog
        open={invalidOpen}
        errorCode={invalidError.code}
        errorMsg={invalidError.msg}
        onClose={() => setInvalidOpen(false)}
      />

      {/* نافذة حجب الجهاز */}
      <DeviceBlockedModal
        open={deviceBlockedOpen}
        blockerUsername={deviceBlockerUsername}
        onClose={() => setDeviceBlockedOpen(false)}
      />
    </div>
  );
}
