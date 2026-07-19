// src/services/flex-migration/security/FlexSecureStorage.ts
import { FlexLogger } from '../logging/FlexLogger';

const STORAGE_KEY = '@vfp_flex_session';

export interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Timestamp
  msisdn: string;
}

export class FlexSecureStorage {
  /**
   * Saves session securely. 
   * NOTE: In a real mobile app, this should use SecureStore/Keychain.
   * Here we use localStorage as a fallback for the web prototype.
   * NO PASSWORDS ARE EVER SAVED HERE.
   */
  static saveSession(session: StoredSession): boolean {
    try {
      // Validate no passwords exist in the object
      if ('password' in session) {
        throw new Error('Security Violation: Attempted to store password');
      }
      
      const serialized = JSON.stringify(session);
      // In production web, this should ideally be encrypted or handled via HttpOnly cookies
      // Using btoa as a simple obfuscation for the prototype
      localStorage.setItem(STORAGE_KEY, btoa(serialized));
      return true;
    } catch (error) {
      FlexLogger.error('FlexSecureStorage', 'Failed to save session', error);
      return false;
    }
  }

  static getSession(): StoredSession | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      
      const parsed = JSON.parse(atob(data)) as StoredSession;
      return parsed;
    } catch (error) {
      FlexLogger.error('FlexSecureStorage', 'Failed to read session', error);
      return null;
    }
  }

  static clearSession(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      FlexLogger.error('FlexSecureStorage', 'Failed to clear session', error);
    }
  }
}
