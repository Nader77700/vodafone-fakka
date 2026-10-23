import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Eye,
  Clock,
  Phone,
  Cpu,
  ShieldAlert,
} from 'lucide-react';
import {
  getVipExecutionLogs,
  type VipExecutionLog,
} from '@/services/vipDelegationService';

export const VipSessionInspectorTab: React.FC = () => {
  const [logs, setLogs] = useState<VipExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<VipExecutionLog | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getVipExecutionLogs(200);
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !search ||
      log.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      log.owner_phone?.includes(search) ||
      log.child_phone?.includes(search);

    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalCycles = logs.length;
  const successCycles = logs.filter((l) => l.status === 'success').length;
  const failedCycles = logs.filter((l) => l.status === 'failed').length;
  const blockedCycles = logs.filter((l) => l.status.includes('blocked') || l.status.includes('tamper')).length;
  const successRate = totalCycles > 0 ? Math.round((successCycles / totalCycles) * 100) : 100;

  return (
    <div className="space-y-6" dir="rtl">
      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground block">إجمالي العمليات</span>
              <span className="text-xl font-bold text-foreground">{totalCycles}</span>
            </div>
            <Activity className="w-6 h-6 text-primary" />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground block">نسبة النجاح</span>
              <span className="text-xl font-bold text-emerald-400">{successRate}%</span>
            </div>
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground block">العمليات الفاشلة</span>
              <span className="text-xl font-bold text-rose-400">{failedCycles}</span>
            </div>
            <XCircle className="w-6 h-6 text-rose-500" />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground block">المحاولات المحظورة</span>
              <span className="text-xl font-bold text-amber-400">{blockedCycles}</span>
            </div>
            <ShieldAlert className="w-6 h-6 text-amber-500" />
          </CardContent>
        </Card>
      </div>

      {/* أدوات البحث والفلترة */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالبريد الإلكتروني، أو رقم الأونر، أو رقم الفرد..."
            className="pr-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          {['all', 'success', 'failed'].map((st) => (
            <Button
              key={st}
              variant={statusFilter === st ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(st)}
              className="text-xs"
            >
              {st === 'all' ? 'الكل' : st === 'success' ? 'الناجحة' : 'الفاشلة'}
            </Button>
          ))}

          <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* جدول العمليات المفصل */}
      <Card className="border border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <span>فاحص جلسات وعمليات المستخدمين</span>
            </div>
            <span className="text-xs font-normal text-muted-foreground">
              يظهر تفاصيل الدورات المشغلة من حسابات المستخدمين مع كشف الأخطاء الفنية
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-primary" />
              جاري فحص السجلات...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد سجلات تطابق الفلتر الحالي.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-3 pr-2 font-medium">الوقت</th>
                    <th className="pb-3 font-medium">المستخدم</th>
                    <th className="pb-3 font-medium">خط الأونر</th>
                    <th className="pb-3 font-medium">خط الفرد</th>
                    <th className="pb-3 font-medium">الميكسات</th>
                    <th className="pb-3 font-medium">الحالة</th>
                    <th className="pb-3 pl-2 text-left font-medium">تشخيص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('ar-EG')}
                      </td>
                      <td className="py-3">
                        <div className="font-medium text-foreground">{log.user_email || 'مستخدم مجهول'}</div>
                      </td>
                      <td className="py-3 font-mono text-xs text-primary">{log.owner_phone || '-'}</td>
                      <td className="py-3 font-mono text-xs text-emerald-400">{log.child_phone || '-'}</td>
                      <td className="py-3 text-xs font-semibold">
                        {(log.mixes_requested ?? 50000).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant="outline"
                          className={
                            log.status === 'success'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30 text-xs'
                          }
                        >
                          {log.status === 'success' ? 'ناجحة' : 'فاشلة'}
                        </Badge>
                      </td>
                      <td className="py-3 pl-2 text-left">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                          className="h-8 text-xs text-primary hover:bg-primary/10 gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>فحص</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* نافذة فحص وتفاصيل السجل الفنية */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <span>تفاصيل الدورة وتشخيص الأخطاء الفنية للمالك</span>
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 pt-2 text-sm">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                <div>
                  <span className="text-xs text-muted-foreground block">المستخدم</span>
                  <span className="font-semibold text-foreground">{selectedLog.user_email}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">الحالة</span>
                  <Badge
                    variant="outline"
                    className={
                      selectedLog.status === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30 text-xs'
                    }
                  >
                    {selectedLog.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">خط الأونر</span>
                  <span className="font-mono text-primary">{selectedLog.owner_phone}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">خط الفرد</span>
                  <span className="font-mono text-emerald-400">{selectedLog.child_phone}</span>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-muted-foreground block mb-1">
                  الرسالة المعروضة للعميل (المبسطة):
                </span>
                <div className="p-3 rounded-lg bg-card border border-border text-foreground font-mono text-xs">
                  {selectedLog.client_summary || 'تم التحويل للفرد وللأونر'}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-muted-foreground block mb-1">
                  التفاصيل الفنية المشفرة (خاصة بالمالك فقط):
                </span>
                <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs max-h-48 overflow-y-auto" dir="ltr">
                  {JSON.stringify(selectedLog.owner_technical_details || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
