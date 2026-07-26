/**
 * NetworkManager v2 — مراقب الشبكة + Request Deduplicator + جودة الاتصال
 * ──────────────────────────────────────────────────────────────────────────
 * المشاكل المُصلَحة:
 * - تكرار الطلبات على شبكة ضعيفة (duplicate requests)
 * - تكرار رسائل Toast عند انقطاع الإنترنت
 * - تكرار العمليات (double submit)
 * - فشل الطلبات بدون retry على شبكات 3G/بطيئة
 */
import { useEffect, useRef, useState, useCallback } from 'react';

// ─── أنواع ────────────────────────────────────────────────────────────────
export type NetworkQuality = 'good' | 'poor' | 'offline';

interface NetworkState {
  isOnline: boolean;
  quality: NetworkQuality;
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
}

// ─── قراءة حالة الشبكة الحالية من Connection API ─────────────────────────
function getNetworkState(): NetworkState {
  if (typeof navigator === 'undefined') return { isOnline: true, quality: 'good' };

  const isOnline = navigator.onLine;
  if (!isOnline) return { isOnline: false, quality: 'offline' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
  const effectiveType: string = conn?.effectiveType ?? '4g';
  const rtt: number           = conn?.rtt   ?? 0;
  const downlink: number      = conn?.downlink ?? 10;

  let quality: NetworkQuality = 'good';
  if (!isOnline || effectiveType === 'slow-2g' || rtt > 600 || downlink < 0.3) {
    quality = 'offline';
  } else if (effectiveType === '2g' || effectiveType === '3g' || rtt > 300 || downlink < 1.5) {
    quality = 'poor';
  }

  return { isOnline, quality, effectiveType, rtt, downlink };
}

// ─── Adaptive Timeout حسب جودة الشبكة ────────────────────────────────────
export function getAdaptiveTimeout(quality: NetworkQuality): number {
  if (quality === 'offline') return 0;
  if (quality === 'poor')    return 25_000; // شبكة ضعيفة: 25 ثانية
  return 15_000;                             // شبكة جيدة: 15 ثانية
}

// ─── Request Deduplicator — منع تكرار الطلبات المتوازية ─────────────────
const _pendingRequests = new Map<string, Promise<unknown>>();

export function deduplicateRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = _pendingRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => _pendingRequests.delete(key));
  _pendingRequests.set(key, promise);
  return promise;
}

// ─── Toast Deduplicator — منع تكرار الرسائل خلال فترة زمنية ─────────────
const _shownToasts = new Map<string, number>();
const TOAST_DEBOUNCE_MS = 4000; // 4 ثوانٍ بين كل رسالة مكررة

export function shouldShowToast(key: string, debounceMs = TOAST_DEBOUNCE_MS): boolean {
  const now  = Date.now();
  const last = _shownToasts.get(key) ?? 0;
  if (now - last < debounceMs) return false;
  _shownToasts.set(key, now);
  return true;
}

/** مسح debounce مفتاح معين — يُستخدم بعد إغلاق Dialog أو تغيير الحالة */
export function clearToastKey(key: string): void {
  _shownToasts.delete(key);
}

// ─── Order Deduplicator — منع إرسال العملية مرتين ────────────────────────
const _submittedOrders = new Map<string, number>(); // key → timestamp

/** يسجّل العملية. يعيد true إذا كانت جديدة، false إذا كانت مكررة */
export function markOrderSubmitted(key: string, ttlMs = 30_000): boolean {
  const now  = Date.now();
  const last = _submittedOrders.get(key);
  if (last && now - last < ttlMs) return false; // مكررة
  _submittedOrders.set(key, now);
  // تنظيف تلقائي
  setTimeout(() => _submittedOrders.delete(key), ttlMs + 5_000);
  return true;
}

export function clearOrderKey(key: string): void {
  _submittedOrders.delete(key);
}

// ─── Notification Deduplicator — منع ظهور إشعار مرتين ──────────────────
const _shownNotifications = new Set<string>();

export function shouldShowNotification(key: string): boolean {
  if (_shownNotifications.has(key)) return false;
  _shownNotifications.add(key);
  // تنظيف بعد 10 دقائق
  setTimeout(() => _shownNotifications.delete(key), 10 * 60_000);
  return true;
}

// ─── useNetworkManager hook ────────────────────────────────────────────────
export function useNetworkManager() {
  const [state, setState] = useState<NetworkState>(getNetworkState);
  const syncCallbackRef   = useRef<(() => void) | null>(null);
  const prevOnlineRef     = useRef<boolean>(getNetworkState().isOnline);

  const updateState = useCallback(() => {
    const next = getNetworkState();
    setState(prev => {
      // عند عودة الإنترنت: نُشغّل المزامنة بعد 800ms (انتظار استقرار الشبكة)
      if (!prev.isOnline && next.isOnline && syncCallbackRef.current) {
        setTimeout(() => syncCallbackRef.current?.(), 800);
      }
      prevOnlineRef.current = next.isOnline;
      return next;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('online',  updateState);
    window.addEventListener('offline', updateState);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection;
    conn?.addEventListener?.('change', updateState);

    return () => {
      window.removeEventListener('online',  updateState);
      window.removeEventListener('offline', updateState);
      conn?.removeEventListener?.('change', updateState);
    };
  }, [updateState]);

  /** سجّل callback يُستدعى تلقائياً عند عودة الإنترنت */
  const onReconnect = useCallback((cb: () => void) => {
    syncCallbackRef.current = cb;
  }, []);

  return { ...state, onReconnect };
}

