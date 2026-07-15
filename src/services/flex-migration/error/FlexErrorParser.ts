// src/services/flex-migration/error/FlexErrorParser.ts
import { ApiError } from '../models/FlexModels';

export class FlexErrorParser {
  /**
   * Parses raw network or API responses into structured ApiError objects.
   * Placeholder for future Vodafone API error mappings.
   */
  static parseError(rawError: any): ApiError {
    // Basic mapping structure for future use
    const isNetwork = !rawError?.response;
    const statusCode = rawError?.response?.status;
    const isAuth = statusCode === 401 || statusCode === 403;

    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = 'حدث خطأ غير معروف. يرجى المحاولة لاحقاً.';

    if (isNetwork) {
      errorCode = 'NETWORK_ERROR';
      errorMessage = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.';
    } else if (isAuth) {
      errorCode = 'AUTH_ERROR';
      errorMessage = 'بيانات تسجيل الدخول غير صحيحة أو انتهت الجلسة.';
    } else if (rawError?.response?.data?.error) {
      // Future Vodafone specific parsing goes here
      errorCode = rawError.response.data.error.code || errorCode;
      errorMessage = rawError.response.data.error.message || errorMessage;
    }

    return {
      code: errorCode,
      message: errorMessage,
      details: rawError?.response?.data,
      httpStatusCode: statusCode,
      isNetworkError: isNetwork,
      isAuthError: isAuth
    };
  }

  /**
   * Translates ApiError into user-friendly Arabic messages.
   */
  static getUserFriendlyMessage(error: ApiError): string {
    return error.message;
  }
}
