// نظام الروابط الذكية — Dropdown صفحات التطبيق + واتساب + رابط مخصص
import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AppPage {
  label: string;
  icon: string;
  path: string;
  description?: string;
}

export const APP_PAGES: AppPage[] = [
  // ── صفحات التطبيق الأساسية ──────────────────────────────────
  { label: 'الصفحة الرئيسية',       icon: '🏠', path: '/home',                 description: 'الصفحة الرئيسية للتطبيق' },
  { label: 'شحن الرصيد',            icon: '📱', path: '/recharge',             description: 'صفحة شحن الأرقام' },
  { label: 'الإشعارات',             icon: '🔔', path: '/notifications',        description: 'مركز الإشعارات' },
  { label: 'الملف الشخصي / الإعدادات', icon: '👤', path: '/settings',          description: 'إعدادات الحساب' },
  { label: 'الاشتراك الحالي',       icon: '💳', path: '/subscription-history', description: 'تفاصيل الاشتراك الحالي' },
  { label: 'سجل الاشتراكات',        icon: '📜', path: '/subscription-history', description: 'تاريخ الاشتراكات' },
  { label: 'تفعيل اشتراك',          icon: '🔑', path: '/activate',             description: 'صفحة تفعيل كود الاشتراك' },
  { label: 'العمليات',              icon: '🧾', path: '/operations',           description: 'سجل عمليات الشحن' },
  { label: 'الإحصائيات',            icon: '📈', path: '/statistics',           description: 'الإحصائيات الشخصية' },
  { label: 'المفضلة',               icon: '⭐', path: '/favorites',            description: 'الأرقام المفضلة' },
  { label: 'الشبكات',               icon: '📡', path: '/networks',             description: 'صفحة الشبكات' },
  { label: 'فودافون',               icon: '🔴', path: '/networks/vodafone',    description: 'شحن فودافون' },
  { label: 'أورانج',                icon: '🟠', path: '/networks/orange',      description: 'شحن أورانج' },
  { label: 'اتصالات',               icon: '🟢', path: '/networks/etisalat',    description: 'شحن اتصالات' },
  { label: 'WE',                    icon: '🔵', path: '/networks/we',          description: 'شحن WE' },
  { label: 'التحديثات',             icon: '⬇️', path: '/updates',              description: 'تحديث التطبيق وتنزيل APK' },
  { label: 'الدعم الفني',           icon: '🎧', path: '/support',              description: 'صفحة الدعم والمساعدة' },
  { label: 'معلومات البناء',        icon: 'ℹ️', path: '/build-info',           description: 'تفاصيل الإصدار' },
  // ── صفحات الإدارة ──────────────────────────────────────────
  { label: 'لوحة الإدارة',          icon: '🛡️', path: '/admin',               description: 'لوحة إدارة النظام (مدير فقط)' },
  { label: 'سجلات النظام',          icon: '🗂️', path: '/system-logs',          description: 'سجلات النظام التفصيلية' },
];

// روابط خارجية جاهزة
const EXTERNAL_OPTIONS = [
  { label: '💬 واتساب (رقم المالك)',  prefix: 'https://wa.me/20', placeholder: 'أدخل رقم الهاتف بدون 0 مثال: 1012345678' },
  { label: '🌐 رابط خارجي مخصص',     prefix: 'https://',          placeholder: 'أدخل الرابط الكامل...' },
];

const EMPTY_VALUE  = '__none__';
const CUSTOM_VALUE = '__custom__';
const WA_VALUE     = '__whatsapp__';

interface DeepLinkSelectProps {
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
}

