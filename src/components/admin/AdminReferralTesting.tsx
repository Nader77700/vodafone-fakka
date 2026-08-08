/**
 * AdminReferralTesting — لوحة اختبار نظام الإحالات (Sandbox)
 * ════════════════════════════════════════════════════════════
 * - مخصص للأدمن فقط
 * - معزول تمامًا عن Production
 * - جميع البيانات في جداول referral_test_*
 */
import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Play, RotateCcw, Trash2, Users, FlaskConical, ListOrdered,
  CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp,
  Settings2, AlertTriangle, Info,
} from 'lucide-react';
import { supabase } from '@/db/supabase';

// ── الأنواع ────────────────────────────────────────────────
interface TestSettings {
  referral_req: number;
  reward_ops: number;
  min_transfer: number;
  expiry_days: number;
  daily_limit: number;
}

interface TestUser {
  id: string;
  role: 'referrer' | 'referred';
  username: string;
  referral_code: string | null;
  test_balance: number;
  account_status: string;
  subscription_status: string;
  device_fp: string;
  app_version: string;
  test_ip: string;
}

interface TestSession {
  id: string;
  session_name: string;
  status: 'running' | 'passed' | 'failed' | 'reset';
  started_at: string;
  ended_at: string | null;
  fail_step: string | null;
}

interface TestLog {
  id: string;
  step_name: string;
  status: 'pass' | 'fail' | 'skip' | 'info';
  data_before: unknown;
  data_after: unknown;
  error_msg: string | null;
  reject_reason: string | null;
  verify_result: string | null;
  logged_at: string;
}

interface ScenarioResult {
  scenario: string;
  status: 'pass' | 'fail';
  detail: string;
  data?: unknown;
}

interface FullTestResult {
  passed: boolean;
  failStep: string | null;
  steps: { step: string; status: 'pass' | 'fail'; detail: string }[];
  sessionId: string;
}

