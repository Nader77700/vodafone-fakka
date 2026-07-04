// AdminShell — غلاف مشترك لجميع صفحات الإدارة الفرعية
// يوفر: Header + Breadcrumb + Sticky + حاوية المحتوى + Fade-in animation
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AdminShellProps {
  title: string;
  subtitle?: string;
  breadcrumbs: BreadcrumbItem[];
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function AdminShell({
  title, subtitle, breadcrumbs, actions, children, className,
}: AdminShellProps) {
  const navigate = useNavigate();

  return (
    <div className={cn('min-h-screen bg-background animate-in fade-in duration-200', className)}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 flex-wrap">
            {breadcrumbs.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3 h-3 opacity-40 shrink-0" />}
                {item.href ? (
                  <button
                    onClick={() => navigate(item.href!)}
                    className="hover:text-foreground transition-colors font-medium"
                  >
                    {item.label}
                  </button>
                ) : (
                  <span className={i === breadcrumbs.length - 1 ? 'text-foreground font-semibold' : ''}>
                    {item.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
          {/* Header Row */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => navigate(-1)}
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="font-black text-lg leading-tight truncate">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
            </div>
            {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  );
}

// ── Sticky Action Bar ──────────────────────────────────────────────────────
export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
        {children}
      </div>
    </div>
  );
}

// ── Confirm Dialog ──────────────────────────────────────────────────────────
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
}

export function ConfirmDialog({
  open, onOpenChange, title, description,
  confirmLabel = 'تأكيد', cancelLabel = 'إلغاء',
  variant = 'default', onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Info Row ───────────────────────────────────────────────────────────────
export function InfoRow({ label, value, copyable }: { label: string; value?: string | null; copyable?: boolean }) {
  const copy = () => { if (value) navigator.clipboard.writeText(value); };
  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="text-xs font-medium text-right break-all flex-1 min-w-0">{value ?? '—'}</span>
      {copyable && value && (
        <button onClick={copy} className="text-[10px] text-primary shrink-0 hover:opacity-70">نسخ</button>
      )}
    </div>
  );
}

// ── Section Card ───────────────────────────────────────────────────────────
export function SectionCard({ title, icon: Icon, children, className }: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card overflow-hidden', className)}>
      {(title || Icon) && (
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border">
          {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
          <span className="font-bold text-sm">{title}</span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Status Badge ───────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'bg-success/10 text-success border-success/20',
    inactive: 'bg-muted text-muted-foreground border-border',
    banned:   'bg-destructive/10 text-destructive border-destructive/20',
    suspended:'bg-warning/10 text-warning border-warning/20',
    expired:  'bg-warning/10 text-warning border-warning/20',
    pending:  'bg-primary/10 text-primary border-primary/20',
  };
  const labels: Record<string, string> = {
    active: 'نشط', inactive: 'غير نشط', banned: 'محظور',
    suspended: 'معلق', expired: 'منتهي', pending: 'معلق',
  };
  const cls = map[status] ?? 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}
