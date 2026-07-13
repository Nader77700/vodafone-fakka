// MaintenanceScreen — يظهر بدلاً من التطبيق إذا ff_maintenance_mode = true
// يُتحكّم فيه من لوحة الإدارة فوراً بدون APK جديد
import { Wrench, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

export default function MaintenanceScreen() {
  const { config, refresh } = useRuntimeConfig();
  const msg = config.ui.ui_maintenance_msg || 'التطبيق تحت الصيانة. نعود قريباً 🔧';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background p-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
        <Wrench className="h-10 w-10 text-amber-600 dark:text-amber-400" />
      </div>
      <h1 className="mb-3 text-2xl font-bold text-balance">وضع الصيانة</h1>
      <p className="mb-8 max-w-sm text-muted-foreground text-pretty">{msg}</p>
      <Button variant="outline" onClick={refresh} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        تحديث الصفحة
      </Button>
    </div>
  );
}
