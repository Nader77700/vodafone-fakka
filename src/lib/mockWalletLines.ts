/**
 * Mock Data — خدمات الخطوط والمحافظ — PHASE 1
 * ⚠️ TEST/DEVELOPMENT DATA ONLY — لا تُستخدم في Production
 * لا تحتوي على بيانات أشخاص حقيقية.
 */

import type { WalletLinesResult, WalletInfo, LineInfo } from './walletLinesInterfaces';

// ── Mock Scenarios ────────────────────────────────────────────────

/** Scenario E: Wallets Loaded */
export const MOCK_WALLETS_LOADED: WalletInfo[] = [
  {
    carrier: 'vodafone',
    carrierName: 'Vodafone',
    registeredName: 'أحمد محمد [TEST]',
    walletCount: 1,
    walletNumbers: ['01XXXXXXX01'],
    registrationDate: '2023-05-15',
    walletStatus: 'نشط',
    availability: 'loaded',
  },
  {
    carrier: 'orange',
    carrierName: 'Orange',
    registeredName: 'أحمد محمد [TEST]',
    walletCount: 1,
    walletNumbers: ['01XXXXXXX02'],
    registrationDate: '2024-01-20',
    walletStatus: 'نشط',
    availability: 'loaded',
  },
  {
    carrier: 'etisalat',
    carrierName: 'Etisalat (e&)',
    availability: 'empty',
  },
  {
    carrier: 'we',
    carrierName: 'WE',
    availability: 'unavailable',
  },
];

/** Scenario F: Lines Loaded */
export const MOCK_LINES_LOADED: LineInfo[] = [
  {
    carrier: 'vodafone',
    carrierName: 'Vodafone',
    lineCount: 2,
    lineNumbers: ['010XXXXXXX1', '010XXXXXXX2'],
    serviceStatus: 'نشط',
    availability: 'loaded',
  },
  {
    carrier: 'orange',
    carrierName: 'Orange',
    lineCount: 1,
    lineNumbers: ['012XXXXXXX1'],
    serviceStatus: 'نشط',
    availability: 'loaded',
  },
  {
    carrier: 'etisalat',
    carrierName: 'Etisalat (e&)',
    lineCount: 0,
    lineNumbers: [],
    availability: 'empty',
  },
  {
    carrier: 'we',
    carrierName: 'WE',
    availability: 'no_response',
  },
];

/** Scenario E+F: Full Success Result */
export const MOCK_FULL_RESULT: WalletLinesResult = {
  wallets: MOCK_WALLETS_LOADED,
  lines: MOCK_LINES_LOADED,
  fetchedAt: new Date().toISOString(),
};

/** Scenario G: Empty Result */
export const MOCK_EMPTY_RESULT: WalletLinesResult = {
  wallets: [
    { carrier: 'vodafone', carrierName: 'Vodafone', availability: 'empty' },
    { carrier: 'orange', carrierName: 'Orange', availability: 'empty' },
    { carrier: 'etisalat', carrierName: 'Etisalat (e&)', availability: 'empty' },
    { carrier: 'we', carrierName: 'WE', availability: 'empty' },
  ],
  lines: [
    { carrier: 'vodafone', carrierName: 'Vodafone', availability: 'empty' },
    { carrier: 'orange', carrierName: 'Orange', availability: 'empty' },
    { carrier: 'etisalat', carrierName: 'Etisalat (e&)', availability: 'empty' },
    { carrier: 'we', carrierName: 'WE', availability: 'empty' },
  ],
  fetchedAt: new Date().toISOString(),
};

/** Scenario J: Wallets OK — Lines Fail */
export const MOCK_PARTIAL_WALLETS_OK: WalletLinesResult = {
  wallets: MOCK_WALLETS_LOADED,
  lines: [
    { carrier: 'vodafone', carrierName: 'Vodafone', availability: 'conn_error' },
    { carrier: 'orange', carrierName: 'Orange', availability: 'conn_error' },
    { carrier: 'etisalat', carrierName: 'Etisalat (e&)', availability: 'conn_error' },
    { carrier: 'we', carrierName: 'WE', availability: 'conn_error' },
  ],
  fetchedAt: new Date().toISOString(),
};

/** Scenario K: Lines OK — Wallets Fail */
export const MOCK_PARTIAL_LINES_OK: WalletLinesResult = {
  wallets: [
    { carrier: 'vodafone', carrierName: 'Vodafone', availability: 'conn_error' },
    { carrier: 'orange', carrierName: 'Orange', availability: 'conn_error' },
    { carrier: 'etisalat', carrierName: 'Etisalat (e&)', availability: 'conn_error' },
    { carrier: 'we', carrierName: 'WE', availability: 'conn_error' },
  ],
  lines: MOCK_LINES_LOADED,
  fetchedAt: new Date().toISOString(),
};

/** تحديد الـ Scenario من اسمه */
export type MockScenario =
  | 'A_LOGIN_SUCCESS'
  | 'B_LOGIN_FAILURE'
  | 'C_NATIONAL_ID_ERROR'
  | 'D_LOADING'
  | 'E_WALLETS_LOADED'
  | 'F_LINES_LOADED'
  | 'G_EMPTY'
  | 'H_SERVICE_UNAVAILABLE'
  | 'I_NETWORK_ERROR'
  | 'J_PARTIAL_WALLETS_OK'
  | 'K_PARTIAL_LINES_OK';

export const MOCK_SCENARIO_LABELS: Record<MockScenario, string> = {
  A_LOGIN_SUCCESS:       'A — تسجيل دخول ناجح',
  B_LOGIN_FAILURE:       'B — فشل تسجيل الدخول',
  C_NATIONAL_ID_ERROR:   'C — خطأ في الرقم القومي',
  D_LOADING:             'D — جاري التحميل',
  E_WALLETS_LOADED:      'E — محافظ محملة',
  F_LINES_LOADED:        'F — خطوط محملة',
  G_EMPTY:               'G — نتيجة فارغة',
  H_SERVICE_UNAVAILABLE: 'H — الخدمة غير متاحة',
  I_NETWORK_ERROR:       'I — خطأ شبكة',
  J_PARTIAL_WALLETS_OK:  'J — محافظ تعمل / خطوط لا',
  K_PARTIAL_LINES_OK:    'K — خطوط تعمل / محافظ لا',
};
