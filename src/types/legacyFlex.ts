// src/types/legacyFlex.ts

export type LegacySystemStatus = 
  | 'active' 
  | 'maintenance' 
  | 'hidden' 
  | 'coming_soon' 
  | 'disabled' 
  | 'subscription_required' 
  | 'out_of_service';

export type LegacyMessageType = 
  | 'loading'
  | 'success'
  | 'warning'
  | 'error'
  | 'maintenance'
  | 'subscription_required'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'network_error'
  | 'server_error'
  | 'authentication_error'
  | 'system_disabled'
  | 'bundle_not_available'
  | 'already_active'
  | 'unknown_error';

export interface LegacySystemMessages {
  successMessage?: string;
  failureMessage?: string;
  maintenanceMessage?: string;
  disabledMessage?: string;
  subscriptionRequiredMessage?: string;
  [key: string]: string | undefined;
}

export interface LegacySystemResponseMapping {
  successPattern: string;
  failurePattern: string;
  alreadyActivePattern: string;
}

export interface LegacySystemErrorMapping {
  networkErrorCode: string;
  serverErrorCode: string;
  authErrorCode: string;
}

export interface LegacyFlexSystem {
  id: string;              // Unique ID internally
  systemId: string;        // External System ID for script
  bundleId: string;        // Bundle ID for script
  productId: string;       // Product ID for script
  name: string;
  description: string;
  price: number;
  flexCount: number | string; // عدد الفليكسات
  priority: number;        // Order of appearance
  status: LegacySystemStatus;
  badge?: string;
  systemType: string;
  color: string;
  buttonColor?: string;
  buttonText?: string;
  lastUpdate?: string;
  version?: string;
  executionTime?: string; // وقت التنفيذ المتوقع
  icon?: string;
  image?: string;
  internalNotes?: string;
  
  messages: LegacySystemMessages;
  responseMapping?: LegacySystemResponseMapping;
  errorMapping?: LegacySystemErrorMapping;
}

export const SYSTEM_MESSAGES: Record<LegacyMessageType, string> = {
  loading: 'جارٍ التحميل...',
  success: 'تمت العملية بنجاح.',
  warning: 'تنبيه!',
  error: 'حدث خطأ، يرجى المحاولة لاحقاً.',
  maintenance: 'النظام تحت الصيانة حالياً، يرجى المحاولة لاحقاً.',
  subscription_required: 'هذه الخدمة متاحة للمشتركين فقط.',
  processing: 'جارٍ المعالجة...',
  completed: 'اكتملت العملية.',
  rejected: 'تم رفض العملية.',
  network_error: 'خطأ في الاتصال بالشبكة.',
  server_error: 'خطأ في خادم النظام.',
  authentication_error: 'فشل المصادقة، يرجى تسجيل الدخول مجدداً.',
  system_disabled: 'هذا النظام متوقف حالياً.',
  bundle_not_available: 'هذه الباقة غير متاحة حالياً.',
  already_active: 'أنت مشترك في هذا النظام بالفعل.',
  unknown_error: 'حدث خطأ غير معروف.'
};
