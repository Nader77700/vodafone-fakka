// src/services/flex-migration/config/FlexMigrationConfig.ts

export interface FlexMigrationConfigType {
  timeoutMs: number;
  maxRetries: number;
  headers: Record<string, string>;
  userAgent: string;
  apiVersion: string;
  deviceInfo: {
    os: string;
    appVersion: string;
    model: string;
  };
}

export const FlexMigrationConfig: FlexMigrationConfigType = {
  timeoutMs: 15000,
  maxRetries: 3,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  userAgent: 'VodafoneFakkaPremium/1.0.0 (Android 13; Mobile)',
  apiVersion: 'v1.5',
  deviceInfo: {
    os: 'Android',
    appVersion: '1.0.0',
    model: 'Generic Smartphone'
  }
};
