/**
 * PrintButton — زر طباعة الفاتورة
 * يظهر في شاشة النجاح + تفاصيل العملية + Sheet السجل
 *
 * سلوك:
 *  - إذا طابعة محفوظة → يطبع مباشرة
 *  - إذا لا توجد → يفتح شاشة اختيار الطابعة مرة واحدة ثم يحفظ
 *  - منع التكرار داخلياً عبر PrinterService
 */
import { useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { InvoiceData } from '@/lib/printer/types';
import { printInvoice, printViaDialog } from '@/lib/printer/PrinterService';
import PrinterSetupModal from './PrinterSetupModal';

interface PrintButtonProps {
  invoice:   InvoiceData;
  /** طريقة العرض */
  variant?: 'full' | 'icon';
  className?: string;
}

export default function PrintButton({ invoice, variant = 'full', className = '' }: PrintButtonProps) {
  const [loading,      setLoading]      = useState(false);
  const [pickerOpen,   setPickerOpen]   = useState(false);

  async function handlePrint() {
    if (loading) return;

    // التحقق من اكتمال بيانات العملية
    if (!invoice.receiverPhone || !invoice.productName) {
      toast.error('بيانات الفاتورة غير مكتملة');
      return;
    }

    setLoading(true);
    try {
      const outcome = await printInvoice(invoice);
      if ('needsPicker' in outcome && outcome.needsPicker) {
        // لا توجد طابعة محفوظة → فتح شاشة الاختيار
        setPickerOpen(true);
      } else if (!outcome.needsPicker) {
        if (outcome.result.success) {
          toast.success('✅ تمت الطباعة بنجاح');
        } else {
          toast.error(`فشل الطباعة: ${outcome.result.error ?? 'خطأ غير معروف'}`);
        }
      }
    } catch (e: unknown) {
      toast.error(`خطأ في الطباعة: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePrinterSelected() {
    setPickerOpen(false);
    // بعد الحفظ — أعد المحاولة تلقائياً
    setLoading(true);
    try {
      const outcome = await printInvoice(invoice);
      if (!outcome.needsPicker) {
        if (outcome.result.success) {
          toast.success('✅ تمت الطباعة بنجاح');
        } else {
          toast.error(`فشل الطباعة: ${outcome.result.error ?? 'خطأ غير معروف'}`);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAndroidPrint() {
    setPickerOpen(false);
    setLoading(true);
    try {
      const result = await printViaDialog(invoice, 80);
      if (result.success) {
        toast.success('✅ فُتح مربع حوار الطباعة');
      } else {
        toast.error(`فشل الطباعة: ${result.error ?? 'خطأ'}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handlePrint}
        disabled={loading}
        className={`flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all active:scale-[0.97] disabled:opacity-60 ${
          variant === 'full' ? 'w-full h-11 px-4' : 'w-10 h-10'
        } ${className}`}
        style={{
          background: 'rgba(59,130,246,0.12)',
          border:     '1px solid rgba(59,130,246,0.3)',
          color:      '#93c5fd',
        }}
      >
        {loading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Printer className="w-4 h-4" />
        }
        {variant === 'full' && <span>{loading ? 'جارٍ الطباعة…' : 'طباعة الفاتورة'}</span>}
      </button>

      {/* شاشة اختيار الطابعة */}
      <PrinterSetupModal
        open={pickerOpen}
        invoice={invoice}
        onClose={() => setPickerOpen(false)}
        onSaved={handlePrinterSelected}
        onAndroidPrint={handleAndroidPrint}
      />
    </>
  );
}
