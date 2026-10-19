import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Code2,
  Network,
  Smartphone,
  Save,
  RefreshCw,
  Copy,
  Check,
  Zap,
  Globe2,
  ShieldCheck,
  Dices,
  Download,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getVipBridgeConfig,
  updateVipBridgeConfig,
  testVipBridgeConnection,
  getVipBotScripts,
  saveVipBotScript,
  type VipBridgeConfigData,
  type VipBotScriptData,
} from '@/lib/vipApi';

export function VipBotScriptTab() {
  const [activeSubTab, setActiveSubTab] = useState<'script' | 'bridge' | 'devices'>('bridge');
  
  // Bridge Config States
  const [bridgeConfig, setBridgeConfig] = useState<VipBridgeConfigData>({
    bridge_enabled: false,
    bridge_url: '',
    bridge_mode: 'direct',
    owner_device_id: 'b61c90c58c612671',
    owner_model_type: 'CPH2737',
    owner_os_version: '16',
    owner_user_agent: 'okhttp/5.0.0-alpha.11',
    owner_simulated_ip: '196.205.142.23',
    child_device_id: 'f28a90d41e7391b5',
    child_model_type: 'SM-S928B',
    child_os_version: '14',
    child_user_agent: 'okhttp/4.12.0',
    child_simulated_ip: '156.204.81.44',
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingBridge, setTestingBridge] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Bot Script States
  const [scripts, setScripts] = useState<VipBotScriptData[]>([]);
  const [activeScriptCode, setActiveScriptCode] = useState<string>('');
  const [scriptVersion, setScriptVersion] = useState<string>('v1.0.0');
  const [scriptName, setScriptName] = useState<string>('اسكريبت اتصالات VIP المباشر');
  const [scriptNotes, setScriptNotes] = useState<string>('');
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [savingScript, setSavingScript] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Load Bridge Config
  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const data = await getVipBridgeConfig();
      if (data) {
        setBridgeConfig(data);
      }
    } catch {
      toast.error('تعذر تحميل إعدادات الجسر والبصمات');
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // Load Scripts
  const fetchScripts = useCallback(async () => {
    setLoadingScripts(true);
    try {
      const list = await getVipBotScripts();
      setScripts(list);
      const active = list.find((s) => s.is_active) || list[0];
      if (active) {
        setActiveScriptCode(active.script_code);
        setScriptVersion(active.version);
        setScriptName(active.name);
        setScriptNotes(active.notes || '');
      }
    } catch {
      toast.error('تعذر تحميل قائمة الاسكريبتات');
    } finally {
      setLoadingScripts(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchScripts();
  }, [fetchConfig, fetchScripts]);

  // Save Bridge & Devices
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await updateVipBridgeConfig(bridgeConfig);
      toast.success('تم حفظ إعدادات الجسر وبصمات الأجهزة بنجاح');
    } catch (err: any) {
      toast.error(err?.message || 'فشل حفظ الإعدادات');
    } finally {
      setSavingConfig(false);
    }
  };

  // Test Bridge Connection
  const handleTestBridge = async () => {
    setTestingBridge(true);
    setTestResult(null);
    try {
      const res = await testVipBridgeConnection();
      setTestResult(res);
      if (res.status_code === 200 || res.status_code === 405) {
        toast.success(`تم الاتصال بالسيرفر بنجاح! الاستجابة: ${res.latency_ms}ms`);
      } else {
        toast.warning(`حالة الاتصال: ${res.status} (${res.latency_ms}ms)`);
      }
    } catch (err: any) {
      setTestResult({ success: false, status: err?.message || 'فشل الاتصال', latency_ms: 0 });
      toast.error('فشل اختبار الاتصال بالسيرفر');
    } finally {
      setTestingBridge(false);
    }
  };

  // Generate Fresh Random Device Fingerprints
  const handleGenerateRandomDevices = () => {
    const randomHex = (len: number) =>
      Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const randomOwnerId = randomHex(16);
    const randomChildId = randomHex(16);

    // Randomize IPs in Egyptian Telecom IP ranges
    // Etisalat Egypt range: 196.205.x.x
    const ownerIp = `196.205.${Math.floor(Math.random() * 200 + 10)}.${Math.floor(Math.random() * 250 + 2)}`;
    // WE Egypt range: 156.204.x.x or 197.38.x.x
    const childIp = `156.204.${Math.floor(Math.random() * 200 + 10)}.${Math.floor(Math.random() * 250 + 2)}`;

    setBridgeConfig((prev) => ({
      ...prev,
      owner_device_id: randomOwnerId,
      child_device_id: randomChildId,
      owner_simulated_ip: ownerIp,
      child_simulated_ip: childIp,
    }));

    toast.success('تم توليد بصمات أجهزة وأيبيهات مصرية جديدة ومعزولة لكلا الحسابين!');
  };

  // Save Bot Script
  const handleSaveScript = async () => {
    if (!activeScriptCode.trim()) {
      toast.error('كود الاسكريبت فارغ');
      return;
    }
    setSavingScript(true);
    try {
      await saveVipBotScript({
        name: scriptName,
        version: scriptVersion,
        script_code: activeScriptCode,
        is_active: true,
        notes: scriptNotes,
      });
      toast.success('تم حفظ وتفعيل الاسكريبت بنجاح على الخادم!');
      fetchScripts();
    } catch (err: any) {
      toast.error(err?.message || 'فشل حفظ الاسكريبت');
    } finally {
      setSavingScript(false);
    }
  };

  // Copy code to clipboard
  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeScriptCode);
    setCopiedCode(true);
    toast.success('تم نسخ كود الاسكريبت إلى الحافظة');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Download script as file
  const handleDownloadCode = () => {
    const element = document.createElement('a');
    const file = new Blob([activeScriptCode], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `etisalat_bot_${scriptVersion}.py`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Banner */}
      <Card className="border border-primary/30 bg-gradient-to-r from-primary/10 via-background to-secondary/10">
        <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                <Network className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-foreground">
                مركز إدارة الاسكريبت والجسر وبصمات الأجهزة (Egypt Local Bridge & Fingerprints)
              </h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              تأمين العزل الكامل بين جهاز الأونر وجهاز الفرد لمنع حظر السيرفر، مع إمكانية توجيه الاتصال عبر جسر محلي داخل مصر، وتعديل وتحديث كود الاسكريبت مباشرة دون الحاجة لرفع تحديث جديد.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchConfig();
                fetchScripts();
              }}
              disabled={loadingConfig || loadingScripts}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingConfig || loadingScripts ? 'animate-spin' : ''}`} />
              تحديث البيانات
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs Menu */}
      <Tabs value={activeSubTab} onValueChange={(val) => setActiveSubTab(val as any)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-xl mx-auto h-9 bg-muted/60 p-1 rounded-xl">
          <TabsTrigger value="bridge" className="text-xs gap-1.5 rounded-lg">
            <Globe2 className="w-3.5 h-3.5" />
            <span>الجسر المحلي (Proxy Bridge)</span>
          </TabsTrigger>
          <TabsTrigger value="devices" className="text-xs gap-1.5 rounded-lg">
            <Smartphone className="w-3.5 h-3.5" />
            <span>بصمات الأجهزة المعزولة</span>
          </TabsTrigger>
          <TabsTrigger value="script" className="text-xs gap-1.5 rounded-lg">
            <Code2 className="w-3.5 h-3.5" />
            <span>محرر كود الاسكريبت</span>
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* SUB-TAB 1: EGYPTIAN BRIDGE & PROXY */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="bridge" className="space-y-4 pt-2">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-primary" />
                    إعدادات الجسر المحلي في مصر (Egyptian IP Proxy / Bridge)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    توجيه كافة طلبات API عبر خادم أو بروكسي محلي في مصر لتفادي حظر اتصالات للسيرفرات الخارجية
                  </CardDescription>
                </div>
                <Badge
                  variant={bridgeConfig.bridge_enabled ? 'default' : 'secondary'}
                  className="text-[11px] px-2 py-0.5"
                >
                  {bridgeConfig.bridge_enabled ? 'الجسر مفعل' : 'اتصال مباشر مع محاكاة IP مصر'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Bridge Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card/60">
                <div className="space-y-0.5">
                  <Label htmlFor="bridge-toggle" className="text-xs font-semibold text-foreground cursor-pointer">
                    تفعيل توجيه الطلبات عبر الجسر المحلي (Proxy Bridge)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    عند التفعيل، سيتم إرسال جميع طلبات اتصالات عبر خادم الجسر المحدد بدلاً من الاتصال المباشر
                  </p>
                </div>
                <Switch
                  id="bridge-toggle"
                  checked={bridgeConfig.bridge_enabled}
                  onCheckedChange={(checked) => setBridgeConfig((prev) => ({ ...prev, bridge_enabled: checked }))}
                />
              </div>

              {/* Bridge URL & Auth */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">عنوان خادم الجسر أو البروكسي (Bridge Endpoint / Proxy URL)</Label>
                  <Input
                    placeholder="مثال: http://my-egypt-vps.com:8080 أو https://proxy.domain.com"
                    value={bridgeConfig.bridge_url}
                    onChange={(e) => setBridgeConfig((prev) => ({ ...prev, bridge_url: e.target.value }))}
                    className="font-mono text-xs"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    يمكنك استخدام عنوان سيرفر محلي في مصر أو خدمة Cloudflare Worker موجهة لمصر
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">رمز المصادقة أو التوكن (اختياري)</Label>
                  <Input
                    placeholder="Bearer token أو كلمة مرور الخادم إن وجدت"
                    value={bridgeConfig.bridge_auth || ''}
                    onChange={(e) => setBridgeConfig((prev) => ({ ...prev, bridge_auth: e.target.value }))}
                    className="font-mono text-xs"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    يتم إرساله في ترويسة X-Bridge-Auth لتأمين جسرك الخاص
                  </p>
                </div>
              </div>

              {/* Status & Test Ping Area */}
              <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    فحص الاتصال بسيرفر اتصالات (mab.etisalat.com.eg)
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleTestBridge}
                    disabled={testingBridge}
                    className="h-7 text-xs gap-1.5"
                  >
                    <Zap className={`w-3.5 h-3.5 ${testingBridge ? 'animate-pulse text-amber-500' : ''}`} />
                    {testingBridge ? 'جاري الفحص...' : 'اختبار سرعة واستجابة الاتصال'}
                  </Button>
                </div>

                {testResult && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/60">
                    <div className="p-2 rounded-lg bg-background border border-border text-center">
                      <span className="text-[10px] text-muted-foreground block">الحالة</span>
                      <span className="text-xs font-bold text-emerald-500">
                        {testResult.status || 'متصل'}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border text-center">
                      <span className="text-[10px] text-muted-foreground block">زمن الاستجابة (Ping)</span>
                      <span className="text-xs font-mono font-bold text-foreground">
                        {testResult.latency_ms} ms
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border text-center">
                      <span className="text-[10px] text-muted-foreground block">IP الأونر المستخدم</span>
                      <span className="text-[11px] font-mono text-foreground truncate block">
                        {testResult.owner_ip || bridgeConfig.owner_simulated_ip}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-background border border-border text-center">
                      <span className="text-[10px] text-muted-foreground block">IP الفرد المستخدم</span>
                      <span className="text-[11px] font-mono text-foreground truncate block">
                        {testResult.child_ip || bridgeConfig.child_simulated_ip}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="text-xs h-8 gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingConfig ? 'جاري الحفظ...' : 'حفظ إعدادات الجسر'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* SUB-TAB 2: ISOLATED DEVICE FINGERPRINTS & IPS */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="devices" className="space-y-4 pt-2">
          {/* Note Banner */}
          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <span className="font-bold text-foreground block">عزل كامل بين جهازي الأونر والفرد:</span>
              <p className="text-muted-foreground">
                يضمن هذا النظام ظهور حساب الأونر وحساب الفرد لسيرفر اتصالات وكأنهما يعملان على هاتفين مختلفين تماماً (موديلات مختلفة، معرفات أجهزة مختلفة، وترويسات IP مصرية منفصلة) لتفادي أي شبهات هجوم أو حظر دخول متزامن.
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-foreground">بيانات بصمات الأجهزة الحالية:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateRandomDevices}
              className="text-xs h-7 gap-1.5 border-dashed"
            >
              <Dices className="w-3.5 h-3.5 text-primary" />
              توليد بصمات وأيبيهات عشوائية جديدة
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Owner Device Card */}
            <Card className="border border-border/80 bg-card">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-primary" />
                    بصمة جهاز الأونر (Owner Device Profile)
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                    جهاز 1 (Oppo / Android 16)
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">معرف الجهاز (Device ID / UDID - 16 Hex)</Label>
                  <Input
                    value={bridgeConfig.owner_device_id}
                    onChange={(e) => setBridgeConfig((p) => ({ ...p, owner_device_id: e.target.value }))}
                    className="font-mono text-xs h-8"
                    dir="ltr"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">موديل الجهاز (Model Type)</Label>
                    <Input
                      value={bridgeConfig.owner_model_type}
                      onChange={(e) => setBridgeConfig((p) => ({ ...p, owner_model_type: e.target.value }))}
                      className="font-mono text-xs h-8"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">إصدار الأندرويد (OS Version)</Label>
                    <Input
                      value={bridgeConfig.owner_os_version}
                      onChange={(e) => setBridgeConfig((p) => ({ ...p, owner_os_version: e.target.value }))}
                      className="font-mono text-xs h-8"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">IP المصري المحاكى (Etisalat Range: 196.205.x.x)</Label>
                  <Input
                    value={bridgeConfig.owner_simulated_ip}
                    onChange={(e) => setBridgeConfig((p) => ({ ...p, owner_simulated_ip: e.target.value }))}
                    className="font-mono text-xs h-8"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">User-Agent</Label>
                  <Input
                    value={bridgeConfig.owner_user_agent}
                    onChange={(e) => setBridgeConfig((p) => ({ ...p, owner_user_agent: e.target.value }))}
                    className="font-mono text-xs h-8"
                    dir="ltr"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Child Device Card */}
            <Card className="border border-border/80 bg-card">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-secondary-foreground" />
                    بصمة جهاز الفرد (Child Device Profile)
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                    جهاز 2 (Samsung / Android 14)
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">معرف الجهاز (Device ID / UDID - 16 Hex)</Label>
                  <Input
                    value={bridgeConfig.child_device_id}
                    onChange={(e) => setBridgeConfig((p) => ({ ...p, child_device_id: e.target.value }))}
                    className="font-mono text-xs h-8"
                    dir="ltr"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">موديل الجهاز (Model Type)</Label>
                    <Input
                      value={bridgeConfig.child_model_type}
                      onChange={(e) => setBridgeConfig((p) => ({ ...p, child_model_type: e.target.value }))}
                      className="font-mono text-xs h-8"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">إصدار الأندرويد (OS Version)</Label>
                    <Input
                      value={bridgeConfig.child_os_version}
                      onChange={(e) => setBridgeConfig((p) => ({ ...p, child_os_version: e.target.value }))}
                      className="font-mono text-xs h-8"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">IP المصري المحاكى (Telecom Range: 156.204.x.x)</Label>
                  <Input
                    value={bridgeConfig.child_simulated_ip}
                    onChange={(e) => setBridgeConfig((p) => ({ ...p, child_simulated_ip: e.target.value }))}
                    className="font-mono text-xs h-8"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">User-Agent</Label>
                  <Input
                    value={bridgeConfig.child_user_agent}
                    onChange={(e) => setBridgeConfig((p) => ({ ...p, child_user_agent: e.target.value }))}
                    className="font-mono text-xs h-8"
                    dir="ltr"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="text-xs h-8 gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {savingConfig ? 'جاري الحفظ...' : 'حفظ بصمات الأجهزة'}
            </Button>
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* SUB-TAB 3: DYNAMIC SCRIPT CODE EDITOR */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="script" className="space-y-4 pt-2">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-primary" />
                    محرر الاسكريبت المباشر وتحديثات البوت (Dynamic Script Manager)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    يمكنك تعديل كود الاسكريبت، لصق اسكريبت جديد، أو تحديث العمليات وحفظها فوراً دون الحاجة لرفع تطبيق جديد
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCode}
                    className="h-7 text-xs gap-1"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'تم النسخ' : 'نسخ الكود'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadCode}
                    className="h-7 text-xs gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    تحميل (.py)
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Script Info Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">اسم الاسكريبت</Label>
                  <Input
                    value={scriptName}
                    onChange={(e) => setScriptName(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">رقم الإصدار</Label>
                  <Input
                    value={scriptVersion}
                    onChange={(e) => setScriptVersion(e.target.value)}
                    className="font-mono text-xs h-8"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">ملاحظات التحديث</Label>
                  <Input
                    value={scriptNotes}
                    onChange={(e) => setScriptNotes(e.target.value)}
                    placeholder="مثال: تحديث استرجاع الميكسات"
                    className="text-xs h-8"
                  />
                </div>
              </div>

              {/* Version History Quick Selector */}
              {scripts.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                  <span className="text-muted-foreground shrink-0">النسخ المحفوظة:</span>
                  {scripts.map((s) => (
                    <Button
                      key={s.id}
                      variant={s.is_active ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setActiveScriptCode(s.script_code);
                        setScriptVersion(s.version);
                        setScriptName(s.name);
                        setScriptNotes(s.notes || '');
                        toast.info(`تم تحميل النسخة ${s.version}`);
                      }}
                      className="h-6 text-[11px] px-2 gap-1 rounded-md"
                    >
                      <span>{s.version}</span>
                      {s.is_active && <Badge className="h-3.5 px-1 text-[9px] bg-background text-foreground">نشط</Badge>}
                    </Button>
                  ))}
                </div>
              )}

              {/* Code Textarea Editor */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>محرر الكود (Python / Automation Logic)</span>
                  <span className="font-mono">{activeScriptCode.length.toLocaleString('en-US')} حرف</span>
                </div>
                <Textarea
                  value={activeScriptCode}
                  onChange={(e) => setActiveScriptCode(e.target.value)}
                  rows={16}
                  className="font-mono text-xs bg-muted/30 border-border p-3 leading-relaxed whitespace-pre"
                  dir="ltr"
                  spellCheck={false}
                />
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchScripts}
                  className="text-xs text-muted-foreground h-8 gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  إعادة تعيين للتعديلات غير المحفوظة
                </Button>

                <Button
                  onClick={handleSaveScript}
                  disabled={savingScript}
                  className="text-xs h-8 gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingScript ? 'جاري الحفظ والتفعيل...' : 'حفظ وتفعيل هذا الاسكريبت على الخادم'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
