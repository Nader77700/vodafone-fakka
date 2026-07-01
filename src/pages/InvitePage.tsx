// صفحة رابط الدعوة — /invite/:token  (Phase 7)
// لا تحتاج مصادقة — تتحقق من التوكن وتحفظه ثم تحوّل إلى تسجيل الدخول
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { validateInviteToken, storePendingInviteToken } from '@/lib/api';
import { OFFICIAL_LOGO } from '@/pages/SplashScreen';
import { Loader2, CheckCircle, XCircle, Building2, ArrowRight, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PageState = 'loading' | 'valid' | 'invalid' | 'disabled' | 'expired' | 'merchant_inactive';

const ERROR_MESSAGES: Record<string, { state: PageState; msg: string; sub: string }> = {
  token_not_found:   { state: 'invalid',           msg: 'رابط غير صالح',           sub: 'هذا الرابط غير موجود أو تم حذفه.' },
  invite_disabled:   { state: 'disabled',          msg: 'رابط الدعوة معطّل',       sub: 'قام التاجر بتعطيل رابط الدعوة مؤقتاً.' },
  invite_expired:    { state: 'expired',           msg: 'رابط الدعوة منتهي',        sub: 'انتهت صلاحية هذا الرابط.' },
  invite_not_active: { state: 'disabled',          msg: 'رابط الدعوة غير نشط',     sub: 'هذا الرابط غير نشط حالياً.' },
  merchant_inactive: { state: 'merchant_inactive', msg: 'التاجر غير نشط',          sub: 'التاجر الخاص بهذا الرابط غير نشط حالياً.' },
};

export default function InvitePage() {
  const { token }  = useParams<{ token: string }>();
  const navigate   = useNavigate();

  const [state,        setState]        = useState<PageState>('loading');
  const [merchantName, setMerchantName] = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [errorSub,     setErrorSub]     = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); setErrorMsg('رابط غير صالح'); setErrorSub('لم يتم تقديم توكن.'); return; }

    (async () => {
      const res = await validateInviteToken(token);

      if (!res.valid) {
        const key = res.error ?? 'token_not_found';
        const info = ERROR_MESSAGES[key] ?? ERROR_MESSAGES.token_not_found;
        setState(info.state);
        setErrorMsg(info.msg);
        setErrorSub(info.sub);
        return;
      }

      // حفظ بيانات الدعوة مؤقتاً
      storePendingInviteToken({
        token:         res.token ?? token,
        merchant_id:   res.merchant_id!,
        merchant_name: res.merchant_name!,
        stored_at:     Date.now(),
      });

      setMerchantName(res.merchant_name!);
      setState('valid');
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4" dir="rtl">
      {/* خلفية ضوئية */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/8 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* شعار التطبيق */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 border border-primary/30"
            style={{ background: '#0d0000', boxShadow: '0 0 24px rgba(230,0,0,0.2)' }}>
            <img src={OFFICIAL_LOGO} alt="Vodafone Fakka Premium" className="w-full h-full object-contain p-1.5" />
          </div>
        </div>

        {/* ─── Loading ─── */}
        {state === 'loading' && (
          <div className="bg-card border border-border rounded-3xl p-8 text-center space-y-4 shadow-lg">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">جارٍ التحقق من رابط الدعوة…</p>
          </div>
        )}

        {/* ─── Valid ─── */}
        {state === 'valid' && (
          <div className="bg-card border border-border rounded-3xl p-8 text-center space-y-5 shadow-lg">
            <div className="w-14 h-14 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7 text-success" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-black">دعوة صالحة!</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                تمت دعوتك للانضمام إلى
              </p>
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-primary/5 border border-primary/10">
                <Building2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-bold text-primary truncate">{merchantName}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              سجّل دخولك أو أنشئ حساباً جديداً لإتمام الانضمام تلقائياً.
            </p>
            <Button
              className="w-full gap-2"
              onClick={() => navigate('/login', { replace: true })}
            >
              <ArrowRight className="w-4 h-4" />
              تسجيل الدخول / إنشاء حساب
            </Button>
          </div>
        )}

        {/* ─── Error states ─── */}
        {['invalid','disabled','expired','merchant_inactive'].includes(state) && (
          <div className="bg-card border border-border rounded-3xl p-8 text-center space-y-5 shadow-lg">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
              {state === 'merchant_inactive'
                ? <ShieldAlert className="w-7 h-7 text-destructive" />
                : <XCircle    className="w-7 h-7 text-destructive" />}
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-black text-destructive">{errorMsg}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{errorSub}</p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/login', { replace: true })}
            >
              الذهاب إلى تسجيل الدخول
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
