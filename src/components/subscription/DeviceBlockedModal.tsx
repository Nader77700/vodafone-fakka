// نافذة حجب الجهاز — تظهر عند محاولة تفعيل كود هدية/تجريبي
// على جهاز سبق أن فعّل نفس الكود بحساب آخر
import { ShieldAlert, AlertTriangle, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DeviceBlockedModalProps {
  open: boolean;
  blockerUsername: string;
  onClose: () => void;
}

export default function DeviceBlockedModal({ open, blockerUsername, onClose }: DeviceBlockedModalProps) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-destructive/40"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex flex-col items-center gap-3 pt-2">
            {/* أيقونة تحذير */}
            <div className="w-20 h-20 rounded-2xl bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-destructive" />
            </div>
            <span className="text-lg font-black text-destructive text-balance text-center">
              🚫 هذا الجهاز محجوب
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pb-2">
          {/* الرسالة الرئيسية */}
          <div className="rounded-xl bg-destructive/8 border border-destructive/20 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-foreground text-pretty leading-relaxed">
                تم استخدام كود الهدية الترحيبية مسبقاً على هذا الجهاز
              </p>
            </div>
          </div>

          {/* تفاصيل الحساب الآخر */}
          <div className="rounded-xl bg-muted/40 border border-border p-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium">الحساب المسجَّل على هذا الجهاز:</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                <LogIn className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">@{blockerUsername}</p>
                <p className="text-xs text-muted-foreground">استخدم الهدية الترحيبية بالفعل</p>
              </div>
            </div>
          </div>

          {/* تفسير القاعدة */}
          <p className="text-xs text-muted-foreground text-center text-pretty px-2">
            لكل جهاز استخدام واحد فقط للكود الترحيبي.
            للحصول على اشتراك، تواصل مع الدعم الفني.
          </p>

          <Button
            variant="outline"
            className="w-full border-border h-10"
            onClick={onClose}
          >
            حسناً، فهمت
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
