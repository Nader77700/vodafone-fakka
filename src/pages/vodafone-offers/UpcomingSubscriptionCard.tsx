import { Loader2, Banknote, XCircle, ListChecks } from 'lucide-react';
import type { VodafoneSubscription } from '@/lib/api';

function getStatusMeta(status: string) {
  const s = (status ?? '').toLowerCase();
  if (s === 'active' || s === 'مفعلة' || s === 'مفعل')
    return { label: 'مفعّلة', color: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.25)' };
  if (s === 'inactive' || s === 'غير مفعلة' || s === 'غير مفعل')
    return { label: 'غير مفعّلة', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.2)' };
  if (s === 'pending')
    return { label: 'قيد الانتظار', color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)' };
  return { label: status || 'غير محدد', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' };
}

interface UpcomingSubscriptionCardProps {
  sub: VodafoneSubscription;
  onCancel: (sub: VodafoneSubscription) => void;
  onRecharge?: (sub: VodafoneSubscription) => void;
  cancellingId: string | null;
  rechargeReady?: boolean;
}

export default function UpcomingSubscriptionCard({
  sub, onCancel, onRecharge, cancellingId, rechargeReady = false,
}: UpcomingSubscriptionCardProps) {
  const isCancelling = cancellingId === sub.id;
  const st = getStatusMeta(sub.status);
  const displayName = sub.description || sub.type || 'باقة';
  const canCancel = !!sub.id && !!sub.enc_product_id;
  const canRecharge = rechargeReady && !!sub.price && !!onRecharge;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'hsl(var(--muted)/0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* رأس الباقة */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ background: 'hsl(var(--muted)/0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.25)' }}
          >
            <ListChecks className="w-4 h-4 text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-black text-foreground truncate">{displayName}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {sub.price && (
                <span className="text-[10px] font-bold text-muted-foreground">
                  {sub.price} جنيه
                </span>
              )}
              {sub.type && sub.type !== sub.description && (
                <span className="text-[10px] text-muted-foreground truncate">{sub.type}</span>
              )}
            </div>
          </div>
        </div>
        <span
          className="text-[10px] font-black px-2 py-1 rounded-full shrink-0 mr-2"
          style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}
        >
          {st.label}
        </span>
      </div>

      {/* الأزرار */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        {canRecharge && (
          <button
            onClick={() => onRecharge?.(sub)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}
          >
            <Banknote className="w-3.5 h-3.5" />
            شحن
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancel(sub)}
            disabled={isCancelling || !!cancellingId}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
          >
            {isCancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            {isCancelling ? 'جاري الإلغاء...' : 'إلغاء'}
          </button>
        )}
      </div>
    </div>
  );
}
