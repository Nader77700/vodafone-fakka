// خدمات مشتركة لجميع صفحات الشبكات (Coming Soon)
import { Zap, Smartphone, Wifi, CreditCard, Package, Star, PhoneCall, Gift } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ServiceConfig {
  id: string;
  name: string;
  desc: string;
  icon: LucideIcon;
}

export const COMING_SOON_SERVICES: ServiceConfig[] = [
  { id: 'fakka',    name: 'فكة',       desc: 'كروت الفكة بجميع الفئات',         icon: CreditCard },
  { id: 'minutes',  name: 'دقائق',     desc: 'باقات الدقائق المحلية والدولية',    icon: PhoneCall },
  { id: 'internet', name: 'إنترنت',    desc: 'ميجابايت وباقات الإنترنت',          icon: Wifi },
  { id: 'bundles',  name: 'باقات',     desc: 'الباقات الشاملة والعروض المجمعة',   icon: Package },
  { id: 'offers',   name: 'عروض',      desc: 'أحدث العروض والتخفيضات',            icon: Star },
  { id: 'cards',    name: 'كروت',      desc: 'كروت الشحن بجميع الأنواع',          icon: Smartphone },
  { id: 'gifts',    name: 'هدايا',     desc: 'باقات الهدايا والاشتراكات الخاصة',  icon: Gift },
  { id: 'data',     name: 'بيانات',    desc: 'باقات البيانات والداتا',             icon: Zap },
];
