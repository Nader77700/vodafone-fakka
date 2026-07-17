// MerchantWelcomeDialog — يظهر عند أول دخول فقط أو عند تحديث التعليمات
// يتحقق من DB عبر RPC get_merchant_welcome_status
// عند الضغط على "تم الاطلاع" يستدعي dismiss_merchant_welcome
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import { supabase } from '@/db/supabase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface WelcomeStatus {
  should_show:  boolean;
  instructions: string;
  version:      number;
  merchant_id:  string;
}

export default function MerchantWelcomeDialog() {
  const { user } = useAuth();
  const { data } = useMerchantClient();

  const [open,        setOpen]        = useState(false);
  const [status,      setStatus]      = useState<WelcomeStatus | null>(null);
  const [dismissing,  setDismissing]  = useState(false);
  const [expanded,    setExpanded]    = useState(true);

  const brandColor = data?.merchant?.brand_color ?? '#E60000';

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: res } = await supabase.rpc('get_merchant_welcome_status', {
        p_user_id: user.id,
      });
      if (res?.should_show) {
        setStatus(res as WelcomeStatus);
        setOpen(true);
      }
    })();
  }, [user?.id]);

  const handleDismiss = async () => {
    if (!user?.id || !status) return;
    setDismissing(true);
    await supabase.rpc('dismiss_merchant_welcome', {
      p_user_id:    user.id,
      p_merchant_id: status.merchant_id,
      p_version:    status.version,
    });
    setDismissing(false);
    setOpen(false);
  };

  if (!open || !status) return null;

  // تقسيم التعليمات بالسطور لعرضها كقائمة
  const lines = status.instructions
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] md:max-w-md rounded-3xl p-0 overflow-hidden"
        dir="rtl"
        onInteractOutside={e => e.preventDefault()}
      >
        {/* Header ملون بلون التاجر */}
        <div
          className="px-6 pt-6 pb-5 border-b border-border"
          style={{ background: `${brandColor}0d` }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border"
              style={{ background: `${brandColor}15`, borderColor: `${brandColor}30` }}
            >
              <Info className="w-5 h-5" style={{ color: brandColor }} />
            </div>
            <div className="min-w-0">
              <DialogHeader className="text-right p-0 space-y-0">
                <DialogTitle className="text-base font-black leading-tight text-balance">
                  تعليمات الاستخدام
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {data?.merchant?.name ?? 'التاجر'} — يرجى القراءة قبل البدء
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        {/* التعليمات */}
        <div className="px-5 py-4 max-h-64 overflow-y-auto">
          <button
            className="flex items-center justify-between w-full mb-3 text-right"
            onClick={() => setExpanded(e => !e)}
          >
            <span className="text-xs font-semibold text-muted-foreground">التعليمات</span>
            {expanded
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {expanded && (
            <ul className="space-y-2.5">
              {lines.map((line, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-foreground leading-relaxed">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5"
                    style={{ background: `${brandColor}18`, color: brandColor }}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-pretty">{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* زر تم الاطلاع */}
        <div className="px-5 pb-5">
          <Button
            className="w-full gap-2 font-bold"
            onClick={handleDismiss}
            disabled={dismissing}
          >
            <CheckCircle2 className="w-4 h-4" />
            {dismissing ? 'جارٍ الحفظ…' : 'تم الاطلاع'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
