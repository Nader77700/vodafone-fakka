/**
 * PrinterSetupModal — شاشة اختيار الطابعة
 *
 * يظهر مرة واحدة فقط عند أول طباعة.
 * الخيارات:
 *  1. طباعة عبر Android (WiFi/USB/Network/Built-in) — فورية
 *  2. اختيار طابعة Bluetooth ESC/POS وحفظها
 *  3. تغيير حجم الورق
 */
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Printer, Bluetooth, Wifi, Usb, Monitor, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import type { InvoiceData, SavedPrinter, PaperWidth } from '@/lib/printer/types';
import { savePrinterConfig, scanBluetoothPrinters } from '@/lib/printer/PrinterService';

interface PrinterSetupModalProps {
  open:             boolean;
  invoice:          InvoiceData;
  onClose:          () => void;
  onSaved:          () => void;   // بعد حفظ الطابعة وإعادة المحاولة
  onAndroidPrint:   () => void;   // طباعة مباشرة عبر Android Dialog
}

const PAPER_OPTIONS: { label: string; value: PaperWidth }[] = [
  { label: '80mm (قياسي)', value: 80 },
  { label: '58mm (صغير)',  value: 58 },
];

export default function PrinterSetupModal({
  open, onClose, onSaved, onAndroidPrint,
}: PrinterSetupModalProps) {
  const [scanning,    setScanning]    = useState(false);
  const [btDevices,   setBtDevices]   = useState<{ id: string; name: string }[]>([]);
  const [paperWidth,  setPaperWidth]  = useState<PaperWidth>(80);
  const [showPaper,   setShowPaper]   = useState(false);

  async function handleScanBluetooth() {
    if (!navigator.bluetooth) {
      toast.error('Bluetooth غير مدعوم على هذا الجهاز أو المتصفح');
      return;
    }
    setScanning(true);
    try {
      const devices = await scanBluetoothPrinters();
      setBtDevices(devices);
      if (devices.length === 0) toast.info('لم يتم العثور على طابعات Bluetooth');
    } catch {
      toast.error('فشل البحث عن طابعات Bluetooth');
    } finally {
      setScanning(false);
    }
  }

  async function handleSelectBtDevice(device: { id: string; name: string }) {
    const printer: SavedPrinter = {
      id:         device.id,
      name:       device.name,
      type:       'bluetooth',
      paperWidth,
      savedAt:    new Date().toISOString(),
    };
    await savePrinterConfig(printer);
    toast.success(`✅ تم حفظ الطابعة: ${device.name}`);
    onSaved();
  }

  const optionStyle = {
    background: 'rgba(255,255,255,0.04)',
    border:     '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    cursor: 'pointer',
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] w-[92vw] md:max-w-[400px] p-0 border-0 max-h-[88dvh] overflow-y-auto"
        style={{ background: '#0a0a14', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 20 }}
        dir="rtl"
      >
        {/* شريط علوي */}
        <div className="h-1 w-full rounded-t-[20px]"
          style={{ background: 'linear-gradient(90deg,#3b82f6,#60a5fa 50%,#3b82f6)' }} />

        {/* رأس */}
        <div className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'rgba(59,130,246,0.12)', background: 'rgba(59,130,246,0.04)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
            <Printer className="w-4.5 h-4.5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white">اختيار الطابعة</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              يُحفظ اختيارك للمرات القادمة
            </p>
          </div>
        </div>

        <div className="p-5 space-y-3">

          {/* ── خيار 1: Android Print Dialog ── */}
          <button
            className="w-full flex items-center gap-4 px-4 py-4 text-right transition-all active:scale-[0.98]"
            style={optionStyle}
            onClick={onAndroidPrint}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <Monitor className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">طباعة عبر Android</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                WiFi • USB • Network • طابعة مدمجة • POS
              </p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
              موصى به
            </span>
          </button>

          {/* ── خيار 2: Bluetooth ESC/POS ── */}
          <div style={{ ...optionStyle, overflow: 'hidden' }}>
            <button
              className="w-full flex items-center gap-4 px-4 py-4 text-right transition-all active:scale-[0.98]"
              onClick={handleScanBluetooth}
              disabled={scanning}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <Bluetooth className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">
                  {scanning ? 'جارٍ البحث…' : 'طابعة Bluetooth (ESC/POS)'}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  طابعات حرارية • POS • فوري • أمان
                </p>
              </div>
              {scanning && (
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin shrink-0"
                  style={{ borderColor: '#3b82f6' }} />
              )}
            </button>
            {/* نتائج BT */}
            {btDevices.length > 0 && (
              <div className="border-t px-4 pb-3 space-y-2 pt-2"
                style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                {btDevices.map(dev => (
                  <button key={dev.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-all active:scale-[0.97]"
                    style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}
                    onClick={() => handleSelectBtDevice(dev)}
                  >
                    <Bluetooth className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-xs font-semibold text-white flex-1 min-w-0 truncate">{dev.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── حجم الورق ── */}
          <button
            className="w-full flex items-center gap-3 px-4 py-3 transition-all"
            style={optionStyle}
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
                    border:     paperWidth === opt.value ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    color:      paperWidth === opt.value ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                  }}
                  onClick={() => setPaperWidth(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* زر إغلاق */}
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
