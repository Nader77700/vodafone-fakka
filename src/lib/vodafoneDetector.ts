/**
 * vodafoneDetector.ts
 * جسر TypeScript للبلوجن الأصلي VodafoneDetectorPlugin
 * يقرأ بيانات SIM والشبكة مباشرة من Android TelephonyManager
 */
import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

// ── واجهة بيانات الشبكة المُرجَعة من Android ──
export interface NetworkInfo {
  // ── Active Data SIM — مصدر القرار الحقيقي (Dual SIM aware) ──
  /** MCC+MNC للشريحة المستخدمة حالياً في Mobile Data */
  activeDataSimOperator: string;
  /** اسم مشغّل الشريحة المستخدمة حالياً في Mobile Data */
  activeDataSimOperatorName: string;
  /** SubscriptionId للشريحة النشطة (-1 = غير متوفر) */
  activeDataSubId: number;

  // ── SIM 1 Fallback (للعرض فقط) ──
  /** رمز MCC+MNC لـ SIM الأولى */
  simOperator: string;
  /** اسم مشغّل SIM الأولى */
  simOperatorName: string;

  // ── Network Operator (للعرض) ──
  /** رمز MCC+MNC للشبكة المُسجَّلة */
  networkOperator: string;
  /** اسم الشبكة المُسجَّلة */
  networkOperatorName: string;

  /** نوع الشبكة النشطة */
  activeNetwork: string;
  isMobileDataActive: boolean;
  isWifiActive: boolean;
  /** هل SIM الأولى فودافون؟ */
  isVodafoneSim: boolean;
  /** هل Active Data SIM فودافون؟ (القرار النهائي) */
  isVodafoneMobile: boolean;
  /** canExecuteNative = isVodafoneMobile && isMobileDataActive */
  canExecuteNative: boolean;
  hasPhonePermission: boolean;
  deviceModel: string;
  androidVersion: string;
}

// ── حدث تغيير الشبكة من TelephonyCallback ──
export interface NetworkStateChangedEvent {
  trigger: string;
  timestamp: number;
}

// ── واجهة البلوجن ──
interface VodafoneDetectorPlugin {
  getNetworkInfo(): Promise<NetworkInfo>;
  requestPhonePermission(): Promise<{ granted: boolean }>;
  /** يستمع لأحداث TelephonyCallback من Native (تغيير Data SIM / بيانات / شبكة) */
  addListener(
    eventName: 'networkStateChanged',
    listenerFunc: (event: NetworkStateChangedEvent) => void
  ): Promise<PluginListenerHandle>;
}

// ── تسجيل البلوجن مع Capacitor ──
export const VodafoneDetector = registerPlugin<VodafoneDetectorPlugin>(
  'VodafoneDetector',
  {
    // Fallback للويب / المحاكي — يُرجع قيم وهمية واضحة
    web: () =>
      import('./vodafoneDetectorWeb').then(m => new m.VodafoneDetectorWeb()),
  }
);

// ── دالة مساعدة: هل التطبيق شغال APK أصلي؟ ──
export function isNativeAndroid(): boolean {
  return (
    typeof (window as unknown as Record<string, unknown>)?.Capacitor !== 'undefined' &&
    (window as unknown as { Capacitor?: { getPlatform?: () => string } })
      ?.Capacitor?.getPlatform?.() === 'android'
  );
}
