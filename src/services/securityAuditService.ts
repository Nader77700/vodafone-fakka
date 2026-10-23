import { supabase } from '@/db/supabase';

/**
 * خدمة كشف التلاعب والحماية الخادمة الشاملة (Anti-Tamper & Zero-Trust Telemetry)
 */
export class SecurityAuditService {
  private static deviceIdKey = 'vf_security_device_token';

  /**
   * الحصول على معرف الجهاز الفريد أو إنشائه
   */
  public static getDeviceId(): string {
    let deviceId = localStorage.getItem(this.deviceIdKey);
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
      localStorage.setItem(this.deviceIdKey, deviceId);
    }
    return deviceId;
  }

  /**
   * الإبلاغ الفوري للسيرفر عن أي محاولة تلاعب بالصلاحيات أو حزم الطلبات
   */
  public static async reportTamper(
    userId: string | null,
    eventType: string,
    details: string
  ): Promise<void> {
    try {
      const deviceId = this.getDeviceId();
      console.warn(`[Security Alert] Reporting tamper event: ${eventType}`, details);

      await supabase.rpc('report_and_ban_tamper', {
        p_user_id: userId,
        p_device_id: deviceId,
        p_event_type: eventType,
        p_details: details,
      });
    } catch (err) {
      console.error('Failed to report tamper event:', err);
    }
  }

  /**
   * التحقق من سلامة البيئة ومنع تلاعب الواجهة المحلية بالصلاحيات
   */
  public static verifyClientIntegrity(userEmail?: string): boolean {
    const isOwnerEmail = userEmail?.toLowerCase() === 'nader77@miaoda.com';
    
    // فحص ما إذا كان هناك تلاعب ببيانات التخزين المحلي لادعاء أدمن
    try {
      const storedRole = localStorage.getItem('user_role');
      if (storedRole === 'admin' && !isOwnerEmail) {
        this.reportTamper(
          null,
          'localstorage_role_spoofing',
          'محاولة تلاعب بـ localStorage لادعاء دور الأدمن دون مصادقة'
        );
        return false;
      }
    } catch {
      // ignore
    }

    return true;
  }
}
