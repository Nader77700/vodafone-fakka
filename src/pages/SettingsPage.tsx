// صفحة الإعدادات
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfile } from '@/lib/api';
import { toast } from 'sonner';
import {
  User, Shield, HeadphonesIcon, LogOut, Info, ChevronLeft,
  Pencil, Check, X, Calendar, Clock, Download,
  Zap, Crown, Infinity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BUILD_INFO } from '@/lib/buildInfo';
import { useUpdateChecker } from '@/hooks/useUpdateChecker';
import { useSubscriptionEngine } from '@/hooks/useSubscriptionEngine';

const CURRENT_VERSION = `v${BUILD_INFO.appVersion}`;

// ── شريط تقدم مصغّر ─────────────────────────────────────────────────────────
function MiniBar({ pct, color }: { pct: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 300); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <div className="h-full rounded-full transition-all duration-1000"
        style={{ width: `${w}%`, background: color, boxShadow: `0 0 4px ${color}60` }} />
    </div>
  );
}

export default function SettingsPage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // ── Subscription Engine — المصدر الوحيد لجميع بيانات الاشتراك ──────────
  const eng = useSubscriptionEngine();

  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [editing,    setEditing]    = useState(false);
  const [fullName,   setFullName]   = useState('');
  const [saving,     setSaving]     = useState(false);
  const { hasUpdate, installedVersion } = useUpdateChecker();
  const displayVersion = installedVersion ? `v${installedVersion}` : CURRENT_VERSION;

  useEffect(() => {
    if (!user) return;
    setFullName(profile?.full_name ?? '');
  }, [user, profile]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await updateProfile(user.id, { full_name: fullName || null });
    setSaving(false);
    if (error) { toast.error('فشل حفظ البيانات'); return; }
    await refreshProfile();
    setEditing(false);
    toast.success('تم حفظ البيانات');
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // ── منطق "معلومات الإصدار" — الأدمن فقط يرى BuildInfo ──────────────────
  const handleVersionInfo = () => {
    if (eng.isAdmin) {
      navigate('/build-info');
    } else {
      toast.info(
        `Vodafone Fakka Premium · ${displayVersion}\nأنت تستخدم أحدث إصدار من التطبيق`,
        { duration: 4000 }
      );
    }
  };

  const menuItems = [
    {
      icon: HeadphonesIcon,
      label: 'الدعم الفني',
      desc: 'تواصل معنا عند الحاجة',
      onClick: () => {
        const msg = encodeURIComponent('مرحباً، أحتاج إلى مساعدة في تطبيق Vodafone Fakka Premium');
        window.open(`https://wa.me/201222692182?text=${msg}`, '_blank');
      },
    },
    {
      icon: Info,
      label: 'معلومات الإصدار',
      desc: eng.isAdmin
        ? `Build Fingerprint · v${BUILD_INFO.appVersion}`
        : `الإصدار ${displayVersion}`,
      onClick: handleVersionInfo,
    },
  ];

  // ── ألوان الحالة من Engine ──────────────────────────────────────────────
  const C = eng.planColor;

  return (
    <div className="p-4 md:p-6 space-y-5 page-enter max-w-xl">
      <div className="flex items-center gap-2">
        <User className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-black">الإعدادات</h1>
      </div>

      {/* ══════════════ الملف الشخصي ══════════════ */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">الملف الشخصي</h2>
          {!editing ? (
            <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5 ml-1" /> تعديل
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive"
                onClick={() => { setEditing(false); setFullName(profile?.full_name ?? ''); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="w-7 h-7 text-success"
                onClick={handleSaveProfile} disabled={saving}>
                {saving
                  ? <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />
                  : <Check className="w-3.5 h-3.5" />}
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center shrink-0">
            <span className="text-xl font-black text-primary">
              {(profile?.username ?? 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-bold truncate">{profile?.username ?? '—'}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.email ?? '—'}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-normal text-muted-foreground">الاسم الكامل</Label>
          {editing ? (
            <Input className="bg-muted border-border text-right h-9" value={fullName}
              onChange={e => setFullName(e.target.value)} placeholder="أدخل الاسم الكامل" />
          ) : (
            <p className="text-sm font-medium">{profile?.full_name ?? '—'}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">الدور</Label>
          <p className="text-sm font-medium">
            {profile?.role === 'super_admin' ? 'مدير عام'
              : profile?.role === 'admin' ? 'مسؤول'
              : 'مستخدم'}
          </p>
        </div>
      </div>

      {/* ══════════════ الكارت العلوي — الخطة + الحالة + الحد + الوقت ══════════════ */}
      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" style={{ color: C }} />
            <h2 className="text-sm font-semibold">حالة الاشتراك</h2>
          </div>
          {/* Badge الحالة */}
          {!eng.loading && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
              style={{ background: `${C}18`, border: `1px solid ${C}35`, color: C }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C }} />
              {eng.isActive ? 'نشط'
                : eng.status === 'none' ? 'لا يوجد'
                : 'منتهي'}
            </div>
          )}
        </div>

        {eng.loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="h-8 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : eng.status === 'none' ? (
          /* ─── بدون اشتراك ─── */
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-muted-foreground">لا يوجد اشتراك نشط</p>
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => navigate('/activate')}>
              تفعيل الاشتراك
            </Button>
          </div>
        ) : (
          /* ─── مستخدم عادي ─── */
          <div className="space-y-2">
            <div className={`flex items-center justify-between p-3 rounded-xl border`}
              style={{ background: `${C}10`, border: `1px solid ${C}25` }}>
              <span className="text-sm font-bold" style={{ color: C }}>
                {eng.isActive ? 'نشط' : 'منتهي'}
              </span>
              <Shield className="w-4 h-4" style={{ color: C }} />
            </div>

            {/* نوع الخطة */}
            <div className="flex items-center justify-between py-1.5 border-b border-border">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">نوع الخطة</span>
              </div>
              <span className="text-sm font-semibold" style={{ color: C }}>{eng.planName}</span>
            </div>

            {/* الحد الشهري */}
            <div className="flex items-center justify-between py-1.5 border-b border-border">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">الحد الشهري</span>
              </div>
              <span className="text-sm font-semibold tabular-nums" style={{ color: C }}>
                {!eng.isActive ? '—' : eng.opsLimit === null ? 'غير محدود ♾️' : String(eng.opsLimit)}
              </span>
            </div>

            {/* الوقت المتبقي */}
            <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">الوقت المتبقي</span>
              </div>
              <span className="text-sm font-semibold tabular-nums" style={{ color: eng.timeLeft.color }}>
                {eng.timeLeft.label}
              </span>
            </div>

            {/* شريط الوقت */}
            {!eng.isUnlimited && eng.subscription?.expires_at && (
              <MiniBar pct={eng.progressPct} color={C} />
            )}
          </div>
        )}
      </div>

      {/* ══════════════ الكارت السفلي — التواريخ + شريط الاستهلاك ══════════════ */}
      {!eng.loading && !eng.isAdmin && eng.status !== 'none' && (
        <div className="card-premium p-5 space-y-3">
          {/* تاريخ التفعيل */}
          <div className="flex items-center justify-between py-1.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">تاريخ التفعيل</span>
            </div>
            <span className="text-sm font-semibold tabular-nums">{eng.activatedAt}</span>
          </div>

          {/* تاريخ الانتهاء */}
          <div className="flex items-center justify-between py-1.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">تاريخ الانتهاء</span>
            </div>
            <span className="text-sm font-semibold tabular-nums" style={{ color: C }}>
              {eng.expiresAt}
            </span>
          </div>

          {/* شريط استهلاك الحصة — للمستخدم المحدود فقط */}
          {eng.opsLimit !== null && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">
                  استهلاك الحصة — {eng.opsUsed} / {eng.opsLimit}
                </span>
                <span className="font-bold tabular-nums"
                  style={{ color: eng.opsPct >= 90 ? '#ef4444' : eng.opsPct >= 60 ? '#F7C948' : '#22c55e' }}>
                  {eng.opsPct}%
                </span>
              </div>
              <MiniBar pct={eng.opsPct} color={
                eng.opsPct >= 90 ? '#ef4444' : eng.opsPct >= 60 ? '#F7C948' : '#22c55e'
              } />
              <p className="text-[10px] text-muted-foreground tabular-nums">
                متبقي: {eng.opsRem ?? 0} عملية
              </p>
            </div>
          )}

          {/* زر تفاصيل الاشتراك */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-9 text-primary border border-primary/20 hover:bg-primary/10"
            onClick={() => navigate('/subscription-detail')}
          >
            <Shield className="w-3.5 h-3.5 ml-1" />
            تفاصيل الاشتراك
            <ChevronLeft className="w-3.5 h-3.5 mr-auto" />
          </Button>

          {/* زر التجديد إن انتهى */}
          {eng.isExpired && (
            <Button
              className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => navigate('/activate')}
            >
              <Zap className="w-3.5 h-3.5 ml-1" />
              تفعيل / تجديد الاشتراك
            </Button>
          )}
        </div>
      )}

      {/* ══════════════ القائمة ══════════════ */}
      <div className="card-premium overflow-hidden divide-y divide-border">
        {menuItems.map(item => (
          <button key={item.label}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-muted/50 transition-colors text-right min-h-12"
            onClick={item.onClick}>
            <item.icon className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>

      {/* تسجيل الخروج */}
      <Button variant="outline"
        className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 h-11"
        onClick={() => setLogoutConfirm(true)}>
        <LogOut className="w-4 h-4 ml-2" /> تسجيل الخروج
      </Button>

      {/* ══════════════ التحديثات ══════════════ */}
      <button
        onClick={() => navigate('/updates')}
        className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border/50 bg-card hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#22c55e22' }}>
            <Download className="w-5 h-5 text-success" />
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">تحديثات التطبيق</p>
            <p className="text-[11px] text-muted-foreground">{displayVersion} · تنزيل APK وسجل الإصدارات</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasUpdate && (
            <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/15 px-1.5 py-0.5 rounded-full">جديد</span>
          )}
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </div>
      </button>

      {/* حول التطبيق */}
      <div className="card-premium p-4 text-center space-y-1.5">
        <p className="text-sm font-semibold gradient-text">Vodafone Fakka Premium</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {displayVersion} · Powered By <span className="text-primary font-semibold">Nader Akram</span>
          </p>
          {!hasUpdate && (
            <span className="text-[10px] bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full font-medium">
              ✓ أحدث إصدار
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">© 2026 Nader Akram · جميع الحقوق محفوظة</p>
      </div>

      {/* تأكيد الخروج */}
      <AlertDialog open={logoutConfirm} onOpenChange={setLogoutConfirm}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>تسجيل الخروج</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من تسجيل الخروج من حسابك؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="border-border">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleLogout}>
              خروج
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
