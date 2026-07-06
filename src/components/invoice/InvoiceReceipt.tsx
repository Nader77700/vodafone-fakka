/**
 * InvoiceReceipt — مكوّن الفاتورة الموحّدة
 * مصدر بيانات واحد — يُستخدم في:
 *   1. شاشة النجاح بعد الشحن
 *   2. صفحة تفاصيل العملية
 *   3. Sheet سجل العمليات
 */
import { Copy, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { InvoiceData } from '@/lib/printer/types';

interface InvoiceReceiptProps {
  invoice: InvoiceData;
  /** عرض صف البيانات بخلفية خضراء للقيم المميزة */
  compact?: boolean;
}

type FieldRow = {
  label:    string;
  value:    string;
  accent?:  boolean;
  copyable?: boolean;
  bold?:    boolean;
};

function toViaLabel(via: string): string {
  if (!via) return '—';
  const map: Record<string, string> = {
    native: 'مباشر (Native)',
    bridge: 'جسر (Bridge)',
    server: 'خادم (Server)',
  };
  const lower = via.toLowerCase();
  for (const [k, v] of Object.entries(map)) if (lower.includes(k)) return v;
  return via;
}

export function buildInvoiceRows(invoice: InvoiceData): FieldRow[] {
  const rows: FieldRow[] = [];

  if (invoice.opNumber != null) {
    rows.push({ label: 'رقم العملية', value: `#${invoice.opNumber}`, copyable: true, bold: true });
  }

  rows.push(
    { label: 'رقم الهاتف',    value: invoice.receiverPhone,   accent: true,  copyable: true },
    { label: 'الكارت',         value: invoice.productName },
    { label: 'الفئة',          value: invoice.category },
    { label: 'سعر الكارت',    value: invoice.cardPrice,        accent: true,  bold: true },
    { label: 'عدد الوحدات',   value: invoice.units },
  );

  if (invoice.validity) {
    rows.push({ label: 'صلاحية الكارت', value: invoice.validity });
  }

  rows.push(
    { label: 'تاريخ التنفيذ', value: invoice.date },
    { label: 'وقت التنفيذ',   value: invoice.time },
    { label: 'طريقة التنفيذ', value: toViaLabel(invoice.via) },
    { label: 'الحالة',         value: invoice.status === 'success' ? 'ناجحة ✅' : invoice.status === 'failed' ? 'فاشلة ❌' : 'معلقة ⏳' },
  );

  if (invoice.merchantName) {
    rows.push({ label: 'التاجر', value: invoice.merchantName });
  }

  return rows;
}

export default function InvoiceReceipt({ invoice, compact = false }: InvoiceReceiptProps) {
  const rows = buildInvoiceRows(invoice);

  const StatusIcon =
    invoice.status === 'success' ? CheckCircle2 :
    invoice.status === 'failed'  ? XCircle : Clock;

  const statusColor =
    invoice.status === 'success' ? '#4ade80' :
    invoice.status === 'failed'  ? '#f87171' : '#fbbf24';

  return (
    <div dir="rtl">
      {/* رأس الحالة */}
      {!compact && (
        <div
          className="flex flex-col items-center gap-2 px-5 py-5"
          style={{ background: invoice.status === 'success' ? 'rgba(34,197,94,0.05)' : 'rgba(248,113,113,0.05)' }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: `${statusColor}22`, border: `2px solid ${statusColor}66` }}
          >
            <StatusIcon className="w-7 h-7" style={{ color: statusColor }} />
          </div>
          <div className="text-center space-y-0.5">
            <p className="text-base font-black" style={{ color: statusColor }}>
              {invoice.status === 'success' ? '✓ تمت العملية بنجاح' : invoice.status === 'failed' ? '✗ فشلت العملية' : '⏳ معلقة'}
            </p>
            {invoice.opNumber != null && (
              <p className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
                رقم العملية: <span className="text-white font-bold">#{invoice.opNumber}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* صفوف البيانات */}
      <div className={`${compact ? 'px-3' : 'px-5'} pb-2 space-y-1.5`}>
        {rows.map(r => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-[11px] shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>{r.label}</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`text-xs font-mono truncate max-w-[160px] ${r.bold ? 'font-bold' : 'font-semibold'}`}
                style={{ color: r.accent ? '#4ade80' : 'rgba(255,255,255,0.9)' }}
              >
                {r.value || '—'}
              </span>
              {r.copyable && r.value && r.value !== '—' && (
                <button
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors hover:bg-white/10"
                  onClick={() => { navigator.clipboard.writeText(r.value); toast.success('تم النسخ'); }}
                >
                  <Copy className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.35)' }} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
