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

export default function VipPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';
  const urlSessionId = searchParams.get('session');

  const [verifying, setVerifying] = useState(true);
  const [authResult, setAuthResult] = useState<VipOwnerSessionVerification | null>(null);

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
  }, []);

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

      if (isManualRefresh) {
        toast.success('تم تحديث بيانات الجلسة بنجاح');
      }
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

  // Switch Active Session
  const handleSelectSession = (newSessionId: string) => {
    setActiveSessionId(newSessionId);
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

  // Find active session object
  const activeSession: VipSession | null =
    dashboardData?.session ||
    sessions.find((s) => s.id === activeSessionId) ||
    sessions[0] ||
    null;

  // ── Render Case 1: Checking Authentication ──
  if (verifying) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
          <Crown className="w-7 h-7 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">جاري التحقق من هوية المالك عبر السيرفر...</p>
          <p className="text-xs text-muted-foreground">تأمين الجلسة ومطابقة الصلاحيات المشددة</p>
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
            <h2 className="text-base font-bold text-foreground">قسم الإدارة الخاصة VIP مقيّد ومحمي</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              هذا القسم مخصص حصرياً للمالك المعتمد من قبل الخادم ولا يُسمح بالوصول إليه من قبل المستخدمين العاديين أو عبر صلاحيات واجهة المستخدم وحدها.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-background border border-border text-xs text-muted-foreground text-right space-y-1">
            <span className="font-semibold text-foreground block">إرشادات الوصول:</span>
            <p>1. يرجى تسجيل الدخول بحساب المالك المعتمد بالخادم (Nader Akram).</p>
            <p>2. إذا كنت المالك وقمت بتسجيل الدخول، تأكد من اعتماد هويتك في تكوين الخادم.</p>
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

  // ── Render Case 3: Authorized Owner View ──
  return (
    <div className="min-h-screen bg-background pb-16" dir="rtl">
      
      {/* ── Top Header / Branding Bar ── */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur-md px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/home')}
              className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
              title="العودة للرئيسية"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </Button>
            
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-primary/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Crown className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-black text-foreground">
                    إدارة باقات VIP <span className="text-primary font-mono">Multi-Session</span>
                  </h1>
                  <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px] px-1.5 py-0">
                    VIP Owner
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  مركز تحكم متعدد الجلسات لإدارة باقات الأونر والفرد والميكسات
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSessionsAndData(activeSessionId, true)}
              disabled={refreshing || loadingData}
              className="h-8 text-xs gap-1 border-border px-2.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </Button>
          </div>

        </div>
      </div>

      {/* ── Main Container (Compact layout matching Vodafone Red Business density) ── */}
      <main className="max-w-6xl mx-auto p-2.5 sm:p-4 space-y-2.5">
        
        {/* ── Multi-Session Switcher Bar ── */}
        {sessions.length > 0 && (
          <VipSessionSwitcher
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onSessionsChanged={() => loadSessionsAndData(activeSessionId, false)}
            disabled={loadingData || refreshing}
          />
        )}

        {loadingData && !dashboardData ? (
          <div className="min-h-[40vh] flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-5 h-5 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">جاري استرجاع بيانات الجلسة من الخادم...</p>
          </div>
        ) : dashboardData && activeSession ? (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-2.5">
            
            {/* Scrollable Tabs List */}
            <div className="overflow-x-auto pb-1 scrollbar-none">
              <TabsList className="bg-muted/50 p-1 rounded-xl h-auto border border-border inline-flex min-w-full sm:min-w-0">
                <TabsTrigger value="dashboard" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>لوحة التحكم</span>
                </TabsTrigger>

                <TabsTrigger value="cycles" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>سجل الدورات</span>
                </TabsTrigger>
                
                <TabsTrigger value="setup" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <UserCog className="w-3.5 h-3.5" />
                  <span>إعداد الحسابات</span>
                </TabsTrigger>

                <TabsTrigger value="manual" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>التحكم اليدوي</span>
                </TabsTrigger>

                <TabsTrigger value="automation" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <Zap className="w-3.5 h-3.5" />
                  <span>الأتمتة والجدولة</span>
                </TabsTrigger>

                <TabsTrigger value="eligibility" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>الأنظمة والأهلية</span>
                </TabsTrigger>

                <TabsTrigger value="history" className="text-xs gap-1.5 py-1.5 px-3 rounded-lg">
                  <History className="w-3.5 h-3.5" />
                  <span>سجل العمليات</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab 1: Dashboard */}
            <TabsContent value="dashboard" className="space-y-4 focus-visible:outline-none">
              <VipDashboardTab
                data={dashboardData}
                activeSession={activeSession}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
                refreshing={refreshing}
                onNavigateTab={handleTabChange}
              />
            </TabsContent>

            {/* Tab 2: Cycle-by-Cycle History */}
            <TabsContent value="cycles" className="space-y-4 focus-visible:outline-none">
              <VipCycleHistoryTab
                session={activeSession}
                initialCycles={dashboardData.recent_cycles}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
              />
            </TabsContent>

            {/* Tab 3: Account Setup */}
            <TabsContent value="setup" className="space-y-4 focus-visible:outline-none">
              <VipAccountSetupTab
                session={activeSession}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
              />
            </TabsContent>

            {/* Tab 4: Manual Controls */}
            <TabsContent value="manual" className="space-y-4 focus-visible:outline-none">
              <VipManualControlsTab
                data={dashboardData}
                activeSession={activeSession}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
              />
            </TabsContent>

            {/* Tab 5: Automation Controls */}
            <TabsContent value="automation" className="space-y-4 focus-visible:outline-none">
              <VipAutomationControlsTab
                data={dashboardData}
                activeSession={activeSession}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
              />
            </TabsContent>

            {/* Tab 6: Eligibility Rules */}
            <TabsContent value="eligibility" className="space-y-4 focus-visible:outline-none">
              <VipSystemEligibilityTab
                systems={dashboardData.supported_systems}
              />
            </TabsContent>

            {/* Tab 7: Operation History */}
            <TabsContent value="history" className="space-y-4 focus-visible:outline-none">
              <VipOperationHistoryTab
                initialRecords={dashboardData.recent_operations}
                activeSession={activeSession}
                onRefresh={() => loadSessionsAndData(activeSessionId, true)}
              />
            </TabsContent>

          </Tabs>
        ) : null}

      </main>

    </div>
  );
}
