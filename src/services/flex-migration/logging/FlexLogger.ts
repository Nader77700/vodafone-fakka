// src/services/flex-migration/logging/FlexLogger.ts

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export class FlexLogger {
  /**
   * Internal logging system that sanitizes sensitive data (like passwords or tokens)
   * before logging.
   */
  static log(level: LogLevel, context: string, message: string, data?: any) {
    const sanitizedData = this.sanitize(data);
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      level,
      context,
      message,
      data: sanitizedData
    };

    // Placeholder: In production, this might send to an external logging service
    // For now, it safely logs to console without exposing sensitive info
    if (import.meta.env.MODE !== 'production' || level === 'ERROR') {
      console[level === 'ERROR' ? 'error' : 'log'](`[FlexSystem] ${timestamp} [${level}] [${context}] ${message}`, sanitizedData || '');
    }
  }

  static info(context: string, message: string, data?: any) {
    this.log('INFO', context, message, data);
  }

  static error(context: string, message: string, data?: any) {
    this.log('ERROR', context, message, data);
  }

  static warn(context: string, message: string, data?: any) {
    this.log('WARN', context, message, data);
  }

  static debug(context: string, message: string, data?: any) {
    this.log('DEBUG', context, message, data);
  }

  private static sanitize(data: any): any {
    if (!data) return data;
    
    // Deep clone to avoid mutating original object
    try {
      const cloned = JSON.parse(JSON.stringify(data));
      this.scrubSensitiveKeys(cloned);
      return cloned;
    } catch {
      return '[Unserializable Data]';
    }
  }

  private static scrubSensitiveKeys(obj: any) {
    if (typeof obj !== 'object' || obj === null) return;

    const sensitiveKeys = ['password', 'token', 'accessToken', 'refreshToken', 'pin'];
    
    for (const key in obj) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        obj[key] = '***REDACTED***';
      } else if (typeof obj[key] === 'object') {
        this.scrubSensitiveKeys(obj[key]);
      }
    }
  }
}
