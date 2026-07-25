// src/services/flex-migration/security/FlexValidator.ts

export class FlexValidator {
  /**
   * Validates Egyptian MSISDN (Vodafone format).
   */
  static isValidVodafoneNumber(msisdn: string): boolean {
    if (!msisdn) return false;
    const cleanNumber = msisdn.replace(/\D/g, '');
    // Egyptian Vodafone numbers typically start with 010 and are 11 digits long
    const vodafoneRegex = /^010\d{8}$/;
    return vodafoneRegex.test(cleanNumber);
  }

  /**
   * Validates Ana Vodafone password constraints.
   * Placeholder: Minimum length 6, typically alphanumeric.
   */
  static isValidPassword(password: string): boolean {
    if (!password) return false;
    return password.length >= 6 && password.length <= 50;
  }

  /**
   * Validates required activation data before any network request.
   */
  static validateActivationPayload(msisdn: string, bundleId: string): { isValid: boolean; error?: string } {
    if (!this.isValidVodafoneNumber(msisdn)) {
      return { isValid: false, error: 'رقم الهاتف غير صحيح. يرجى إدخال رقم فودافون صالح.' };
    }
    
    if (!bundleId || bundleId.trim() === '') {
      return { isValid: false, error: 'معرف الباقة غير صحيح.' };
    }

    return { isValid: true };
  }
}
