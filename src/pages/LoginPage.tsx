// صفحة تسجيل الدخول والتسجيل
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn, UserPlus, Lock, User, Phone, Building2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { OFFICIAL_LOGO } from '@/pages/SplashScreen';
import { consumePendingInvite, clearPendingInvite, type PendingInvite } from '@/pages/JoinPage';
import {
  assignUserToMerchantSecure,
  getPendingInviteToken, clearPendingInviteToken, linkUserToInviteToken,
  validateInviteToken,
} from '@/lib/api';
import { getDeviceId } from '@/lib/deviceId';
import OnboardingTrialModal from '@/components/onboarding/OnboardingTrialModal';
import { useAuth } from '@/contexts/AuthContext';

// رقم واتساب الأدمن
const ADMIN_WA_NUMBER = '201222692182';

type Mode = 'login' | 'register';

function normalizeEgyptPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length === 12) return '0' + digits.slice(2);
  if (digits.startsWith('01') && digits.length === 11) return digits;
  return digits;
}

function isPhoneInput(val: string): boolean {
  const d = val.replace(/\D/g, '');
  return (d.startsWith('01') && d.length >= 8) || (d.startsWith('20') && d.length >= 10);
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshProfile } = useAuth();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/home';

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [inviteCodeInput, setInviteCodeInput]   = useState('');
  const [inviteCodeState, setInviteCodeState]   = useState<'idle'|'checking'|'valid'|'invalid'>('idle');
  const [inviteMerchantName, setInviteMerchantName] = useState('');
  useEffect(() => {
    const inv = consumePendingInvite();
    if (inv) setPendingInvite(inv);
    const locState = location.state as { mode?: string } | null;
    if (locState?.mode === 'register') setMode('register');
  }, []); // eslint-disable-line

  // هل المستخدم الحالي قادم من دعوة تاجر؟
  const hasMerchantInvite = (): boolean => {
    if (inviteCodeInput.trim()) return true;
    if (getPendingInviteToken()) return true;
    if (pendingInvite) return true;
    return false;
  };

  const applyPendingInvites = async (userId: string): Promise<boolean> => {
    // أولاً: كود مُدخَل يدوياً في حقل كود الدعوة
    if (inviteCodeInput.trim()) {
      const res = await linkUserToInviteToken(userId, inviteCodeInput.trim());
      if (res.success && !res.duplicate) {
        toast.success(`✅ تم ربط حسابك بـ ${inviteMerchantName || 'التاجر'}`);
      } else if (res.error === 'user_already_linked_to_other_merchant') {
        toast.warning('حسابك مرتبط بتاجر آخر بالفعل.');
      }
      return res.success ?? false;
    }
    // ثانياً: token محفوظ من رابط الدعوة
    const pendingToken = getPendingInviteToken();
    if (pendingToken) {
      clearPendingInviteToken();
      const res = await linkUserToInviteToken(userId, pendingToken.token);
      if (res.success && !res.duplicate) {
        toast.success(`✅ تم ربط حسابك بـ ${pendingToken.merchant_name}`);
      }
      return res.success ?? false;
    }
    // ثالثاً: pending invite legacy
    if (pendingInvite) {
      const res = await assignUserToMerchantSecure(userId, pendingInvite.merchant_id, pendingInvite.invite_code, 'invite_link');
      clearPendingInvite();
      if ((res as { success?: boolean })?.success !== false) {
        toast.success(`✅ تم ربط حسابك بـ ${pendingInvite.merchant_name}`);
        return true;
      }
    }
    return false;
  };

  const loginEmail = `${username.trim().toLowerCase()}@miaoda.com`;

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      toast.error('يرجى إدخال اسم المستخدم أو رقم الهاتف وكلمة المرور');
      return;
    }
    setLoading(true);

    if (isPhoneInput(username)) {
      const normalized = normalizeEgyptPhone(username);
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('email, id, created_at')
        .eq('phone', normalized)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!profileRows || profileRows.length === 0) {
        setLoading(false);
        toast.error('لم يُعثر على حساب بهذا الرقم');
        return;
      }

      let matchedSession = null;
      for (const row of profileRows) {
        const { data: s, error: e } = await supabase.auth.signInWithPassword({ email: row.email, password });
        if (!e && s?.user) { matchedSession = s; break; }
      }

      setLoading(false);
      if (!matchedSession) {
        toast.error('كلمة المرور غير صحيحة');
        return;
      }
      if (matchedSession?.user?.id) {
        const deviceId = getDeviceId();
        supabase.from('profiles').update({ device_id: deviceId }).eq('id', matchedSession.user.id).then(() => {});
        const linked = await applyPendingInvites(matchedSession.user.id);
        // تحديث الـ profile بعد الربط بالتاجر حتى يُوجَّه للواجهة الصحيحة
        if (linked) await refreshProfile();
      }
      navigate(from, { replace: true });
      return;
    }

    const { data: signData, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setLoading(false);
    if (error) {
      if (error.message.includes('Invalid login') || error.message.includes('invalid_credentials')) {
        toast.error('اسم المستخدم أو كلمة المرور غير صحيحة');
      } else if (error.message.includes('Email not confirmed')) {
        toast.error('لم يتم تأكيد الحساب — تواصل مع الإدارة');
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        toast.error('فشل الاتصال بالسيرفر — تحقق من الإنترنت');
      } else {
        toast.error(error.message?.trim() || 'فشل تسجيل الدخول — أعد المحاولة');
      }
      return;
    }
    if (signData?.user?.id) {
      const deviceId = getDeviceId();
      supabase.from('profiles').update({ device_id: deviceId }).eq('id', signData.user.id).then(() => {});
      const linked = await applyPendingInvites(signData.user.id);
      if (linked) await refreshProfile();
    }
    navigate(from, { replace: true });
  };

  const handleRegister = async () => {
    if (!username.trim() || !password || !confirmPassword || !phone.trim()) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }
    // ── فحص حظر الجهاز قبل التسجيل ──
    const deviceId = getDeviceId();
    {
      const { data: banCheck } = await supabase.functions.invoke<{banned:boolean;reason?:string}>('admin-user-actions', {
        body: { action: 'check_device_ban', device_id: deviceId, device_fp: deviceId },
      });
      if ((banCheck as {banned?:boolean}|null)?.banned) {
        toast.error(`🚫 هذا الجهاز محظور من إنشاء حسابات جديدة.\nالسبب: ${(banCheck as {reason?:string}).reason ?? 'تعدد الحسابات'}`);
        return;
      }
    }
    if (username.trim().length < 4) {
      toast.error('اسم المستخدم يجب أن يكون 4 أحرف على الأقل');
      return;
    }
    if (username.trim().length > 7) {
      toast.error('اسم المستخدم يجب ألا يتجاوز 7 أحرف');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      toast.error('اسم المستخدم يجب أن يحتوي على حروف إنجليزية أو أرقام فقط');
      return;
    }
    if (password.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      toast.error('كلمة المرور يجب أن تحتوي على حرف كبير (A-Z) على الأقل');
      return;
    }
    if (!/[a-z]/.test(password)) {
      toast.error('كلمة المرور يجب أن تحتوي على حرف صغير (a-z) على الأقل');
      return;
    }
    if (!/[0-9]/.test(password)) {
      toast.error('كلمة المرور يجب أن تحتوي على رقم (0-9) على الأقل');
      return;
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      toast.error('كلمة المرور يجب أن تحتوي على رمز خاص (!@#$%^&*) على الأقل');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('كلمة المرور وتأكيدها غير متطابقتين');
      return;
    }
    const normalizedPhone = normalizeEgyptPhone(phone);
    if (!/^01[0-9]{9}$/.test(normalizedPhone)) {
      toast.error('رقم الواتساب يجب أن يكون 11 رقماً مصرياً (مثال: 01012345678)');
      return;
    }
    if (!agreed) {
      toast.error('يجب الموافقة على الشروط والأحكام');
      return;
    }
    setLoading(true);
    const { data: existingPhone } = await supabase
      .from('profiles').select('id').eq('phone', normalizedPhone).maybeSingle();
    if (existingPhone) {
      setLoading(false);
      toast.error('رقم الهاتف هذا مسجّل مسبقاً، جرّب تسجيل الدخول أو استخدم رقماً آخر');
      return;
    }
    const regEmail = `${username.trim().toLowerCase()}@miaoda.com`;
    const { data, error } = await supabase.auth.signUp({
      email: regEmail, password,
      options: { data: { username: username.trim() } },
    });
    if (error) {
      setLoading(false);
      if (error.message.includes('already') || error.message.includes('User already registered')) {
        toast.error('اسم المستخدم مستخدم مسبقاً — جرّب اسماً آخر');
      } else if (error.message.includes('password') || error.message.includes('weak')) {
        toast.error('كلمة المرور ضعيفة — يرجى اختيار كلمة مرور أقوى');
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        toast.error('فشل الاتصال بالسيرفر — تحقق من الإنترنت وأعد المحاولة');
      } else {
        toast.error(error.message?.trim() || 'فشل إنشاء الحساب — يرجى المحاولة مجدداً');
      }
      return;
    }
    if (data.user) {
      await supabase.from('profiles').update({
        username: username.trim(), phone: normalizedPhone,
      }).eq('id', data.user.id);
      const linked = await applyPendingInvites(data.user.id);
      // تحديث الـ profile لضمان قراءة merchant_id الجديد
      if (linked) await refreshProfile();
      setLoading(false);
      toast.success('تم إنشاء الحساب بنجاح! 🎉');
      // عضو تاجر: انتقل مباشرة للواجهة الثانية — لا تُظهر onboarding التجربة المجانية
      if (linked) {
        navigate('/home', { replace: true });
        return;
      }
    } else {
      setLoading(false);
    }
    toast.success('تم إنشاء الحساب بنجاح! 🎉');
    setShowOnboarding(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/8 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl overflow-hidden mb-4 border border-primary/30"
            style={{ background: '#0d0000', boxShadow: '0 0 24px rgba(230,0,0,0.2)' }}>
            <img src={OFFICIAL_LOGO} alt="Vodafone Fakka Premium"
              className="w-full h-full object-contain p-1.5"
              onError={(e) => {
                const t = e.currentTarget; t.onerror = null; t.style.display = 'none';
                const fallback = t.parentElement?.querySelector('.logo-fallback') as HTMLElement | null;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <span className="logo-fallback w-full h-full items-center justify-center text-2xl font-black text-primary hidden"
              style={{ display: 'none' }}>VF</span>
          </div>
          <h1 className="text-xl font-black text-center">
            <span style={{ color: '#E60000' }}>Vodafone Fakka</span>
            <span className="text-foreground"> Premium</span>
          </h1>
          <p className="text-muted-foreground text-xs mt-1">Powered By Nader Akram</p>
        </div>

        <div className="card-premium p-6 space-y-5">
          {pendingInvite && mode === 'register' && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5">
              <Building2 className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs text-primary font-medium flex-1 min-w-0">
                ستنضم إلى: <span className="font-bold">{pendingInvite.merchant_name}</span>
              </p>
            </div>
          )}

          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              className={`flex-1 py-2.5 text-sm font-semibold transition-all ${mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('login')}>تسجيل الدخول</button>
            <button
              className={`flex-1 py-2.5 text-sm font-semibold transition-all ${mode === 'register' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('register')}>حساب جديد</button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">
                {mode === 'login' ? 'اسم المستخدم أو رقم الهاتف' : 'اسم المستخدم'}
              </Label>
              <div className="relative input-premium rounded-lg">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="bg-transparent border-0 focus-visible:ring-0 pr-9 text-right"
                  placeholder={mode === 'login' ? 'اسم المستخدم أو 01XXXXXXXXX' : 'nader'}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())}
                />
              </div>
              {mode === 'register' && (
                <p className="text-xs text-muted-foreground pr-1">اسم المستخدم بالإنجليزية فقط · 4–7 أحرف</p>
              )}
            </div>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-muted-foreground">رقم التواصل على WhatsApp</Label>
                <div className="relative input-premium rounded-lg">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="tel" inputMode="numeric"
                    className="bg-transparent border-0 focus-visible:ring-0 pr-9 text-right"
                    placeholder="مثال: 01012345678"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground pr-1">رقم الهاتف المصري (11 رقم) — للتواصل معك على واتساب</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">كلمة المرور</Label>
              <div className="relative input-premium rounded-lg">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type={showPass ? 'text' : 'password'}
                  className="bg-transparent border-0 focus-visible:ring-0 pr-9 pl-9 text-right"
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())}
                />
                <button type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPass(v => !v)}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-muted-foreground">تأكيد كلمة المرور</Label>
                <div className="relative input-premium rounded-lg">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showConfirmPass ? 'text' : 'password'}
                    className="bg-transparent border-0 focus-visible:ring-0 pr-9 pl-9 text-right"
                    placeholder="أعد إدخال كلمة المرور"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                  <button type="button"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowConfirmPass(v => !v)}>
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* ─── حقل كود الدعوة (اختياري) ─── */}
            {mode === 'register' && !pendingInvite && (
              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-muted-foreground">
                  كود الدعوة <span className="text-muted-foreground/50">(اختياري)</span>
                </Label>
                <div className={`relative input-premium rounded-lg transition-colors ${
                  inviteCodeState === 'valid'   ? 'ring-1 ring-success/50'   :
                  inviteCodeState === 'invalid' ? 'ring-1 ring-destructive/50' : ''
                }`}>
                  <Building2 className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${
                    inviteCodeState === 'valid'   ? 'text-success'     :
                    inviteCodeState === 'invalid' ? 'text-destructive' : 'text-muted-foreground'
                  }`} />
                  <Input
                    className="bg-transparent border-0 focus-visible:ring-0 pr-9 text-right"
                    placeholder="أدخل كود الدعوة إن وُجد"
                    value={inviteCodeInput}
                    onChange={async e => {
                      const val = e.target.value.trim();
                      setInviteCodeInput(val);
                      setInviteCodeState('idle');
                      setInviteMerchantName('');
                      if (val.length >= 8) {
                        setInviteCodeState('checking');
                        const res = await validateInviteToken(val);
                        if (res.valid) {
                          setInviteCodeState('valid');
                          setInviteMerchantName(res.merchant_name ?? '');
                        } else {
                          setInviteCodeState('invalid');
                        }
                      }
                    }}
                  />
                  {inviteCodeState === 'checking' && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  )}
                </div>
                {inviteCodeState === 'valid' && inviteMerchantName && (
                  <p className="text-xs text-success pr-1 flex items-center gap-1">
                    <span>✓</span> ستنضم إلى: <span className="font-bold">{inviteMerchantName}</span>
                  </p>
                )}
                {inviteCodeState === 'invalid' && (
                  <p className="text-xs text-destructive pr-1">كود الدعوة غير صالح أو منتهي</p>
                )}
              </div>
            )}

            {mode === 'register' && (
              <div className="flex items-start gap-3 min-h-12">
                <Checkbox id="agree" checked={agreed}
                  onCheckedChange={v => setAgreed(v === true)} className="mt-0.5 shrink-0" />
                <label htmlFor="agree" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                  أوافق على{' '}
                  <span className="text-primary underline">شروط الاستخدام</span>
                  {' '}و{' '}
                  <span className="text-primary underline">سياسة الخصوصية</span>
                </label>
              </div>
            )}
          </div>

          <Button
            className="w-full h-11 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground glow-primary transition-all"
            onClick={mode === 'login' ? handleLogin : handleRegister}
            disabled={loading}
          >
            {loading
              ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : mode === 'login'
                ? <><LogIn className="w-4 h-4 ml-2" />دخول</>
                : <><UserPlus className="w-4 h-4 ml-2" />إنشاء حساب</>
            }
          </Button>

          {/* ── زر نسيت كلمة السر — يظهر في وضع تسجيل الدخول فقط ── */}
          {mode === 'login' && (
            <a
              href={`https://wa.me/${ADMIN_WA_NUMBER}?text=${encodeURIComponent(
                `أريد تغيير كلمة مرور حسابي.\nاسم المستخدم: ${username.trim() || '(لم يُدخَل بعد)'}\nبرجاء المساعدة في إعادة تعيين كلمة المرور.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-10 rounded-lg border border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
            >
              <MessageCircle className="w-4 h-4 text-green-500" />
              نسيت كلمة السر؟ تواصل مع الإدارة
            </a>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered By Nader Akram · جميع الحقوق محفوظة
        </p>
      </div>

      <OnboardingTrialModal
        open={showOnboarding}
        onClose={() => { setShowOnboarding(false); navigate('/home', { replace: true }); }}
      />
    </div>
  );
}
