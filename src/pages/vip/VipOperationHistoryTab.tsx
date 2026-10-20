import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  History,
  RefreshCw,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Cpu,
  Layers,
  Search,
} from 'lucide-react';
import type { VipOperationRecord, VipSession } from '@/types/vip';
import { getVipOperationHistory } from '@/lib/vipApi';

interface Props {
  initialRecords: VipOperationRecord[];
  activeSession: VipSession;
  onRefresh: () => void;
}

export function VipOperationHistoryTab({ initialRecords, activeSession, onRefresh }: Props) {
  const [records, setRecords] = useState<VipOperationRecord[]>(initialRecords);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await getVipOperationHistory(activeSession.id, 50);
      setRecords(data);
    } catch (err) {
      console.error('[VipHistory] Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialRecords && initialRecords.length > 0) {
      setRecords(initialRecords);
    }
    // Always fetch latest records from database for the active session
    loadHistory();
  }, [activeSession.id]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-xs">ناجحة</Badge>;
      case 'failed':
        return <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs">فاشلة</Badge>;
      case 'running':
        return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-xs animate-pulse">قيد التنفيذ</Badge>;
      case 'pending':
        return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-xs">معلقة</Badge>;
      case 'pending_integration':
        return <Badge className="bg-sky-500/15 text-sky-500 border-sky-500/30 text-xs">بانتظار التكامل</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-muted-foreground text-xs">ملغاة</Badge>;
      case 'requested':
      default:
        return <Badge variant="outline" className="text-muted-foreground border-border text-xs">مسجلة</Badge>;
    }
  };

  const filteredRecords = records.filter((r) => {
    if (filterType !== 'all' && r.operation_type !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAction = r.requested_action?.toLowerCase().includes(q);
      const matchOwner = r.owner_account_ref?.toLowerCase().includes(q);
      const matchIndiv = r.individual_account_ref?.toLowerCase().includes(q);
      return matchAction || matchOwner || matchIndiv;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-500 shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                سجل العمليات والتدقيق للجلسة: {activeSession.session_name}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-500">
                Audit Trail
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              توثيق شامل لكافة الطلبات اليدوية والآلية، مع الحظر التام لتخزين أسرار أو كلمات مرور
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadHistory}
          disabled={loading}
          className="h-8 text-xs gap-1.5 shrink-0 border-border self-end sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          تحديث السجل
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في الإجراءات أو أرقام الحسابات..."
            className="text-xs h-8 pr-8"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('all')}
            className="h-7 text-xs px-2.5"
          >
            الكل
          </Button>
          <Button
            variant={filterType === 'change_system' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('change_system')}
            className="h-7 text-xs px-2.5"
          >
            تغيير النظام
          </Button>
          <Button
            variant={filterType === 'renew_bundle' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('renew_bundle')}
            className="h-7 text-xs px-2.5"
          >
            تجديد الباقة
          </Button>
          <Button
            variant={filterType === 'transfer_to_individual' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('transfer_to_individual')}
            className="h-7 text-xs px-2.5"
          >
            تحويل للفرد
          </Button>
          <Button
            variant={filterType === 'transfer_to_owner' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('transfer_to_owner')}
            className="h-7 text-xs px-2.5"
          >
            تحويل للأونر
          </Button>
        </div>
      </div>

      {/* Records List or Empty State */}
      <Card className="border border-border/80 bg-card">
        <CardContent className="p-0">
          {filteredRecords.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mx-auto text-muted-foreground">
                <History className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">لا توجد عمليات مسجلة لهذه الجلسة بعد</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  تظهر هنا جميع العمليات المنفذة يدوياً أو آلياً مع تفاصيل حالتها وتوقيتها.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filteredRecords.map((rec) => (
                <div key={rec.id} className="p-4 hover:bg-muted/20 transition-colors space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{rec.requested_action}</span>
                      {getStatusBadge(rec.status)}
                      {rec.is_automatic && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">آلي</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(rec.created_at).toLocaleString('ar-EG')}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                      الأونر: <strong className="text-foreground font-mono dir-ltr">{rec.owner_account_ref || '-'}</strong>
                    </span>
                    <span>
                      الفرد: <strong className="text-foreground font-mono dir-ltr">{rec.individual_account_ref || '-'}</strong>
                    </span>
                    {rec.requested_amount !== null && rec.requested_amount !== undefined && (
                      <span>
                        الكمية: <strong className="text-foreground font-mono">{rec.requested_amount.toLocaleString('ar-EG')}</strong> ميكس
                      </span>
                    )}
                    {rec.relevant_plan_id && (
                      <span>
                        النظام المعني: <strong className="text-foreground">{rec.relevant_plan_id}</strong>
                      </span>
                    )}
                  </div>

                  {/* Result Note if exists */}
                  {rec.result?.note && (
                    <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-500 text-[11px]">
                      {rec.result.note}
                    </div>
                  )}

                  {rec.failure_reason && (
                    <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px]">
                      سبب الفشل: {rec.failure_reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
