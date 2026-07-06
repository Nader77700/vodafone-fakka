/**
 * PrinterService — نظام الطباعة الاحترافي
 *
 * يدعم:
 *  1. Bluetooth (ESC/POS عبر Web Bluetooth API)
 *  2. WiFi / Network / USB (عبر Android Print Dialog)
 *  3. الطابعات المدمجة (Built-in) عبر Android Print Dialog
 *  4. طوابير طباعة مع منع التكرار
 *
 * لا يكسر أي API أو Service قائم.
 */
import type { SavedPrinter, PrinterType, PaperWidth, PrintResult, PrintJob, InvoiceData } from './types';
import { getSavedPrinter, savePrinter } from './printerStorage';
import { buildInvoiceEscPos } from './EscPosBuilder';
import { buildPrintHtml } from './PrintHtmlBuilder';

// ── طابور الطباعة لمنع التكرار ─────────────────────────────────────────────
const printQueue = new Map<string, PrintJob>();

function makeJobId(invoice: InvoiceData): string {
  return invoice.opNumber != null
    ? `op-${invoice.opNumber}`
    : `corr-${invoice.correlationId ?? invoice.receiverPhone + invoice.time}`;
}

// ── Bluetooth ESC/POS ─────────────────────────────────────────────────────────
const BT_SERVICE_UUID  = '000018f0-0000-1000-8000-00805f9b34fb';
const BT_CHAR_UUID     = '00002af1-0000-1000-8000-00805f9b34fb';
const BT_SERVICE_SPP   = '00001101-0000-1000-8000-00805f9b34fb'; // SPP Classic BT

async function printViaBluetooth(
  printer: SavedPrinter,
  data: Uint8Array,
): Promise<PrintResult> {
  if (!navigator.bluetooth) {
    return { success: false, error: 'Web Bluetooth غير مدعوم على هذا الجهاز' };
  }
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: printer.name }],
      optionalServices: [BT_SERVICE_UUID, BT_SERVICE_SPP],
    });
    const server  = await device.gatt!.connect();
    let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

    // جرّب BLE أولاً ثم SPP
    for (const svcUuid of [BT_SERVICE_UUID, BT_SERVICE_SPP]) {
      try {
        const svc  = await server.getPrimaryService(svcUuid);
        const char = await svc.getCharacteristic(BT_CHAR_UUID).catch(() => null);
        if (char) { characteristic = char; break; }
      } catch { /* جرّب الـ UUID التالي */ }
    }

    if (!characteristic) {
      await device.gatt!.disconnect();
      return { success: false, error: 'تعذّر الوصول لـ GATT Characteristic' };
    }

    // إرسال البيانات على شكل chunks بحجم 512 بايت
    const CHUNK = 512;
    for (let i = 0; i < data.length; i += CHUNK) {
      await characteristic.writeValueWithoutResponse(data.slice(i, i + CHUNK));
      await new Promise(r => setTimeout(r, 30)); // استراحة بين الـ chunks
    }
    await device.gatt!.disconnect();
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('User cancelled') || msg.includes('chooser')) {
      return { success: false, error: 'تم إلغاء اختيار الطابعة' };
    }
    return { success: false, error: `فشل اتصال Bluetooth: ${msg}` };
  }
}

