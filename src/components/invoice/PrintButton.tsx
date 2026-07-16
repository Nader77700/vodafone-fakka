/**
 * PrintButton v2 — زر طباعة الفاتورة
 *
 * يعتمد على PrintPlugin.java (عبر NativePrintBridge) — لا يفتح أي متصفح.
 * حالات العرض: idle → printing → success/error
 */
import { useState, useCallback, useRef } from 'react';
import { Printer, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { InvoiceData } from '@/lib/printer/types';
import { printInvoice } from '@/lib/printer/PrinterService';
import PrinterSetupModal from './PrinterSetupModal';
import { formatError } from '@/lib/formatError';


type PrintState = 'idle' | 'printing' | 'success' | 'error';

interface PrintButtonProps {
  invoice:    InvoiceData;
  variant?:   'full' | 'icon';
  className?: string;
}

export default function PrintButton({ invoice, variant = 'full', className = '' }: PrintButtonProps) {
  const [printState,  setPrintState]  = useState<PrintState>('idle');
  const [stateMsg,    setStateMsg]    = useState('');
  const [pickerOpen,  setPickerOpen]  = useState(false);
  const isPrinting = useRef(false);

  const executePrint = useCallback(async (forcePicker = false) => {
    if (isPrinting.current) return;
    if (!invoice.receiverPhone || !invoice.productName) {
      toast.error('بيانات الفاتورة غير مكتملة');
      return;
    }
    isPrinting.current = true;
    setPrintState('printing');
    setStateMsg('جارٍ إرسال الفاتورة…');

    try {
      const outcome = await printInvoice(invoice, { forcePicker });
      if (outcome.needsPicker) {
        setPrintState('idle');
        setPickerOpen(true);
        return;
      }
      const { result } = outcome;
      if (result.success) {
        setPrintState('success');
        setStateMsg('تمت الطباعة');
        toast.success('✅ تمت الطباعة بنجاح');
        setTimeout(() => { setPrintState('idle'); setStateMsg(''); }, 2500);
      } else {
        const msg = result.error ?? 'خطأ غير معروف';
        setPrintState('error');
        setStateMsg(msg);
        toast.error(`فشل الطباعة: ${msg}`);
        setTimeout(() => { setPrintState('idle'); setStateMsg(''); }, 3500);
      }
    } catch (e: unknown) {
      const msg = formatError(e);
      setPrintState('error');
      setStateMsg(msg);
      toast.error(`خطأ في الطباعة: ${msg}`);
      setTimeout(() => { setPrintState('idle'); setStateMsg(''); }, 3500);
    } finally {
      isPrinting.current = false;
    }
  }, [invoice]);

  const handlePrinterSaved = useCallback(() => {
    setPickerOpen(false);
    setTimeout(() => executePrint(false), 300);
  }, [executePrint]);

  const handleAndroidPrint = useCallback(() => {
    setPickerOpen(false);
    setTimeout(() => executePrint(false), 300);
  }, [executePrint]);

  const Icon =
    printState === 'printing' ? Loader2 :
    printState === 'success'  ? CheckCircle2 :
    printState === 'error'    ? AlertCircle :
    Printer;

  const label =
    printState === 'printing' ? (stateMsg || 'جارٍ الطباعة…') :
    printState === 'success'  ? 'تمت الطباعة' :
    printState === 'error'    ? 'أعد المحاولة' :
    'طباعة الفاتورة';

  const colorClass =
    printState === 'success' ? 'border-green-500/30 text-green-400 bg-green-500/10' :
    printState === 'error'   ? 'border-red-500/30 text-red-400 bg-red-500/10' :
    'border-blue-500/30 text-blue-300 bg-blue-500/10';

  return (
    <>
      <button
        onClick={() => executePrint(false)}
        disabled={printState === 'printing'}
        aria-label="طباعة الفاتورة"
        className={`flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm border transition-all active:scale-[0.97] disabled:opacity-60 ${colorClass} ${
          variant === 'full' ? 'w-full h-11 px-4' : 'w-10 h-10'
        } ${className}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${printState === 'printing' ? 'animate-spin' : ''}`} />
        {variant === 'full' && <span className="truncate">{label}</span>}
      </button>

      <PrinterSetupModal
        open={pickerOpen}
        invoice={invoice}
        onClose={() => setPickerOpen(false)}
        onSaved={handlePrinterSaved}
        onAndroidPrint={handleAndroidPrint}
      />
    </>
  );
}

