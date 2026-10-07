/**
 * أنواع بيانات قسم VIP لمراقبة تحويلات خطوط ريد (Vodafone Red)
 */

import type { LineInfoResult } from '@/lib/lineInfoProvider';

export type VipRedSystemStatus = 'monitoring' | 'converted' | 'ineligible';

export interface VipRedLine {
  id: string;
  user_id: string;
  phone_number: string;
  current_system: string | null;
  system_status: VipRedSystemStatus;
  converted_at: string | null;
  last_checked_at: string | null;
  check_count: number;
  last_line_info: Partial<LineInfoResult>;
  notes?: string | null;
  created_at: string;
  updated_at: string;
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
}

/**
 * تصنيف نظام الخط بدقة تامة:
 * - Enterprise member control أو RED -> تم التحويل بنجاح لنظام ريد
 * - RX_14pt_Raya7Balak أو 14 قرش -> ريح بالك 14 قرش (مؤهل وقيد المراقبة)
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
      is14pt: false,
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
  };
}
