// src/services/flex-migration/security/FlexSessionManager.ts
import { FlexSecureStorage, StoredSession } from './FlexSecureStorage';
import { FlexLogger } from '../logging/FlexLogger';
import { LoginResponse } from '../models/FlexModels';

export class FlexSessionManager {
  private currentSession: StoredSession | null = null;

  constructor() {
    this.currentSession = FlexSecureStorage.getSession();
  }

  /**
   * Initializes session from login response
   */
  createSession(msisdn: string, response: LoginResponse): boolean {
    if (!response.success || !response.accessToken) {
      return false;
    }

    const expiresInMs = (response.expiresIn || 3600) * 1000;
    const expiresAt = Date.now() + expiresInMs;

    this.currentSession = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAt,
      msisdn
    };

    FlexSecureStorage.saveSession(this.currentSession);
    FlexLogger.info('FlexSessionManager', 'Session created successfully');
    return true;
  }

  /**
   * Checks if session exists and is still valid (not expired)
   */
  isValid(): boolean {
    if (!this.currentSession) {
      return false;
    }

    const isExpired = Date.now() >= this.currentSession.expiresAt;
    if (isExpired) {
      FlexLogger.info('FlexSessionManager', 'Session expired');
      this.clearSession();
      return false;
    }

    return true;
  }

  getAccessToken(): string | null {
    if (!this.isValid()) return null;
    return this.currentSession?.accessToken || null;
  }

  getMsisdn(): string | null {
    return this.currentSession?.msisdn || null;
  }

  clearSession(): void {
    this.currentSession = null;
    FlexSecureStorage.clearSession();
    FlexLogger.info('FlexSessionManager', 'Session cleared');
  }
}
