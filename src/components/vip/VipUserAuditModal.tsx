import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  getUserAuditFull,
  type UserAuditDetails,
} from '@/services/vipDelegationService';
import {
  User,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Clock,
  ShieldCheck,
  KeyRound,
  RefreshCw,
  Terminal,
  Activity,
  AlertTriangle,
} from 'lucide-react';

interface VipUserAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
}

export function VipUserAuditModal({
  open,
  onOpenChange,
  userId,
  userEmail,
}: VipUserAuditModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UserAuditDetails | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const audit = await getUserAuditFull(userId);
      setData(audit);
    } catch (err) {
      console.error('Error loading user audit:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && userId) {
      loadData();
    }
  }, [open, userId]);

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full h-full max-h-[100dvh] sm:max-w-3xl sm:max-h-[90vh] sm:rounded-2xl rounded-none inset-0 p-3 sm:p-5 flex flex-col overflow-hidden bg-card border-border shadow-2xl" dir="rtl">
        {/* شريط رأس متكامل للهواتف والشاشات الكبيرة */}
        <DialogHeader className="pb-2.5 border-b border-border/80 text-right space-y-0 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-xs sm:text-base font-bold text-foreground truncate">
                    سجل ومراجعة المستخدم الشاملة
                  </DialogTitle>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/30 text-amber-500 shrink-0">
                    تدقيق المالك
                  </Badge>
                </div>
                <DialogDescription className="text-[11px] text-muted-foreground font-mono truncate" dir="ltr">
                  {userEmail}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="h-8 text-xs px-2.5 gap-1.5 border-border"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">تحديث</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {loading && !data ? (
          <div className="flex-1 py-16 flex flex-col items-center justify-center gap-2.5 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs sm:text-sm">جاري جلب السجل الكامل والبيانات المشفرة...</span>
          </div>
        ) : !data ? (
          <div className="flex-1 py-12 text-center text-xs text-muted-foreground flex items-center justify-center">
            تعذر جلب تفاصيل المستخدم من السيرفر
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 space-y-3.5 pt-2 pr-0.5">
            {/* Quick KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-xl bg-background border border-border shadow-xs">
                <div className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">التفعيلات اليوم</div>
                <div className="text-base sm:text-lg font-bold text-foreground mt-0.5 font-mono">
                  {data.delegation?.cycle_count_today ?? 0}
                  <span className="text-[10px] sm:text-[11px] font-normal text-muted-foreground">
                    {' '}/ {data.delegation?.max_daily_cycles ?? 'غير محدد'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-background border border-border shadow-xs">
                <div className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">إجمالي العمليات</div>
                <div className="text-base sm:text-lg font-bold text-foreground mt-0.5 font-mono">
                  {data.stats.total_ops}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-background border border-border shadow-xs">
                <div className="text-[10px] sm:text-[11px] text-emerald-500 font-medium">العمليات الناجحة</div>
                <div className="text-base sm:text-lg font-bold text-emerald-500 mt-0.5 font-mono">
                  {data.stats.success_ops}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-background border border-border shadow-xs">
                <div className="text-[10px] sm:text-[11px] text-rose-500 font-medium">العمليات الفاشلة</div>
                <div className="text-base sm:text-lg font-bold text-rose-500 mt-0.5 font-mono">
                  {data.stats.failed_ops}
                </div>
              </div>
            </div>

            {/* User Profile Mini Bar */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-background border border-border flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-4 h-4 text-primary shrink-0" />
                <span className="text-foreground font-bold">
                  {data.profile?.full_name || data.profile?.username || 'مستخدم بدون اسم'}
                </span>
              </div>
              {data.profile?.phone && (
                <div className="flex items-center gap-1.5 font-mono text-muted-foreground">
                  <Phone className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span dir="ltr" className="text-foreground font-semibold">{data.profile.phone}</span>
                </div>
              )}
              {data.profile?.created_at && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>انضم: {new Date(data.profile.created_at).toLocaleDateString('ar-EG')}</span>
                </div>
              )}
            </div>

            {/* Tabs: Sessions / Operations Logs / Permissions */}
            <Tabs defaultValue="sessions" className="w-full">
              <TabsList className="grid grid-cols-3 h-8 bg-muted/60 p-0.5 rounded-lg">
                <TabsTrigger value="sessions" className="text-xs h-7 data-[state=active]:bg-card font-medium">
                  الجلسات ({data.sessions.length})
                </TabsTrigger>
                <TabsTrigger value="logs" className="text-xs h-7 data-[state=active]:bg-card font-medium">
                  سجل العمليات ({data.logs.length})
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs h-7 data-[state=active]:bg-card font-medium">
                  الصلاحيات المفروضة
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Sessions and Revealed Passwords for Verification */}
              <TabsContent value="sessions" className="mt-2 space-y-2">
                {data.sessions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground bg-background rounded-lg border border-border">
                    لا توجد جلسات مسجلة حالياً
                  </div>
                ) : (
                  data.sessions.map((sess, idx) => {
                    const ownerPassKey = `owner_${sess.id}`;
                    const childPassKey = `child_${sess.id}`;
                    return (
                      <div
                        key={sess.id || idx}
                        className="p-2.5 rounded-lg bg-background border border-border space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground text-[12px]">
                              {sess.session_name}
                            </span>
                            {sess.dial_number && (
                              <Badge variant="outline" className="text-[10px] h-4 font-mono px-1">
                                {sess.dial_number}
                              </Badge>
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] h-4 px-1.5 ${
                              sess.operation_state === 'running'
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {sess.operation_state === 'running' ? 'نشطة تعمل' : 'متوقفة'}
                          </Badge>
                        </div>

                        {/* Owner & Child Credentials Inspection */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          {/* Owner */}
                          <div className="p-2 rounded bg-card/60 border border-border/80 space-y-1">
                            <div className="font-bold text-amber-500 flex items-center justify-between">
                              <span>👑 حساب الأونر</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => togglePasswordVisibility(ownerPassKey)}
                                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                title="إظهار/إخفاء كلمة المرور"
                              >
                                {showPasswords[ownerPassKey] ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                            <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground truncate">
                              <Mail className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{sess.owner_email || 'غير مدخل'}</span>
                            </div>
                            <div className="flex items-center gap-1 font-mono text-[10px] text-foreground">
                              <KeyRound className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                              <span>
                                {showPasswords[ownerPassKey]
                                  ? sess.owner_password_revealed || 'غير متوفر'
                                  : '••••••••••'}
                              </span>
                            </div>
                          </div>

                          {/* Child */}
                          <div className="p-2 rounded bg-card/60 border border-border/80 space-y-1">
                            <div className="font-bold text-primary flex items-center justify-between">
                              <span>👤 حساب الفرد</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => togglePasswordVisibility(childPassKey)}
                                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                title="إظهار/إخفاء كلمة المرور"
                              >
                                {showPasswords[childPassKey] ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                            <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground truncate">
                              <Mail className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{sess.individual_email || 'غير مدخل'}</span>
                            </div>
                            <div className="flex items-center gap-1 font-mono text-[10px] text-foreground">
                              <KeyRound className="w-2.5 h-2.5 text-primary shrink-0" />
                              <span>
                                {showPasswords[childPassKey]
                                  ? sess.individual_password_revealed || 'غير متوفر'
                                  : '••••••••••'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                          <span>الهدف: {sess.target_mix_balance?.toLocaleString('en-US')} ميكس</span>
                          <span>الدورة الحالية: #{sess.current_cycle}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </TabsContent>

              {/* Tab 2: Operation Logs & Failures */}
              <TabsContent value="logs" className="mt-2 space-y-1.5">
                {data.logs.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground bg-background rounded-lg border border-border">
                    لا توجد سجلات عمليات لهذا المستخدم
                  </div>
                ) : (
                  data.logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 rounded-lg bg-background border border-border flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="flex items-start gap-1.5">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground text-[11px]">
                              {log.action_type || 'تفعيل باقة VIP'}
                            </span>
                            {log.mixes_requested ? (
                              <Badge variant="outline" className="text-[9px] h-3.5 font-mono px-1">
                                {log.mixes_requested.toLocaleString('en-US')} ميكس
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {log.client_summary || 'تمت المحاولة عبر الخادم'}
                          </p>
                          {log.error_reason && (
                            <div className="flex items-center gap-1 text-[10px] text-rose-400 font-mono">
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                              <span>سبب الفشل: {log.error_reason}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{new Date(log.created_at).toLocaleTimeString('ar-EG')}</span>
                        </div>
                        {log.execution_time_ms ? (
                          <span className="text-[9px] text-muted-foreground font-mono">
                            {log.execution_time_ms}ms
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* Tab 3: Delegated Settings */}
              <TabsContent value="settings" className="mt-2 space-y-2">
                <div className="p-2.5 rounded-lg bg-background border border-border space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="text-muted-foreground">الحالة الحالية:</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] h-4 ${
                        data.delegation?.is_active
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                      }`}
                    >
                      {data.delegation?.is_active ? 'مفوض ومصرح له' : 'معطل'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="text-muted-foreground">سقف التفعيلات اليومية:</span>
                    <span className="font-mono font-bold text-foreground">
                      {data.delegation?.max_daily_cycles ?? 10} تفعيلة
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="text-muted-foreground">الحزم المسموح بها:</span>
                    <div className="flex items-center gap-1 font-mono">
                      {(data.delegation?.allowed_packages || [50000, 200000]).map((pkg) => (
                        <Badge key={pkg} variant="outline" className="text-[9px] h-4 px-1">
                          {pkg >= 1000 ? `${pkg / 1000}k` : pkg}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="text-muted-foreground">سماح الإدخال اليدوي:</span>
                    <span className="font-bold text-xs">
                      {data.delegation?.allow_custom_amount ? 'مفعل نعم' : 'معطل لا'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="text-muted-foreground">الحد الأقصى للجلسات المتزامنة:</span>
                    <span className="font-mono font-bold text-foreground">
                      {data.delegation?.max_concurrent_sessions ?? 1} جلسة
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">الفاصل الزمني الإجباري:</span>
                    <span className="font-mono font-bold text-foreground">
                      {data.delegation?.cooldown_seconds ?? 60} ثانية
                    </span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
