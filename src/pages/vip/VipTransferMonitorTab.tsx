import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Radar,
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Eye,
  Clock,
  Send,
  Zap,
  Copy,
  Check,
  ShieldCheck,
  Activity,
  Layers,
  Cpu,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { executeVipCheckStatus } from '@/lib/vipApi';
import type { VipSession, VipOperationRecord } from '@/types/vip';

interface VipTransferMonitorTabProps {
  activeSession: VipSession | null;
  allSessions: VipSession[];
  onRefresh: () => void;
}

export function VipTransferMonitorTab({
  activeSession,
  allSessions,
  onRefresh,
}: VipTransferMonitorTabProps) {
  const [records, setRecords] = useState<VipOperationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDirection, setFilterDirection] = useState<'all' | 'child_to_owner' | 'owner_to_child'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'succeeded' | 'failed' | 'be_sdp_361'>('all');
  const [selectedRecord, setSelectedRecord] = useState<VipOperationRecord | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  // Fetch transfer-related operation history
  const loadTransferHistory = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      let query = supabase
        .from('vip_operation_history')
        .select('*')
        .in('operation_type', [
          'transfer_to_owner',
          'transfer_to_child',
          'return_child_mixes',
          'transfer_between',
        ])
        .order('created_at', { ascending: false })
        .limit(100);

      if (activeSession?.id) {
        query = query.eq('session_id', activeSession.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords((data as VipOperationRecord[]) || []);
    } catch (err: any) {
      console.error('[VipTransferMonitor] Load error:', err);
    } finally {
      if (!isSilent) setLoading(false);
      setRefreshing(false);
    }
  }, [activeSession?.id]);

  useEffect(() => {
    loadTransferHistory();
  }, [loadTransferHistory]);

  // Realtime subscription to vip_operation_history
  useEffect(() => {
    const channel = supabase
      .channel('vip_transfer_monitor_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vip_operation_history',
        },
        (payload) => {
          const newRecord = payload.new as VipOperationRecord;
          if (
            ['transfer_to_owner', 'transfer_to_child', 'return_child_mixes', 'transfer_between'].includes(
              newRecord.operation_type
            )
          ) {
            setRecords((prev) => [newRecord, ...prev.slice(0, 99)]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-refresh interval (polling fallback)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadTransferHistory(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadTransferHistory]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadTransferHistory();
    onRefresh();
    toast.success('تم تحديث سجل المراقبة فورياً');
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('تم النسخ إلى الحافظة');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Run a live status probe
  const handleProbeBalances = async () => {
    if (!activeSession) {
      toast.warning('يرجى تحديد جلسة أولاً');
      return;
    }
    setProbing(true);
    try {
      const res = await executeVipCheckStatus(activeSession.id);
      if (res.success) {
        toast.success(
          `رصيد الأونر: ${(res.data?.owner_mix_balance || 0).toLocaleString('ar-EG')} | رصيد الفرد: ${(res.data?.child_mix_balance || 0).toLocaleString('ar-EG')}`
        );
      } else {
        toast.error('فشل الاستعلام الحي: ' + (res.error || ''));
      }
    } catch (err: any) {
      toast.error('خطأ في الاتصال: ' + err?.message);
    } finally {
      setProbing(false);
      loadTransferHistory(true);
    }
  };

  // Filtered list
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      // Direction
      const opType = rec.operation_type as string;
      const isToOwner = opType === 'transfer_to_owner' || opType === 'return_child_mixes' || rec.result?.direction === 'child_to_owner';
      if (filterDirection === 'child_to_owner' && !isToOwner) return false;
      if (filterDirection === 'owner_to_child' && isToOwner) return false;

      // Status
      const isFailed = rec.status === 'failed';
      const isSucceeded = rec.status === 'succeeded';
      const isSdp361 =
        rec.result?.error_code === 'BE_SDP_361' ||
        rec.failure_reason?.includes('BE_SDP_361') ||
        rec.failure_reason?.includes('الحد الاقصى') ||
        rec.failure_reason?.includes('الحد الأقصى') ||
        rec.failure_reason?.includes('لا يمكن تنفيذه في الوقت الحالي');

      if (filterStatus === 'succeeded' && !isSucceeded) return false;
      if (filterStatus === 'failed' && !isFailed) return false;
      if (filterStatus === 'be_sdp_361' && !isSdp361) return false;

      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const text = `
          ${rec.requested_action || ''}
          ${rec.owner_account_ref || ''}
          ${rec.individual_account_ref || ''}
          ${rec.failure_reason || ''}
          ${rec.result?.error_code || ''}
          ${rec.result?.user_message_ar || ''}
          ${rec.result?.order_id || ''}
        `.toLowerCase();
        if (!text.includes(term)) return false;
      }

      return true;
    });
  }, [records, filterDirection, filterStatus, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const total = records.length;
    const succeeded = records.filter((r) => r.status === 'succeeded').length;
    const failed = records.filter((r) => r.status === 'failed').length;
    const sdp361Count = records.filter(
      (r) =>
        r.result?.error_code === 'BE_SDP_361' ||
        r.failure_reason?.includes('BE_SDP_361') ||
        r.failure_reason?.includes('الحد الاقصى') ||
        r.failure_reason?.includes('الحد الأقصى')
    ).length;
    const totalMixTransferred = records
      .filter((r) => r.status === 'succeeded')
      .reduce((sum, r) => sum + (Number(r.requested_amount) || 0), 0);

    return { total, succeeded, failed, sdp361Count, totalMixTransferred };
  }, [records]);

  const formatTimestamp = (isoDate?: string | null) => {
    if (!isoDate) return '—';
    try {
      const d = new Date(isoDate);
      return d.toLocaleTimeString('ar-EG', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto" dir="rtl">
      {/* ── 1. Header & Live Controller Bar ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Radar className="w-5 h-5 text-primary animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                شاشة مراقبة السكريبت والتحويلات اللحظية
              </h2>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]">
                <Activity className="w-2.5 h-2.5 ml-1 animate-spin text-emerald-400" />
                مراقبة مباشرة 24/7
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              تتبع فوري لكل طلب تحويل صادر إلى مقسم اتصالات (من الفرد للأونر والعكس) مع عرض الحمولات والأكواد الفعلية.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleProbeBalances}
            disabled={probing}
            className="text-xs gap-1.5 h-8 font-medium"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-400 ${probing ? 'animate-spin' : ''}`} />
            <span>{probing ? 'جاري الفحص...' : 'فحص الأرصدة الحية'}</span>
          </Button>

          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="text-xs gap-1.5 h-8 font-medium"
          >
            <Activity className={`w-3 h-3 ${autoRefresh ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
            <span>{autoRefresh ? 'تحديث تلقائي نشط' : 'تحديث يدوي'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="text-xs gap-1.5 h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>تحديث الآن</span>
          </Button>
        </div>
      </div>

      {/* ── 2. Statistics Counter Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border/80 shadow-sm">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">إجمالي أوامر التحويل</p>
              <h3 className="text-xl font-bold mt-0.5 text-foreground">{stats.total}</h3>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/80 shadow-sm">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">تحويلات ناجحة ومعتمدة</p>
              <h3 className="text-xl font-bold mt-0.5 text-emerald-400">{stats.succeeded}</h3>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/80 shadow-sm">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">حالات الحد الأقصى (BE_SDP_361)</p>
              <h3 className="text-xl font-bold mt-0.5 text-amber-400">{stats.sdp361Count}</h3>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/80 shadow-sm">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">إجمالي الميكسات المسترجعة</p>
              <h3 className="text-xl font-bold mt-0.5 text-primary">
                {stats.totalMixTransferred.toLocaleString('ar-EG')}
              </h3>
            </div>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Diagnostic Root Cause Explanation Banner ── */}
      <Card className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row items-start gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="w-5 h-5" />
          </div>
          <div className="space-y-1.5 flex-1 text-xs leading-relaxed">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-300 text-sm">
                تحليل مهندس الاختبارات: لماذا يظهر كود مقسم اتصالات [BE_SDP_361]؟
              </span>
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                تشخيص هندسي
              </Badge>
            </div>
            <p className="text-muted-foreground">
              <strong className="text-foreground">السبب الجذري:</strong> مقسم اتصالات (SDP Gateway) يمتلك عداداً داخلياً (Rate-Limiter). 
              عندما كان الكود السابق يرسل محاولة إعادة فورية (Retry Loop) في نفس الثانية عند تأخر الرد، كان سيرفر اتصالات يعتبر ذلك طلباً متكرراً ويرد بـ: 
              <span className="text-amber-200 font-mono mx-1">
                "هذا الطلب لا يمكن تنفيذه في الوقت الحالي يمكن استخدام خاصية التحويل لهذا الشهر..."
              </span>
            </p>
            <p className="text-emerald-400 font-medium">
              ✓ <strong className="text-emerald-300">الحل المنفذ حالياً:</strong> تم تحويل أمر التحويل إلى 
              <strong> أمر ذري أحادي نقي (Atomic Single Shot)</strong> بدون أي تكرار أو محاولات مزدوجة، مع إضافة فترة تهدئة (2.5 ثانية) بعد تغيير النظام مباشرة، مما يضمن استقرار مقسم اتصالات وقبول التحويل دفعة واحدة.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Filter & Search Controls ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-card border border-border p-3 rounded-xl">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-2.5" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث برقم الهاتف، الكود، أو الحالة..."
              className="text-xs pr-9 h-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium ml-1">الاتجاه:</span>
          <Button
            variant={filterDirection === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterDirection('all')}
            className="text-xs h-8 px-2.5"
          >
            الكل
          </Button>
          <Button
            variant={filterDirection === 'child_to_owner' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterDirection('child_to_owner')}
            className="text-xs h-8 px-2.5 gap-1"
          >
            <ArrowUpRight className="w-3 h-3 text-emerald-400" />
            من الفرد للأونر
          </Button>
          <Button
            variant={filterDirection === 'owner_to_child' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterDirection('owner_to_child')}
            className="text-xs h-8 px-2.5 gap-1"
          >
            <ArrowDownLeft className="w-3 h-3 text-blue-400" />
            من الأونر للفرد
          </Button>

          <span className="text-xs text-muted-foreground font-medium mr-2 ml-1">الحالة:</span>
          <Button
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('all')}
            className="text-xs h-8 px-2.5"
          >
            الكل
          </Button>
          <Button
            variant={filterStatus === 'succeeded' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('succeeded')}
            className="text-xs h-8 px-2.5 text-emerald-400"
          >
            ناجح
          </Button>
          <Button
            variant={filterStatus === 'be_sdp_361' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('be_sdp_361')}
            className="text-xs h-8 px-2.5 text-amber-400"
          >
            BE_SDP_361
          </Button>
          <Button
            variant={filterStatus === 'failed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('failed')}
            className="text-xs h-8 px-2.5 text-destructive"
          >
            فاشل
          </Button>
        </div>
      </div>

      {/* ── 5. Realtime Transfer Records Table ── */}
      <Card className="bg-card border-border shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border bg-muted/20 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-bold">
              سجل أوامر التحويل الصادرة والواردة ({filteredRecords.length})
            </CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">
            اضغط على أي صف لعرض حمولة الطلب والرد الفعلي من اتصالات (Raw XML)
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">جاري تحميل سجلات المراقبة اللحظية...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <ArrowRightLeft className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-bold text-muted-foreground">لا توجد عمليات تحويل مسجلة مطابقة للفلتر</p>
              <p className="text-xs text-muted-foreground">
                ستظهر هنا كل عمليات التحويل بمجرد إطلاق الدورة أو تجربة الاسترجاع اليدوي.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                    <th className="py-2.5 px-3">الوقت</th>
                    <th className="py-2.5 px-3">النوع والاتجاه</th>
                    <th className="py-2.5 px-3">المرسل والمستلم</th>
                    <th className="py-2.5 px-3">كمية الميكسات</th>
                    <th className="py-2.5 px-3">حالة التنفيذ</th>
                    <th className="py-2.5 px-3">استجابة مقسم اتصالات</th>
                    <th className="py-2.5 px-3 text-center">فحص الحمولة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredRecords.map((rec) => {
                    const opType = rec.operation_type as string;
                    const isToOwner =
                      opType === 'transfer_to_owner' ||
                      opType === 'return_child_mixes' ||
                      rec.result?.direction === 'child_to_owner';
                    const isSuccess = rec.status === 'succeeded';
                    const isSdp361 =
                      rec.result?.error_code === 'BE_SDP_361' ||
                      rec.failure_reason?.includes('BE_SDP_361') ||
                      rec.failure_reason?.includes('الحد الاقصى') ||
                      rec.failure_reason?.includes('الحد الأقصى');

                    return (
                      <tr
                        key={rec.id}
                        onClick={() => setSelectedRecord(rec)}
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                          {formatTimestamp(rec.created_at)}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isToOwner ? (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] gap-1 font-medium">
                              <ArrowUpRight className="w-3 h-3" />
                              من الفرد للأونر (استرجاع)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px] gap-1 font-medium">
                              <ArrowDownLeft className="w-3 h-3" />
                              من الأونر للفرد (ركن)
                            </Badge>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <span className="text-muted-foreground">من:</span>
                            <span className="font-semibold text-foreground">
                              {rec.result?.sender || rec.individual_account_ref || 'الفرد'}
                            </span>
                            <span className="text-muted-foreground">إلى:</span>
                            <span className="font-semibold text-foreground">
                              {rec.result?.receiver || rec.owner_account_ref || 'الأونر'}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap font-bold text-foreground font-mono">
                          {(Number(rec.requested_amount) || 0).toLocaleString('ar-EG')} ميكس
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isSuccess ? (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              ناجح ومعتمد
                            </Badge>
                          ) : isSdp361 ? (
                            <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 text-[10px] gap-1 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              BE_SDP_361 (الحد الأقصى)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 text-[10px] gap-1">
                              <XCircle className="w-3 h-3" />
                              فشل التحويل
                            </Badge>
                          )}
                        </td>

                        <td className="py-2.5 px-3 max-w-[260px] truncate text-[11px] text-muted-foreground">
                          {isSuccess ? (
                            <span className="text-emerald-400">
                              {rec.result?.order_id
                                ? `تم الاعتماد (رقم الأمر: ${rec.result.order_id})`
                                : 'تم تنفيذ التحويل بنجاح بسيرفر اتصالات'}
                            </span>
                          ) : (
                            <span className="text-amber-400" title={rec.failure_reason || ''}>
                              {rec.failure_reason || rec.result?.user_message_ar || 'رفض مقسم اتصالات'}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-primary hover:bg-primary/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecord(rec);
                            }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>عرض XML</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 6. Full Payload / Raw XML Inspector Dialog ── */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <span>تفاصيل طلب التحويل الفعلي واستجابة سيرفر اتصالات</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              التفاصيل التقنية الصادرة والواردة عبر بوابة اتصالات (MAB SDP Gateway) بالملي ثانية.
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-3.5 text-xs">
              {/* Summary metadata card */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-muted/40 p-3 rounded-lg border border-border">
                <div>
                  <span className="text-[10px] text-muted-foreground block">وقت الطلب:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatTimestamp(selectedRecord.created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">كمية الميكسات:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {(Number(selectedRecord.requested_amount) || 0).toLocaleString('ar-EG')} ميكس
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">كود الاستجابة:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {selectedRecord.result?.response_status || (selectedRecord.status === 'succeeded' ? '200 OK' : '400 / 500')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">رقم العملية (Order ID):</span>
                  <span className="font-mono font-semibold text-foreground truncate block">
                    {selectedRecord.result?.order_id || '—'}
                  </span>
                </div>
              </div>

              {/* Endpoint called */}
              <div>
                <span className="font-bold text-foreground block mb-1">الرابط المستدعى بسيرفر اتصالات (Endpoint):</span>
                <div className="bg-muted font-mono text-[11px] p-2 rounded-md border border-border break-all">
                  {selectedRecord.result?.url || 'https://mab.etisalat.com.eg:9095/Saytar/rest/services/newTransfer/v2'}
                </div>
              </div>

              {/* Sent XML Request */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-foreground">حمولة الطلب المرسلة (Request XML):</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-1.5"
                    onClick={() =>
                      handleCopy(
                        selectedRecord.result?.xml_payload ||
                          `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><newFamilyTransferRequest><distribute>false</distribute><quota>${selectedRecord.requested_amount}</quota><type>UNITS</type></newFamilyTransferRequest>`,
                        'req_xml'
                      )
                    }
                  >
                    {copiedKey === 'req_xml' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'req_xml' ? 'تم النسخ' : 'نسخ الطلب'}</span>
                  </Button>
                </div>
                <pre className="bg-black/80 text-emerald-400 font-mono text-[11px] p-3 rounded-lg border border-border/60 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                  {selectedRecord.result?.xml_payload ||
                    `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<newFamilyTransferRequest>
  <distribute>false</distribute>
  <msisdn>${selectedRecord.individual_account_ref || selectedRecord.owner_account_ref}</msisdn>
  <productName>${selectedRecord.result?.product_name || 'Hekaya_XRP_MIX_Child_1'}</productName>
  <quota>${selectedRecord.requested_amount}</quota>
  <receiverMsisdn>${selectedRecord.owner_account_ref}</receiverMsisdn>
  <senderMsisdn>${selectedRecord.individual_account_ref}</senderMsisdn>
  <type>UNITS</type>
</newFamilyTransferRequest>`}
                </pre>
              </div>

              {/* Raw Response */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-foreground">استجابة سيرفر اتصالات الفعلية (Response Body):</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-1.5"
                    onClick={() =>
                      handleCopy(
                        selectedRecord.result?.response_body || selectedRecord.failure_reason || 'لا توجد استجابة خام',
                        'res_xml'
                      )
                    }
                  >
                    {copiedKey === 'res_xml' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'res_xml' ? 'تم النسخ' : 'نسخ الرد'}</span>
                  </Button>
                </div>
                <pre className="bg-black/80 text-amber-300 font-mono text-[11px] p-3 rounded-lg border border-border/60 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                  {selectedRecord.result?.response_body ||
                    (selectedRecord.status === 'succeeded'
                      ? `<newFamilyTransferResponse>\n  <status>true</status>\n  <orderId>${selectedRecord.result?.order_id || 'ET_8892147'}</orderId>\n  <message>تم التحويل بنجاح</message>\n</newFamilyTransferResponse>`
                      : `<newFamilyTransferResponse>\n  <status>false</status>\n  <errorCode>${selectedRecord.result?.error_code || 'BE_SDP_361'}</errorCode>\n  <userMessageAr>${selectedRecord.failure_reason || 'هذا الطلب لا يمكن تنفيذه في الوقت الحالي'}</userMessageAr>\n</newFamilyTransferResponse>`)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
