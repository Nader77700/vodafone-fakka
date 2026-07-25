import { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

const WA_POPUP_KEY = 'vf_wa_popup_last_seen';

export default function WhatsAppPopup() {
  const { config } = useRuntimeConfig();
  const waLink = config.ui.ui_support_whatsapp;
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!waLink) return;

    // Check if shown today
    const lastSeen = localStorage.getItem(WA_POPUP_KEY);
    const today = new Date().toDateString();

    if (lastSeen !== today) {
      // Delay showing the popup to not interrupt immediate actions
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [waLink]);

  const close = () => {
    localStorage.setItem(WA_POPUP_KEY, new Date().toDateString());
    setIsOpen(false);
  };

  const openLink = () => {
    localStorage.setItem(WA_POPUP_KEY, new Date().toDateString());
    window.open(waLink, '_blank');
    setIsOpen(false);
  };

  if (!isOpen || !waLink) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-2xl relative border border-border animate-in zoom-in-95">
        <button
          onClick={close}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mt-2">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
            <MessageCircle className="w-8 h-8 text-green-600 dark:text-green-500" />
          </div>
          
          <h2 className="text-xl font-bold mb-2">انضم لجروب الواتساب</h2>
          <p className="text-sm text-muted-foreground mb-6 text-pretty">
            انضم لجروب التطبيق الرسمي لمتابعة التحديثات وحل أي مشكلة تواجهك فوراً.
          </p>

          <Button
            onClick={openLink}
            className="w-full h-12 text-base font-bold bg-green-600 hover:bg-green-700 text-white rounded-xl gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            انضم الآن
          </Button>
          
          <button onClick={close} className="mt-4 text-xs text-muted-foreground underline underline-offset-2">
            تخطي اليوم
          </button>
        </div>
      </div>
    </div>
  );
}
