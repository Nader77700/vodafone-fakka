/**
 * pendingOpsQueue.ts
 * ==================
 * نظام Transaction Queue احترافي لمنع فقدان العمليات عند انقطاع الإنترنت.
 *
 * المبادئ:
 * 1. كل عملية تُحفظ محلياً (localStorage) بـ UUID فريد قبل أي اتصال.
 * 2. بعد تأكيد السيرفر تُحذف من القائمة.
 * 3. عند رجوع الإنترنت تُزامَن تلقائياً — مرة واحدة فقط (idempotent).
 * 4. منع التكرار: نفس UUID لا يُرسَل مرتين.
 * 5. السيرفر هو المصدر الوحيد للحقيقة — أي عملية غير مؤكدة منه = غير مكتملة.
 */

import { supabase } from '@/db/supabase';

// ── أنواع ──────────────────────────────────────────────────────────────────

export type PendingOpStatus = 'pending' | 'syncing' | 'synced' | 'failed_permanent';

export interface PendingOperation {
  uuid: string;               // معرّف فريد — يمنع التكرار
  created_at: string;         // وقت البدء (ISO)
  status: PendingOpStatus;
  retry_count: number;        // عدد محاولات المزامنة
  last_attempt_at?: string;
  // بيانات العملية الكاملة
  user_id: string;
  phone_number: string;
  card_type: string;
  card_data: Record<string, unknown>;
  category: string;
  amount: number;
  charge_success: boolean;    // هل نجح الشحن الفعلي؟
  error_message: string | null;
  performed_at: string;
  api_response: string | null;
  operation_source: string;
}

// ── Storage Key ────────────────────────────────────────────────────────────
const STORAGE_KEY = 'vf_pending_ops_v2';
const MAX_RETRIES  = 5;
const MAX_AGE_MS   = 7 * 24 * 60 * 60 * 1000; // 7 أيام

// ── CRUD ───────────────────────────────────────────────────────────────────

function loadQueue(): PendingOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PendingOperation[];
    // حذف العمليات القديمة جداً (> 7 أيام)
    const cutoff = Date.now() - MAX_AGE_MS;
    return arr.filter(op => new Date(op.created_at).getTime() > cutoff);
  } catch { return []; }
}

function saveQueue(queue: PendingOperation[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(queue)); } catch { /* storage full */ }
}

/** إضافة عملية جديدة للقائمة قبل أي اتصال */
export function enqueuePendingOp(op: Omit<PendingOperation, 'status' | 'retry_count'>): void {
  const queue = loadQueue();
  // منع التكرار: إذا كان UUID موجوداً بالفعل لا نضيف
  if (queue.some(q => q.uuid === op.uuid)) return;
  queue.push({ ...op, status: 'pending', retry_count: 0 });
  saveQueue(queue);
}

/** تحديث حالة عملية بعد تأكيد السيرفر */
export function markOpSynced(uuid: string): void {
  const queue = loadQueue().filter(op => op.uuid !== uuid);
  saveQueue(queue);
}

/** تحديث حالة عملية بعد فشل مؤقت */
function markOpFailed(uuid: string, permanent = false): void {
  const queue = loadQueue().map(op => {
    if (op.uuid !== uuid) return op;
    return {
      ...op,
      status: (permanent || op.retry_count + 1 >= MAX_RETRIES)
        ? 'failed_permanent' as PendingOpStatus
        : 'pending' as PendingOpStatus,
      retry_count: op.retry_count + 1,
      last_attempt_at: new Date().toISOString(),
    };
  });
  saveQueue(queue);
}

/** عدد العمليات المعلقة */
export function getPendingCount(): number {
  return loadQueue().filter(op => op.status === 'pending').length;
}

/** جلب قائمة العمليات المعلقة (للعرض) */
export function getPendingOps(): PendingOperation[] {
  return loadQueue();
}

// ── Real Network Check ─────────────────────────────────────────────────────

/**
 * فحص الاتصال الحقيقي بالإنترنت — ليس navigator.onLine.
 * navigator.onLine يُرجع true حتى لو الشبكة لا تصل للسيرفر.
 * نستخدم ping سريع لـ Supabase بـ timeout 4 ثواني.
 */
export async function checkRealConnectivity(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const pingUrl = `${supabaseUrl}/rest/v1/`;
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(pingUrl, {
      method: 'HEAD',
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string },
    });
    clearTimeout(id);
    return res.status < 500;
  } catch { return false; }
}

// ── Auto-Sync Engine ───────────────────────────────────────────────────────

let isSyncing = false;

/**
 * مزامنة جميع العمليات المعلقة مع السيرفر.
 * - تعمل تلقائياً عند رجوع الإنترنت.
 * - تمنع التشغيل المتوازي.
 * - كل عملية تُرسَل مرة واحدة فقط (idempotent via uuid في metadata).
 */
export async function syncPendingOps(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };
  isSyncing = true;

  let synced = 0;
  let failed = 0;

  try {
    const queue = loadQueue().filter(op => op.status === 'pending');
    if (queue.length === 0) return { synced: 0, failed: 0 };

    const connected = await checkRealConnectivity();
    if (!connected) return { synced: 0, failed: 0 };

    for (const op of queue) {
      try {
        // تحقق هل تم تسجيل هذه العملية بالفعل (idempotency check)
        const { data: existing } = await supabase
          .from('operations')
          .select('id')
          .eq('user_id', op.user_id)
          .contains('card_data', { tx_uuid: op.uuid })
          .maybeSingle();

        if (existing) {
          // العملية موجودة بالفعل في DB — فقط احذفها من القائمة
          markOpSynced(op.uuid);
          synced++;
          continue;
        }

        // إرسال العملية للسيرفر
        const { error: insertErr } = await supabase.from('operations').insert({
          user_id:          op.user_id,
          phone_number:     op.phone_number,
          card_type:        op.card_type,
          card_data:        { ...op.card_data, tx_uuid: op.uuid, synced_at: new Date().toISOString() },
          category:         op.category,
          amount:           op.amount,
          status:           op.charge_success ? 'success' : 'failed',
          error_message:    op.error_message,
          performed_at:     op.performed_at,
          api_response:     op.api_response,
          operation_source: op.operation_source,
        });

        if (!insertErr) {
          markOpSynced(op.uuid);
          synced++;
        } else {
          markOpFailed(op.uuid, false);
          failed++;
        }
      } catch {
        markOpFailed(op.uuid, false);
        failed++;
      }
    }
  } finally {
    isSyncing = false;
  }

  return { synced, failed };
}

// ── Network Recovery Listener ──────────────────────────────────────────────

let listenerAttached = false;

/**
 * تسجيل مستمع رجوع الإنترنت — يُشغَّل مرة واحدة فقط.
 * عند اكتشاف اتصال → يشغّل المزامنة تلقائياً.
 */
export function attachNetworkRecoveryListener(
  onSync?: (result: { synced: number; failed: number }) => void
): void {
  if (listenerAttached) return;
  listenerAttached = true;

  window.addEventListener('online', async () => {
    // انتظر 2 ثانية للتأكد من استقرار الاتصال
    await new Promise(r => setTimeout(r, 2000));
    const result = await syncPendingOps();
    if (result.synced > 0 && onSync) onSync(result);
  });
}
