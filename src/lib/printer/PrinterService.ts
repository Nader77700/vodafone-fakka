/**
 * PrinterService — نظام الطباعة الاحترافي v2
 *
 * يعتمد على PrintPlugin.java عبر NativePrintBridge.
 * لا يستخدم window.open / navigator.bluetooth / Intent للمتصفح.
 *
 * الطرق المدعومة:
 *  1. Android PrintManager (WiFi/USB/Network/Built-in) — printHtml
 *  2. Bluetooth ESC/POS — printEscPos عبر SPP Classic
 *  3. الطابعة المدمجة (Sunmi/PAX/Newland) — تكتشف تلقائياً وتستخدم printHtml
 */
import type { SavedPrinter, PaperWidth, PrintResult, PrintJob, InvoiceData } from './types';
import { getSavedPrinter, savePrinter } from './printerStorage';
import { buildInvoiceEscPos } from './EscPosBuilder';
import { buildPrintHtml } from './PrintHtmlBuilder';
import PrintBridge from './NativePrintBridge';
import type { PaperSizeKey } from './NativePrintBridge';

// ── طابور الطباعة — منع التكرار ──────────────────────────────────────────
const printQueue = new Map<string, PrintJob>();

function makeJobId(invoice: InvoiceData): string {
  return invoice.opNumber != null
    ? `op-${invoice.opNumber}`
    : `corr-${invoice.correlationId ?? invoice.receiverPhone + invoice.time}`;
}

function paperKey(w: PaperWidth): PaperSizeKey {
  return w === 58 ? 'THERMAL_58' : 'THERMAL_80';
}

// ── تحويل Uint8Array إلى Base64 ──────────────────────────────────────────
function uint8ToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

// ═══════════════════════════════════════════════════════════════════
//  [A] Android Print (PrintManager — بدون متصفح)
// ═══════════════════════════════════════════════════════════════════
export async function printViaAndroid(
  invoice: InvoiceData,
  paperWidth: PaperWidth = 80,
): Promise<PrintResult> {
  try {
    const html   = buildPrintHtml(invoice, paperWidth);
    const result = await PrintBridge.printHtml({
      html,
      jobName: `فاتورة #${invoice.opNumber ?? invoice.receiverPhone}`,
      paper:   paperKey(paperWidth),
    });
    if (result.cancelled) return { success: false, error: 'تم إلغاء الطباعة' };
    if (result.failed)    return { success: false, error: 'فشلت مهمة الطباعة' };
    return { success: result.success };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  [B] Bluetooth ESC/POS (SPP — بدون Web Bluetooth)
// ═══════════════════════════════════════════════════════════════════
export async function printViaBluetooth(
  invoice:    InvoiceData,
  address:    string,
  paperWidth: PaperWidth = 80,
): Promise<PrintResult> {
  try {
    const escBytes = buildInvoiceEscPos(invoice, paperWidth);
    const b64      = uint8ToBase64(escBytes);
    const result   = await PrintBridge.printEscPos({ address, data: b64 });
    if (result.success) return { success: true };
    return { success: false, error: 'فشل إرسال البيانات للطابعة' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'BT_DISABLED')        return { success: false, error: 'Bluetooth مغلق — يرجى تشغيله' };
    if (msg === 'NO_BT_PERMISSION')   return { success: false, error: 'مطلوب صلاحية Bluetooth' };
    if (msg.startsWith('BT_CONNECT')) return { success: false, error: `فشل الاتصال: ${msg.replace('BT_CONNECT_FAILED: ', '')}` };
    return { success: false, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  [C] فحص حالة Bluetooth
// ═══════════════════════════════════════════════════════════════════
export async function checkBluetoothStatus() {
  try {
    return await PrintBridge.checkBluetooth();
  } catch {
    return { supported: false, enabled: false, hasPermission: false, reason: 'NO_BT_HARDWARE' as const };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  [D] البحث عن الطابعات المقترنة
// ═══════════════════════════════════════════════════════════════════
export async function scanPairedPrinters() {
  try {
    const result = await PrintBridge.scanPairedPrinters();
    return result.devices ?? [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
//  [E] طلب تشغيل Bluetooth
// ═══════════════════════════════════════════════════════════════════
export async function requestEnableBluetooth(): Promise<boolean> {
  try {
    const r = await PrintBridge.requestEnableBt();
    return r.enabled;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  [F] طلب صلاحيات Bluetooth
// ═══════════════════════════════════════════════════════════════════
export async function requestBluetoothPermissions(): Promise<boolean> {
  try {
    const r = await PrintBridge.requestBtPermissions();
    return r.granted;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  [G] كشف الطابعة المدمجة
// ═══════════════════════════════════════════════════════════════════
export async function checkBuiltinPrinter() {
  try {
    return await PrintBridge.checkBuiltinPrinter();
  } catch {
    return { available: false, packageFound: '', name: '', manufacturer: '', model: '' };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  [H] الدالة الرئيسية — printInvoice
// ═══════════════════════════════════════════════════════════════════
export interface PrintOptions {
  printer?:     SavedPrinter;
  paperWidth?:  PaperWidth;
  forcePicker?: boolean;
}

export type PrintOutcome =
  | { needsPicker: true }
  | { needsPicker: false; result: PrintResult };

export async function printInvoice(
  invoice: InvoiceData,
  options: PrintOptions = {},
): Promise<PrintOutcome> {
  const jobId   = makeJobId(invoice);
  const existing = printQueue.get(jobId);
  if (existing?.status === 'printing') {
    return { needsPicker: false, result: { success: false, error: 'جارٍ الطباعة بالفعل' } };
  }

  const job: PrintJob = { id: jobId, invoiceId: jobId, createdAt: Date.now(), status: 'printing' };
  printQueue.set(jobId, job);

  try {
    const printer = options.printer ?? await getSavedPrinter();
    const width   = options.paperWidth ?? printer?.paperWidth ?? 80;

    if (!printer || options.forcePicker) {
      job.status = 'done';
      return { needsPicker: true };
    }

    let result: PrintResult;
    if (printer.type === 'bluetooth') {
      result = await printViaBluetooth(invoice, printer.id, width);
    } else {
      // android / wifi / usb / network / builtin → كلها عبر Android PrintManager
      result = await printViaAndroid(invoice, width);
    }

    job.status = result.success ? 'done' : 'failed';
    return { needsPicker: false, result };
  } catch (e: unknown) {
    job.status = 'failed';
    return {
      needsPicker: false,
      result: { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقع' },
    };
  }
}

/** طباعة مباشرة عبر Android PrintManager بدون طابعة محفوظة */
export async function printViaDialog(
  invoice: InvoiceData,
  paperWidth: PaperWidth = 80,
): Promise<PrintResult> {
  const jobId   = makeJobId(invoice);
  const existing = printQueue.get(jobId);
  if (existing?.status === 'printing') {
    return { success: false, error: 'جارٍ الطباعة بالفعل' };
  }
  const job: PrintJob = { id: jobId, invoiceId: jobId, createdAt: Date.now(), status: 'printing' };
  printQueue.set(jobId, job);
  const result = await printViaAndroid(invoice, paperWidth);
  job.status = result.success ? 'done' : 'failed';
  return result;
}

/** حفظ طابعة كافتراضية */
export async function savePrinterConfig(printer: SavedPrinter): Promise<void> {
  await savePrinter(printer);
}

export { getSavedPrinter };

// re-export scanBluetoothPrinters باسم متوافق مع الكود القديم
export { scanPairedPrinters as scanBluetoothPrinters };


