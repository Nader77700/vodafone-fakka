// التخطيط الرئيسي مع شريط التنقل السفلي (موبايل) والجانبي (ديسكتوب)
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateChecker } from '@/hooks/useUpdateChecker';
import {
  Home, Radio, Heart, Clock, Bell, Settings, Download,
  Shield, Menu, X, LogOut, ChevronLeft, Share2, Check, Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { OFFICIAL_LOGO } from '@/pages/SplashScreen';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

// الشريط الجانبي (ديسكتوب + موبايل sheet) — جميع الأقسام
const navItems = [
  { to: '/home',          icon: Home,     label: 'الرئيسية' },
  { to: '/networks',      icon: Radio,    label: 'الشبكات' },
  { to: '/favorites',     icon: Heart,    label: 'المفضلة' },
  { to: '/operations',    icon: Clock,    label: 'العمليات' },
  { to: '/notifications', icon: Bell,     label: 'الإشعارات' },
  { to: '/updates',       icon: Download, label: 'التحديثات' },
  { to: '/settings',      icon: Settings, label: 'الإعدادات' },
];

// الشريط السفلي — 5 أقسام أصلية كما كانت
const bottomNavItems = [
  { to: '/home',          icon: Home,     label: 'الرئيسية' },
  { to: '/networks',      icon: Radio,    label: 'الشبكات' },
  { to: '/favorites',     icon: Heart,    label: 'المفضلة' },
  { to: '/operations',    icon: Clock,    label: 'العمليات' },
  { to: '/notifications', icon: Bell,     label: 'الإشعارات' },
];

function NavLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 border border-primary/30"
        style={{ background: '#0d0000' }}>
        <img
          src={OFFICIAL_LOGO}
          alt="VFP"
          className="w-full h-full object-contain p-0.5"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = ''; e.currentTarget.style.display = 'none'; }}
        />
      </div>
      <div>
        <p className="text-sm font-black leading-tight">
          <span style={{ color: '#E60000' }}>Vodafone Fakka</span>
          <span className="text-foreground"> Premium</span>
        </p>
        <p className="text-[9px] text-muted-foreground leading-tight tracking-wide">by Nader Akram</p>
      </div>
    </div>
  );
}