export default function DeepLinkSelect({ value, onChange, placeholder = 'اختر صفحة أو رابط...' }: DeepLinkSelectProps) {
  // تحديد الحالة الأولية بناء على القيمة المُمرَّرة
  const getInitialMode = () => {
    if (!value) return EMPTY_VALUE;
    if (value.startsWith('https://wa.me/')) return WA_VALUE;
    if (value.startsWith('http://') || value.startsWith('https://')) return CUSTOM_VALUE;
    return 'page';
  };

  const [mode, setMode] = useState<string>(getInitialMode);
  const [customUrl, setCustomUrl] = useState(
    value.startsWith('http') ? value : ''
  );
  const [waPhone, setWaPhone] = useState(
    value.startsWith('https://wa.me/20') ? value.replace('https://wa.me/20', '') : ''
  );

  // مزامنة عند تغيير value من الخارج (مثل تحميل قالب)
  useEffect(() => {
    const m = getInitialMode();
    setMode(m === 'page' ? value : m);
    if (value.startsWith('https://wa.me/20')) setWaPhone(value.replace('https://wa.me/20', ''));
    else if (value.startsWith('http')) setCustomUrl(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModeChange = (v: string) => {
    setMode(v);
    if (v === EMPTY_VALUE) { onChange(''); return; }
    if (v === WA_VALUE)    { onChange(waPhone ? `https://wa.me/20${waPhone}` : ''); return; }
    if (v === CUSTOM_VALUE){ onChange(customUrl); return; }
    // صفحة داخلية
    onChange(v);
  };

  const handleWaChange = (phone: string) => {
    setWaPhone(phone);
    onChange(phone ? `https://wa.me/20${phone.replace(/^0+/, '')}` : '');
  };

  const handleCustomChange = (url: string) => {
    setCustomUrl(url);
    onChange(url);
  };

  // القيمة المعروضة في الـ trigger
  const triggerValue = mode === WA_VALUE ? WA_VALUE : mode === CUSTOM_VALUE ? CUSTOM_VALUE : (value || EMPTY_VALUE);

  return (
    <div className="space-y-2">
      <Select value={triggerValue} onValueChange={handleModeChange}>
        <SelectTrigger className="bg-card border-border h-9 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {/* بدون رابط */}
          <SelectItem value={EMPTY_VALUE}>
            <span className="text-muted-foreground">— بدون رابط —</span>
          </SelectItem>

          {/* ── صفحات التطبيق ── */}
          <div className="px-2 py-1">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">صفحات التطبيق</p>
          </div>
          {APP_PAGES.map(page => (
            <SelectItem key={page.path + page.label} value={page.path}>
              <span className="flex items-center gap-2">
                <span>{page.icon}</span>
                <span>{page.label}</span>
                <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">{page.path}</span>
              </span>
            </SelectItem>
          ))}

          {/* ── روابط خارجية ── */}
          <div className="px-2 py-1 border-t border-border mt-1">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">روابط خارجية</p>
          </div>
          <SelectItem value={WA_VALUE}>
            <span className="flex items-center gap-2">
              <span>💬</span><span>واتساب</span>
            </span>
          </SelectItem>
          <SelectItem value={CUSTOM_VALUE}>
            <span className="flex items-center gap-2">
              <span>🌐</span><span>رابط مخصص (URL)</span>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* حقل رقم واتساب */}
      {mode === WA_VALUE && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">رقم واتساب (مصري بدون 0 الأولى)</Label>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono bg-muted px-2 py-2 rounded-r-lg border border-border border-l-0 text-muted-foreground shrink-0">+20</span>
            <Input
              className="h-9 text-sm rounded-r-none border-r-0 bg-background"
              placeholder="1012345678"
              value={waPhone}
              onChange={e => handleWaChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
              dir="ltr"
            />
          </div>
          {waPhone && (
            <p className="text-[10px] text-muted-foreground font-mono">🔗 https://wa.me/20{waPhone}</p>
          )}
        </div>
      )}

      {/* حقل رابط مخصص */}
      {mode === CUSTOM_VALUE && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">الرابط الكامل</Label>
          <Input
            className="h-9 text-sm bg-background"
            placeholder="https://example.com"
            value={customUrl}
            onChange={e => handleCustomChange(e.target.value)}
            dir="ltr"
          />
        </div>
      )}
    </div>
  );
}
