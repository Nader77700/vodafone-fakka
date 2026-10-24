import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShieldAlert,
  ShieldCheck,
  Crown,
  LayoutDashboard,
  UserCog,
  Sliders,
  Zap,
  RotateCcw,
  Cpu,
  History,
  ArrowRight,
  RefreshCw,
  Lock,
  ChevronLeft,
  Code2,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  verifyVipOwnerSession,
  getVipDashboardData,
  listVipSessions,
} from '@/lib/vipApi';
import type {
  VipDashboardData,
  VipOwnerSessionVerification,
  VipSession,
} from '@/types/vip';

// Component: Session Switcher
import { VipSessionSwitcher } from '@/components/vip/VipSessionSwitcher';

// Sub Tabs
import { VipDashboardTab } from './VipDashboardTab';
import { VipAccountSetupTab } from './VipAccountSetupTab';
import { VipManualControlsTab } from './VipManualControlsTab';
import { VipAutomationControlsTab } from './VipAutomationControlsTab';
import { VipCycleHistoryTab } from './VipCycleHistoryTab';
import { VipSystemEligibilityTab } from './VipSystemEligibilityTab';
import { VipOperationHistoryTab } from './VipOperationHistoryTab';
import { VipBotScriptTab } from './VipBotScriptTab';
import { VipDiagnosticsTab } from './VipDiagnosticsTab';
import { VipDelegatedClientView } from '@/components/vip/VipDelegatedClientView';
import { VipDelegationManagerTab } from '@/components/vip/VipDelegationManagerTab';
import { VipSessionInspectorTab } from '@/components/vip/VipSessionInspectorTab';
import { VipSecurityTamperTab } from '@/components/vip/VipSecurityTamperTab';
import { checkVipAccessServer, type VipAccessStatus } from '@/services/vipDelegationService';
import { supabase } from '@/db/supabase';

interface VipPageProps {
  shareToken?: string;
  isTemporaryShareMode?: boolean;
}

