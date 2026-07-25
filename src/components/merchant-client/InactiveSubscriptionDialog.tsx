// PHASE 1-2: Popup موحّد لحالة الاشتراك غير النشط
// يُستخدم من أي شاشة أو Hook — مصدر واحد للرسالة
import { AlertTriangle, Phone, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open:       boolean;
  onClose:    () => void;
  reason?:    string;
  merchantName?: string;
}

export default function InactiveSubscriptionDialog({ open, onClose, reason, merchantName }: Props) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] md:max-w-sm rounded-2xl text-center gap-0 p-0 overflow-hidden"
        dir="rtl"
      >
        {/* رأس ملوّن */}
        <div className="bg-destructive/10 border-b border-destructive/20 flex flex-col items-center gap-3 px-6 py-6">
          <div className="w-14 h-14 rounded-2xl bg-destructive/15 border border-destructive/25 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-base font-black text-foreground">اشتراكك غير نشط</h2>
        </div>

        {/* جسم الرسالة */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
            {reason ?? 'اشتراكك غير نشط. يرجى التواصل مع التاجر لتفعيل الاشتراك.'}
          </p>
          {merchantName && (
            <p className="text-xs text-muted-foreground">
              التاجر: <span className="font-bold text-foreground">{merchantName}</span>
            </p>
          )}
        </div>

        {/* أزرار */}
        <div className="px-6 pb-5 flex flex-col gap-2">
          <Button className="w-full gap-2" onClick={onClose}>
            <Phone className="w-4 h-4" />
            تواصل مع التاجر
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={onClose}>
            <X className="w-4 h-4" />
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
