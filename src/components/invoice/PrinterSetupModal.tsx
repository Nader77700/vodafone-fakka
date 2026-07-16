/**
 * PrinterSetupModal v2 — شاشة اختيار الطابعة
 *
 * كل خيار له محرك مستقل عبر PrintPlugin.java — لا يفتح أي متصفح.
 *
 * الخيارات:
 *  1. Android Print  → PrintManager مباشرة (WiFi/USB/Network/Built-in)
 *  2. Bluetooth ESC/POS → BluetoothSocket SPP (يفحص BT ويطلب الصلاحيات)
 *  3. الطابعة المدمجة  → يكتشفها تلقائياً ويستخدم Android PrintManager
 *
 * لا يوجد intent للمتصفح. لا يوجد Web Bluetooth.
 */
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Printer, Bluetooth, Monitor, ChevronDown,
  Loader2, CheckCircle2, AlertCircle, RefreshCw, Cpu,
} from 'lucide-react';
import { toast } from 'sonner';
import type { InvoiceData, SavedPrinter, PaperWidth } from '@/lib/printer/types';
import {
  savePrinterConfig,
  checkBluetoothStatus,
  scanPairedPrinters,
  requestEnableBluetooth,
  requestBluetoothPermissions,
  checkBuiltinPrinter,
  printViaAndroid,
  printViaBluetooth,
} from '@/lib/printer/PrinterService';

interface PrinterSetupModalProps {
  open:           boolean;
  invoice:        InvoiceData;
  onClose:        () => void;
  onSaved:        () => void;
  onAndroidPrint: () => void;
}

type BtScanState = 'idle' | 'checking' | 'requesting_perm' | 'requesting_enable' | 'scanning' | 'done' | 'error';
type PrintOptionState = 'idle' | 'printing' | 'success' | 'error';

const PAPER_OPTIONS: { label: string; value: PaperWidth }[] = [
  { label: '80mm (قياسي)', value: 80 },
  { label: '58mm (صغير)',  value: 58 },
];

// ── أسماء تصنيف طابعات BT ────────────────────────────────────────────────
const PRINTER_KEYWORDS = ['print', 'POS', 'thermal', 'receipt', 'فوري', 'أمان', 'Epson', 'RP', 'XP', 'GP'];
function isProbablyPrinter(name: string): boolean {
  return PRINTER_KEYWORDS.some(k => name.toLowerCase().includes(k.toLowerCase()));
}

