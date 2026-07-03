// ── Phase 9: Merchant Charge Guard ─────────────────────────────────────────
// ADDITIVE — يُعرض في MerchantClientLayout فوق المحتوى
// يحجب عمليات الشحن عند عدم الأهلية ويعرض السبب بوضوح

import { AlertTriangle, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMerchantChargeValidation } from '@/hooks/useMerchantChargeValidation';
import { cn } from '@/lib/utils';

interface Props {
  /** إذا كانت true يظهر شريط حالة صغير فوق الصفحة بدلاً من overlay كامل */
  compact?: boolean;
}

export default function MerchantChargeGuard({ compact = false }: Props) {
  const { loading, eligible, eligibility, errorLabel, refresh } = useMerchantChargeValidation();

  // لا حاجة للعرض أثناء التحميل أو عند الأهلية الكاملة
  if (loading) {
    return compact ? (
      <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>جارٍ التحقق من أهليتك…</span>
      </div>
    ) : null;
  }

  if (eligible) {
    // عند الأهلية في وضع compact: شريط أخضر خفيف
    if (compact && eligibility) {
      const opsRemaining = eligibility.ops_remaining;
      const showOpsWarn  = opsRemaining !== null && opsRemaining !== undefined && opsRemaining <= 5;
      if (!showOpsWarn) return null;
      return (
        <div className="mx-4 mt-2 rounded-xl border border-warning/30 bg-warning/8 px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
          <p className="text-xs text-warning font-medium">
            تبقّى لك <span className="font-black">{opsRemaining}</span> عملية فقط — جدّد اشتراكك قريباً
          </p>
        </div>
      );
    }
    return null;
  }

  // ── وضع Compact: شريط تحذير صغير ──────────────────────────────
  if (compact) {
    return (
      <div
        className="mx-4 mt-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2
                   flex items-center gap-2"
        role="alert"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
        <p className="flex-1 min-w-0 text-xs text-destructive font-medium truncate">
          {errorLabel ?? 'غير مسموح بتنفيذ عمليات الشحن حالياً'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 text-destructive hover:text-destructive"
          onClick={refresh}
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  // ── وضع Full: overlay يحجب الصفحة مع تفاصيل ──────────────────
  const stageLabels: Record<string, string> = {
    user:         'حساب المستخدم',
    merchant:     'حساب التاجر',
    member:       'عضوية التاجر',
    subscription: 'الاشتراك',
    system:       'النظام',
  };
  const stageLabel = stageLabels[eligibility?.stage ?? ''] ?? eligibility?.stage ?? '';

  return (
    <div
      className={cn(
        'absolute inset-0 z-50 flex flex-col items-center justify-center gap-4',
        'bg-background/95 backdrop-blur-sm px-6 text-center',
      )}
      role="alert"
    >
      {/* أيقونة ─────────────────────────────────────────── */}
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
      </div>

      {/* العنوان ──────────────────────────────────────── */}
      <div className="space-y-1">
        <h2 className="text-lg font-black text-foreground">لا يمكن تنفيذ عمليات الشحن</h2>
        {stageLabel && (
          <p className="text-xs text-muted-foreground">
            المشكلة في: <span className="font-bold text-foreground">{stageLabel}</span>
          </p>
        )}
      </div>

      {/* رسالة السبب ─────────────────────────────────── */}
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 max-w-xs w-full">
        <p className="text-sm font-medium text-destructive leading-relaxed">
          {errorLabel}
        </p>
        {eligibility?.merchant_name && (
          <p className="text-[11px] text-muted-foreground mt-1">
            التاجر: <span className="font-bold">{eligibility.merchant_name}</span>
          </p>
        )}
        {eligibility?.ops_count !== undefined && eligibility?.ops_limit !== undefined && (
          <p className="text-[11px] text-muted-foreground mt-1">
            العمليات: {eligibility.ops_count} / {eligibility.ops_limit}
          </p>
        )}
      </div>

      {/* أزرار ───────────────────────────────────────── */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={refresh}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        إعادة التحقق
      </Button>

      {/* نصيحة — بدون روابط أو أرقام تواصل ───────────── */}
      <p className="text-[11px] text-muted-foreground max-w-[260px] text-pretty">
        للمساعدة يرجى التواصل مباشرة مع التاجر الخاص بك.
      </p>
    </div>
  );
}

/** شريط حالة بسيط للاستخدام في قمة الصفحات */
export function MerchantChargeStatusBar() {
  return <MerchantChargeGuard compact />;
}

/** أيقونة حالة صغيرة للاستخدام في الـ header */
export function MerchantChargeStatusDot() {
  const { loading, eligible } = useMerchantChargeValidation();
  if (loading) return <span className="w-2 h-2 rounded-full bg-muted animate-pulse" />;
  return (
    <span
      className={cn(
        'w-2 h-2 rounded-full',
        eligible ? 'bg-success' : 'bg-destructive',
      )}
      title={eligible ? 'مسموح بالعمليات' : 'غير مسموح بالعمليات'}
    />
  );
}
