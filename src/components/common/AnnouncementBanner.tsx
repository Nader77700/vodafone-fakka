// AnnouncementBanner — يقرأ ui_announcement_* من RuntimeConfig
// يظهر في أعلى كل صفحة إذا كان مفعّلاً من لوحة الإدارة
import { X, Info, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useUIConfig } from '@/contexts/RuntimeConfigContext';

const ICONS = {
  info:    <Info className="h-4 w-4 shrink-0" />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0" />,
  error:   <AlertCircle className="h-4 w-4 shrink-0" />,
  success: <CheckCircle className="h-4 w-4 shrink-0" />,
};

const COLORS = {
  info:    'bg-blue-500 text-white',
  warning: 'bg-amber-500 text-white',
  error:   'bg-red-600 text-white',
  success: 'bg-green-600 text-white',
};

export default function AnnouncementBanner() {
  const ui = useUIConfig();
  const [dismissed, setDismissed] = useState(false);

  if (!ui.ui_announcement_enabled || !ui.ui_announcement_text || dismissed) return null;

  const type   = ui.ui_announcement_type ?? 'info';
  const color  = COLORS[type] ?? COLORS.info;
  const icon   = ICONS[type]  ?? ICONS.info;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${color}`} role="alert">
      {icon}
      <span className="flex-1 min-w-0 text-pretty">{ui.ui_announcement_text}</span>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 focus:outline-none"
        aria-label="إغلاق الإعلان"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
