/**
 * أنواع بيانات نظام الطباعة
 */

export type PrinterType = 'bluetooth' | 'wifi' | 'usb' | 'network' | 'builtin';
export type PaperWidth  = 58 | 80;

export interface SavedPrinter {
  id:        string;     // BT MAC address أو IP أو 'builtin'
  name:      string;
  type:      PrinterType;
  paperWidth: PaperWidth;
  savedAt:   string;     // ISO string
}

export interface PrintJob {
  id:        string;
  invoiceId: string;     // operation_number أو correlationId — لمنع التكرار
  createdAt: number;     // Date.now()
  status:    'pending' | 'printing' | 'done' | 'failed';
}

export interface PrintResult {
  success: boolean;
  error?:  string;
}

/** بيانات الفاتورة الموحّدة — مصدر واحد لجميع الشاشات */
export interface InvoiceData {
  opNumber:      number | null;
  receiverPhone: string;
  productName:   string;    // اسم المنتج الكامل
  cardPrice:     string;    // سعر الكارت: "7 جنيه"
  units:         string;    // عدد الوحدات: "300 وحدة"
  validity:      string;    // صلاحية الكارت — '' إذا لا توجد
  category:      string;    // فكة | مارد
  date:          string;    // تاريخ التنفيذ
  time:          string;    // وقت التنفيذ (أرقام إنجليزية)
  via:           string;    // طريقة التنفيذ
  status:        'success' | 'failed' | 'pending';
  correlationId?: string;
  latencyMs?:    number;
  merchantName?: string;    // اسم التاجر إن وجد
}
