import { Loader2, Banknote, XCircle, ListChecks, Tag } from 'lucide-react';
import type { VodafoneSubscription } from '@/lib/api';

function getStatusMeta(status: string) {
  const s = (status ?? '').toLowerCase();
  if (s === 'active' || s === 'مفعلة')
    return { label: 'مفعّلة', color: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.25)' };
  if (s === 'inactive' || s === 'غير مفعلة')
    return { label: 'غير مفعّلة', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.2)' };
  if (s === 'pending')
    return { label: 'قيد الانتظار', color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)' };
  return { label: status || 'غير محدد', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' };
}

interface UpcomingSubscriptionCardProps {
  sub: VodafoneSubscription;
  onCancel: (sub: VodafoneSubscription) => void;
  onCharge: (sub: VodafoneSubscription) => void;
  cancellingId: string | null;
  chargingId: string | null;
  chargeEnabled: boolean;
}

export default function UpcomingSubscriptionCard({
  sub, onCancel, onCharge, cancellingId, chargingId, chargeEnabled,
}: UpcomingSubscriptionCardProps) {
  const isCancelling = cancellingId === sub.id;
  const isCharging = chargingId === sub.id;
  const st = getStatusMeta(sub.status);
  const displayName = sub.description || sub.type || 'باقة';
  const canCancel = !!sub.id && !!sub.enc_product_id;
  const canCharge = canCancel && sub.price && chargeEnabled;

  return (
    <div
      className="rounded-[18px] overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* رأس */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.25)' }}
          >
            <ListChecks className="w-4 h-4" style={{ color: '#ff6b6b' }} />
          </div>
          <p className="text-[13px] font-black text-white truncate">{displayName}</p>
        </div>
        <span
          className="text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 mr-2"
          style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}
        >
          {st.label}
        </span>
      </div>

      {/* تفاصيل */}
      <div className="px-4 py-3 space-y-2">
        {sub.price && (
          <div className="flex items-center gap-2">
            <Banknote className="w-3.5 h-3.5 shrink-0 text-white/40" />
            <span className="text-[11px] text-white/45">السعر:</span>
            <span className="text-[12px] font-black text-white/90">{sub.price} جنيه</span>
          </div>
        )}
        {sub.type && sub.description && sub.type !== sub.description && (
          <div className="flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 shrink-0 text-white/40" />
            <span className="text-[11px] text-white/45">النوع:</span>
            <span className="text-[11px] text-white/70 truncate">{sub.type}</span>
          </div>
        )}
      </div>

      {/* الأزرار */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        {canCharge && (
          <button
            onClick={() => onCharge(sub)}
            disabled={isCharging || !!chargingId}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}
          >
            {isCharging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Banknote className="w-3.5 h-3.5" />}
            {isCharging ? 'جاري الشحن...' : 'شحن الباقة'}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancel(sub)}
            disabled={isCancelling || !!cancellingId}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
          >
            {isCancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            {isCancelling ? 'جاري الإلغاء...' : 'إلغاء الاشتراك'}
          </button>
        )}
      </div>
    </div>
  );
}
