/**
 * NativePrintBridge — جسر TypeScript ↔ PrintPlugin.java عبر Capacitor
 *
 * كل الاتصالات بالطابعة تمر عبر هذا الجسر.
 * لا يستخدم Web Bluetooth ولا window.open ولا Intent للمتصفح.
 */
import { registerPlugin } from '@capacitor/core';

// ── تعريف واجهة Plugin ────────────────────────────────────────────────────

export type PaperSizeKey = 'A4' | 'THERMAL_58' | 'THERMAL_80';

export interface PrintHtmlOptions {
  html:      string;
  jobName?:  string;
  paper?:    PaperSizeKey;
}

export interface PrintHtmlResult {
  success:    boolean;
  cancelled?: boolean;
  failed?:    boolean;
  jobId?:     string;
}

export interface PrintEscPosOptions {
  address: string;   // MAC address  AA:BB:CC:DD:EE:FF
  data:    string;   // ESC/POS bytes مشفرة Base64
}

export interface PrintEscPosResult {
  success:    boolean;
  bytesSent?: number;
  fallback?:  boolean;
}

export interface BluetoothStatus {
  supported:     boolean;
  enabled:       boolean;
  hasPermission: boolean;
  reason:        'OK' | 'BT_DISABLED' | 'NO_PERMISSION' | 'NO_BT_HARDWARE';
}

export interface BtDevice {
  address: string;
  name:    string;
  type:    number;
}

export interface ScanResult {
  devices: BtDevice[];
  count:   number;
}

export interface EnableBtResult {
  enabled: boolean;
}

export interface BuiltinPrinterInfo {
  available:    boolean;
  packageFound: string;
  name:         string;
  manufacturer: string;
  model:        string;
}

export interface PermissionResult {
  granted: boolean;
}

export interface PrintPluginInterface {
  printHtml(options: PrintHtmlOptions):         Promise<PrintHtmlResult>;
  printEscPos(options: PrintEscPosOptions):     Promise<PrintEscPosResult>;
  checkBluetooth():                             Promise<BluetoothStatus>;
  scanPairedPrinters():                         Promise<ScanResult>;
  requestEnableBt():                            Promise<EnableBtResult>;
  checkBuiltinPrinter():                        Promise<BuiltinPrinterInfo>;
  requestBtPermissions():                       Promise<PermissionResult>;
}

// ── تسجيل Plugin مع Capacitor ─────────────────────────────────────────────
const PrintBridge = registerPlugin<PrintPluginInterface>('Print', {
  // في بيئة الويب (dev) نقدم stub بسيطة لمنع أخطاء runtime
  web: () => import('./PrintBridgeWebStub').then(m => new m.PrintBridgeWebStub()),
});

export default PrintBridge;
