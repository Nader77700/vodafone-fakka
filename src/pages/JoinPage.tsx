// صفحة الانضمام عبر رابط الدعوة — /join/:code
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { validateInviteCode } from '@/lib/api';
import { OFFICIAL_LOGO } from '@/pages/SplashScreen';
import { Loader2, CheckCircle, XCircle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// مفاتيح التخزين المحلي
export const INVITE_STORAGE_KEY  = 'vfp_pending_invite';

export interface PendingInvite {
  merchant_id:   string;
  merchant_name: string;
  invite_code:   string;
  stored_at:     number;
}

/** حفظ بيانات الدعوة مؤقتاً في localStorage */
export function storePendingInvite(invite: PendingInvite) {
  localStorage.setItem(INVITE_STORAGE_KEY, JSON.stringify(invite));
}

/** قراءة وإزالة بيانات الدعوة من localStorage */
export function consumePendingInvite(): PendingInvite | null {
  try {
    const raw = localStorage.getItem(INVITE_STORAGE_KEY);
    if (!raw) return null;
    const invite = JSON.parse(raw) as PendingInvite;
    // منتهية الصلاحية بعد 24 ساعة
    if (Date.now() - invite.stored_at > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(INVITE_STORAGE_KEY);
      return null;
    }
    return invite;
  } catch {
    return null;
  }
}

/** مسح بيانات الدعوة بعد الاستخدام */
export function clearPendingInvite() {
  localStorage.removeItem(INVITE_STORAGE_KEY);
}

type State = 'loading' | 'valid' | 'invalid' | 'inactive';

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const navigate  = useNavigate();

  const [state,        setState]        = useState<State>('loading');
  const [merchantName, setMerchantName] = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');

  useEffect(() => {
    if (!code) { setState('invalid'); setErrorMsg('رابط الدعوة غير صالح'); return; }
    (async () => {
      const res = await validateInviteCode(code);
      if (!res.valid) {
        if (res.error === 'merchant_inactive') {
          setState('inactive');
          setErrorMsg('التاجر غير نشط حالياً، يرجى التواصل معه');
        } else {
          setState('invalid');
          setErrorMsg('رابط الدعوة غير صالح أو منتهي الصلاحية');
        }
        return;
      }
      // حفظ بيانات الدعوة مؤقتاً
      storePendingInvite({
        merchant_id:   res.merchant_id!,
        merchant_name: res.merchant_name!,
        invite_code:   res.invite_code!,
        stored_at:     Date.now(),
      });
      setMerchantName(res.merchant_name!);
      setState('valid');
    })();
  }, [code]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      {/* خلفية */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/8 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-6">
        {/* شعار */}
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-2xl overflow-hidden mb-4 border border-primary/30"
            style={{ background: '#0d0000', boxShadow: '0 0 24px rgba(230,0,0,0.2)' }}>
            <img src={OFFICIAL_LOGO} alt="VFP" className="w-full h-full object-contain p-1.5"
              onError={e => { e.currentTarget.style.display = 'none'; }} />
          </div>
          <h1 className="text-xl font-black text-center">
            <span style={{ color: '#E60000' }}>Vodafone Fakka</span>
            <span className="text-foreground"> Premium</span>
          </h1>
        </div>

        {/* بطاقة الحالة */}
        <div className="card-premium p-6 space-y-5 text-center">
          {state === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" />
              <p className="text-sm text-muted-foreground">جارٍ التحقق من رابط الدعوة...</p>
            </>
          )}

          {state === 'valid' && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center mx-auto">
                <Building2 className="w-7 h-7 text-success" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-base text-balance">دُعيت للانضمام إلى</p>
                <p className="text-lg font-black text-primary text-balance">{merchantName}</p>
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                سيتم ربط حسابك بهذا التاجر تلقائياً بعد إنشاء الحساب
              </p>
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={() => navigate('/login', { state: { mode: 'register' } })}
                >
                  إنشاء حساب جديد
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate('/login')}
                >
                  لديّ حساب
                </Button>
              </div>
            </>
          )}

          {(state === 'invalid' || state === 'inactive') && (
            <>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
                state === 'inactive' ? 'bg-warning/10 border border-warning/20' : 'bg-destructive/10 border border-destructive/20'
              }`}>
                {state === 'inactive'
                  ? <XCircle className="w-7 h-7 text-warning" />
                  : <XCircle className="w-7 h-7 text-destructive" />}
              </div>
              <div className="space-y-1">
                <p className="font-bold text-base text-balance">
                  {state === 'inactive' ? 'التاجر غير نشط' : 'رابط غير صالح'}
                </p>
                <p className="text-sm text-muted-foreground text-pretty">{errorMsg}</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
                العودة لتسجيل الدخول
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