// ── Android Print Dialog (WiFi / USB / Network / Built-in) ─────────────────
function printViaAndroidDialog(invoice: InvoiceData, paperWidth: PaperWidth): Promise<PrintResult> {
  return new Promise(resolve => {
    try {
      const html = buildPrintHtml(invoice, paperWidth);
      const printWin = window.open('', '_blank', 'width=400,height=600');
      if (!printWin) {
        // Capacitor WebView — استخدم iframe مؤقت
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;top:-9999px;';
        document.body.appendChild(iframe);
        iframe.contentDocument!.open();
        iframe.contentDocument!.write(html);
        iframe.contentDocument!.close();
        iframe.contentWindow!.focus();
        iframe.contentWindow!.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          resolve({ success: true });
        }, 1500);
        return;
      }
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      printWin.print();
      printWin.close();
      resolve({ success: true });
    } catch (e: unknown) {
      resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

// ── البحث عن طابعات BT متاحة ─────────────────────────────────────────────
export async function scanBluetoothPrinters(): Promise<{ id: string; name: string }[]> {
  if (!navigator.bluetooth) return [];
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [BT_SERVICE_UUID, BT_SERVICE_SPP],
    });
    if (device) return [{ id: device.id, name: device.name ?? 'Bluetooth Printer' }];
    return [];
  } catch {
    return [];
  }
}

// ── الدالة الرئيسية للطباعة ──────────────────────────────────────────────
export interface PrintOptions {
  printer?:      SavedPrinter;        // يُستخدم إذا مُرِّر، وإلا يُجلب المحفوظ
  paperWidth?:   PaperWidth;
  forcePicker?:  boolean;             // أجبر شاشة اختيار الطابعة
}

/** الحالة التي تحتاجها الـ UI لعرض شاشة اختيار الطابعة */
export interface PrintNeedsPicker {
  needsPicker: true;
}
export interface PrintDone {
  needsPicker: false;
  result:      PrintResult;
}
export type PrintOutcome = PrintNeedsPicker | PrintDone;

export async function printInvoice(
  invoice: InvoiceData,
  options: PrintOptions = {},
): Promise<PrintOutcome> {
  const jobId = makeJobId(invoice);

  // منع التكرار — Job نشط بالفعل؟
  const existing = printQueue.get(jobId);
  if (existing && existing.status === 'printing') {
    return { needsPicker: false, result: { success: false, error: 'جارٍ الطباعة بالفعل — يرجى الانتظار' } };
  }

  // تسجيل Job
  const job: PrintJob = { id: jobId, invoiceId: jobId, createdAt: Date.now(), status: 'pending' };
  printQueue.set(jobId, job);
  job.status = 'printing';

  try {
    // جلب الطابعة المحفوظة
    const printer = options.printer ?? await getSavedPrinter();
    const width   = options.paperWidth ?? printer?.paperWidth ?? 80;

    // إذا لا توجد طابعة محفوظة ولم تُمرَّر → اطلب الاختيار
    if (!printer || options.forcePicker) {
      job.status = 'done';
      return { needsPicker: true };
    }

    let result: PrintResult;
    if (printer.type === 'bluetooth') {
      const escData = buildInvoiceEscPos(invoice, width);
      result = await printViaBluetooth(printer, escData);
    } else {
      // wifi / usb / network / builtin → Android Print Dialog
      result = await printViaAndroidDialog(invoice, width);
    }

    job.status = result.success ? 'done' : 'failed';
    return { needsPicker: false, result };
  } catch (e: unknown) {
    job.status = 'failed';
    return {
      needsPicker: false,
      result: { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقع في الطباعة' },
    };
  }
}

/** طباعة مباشرة عبر Android Print Dialog بدون حاجة طابعة محفوظة */
export async function printViaDialog(invoice: InvoiceData, paperWidth: PaperWidth = 80): Promise<PrintResult> {
  const jobId = makeJobId(invoice);
  const existing = printQueue.get(jobId);
  if (existing && existing.status === 'printing') {
    return { success: false, error: 'جارٍ الطباعة بالفعل' };
  }
  const job: PrintJob = { id: jobId, invoiceId: jobId, createdAt: Date.now(), status: 'printing' };
  printQueue.set(jobId, job);
  const result = await printViaAndroidDialog(invoice, paperWidth);
  job.status = result.success ? 'done' : 'failed';
  return result;
}

/** حفظ طابعة جديدة */
export async function savePrinterConfig(printer: SavedPrinter): Promise<void> {
  await savePrinter(printer);
}

export { getSavedPrinter };
