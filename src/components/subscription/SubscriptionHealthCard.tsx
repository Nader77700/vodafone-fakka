// بطاقة صحة الاشتراك — تُعرض في الصفحة الرئيسية
import { Shield, CheckCircle, AlertTriangle, XCircle, Zap } from 'lucide-react';
import type { Subscription } from '@/types/types';
import { fmtTimeLeft } from '@/lib/formatUtils';

interface Props {
  subscription: Subscription | null;
  isAdmin?: boolean;
  onRenew?: () => void;
}

export default function SubscriptionHealthCard({ subscription, isAdmin, onRenew }: Props) {
  const isActive  = subscription?.status === 'active';
  const isExpired = !isActive && subscription?.status === 'expired';
  const timeLeft  = fmtTimeLeft(subscription?.expires_at);

  // حساب الصحة بناءً على الوقت الفعلي — لا "أقل من يوم"
  type HealthLevel = 'excellent' | 'good' | 'warning' | 'critical' | 'expired' | 'admin';

  const getHealth = (): HealthLevel => {
    if (isAdmin) return 'admin';
    if (!isActive || isExpired || timeLeft.status === 'expired') return 'expired';
    if (timeLeft.status === 'critical') return 'critical';
    if (timeLeft.status === 'expiring') return 'warning';
    const ms = subscription?.expires_at
      ? new Date(subscription.expires_at).getTime() - Date.now()
      : 0;
    const days = Math.floor(ms / 86400000);
    if (days > 30) return 'excellent';
    return 'good';
  };

  const health = getHealth();
  // sublabel: استخدم timeLeft.label لإظهار ساعات/دقائق بدلاً من "0 أيام"
  const sublabel = (() => {
    if (health === 'expired') return 'الاشتراك منتهي — فعّل كوداً جديداً';
    if (health === 'admin')   return 'صلاحية المسؤول الكاملة مفعّلة';
    return `${timeLeft.label} متبقي${health === 'warning' || health === 'critical' ? ' — جدّد الآن!' : ''}`;
  })();

  const CONFIG: Record<HealthLevel, {
    label: string; icon: React.ElementType;
    barColor: string; bgColor: string; borderColor: string; textColor: string; barWidth: string;
  }> = {
    admin:     { label: 'وصول كامل', icon: Shield,        barColor: 'bg-primary',     bgColor: 'bg-primary/8',     borderColor: 'border-primary/20',     textColor: 'text-primary',     barWidth: '100%' },
    excellent: { label: 'ممتاز',     icon: CheckCircle,   barColor: 'bg-success',     bgColor: 'bg-success/8',     borderColor: 'border-success/20',     textColor: 'text-success',     barWidth: '90%' },
    good:      { label: 'جيد',       icon: CheckCircle,   barColor: 'bg-primary',     bgColor: 'bg-primary/8',     borderColor: 'border-primary/20',     textColor: 'text-primary',     barWidth: '60%' },
    warning:   { label: 'تحذير',     icon: AlertTriangle, barColor: 'bg-warning',     bgColor: 'bg-warning/8',     borderColor: 'border-warning/20',     textColor: 'text-warning',     barWidth: '30%' },
    critical:  { label: 'حرج',       icon: Zap,           barColor: 'bg-destructive', bgColor: 'bg-destructive/8', borderColor: 'border-destructive/20', textColor: 'text-destructive', barWidth: '10%' },
    expired:   { label: 'منتهي',     icon: XCircle,       barColor: 'bg-destructive', bgColor: 'bg-destructive/8', borderColor: 'border-destructive/20', textColor: 'text-destructive', barWidth: '0%'  },
  };

  const cfg  = CONFIG[health];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${cfg.bgColor} ${cfg.borderColor}`}>
      {/* العنوان */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bgColor} border ${cfg.borderColor}`}>
            <Icon className={`w-4 h-4 ${cfg.textColor}`} />
          </div>
          <div>
            <p className="text-xs font-bold">صحة الاشتراك</p>
            <p className={`text-[10px] ${cfg.textColor} font-semibold`}>{cfg.label}</p>
          </div>
        </div>
        {(health === 'warning' || health === 'critical' || health === 'expired') && onRenew && (
          <button
            onClick={onRenew}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.textColor} ${cfg.borderColor} hover:opacity-80 transition-opacity`}
          >
            تجديد
          </button>
        )}
      </div>

      {/* شريط التقدم */}
      {!isAdmin && (
        <div className="space-y-1">
          <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${cfg.barColor}`}
              style={{ width: cfg.barWidth }} />
          </div>
          <p className={`text-[10px] ${cfg.textColor} tabular-nums`}>{sublabel}</p>
        </div>
      )}
    </div>
  );
}