export default function MainLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hasUpdate } = useUpdateChecker();
  const [shareCopied, setShareCopied] = useState(false);

  const isAdmin    = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isMerchant = profile?.role === 'merchant';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // يجلب apk_url الحالي دائماً من DB (يتحدث تلقائياً مع كل إصدار)
  const handleShareApk = async () => {
    const { data } = await supabase
      .from('app_versions')
      .select('version, apk_url')
      .eq('is_latest', true)
      .maybeSingle();
    const url = data?.apk_url;
    const ver = data?.version ?? '—';
    if (!url) { toast.error('تعذّر جلب رابط التحميل'); return; }
    const shareText = `📱 Vodafone Fakka Premium\n🚀 الإصدار v${ver}\n⬇️ تحميل APK:\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Vodafone Fakka v${ver}`, text: shareText, url }); return; } catch { /* أُغلقت */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      toast.success('✅ تم نسخ رابط التحميل');
      setTimeout(() => setShareCopied(false), 2500);
    } catch { toast.error('تعذّر النسخ'); }
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* ==================== شريط جانبي — ديسكتوب ==================== */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-sidebar border-l border-sidebar-border fixed right-0 top-0 bottom-0 z-40">
        {/* الشعار */}
        <div className="p-5 border-b border-sidebar-border">
          <NavLogo />
        </div>

        {/* التنقل */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary/15 text-primary border border-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {to === '/updates' && hasUpdate && (
                <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
              )}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="my-3 h-px bg-sidebar-border" />
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary/15 text-primary border border-primary/20'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`
                }
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>لوحة الإدارة</span>
              </NavLink>
            </>
          )}

          {isMerchant && (
            <>
              <div className="my-3 h-px bg-sidebar-border" />
              <NavLink
                to="/merchant"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary/15 text-primary border border-primary/20'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`
                }
              >
                <Building2 className="w-4 h-4 shrink-0" />
                <span>لوحة التاجر</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* معلومات المستخدم */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary">
                {(profile?.username ?? profile?.email ?? 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile?.username ?? 'مستخدم'}</p>
              <p className="text-xs text-muted-foreground">
                {profile?.role === 'super_admin' ? 'مدير عام' : profile?.role === 'admin' ? 'مسؤول' : profile?.role === 'merchant' ? 'تاجر' : 'مستخدم'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 ml-2" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* ==================== المحتوى الرئيسي ==================== */}
      <div className="flex-1 min-w-0 flex flex-col lg:mr-64">
        {/* هيدر موبايل */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-background/90 backdrop-blur-md border-b border-border">
          <NavLogo />
          <div className="flex items-center gap-1">
            {/* زر مشاركة رابط APK — يجلب الرابط الحالي دائماً من DB */}
            <Button
              variant="ghost" size="icon"
              className="w-9 h-9 text-muted-foreground hover:text-primary hover:bg-primary/10"
              onClick={handleShareApk}
              title="مشاركة رابط التحميل"
            >
              {shareCopied
                ? <Check className="w-4 h-4 text-success" />
                : <Share2 className="w-4 h-4" />}
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary"
                onClick={() => navigate('/admin')}
              >
                <Shield className="w-4 h-4" />
              </Button>
            )}
            {isMerchant && (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary"
                onClick={() => navigate('/merchant')}
              >
                <Building2 className="w-4 h-4" />
              </Button>
            )}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="w-9 h-9">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 bg-sidebar p-0">
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between p-5 border-b border-sidebar-border">
                    <NavLogo />
                    <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {/* معلومات المستخدم */}
                  <div className="p-4 border-b border-sidebar-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          {(profile?.username ?? 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{profile?.username ?? 'مستخدم'}</p>
                        <Badge variant="outline" className="text-[10px] mt-0.5">
                          {profile?.role === 'super_admin' ? 'مدير عام' : profile?.role === 'admin' ? 'مسؤول' : profile?.role === 'merchant' ? 'تاجر' : 'مستخدم'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {/* روابط */}
                  <nav className="flex-1 p-4 space-y-1">
                    {navItems.map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all min-h-12 ${
                            isActive
                              ? 'bg-primary/15 text-primary border border-primary/20'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent'
                          }`
                        }
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <span>{label}</span>
                        <ChevronLeft className="w-4 h-4 mr-auto opacity-40" />
                      </NavLink>
                    ))}
                    {isAdmin && (
                      <NavLink
                        to="/admin"
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all min-h-12 ${
                            isActive
                              ? 'bg-primary/15 text-primary border border-primary/20'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent'
                          }`
                        }
                      >
                        <Shield className="w-5 h-5 shrink-0" />
                        <span>لوحة الإدارة</span>
                        <ChevronLeft className="w-4 h-4 mr-auto opacity-40" />
                      </NavLink>
                    )}
                    {isMerchant && (
                      <NavLink
                        to="/merchant"
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all min-h-12 ${
                            isActive
                              ? 'bg-primary/15 text-primary border border-primary/20'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent'
                          }`
                        }
                      >
                        <Building2 className="w-5 h-5 shrink-0" />
                        <span>لوحة التاجر</span>
                        <ChevronLeft className="w-4 h-4 mr-auto opacity-40" />
                      </NavLink>
                    )}
                  </nav>
                  <div className="p-4 border-t border-sidebar-border">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => { setMobileOpen(false); handleSignOut(); }}
                    >
                      <LogOut className="w-4 h-4 ml-2" />
                      تسجيل الخروج
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* المحتوى */}
        <main className="flex-1 overflow-x-hidden pb-20 lg:pb-6">
          <Outlet />
        </main>

        {/* شريط تنقل سفلي — موبايل فقط: 5 أقسام أصلية */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-md border-t border-border">
          <div className="flex items-center justify-around px-2 py-2">
            {bottomNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `bottom-nav-item px-2 py-1 min-w-[52px] text-center ${isActive ? 'active' : ''}`}
              >
                <Icon className="w-5 h-5 mx-auto" />
                <span className="text-[10px]">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