// ── دالة استدعاء الـ Edge Function ────────────────────────
async function callSandbox<T = unknown>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-test-sandbox`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'خطأ في الاتصال');
  return json as T;
}

// ── الإعدادات الافتراضية للاختبار ──────────────────────────
const DEFAULT_SETTINGS: TestSettings = {
  referral_req: 3,
  reward_ops: 5,
  min_transfer: 2,
  expiry_days: 1,
  daily_limit: 10,
};

// ── قائمة السيناريوهات الـ16 ──────────────────────────────
const SCENARIOS = [
  { key: 'task_complete',      label: 'اكتمال المهمة',              icon: '✅' },
  { key: 'task_incomplete',    label: 'عدم اكتمال المهمة',          icon: '⏸️' },
  { key: 'claim_reward',       label: 'المطالبة بالمكافأة',         icon: '🎁' },
  { key: 'claim_reject',       label: 'رفض المطالبة',               icon: '🚫' },
  { key: 'transfer',           label: 'محاكاة التحويل',             icon: '↗️' },
  { key: 'transfer_fail',      label: 'فشل التحويل',                icon: '❌' },
  { key: 'expiry',             label: 'انتهاء الصلاحية',            icon: '⌛' },
  { key: 'use_ops',            label: 'استخدام العمليات',           icon: '⚡' },
  { key: 'test_min_transfer',  label: 'اختبار الحد الأدنى',         icon: '📊' },
  { key: 'test_daily_limit',   label: 'الحد اليومي للدعوات',        icon: '📅' },
  { key: 'test_duplicate',     label: 'منع تكرار الحساب',           icon: '🔒' },
  { key: 'test_eligible',      label: 'الحساب المؤهل',              icon: '✔️' },
  { key: 'test_ineligible',    label: 'الحساب غير المؤهل',          icon: '⛔' },
  { key: 'accept_referral',    label: 'قبول الإحالة',               icon: '👍' },
  { key: 'verify_referrer_name', label: 'ظهور اسم الداعي',          icon: '👤' },
  { key: 'count_referrals',    label: 'احتساب الإحالات',            icon: '🔢' },
];

// ══════════════════════════════════════════════════════════
// المكوّن الرئيسي
// ══════════════════════════════════════════════════════════
export default function AdminReferralTesting() {
  // الإعدادات
  const [settings, setSettings] = useState<TestSettings>({ ...DEFAULT_SETTINGS });

  // الجلسة الحالية
  const [session, setSession] = useState<TestSession | null>(null);
  const [testUsers, setTestUsers] = useState<TestUser[]>([]);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [sessions, setSessions] = useState<TestSession[]>([]);

  // نتائج
  const [scenarioResults, setScenarioResults] = useState<Record<string, ScenarioResult>>({});
  const [fullTestResult, setFullTestResult] = useState<FullTestResult | null>(null);

  // تكوين المستخدمين الاختباريين
  const [userConfig, setUserConfig] = useState({
    referrerCount: 1,
    referredCount: 3,
    device_fp: '',
    app_version: '',
    test_ip: '',
    account_status: 'active',
    subscription_status: 'active',
  });

  // السيناريو المختار
  const [selectedReferrer, setSelectedReferrer] = useState('');
  const [selectedReferred, setSelectedReferred] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // حالة التحميل
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const setLoad = (key: string, val: boolean) => setLoading(p => ({ ...p, [key]: val }));

  // ── إنشاء جلسة جديدة ──────────────────────────────────
  const handleCreateSession = useCallback(async () => {
    setLoad('session', true);
    try {
      const { session: s } = await callSandbox<{ session: TestSession }>('create_session', {
        name: `جلسة اختبار ${new Date().toLocaleString('ar-EG')}`,
        settings,
      });
      setSession(s);
      setTestUsers([]);
      setLogs([]);
      setScenarioResults({});
      setFullTestResult(null);
      toast.success('تم إنشاء جلسة اختبار جديدة');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoad('session', false);
    }
  }, [settings]);

  // ── إنشاء مستخدمي الاختبار ────────────────────────────
  const handleCreateUsers = useCallback(async () => {
    if (!session) { toast.warning('أنشئ جلسة أولاً'); return; }
    setLoad('users', true);
    try {
      const { users } = await callSandbox<{ users: TestUser[] }>('create_test_users', {
        sessionId: session.id,
        referrerCount: userConfig.referrerCount,
        referredCount: userConfig.referredCount,
        config: {
          device_fp: userConfig.device_fp || undefined,
          app_version: userConfig.app_version || undefined,
          test_ip: userConfig.test_ip || undefined,
          account_status: userConfig.account_status,
          subscription_status: userConfig.subscription_status,
        },
      });
      setTestUsers(users);
      const referrer = users.find(u => u.role === 'referrer');
      if (referrer) setSelectedReferrer(referrer.id);
      const referred = users.find(u => u.role === 'referred');
      if (referred) setSelectedReferred(referred.id);
      toast.success(`تم إنشاء ${users.length} مستخدم اختباري`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoad('users', false);
    }
  }, [session, userConfig]);

  // ── تشغيل سيناريو محدد ────────────────────────────────
  const handleRunScenario = useCallback(async (scenario: string) => {
    if (!session) { toast.warning('أنشئ جلسة أولاً'); return; }
    setLoad(scenario, true);
    try {
      const { result } = await callSandbox<{ result: ScenarioResult }>('run_scenario', {
        sessionId: session.id,
        scenario,
        referrerId: selectedReferrer || undefined,
        referredId: selectedReferred || undefined,
        settings,
      });
      setScenarioResults(p => ({ ...p, [scenario]: result }));
      // تحديث السجلات
      const { logs: newLogs } = await callSandbox<{ logs: TestLog[] }>('get_logs', { sessionId: session.id });
      setLogs(newLogs);
      if (result.status === 'pass') toast.success(`✅ ${SCENARIOS.find(s => s.key === scenario)?.label}: ناجح`);
      else toast.error(`❌ ${SCENARIOS.find(s => s.key === scenario)?.label}: فشل`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoad(scenario, false);
    }
  }, [session, selectedReferrer, selectedReferred, settings]);

  // ── تشغيل الاختبار الكامل ─────────────────────────────
  const handleFullTest = useCallback(async () => {
    setLoad('full', true);
    setFullTestResult(null);
    try {
      const result = await callSandbox<FullTestResult>('run_full_test', { settings });
      setFullTestResult(result);
      setSession({ id: result.sessionId, session_name: 'Full Auto Test', status: result.passed ? 'passed' : 'failed', started_at: new Date().toISOString(), ended_at: new Date().toISOString(), fail_step: result.failStep });
      const { logs: newLogs } = await callSandbox<{ logs: TestLog[] }>('get_logs', { sessionId: result.sessionId });
      setLogs(newLogs);
      if (result.passed) toast.success('🎉 الاختبار الكامل: ناجح (PASS)');
      else toast.error(`❌ الاختبار فشل عند: ${result.failStep}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoad('full', false);
    }
  }, [settings]);

  // ── إعادة تعيين بيانات الاختبار ───────────────────────
  const handleReset = useCallback(async () => {
    setLoad('reset', true);
    try {
      await callSandbox('reset_test_data', session ? { sessionId: session.id } : {});
      setTestUsers([]);
      setLogs([]);
      setScenarioResults({});
      setFullTestResult(null);
      setSession(null);
      toast.success('تم مسح جميع بيانات الاختبار');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoad('reset', false);
    }
  }, [session]);

  // ── مسح السجلات فقط ───────────────────────────────────
  const handleClearLogs = useCallback(async () => {
    setLoad('clearLogs', true);
    try {
      await callSandbox('clear_logs', session ? { sessionId: session.id } : {});
      setLogs([]);
      toast.success('تم مسح السجلات');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoad('clearLogs', false);
    }
  }, [session]);

  // ── جلب الجلسات السابقة ───────────────────────────────
  const handleGetSessions = useCallback(async () => {
    setLoad('sessions', true);
    try {
      const { sessions: s } = await callSandbox<{ sessions: TestSession[] }>('get_sessions');
      setSessions(s);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoad('sessions', false);
    }
  }, []);

  // ── تحميل سجلات جلسة سابقة ────────────────────────────
  const handleLoadSession = useCallback(async (s: TestSession) => {
    setSession(s);
    const [{ logs: newLogs }, { users }] = await Promise.all([
      callSandbox<{ logs: TestLog[] }>('get_logs', { sessionId: s.id }),
      callSandbox<{ users: TestUser[] }>('get_test_users', { sessionId: s.id }),
    ]);
    setLogs(newLogs);
    setTestUsers(users);
  }, []);

  // ── مكوّن لون الحالة ──────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pass:    { variant: 'default',     label: 'ناجح' },
      passed:  { variant: 'default',     label: 'ناجح' },
      fail:    { variant: 'destructive', label: 'فاشل' },
      failed:  { variant: 'destructive', label: 'فاشل' },
      info:    { variant: 'secondary',   label: 'معلومة' },
      skip:    { variant: 'outline',     label: 'متخطى' },
      running: { variant: 'secondary',   label: 'جارٍ' },
      reset:   { variant: 'outline',     label: 'مُعاد' },
    };
    const cfg = map[status] ?? { variant: 'outline' as const, label: status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  // ════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 p-1" dir="rtl">
      {/* ── رأس الصفحة ── */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            نظام اختبار الإحالات (Sandbox)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            بيئة اختبار معزولة — لا تأثير على Production
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="default"
            onClick={handleFullTest}
            disabled={loading['full']}
            className="gap-2"
          >
            {loading['full'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            تشغيل الاختبار الكامل
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={loading['reset']} className="gap-2">
            {loading['reset'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            إعادة تعيين البيانات
          </Button>
          <Button variant="outline" onClick={handleClearLogs} disabled={loading['clearLogs']} className="gap-2">
            {loading['clearLogs'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            مسح السجلات
          </Button>
        </div>
      </div>

      {/* ── نتيجة الاختبار الكامل ── */}
      {fullTestResult && (
        <Card className={fullTestResult.passed ? 'border-green-500/50 bg-green-500/5' : 'border-destructive/50 bg-destructive/5'}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {fullTestResult.passed
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <XCircle className="h-5 w-5 text-destructive" />}
              نتيجة الاختبار الكامل: {fullTestResult.passed ? 'PASS ✅' : 'FAILED ❌'}
              {!fullTestResult.passed && (
                <span className="text-sm text-muted-foreground mr-2">فشل عند: {fullTestResult.failStep}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {fullTestResult.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs bg-card border rounded px-2 py-1">
                  {s.status === 'pass'
                    ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    : <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                  <span className="truncate max-w-[140px]">{s.step}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
          <TabsTrigger value="settings" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" />الإعدادات</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" />المستخدمون</TabsTrigger>
          <TabsTrigger value="scenarios" className="gap-1.5"><Play className="h-3.5 w-3.5" />السيناريوهات</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5"><ListOrdered className="h-3.5 w-3.5" />السجلات</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><FlaskConical className="h-3.5 w-3.5" />الجلسات</TabsTrigger>
        </TabsList>

        {/* ══ إعدادات الاختبار المؤقتة ══ */}
        <TabsContent value="settings">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">إعدادات الاختبار المؤقتة</CardTitle>
                <CardDescription>تُطبَّق فقط على بيانات الاختبار — لا تغيّر Production</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: 'referral_req', label: 'عدد الإحالات المطلوبة' },
                  { key: 'reward_ops',   label: 'المكافأة (عمليات)' },
                  { key: 'min_transfer', label: 'الحد الأدنى للتحويل' },
                  { key: 'expiry_days',  label: 'مدة الصلاحية (أيام)' },
                  { key: 'daily_limit',  label: 'الحد اليومي للدعوات' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <Label className="w-44 shrink-0 text-sm">{label}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={settings[key as keyof TestSettings]}
                      onChange={e => setSettings(p => ({ ...p, [key]: Number(e.target.value) || 1 }))}
                      className="w-24"
                    />
                  </div>
                ))}
                <Separator />
                <Button variant="outline" size="sm" onClick={() => setSettings({ ...DEFAULT_SETTINGS })}>
                  إعادة للإعدادات الافتراضية
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">إدارة الجلسة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {session ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">الجلسة الحالية:</span>
                      <span className="font-medium truncate">{session.session_name}</span>
                      <StatusBadge status={session.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID: <code className="bg-muted px-1 rounded">{session.id.substring(0, 8)}...</code>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      المستخدمون: {testUsers.length} | السجلات: {logs.length}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">لا توجد جلسة نشطة</p>
                )}
                <Button onClick={handleCreateSession} disabled={loading['session']} className="w-full gap-2">
                  {loading['session'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  إنشاء جلسة اختبار جديدة
                </Button>
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded p-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    كل جلسة منفصلة — البيانات لا تُؤثر على المستخدمين الحقيقيين
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══ مولّد المستخدمين ══ */}
        <TabsContent value="users">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Test User Generator</CardTitle>
                <CardDescription>إنشاء مستخدمي اختبار بإعدادات مخصصة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">عدد Referrers</Label>
                    <Input type="number" min={1} max={5} value={userConfig.referrerCount}
                      onChange={e => setUserConfig(p => ({ ...p, referrerCount: Number(e.target.value) || 1 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">عدد Referred Users</Label>
                    <Input type="number" min={1} max={10} value={userConfig.referredCount}
                      onChange={e => setUserConfig(p => ({ ...p, referredCount: Number(e.target.value) || 1 }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Device FP (اختياري)</Label>
                  <Input placeholder="TEST-FP-AUTO" value={userConfig.device_fp}
                    onChange={e => setUserConfig(p => ({ ...p, device_fp: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">App Version</Label>
                    <Input placeholder="TEST-1.0.0" value={userConfig.app_version}
                      onChange={e => setUserConfig(p => ({ ...p, app_version: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Test IP</Label>
                    <Input placeholder="192.168.99.1" value={userConfig.test_ip}
                      onChange={e => setUserConfig(p => ({ ...p, test_ip: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">حالة الحساب</Label>
                    <Select value={userConfig.account_status} onValueChange={v => setUserConfig(p => ({ ...p, account_status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">نشط</SelectItem>
                        <SelectItem value="suspended">موقوف</SelectItem>
                        <SelectItem value="banned">محظور</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">حالة الاشتراك</Label>
                    <Select value={userConfig.subscription_status} onValueChange={v => setUserConfig(p => ({ ...p, subscription_status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">مشترك</SelectItem>
                        <SelectItem value="none">غير مشترك</SelectItem>
                        <SelectItem value="expired">منتهي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleCreateUsers} disabled={loading['users'] || !session} className="w-full gap-2">
                  {loading['users'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  إنشاء المستخدمين
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">المستخدمون الحاليون</CardTitle>
              </CardHeader>
              <CardContent>
                {testUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">لا يوجد مستخدمون — أنشئ جلسة أولاً</p>
                ) : (
                  <ScrollArea className="h-72">
                    <div className="space-y-2 pr-2">
                      {testUsers.map(u => (
                        <div key={u.id} className="border rounded p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm">{u.username}</span>
                            <Badge variant={u.role === 'referrer' ? 'default' : 'secondary'}>
                              {u.role === 'referrer' ? 'داعي' : 'مدعو'}
                            </Badge>
                          </div>
                          {u.referral_code && (
                            <div className="text-xs text-muted-foreground">كود: <code className="bg-muted px-1 rounded">{u.referral_code}</code></div>
                          )}
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>رصيد: <strong>{u.test_balance}</strong></span>
                            <span>IP: {u.test_ip}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══ السيناريوهات الـ16 ══ */}
        <TabsContent value="scenarios">
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">تحديد المستخدمَين</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <div className="space-y-1.5 flex-1 min-w-[180px]">
                <Label className="text-xs">المستخدم الداعي (Referrer)</Label>
                <Select value={selectedReferrer} onValueChange={setSelectedReferrer}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الداعي" />
                  </SelectTrigger>
                  <SelectContent>
                    {testUsers.filter(u => u.role === 'referrer').map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 flex-1 min-w-[180px]">
                <Label className="text-xs">المستخدم المُحال (Referred)</Label>
                <Select value={selectedReferred} onValueChange={setSelectedReferred}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المُحال" />
                  </SelectTrigger>
                  <SelectContent>
                    {testUsers.filter(u => u.role === 'referred').map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {SCENARIOS.map(sc => {
              const res = scenarioResults[sc.key];
              return (
                <Card key={sc.key} className={
                  res?.status === 'pass' ? 'border-green-500/40' :
                  res?.status === 'fail' ? 'border-destructive/40' : ''
                }>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium leading-tight">{sc.icon} {sc.label}</div>
                        {res && (
                          <p className="text-xs text-muted-foreground mt-1 leading-snug">{res.detail}</p>
                        )}
                      </div>
                      {res && <StatusBadge status={res.status} />}
                    </div>
                    <Button
                      size="sm"
                      variant={res ? (res.status === 'pass' ? 'outline' : 'destructive') : 'default'}
                      className="w-full h-7 text-xs gap-1"
                      onClick={() => handleRunScenario(sc.key)}
                      disabled={loading[sc.key] || !session}
                    >
                      {loading[sc.key] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      {res ? 'إعادة التشغيل' : 'تشغيل'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ══ سجلات الاختبار ══ */}
        <TabsContent value="logs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Test Logs</CardTitle>
                <CardDescription>كل خطوة بالتفصيل: الوقت، الحالة، البيانات قبل/بعد</CardDescription>
              </div>
              <Badge variant="outline">{logs.length} سجل</Badge>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
                  <Info className="h-8 w-8 opacity-40" />
                  <p className="text-sm">لا توجد سجلات — شغّل سيناريو أو الاختبار الكامل</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2 pr-2">
                    {logs.map(log => (
                      <div key={log.id} className="border rounded overflow-hidden">
                        <button
                          className="w-full flex items-center gap-3 p-3 text-right hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        >
                          {log.status === 'pass' && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                          {log.status === 'fail' && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                          {log.status === 'info' && <Info className="h-4 w-4 text-blue-500 shrink-0" />}
                          {log.status === 'skip' && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                          <div className="flex-1 min-w-0 text-right">
                            <div className="text-sm font-medium truncate">{log.step_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(log.logged_at).toLocaleTimeString('ar-EG')}
                              {log.verify_result && <span className="mr-2">· {log.verify_result}</span>}
                              {log.error_msg && <span className="mr-2 text-destructive">· {log.error_msg}</span>}
                              {log.reject_reason && <span className="mr-2 text-amber-600">· {log.reject_reason}</span>}
                            </div>
                          </div>
                          <StatusBadge status={log.status} />
                          {expandedLog === log.id ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                        </button>
                        {expandedLog === log.id && (
                          <div className="border-t bg-muted/30 p-3 space-y-2 text-xs">
                            {log.data_before != null && (
                              <div>
                                <span className="font-medium text-muted-foreground">البيانات قبل: </span>
                                <code className="bg-muted rounded px-1">{JSON.stringify(log.data_before)}</code>
                              </div>
                            )}
                            {log.data_after != null && (
                              <div>
                                <span className="font-medium text-muted-foreground">البيانات بعد: </span>
                                <code className="bg-muted rounded px-1">{JSON.stringify(log.data_after)}</code>
                              </div>
                            )}
                            {log.error_msg && (
                              <div className="text-destructive"><span className="font-medium">خطأ: </span>{log.error_msg}</div>
                            )}
                            {log.reject_reason && (
                              <div className="text-amber-600"><span className="font-medium">سبب الرفض: </span>{log.reject_reason}</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ الجلسات السابقة ══ */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">الجلسات السابقة</CardTitle>
              <Button variant="outline" size="sm" onClick={handleGetSessions} disabled={loading['sessions']} className="gap-1.5">
                {loading['sessions'] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                تحديث
              </Button>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">اضغط "تحديث" لجلب الجلسات</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map(s => (
                    <div key={s.id} className="border rounded p-3 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{s.session_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.started_at).toLocaleString('ar-EG')}
                          {s.fail_step && <span className="text-destructive mr-2">· فشل عند: {s.fail_step}</span>}
                        </div>
                      </div>
                      <StatusBadge status={s.status} />
                      <Button size="sm" variant="outline" onClick={() => handleLoadSession(s)} className="shrink-0 h-7 text-xs">
                        فتح
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