export default function VipPage({ shareToken, isTemporaryShareMode }: VipPageProps = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';
  const urlSessionId = searchParams.get('session');

  const [verifying, setVerifying] = useState(true);
  const [authResult, setAuthResult] = useState<VipOwnerSessionVerification | null>(null);
  const [vipAccess, setVipAccess] = useState<VipAccessStatus | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

  // Multi-Session states
  const [sessions, setSessions] = useState<VipSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  
  const [dashboardData, setDashboardData] = useState<VipDashboardData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 1. Server-side Authorization Check
  const checkOwnerAuth = useCallback(async () => {
    setVerifying(true);
    try {
      // Check if accessed in temporary share mode
      if (
        isTemporaryShareMode ||
        (typeof window !== 'undefined' &&
          (window.location.pathname.startsWith('/vip-share') ||
            window.location.pathname.startsWith('/temp-vip')))
      ) {
        setAuthResult({
          is_authorized: true,
          user_id: 'temp-share-access',
          is_verified_owner: true,
          verified_at: new Date().toISOString(),
          owner_account_identifier: 'nader77@miaoda.com',
        });
        await loadSessionsAndData();
        return;
      }

      // First check user session from Supabase
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (user) {
        setCurrentUserId(user.id);
        setCurrentUserEmail(user.email || '');
        const access = await checkVipAccessServer(user.id);
        setVipAccess(access);

        // If user is delegated client (not owner)
        if (access.is_delegated && !access.is_owner) {
          setAuthResult({
            is_authorized: true,
            user_id: user.id,
            is_verified_owner: false,
            verified_at: new Date().toISOString(),
          });
          try {
            // Load sessions and dashboard for delegated user
            await loadSessionsAndData();
          } finally {
            setVerifying(false);
          }
          return;
        }
      }

      const result = await verifyVipOwnerSession();
      setAuthResult(result);
      if (result.is_authorized) {
        // Load sessions list first
        await loadSessionsAndData();
      }
    } catch (err) {
      console.error('[VipPage] Auth check failed:', err);
      setAuthResult({ is_authorized: false, reason: 'network_or_server_error' });
    } finally {
      setVerifying(false);
    }
  }, [isTemporaryShareMode]);

  // 2. Load Sessions & Dashboard Data
  const loadSessionsAndData = async (preferredSessionId?: string, isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoadingData(true);

    try {
      // Step A: Load Sessions
      const fetchedSessions = await listVipSessions();
      setSessions(fetchedSessions);

      // Determine active session
      let targetId = preferredSessionId || activeSessionId || urlSessionId;
      if (!targetId || !fetchedSessions.some((s) => s.id === targetId)) {
        targetId = fetchedSessions[0]?.id || 'default';
      }
      setActiveSessionId(targetId);

      // Step B: Load Dashboard details for this active session
      const data = await getVipDashboardData(targetId);
      setDashboardData(data);

      // Silent background sync — do NOT show an intrusive banner toast that covers the UI
    } catch (err: any) {
      console.error('[VipPage] Failed to load data:', err);
      toast.error('تعذر جلب بيانات قسم VIP: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    checkOwnerAuth();
  }, [checkOwnerAuth]);

  // Switch Active Session with Full Data & State Isolation
  const handleSelectSession = (newSessionId: string) => {
    setActiveSessionId(newSessionId);
    setDashboardData(null); // Completely flush previous session's dashboard data
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('session', newSessionId);
      return next;
    });
    loadSessionsAndData(newSessionId, false);
  };

  const handleTabChange = (val: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', val);
      return next;
    });
  };

  // Find active session object strictly matched to activeSessionId
  const activeSession: VipSession | null =
    (dashboardData?.session && dashboardData.session.id === activeSessionId)
      ? dashboardData.session
      : (sessions.find((s) => s.id === activeSessionId) || sessions[0] || null);

  // ── Render Case 1: Checking Authentication ──
  if (verifying) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
          <Crown className="w-7 h-7 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">جاري التحقق من صلاحيات المستخدم على السيرفر...</p>
          <p className="text-xs text-muted-foreground">فحص وتأمين رتبة الحساب ومطابقة الصلاحيات السحابية</p>
        </div>
      </div>
    );
  }

  // ── Render Case 2: Unauthorized / Access Denied ──
  if (!authResult?.is_authorized) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-4 max-w-lg mx-auto text-center" dir="rtl">
        <Card className="border border-destructive/30 bg-destructive/5 p-6 w-full space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto text-destructive">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-foreground">قسم الإدارة الخاصة VIP مقيّد ومحمي سيرفرياً</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              هذا القسم مخصص ومحمي سيرفرياً بنظام Zero-Trust ضد أي تلاعب أو هندسة عكسية. حتى لو تم تعديل رتبة الحساب محلياً أو تفكيك ملفات التطبيق، يرفض السيرفر أي وصول برمز 403 ولا يُسرّب أي بيانات.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-background border border-border text-xs text-muted-foreground text-right space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>إرشادات الوصول والأمان:</span>
            </div>
            <p>1. يتطلب حساباً مفعلاً ومفوضاً من قبل المالك العام للنظام.</p>
            <p>2. يتم التحقق وتوقيع الجلسة مشفراً مع قاعدة البيانات ومنفذ السيرفر في نفس اللحظة.</p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkOwnerAuth()}
              className="text-xs h-8 gap-1 border-border"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة التحقق من الجلسة
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/home')}
              className="text-xs h-8 gap-1"
            >
              العودة للرئيسية
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const isDelegatedUser = Boolean(vipAccess?.is_delegated && !vipAccess?.is_owner);

  // ── Render Case 3: Unified Full VIP View (Restricted & Zero-Trust Protected for Delegated Users) ──
  return (
    <div className="min-h-screen bg-background pb-16" dir="rtl">
      
      {/* ── Top Header / Branding Bar (Fixed Sticky Header) ── */}
      <div className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md px-3 py-2 sm:px-4 sm:py-2.5 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2.5">
          
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/home')}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
              title="العودة للرئيسية"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </Button>
            
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-primary/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-xs sm:text-sm font-black text-foreground truncate">
                    إدارة باقات VIP (الأونر والفرد)
                  </h1>
                  {isDelegatedUser ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px] px-1.5 py-0 font-mono">
                      مستخدم مفوض (Zero-Trust Verified)
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[9px] px-1.5 py-0 font-mono">
                      VIP Owner
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground hidden sm:block truncate">
                  مركز تحكم متعدد الجلسات لإدارة باقات الأونر والفرد والميكسات والرقابة الصارمة
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSessionsAndData(activeSessionId, true)}
              disabled={refreshing || loadingData}
              className="h-7 sm:h-8 text-[11px] sm:text-xs gap-1 border-border px-2 sm:px-2.5"
            >
              <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </Button>
          </div>

        </div>
      </div>

      {/* ── Main Container (Compact layout matching Vodafone Red Business density) ── */}
      <main className="max-w-6xl mx-auto p-2.5 sm:p-4 space-y-2.5">
        
        {/* ── Multi-Session Switcher Bar (Always visible) ── */}
        <VipSessionSwitcher
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onSessionsChanged={() => loadSessionsAndData(activeSessionId, false)}
          disabled={loadingData || refreshing}
          isDelegatedUser={isDelegatedUser}
          vipAccess={vipAccess}
        />

        {loadingData && !dashboardData ? (
          <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-5 h-5 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">جاري استرجاع بيانات الجلسة من الخادم...</p>
          </div>
        ) : sessions.length === 0 || !activeSession ? (
          <div className="rounded-2xl border-2 border-dashed border-border/80 bg-card/60 p-8 sm:p-12 text-center space-y-4 max-w-2xl mx-auto my-8">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 mx-auto">
              <Crown className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-black text-foreground">
                لا توجد أي جلسة اتصالات VIP مسجلة حالياً
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                تم إيقاف كافة الأتمتة المفتوحة بنجاح حتى لا تبدأ أي عملية تلقائياً. يمكنك الآن إضافة جلسة جديدة بحساب الأونر والفرد للبدء بالفحص والتحويل.
              </p>
            </div>
          </div>
        ) : dashboardData && activeSession ? (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-2.5">
            
            {/* Streamlined Clean Tabs */}
            <div className="overflow-x-auto pb-1 scrollbar-none">
              <TabsList className="bg-muted/50 p-1 rounded-xl h-auto border border-border inline-flex min-w-full sm:min-w-0">
                <TabsTrigger value="dashboard" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg font-bold">
                  <LayoutDashboard className="w-3.5 h-3.5 text-primary" />
                  <span>لوحة الجلسة النشطة والأتمتة</span>
                </TabsTrigger>

                <TabsTrigger value="cycles" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>سجل الدورات المكتملة</span>
                </TabsTrigger>

                <TabsTrigger value="manual" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>الأوامر اليدوية المباشرة</span>
                </TabsTrigger>

                <TabsTrigger value="history" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <History className="w-3.5 h-3.5" />
                  <span>سجل العمليات</span>
                </TabsTrigger>

                <TabsTrigger value="diagnostics" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg font-bold">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  <span>مراقبة وتشخيص السكريبت</span>
                </TabsTrigger>

                {!isDelegatedUser && (
                  <>
                    <TabsTrigger value="script" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                      <Code2 className="w-3.5 h-3.5 text-primary" />
                      <span>الاسكريبت والجسر والأجهزة</span>
                    </TabsTrigger>

                    <TabsTrigger value="delegation" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg font-bold bg-amber-500/10 text-amber-400">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                      <span>إدارة باقات VIP (الأونر والفرد)</span>
                    </TabsTrigger>

                    <TabsTrigger value="inspector" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg font-bold">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <span>فاحص جلسات المستخدمين</span>
                    </TabsTrigger>

                    <TabsTrigger value="tamper" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg text-destructive font-bold">
                      <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
                      <span>سجل كشف التلاعب والحظر</span>
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            {/* Tab 1: Dashboard (Unified Master Card + Auto Loop + Live Terminal) */}
            <TabsContent value="dashboard" className="space-y-4 focus-visible:outline-none">
              <VipDashboardTab
                key={activeSession?.id || 'empty-dashboard'}
                data={dashboardData}
                activeSession={activeSession}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
                refreshing={refreshing}
                onNavigateTab={handleTabChange}
                isDelegatedUser={isDelegatedUser}
                vipAccess={vipAccess}
              />
            </TabsContent>

            {/* Tab 2: Cycle-by-Cycle History */}
            <TabsContent value="cycles" className="space-y-4 focus-visible:outline-none">
              <VipCycleHistoryTab
                key={activeSession?.id || 'empty-cycles'}
                session={activeSession}
                initialCycles={dashboardData?.recent_cycles || []}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
              />
            </TabsContent>

            {/* Tab 3: Manual Direct Controls */}
            <TabsContent value="manual" className="space-y-4 focus-visible:outline-none">
              <VipManualControlsTab
                key={activeSession?.id || 'empty-manual'}
                data={dashboardData}
                activeSession={activeSession}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
              />
            </TabsContent>

            {/* Tab 4: Operation History */}
            <TabsContent value="history" className="space-y-4 focus-visible:outline-none">
              <VipOperationHistoryTab
                key={activeSession?.id || 'empty-history'}
                initialRecords={dashboardData?.recent_operations || []}
                activeSession={activeSession}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
              />
            </TabsContent>

            {/* Tab 5: Script Diagnostics & Error Monitor */}
            <TabsContent value="diagnostics" className="space-y-4 focus-visible:outline-none">
              <VipDiagnosticsTab
                key={activeSession?.id || 'empty-diagnostics'}
                activeSession={activeSession}
                allSessions={sessions}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
              />
            </TabsContent>

            {/* Tab 6: Dynamic Script, Egypt Bridge & Device Fingerprints */}
            <TabsContent value="script" className="space-y-4 focus-visible:outline-none">
              <VipBotScriptTab />
            </TabsContent>

            {/* Tab 7: Delegated Users & Quota Limits */}
            <TabsContent value="delegation" className="space-y-4 focus-visible:outline-none">
              <VipDelegationManagerTab />
            </TabsContent>

            {/* Tab 8: User Sessions & Error Inspector */}
            <TabsContent value="inspector" className="space-y-4 focus-visible:outline-none">
              <VipSessionInspectorTab />
            </TabsContent>

            {/* Tab 9: Anti-Tamper & Security Audit */}
            <TabsContent value="tamper" className="space-y-4 focus-visible:outline-none">
              <VipSecurityTamperTab />
            </TabsContent>

          </Tabs>
        ) : null}

      </main>

    </div>
  );
}
