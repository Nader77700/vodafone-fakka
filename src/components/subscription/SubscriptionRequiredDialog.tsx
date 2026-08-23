import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export default function SubscriptionRequiredDialog({
  open,
  onClose,
  title = 'هذه الخدمة متاحة للمشتركين فقط',
  description = 'فعّل اشتراكك للاستفادة من جميع خدمات التطبيق.',
}: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
        <DialogHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center border border-amber-400/25 mb-3">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
          <DialogTitle className="text-base font-black text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-4">
          <Button
            className="w-full bg-primary text-primary-foreground"
            onClick={() => {
              onClose();
              navigate('/activate');
            }}
          >
            تفعيل الاشتراك
          </Button>
          <Button
            variant="outline"
            className="w-full border-border"
            onClick={onClose}
          >
            <ArrowRight className="w-4 h-4 ml-2" /> رجوع
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
