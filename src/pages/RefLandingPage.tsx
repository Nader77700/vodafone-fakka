// صفحة رابط الإحالة الشخصي — /ref/:code
// تحفظ الكود وتوجه المستخدم لصفحة التسجيل
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { validateReferralCode } from '@/lib/api';
import { OFFICIAL_LOGO } from '@/pages/SplashScreen';
import { Gift, Loader2, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PENDING_REFERRAL_KEY = 'pending_referral_code';

export function storePendingReferralCode(code: string) {
  try { sessionStorage.setItem(PENDING_REFERRAL_KEY, code); } catch { /* ignore */ }
}

export function consumePendingReferralCode(): string | null {
  try {
    const v = sessionStorage.getItem(PENDING_REFERRAL_KEY);
    sessionStorage.removeItem(PENDING_REFERRAL_KEY);
    return v;
  } catch { return null; }
}

type State = 'loading' | 'valid' | 'invalid';

export default function RefLandingPage() {
  const { code }     = useParams<{ code: string }>();
  const navigate     = useNavigate();
  const [state,      setState]      = useState<State>('loading');
  const [username,   setUsername]   = useState('');

  useEffect(() => {
    if (!code) { setState('invalid'); return; }
    (async () => {
      const res = await validateReferralCode(code.toUpperCase());
      if (res.valid) {
        storePendingReferralCode(code.toUpperCase());
        setUsername(res.username ?? '');
        setState('valid');
      } else {
        setState('invalid');
      }
    })();
  }, [code]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-6">
      <img src={OFFICIAL_LOGO} alt="Vodafone Fakka" className="w-16 h-16 rounded-2xl" />

      {state === 'loading' && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground text-sm">جارٍ التحقق من رابط الإحالة...</p>
        </div>
      )}

      {state === 'valid' && (
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-foreground">دعوة من {username}</h1>
            <p className="text-sm text-muted-foreground">
              سجّل حسابك الآن للانضمام عبر دعوة <span className="font-semibold text-foreground">{username}</span>
            </p>
          </div>
          <div className="bg-muted/60 border border-border rounded-lg px-4 py-3 flex items-center gap-2 w-full justify-center">
            <Gift className="w-4 h-4 text-primary shrink-0" />
            <span className="font-mono font-bold tracking-widest text-primary">{code?.toUpperCase()}</span>
          </div>
          <Button
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => navigate('/login', { state: { mode: 'register', referralCode: code?.toUpperCase() } })}
          >
            إنشاء حساب الآن
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {state === 'invalid' && (
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-foreground">رابط غير صالح</h1>
            <p className="text-sm text-muted-foreground">هذا الرابط غير موجود أو منتهي الصلاحية</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/login')}>
            الذهاب لتسجيل الدخول
          </Button>
        </div>
      )}
    </div>
  );
}
