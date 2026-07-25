// src/services/flex-migration/network/FlexNetwork.ts
import { FlexMigrationConfig } from '../config/FlexMigrationConfig';
import { FlexLogger } from '../logging/FlexLogger';
import { FlexErrorParser } from '../error/FlexErrorParser';

/**
 * Request Builder
 */
export class FlexRequestBuilder {
  private url: string;
  private method: string = 'GET';
  private headers: Record<string, string> = { ...FlexMigrationConfig.headers };
  private body: any = null;

  constructor(endpoint: string) {
    this.url = endpoint; // Placeholder base URL would be prefixed here
    this.headers['User-Agent'] = FlexMigrationConfig.userAgent;
    this.headers['X-App-Version'] = FlexMigrationConfig.apiVersion;
  }

  setMethod(method: 'GET' | 'POST' | 'PUT' | 'DELETE') {
    this.method = method;
    return this;
  }

  setBody(body: any) {
    this.body = body;
    return this;
  }

  setAuthToken(token: string) {
    this.headers['Authorization'] = `Bearer ${token}`;
    return this;
  }

  build(): RequestInit & { url: string } {
    return {
      url: this.url,
      method: this.method,
      headers: this.headers,
      body: this.body ? JSON.stringify(this.body) : undefined,
    };
  }
}

/**
 * Timeout Policy
 */
export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('REQUEST_TIMEOUT'));
    }, timeoutMs);

    promise
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

/**
 * Retry Policy Manager
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  retries: number = FlexMigrationConfig.maxRetries
): Promise<T> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;
      FlexLogger.warn('FlexNetwork', `Attempt ${attempt} failed`, { error: error.message });
      if (attempt >= retries || !isRetryableError(error)) {
        throw error;
      }
      // Exponential backoff
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error('MAX_RETRIES_EXCEEDED');
};

const isRetryableError = (error: any): boolean => {
  if (error.message === 'REQUEST_TIMEOUT') return true;
  // Can add specific HTTP status codes here (e.g., 502, 503, 504)
  return false;
};

/**
 * API Client Core
 */
export class FlexApiClient {
  static async execute<T>(requestBuilder: FlexRequestBuilder): Promise<T> {
    const req = requestBuilder.build();
    const startTime = Date.now();
    
    try {
      FlexLogger.debug('FlexApiClient', `Executing ${req.method} ${req.url}`);
      
      const operation = async () => {
        const response = await fetch(req.url, req as RequestInit);
        const data = await response.json();
        
        if (!response.ok) {
          throw { response: { status: response.status, data } };
        }
        return data as T;
      };

      const result = await withRetry(
        () => withTimeout(operation(), FlexMigrationConfig.timeoutMs)
      );

      const executionTime = Date.now() - startTime;
      FlexLogger.info('FlexApiClient', `Request successful`, { executionTimeMs: executionTime });
      
      return result;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      FlexLogger.error('FlexApiClient', `Request failed`, { executionTimeMs: executionTime, error });
      throw FlexErrorParser.parseError(error);
    }
  }
}