export default function PrinterSetupModal({
  open, invoice, onClose, onSaved, onAndroidPrint,
}: PrinterSetupModalProps) {
  const [paperWidth,    setPaperWidth]    = useState<PaperWidth>(80);
  const [showPaper,     setShowPaper]     = useState(false);
  const [btState,       setBtState]       = useState<BtScanState>('idle');
  const [btDevices,     setBtDevices]     = useState<{ address: string; name: string }[]>([]);
  const [btError,       setBtError]       = useState('');
  const [builtinInfo,   setBuiltinInfo]   = useState<{ available: boolean; name: string } | null>(null);
  const [androidState,  setAndroidState]  = useState<PrintOptionState>('idle');
  const [builtinState,  setBuiltinState]  = useState<PrintOptionState>('idle');

  // كشف الطابعة المدمجة عند فتح الـ modal
  useEffect(() => {
    if (!open) return;
    checkBuiltinPrinter().then(info => setBuiltinInfo(info));
  }, [open]);

  // ── [1] Android PrintManager ──────────────────────────────────────────
  const handleAndroidPrintDirect = useCallback(async () => {
    setAndroidState('printing');
    try {
      const result = await printViaAndroid(invoice, paperWidth);
      if (result.success || result.error?.includes('إلغاء')) {
        setAndroidState('success');
        toast.success(result.error?.includes('إلغاء') ? 'تم إلغاء الطباعة' : '✅ تمت الطباعة بنجاح');
        setTimeout(() => { setAndroidState('idle'); onAndroidPrint(); }, 1200);
      } else {
        setAndroidState('error');
        toast.error(`فشل الطباعة: ${result.error}`);
        setTimeout(() => setAndroidState('idle'), 2500);
      }
    } catch (e: unknown) {
      setAndroidState('error');
      toast.error(e instanceof Error ? e.message : 'خطأ في الطباعة');
      setTimeout(() => setAndroidState('idle'), 2500);
    }
  }, [invoice, paperWidth, onAndroidPrint]);

  // ── [2] الطابعة المدمجة ───────────────────────────────────────────────
  const handleBuiltinPrint = useCallback(async () => {
    setBuiltinState('printing');
    try {
      const result = await printViaAndroid(invoice, paperWidth);
      if (result.success || result.error?.includes('إلغاء')) {
        setBuiltinState('success');
        toast.success('✅ تمت الطباعة عبر الطابعة المدمجة');

        // حفظ كطابعة مدمجة افتراضية
        if (builtinInfo) {
          await savePrinterConfig({
            id: 'builtin',
            name: builtinInfo.name || 'Builtin Printer',
            type: 'builtin',
            paperWidth,
            savedAt: new Date().toISOString(),
          });
        }
        setTimeout(() => { setBuiltinState('idle'); onSaved(); }, 1200);
      } else {
        setBuiltinState('error');
        toast.error(`فشل: ${result.error}`);
        setTimeout(() => setBuiltinState('idle'), 2500);
      }
    } catch {
      setBuiltinState('error');
      setTimeout(() => setBuiltinState('idle'), 2500);
    }
  }, [invoice, paperWidth, builtinInfo, onSaved]);

  // ── [3] Bluetooth — دورة كاملة: فحص → صلاحيات → تشغيل → مسح ─────────
  const handleBluetoothScan = useCallback(async () => {
    setBtError('');
    setBtState('checking');
    setBtDevices([]);

    // فحص حالة BT
    const status = await checkBluetoothStatus();

    if (!status.supported) {
      setBtState('error');
      setBtError('هذا الجهاز لا يدعم Bluetooth');
      return;
    }

    // طلب صلاحيات إن لزم
    if (!status.hasPermission) {
      setBtState('requesting_perm');
      const granted = await requestBluetoothPermissions();
      if (!granted) {
        setBtState('error');
        setBtError('لم يتم منح صلاحية Bluetooth — تحقق من إعدادات التطبيق');
        return;
      }
    }

    // طلب تشغيل BT إن كان مغلقاً
    if (!status.enabled) {
      setBtState('requesting_enable');
      const enabled = await requestEnableBluetooth();
      if (!enabled) {
        setBtState('error');
        setBtError('Bluetooth مغلق — يرجى تشغيله وإعادة المحاولة');
        return;
      }
    }

    // المسح
    setBtState('scanning');
    const devices = await scanPairedPrinters();

    if (devices.length === 0) {
      setBtState('error');
      setBtError('لا توجد أجهزة Bluetooth مقترنة — قم بالإقران من إعدادات الجهاز أولاً');
      return;
    }

    setBtDevices(devices);
    setBtState('done');
  }, []);

  // ── اختيار طابعة BT وطباعة ───────────────────────────────────────────
  const handleSelectBtDevice = useCallback(async (device: { address: string; name: string }) => {
    setBtState('checking'); // loading أثناء الطباعة
    const result = await printViaBluetooth(invoice, device.address, paperWidth);

    if (result.success) {
      // حفظ كطابعة افتراضية
      await savePrinterConfig({
        id:         device.address,
        name:       device.name,
        type:       'bluetooth',
        paperWidth,
        savedAt:    new Date().toISOString(),
      });
      toast.success(`✅ تمت الطباعة عبر ${device.name}`);
      setBtState('idle');
      onSaved();
    } else {
      setBtState('error');
      setBtError(result.error ?? 'فشل الاتصال بالطابعة');
      toast.error(`فشل الاتصال بـ ${device.name}: ${result.error}`);
      setTimeout(() => { setBtState('idle'); setBtError(''); }, 3000);
    }
  }, [invoice, paperWidth, onSaved]);

  // ── تسميات حالة BT ───────────────────────────────────────────────────
  const btLabel =
    btState === 'checking'          ? 'جارٍ الفحص…' :
    btState === 'requesting_perm'   ? 'جارٍ طلب الصلاحية…' :
    btState === 'requesting_enable' ? 'جارٍ طلب تشغيل Bluetooth…' :
    btState === 'scanning'          ? 'جارٍ البحث عن الطابعات…' :
    btState === 'done'              ? `تم العثور على ${btDevices.length} جهاز` :
    btState === 'error'             ? btError :
    'طابعة Bluetooth (ESC/POS)';

  const isBtLoading = ['checking','requesting_perm','requesting_enable','scanning'].includes(btState);

  const optionBase = {
    background:   'rgba(255,255,255,0.04)',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    cursor:       'pointer',
  } as React.CSSProperties;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] w-[92vw] md:max-w-[400px] p-0 border-0 max-h-[90dvh] overflow-y-auto"
        style={{ background: '#0a0a14', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 20 }}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
            <Printer className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white">اختيار الطابعة</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              يُحفظ اختيارك للمرات القادمة
            </p>
          </div>
        </div>

        <div className="p-5 space-y-3">

          {/* ── [1] Android PrintManager ── */}
          <button
            className="w-full flex items-center gap-4 px-4 py-4 text-right transition-all active:scale-[0.98] disabled:opacity-60"
            style={optionBase}
            onClick={handleAndroidPrintDirect}
            disabled={androidState === 'printing'}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
              {androidState === 'printing' ? <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
              : androidState === 'success'  ? <CheckCircle2 className="w-5 h-5 text-green-400" />
              : androidState === 'error'    ? <AlertCircle className="w-5 h-5 text-red-400" />
              : <Monitor className="w-5 h-5 text-green-400" />}
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-sm font-bold text-white">طباعة عبر Android</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                WiFi · USB · Network · طابعة مدمجة · POS
              </p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
              موصى به
            </span>
          </button>

          {/* ── [2] الطابعة المدمجة (إن وُجدت) ── */}
          {builtinInfo?.available && (
            <button
              className="w-full flex items-center gap-4 px-4 py-4 text-right transition-all active:scale-[0.98] disabled:opacity-60"
              style={optionBase}
              onClick={handleBuiltinPrint}
              disabled={builtinState === 'printing'}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)' }}>
                {builtinState === 'printing' ? <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                : builtinState === 'success'  ? <CheckCircle2 className="w-5 h-5 text-purple-400" />
                : <Cpu className="w-5 h-5 text-purple-400" />}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-sm font-bold text-white">{builtinInfo.name || 'الطابعة المدمجة'}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  طابعة داخلية · Sunmi · PAX · Newland · فوري
                </p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0"
                style={{ background: 'rgba(168,85,247,0.1)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.2)' }}>
                مكتشفة
              </span>
            </button>
          )}

          {/* ── [3] Bluetooth ESC/POS ── */}
          <div style={{ ...optionBase, overflow: 'hidden' }}>
            <button
              className="w-full flex items-center gap-4 px-4 py-4 text-right transition-all active:scale-[0.98] disabled:opacity-60"
              onClick={btState === 'idle' || btState === 'error' ? handleBluetoothScan : undefined}
              disabled={isBtLoading}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
                {isBtLoading ? <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                : btState === 'error' ? <AlertCircle className="w-5 h-5 text-red-400" />
                : btState === 'done'  ? <CheckCircle2 className="w-5 h-5 text-blue-400" />
                : <Bluetooth className="w-5 h-5 text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-sm font-bold text-white">
                  {btState === 'idle' ? 'طابعة Bluetooth (ESC/POS)' : btLabel}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: btState === 'error' ? '#f87171' : 'rgba(255,255,255,0.45)' }}>
                  {btState === 'error' ? btError : 'طابعات حرارية · POS · فوري · أمان'}
                </p>
              </div>
              {(btState === 'idle' || btState === 'error') && (
                <RefreshCw className="w-4 h-4 text-blue-400 shrink-0" />
              )}
            </button>

            {/* قائمة الأجهزة المقترنة */}
            {btState === 'done' && btDevices.length > 0 && (
              <div className="border-t px-4 pb-3 pt-2 space-y-1.5"
                style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] text-muted-foreground mb-2">اختر الطابعة:</p>
                {btDevices.map(dev => (
                  <button key={dev.address}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-all active:scale-[0.97]"
                    style={{
                      background: isProbablyPrinter(dev.name) ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.04)',
                      border: isProbablyPrinter(dev.name) ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                    onClick={() => handleSelectBtDevice(dev)}
                  >
                    <Bluetooth className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{dev.name}</p>
                      <p className="text-[10px] text-muted-foreground">{dev.address}</p>
                    </div>
                    {isProbablyPrinter(dev.name) && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>طابعة</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── حجم الورق ── */}
          <button
            className="w-full flex items-center gap-3 px-4 py-3 transition-all"
            style={optionBase}
            onClick={() => setShowPaper(v => !v)}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <Printer className="w-4 h-4 text-yellow-400" />
            </div>
            <span className="text-xs font-semibold text-white flex-1 text-right">
              حجم الورق: {paperWidth}mm
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showPaper ? 'rotate-180' : ''}`} />
          </button>
          {showPaper && (
            <div className="flex gap-2 px-1">
              {PAPER_OPTIONS.map(opt => (
                <button key={opt.value}
                  className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: paperWidth === opt.value ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                    border:     paperWidth === opt.value ? '1px solid rgba(245,158,11,0.4)'  : '1px solid rgba(255,255,255,0.08)',
                    color:      paperWidth === opt.value ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                  }}
                  onClick={() => setPaperWidth(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* إغلاق */}
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }}
          >
            إغلاق
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

