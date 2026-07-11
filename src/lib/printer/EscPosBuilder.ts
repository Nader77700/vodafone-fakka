/**
 * EscPosBuilder — مُنشئ أوامر ESC/POS للطابعات الحرارية
 * يدعم: 58mm و 80mm — جميع الطابعات الحرارية القياسية
 */
import type { InvoiceData, PaperWidth } from './types';

// ── أوامر ESC/POS القياسية ─────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;

const CMD = {
  INIT:           [ESC, 0x40],                // تهيئة الطابعة
  ALIGN_LEFT:     [ESC, 0x61, 0x00],          // محاذاة يسار
  ALIGN_CENTER:   [ESC, 0x61, 0x01],          // محاذاة وسط
  ALIGN_RIGHT:    [ESC, 0x61, 0x02],          // محاذاة يمين
  BOLD_ON:        [ESC, 0x45, 0x01],          // خط عريض
  BOLD_OFF:       [ESC, 0x45, 0x00],
  DOUBLE_WIDTH:   [GS,  0x21, 0x10],          // ضعف العرض
  NORMAL_SIZE:    [GS,  0x21, 0x00],          // حجم عادي
  LARGE_FONT:     [GS,  0x21, 0x11],          // خط كبير (ضعف العرض والارتفاع)
  LINE_FEED:      [0x0a],                     // سطر جديد
  CUT_FULL:       [GS,  0x56, 0x00],          // قطع كامل
  CUT_PARTIAL:    [GS,  0x56, 0x01],          // قطع جزئي
};

function bytes(...cmds: number[][]): Uint8Array {
  const flat = cmds.flat();
  return new Uint8Array(flat);
}

function text(s: string): Uint8Array {
  // تشفير UTF-8 — يدعم العربية على الطابعات التي تدعم Unicode
  return new TextEncoder().encode(s);
}

function line(s: string = ''): Uint8Array {
  return new Uint8Array([...text(s), 0x0a]);
}

function separator(width: number, char = '-'): Uint8Array {
  return line(char.repeat(width));
}

function padEnd(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function row(label: string, value: string, totalWidth: number): Uint8Array {
  const maxVal = totalWidth - label.length - 2;
  const v = value.length > maxVal ? value.slice(0, maxVal) : value;
  const spaces = totalWidth - label.length - v.length;
  return line(label + ' '.repeat(Math.max(1, spaces)) + v);
}

// ── بناء الفاتورة ─────────────────────────────────────────────────────────
export function buildInvoiceEscPos(
  invoice: InvoiceData,
  paperWidth: PaperWidth = 80,
): Uint8Array {
  const cols = paperWidth === 58 ? 32 : 48;
  const chunks: Uint8Array[] = [];

  const push = (...parts: Uint8Array[]) => chunks.push(...parts);

  // INIT
  push(bytes(CMD.INIT));

  // ── رأس الفاتورة: اسم التطبيق ──────────────────────────────────────────
  push(bytes(CMD.ALIGN_CENTER), bytes(CMD.BOLD_ON), bytes(CMD.LARGE_FONT));
  push(line('Vodafone Fakka'));
  push(bytes(CMD.NORMAL_SIZE), bytes(CMD.BOLD_OFF));
  push(line('vodafone-fakka.app'));
  push(bytes(CMD.ALIGN_LEFT));
  push(separator(cols, '='));

  // ── رقم العملية والحالة ───────────────────────────────────────────────
  push(bytes(CMD.BOLD_ON));
  if (invoice.opNumber != null) push(row('# رقم العملية', `#${invoice.opNumber}`, cols));
  push(row('الحالة', invoice.status === 'success' ? 'ناجحة ✓' : invoice.status === 'failed' ? 'فاشلة ✗' : 'معلقة', cols));
  push(bytes(CMD.BOLD_OFF));
  push(separator(cols));

  // ── بيانات الكارت ─────────────────────────────────────────────────────
  push(row('المنتج', invoice.productName, cols));
  push(row('الفئة', invoice.category, cols));
  push(bytes(CMD.BOLD_ON));
  push(row('سعر الكارت', invoice.cardPrice, cols));
  push(bytes(CMD.BOLD_OFF));
  push(row('عدد الوحدات', invoice.units, cols));
  if (invoice.validity) push(row('صلاحية الكارت', invoice.validity, cols));
  push(separator(cols));

  // ── بيانات العميل ─────────────────────────────────────────────────────
  push(bytes(CMD.BOLD_ON));
  push(row('رقم الهاتف', invoice.receiverPhone, cols));
  push(bytes(CMD.BOLD_OFF));
  push(row('تاريخ التنفيذ', invoice.date, cols));
  push(row('وقت التنفيذ', invoice.time, cols));
  push(row('طريقة التنفيذ', invoice.via, cols));
  if (invoice.merchantName) push(row('التاجر', invoice.merchantName, cols));
  push(separator(cols));

  // ── رسالة شكر ─────────────────────────────────────────────────────────
  push(bytes(CMD.ALIGN_CENTER));
  push(line('شكراً لاستخدامك Vodafone Fakka'));
  push(line('Thank you for using Vodafone Fakka'));
  push(bytes(CMD.LINE_FEED));
  push(bytes(CMD.LINE_FEED));
  push(bytes(CMD.LINE_FEED));

  // ── قطع الورق ─────────────────────────────────────────────────────────
  push(bytes(CMD.CUT_PARTIAL));

  // دمج كل الـ chunks
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
