/**
 * Services Configuration — PHASE 1
 * بيانات الخدمات قابلة للتحكم لاحقًا من السيرفر/لوحة التحكم.
 * لا توجد API Calls هنا — بيانات ثابتة قابلة للاستبدال.
 */

export type ServiceStatus = 'active' | 'maintenance' | 'coming_soon' | 'disabled';

export interface ServiceConfig {
  id: string;
  /** مسار الانتقال */
  path: string;
  /** الاسم المعروض */
  name: string;
  /** وصف مختصر */
  description: string;
  /** اسم أيقونة lucide-react */
  iconName: string;
  /** لون التمييز */
  accentColor: string;
  /** بادج اختياري */
  badge?: string;
  /** حالة الخدمة */
  status: ServiceStatus;
  /** رسالة صيانة */
  maintenanceMessage?: string;
  /** ترتيب الظهور */
  order: number;
  /** هل تظهر في القائمة */
  visible: boolean;
  /** URL صورة الخلفية */
  bgImage?: string;
}

/**
 * قائمة الخدمات — مصممة لتُستبدل بـ fetch من السيرفر لاحقًا.
 * لا تُعدِّل الـ id — يُستخدم كـ key لاحقًا.
 */
export const SERVICES_CONFIG: ServiceConfig[] = [
  {
    id: 'legacy-flex',
    path: '/legacy-flex',
    name: 'أنظمة فليكس القديمة',
    description: 'استعد باقات فليكس الكلاسيكية القديمة بكل سهولة وبدون تعقيد.',
    iconName: 'RotateCcw',
    accentColor: '#E60000',
    badge: 'حصري',
    status: 'active',
    order: 1,
    visible: true,
    bgImage: 'https://miaoda-site-img.s3cdn.medo.dev/images/KLing_00244a03-c11f-4fc0-9c12-663794891d9e.jpg',
  },
  {
    id: 'balance-charge',
    path: '/balance-charge',
    name: 'الشحن من رصيد Ana Vodafone',
    description: 'اشحن كروت الفكة مباشرة من رصيد خطك بدون استخدام Vodafone Cash.',
    iconName: 'Wallet',
    accentColor: '#00C896',
    badge: 'جديد',
    status: 'active',
    order: 2,
    visible: true,
    bgImage: 'https://miaoda-site-img.s3cdn.medo.dev/images/KLing_1a88f3b4-b999-4571-8be4-a6500d03f5c1.jpg',
  },
  {
    id: 'networks',
    path: '/networks',
    name: 'عروض باقي الشبكات',
    description: 'عروض حصرية لجميع الشبكات (فودافون، أورانج، اتصالات، وي).',
    iconName: 'Radio',
    accentColor: '#F7C948',
    badge: 'Premium',
    status: 'active',
    order: 3,
    // مخفي من قسم الخدمات — يظهر مستقلاً في Home
    visible: false,
    bgImage: 'https://miaoda-site-img.s3cdn.medo.dev/images/KLing_8b380f76-5fd3-40a0-a550-2936d7aed23d.jpg',
  },
  {
    id: 'vodafone-cash-center',
    path: '/vodafone-cash-center',
    name: 'تحويل الأموال وشحن الرصيد',
    description: 'قم بتحويل الأموال أو شحن الرصيد مباشرة باستخدام محفظة Vodafone Cash.',
    iconName: 'CreditCard',
    accentColor: '#E60000',
    badge: 'NEW',
    status: 'active',
    order: 4,
    visible: true,
    bgImage: 'https://miaoda-site-img.s3cdn.medo.dev/images/KLing_7f156ea6-4446-42f3-b569-1695e9e2c1f1.jpg',
  },
  {
    id: 'wallet-lines',
    path: '/wallet-lines',
    name: 'خدمات الخطوط والمحافظ',
    description: 'استعلم عن محافظ الشركات وخطوطك المسجلة برقمك القومي بسرعة وأمان.',
    iconName: 'ScanLine',
    accentColor: '#6366f1',
    badge: 'جديد',
    status: 'active',
    order: 5,
    visible: true,
  },
];

/** يُرجع خدمة بـ ID محدد */
export function getServiceById(id: string): ServiceConfig | undefined {
  return SERVICES_CONFIG.find(s => s.id === id);
}

/** يُرجع الخدمات المرئية مرتبة */
export function getVisibleServices(): ServiceConfig[] {
  return SERVICES_CONFIG.filter(s => s.visible).sort((a, b) => a.order - b.order);
}
