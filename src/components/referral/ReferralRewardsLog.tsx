// سجل المكافآت الكامل
import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollText, Loader2, ArrowRightLeft, Gift, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { rwGetRewardLogs, type ReferralRewardLog } from '@/lib/api';

const LOG_TYPE_LABEL: Record<ReferralRewardLog['log_type'], string> = {
  claim:           'مطالبة',
  transfer:        'تحويل',
  manual_grant:    'منح يدوي',
  manual_deduct:   'خصم يدوي',
  transfer_cancel: 'إلغاء تحويل',
};

const STATUS_LABEL: Record<ReferralRewardLog['status'], string> = {
  success:   'ناجح',
  failed:    'فاشل',
  rejected:  'مرفوض',
  pending:   'معلق',
  cancelled: 'ملغى',
};

function statusVariant(s: ReferralRewardLog['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'success')   return 'default';
  if (s === 'failed' || s === 'rejected') return 'destructive';
  if (s === 'cancelled') return 'secondary';
  return 'outline';
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export interface ReferralRewardsLogHandle { reload: () => void; }

const ReferralRewardsLog = forwardRef<ReferralRewardsLogHandle>(function ReferralRewardsLogInner(_props, ref) {
  const { user } = useAuth();
  const [logs, setLogs]             = useState<ReferralRewardLog[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE = 20;

  const load = useCallback(async (offset = 0, append = false) => {
    if (!user?.id) return;
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    const res = await rwGetRewardLogs(user.id, PAGE, offset);
    setLogs(prev => append ? [...prev, ...res.logs] : res.logs);
    setTotal(res.total);
    setLoading(false);
    setLoadingMore(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useImperativeHandle(ref, () => ({ reload: () => load(0, false) }), [load]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary" />
          سجل المكافآت
          {total > 0 && <Badge variant="secondary" className="font-mono text-xs">{total}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">جارٍ التحميل...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <ScrollText className="w-8 h-8" />
            <p className="text-sm">لا توجد سجلات بعد</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3.5 py-3 min-w-0">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="shrink-0 mt-0.5">
                    {log.log_type === 'transfer' || log.log_type === 'transfer_cancel'
                      ? <ArrowRightLeft className="w-4 h-4 text-primary" />
                      : <Gift className="w-4 h-4 text-primary" />
                    }
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-foreground truncate">
                      {log.task_title ?? LOG_TYPE_LABEL[log.log_type]}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{LOG_TYPE_LABEL[log.log_type]}</span>
                      <span>•</span>
                      <span>{fmtDate(log.created_at)}</span>
                      {log.transfer_valid_until && (
                        <><span>•</span><span>صالح حتى {fmtDate(log.transfer_valid_until)}</span></>
                      )}
                    </div>
                    {log.notes && <p className="text-xs text-muted-foreground/70 truncate">{log.notes}</p>}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span className={`font-mono font-bold text-sm ${
                    log.log_type === 'manual_deduct' || log.log_type === 'transfer'
                      ? 'text-destructive' : 'text-success'
                  }`}>
                    {log.log_type === 'manual_deduct' || log.log_type === 'transfer' ? '-' : '+'}
                    {log.operations.toLocaleString('ar-EG')}
                  </span>
                  <Badge variant={statusVariant(log.status)} className="text-[10px] h-5 px-1.5">
                    {STATUS_LABEL[log.status]}
                  </Badge>
                </div>
              </div>
            ))}
            {logs.length < total && (
              <Button variant="outline" size="sm" className="w-full gap-1.5 h-9"
                disabled={loadingMore} onClick={() => load(logs.length, true)}>
                {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                تحميل المزيد
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default ReferralRewardsLog;
