/**
 * أنواع بيانات قسم VIP لمراقبة تحويلات خطوط ريد (Vodafone Red)
 */

import type { LineInfoResult } from '@/lib/lineInfoProvider';

export type VipRedSystemStatus = 'monitoring' | 'converted' | 'ineligible';

export const VALID_ACTIVATION_DAYS = [7, 11, 25] as const;
export type VipRedActivationDay = (typeof VALID_ACTIVATION_DAYS)[number];

export type VipRedPaymentStatus = 'unpaid' | 'paid' | 'cancelled';
export type VipRedBundleStatus = 'renewed' | 'pending';

export interface VipRedMerchant {
  id: string;
  name: string;
  phone?: string | null;
  user_id?: string | null;
  created_by?: string | null;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string | null;
}

export interface VipRedMerchantStats {
  totalLines: number;
  convertedLines: number;
  monitoringLines: number;
  countDay7: number;
  countDay11: number;
  countDay25: number;
  nextActivationDate: Date | null;
  nextActivationDay: VipRedActivationDay | null;
  daysUntilNextActivation: number | null;
}

export interface VipRedMerchantWithStats extends VipRedMerchant {
  stats: VipRedMerchantStats;
  linesCount: number;
}

export interface VipRedLine {
  id: string;
  user_id: string;
  phone_number: string;
  current_system: string | null;
  system_status: VipRedSystemStatus;
  converted_at: string | null;
  last_checked_at: string | null;
  next_check_at?: string | null;
  check_count: number;
  last_line_info: Partial<LineInfoResult>;
  merchant_id?: string | null;
  activation_day?: VipRedActivationDay | null;
  customer_name?: string | null;
  payment_status?: VipRedPaymentStatus;
  last_payment_date?: string | null;
  bundle_status?: VipRedBundleStatus;
  bundle_renewed_at?: string | null;
  current_cycle_month?: string | null;
  renewal_amount?: number | null;
  package_tier?: VipRedPackageTier;
  package_price?: number;
  ana_vodafone_password?: string | null;
  ana_vodafone_password_updated_at?: string | null;
  claimed_by_user_id?: string | null;
  claim_status?: VipRedClaimStatus;
  claim_rejection_reason?: string | null;
  claimed_at?: string | null;
  merchant?: VipRedMerchant | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type VipRedRoleType = 'merchant' | 'user';

export interface VipRedProfile {
  id: string;
  user_id: string;
  role_type: VipRedRoleType;
  full_name: string;
  whatsapp_phone: string;
  is_approved: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type VipRedPackageTier = '100gb' | '150gb' | '200gb' | 'custom';

export interface VipRedPackageDefinition {
  tier: VipRedPackageTier;
  name: string;
  shortName: string;
  gigabytes: number;
  minutes: number;
  price: number;
  description: string;
}

export const VIP_RED_PACKAGES: Record<VipRedPackageTier, VipRedPackageDefinition> = {
  '100gb': {
    tier: '100gb',
    name: 'باقة 100 جيجا + 6,000 دقيقة',
    shortName: '100 جيجا',
    gigabytes: 100,
    minutes: 6000,
    price: 450,
    description: '100 جيجابايت إنترنت فائق السرعة + 6,000 دقيقة لجميع الشبكات',
  },
  '150gb': {
    tier: '150gb',
    name: 'باقة 150 جيجا + 8,500 دقيقة',
    shortName: '150 جيجا',
    gigabytes: 150,
    minutes: 8500,
    price: 550,
    description: '150 جيجابايت إنترنت فائق السرعة + 8,500 دقيقة لجميع الشبكات',
  },
  '200gb': {
    tier: '200gb',
    name: 'باقة 200 جيجا + 10,200 دقيقة',
    shortName: '200 جيجا',
    gigabytes: 200,
    minutes: 10200,
    price: 700,
    description: '200 جيجابايت إنترنت فائق السرعة + 10,200 دقيقة لجميع الشبكات',
  },
  'custom': {
    tier: 'custom',
    name: 'باقة مخصصة',
    shortName: 'مخصصة',
    gigabytes: 0,
    minutes: 0,
    price: 450,
    description: 'باقة مخصصة حسب الاتفاق',
  },
};

export type VipRedClaimStatus = 'unclaimed' | 'pending' | 'approved' | 'rejected';

export interface VipRedLineClaim {
  id: string;
  line_id: string;
  user_id: string;
  phone_number: string;
  requester_name: string;
  requester_whatsapp: string;
  requester_role: VipRedRoleType;
  status: VipRedClaimStatus;
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VipRedInvoiceLineItem {
  id: string;
  phoneNumber: string;
  customerName?: string | null;
  packageTier: VipRedPackageTier;
  packagePrice: number;
  paymentStatus: VipRedPaymentStatus;
  lastPaymentDate?: string | null;
}

export interface VipRedCycleInvoice {
  cycleDay: VipRedActivationDay;
  totalLines: number;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  lines: VipRedInvoiceLineItem[];
}

export interface DuplicateLineDetected {
  phone: string;
  line: VipRedLine;
}

export interface VipRedConfig {
  id: string;
  is_enabled_globally: boolean;
  allowed_user_ids: string[];
  check_interval_hours: number;
  last_batch_run_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SystemClassification {
  status: VipRedSystemStatus;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  description: string;
  isRed: boolean;
  is14pt: boolean;
  shortSystemName: string; // اسم النظام المختصر: 'ريد' أو '14 قرش'
}

/**
 * تصنيف نظام الخط بدقة تامة:
 * - Enterprise member control أو RED -> تم التحويل بنجاح لنظام ريد (مختصر: 'ريد')
 * - RX_14pt_Raya7Balak أو 14 قرش -> ريح بالك 14 قرش (مؤهل وقيد المراقبة، مختصر: '14 قرش')
 * - أنظمة أخرى (فليكس، كارت عادي، إنترنت) -> غير مؤهل، يلزم التحويل إلى 14 قرش أولاً
 */
export function classifyLineSystem(systemName: string | null | undefined): SystemClassification {
  if (!systemName || systemName.trim() === '') {
    return {
      status: 'monitoring',
      label: 'قيد الفحص الأولي',
      badgeBg: 'rgba(245, 158, 11, 0.12)',
      badgeText: '#f59e0b',
      badgeBorder: 'rgba(245, 158, 11, 0.3)',
      description: 'جاري استعلام نظام الخط وتحديد حالته.',
      isRed: false,
      is14pt: true,
      shortSystemName: '14 قرش',
    };
  }

  const s = systemName.toLowerCase();

  // 1. فحص نظام ريد: Enterprise member control
  const isRed = s.includes('enterprise member control') ||
    s.includes('enterprise') ||
    s.includes('red_') ||
    s.includes('red ') ||
    s === 'red' ||
    systemName.includes('ريد') ||
    systemName.includes('RED');

  if (isRed) {
    return {
      status: 'converted',
      label: 'نظام ريد (Enterprise member control)',
      badgeBg: 'rgba(16, 185, 129, 0.15)',
      badgeText: '#10b981',
      badgeBorder: 'rgba(16, 185, 129, 0.35)',
      description: 'تم التحويل بنجاح لنظام ريد وهو جاهز للتفعيل الآن!',
      isRed: true,
      is14pt: false,
      shortSystemName: 'ريد',
    };
  }

  // 2. فحص نظام ريح بالك 14 قرش المؤهل للتحويل: RX_14pt_Raya7Balak
  const is14pt = s.includes('14pt') ||
    s.includes('raya7balak') ||
    s.includes('raya7_balak') ||
    s.includes('14 قرش') ||
    s.includes('ريح بالك');

  if (is14pt) {
    return {
      status: 'monitoring',
      label: 'ريح بالك 14 قرش (RX_14pt_Raya7Balak)',
      badgeBg: 'rgba(59, 130, 246, 0.15)',
      badgeText: '#3b82f6',
      badgeBorder: 'rgba(59, 130, 246, 0.35)',
      description: 'الخط مؤهل تماماً وبانتظار صدور أمر التحويل إلى نظام ريد.',
      isRed: false,
      is14pt: true,
      shortSystemName: '14 قرش',
    };
  }

  // 3. نظام آخر غير مؤهل (مثل Flex)
  return {
    status: 'ineligible',
    label: systemName,
    badgeBg: 'rgba(239, 68, 68, 0.12)',
    badgeText: '#ef4444',
    badgeBorder: 'rgba(239, 68, 68, 0.3)',
    description: 'النظام غير مؤهل للتحويل لنظام ريد — يرجى التحويل إلى 14 قرش ريح بالك أولاً ثم إعادة الفحص.',
    isRed: false,
    is14pt: false,
    shortSystemName: '14 قرش',
  };
}
