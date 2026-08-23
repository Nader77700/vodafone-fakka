import { useEffect, useState } from 'react';
import {
  Loader2, PackageX, RefreshCw, TriangleAlert,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUpcomingSubscriptions } from './useUpcomingSubscriptions';
import UpcomingSubscriptionCard from './UpcomingSubscriptionCard';
import type { VodafoneSubscription } from '@/lib/api';

interface UpcomingSubscriptionsSectionProps {
  rechargeReady?: boolean;
  onRecharge?: (sub: VodafoneSubscription) => void;
}

export default function UpcomingSubscriptionsSection({
  rechargeReady = false,
  onRecharge,
}: UpcomingSubscriptionsSectionProps) {
  const {
    subscriptions,
    loading,
    error,
    code,
    chargeEnabled,
    cancellingId,
    cancelSuccess,
    cancelError,
    load,
    cancel,
    clearCancelError,
    clearCancelSuccess,
  } = useUpcomingSubscriptions();

  const [confirmSub, setConfirmSub] = useState<VodafoneSubscription | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancelConfirm() {
    if (!confirmSub) return;
    const sub = confirmSub;
    setConfirmSub(null);
    await cancel(sub);
  }

  const canRecharge = chargeEnabled && rechargeReady;

  return (
    <div className="space-y-3">
      {/* رسائل الحالة */}
      {cancelSuccess && (
        <div
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <svg className="w-4 h-4 shrink-0 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <p className="text-[12px] font-bold text-green-300 flex-1">{cancelSuccess}</p>
          <button onClick={clearCancelSuccess} className="text-[10px] text-muted-foreground mr-auto">إغلاق</button>
        </div>
      )}
      {cancelError && (
        <div
          className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          <p className="text-[12px] font-medium text-red-200 flex-1">{cancelError}</p>
          <button onClick={clearCancelError} className="text-[10px] text-muted-foreground mr-auto">إغلاق</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1 h-5 rounded-full shrink-0" style={{ background: '#E60000' }} />
          <h3 className="text-sm font-black text-foreground truncate">الاشتراكات القادمة</h3>
          {!loading && subscriptions.length > 0 && (
            <span
              className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(230,0,0,0.15)', color: '#ff6b6b', border: '1px solid rgba(230,0,0,0.25)' }}
            >
              {subscriptions.length}
            </span>
          )}
        </div>
        <button
          onClick={() => load()}
          disabled={loading || !!cancellingId}
          className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {loading ? (
        <div
          className="flex flex-col items-center justify-center py-14 gap-3 rounded-[18px]"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-[12px] text-muted-foreground">جاري جلب الاشتراكات...</p>
        </div>
      ) : error ? (
        <div
          className="flex flex-col items-center gap-4 py-12 px-5 rounded-[18px]"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <TriangleAlert className="w-5 h-5 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-black text-foreground mb-1">
              {code === 'SESSION_EXPIRED' ? 'انتهت صلاحية الجلسة' : 'فشل جلب الاشتراكات'}
            </p>
            <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[260px]">{error}</p>
          </div>
          <button
            onClick={() => load()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-black text-white active:scale-[0.97] transition-all bg-primary hover:bg-primary/90"
          >
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة
          </button>
        </div>
      ) : subscriptions.length === 0 ? (
        <div
          className="flex flex-col items-center gap-4 py-14 rounded-[18px]"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          >
            <PackageX className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-center px-4">
            <p className="text-sm font-black text-foreground mb-1">لا توجد اشتراكات قادمة</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">لا توجد اشتراكات مرتبطة بهذا الرقم حالياً</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {subscriptions.map((sub) => (
            <UpcomingSubscriptionCard
              key={sub.id || sub.type}
              sub={sub}
              onCancel={setConfirmSub}
              onRecharge={onRecharge}
              cancellingId={cancellingId}
              rechargeReady={canRecharge}
            />
          ))}
        </div>
      )}

      {/* تأكيد إلغاء الاشتراك */}
      <AlertDialog open={!!confirmSub} onOpenChange={(o) => { if (!o) setConfirmSub(null); }}>
        <AlertDialogContent
          className="max-w-[calc(100%-2rem)] md:max-w-lg rounded-[24px]"
          dir="rtl"
          style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
        >
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <TriangleAlert className="w-5 h-5 text-red-400" />
              </div>
              <AlertDialogTitle className="text-base font-black text-foreground">تأكيد إلغاء الاشتراك</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-[12px] text-muted-foreground leading-relaxed text-right">
              هل تريد إلغاء الاشتراك <span className="font-black text-foreground">{confirmSub?.description || confirmSub?.type || 'الباقة'}</span>؟<br />
              لا يمكن التراجع عن هذا الإجراء بعد التأكيد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-3 mt-4">
            <AlertDialogCancel
              onClick={() => setConfirmSub(null)}
              className="flex-1 h-11 rounded-xl font-bold text-foreground border border-border bg-transparent hover:bg-muted"
            >
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              className="flex-1 h-11 rounded-xl font-black text-white bg-primary hover:bg-primary/90"
            >
              تأكيد الإلغاء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
