// src/services/flex-migration/models/FlexModels.ts

export interface LoginRequest {
  msisdn: string;
  password?: string; // Used only in memory, never stored
  deviceId?: string;
}

export interface LoginResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  message?: string;
  errorCode?: string;
}

export interface BundleModel {
  bundleId: string;
  systemId: string;
  productId: string;
  name: string;
  price: number;
  flexCount: number;
  isActive: boolean;
}

export interface ActivationRequest {
  msisdn: string;
  password?: string;
  bundleId: string;
  systemId: string;
  productId: string;
  transactionId: string; // Unique transaction identifier
}

export interface ActivationResponse {
  success: boolean;
  message?: string;
  transactionId: string;
  receiptId?: string;
  timestamp: string;
  errorCode?: string;
}

export type ActivationProgressStep = 
  | 'login'
  | 'verifying'
  | 'reading_systems'
  | 'matching_system'
  | 'sending_request'
  | 'waiting_response'
  | 'analyzing_result'
  | 'completed';

export interface ActivationResult {
  isSuccessful: boolean;
  bundle: BundleModel;
  response: ActivationResponse;
  executionTimeMs: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  httpStatusCode?: number;
  isNetworkError: boolean;
  isAuthError: boolean;
}
