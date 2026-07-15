// src/services/flex-migration/FlexMigrationService.ts
import { FlexLogger } from './logging/FlexLogger';
import { FlexValidator } from './security/FlexValidator';
import { FlexSessionManager } from './security/FlexSessionManager';
import { FlexRepository, VFResponse } from './repository/FlexRepository';
import { FlexErrorParser } from './error/FlexErrorParser';
import { LoginRequest, ActivationRequest, ActivationResult, BundleModel, ApiError, ActivationProgressStep } from './models/FlexModels';

export interface EligibilityResult {
  isEligible: boolean;
  needsACP: boolean;
  message: string;
  token?: string; // We can return the token to avoid re-login
}

export class FlexMigrationService {
  private sessionManager: FlexSessionManager;

  constructor() {
    this.sessionManager = new FlexSessionManager();
  }

  private mapVodafoneError(resp: VFResponse<any>, defaultMessage: string): { code: string, message: string } {
    let msg = defaultMessage;
    let code = 'VODAFONE_ERROR';

    if (resp.error) {
      const e = resp.error;
      code = e.code || code;
      
      const rawMsg = (e.description || e.message || e.reason || '').toLowerCase();

      if (rawMsg.includes('invalid') && rawMsg.includes('credential')) {
        msg = 'بيانات تسجيل الدخول غير صحيحة. يرجى مراجعة رقم الهاتف وكلمة المرور.';
        code = 'AUTH_FAILED';
      } else if (rawMsg.includes('session') || rawMsg.includes('token')) {
        msg = 'انتهت صلاحية الجلسة أو هناك مشكلة في تسجيل الدخول. يرجى المحاولة مرة أخرى.';
        code = 'SESSION_EXPIRED';
      } else if (rawMsg.includes('not eligible') || rawMsg.includes('not allow')) {
        msg = 'هذا النظام غير متاح لخطك حالياً. يرجى التحقق من الأنظمة المؤهلة.';
        code = 'NOT_ELIGIBLE';
      } else if (rawMsg.includes('already') || rawMsg.includes('active')) {
        msg = 'أنت مشترك بالفعل على هذا النظام، أو يوجد طلب قيد التنفيذ.';
        code = 'ALREADY_ACTIVE';
      } else if (rawMsg.includes('insufficient') || rawMsg.includes('balance') || rawMsg.includes('not enough')) {
        msg = 'الرصيد غير كافٍ لإتمام التحويل. يرجى شحن الرصيد والمحاولة مرة أخرى.';
        code = 'INSUFFICIENT_BALANCE';
      } else if (rawMsg.includes('generic') || rawMsg.includes('system error') || code === '3999' || rawMsg.includes('not permit') || rawMsg.includes('rule') || rawMsg.includes('not change')) {
        msg = 'النظام الحالي يمنع التحويل المباشر. (اقتراح: قم بتحويل الخط إلى نظام 14 قرش أولاً ثم أعد المحاولة).';
        code = 'SYSTEM_INCOMPATIBLE';
      } else if (e.description || e.message || e.reason) {
        msg = `رسالة من فودافون: ${e.description || e.message || e.reason || JSON.stringify(e)}`;
      }
    } else if (resp.raw && typeof resp.raw === 'string' && resp.raw.includes('Error')) {
       msg = `خطأ غير متوقع: ${resp.raw.substring(0, 50)}...`;
    }

    return { code, message: msg };
  }

  async checkEligibility(
    bundle: BundleModel, 
    msisdn: string, 
    password?: string,
    onProgress?: (step: string) => void
  ): Promise<EligibilityResult> {
    try {
      onProgress?.('تسجيل الدخول للتحقق...');
      const loginResp = await FlexRepository.login({ msisdn, password });
      if (!loginResp.success || !loginResp.data?.access_token) {
        const mapped = this.mapVodafoneError(loginResp, 'فشل تسجيل الدخول في حساب فودافون.');
        return { isEligible: false, needsACP: false, message: mapped.message };
      }
      const token = loginResp.data.access_token;

      onProgress?.('قراءة الأنظمة المتاحة للخط...');
      const eligibleResp = await FlexRepository.get_eligible(msisdn, token);
      
      if (!eligibleResp.success) {
        const mapped = this.mapVodafoneError(eligibleResp, 'فشل في قراءة الأنظمة المتاحة للخط.');
        return { isEligible: false, needsACP: false, message: mapped.message };
      }

      const eligibleBundles = eligibleResp.data?.bundles || [];
      const matchedBundle = eligibleBundles.find((b: any) => b.prod_id === bundle.productId);
      
      if (matchedBundle) {
        return { 
          isEligible: true, 
          needsACP: false, 
          token, 
          message: `الخط مؤهل لتفعيل النظام (${bundle.name}) مباشرة.` 
        };
      } else {
        // If it's not in the eligible list, it might be the current system, OR it needs ACP fallback, OR requires migrating to 14 pt first.
        return { 
          isEligible: true, // We allow them to try ACP
          needsACP: true, 
          token, 
          message: `هذا النظام غير ظاهر ضمن قائمة الأنظمة المؤهلة لخطك. قد تكون مشتركاً فيه بالفعل، أو يتطلب التفعيل استخدام طريقة التفعيل الإجباري (ACP). هل تود المتابعة والمحاولة؟` 
        };
      }
    } catch (e: any) {
      return { isEligible: false, needsACP: false, message: e.message || 'حدث خطأ غير معروف' };
    }
  }

