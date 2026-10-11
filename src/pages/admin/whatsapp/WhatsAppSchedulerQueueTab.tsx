/**
 * WhatsAppSchedulerQueueTab — مراقبة قائمة انتظار الرسائل التلقائية وحالة الجدولة
 */
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Clock,
  RotateCw,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Check,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/db/supabase';
import type { WhatsAppQueueJob, WhatsAppQueueStatus } from './types';

export function WhatsAppSchedulerQueueTab() {
  const [jobs, setJobs] = useState<WhatsAppQueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchQueue = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('whatsapp_automation_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter);
      }
      if (categoryFilter !== 'all') {
        q = q.eq('event_category', categoryFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      setJobs(data || []);
    } catch (err: any) {
      toast.error('فشل تحميل قائمة الانتظار: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [statusFilter, categoryFilter]);

  // Run Worker manually
  const handleProcessQueueNow = async () => {
    setProcessing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await supabase.functions.invoke('whatsapp-automation-scheduler', {
        body: { dry_run: false, source: 'queue_tab_manual' },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.error || !res.data?.success) {
        throw new Error(res.data?.error || res.error?.message || 'فشل معالجة قائمة الانتظار');
      }

      toast.success(res.data.message || 'تمت معالجة مهام قائمة الانتظار بنجاح');
      fetchQueue();
    } catch (err: any) {
      toast.error('فشل تشغيل المعالج: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: WhatsAppQueueStatus) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-600 text-white text-[10px]">مكتمل بنجاح</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-blue-600 border-blue-500/40 text-[10px]">في الانتظار</Badge>;
      case 'processing':
        return <Badge variant="outline" className="text-amber-600 border-amber-500/40 text-[10px]">جاري المعالجة</Badge>;
      case 'skipped':
        return <Badge variant="secondary" className="text-muted-foreground text-[10px]">مستبعد بأمان</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="text-[10px]">فشل الإرسال</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-zinc-500 border-zinc-500/40 text-[10px]">ملغي</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  // Filtered in memory by search
  const filteredJobs = jobs.filter((j) => {
    if (!searchTerm) return true;
    return (
      j.recipient_phone.includes(searchTerm) ||
      (j.customer_name && j.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      j.source_event_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      j.template_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Summary Metrics
  const pendingCount = jobs.filter((j) => j.status === 'pending').length;
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const skippedCount = jobs.filter((j) => j.status === 'skipped').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            سجل قائمة الانتظار والأتمتة الذاتية (Automation Queue)
          </h2>
          <p className="text-xs text-muted-foreground">
            تتبع المهام المجدولة، المعرفات المصدرية لمنع التكرار (Unique Event IDs)، وحالات الاستبعاد الآمن.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchQueue} disabled={loading} className="gap-2">
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
          <Button
            size="sm"
            onClick={handleProcessQueueNow}
            disabled={processing}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Play className="w-4 h-4" />
            {processing ? 'جاري المعالجة...' : 'معالجة الدفعة الآن'}
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border p-4">
          <div className="text-xs text-muted-foreground">قيد الانتظار (Pending)</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{pendingCount}</div>
        </Card>
        <Card className="border-border p-4">
          <div className="text-xs text-muted-foreground">مكتمل بنجاح (Completed)</div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{completedCount}</div>
        </Card>
        <Card className="border-border p-4">
          <div className="text-xs text-muted-foreground">مستبعد بأمان (Skipped)</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{skippedCount}</div>
        </Card>
        <Card className="border-border p-4">
          <div className="text-xs text-muted-foreground">فشل (Failed)</div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{failedCount}</div>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث برقم المستلم، اسم العميل، المعرف المصدري، أو القالب..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-9 text-xs"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-44 text-xs">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كافة الحالات</SelectItem>
            <SelectItem value="pending">في الانتظار (Pending)</SelectItem>
            <SelectItem value="completed">مكتمل (Completed)</SelectItem>
            <SelectItem value="skipped">مستبعد بأمان (Skipped)</SelectItem>
            <SelectItem value="failed">فشل (Failed)</SelectItem>
            <SelectItem value="cancelled">ملغي (Cancelled)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full md:w-48 text-xs">
            <SelectValue placeholder="الفئة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كافة الفئات</SelectItem>
            <SelectItem value="conversion">تحويل RED</SelectItem>
            <SelectItem value="renewal_lead">تذكير مسبق للتجديد</SelectItem>
            <SelectItem value="renewal_same_day">تذكير يوم التجديد</SelectItem>
            <SelectItem value="renewal_confirmed">تأكيد التجديد</SelectItem>
            <SelectItem value="invoice_due">استحقاق فاتورة</SelectItem>
            <SelectItem value="payment_confirmed">تأكيد السداد</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Queue Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          <div className="border border-border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفئة</TableHead>
                  <TableHead>العميل / المستلم</TableHead>
                  <TableHead>القالب</TableHead>
                  <TableHead>المعرف المصدري (Unique Key)</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>السبب / الملاحظة</TableHead>
                  <TableHead>المحاولات</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <RotateCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                      جاري تحميل سجلات قائمة الانتظار...
                    </TableCell>
                  </TableRow>
                ) : filteredJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      لا توجد مهام في قائمة الانتظار حالياً.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {job.event_category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-xs text-foreground">{job.customer_name || 'بدون اسم'}</div>
                        <div className="font-mono text-[11px] text-primary">{job.recipient_phone}</div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {job.template_name}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground max-w-[180px] truncate" title={job.source_event_id}>
                        {job.source_event_id}
                      </TableCell>
                      <TableCell>{renderStatusBadge(job.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={job.skip_reason || job.last_error || ''}>
                        {job.skip_reason ? (
                          <span className="text-amber-600 dark:text-amber-400">{job.skip_reason}</span>
                        ) : job.last_error ? (
                          <span className="text-red-500">{job.last_error}</span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {job.attempts}/{job.max_attempts}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(job.created_at).toLocaleString('ar-EG')}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
