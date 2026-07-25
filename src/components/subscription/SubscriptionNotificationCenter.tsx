// مركز إشعارات الاشتراكات الموحد
import { useState, useEffect } from 'react';
import { Bell, X, Clock, Key, AlertTriangle, CheckCircle, Zap, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Subscription } from '@/types/types';
import { calcDaysRemaining } from '@/lib/api';
import type { ActivityEntry } from '@/lib/api';

interface SubNotification {
  id: string;
  type: 'expiry_warning' | 'expiry_critical' | 'expiry_today' | 'activity';
  title: string;
  body: string;
  icon: React.ElementType;
  color: string;
  time?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  activities: ActivityEntry[];
  onRenew?: () => void;
}

const EVENT_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  activation:      { icon: Key,           color: 'text-success' },
  renewal:         { icon: CheckCircle,   color: 'text-primary' },
  expiry:          { icon: AlertTriangle, color: 'text-destructive' },
  trial_exhausted: { icon: Zap,           color: 'text-destructive' },
  recharge:        { icon: Activity,      color: 'text-primary' },
  login:           { icon: Clock,         color: 'text-muted-foreground' },
};

export default function SubscriptionNotificationCenter({
  open, onClose, subscription, activities, onRenew,
}: Props) {
  const [notifications, setNotifications] = useState<SubNotification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const notifs: SubNotification[] = [];
    const daysLeft = subscription ? calcDaysRemaining(subscription.expires_at) : 0;

    if (subscription?.status === 'active' && daysLeft === 1) {
      notifs.push({ id: 'expiry_today', type: 'expiry_today', icon: Zap, color: 'text-destructive',
        title: 'اشتراكك ينتهي اليوم!',
        body: 'آخر فرصة للتجديد — جدّد الآن لتجنب انقطاع الخدمة',
      });
    } else if (subscription?.status === 'active' && daysLeft <= 3 && daysLeft > 1) {
      notifs.push({ id: 'expiry_critical', type: 'expiry_critical', icon: AlertTriangle, color: 'text-destructive',
        title: `${daysLeft} أيام فقط!`,
        body: 'اشتراكك على وشك الانتهاء — يُنصح بالتجديد فوراً',
      });
    } else if (subscription?.status === 'active' && daysLeft <= 7 && daysLeft > 3) {
      notifs.push({ id: 'expiry_warning', type: 'expiry_warning', icon: AlertTriangle, color: 'text-warning',
        title: `${daysLeft} أيام متبقية`,
        body: 'اشتراكك سينتهي قريباً — ننصح بالتجديد مسبقاً',
      });
    }

    // آخر 5 أنشطة
    activities.slice(0, 5).forEach(a => {
      const meta = EVENT_ICON[a.event_type] ?? { icon: Activity, color: 'text-muted-foreground' };
      notifs.push({
        id: a.id, type: 'activity',
        icon: meta.icon, color: meta.color,
        title: a.title, body: a.description ?? '',
        time: new Date(a.created_at).toLocaleString('en-GB'),
      });
    });

    setNotifications(notifs);
  }, [subscription, activities]);

  const visible = notifications.filter(n => !dismissed.has(n.id));
  const dismissNotif = (id: string) => setDismissed(prev => new Set([...prev, id]));
  const clearAll = () => setDismissed(new Set(notifications.map(n => n.id)));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center md:p-4" dir="rtl"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full md:max-w-sm bg-card border border-border rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-300 md:zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-black">مركز الإشعارات</h3>
            {visible.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
                {visible.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {visible.length > 0 && (
              <button onClick={clearAll} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                مسح الكل
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Bell className="w-10 h-10 opacity-20" />
              <p className="text-sm">لا توجد إشعارات</p>
            </div>
          ) : (
            visible.map(n => {
              const Icon = n.icon;
              const isAlert = n.type !== 'activity';
              return (
                <div key={n.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                    isAlert ? 'bg-muted/40 border-border' : 'bg-card border-border/50'
                  }`}>
                  <div className={`w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon className={`w-4 h-4 ${n.color}`} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-xs font-semibold">{n.title}</p>
                    {n.body && <p className="text-[11px] text-muted-foreground text-pretty">{n.body}</p>}
                    {n.time && <p className="text-[10px] text-muted-foreground tabular-nums">{n.time}</p>}
                    {isAlert && onRenew && (
                      <Button size="sm" variant="outline"
                        className="mt-1.5 h-6 text-[10px] border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => { onRenew(); onClose(); }}>
                        تجديد الاشتراك
                      </Button>
                    )}
                  </div>
                  <button onClick={() => dismissNotif(n.id)}
                    className="p-1 rounded-md hover:bg-muted transition-colors shrink-0 mt-0.5">
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
