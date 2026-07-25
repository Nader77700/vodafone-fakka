// بانر حالة الاشتراك — يعتمد على Subscription Engine فقط، لا على التاريخ وحده
import { useState, useEffect } from 'react';
import { AlertTriangle, X, Clock, Zap, Ban, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SubStatus } from '@/hooks/useSubscriptionEngine';

export interface SubscriptionAlertBannerProps {
  // الحالة من Engine
  status: SubStatus;
  isAdmin: boolean;
  // عمليات
  opsRem: number | null;       // null = غير محدود
  opsLimit: number | null;
  exhaustedByUsage: boolean;   // نفدت العمليات
  // وقت
  daysLeft: number;            // أيام متبقية (0 = منتهٍ أو < يوم)
  hoursLeft: number;           // ساعات متبقية إضافية
  // إلغاء أدمن
  isCancelled: boolean;
  onRenew?: () => void;
}

const STORAGE_KEY = 'sub_alert_dismissed_v2';

export default function SubscriptionAlertBanner({
  status, isAdmin, opsRem, opsLimit, exhaustedByUsage,
  daysLeft, hoursLeft, isCancelled, onRenew,
}: SubscriptionAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // أعِد عرض البانر عند أي تغيير في الحالة
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    setDismissed(stored === status);
  }, [status]);

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, status);
    setDismissed(true);
  };

  // مسؤول = لا بانر أبداً
  if (isAdmin) return null;
  // نشط وباقي أكثر من 7 أيام وعمليات كافية = لا بانر
  if (status === 'active' && daysLeft > 7 && (opsRem === null || opsRem > 3)) return null;
  if (dismissed) return null;

  // ── تحديد نوع الرسالة ────────────────────────────────────────────────────
  type BannerVariant = {
    icon: React.ElementType;
    bg: string; border: string; text: string;
    title: string; subtitle: string;
    showRenew: boolean;
  };

  let variant: BannerVariant;

  if (isCancelled || status === 'cancelled' as string) {
    variant = {
      icon: Ban, bg: 'bg-destructive/10', border: 'border-destructive/25',
      text: 'text-destructive',
      title: 'تم إلغاء الاشتراك بواسطة الإدارة',
      subtitle: 'يرجى التواصل مع الدعم لمعرفة السبب أو تفعيل اشتراك جديد.',
      showRenew: true,
    };
  } else if (exhaustedByUsage || (status === 'expired' && opsLimit !== null && opsRem === 0)) {
    variant = {
      icon: Zap, bg: 'bg-destructive/10', border: 'border-destructive/25',
      text: 'text-destructive',
      title: 'انتهى الاشتراك بسبب استنفاد جميع العمليات',
      subtitle: 'قم بتجديد الاشتراك للاستمرار.',
      showRenew: true,
    };
  } else if (status === 'expired') {
    variant = {
      icon: AlertTriangle, bg: 'bg-destructive/10', border: 'border-destructive/25',
      text: 'text-destructive',
      title: 'انتهى الاشتراك بسبب انتهاء مدة الاشتراك',
      subtitle: 'قم بالتجديد لاستعادة الوصول الكامل.',
      showRenew: true,
    };
  } else if (status === 'active' && daysLeft === 0 && hoursLeft < 24) {
    variant = {
      icon: Zap, bg: 'bg-destructive/12', border: 'border-destructive/30',
      text: 'text-destructive',
      title: 'اشتراكك سينتهي خلال أقل من 24 ساعة',
      subtitle: `متبقي ${hoursLeft} ساعة — جدّد الآن لتجنب الانقطاع.`,
      showRenew: true,
    };
  } else if (status === 'active' && daysLeft > 0 && daysLeft <= 3) {
    variant = {
      icon: AlertTriangle, bg: 'bg-orange-500/10', border: 'border-orange-500/25',
      text: 'text-orange-500',
      title: `اشتراكك سينتهي خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`,
      subtitle: 'يُنصح بالتجديد مبكراً.',
      showRenew: true,
    };
  } else if (status === 'active' && daysLeft <= 7) {
    variant = {
      icon: Clock, bg: 'bg-yellow-500/10', border: 'border-yellow-500/25',
      text: 'text-yellow-600 dark:text-yellow-400',
      title: `اشتراكك سينتهي خلال ${daysLeft} أيام`,
      subtitle: 'لديك وقت للتجديد.',
      showRenew: false,
    };
  } else if (status === 'active' && opsRem !== null && opsLimit !== null && opsRem <= 3 && opsRem > 0) {
    variant = {
      icon: Zap, bg: 'bg-orange-500/10', border: 'border-orange-500/25',
      text: 'text-orange-500',
      title: `متبقي ${opsRem} ${opsRem === 1 ? 'عملية واحدة' : 'عمليات فقط'}`,
      subtitle: 'اشترِ اشتراكاً جديداً قبل نفاد الحصة.',
      showRenew: true,
    };
  } else {
    // active + everything fine
    return null;
  }

  const Icon = variant.icon;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${variant.bg} ${variant.border} animate-in slide-in-from-top-2 duration-300`}>
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${variant.text}`} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className={`text-sm font-semibold ${variant.text}`}>{variant.title}</p>
        <p className="text-xs text-muted-foreground">{variant.subtitle}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {variant.showRenew && onRenew && (
          <Button size="sm" variant="outline"
            className={`h-7 text-xs border-current font-medium ${variant.text} hover:bg-current/10`}
            onClick={onRenew}>
            تجديد
          </Button>
        )}
        <button onClick={dismiss} className="p-1 rounded-md hover:bg-muted/50 transition-colors">
          <X className={`w-3.5 h-3.5 ${variant.text}`} />
        </button>
      </div>
    </div>
  );
}
