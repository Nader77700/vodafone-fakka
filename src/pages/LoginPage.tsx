// صفحة تسجيل الدخول والتسجيل
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn, UserPlus, Lock, User, Phone, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { OFFICIAL_LOGO } from '@/pages/SplashScreen';
import { consumePendingInvite, clearPendingInvite, type PendingInvite } from '@/pages/JoinPage';
import {
  assignUserToMerchantSecure,
  getPendingInviteToken, clearPendingInviteToken, linkUserToInviteToken,
} from '@/lib/api';

type Mode = 'login' | 'register';

// تنظيف رقم الهاتف المصري إلى صيغة موحدة 01XXXXXXXXX
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

  // ── دعوة التاجر المحفوظة (v1 = /join/:code) ──
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  useEffect(() => {
    const inv = consumePendingInvite();
    if (inv) setPendingInvite(inv);
    // Switch to register mode if redirected from join page
    const locState = location.state as { mode?: string } | null;
    if (locState?.mode === 'register') setMode('register');
  }, []); // eslint-disable-line

  // ── تطبيق روابط الدعوة المعلّقة بعد تسجيل الدخول أو الإنشاء ──────────────
  // يدعم كلا النوعين: v1 (/join/:code) + v2 (/invite/:token)
  const applyPendingInvites = async (userId: string) => {
    // v2 — /invite/:token (الأحدث والأولوية)
    const pendingToken = getPendingInviteToken();
    if (pendingToken) {
      clearPendingInviteToken();
      const res = await linkUserToInviteToken(userId, pendingToken.token);
      if (res.success && !res.duplicate) {
        toast.success(`✅ تم ربط حسابك بـ ${pendingToken.merchant_name}`);
      }
      return;
    }
    // v1 — /join/:code (fallback للروابط القديمة)
    if (pendingInvite) {
      await assignUserToMerchantSecure(
        userId,
        pendingInvite.merchant_id,
        pendingInvite.invite_code,
        'invite_link',
      );
      clearPendingInvite();
      toast.success(`✅ تم ربط حسابك بـ ${pendingInvite.merchant_name}`);
    }
  };


  const loginEmail = `${username.trim().toLowerCase()}@miaoda.com`;

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      toast.error('يرجى إدخال اسم المستخدم أو رقم الهاتف وكلمة المرور');
      return;
    }
    setLoading(true);

    // إصلاح: عند تكرار الرقم نُعطي أولوية للحساب الأحدث (created_at DESC)
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

      // نجرّب كل حساب بالترتيب (الأحدث أولاً) حتى يتطابق بكلمة المرور
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
      // تطبيق الدعوة المعلّقة بعد الدخول برقم الهاتف
      if (matchedSession?.user?.id) await applyPendingInvites(matchedSession.user.id);
      navigate('/home', { replace: true });
      return;
    }

    // تسجيل دخول باسم المستخدم
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
    // تطبيق رابط الدعوة المعلّق بعد تسجيل الدخول
    if (signData?.user?.id) await applyPendingInvites(signData.user.id);
    // عرض شاشة البداية بعد تسجيل الدخول
    navigate('/home', { replace: true });
  };

  const handleRegister = async () => {
    if (!username.trim() || !password || !confirmPassword || !phone.trim()) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }
    if (username.trim().length < 4) {
      toast.error('اسم المستخدم يجب أن يكون 4 أحرف على الأقل');
      return;
    }
    if (username.trim().length > 16) {
      toast.error('اسم المستخدم يجب أن يكون 16 حرفاً كحد أقصى');
      return;
    }
    if (!/^[a-zA-Z]+$/.test(username.trim())) {
      toast.error('اسم المستخدم يجب أن يحتوي على حروف إنجليزية فقط (بدون أرقام أو رموز)');
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
      toast.error('يرجى إدخال رقم هاتف مصري صحيح (للتواصل على WhatsApp)');
      return;
    }
    if (!agreed) {
      toast.error('يجب الموافقة على الشروط والأحكام');
      return;
    }
    setLoading(true);
    // ── تحقق من أن رقم الهاتف غير مستخدم مسبقاً ──
    const { data: existingPhone } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', normalizedPhone)
      .maybeSingle();
    if (existingPhone) {
      setLoading(false);
      toast.error('رقم الهاتف هذا مسجّل مسبقاً، جرّب تسجيل الدخول أو استخدم رقماً آخر');
      return;
    }
    const regEmail = `${username.trim().toLowerCase()}@miaoda.com`;
    const { data, error } = await supabase.auth.signUp({
      email: regEmail,
      password,
      options: { data: { username: username.trim() } },
    });
    if (error) {
      setLoading(false);
      // عرض سبب محدد دائماً
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
        username: username.trim(),
        phone: normalizedPhone,
      }).eq('id', data.user.id);

      // ── ربط التاجر تلقائياً إذا جاء من رابط دعوة ──
      await applyPendingInvites(data.user.id);
    }
    setLoading(false);
    toast.success('تم إنشاء الحساب بنجاح!');
    navigate('/home', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      {/* خلفية الجلو */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/8 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* الشعار */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl overflow-hidden mb-4 border border-primary/30"
            style={{ background: '#0d0000', boxShadow: '0 0 24px rgba(230,0,0,0.2)' }}>
            <img
              src={OFFICIAL_LOGO}
              alt="Vodafone Fakka Premium"
              className="w-full h-full object-contain p-1.5"
              onError={(e) => {
                const t = e.currentTarget;
                t.onerror = null;
                t.style.display = 'none';
                const fallback = t.parentElement?.querySelector('.logo-fallback') as HTMLElement | null;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            {/* Fallback نصي — يظهر فقط إذا فشل تحميل الصورة */}
            <span
              className="logo-fallback w-full h-full items-center justify-center text-2xl font-black text-primary hidden"
              style={{ display: 'none' }}
            >VF</span>
          </div>
          <h1 className="text-xl font-black text-center">
            <span style={{ color: '#E60000' }}>Vodafone Fakka</span>
            <span className="text-foreground"> Premium</span>
          </h1>
          <p className="text-muted-foreground text-xs mt-1">Powered By Nader Akram</p>
        </div>

        {/* بطاقة الدخول */}
        <div className="card-premium p-6 space-y-5">
          {/* بانر الدعوة — يظهر فقط عند التسجيل من رابط تاجر */}
          {pendingInvite && mode === 'register' && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5">
              <Building2 className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs text-primary font-medium flex-1 min-w-0">
                ستنضم إلى: <span className="font-bold">{pendingInvite.merchant_name}</span>
              </p>
            </div>
          )}
          {/* التبويب */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              className={`flex-1 py-2.5 text-sm font-semibold transition-all ${mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('login')}
            >
              تسجيل الدخول
            </button>
            <button
              className={`flex-1 py-2.5 text-sm font-semibold transition-all ${mode === 'register' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('register')}
            >
              حساب جديد
            </button>
          </div>

          {/* الحقول */}
          <div className="space-y-4">
            {/* اسم المستخدم أو رقم الهاتف */}
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
                {mode === 'register' && (
                  <p className="text-xs text-muted-foreground pr-1">اسم المستخدم باللغة الإنجليزية فقط · 4–16 حرفاً</p>
                )}
              </div>
            </div>

            {/* رقم التواصل على WhatsApp — عند التسجيل فقط */}
            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-muted-foreground">رقم التواصل على WhatsApp</Label>
                <div className="relative input-premium rounded-lg">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    inputMode="numeric"
                    className="bg-transparent border-0 focus-visible:ring-0 pr-9 text-right"
                    placeholder="01XXXXXXXXX"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground pr-1">رقم الهاتف للتواصل معك فقط — لا يُستخدم في الشحن</p>
              </div>
            )}

            {/* كلمة المرور */}
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
                <button
                  type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPass(v => !v)}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* تأكيد كلمة المرور — عند التسجيل فقط */}
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
                  <button
                    type="button"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowConfirmPass(v => !v)}
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div className="flex items-start gap-3 min-h-12">
                <Checkbox
                  id="agree"
                  checked={agreed}
                  onCheckedChange={v => setAgreed(v === true)}
                  className="mt-0.5 shrink-0"
                />
                <label htmlFor="agree" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                  أوافق على{' '}
                  <span className="text-primary underline">شروط الاستخدام</span>
                  {' '}و{' '}
                  <span className="text-primary underline">سياسة الخصوصية</span>
                </label>
              </div>
            )}
          </div>

          {/* الزر */}
          <Button
            className="w-full h-11 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground glow-primary transition-all"
            onClick={mode === 'login' ? handleLogin : handleRegister}
            disabled={loading}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : mode === 'login' ? (
              <><LogIn className="w-4 h-4 ml-2" />دخول</>
            ) : (
              <><UserPlus className="w-4 h-4 ml-2" />إنشاء حساب</>
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered By Nader Akram · جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
