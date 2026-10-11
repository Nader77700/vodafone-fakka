/**
 * WhatsAppAutomationRulesTab — لوحة التحكم في قواعد الإشعارات التلقائية وجدولة WhatsApp
 */
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Sliders,
  Play,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Save,
  Eye,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/db/supabase';
import type { WhatsAppAutomationRules } from './types';

export function WhatsAppAutomationRulesTab() {
  const [rules, setRules] = useState<WhatsAppAutomationRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningDryRun, setRunningDryRun] = useState(false);
  const [runningScheduler, setRunningScheduler] = useState(false);

  // Dry-run preview modal state
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  // Fetch rules
  const fetchRules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_automation_rules')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (error) throw error;
      setRules(data);
    } catch (err: any) {
      toast.error('فشل تحميل قواعد الأتمتة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleSave = async () => {
    if (!rules) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('whatsapp_automation_rules')
        .update({
          is_global_paused: rules.is_global_paused,
          red_status_enabled: rules.red_status_enabled,
          conversion_enabled: rules.conversion_enabled,
          renewal_reminder_enabled: rules.renewal_reminder_enabled,
          renewal_same_day_enabled: rules.renewal_same_day_enabled,
          renewal_confirmation_enabled: rules.renewal_confirmation_enabled,
          invoice_due_reminder_enabled: rules.invoice_due_reminder_enabled,
          invoice_overdue_reminder_enabled: rules.invoice_overdue_reminder_enabled,
          payment_confirmation_enabled: rules.payment_confirmation_enabled,
          lead_days_before_renewal: Number(rules.lead_days_before_renewal) || 2,
          daily_execution_hour: Number(rules.daily_execution_hour) || 10,
          max_retry_attempts: Number(rules.max_retry_attempts) || 3,
          retry_backoff_minutes: Number(rules.retry_backoff_minutes) || 30,
          rate_limit_per_minute: Number(rules.rate_limit_per_minute) || 20,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'default');

      if (error) throw error;
      toast.success('تم حفظ قواعد الإشعارات التلقائية بنجاح');
    } catch (err: any) {
      toast.error('فشل حفظ القواعد: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setSaving(false);
    }
  };

  // Run Dry-Run Simulation
  const handleExecuteDryRun = async () => {
    setRunningDryRun(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await supabase.functions.invoke('whatsapp-automation-scheduler', {
        body: { dry_run: true, source: 'admin_dry_run_ui' },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.error || !res.data?.success) {
        throw new Error(res.data?.error || res.error?.message || 'فشل تشغيل المحاكاة');
      }

      setDryRunResult(res.data);
      setDryRunOpen(true);
      toast.success('اكتملت المحاكاة التجريبية بنجاح دون إرسال أي رسائل');
    } catch (err: any) {
      toast.error('خطأ في المحاكاة التجريبية: ' + err.message);
    } finally {
      setRunningDryRun(false);
    }
  };

  // Trigger Immediate Scheduler Run
  const handleRunSchedulerNow = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في تشغيل الجدولة الآن ومعالجة الرسائل المستحقة فعلياً؟')) {
      return;
    }

    setRunningScheduler(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await supabase.functions.invoke('whatsapp-automation-scheduler', {
        body: { dry_run: false, source: 'admin_manual_trigger' },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.error || !res.data?.success) {
        throw new Error(res.data?.error || res.error?.message || 'فشل تشغيل الجدولة');
      }

      toast.success(res.data.message || 'تم تشغيل الجدولة بنجاح');
      fetchRules();
    } catch (err: any) {
      toast.error('فشل تشغيل الجدولة: ' + err.message);
    } finally {
      setRunningScheduler(false);
    }
  };

  if (loading || !rules) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-3">
          <RotateCw className="w-6 h-6 animate-spin text-primary" />
          <p>جاري تحميل قواعد الأتمتة...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Global Emergency Pause Warning */}
      {rules.is_global_paused && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-between text-red-600 dark:text-red-400">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <div>
              <div className="font-semibold text-base">الإيقاف الطارئ العام مُفعل (Global Emergency Pause)</div>
              <p className="text-xs opacity-90">كافة الرسائل التلقائية متوقفة حالياً. مراقبة فودافون RED وسداد الفواتير مستمرة بشكل طبيعي دون انقطاع.</p>
            </div>
          </div>
          <Badge variant="destructive" className="text-xs px-3 py-1">الأتمتة متوقفة</Badge>
        </div>
      )}

      {/* Main Controls Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            قواعد الإشعارات التلقائية وجدولة WhatsApp
          </h2>
          <p className="text-xs text-muted-foreground">
            التحكم الذري في إشعارات فودافون ريد، تذكيرات التجديد، الفواتير، ومحاكاة التشغيل التجريبي.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExecuteDryRun}
            disabled={runningDryRun}
            className="gap-2 text-primary border-primary/40 hover:bg-primary/10"
          >
            <Eye className="w-4 h-4" />
            {runningDryRun ? 'جاري المحاكاة...' : 'تشغيل تجريبي (Dry-Run)'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRunSchedulerNow}
            disabled={runningScheduler || rules.is_global_paused}
            className="gap-2"
          >
            <Play className="w-4 h-4 text-emerald-600" />
            {runningScheduler ? 'جاري المعالجة...' : 'تشغيل الجدولة الآن'}
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-2 bg-primary text-primary-foreground"
          >
            <Save className="w-4 h-4" />
            {saving ? 'جاري الحفظ...' : 'حفظ القواعد'}
          </Button>
        </div>
      </div>

      {/* Emergency Global Pause Card */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              مفتاح الإيقاف الطارئ العام (Global Emergency Switch)
            </span>
            <Switch
              checked={rules.is_global_paused}
              onCheckedChange={(checked) => setRules({ ...rules, is_global_paused: checked })}
            />
          </CardTitle>
          <CardDescription className="text-xs">
            عند تفعيل هذا المفتاح، يتم تعليق إرسال أي رسائل تلقائية فوراً على مستوى النظام بالكامل، مع الحفاظ على استمرار فحص الخطوط وسجلات النظام كما هي.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category: Conversion */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                إشعار التحويل المؤكد إلى RED
              </CardTitle>
              <Switch
                checked={rules.conversion_enabled}
                onCheckedChange={(c) => setRules({ ...rules, conversion_enabled: c })}
              />
            </div>
            <CardDescription className="text-xs">
              يُرسل حصراً عند تأكيد تحويل الخط إلى ريد بعد الفحص التلقائي. يمنع تكرار الإرسال نهائياً.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Category: Status Change */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                إشعار تغير حالة الخط
              </CardTitle>
              <Switch
                checked={rules.red_status_enabled}
                onCheckedChange={(c) => setRules({ ...rules, red_status_enabled: c })}
              />
            </div>
            <CardDescription className="text-xs">
              يُرسل عند حدوث تغيير حقيقي مؤكد في نظام الخط (مثلاً خروج من ريد أو تحديث النظام).
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Category: Lead Renewal Reminder */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                تذكير التجديد المسبق (قبل الموعد)
              </CardTitle>
              <Switch
                checked={rules.renewal_reminder_enabled}
                onCheckedChange={(c) => setRules({ ...rules, renewal_reminder_enabled: c })}
              />
            </div>
            <CardDescription className="text-xs">
              تذكير العميل باقتراب موعد تجديد باقة فودافون ريد (الأيام 7، 11، 25) قبل الموعد بمهلة محددة.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Category: Same-Day Renewal */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                تذكير يوم التجديد نفسه
              </CardTitle>
              <Switch
                checked={rules.renewal_same_day_enabled}
                onCheckedChange={(c) => setRules({ ...rules, renewal_same_day_enabled: c })}
              />
            </div>
            <CardDescription className="text-xs">
              تذكير في صباح يوم موعد التجديد (يوم 7 أو 11 أو 25) لتأكيد شحن وسداد الخط.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Category: Renewal Confirmation */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-500" />
                  رسالة تأكيد تجديد الباقة
                </CardTitle>
                <Badge variant="outline" className="text-[10px] mt-1 text-muted-foreground">
                  يتطلب توثيق حدث التجديد الفعلي
                </Badge>
              </div>
              <Switch
                checked={rules.renewal_confirmation_enabled}
                onCheckedChange={(c) => setRules({ ...rules, renewal_confirmation_enabled: c })}
              />
            </div>
            <CardDescription className="text-xs">
              يُرسل فقط عند تسجيل تجديد الباقة فعلياً في النظام (bundle_renewed_at). لا يُرسل لمجرد حلول التاريخ.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Category: Invoice Due Alert */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                تذكير استحقاق الفاتورة
              </CardTitle>
              <Switch
                checked={rules.invoice_due_reminder_enabled}
                onCheckedChange={(c) => setRules({ ...rules, invoice_due_reminder_enabled: c })}
              />
            </div>
            <CardDescription className="text-xs">
              يُرسل للخطوط غير المسددة عند حلول موعد الفاتورة. يُلغى فورياً في حال سداد الفاتورة أو إلغائها.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Category: Invoice Overdue Alert */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                تنبيه تأخر سداد الفاتورة
              </CardTitle>
              <Switch
                checked={rules.invoice_overdue_reminder_enabled}
                onCheckedChange={(c) => setRules({ ...rules, invoice_overdue_reminder_enabled: c })}
              />
            </div>
            <CardDescription className="text-xs">
              تنبيه إضافي بعد مضي موعد الفاتورة للخطوط التي لم تسدد بعد.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Category: Payment Confirmed */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                تأكيد سداد الفاتورة
              </CardTitle>
              <Switch
                checked={rules.payment_confirmation_enabled}
                onCheckedChange={(c) => setRules({ ...rules, payment_confirmation_enabled: c })}
              />
            </div>
            <CardDescription className="text-xs">
              إشعار شكر وتأكيد سداد يُرسل فور تسجيل سداد الخط بنجاح في النظام (payment_status: paid).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Timing and Policies Settings */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            إعدادات التوقيت، السياسات، ومعدلات المعالجة
          </CardTitle>
          <CardDescription className="text-xs">
            ضبط معايير الجدولة والمهل الزمنية وتفادي الحظر أو الضغط.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">مهلة التذكير المسبق (أيام قبل التجديد)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={rules.lead_days_before_renewal}
                onChange={(e) => setRules({ ...rules, lead_days_before_renewal: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">الافتراضي: يومان قبل موعد التفعيل (5، 9، 23).</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">ساعة التنفيذ اليومية (بتوقيت القاهرة)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={rules.daily_execution_hour}
                onChange={(e) => setRules({ ...rules, daily_execution_hour: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">الساعة 10 = 10:00 صباحاً بتوقيت جمهورية مصر العربية.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">المنطقة الزمنية المعتمدة</Label>
              <Input value={rules.timezone || 'Africa/Cairo'} disabled className="bg-muted" />
              <p className="text-[11px] text-muted-foreground">توقيت القاهرة (UTC+2 / UTC+3).</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">الحد الأقصى لمحاولات إعادة الإرسال</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={rules.max_retry_attempts}
                onChange={(e) => setRules({ ...rules, max_retry_attempts: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">تتوقف المحاولات عند تجاوز هذا الحد لتجنب التعليق.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">الفاصل الزمني لإعادة المحاولة (بالدقائق)</Label>
              <Input
                type="number"
                min={5}
                max={180}
                value={rules.retry_backoff_minutes}
                onChange={(e) => setRules({ ...rules, retry_backoff_minutes: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">الفاصل الزمني التدريجي بين المحاولات الفاشلة.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">الحد الأقصى للإرسال بالدفعة (في الدقيقة)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={rules.rate_limit_per_minute}
                onChange={(e) => setRules({ ...rules, rate_limit_per_minute: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground">يحمي الحساب من تجاوز قيود Meta ومعدلات الدقيقة.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dry Run Preview Dialog */}
      <Dialog open={dryRunOpen} onOpenChange={setDryRunOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              نتائج المحاكاة والتشغيل التجريبي (Dry-Run Preview)
            </DialogTitle>
            <DialogDescription className="text-xs">
              عرض تفصيلي للخطوط والتذكيرات التي ستتم معالجتها وفق القواعد الحالية دون إرسال أي رسائل للعملاء.
            </DialogDescription>
          </DialogHeader>

          {dryRunResult && (
            <div className="space-y-4 text-xs">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-card border border-border text-center">
                  <div className="text-xs text-muted-foreground">إجمالي الحالات المفحوصة</div>
                  <div className="text-lg font-bold text-foreground">{dryRunResult.evaluated_candidates_count || 0}</div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <div className="text-xs text-emerald-600 dark:text-emerald-400">جاهزة للجدولة والإرسال</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{dryRunResult.eligible_count || 0}</div>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                  <div className="text-xs text-amber-600 dark:text-amber-400">مستبعدة بأمان (Skipped)</div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{dryRunResult.skipped_count || 0}</div>
                </div>
              </div>

              {/* Table of Candidates */}
              <div className="border border-border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العميل</TableHead>
                      <TableHead>الرقم المراقب</TableHead>
                      <TableHead>مستلم WhatsApp</TableHead>
                      <TableHead>فئة الحدث</TableHead>
                      <TableHead>تاريخ التجديد</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>السبب / الملاحظة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dryRunResult.candidates && dryRunResult.candidates.length > 0 ? (
                      dryRunResult.candidates.map((c: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{c.customer_name}</TableCell>
                          <TableCell className="font-mono">{c.phone_number}</TableCell>
                          <TableCell className="font-mono">{c.recipient_phone}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {c.event_category}
                            </Badge>
                          </TableCell>
                          <TableCell>{c.renewal_date}</TableCell>
                          <TableCell>
                            {c.eligible ? (
                              <Badge className="bg-emerald-600 text-white text-[10px]">مؤهل للجدولة</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">مستبعد</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{c.skip_reason}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                          لا توجد خطوط مستحقة للتذكير اليوم وفق مواعيد التفعيل الحالية (7 / 11 / 25).
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setDryRunOpen(false)}>
                  إغلاق نافذة المعاينة
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
