// ── Duplicate Notification Guard ─────────────────────────────────────────
// يمنع عرض/تخزين نفس الإشعار أكثر من مرة خلال فترة زمنية قصيرة
// يعتمد على: messageId · notificationId · collapseKey · hash(title+body)
// الحفظ: sessionStorage لضمان البقاء عند Resume من الخلفية

import { notifLog } from './notificationRouter';

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 دقائق
const STORAGE_KEY     = 'vfp_notif_seen';

interface SeenEntry { ts: number; }
type SeenMap = Record<string, SeenEntry>;

/** تحميل الـ Map من sessionStorage */
function loadSeen(): Map<string, SeenEntry> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as SeenMap;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

/** حفظ الـ Map في sessionStorage */
function saveSeen(map: Map<string, SeenEntry>): void {
  try {
    const obj: SeenMap = {};
    map.forEach((v, k) => { obj[k] = v; });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* تجاهل */ }
}

/** hash بسيط لـ title+body */
function quickHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** توليد مفتاح فريد من بيانات الإشعار */
function buildKey(params: {
  messageId?:      string;
  notificationId?: string | number;
  collapseKey?:    string;
  title?:          string;
  body?:           string;
  sentTime?:       number | string;
}): string {
  const candidates: string[] = [];
  if (params.messageId)      candidates.push(`mid:${params.messageId}`);
  if (params.notificationId) candidates.push(`nid:${params.notificationId}`);
  if (params.collapseKey)    candidates.push(`ck:${params.collapseKey}`);
  const titleBody = `${params.title ?? ''}|${params.body ?? ''}`;
  if (titleBody !== '|') candidates.push(`tb:${quickHash(titleBody)}`);
  return candidates.join('__') || 'unknown';
}

/** تنظيف المفاتيح القديمة */
function evictExpired(map: Map<string, SeenEntry>): void {
  const now = Date.now();
  for (const [key, entry] of map.entries()) {
    if (now - entry.ts > DEDUP_WINDOW_MS) map.delete(key);
  }
}

/**
 * تحقق من أن الإشعار جديد (لم يصل مسبقاً).
 * إذا كان جديداً → يُضاف للذاكرة ويُعاد true.
 * إذا كان مكرراً → يُعاد false.
 */
export function isNewNotification(params: {
  messageId?:      string;
  notificationId?: string | number;
  collapseKey?:    string;
  title?:          string;
  body?:           string;
  sentTime?:       number | string;
}): boolean {
  const seen = loadSeen();
  evictExpired(seen);
  const key = buildKey(params);
  const now = Date.now();

  if (seen.has(key)) {
    const entry = seen.get(key)!;
    const ageSec = ((now - entry.ts) / 1000).toFixed(1);
    notifLog('Duplicate Blocked', { key, ageSec: `${ageSec}s ago` });
    saveSeen(seen); // حفظ بعد evict
    return false;
  }

  seen.set(key, { ts: now });
  saveSeen(seen);
  notifLog('Notification Received (new)', { key });
  return true;
}
