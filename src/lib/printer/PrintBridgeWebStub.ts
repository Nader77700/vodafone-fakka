/**
 * PrintBridgeWebStub — Stub للبيئة غير الـ Android (dev/web)
 * يُستخدم تلقائياً من registerPlugin عند تشغيل التطبيق في المتصفح.
 */
import { WebPlugin } from '@capacitor/core';
import type {
  PrintPluginInterface, PrintHtmlOptions, PrintHtmlResult,
  PrintEscPosOptions, PrintEscPosResult, BluetoothStatus,
  ScanResult, EnableBtResult, BuiltinPrinterInfo, PermissionResult,
} from './NativePrintBridge';

export class PrintBridgeWebStub extends WebPlugin implements PrintPluginInterface {
  async printHtml(_opts: PrintHtmlOptions): Promise<PrintHtmlResult> {
    // في المتصفح نستخدم window.print() كبديل للتطوير فقط
    window.print();
    return { success: true };
  }
  async printEscPos(_opts: PrintEscPosOptions): Promise<PrintEscPosResult> {
    return { success: false };
  }
  async checkBluetooth(): Promise<BluetoothStatus> {
    return { supported: false, enabled: false, hasPermission: false, reason: 'NO_BT_HARDWARE' };
  }
  async scanPairedPrinters(): Promise<ScanResult> {
    return { devices: [], count: 0 };
  }
  async requestEnableBt(): Promise<EnableBtResult> {
    return { enabled: false };
  }
  async checkBuiltinPrinter(): Promise<BuiltinPrinterInfo> {
    return { available: false, packageFound: '', name: '', manufacturer: 'Web', model: 'Browser' };
  }
  async requestBtPermissions(): Promise<PermissionResult> {
    return { granted: false };
  }
}
