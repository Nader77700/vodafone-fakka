/**
 * vodafoneDetectorWeb.ts
 * Fallback للمتصفح / المحاكي — يُرجع قيم وهمية واضحة بدل قيم حقيقية
 * لا يُستخدم في APK الفعلي
 */
import type { NetworkInfo } from './vodafoneDetector';

export class VodafoneDetectorWeb {
  async getNetworkInfo(): Promise<NetworkInfo> {
    return {
      activeDataSimOperator:     'غير متوفر (ويب)',
      activeDataSimOperatorName: 'غير متوفر (ويب)',
      activeDataSubId:           -1,
      simOperator:               'غير متوفر (ويب)',
      simOperatorName:           'غير متوفر (ويب)',
      networkOperator:           'غير متوفر (ويب)',
      networkOperatorName:       'غير متوفر (ويب)',
      activeNetwork:             navigator.onLine ? 'متصل (ويب)' : 'غير متصل',
      isMobileDataActive:        false,
      isWifiActive:              navigator.onLine,
      isVodafoneSim:             false,
      isVodafoneMobile:          false,
      canExecuteNative:          false,
      hasPhonePermission:        false,
      deviceModel:               'متصفح ويب',
      androidVersion:            'N/A',
    };
  }

  async requestPhonePermission(): Promise<{ granted: boolean }> {
    return { granted: false };
  }
}
