import { useState } from 'react';
import { Loader2, LogIn, Phone, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAnaVodafoneSession } from './useAnaVodafoneSession';

interface VodafoneLoginGateProps {
  children: React.ReactNode;
  onLogin?: () => void;
}

export default function VodafoneLoginGate({ children, onLogin }: VodafoneLoginGateProps) {
  const { session, loading, loginLoading, loginError, loginSuccess, login, clearLoginError } = useAnaVodafoneSession();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-[18px]"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
        <p className="text-[12px] text-white/35">جاري التحقق من الجلسة...</p>
      </div>
    );
  }

  if (session?.is_valid) {
    return <>{children}</>;
  }

  async function handleLogin() {
    const p = phone.trim();
    clearLoginError();
    if (!p || !password) {
      setTimeout(() => alert('يرجى إدخال رقم الهاتف وكلمة المرور'), 0);
      return;
    }
    if (!p.startsWith('01') || p.length !== 11) {
      setTimeout(() => alert('رقم الهاتف غير صحيح — 11 رقم يبدأ بـ 01'), 0);
      return;
    }
    const ok = await login(p, password);
    if (ok) {
      setTimeout(() => onLogin?.(), 1300);
    }
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-[20px] overflow-hidden p-4"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <LogIn className="w-4 h-4" style={{ color: '#f87171' }} />
          </div>
          <div>
            <h2 className="text-sm font-black text-foreground">سجّل دخولك</h2>
            <p className="text-[11px] text-white/45 leading-relaxed">أدخل بيانات أنا فودافون لعرض الاشتراكات والعروض</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="login-phone" className="text-[11px] font-medium text-white/70">رقم الهاتف</Label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                id="login-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
                placeholder="01XXXXXXXXX"
                className="pr-10 text-[13px] h-11 text-right bg-white/5 border-white/10 text-white placeholder:text-white/25"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="text-[11px] font-medium text-white/70">كلمة المرور</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="text-[13px] h-11 text-right bg-white/5 border-white/10 text-white placeholder:text-white/25"
                onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                tabIndex={-1}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {loginError && (
            <p className="text-[11px] font-medium text-red-300 bg-red-500/10 rounded-lg px-3 py-2">{loginError}</p>
          )}
          {loginSuccess && (
            <p className="text-[11px] font-bold text-green-300 bg-green-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> جاري تسجيل الدخول...
            </p>
          )}

          <Button
            onClick={handleLogin}
            disabled={loginLoading || loginSuccess}
            className="w-full h-11 text-[13px] font-black"
            style={{ background: 'linear-gradient(135deg,#E60000,#B00000)', boxShadow: '0 4px 18px rgba(230,0,0,0.25)' }}
          >
            {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            تسجيل الدخول
          </Button>
        </div>
      </div>

      <p className="text-[10px] text-white/30 text-center leading-relaxed px-4">
        بيانات الدخول لا تُخزن في الجهاز. تُستخدم فقط لإنشاء جلسة Server-Side.
      </p>
    </div>
  );
}
