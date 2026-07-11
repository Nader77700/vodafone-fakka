// ── Phase 10: MerchantControlScreens ────────────────────────────────────────
// ثلاث شاشات تحكم تظهر للمستخدم عند تفعيل Kill Switch / Maintenance / Force Update
// ADDITIVE — لا يعدّل أي نظام قائم

import { ShieldOff, Wrench, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────
// Kill Switch Screen — يوقف النسخة كلياً
// ─────────────────────────────────────────────────────────────────
export function KillSwitchScreen({ message }: { message?: string | null }) {
  return (
    <FullScreenBlock
      icon={ShieldOff}
      iconBg="bg-destructive/10"
      iconColor="text-destructive"
      title="تم إيقاف هذه الخدمة"
      message={message ?? 'تم إيقاف هذه النسخة مؤقتاً. يرجى التواصل مع التاجر للمزيد من المعلومات.'}
      badge="موقوف"
      badgeCls="bg-destructive/10 text-destructive border-destructive/20"
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// Maintenance Mode Screen — يمنع العمليات مع عرض البيانات
// ─────────────────────────────────────────────────────────────────
export function MaintenanceScreen({
  message, onDismiss,
}: { message?: string | null; onDismiss?: () => void }) {
  return (
    <FullScreenBlock
      icon={Wrench}
      iconBg="bg-warning/10"
      iconColor="text-warning"
      title="الخدمة تحت الصيانة"
      message={message ?? 'الخدمة تحت الصيانة حالياً. يمكنك عرض البيانات لكن لا يمكن تنفيذ عمليات الشحن.'}
      badge="صيانة"
      badgeCls="bg-warning/10 text-warning border-warning/20"
      action={onDismiss ? { label: 'عرض البيانات فقط', onClick: onDismiss } : undefined}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// Force Update Screen — يجبر المستخدم على التحديث
// ─────────────────────────────────────────────────────────────────
export function ForceUpdateScreen({
  message, updateUrl,
}: { message?: string | null; updateUrl?: string | null }) {
  return (
    <FullScreenBlock
      icon={RefreshCw}
      iconBg="bg-primary/10"
      iconColor="text-primary"
      title="تحديث إجباري مطلوب"
      message={message ?? 'يوجد تحديث جديد مطلوب للمتابعة. يرجى تحديث التطبيق أولاً.'}
      badge="تحديث مطلوب"
      badgeCls="bg-primary/10 text-primary border-primary/20"
      action={updateUrl ? {
        label: 'تحديث الآن',
        onClick: () => window.open(updateUrl, '_blank'),
        icon: ExternalLink,
      } : undefined}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// Shared FullScreenBlock
// ─────────────────────────────────────────────────────────────────
interface BlockProps {
  icon:      React.ElementType;
  iconBg:    string;
  iconColor: string;
  title:     string;
  message:   string;
  badge:     string;
  badgeCls:  string;
  action?: { label: string; onClick: () => void; icon?: React.ElementType };
}

function FullScreenBlock({ icon: Icon, iconBg, iconColor, title, message, badge, badgeCls, action }: BlockProps) {
  const ActionIcon = action?.icon;
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/97 backdrop-blur-sm px-6 text-center"
      role="alert"
      dir="rtl"
    >
      {/* Badge */}
      <span className={cn('text-[10px] font-black px-3 py-1 rounded-full border', badgeCls)}>
        {badge}
      </span>

      {/* Icon */}
      <div className={cn('w-20 h-20 rounded-3xl flex items-center justify-center border', iconBg,
        iconColor.replace('text-', 'border-').concat('/30'))}>
        <Icon className={cn('w-10 h-10', iconColor)} />
      </div>

      {/* Text */}
      <div className="space-y-2 max-w-xs">
        <h2 className="text-xl font-black text-foreground text-balance">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed text-pretty">{message}</p>
      </div>

      {/* Action */}
      {action && (
        <Button
          className="gap-2 font-bold"
          onClick={action.onClick}
        >
          {ActionIcon && <ActionIcon className="w-4 h-4" />}
          {action.label}
        </Button>
      )}

      {/* Powered by */}
      <p className="text-[10px] text-muted-foreground/50 absolute bottom-6">
        Vodafone Fakka Premium
      </p>
    </div>
  );
}
