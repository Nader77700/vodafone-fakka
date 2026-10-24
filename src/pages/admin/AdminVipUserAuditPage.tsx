import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Crown,
  Activity,
  History,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  Copy,
  Sliders,
  AlertTriangle,
  Zap,
  Phone,
  KeyRound,
  FileText,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import {
  getDelegatedVipUsers,
  saveDelegatedUser,
  getVipExecutionLogs,
  type DelegatedUser,
  type VipExecutionLog,
} from '@/services/vipDelegationService';

export default function AdminVipUserAuditPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<DelegatedUser | null>(null);
  const [logs, setLogs] = useState<VipExecutionLog[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [revealSecrets, setRevealSecrets] = useState(false);

  // Form states for permissions
  const [isActive, setIsActive] = useState(true);
  const [maxCycles, setMaxCycles] = useState(10);
  const [maxMixes, setMaxMixes] = useState(500000);
  const [allowedPackages, setAllowedPackages] = useState<number[]>([50000, 100000]);
  const [cooldownSeconds, setCooldownSeconds] = useState(30);
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Fetch user delegation profile
      const users = await getDelegatedVipUsers();
      const target = users.find((u: DelegatedUser) => u.user_id === userId || u.id === userId);
      if (target) {
        setUser(target);
        setIsActive(target.is_active);
        setMaxCycles(target.max_daily_cycles);
        setMaxMixes(target.max_daily_mixes || 500000);
        setAllowedPackages(target.allowed_packages || [50000, 100000]);
        setCooldownSeconds(target.cooldown_seconds || target.min_cooldown_seconds || 30);
        setNotes(target.notes || '');
      }

      // 2. Fetch logs for this user
      const allLogs = await getVipExecutionLogs(100);
      setLogs(allLogs);

      // 3. Fetch all VIP raw sessions from Supabase
      const { data: rawSessions } = await supabase
        .from('vip_sessions')
        .select('*')
        .order('created_at', { ascending: false });
      setSessions(rawSessions || []);
    } catch (err: any) {
      console.error('[AdminVipUserAuditPage] Error:', err);
      toast.error('تعذر جلب تفاصيل المستخدم: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const togglePackage = (pkg: number) => {
    setAllowedPackages((prev) =>
      prev.includes(pkg) ? prev.filter((p) => p !== pkg) : [...prev, pkg].sort((a, b) => a - b)
    );
  };

  const handleSavePermissions = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { success, error } = await saveDelegatedUser({
        user_id: user.user_id,
        user_email: user.user_email || '',
        user_name: user.user_name,
        is_active: isActive,
        max_daily_cycles: maxCycles,
        max_daily_mixes: maxMixes,
        allowed_packages: allowedPackages,
        cooldown_seconds: cooldownSeconds,
        notes: notes,
      });

      if (!success) {
        throw new Error(error || 'فشل التحديث');
      }

      toast.success('تم حفظ صلاحيات وقيود المستخدم بنجاح!');
      await loadData();
    } catch (err: any) {
      toast.error('خطأ أثناء حفظ الصلاحيات: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center space-y-3" dir="rtl">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm font-semibold text-foreground">جاري فتح صفحة تدقيق وصلاحيات المستخدم VIP...</p>
      </div>
    );
  }

  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center space-y-4" dir="rtl">
        <XCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-base font-bold text-foreground">المستخدم غير موجود أو تم إلغاء تفويضه</h2>
        <Button onClick={() => navigate('/admin?tab=vip_delegation')} className="gap-2">
          <ArrowRight className="w-4 h-4" />
          <span>العودة لإدارة باقات VIP</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16" dir="rtl">
      {/* Top Sticky Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border shadow-xs px-3.5 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate('/admin?tab=vip_delegation')}
              className="w-8 h-8 rounded-lg shrink-0 border-border"
              title="العودة لإدارة VIP"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-black text-foreground truncate">
                  إدارة وتدقيق المستخدم: {user?.user_name || user?.user_email || userId}
                </h1>
                <Badge
                  className={
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]'
                      : 'bg-destructive/15 text-destructive border-destructive/30 text-[10px]'
                  }
                >
                  {isActive ? 'مفوض نشط' : 'معطل ومحظور'}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground truncate font-mono">
                معرف المستخدم: {user?.user_id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="h-8 text-xs gap-1.5 border-border"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto p-3.5 sm:p-6 space-y-4">
        {/* Row 1: Real-time Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <Card className="bg-card border-border p-3 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              الدورات اليومية
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black text-foreground">
                {user?.cycle_count_today || 0} / {user?.max_daily_cycles || 10}
              </span>
              <span className="text-[10px] text-muted-foreground">
                المتبقي: {Math.max(0, (user?.max_daily_cycles || 10) - (user?.cycle_count_today || 0))}
              </span>
            </div>
          </Card>

          <Card className="bg-card border-border p-3 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Crown className="w-3.5 h-3.5 text-primary" />
              الميكسات اليومية
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black text-foreground">
                {((user?.mixes_consumed_today || 0) / 1000).toFixed(0)}k
              </span>
              <span className="text-[10px] text-muted-foreground">
                السقف: {((user?.max_daily_mixes || 500000) / 1000).toFixed(0)}k
              </span>
            </div>
          </Card>

          <Card className="bg-card border-border p-3 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              الفاصل الزمني
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black text-foreground">
                {user?.cooldown_seconds || 30} ثانية
              </span>
              <span className="text-[10px] text-muted-foreground">سيرفري</span>
            </div>
          </Card>

          <Card className="bg-card border-border p-3 space-y-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              إجمالي السجلات
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black text-foreground">{logs.length}</span>
              <span className="text-[10px] text-emerald-400">
                ناجح: {logs.filter((l) => l.status === 'success').length}
              </span>
            </div>
          </Card>
        </div>

        {/* Row 2: Permissions & Restrictions Editor (Direct Control) */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-4 border-b border-border">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                <span>التحكم المباشر في صلاحيات وقيود المستخدم (Zero-Trust Server Enforcement)</span>
              </div>
              <Button
                size="sm"
                onClick={handleSavePermissions}
                disabled={saving}
                className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-bold px-4"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>حفظ التعديلات في السيرفر</span>
              </Button>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-4 space-y-4">
            {/* Status Switch */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border">
              <div>
                <p className="text-xs font-bold text-foreground">تفعيل إمكانية الوصول والتنفيذ</p>
                <p className="text-[11px] text-muted-foreground">
                  عند التعطيل، يرفض السيرفر فوراً أي أمر تشغيل أو استعلام من هذا المستخدم
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            {/* Grid of Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  سقف الدورات اليومية (دورة/يوم)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={maxCycles}
                  onChange={(e) => setMaxCycles(parseInt(e.target.value) || 1)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  سقف الميكسات اليومية (ميكس)
                </label>
                <Input
                  type="number"
                  step="10000"
                  min="10000"
                  max="2000000"
                  value={maxMixes}
                  onChange={(e) => setMaxMixes(parseInt(e.target.value) || 50000)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  الفاصل الزمني الإجباري (ثانية)
                </label>
                <Input
                  type="number"
                  min="10"
                  max="600"
                  value={cooldownSeconds}
                  onChange={(e) => setCooldownSeconds(parseInt(e.target.value) || 30)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Allowed Packages Selectors */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">
                الخانات المصرح للمستخدم باختيارها (Packages Allowed)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[50000, 100000, 150000, 200000].map((pkg) => {
                  const isChecked = allowedPackages.includes(pkg);
                  return (
                    <button
                      key={pkg}
                      type="button"
                      onClick={() => togglePackage(pkg)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex items-center justify-between ${
                        isChecked
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 font-bold'
                          : 'bg-muted/20 border-border text-muted-foreground hover:border-border/80'
                      }`}
                    >
                      <span className="text-xs">{pkg / 1000}k ميكس</span>
                      {isChecked ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 opacity-40" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                * أي خانة غير محددة هنا، ستظهر للمستخدم في شاشته الأساسية مقفولة برمز قفل ولا يمكنه بدء الدورة عليها.
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">ملاحظات الإدارة حول هذا المستخدم</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: مستخدم تجاري موثوق / مسموح له بباقة 50k و 100k فقط"
                className="h-9 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Row 3: Connected VIP Sessions Inspector */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <span>فاحص جلسات اتصالات VIP وبيانات الحسابات</span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevealSecrets((prev) => !prev)}
              className="h-7 text-xs gap-1 border-border"
            >
              {revealSecrets ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{revealSecrets ? 'إخفاء كلمات المرور' : 'إظهار بيانات الدخول'}</span>
            </Button>
          </CardHeader>

          <CardContent className="p-4 space-y-3">
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">لا توجد جلسات مسجلة حالياً</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sessions.map((sess) => (
                  <div key={sess.id} className="p-3 rounded-xl bg-muted/20 border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Crown className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-xs font-bold text-foreground">{sess.session_name}</span>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-mono">
                        {sess.id}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div className="p-2 rounded-lg bg-background border border-border/60 space-y-1">
                        <span className="text-muted-foreground block text-[10px]">حساب الأونر (Owner)</span>
                        <p className="font-semibold truncate text-foreground">{sess.owner_email || 'غير محدد'}</p>
                        <p className="text-muted-foreground truncate font-mono">
                          {sess.owner_dial ? `0${sess.owner_dial}` : '—'}
                        </p>
                        {revealSecrets && sess.owner_password_enc && (
                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40">
                            <span className="text-[10px] font-mono text-emerald-400 truncate">
                              {(() => {
                                try {
                                  return atob(sess.owner_password_enc);
                                } catch {
                                  return sess.owner_password_enc;
                                }
                              })()}
                            </span>
                            <button
                              onClick={() => {
                                try {
                                  handleCopy(atob(sess.owner_password_enc), 'كلمة مرور الأونر');
                                } catch {
                                  handleCopy(sess.owner_password_enc, 'كلمة مرور الأونر');
                                }
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="p-2 rounded-lg bg-background border border-border/60 space-y-1">
                        <span className="text-muted-foreground block text-[10px]">حساب الفرد (Child)</span>
                        <p className="font-semibold truncate text-foreground">{sess.child_email || 'غير محدد'}</p>
                        <p className="text-muted-foreground truncate font-mono">
                          {sess.child_dial ? `0${sess.child_dial}` : '—'}
                        </p>
                        {revealSecrets && sess.child_password_enc && (
                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40">
                            <span className="text-[10px] font-mono text-emerald-400 truncate">
                              {(() => {
                                try {
                                  return atob(sess.child_password_enc);
                                } catch {
                                  return sess.child_password_enc;
                                }
                              })()}
                            </span>
                            <button
                              onClick={() => {
                                try {
                                  handleCopy(atob(sess.child_password_enc), 'كلمة مرور الفرد');
                                } catch {
                                  handleCopy(sess.child_password_enc, 'كلمة مرور الفرد');
                                }
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Row 4: Complete User Execution Audit Log Table */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-4 border-b border-border">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-400" />
                <span>سجل العمليات والتدقيق التاريخي الكامل لهذا المستخدم ({logs.length})</span>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                لم يقم هذا المستخدم بتنفيذ أي دورات حتى الآن
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-muted/40 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="p-3 font-semibold whitespace-nowrap">الوقت والتاريخ</th>
                      <th className="p-3 font-semibold whitespace-nowrap">نوع الإجراء</th>
                      <th className="p-3 font-semibold whitespace-nowrap">الحالة</th>
                      <th className="p-3 font-semibold whitespace-nowrap">الميكسات المطلوبة</th>
                      <th className="p-3 font-semibold whitespace-nowrap">الملخص للمستخدم</th>
                      <th className="p-3 font-semibold whitespace-nowrap">المدة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                        <td className="p-3 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('ar-EG')}
                        </td>
                        <td className="p-3 whitespace-nowrap font-semibold text-foreground">
                          {log.action_type === 'run_cycle'
                            ? 'تشغيل دورة VIP'
                            : log.action_type === 'check_status'
                            ? 'فحص رصيد'
                            : log.action_type}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {log.status === 'success' ? (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                              ناجحة
                            </Badge>
                          ) : log.status === 'cooldown_blocked' ? (
                            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                              محظور بالكولد داون
                            </Badge>
                          ) : log.status === 'limit_reached' ? (
                            <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px]">
                              تجاوز السقف اليومي
                            </Badge>
                          ) : (
                            <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">
                              فشلت ({log.error_reason || 'خطأ'})
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap font-mono text-amber-400">
                          {log.mixes_requested ? `${(log.mixes_requested / 1000).toFixed(0)}k` : '—'}
                        </td>
                        <td className="p-3 text-[11px] text-foreground max-w-xs truncate">
                          {log.client_summary || '—'}
                        </td>
                        <td className="p-3 whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                          {log.execution_time_ms ? `${(log.execution_time_ms / 1000).toFixed(1)} ث` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
