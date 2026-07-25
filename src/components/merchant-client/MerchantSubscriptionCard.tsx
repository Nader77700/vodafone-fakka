// بطاقة الاشتراك — أعلى واجهة Merchant Client Mode
// تعرض: اسم المستخدم، اسم التاجر، حالة الاشتراك، النقاط، العمليات، الانتهاء
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Zap, Clock, CalendarDays, RefreshCw,
  CheckCircle, AlertTriangle, XCircle, Hourglass,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Button } from '@/components/ui/button';

const SUB_STATUS_STYLE: Record<string, string> = {
  active:       'bg-success/15 text-success border-success/25',
  grace_period: 'bg-warning/15 text-warning border-warning/25',
  trial:        'bg-primary/15 text-primary border-primary/25',
  expired:      'bg-destructive/15 text-destructive border-destructive/25',
  inactive:     'bg-muted text-muted-foreground border-border',
};
const SUB_STATUS_LABEL: Record<string, string> = {
  active:       'نشط',
  grace_period: 'مهلة',
  trial:        'تجريبي',
  expired:      'منتهي',
  inactive:     'غير نشط',
};
const SUB_STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  active:       CheckCircle,
  grace_period: Hourglass,
  trial:        Zap,
  expired:      XCircle,
  inactive:     AlertTriangle,
};

export default function MerchantSubscriptionCard() {
  const { profile } = useAuth();
  const { data, isLoading, refresh } = useMerchantClient();

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="grid grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { merchant, subscription } = data;
  const sub     = subscription;
  const subKey  = sub?.status ?? 'inactive';
  const SubIcon = SUB_STATUS_ICON[subKey] ?? AlertTriangle;

  // لون العلامة التجارية (مع fallback للوان التطبيق)
  const brandColor = merchant.brand_color ?? 'hsl(var(--primary))';

  return (
    <div
      className="rounded-2xl border border-border bg-card overflow-hidden"
      dir="rtl"
    >
      {/* ─── شريط التاجر العلوي ─── */}
      <div
        className="px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: `${brandColor}18`, borderBottom: `1px solid ${brandColor}30` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {merchant.logo_url ? (
            <img
              src={merchant.logo_url}
              alt={merchant.name}
              className="w-8 h-8 rounded-lg object-cover border border-border shrink-0"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
              style={{ background: `${brandColor}20`, borderColor: `${brandColor}40` }}
            >
              <Building2 className="w-4 h-4" style={{ color: brandColor }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground leading-none mb-0.5">تاجرك المعتمد</p>
            <p className="text-sm font-black truncate leading-tight" style={{ color: brandColor }}>
              {merchant.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={cn('h-6 text-[10px] font-semibold border gap-1', SUB_STATUS_STYLE[subKey])}
          >
            <SubIcon className="w-3 h-3" />
            {SUB_STATUS_LABEL[subKey]}
          </Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refresh}>
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* ─── رسالة ترحيب (اختياري) ─── */}
      {merchant.welcome_msg && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border/50">
          <p className="text-xs text-muted-foreground leading-relaxed">{merchant.welcome_msg}</p>
        </div>
      )}

      {/* ─── بيانات المستخدم والاشتراك ─── */}
      <div className="p-4 space-y-3">
        {/* اسم المستخدم */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-black">
            👋 مرحباً، <span style={{ color: brandColor }}>{profile?.username ?? '—'}</span>
          </p>
          {sub?.expires_at && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
              <CalendarDays className="w-3 h-3" />
              <span>ينتهي {format(new Date(sub.expires_at), 'dd/MM/yyyy', { locale: ar })}</span>
            </div>
          )}
        </div>

        {/* الإحصائيات */}
        {sub ? (
          <div className="grid grid-cols-3 gap-2">
            {/* النقاط المتبقية */}
            <div className="bg-muted/40 rounded-xl p-2.5 text-center space-y-0.5">
              <Zap className="w-4 h-4 mx-auto" style={{ color: brandColor }} />
              <p className="text-lg font-black leading-none">
                {sub.ops_remaining !== null ? sub.ops_remaining : '∞'}
              </p>
              <p className="text-[9px] text-muted-foreground">متبقي</p>
            </div>
            {/* العمليات المستخدمة */}
            <div className="bg-muted/40 rounded-xl p-2.5 text-center space-y-0.5">
              <Clock className="w-4 h-4 text-muted-foreground mx-auto" />
              <p className="text-lg font-black leading-none">{sub.ops_count}</p>
              <p className="text-[9px] text-muted-foreground">مستخدم</p>
            </div>
            {/* الحد الأقصى */}
            <div className="bg-muted/40 rounded-xl p-2.5 text-center space-y-0.5">
              <CheckCircle className="w-4 h-4 text-muted-foreground mx-auto" />
              <p className="text-lg font-black leading-none">
                {sub.ops_limit !== null ? sub.ops_limit : '∞'}
              </p>
              <p className="text-[9px] text-muted-foreground">الحد</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
            <p className="text-xs text-warning">لا يوجد اشتراك نشط — تواصل مع تاجرك</p>
          </div>
        )}

        {/* آخر تحديث */}
        <p className="text-[9px] text-muted-foreground text-left">
          آخر تحديث: {format(new Date(), 'hh:mm a', { locale: ar })}
        </p>
      </div>
    </div>
  );
}
