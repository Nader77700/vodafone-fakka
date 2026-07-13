// MaintenanceScreen — يظهر بدلاً من التطبيق إذا ff_maintenance_mode = true
// يُتحكّم فيه من لوحة الإدارة فوراً بدون APK جديد
import { Wrench, RefreshCw, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

export default function MaintenanceScreen() {
  const { config, refresh } = useRuntimeConfig();
  const msg = config.ui.ui_maintenance_msg || 'التطبيق تحت الصيانة مؤقتاً لتحديث الأنظمة. نعود إليكم قريباً 🔧';
  const waLink = config.ui.ui_support_whatsapp;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background p-6 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
        <Wrench className="h-12 w-12 text-amber-600 dark:text-amber-400" />
      </div>
      
      <h1 className="mb-4 text-3xl font-bold text-balance text-foreground">وضع الصيانة</h1>
      
      <p className="mb-8 max-w-sm text-lg text-muted-foreground text-pretty leading-relaxed">
        {msg}
      </p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        {waLink && (
          <Button 
            className="w-full h-12 text-md gap-2 bg-green-600 hover:bg-green-700 text-white" 
            onClick={() => window.open(waLink, '_blank')}
          >
            <MessageCircle className="h-5 w-5" />
            تواصل معنا عبر واتساب
          </Button>
        )}
        
        <Button variant="outline" onClick={refresh} className="w-full h-12 text-md gap-2">
          <RefreshCw className="h-5 w-5" />
          تحديث الصفحة
        </Button>
      </div>
      
      <p className="mt-12 text-sm text-muted-foreground/60">
        نشكركم على تفهمكم وصبركم
      </p>
    </div>
  );
}
