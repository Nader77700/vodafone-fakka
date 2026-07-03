/**
 * errorMapper.ts — محوّل أخطاء API إلى رسائل عربية احترافية
 * يُستخدم في كل مكان يتلقى نتيجة من API للشحن
 * المستخدم العادي يرى الرسالة العربية فقط — الإدارة ترى التفاصيل الكاملة
 */

// ─────────────────────────────────────────────────────────────────────────────
// أنواع
// ─────────────────────────────────────────────────────────────────────────────

export interface MappedError {
  /** الرسالة العربية للمستخدم */
  arabicMessage: string;
  /** رقم العملية المستخرج من رد API (إن وُجد) */
  operationId: string | null;
  /** نوع الخطأ للتصنيف */
  errorType: ErrorType;
}

export type ErrorType =
  | 'invalid_pin'
  | 'pin_locked'
  | 'unregistered_msisdn'
  | 'insufficient_balance'
  | 'data_disabled'
  | 'wifi_detected'
  | 'network_changed'
  | 'timeout'
  | 'server_unreachable'
  | 'service_unavailable'
  | 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// استخراج رقم العملية من رد API
// ─────────────────────────────────────────────────────────────────────────────

export function extractOperationId(raw: string): string | null {
  if (!raw) return null;

  // أنماط شائعة في ردود Vodafone API
  const patterns = [
    /transactionId["\s:=]+([A-Z0-9\-]{4,30})/i,
    /transaction_id["\s:=]+([A-Z0-9\-]{4,30})/i,
    /operationId["\s:=]+([A-Z0-9\-]{4,30})/i,
    /operation_id["\s:=]+([A-Z0-9\-]{4,30})/i,
    /requestId["\s:=]+([A-Z0-9\-]{4,30})/i,
    /request_id["\s:=]+([A-Z0-9\-]{4,30})/i,
    /refNo["\s:=]+([A-Z0-9\-]{4,30})/i,
    /referenceNumber["\s:=]+([A-Z0-9\-]{4,30})/i,
    /reference_number["\s:=]+([A-Z0-9\-]{4,30})/i,
    /#([A-Z0-9]{6,20})\b/,
    /رقم العملية[:\s]+([A-Z0-9\-]{4,30})/i,
  ];

  for (const pattern of patterns) {
    const m = raw.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// تحديد نوع الخطأ من النص الخام
// ─────────────────────────────────────────────────────────────────────────────

function classifyError(raw: string): ErrorType {
  const t = raw.toLowerCase();

  // حساب مقفول بسبب تكرار الرقم السري الخاطئ (يجب أن يكون قبل invalid_pin)
  if (
    t.includes('1118') ||
    t.includes('incorrect pin for 3') ||
    t.includes('pin for 3 times') ||
    t.includes('account locked') ||
    t.includes('account is locked') ||
    t.includes('too many') && t.includes('pin') ||
    t.includes('blocked') && t.includes('pin')
  ) return 'pin_locked';

  // رقم غير مسجل في Vodafone Cash
  if (
    t.includes('1051') ||
    t.includes('unregistered msisdn') ||
    t.includes('msisdn not registered') ||
    t.includes('not registered') && t.includes('msisdn') ||
    t.includes('unregistered') && (t.includes('number') || t.includes('msisdn'))
  ) return 'unregistered_msisdn';

  // الرقم السري / PIN
  if (
    t.includes('invalid pin') ||
    t.includes('wrong pin') ||
    t.includes('incorrect pin') ||
    t.includes('1056') ||
    (t.includes('pin') && t.includes('error')) ||
    t.includes('رقم سري') ||
    t.includes('pin_error') ||
    (t.includes('auth') && t.includes('fail')) ||
    t.includes('authentication failed')
  ) return 'invalid_pin';

  // رصيد غير كافٍ
  if (
    t.includes('insufficient') ||
    t.includes('6051') ||
    t.includes('not enough balance') ||
    t.includes('not enough') ||
    t.includes('رصيد') ||
    t.includes('low balance') ||
    t.includes('1057') ||
    t.includes('1058')
  ) return 'insufficient_balance';

  // WiFi
  if (
    t.includes('wifi') ||
    t.includes('wi-fi') ||
    t.includes('واي فاي') ||
    t.includes('wlan')
  ) return 'wifi_detected';

  // تغيير الشبكة أثناء التنفيذ
  if (
    t.includes('network changed') ||
    t.includes('network switch') ||
    t.includes('تغيير الشبكة') ||
    t.includes('sim changed') ||
    t.includes('تم تغيير') ||
    (t.includes('seamless') && (t.includes('null') || t.includes('fail') || t.includes('empty')))
  ) return 'network_changed';

  // بيانات Vodafone مغلقة / لا يوجد اتصال
  if (
    t.includes('data disabled') ||
    t.includes('mobile data') ||
    t.includes('بيانات') ||
    t.includes('4g') ||
    t.includes('no sim') ||
    t.includes('sim not') ||
    t.includes('network unavailable') ||
    t.includes('no network')
  ) return 'data_disabled';

  // timeout
  if (
    t.includes('timeout') ||
    t.includes('timed out') ||
    t.includes('انتهت المهلة') ||
    t.includes('deadline') ||
    t.includes('408')
  ) return 'timeout';

  // تعذر الاتصال بالخادم
  if (
    t.includes('econnrefused') ||
    t.includes('connection refused') ||
    t.includes('enotfound') ||
    t.includes('network error') ||
    t.includes('fetch failed') ||
    t.includes('failed to fetch') ||
    t.includes('socket') ||
    t.includes('503') ||
    t.includes('502') ||
    t.includes('504')
  ) return 'server_unreachable';

  // الخدمة غير متاحة
  if (
    t.includes('service unavailable') ||
    t.includes('maintenance') ||
    t.includes('1001') ||
    t.includes('1002') ||
    t.includes('down') ||
    t.includes('500')
  ) return 'service_unavailable';

  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// الدالة الرئيسية — تحويل أي خطأ إلى رسالة عربية
// ─────────────────────────────────────────────────────────────────────────────

export function parseApiError(rawError: string | null | undefined): MappedError {
  const raw = rawError ?? '';
  const errorType = classifyError(raw);
  const operationId = extractOperationId(raw);

  let arabicMessage = '';

  switch (errorType) {
    case 'pin_locked':
      arabicMessage =
        'السبب: تم تجميد حسابك مؤقتاً بسبب تكرار إدخال الرقم السري الخاطئ 3 مرات.\n\nالحل:\n• انتظر 24 ساعة لرفع التجميد تلقائياً.\n• أو اتصل على 888 من خطك وقل "رقم سري".\n• أو اكتب #912# وأرسل من نفس الخط.';
      break;
    case 'unregistered_msisdn':
      arabicMessage =
        'السبب: الرقم المُدخل غير مسجّل في Vodafone Cash أو لا يوجد محفظة مفعّلة عليه.\n\nالحل:\n• تأكد أن الرقم مفعّل عليه محفظة Vodafone Cash.\n• للتسجيل: اكتب #910# وأرسل.\n• أو توجّه لأقرب فرع فودافون.';
      break;
    case 'invalid_pin': {
      let msg = 'السبب: الرقم السري غير صحيح.\n\nالحل:\n• تحقق من رقم سري Vodafone Cash المكوّن من 6 أرقام.\n• أعد المحاولة بالرقم الصحيح.\n• ⚠️ بعد 3 محاولات خاطئة سيُقفل الحساب تلقائياً!';
      if (operationId) msg += `\n• رقم العملية للمراجعة: ${operationId}`;
      arabicMessage = msg;
      break;
    }
    case 'insufficient_balance':
      arabicMessage = 'السبب: لا يوجد رصيد كافٍ في محفظة Vodafone Cash.\n\nالحل:\n• اشحن محفظتك بالقيمة المطلوبة.\n• تحقق من رصيدك عبر *9#.\n• ثم أعد المحاولة.';
      break;
    case 'wifi_detected':
      arabicMessage = 'السبب: بيانات الهاتف ليست من شريحة المحفظة — تم الكشف عن WiFi أو شريحة أخرى.\n\nالحل:\n• قم بإيقاف WiFi تماماً.\n• استخدم بيانات Vodafone الخاصة بنفس رقم المحفظة.\n• ثم أعد المحاولة.';
      break;
    case 'network_changed':
      arabicMessage = 'السبب: تغيّرت الشبكة أثناء التنفيذ أو انقطعت بيانات Vodafone.\n\nالحل:\n• تأكد من ثبات بيانات Vodafone.\n• لا تغيّر إعدادات الشبكة أثناء التنفيذ.\n• أعد المحاولة مجدداً.';
      break;
    case 'data_disabled':
      arabicMessage = 'السبب: بيانات الهاتف معطّلة أو ليست من شريحة فودافون.\n\nالحل:\n• قم بتشغيل بيانات الهاتف (4G).\n• تأكد أن البيانات من شريحة فودافون المرتبطة بالمحفظة.\n• ثم أعد المحاولة.';
      break;
    case 'timeout':
      arabicMessage = 'السبب: انتهت مهلة الاتصال بخادم Vodafone.\n\nالحل:\n• تحقق من قوة إشارة الشبكة.\n• انتظر لحظة وأعد المحاولة.';
      break;
    case 'server_unreachable':
      arabicMessage = 'السبب: تعذر الاتصال بخادم الخدمة حالياً.\n\nالحل:\n• تحقق من اتصالك بالإنترنت.\n• انتظر دقيقة ثم أعد المحاولة.';
      break;
    case 'service_unavailable':
      arabicMessage = 'السبب: خدمة Vodafone Cash غير متاحة مؤقتاً (صيانة أو انقطاع).\n\nالحل:\n• انتظر بضع دقائق وأعد المحاولة.\n• إذا استمر الخطأ تواصل مع الدعم.';
      break;
    default:
      arabicMessage = raw && raw.trim().length > 0
        ? `السبب: ${raw.trim()}\n\nالحل:\n• أعد المحاولة مرة أخرى.\n• إذا استمر الخطأ تواصل مع الإدارة.`
        : 'السبب: حدث خطأ غير متوقع.\n\nالحل:\n• أعد المحاولة مرة أخرى.';
  }

  return { arabicMessage, operationId, errorType };
}

// ─────────────────────────────────────────────────────────────────────────────
// دالة مساعدة: هل يجب عرض نصائح الشبكة؟
// ─────────────────────────────────────────────────────────────────────────────

export function shouldShowNetworkTips(errorType: ErrorType): boolean {
  return ['wifi_detected', 'network_changed', 'data_disabled'].includes(errorType);
}

/** هل الخطأ بسبب قفل الحساب؟ */
export function isPinLocked(errorType: ErrorType): boolean {
  return errorType === 'pin_locked';
}

/** هل الخطأ بسبب رقم غير مسجّل؟ */
export function isUnregisteredMsisdn(errorType: ErrorType): boolean {
  return errorType === 'unregistered_msisdn';
}

// ─────────────────────────────────────────────────────────────────────────────
// دالة مساعدة: الحصول على الرسالة الأولى فقط (للـ toast)
// ─────────────────────────────────────────────────────────────────────────────

export function getFirstLine(arabicMessage: string): string {
  return arabicMessage.split('\n').filter(Boolean)[0] ?? arabicMessage;
}