  async activateSystem(
    bundle: BundleModel, 
    msisdn: string, 
    password?: string,
    onProgress?: (step: ActivationProgressStep) => void,
    preAuthToken?: string
  ): Promise<ActivationResult> {
    const startTime = Date.now();
    const transactionId = crypto.randomUUID();

    try {
      FlexLogger.info('FlexMigrationService', 'Starting bundle activation', { bundleId: bundle.bundleId, transactionId });

      // 1. Validation
      const validation = FlexValidator.validateActivationPayload(msisdn, bundle.bundleId);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      let token = preAuthToken;
      
      if (!token) {
        onProgress?.('login');
        // 2. Login
        const loginResp = await FlexRepository.login({ msisdn, password });
        if (!loginResp.success || !loginResp.data?.access_token) {
          const mapped = this.mapVodafoneError(loginResp, 'فشل تسجيل الدخول في حساب فودافون.');
          throw new Error(`${mapped.code}|${mapped.message}`);
        }
        token = loginResp.data.access_token;
      }

      onProgress?.('verifying');
      // Token received

      onProgress?.('reading_systems');
      const eligibleResp = await FlexRepository.get_eligible(msisdn, token);
      
      if (!eligibleResp.success) {
        const mapped = this.mapVodafoneError(eligibleResp, 'فشل في قراءة الأنظمة المتاحة للخط.');
        throw new Error(`${mapped.code}|${mapped.message}`);
      }

      onProgress?.('matching_system');
      const eligibleBundles = eligibleResp.data?.bundles || [];
      const matchedBundle = eligibleBundles.find((b: any) => b.prod_id === bundle.productId);
      
      let activationResp: VFResponse<any>;

      if (matchedBundle) {
        onProgress?.('sending_request');
        activationResp = await FlexRepository.activate_eligible(msisdn, token, matchedBundle);
      } else {
        // Not in eligible list. We try ACP fallback.
        onProgress?.('sending_request');
        activationResp = await FlexRepository.try_direct_acp(msisdn, token, bundle.productId);
      }
      
      onProgress?.('waiting_response');
      
      if (!activationResp.success) {
        const mapped = this.mapVodafoneError(activationResp, 'لم نتمكن من تفعيل النظام. قد يكون غير متاح لخطك حالياً.');
        throw new Error(`${mapped.code}|${mapped.message}`);
      }

      onProgress?.('analyzing_result');
      
      // SMART SUCCESS VALIDATION
      // Removed immediate re-check due to Vodafone API caching delays which caused false "Fake Success" alarms.
      // If Vodafone returned HTTP success status for the productOrder endpoint, we consider it a true success.

      const executionTimeMs = Date.now() - startTime;
      
      FlexLogger.info('FlexMigrationService', 'Activation completed successfully', { executionTimeMs });
      onProgress?.('completed');
      
      return {
        isSuccessful: true,
        bundle,
        response: {
          success: true,
          transactionId,
          timestamp: new Date().toISOString()
        },
        executionTimeMs
      };

    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;
      FlexLogger.error('FlexMigrationService', 'Activation failed', { error, executionTimeMs });
      
      let errorCode = 'ACTIVATION_FAILED';
      let message = error.message;

      // Extract custom error format Code|Message
      if (message.includes('|')) {
        const parts = message.split('|');
        errorCode = parts[0];
        message = parts[1];
      } else {
        const parsedError = FlexErrorParser.parseError(error);
        errorCode = parsedError.code;
        message = 'حدث خطأ أثناء الاتصال: ' + parsedError.message;
      }

      return {
        isSuccessful: false,
        bundle,
        response: {
          success: false,
          transactionId,
          timestamp: new Date().toISOString(),
          errorCode,
          message
        },
        executionTimeMs
      };
    }
  }

  logout() {
    this.sessionManager.clearSession();
    FlexLogger.info('FlexMigrationService', 'User logged out and session cleared');
  }
}
