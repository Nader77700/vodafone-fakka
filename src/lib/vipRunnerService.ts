// ── VIP Persistent Background Runner Service ──
// Singleton engine that executes VIP cycles continuously even when navigating away from the page,
// switching tabs, or when the screen is locked/backgrounded.
// Maintains global state, live logs, step trackers, and database persistence.

import { supabase } from '@/db/supabase';
import {
  executeVipRunSingleCycleStream,
  executeVipCheckStatus,
  executeVipReturnChildMixes,
  executeVipRenewBundle,
  executeVipChangePlan,
  updateVipAutomationSettings,
  invokeVipExecutor,
  executeSmartEjectionSequence,
  VipExecutionLog,
  VipExecutionResponse,
} from '@/lib/vipApi';
import {
  enableVipBackgroundExecution,
  disableVipBackgroundExecution,
  showVipNotification,
  showVipPersistentNotification,
  dismissVipPersistentNotification,
  sendVipRemotePushNotification,
  requestVipNotificationPermission,
} from '@/lib/vipBackgroundManager';

// Helper to extract balances and plan in real-time from execution logs
export function parseBalancesFromLog(message: string): {
  ownerMix?: number;
  childMix?: number;
  ownerPlan?: string;
} {
  const res: { ownerMix?: number; childMix?: number; ownerPlan?: string } = {};
  if (!message) return res;

  // Remove commas for clean integer parsing: "66,100" -> "66100"
  const clean = message.replace(/,/g, '');

  // 1. "رجعنا للأونر | رصيده الآن: 66100 ميكس"
  const returnMatch = clean.match(/رجعنا للأونر\s*\|\s*رصيده(?: الفعلي)? الآن:\s*(\d+)\s*ميكس/);
  if (returnMatch) {
    res.ownerMix = parseInt(returnMatch[1], 10);
    res.childMix = 0; // After recovery, child is cleared
  }

  // 1.0 "فحص الأونر المباشر: النظام (...) | الميكسات الحالية: 72258"
  const directOwnerMatch = clean.match(/فحص الأونر المباشر.*?الميكسات الحالية:\s*\(?(\d+)\)?/);
  if (directOwnerMatch) {
    res.ownerMix = parseInt(directOwnerMatch[1], 10);
  }

  // 1.01 "فحص رصيد البداية المباشر: الأونر (72258 ميكس) | الفرد (1300 ميكس)"
  const startBothMatch = clean.match(/فحص رصيد البداية المباشر.*?الأونر\s*\(?(\d+)\)?\s*ميكس.*?الفرد\s*\(?(\d+)\)?\s*ميكس/);
  if (startBothMatch) {
    res.ownerMix = parseInt(startBothMatch[1], 10);
    res.childMix = parseInt(startBothMatch[2], 10);
  }

  // 1.02 "فحص قطعي بعد التحويل: رصيد الأونر المتبقي: (0 ميكس) | رصيد الفرد الحالي: (73450 ميكس)"
  const postTransferMatch = clean.match(/فحص قطعي بعد التحويل.*?رصيد الأونر.*?\(?(\d+)\)?\s*ميكس.*?رصيد الفرد.*?\(?(\d+)\)?\s*ميكس/);
  if (postTransferMatch) {
    res.ownerMix = parseInt(postTransferMatch[1], 10);
    res.childMix = parseInt(postTransferMatch[2], 10);
  }

  // 1.03 "حساب الفرد جاهز ... | الميكسات الحالية: 1300"
  const childReadyMatch = clean.match(/حساب الفرد جاهز.*?الميكسات الحالية:\s*\(?(\d+)\)?/);
  if (childReadyMatch) {
    res.childMix = parseInt(childReadyMatch[1], 10);
  }

  // 1.04 "تأكيد قطعي: تم إخلاء الأونر وإجمالي رصيد الفرد الكامل الآن: (73450 ميكس)"
  const childTotalConfirmed = clean.match(/تأكيد قطعي.*?إجمالي رصيد الفرد الكامل الآن:\s*\(?(\d+)\)?\s*ميكس/);
  if (childTotalConfirmed) {
    res.childMix = parseInt(childTotalConfirmed[1], 10);
    res.ownerMix = 0;
  }

  // 1.1 "تحديث العدادات اللحظية: الميكسات (70300) أصبحت لدى الفرد (مركونة) | رصيد الأونر الحالي: (800) ميكس"
  const liveSyncMatch = clean.match(/تحديث العدادات اللحظية:\s*الميكسات\s*\(?(\d+)\)?\s*أصبحت لدى الفرد.*?رصيد الأونر الحالي:\s*\(?(\d+)\)?\s*ميكس/);
  if (liveSyncMatch) {
    res.childMix = parseInt(liveSyncMatch[1], 10);
    res.ownerMix = parseInt(liveSyncMatch[2], 10);
  }

  // 1.2 "تحديث العدادات اللحظية: تم استرجاع ميكسات الفرد بالكامل للأونر | رصيد الأونر الآن: (85700) ميكس"
  const liveRecoverMatch = clean.match(/تحديث العدادات اللحظية:\s*تم استرجاع ميكسات الفرد.*?رصيد الأونر الآن:\s*\(?(\d+)\)?\s*ميكس/);
  if (liveRecoverMatch) {
    res.ownerMix = parseInt(liveRecoverMatch[1], 10);
    res.childMix = 0;
  }

  // 1.3 "تأكيد استقرار الميكسات: وصلت (70300) ميكس لحساب الفرد"
  const childArriveMatch = clean.match(/تأكيد استقرار الميكسات:\s*وصلت\s*\(?(\d+)\)?\s*ميكس لحساب الفرد/);
  if (childArriveMatch) {
    res.childMix = parseInt(childArriveMatch[1], 10);
    res.ownerMix = 0; // Transferred away to child
  }

  // 2. "رصيده الآن: 66100 ميكس"
  const ownerNowMatch = clean.match(/رصيده(?: الفعلي)? الآن:\s*(\d+)\s*ميكس/);
  if (ownerNowMatch) {
    res.ownerMix = parseInt(ownerNowMatch[1], 10);
  }

  // 3. "الفرد جاهز ولديه (66100) ميكس مركونة بأمان"
  const childParkedMatch = clean.match(/الفرد جاهز ولديه\s*\(?(\d+)\)?\s*ميكس/);
  if (childParkedMatch) {
    res.childMix = parseInt(childParkedMatch[1], 10);
    res.ownerMix = 0; // Transferred to child
  }

  // 4. "جاري تحويل (66100) ميكس إلى الرقم"
  const transferMatch = clean.match(/جاري تحويل\s*\(?(\d+)\)?\s*ميكس إلى الرقم/);
  if (transferMatch) {
    res.childMix = parseInt(transferMatch[1], 10);
  }

  // 5. "تم تأكيد نزول ميكسات الباقة الجديدة للأونر بنجاح: (6000)"
  const dropMatch = clean.match(/تأكيد نزول ميكسات الباقة الجديدة للأونر بنجاح:\s*\(?(\d+)\)?/);
  if (dropMatch) {
    const droppedVal = parseInt(dropMatch[1], 10);
    if (droppedVal > 0) {
      res.ownerMix = droppedVal;
    }
  }

  // 6. "فحص رصيد الفرد الفعلي بالسيرفر: 0 ميكس متبقية"
  const childServerMatch = clean.match(/فحص رصيد الفرد الفعلي بالسيرفر:\s*(\d+)\s*ميكس/);
  if (childServerMatch) {
    res.childMix = parseInt(childServerMatch[1], 10);
  }

  // 7. "نجح استرجاع (66100) ميكس من الفرد إلى الأونر" أو "تم الاسترجاع اللحظي بنجاح! (66100) ميكس"
  const recoveredMatch = clean.match(/(?:نجح استرجاع|تم الاسترجاع اللحظي بنجاح!)\s*\(?(\d+)\)?\s*ميكس/);
  if (recoveredMatch) {
    res.childMix = 0;
  }

  // 8. Plan extraction: "النظام: حكاية ميكسات 180" or "حالة النظام المعتمد: حكاية ميكسات 180"
  const planMatch = message.match(/(?:النظام:\s*|حالة النظام المعتمد:\s*|ترحيل النظام إلى:\s*)(حكاية ميكسات\s*\d+)/);
  if (planMatch) {
    res.ownerPlan = planMatch[1].trim();
  }

  return res;
}

export interface VipRunnerState {
  sessionId: string;
  isRunning: boolean;
  targetMix: number;
  delaySeconds: number;
  cycleCount: number;
  currentStep: string;
  stepMessage: string;
  logs: VipExecutionLog[];
  lastError: string | null;
  consecutiveErrors: number;
  stopRequested: boolean;
  startedAt: string | null;
  latestOwnerMix?: number;
  latestChildMix?: number;
  latestOwnerPlan?: string;
}

type RunnerListener = (state: VipRunnerState) => void;

class VipRunnerService {
  private states = new Map<string, VipRunnerState>();
  private listeners = new Map<string, Set<RunnerListener>>();
  private loopPromises = new Map<string, Promise<void>>();
  private activeRunningSessions = new Set<string>();
  private lastResumeAttempt = new Map<string, number>();
  private saveTimers = new Map<string, any>();
  private notifyTimers = new Map<string, any>();

  private saveToLocalStorageDebounced(sessionId: string, state: VipRunnerState) {
    if (this.saveTimers.has(sessionId)) return;
    const timer = setTimeout(() => {
      this.saveTimers.delete(sessionId);
      this.saveToLocalStorage(sessionId, state);
    }, 500);
    this.saveTimers.set(sessionId, timer);
  }

  private notifyThrottled(sessionId: string) {
    if (this.notifyTimers.has(sessionId)) return;
    const timer = setTimeout(() => {
      this.notifyTimers.delete(sessionId);
      this.notify(sessionId);
    }, 150);
    this.notifyTimers.set(sessionId, timer);
  }

  constructor() {
    // Restore or sync when initialized
  }

  public getState(sessionId: string): VipRunnerState {
    let state = this.states.get(sessionId);
    if (!state) {
      // Attempt restoring logs and balances from localStorage
      let initialLogs: VipExecutionLog[] = [];
      let savedBalances: any = null;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const rawLogs = window.localStorage.getItem(`vip_terminal_logs_${sessionId}`);
          if (rawLogs) {
            initialLogs = JSON.parse(rawLogs);
          }
          const rawBal = window.localStorage.getItem(`vip_live_balances_${sessionId}`);
          if (rawBal) {
            savedBalances = JSON.parse(rawBal);
          }
        }
      } catch (_) {}

      state = {
        sessionId,
        isRunning: false,
        targetMix: 100000,
        delaySeconds: 60,
        cycleCount: savedBalances?.cycleCount || 0,
        currentStep: 'idle',
        stepMessage: 'جاهز لبدء الدورة',
        logs: initialLogs,
        lastError: null,
        consecutiveErrors: 0,
        stopRequested: false,
        startedAt: null,
        latestOwnerMix: savedBalances?.ownerMix,
        latestChildMix: savedBalances?.childMix,
        latestOwnerPlan: savedBalances?.ownerPlan,
      };
      this.states.set(sessionId, state);
    }
    return { ...state };
  }

  public clearLogs(sessionId: string): void {
    const state = this.states.get(sessionId);
    if (state) {
      state.logs = [];
      this.notify(sessionId);
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(`vip_terminal_logs_${sessionId}`);
      }
    } catch (_) {}
  }

  public setLogs(sessionId: string, logs: VipExecutionLog[]): void {
    const state = this.states.get(sessionId);
    if (state) {
      state.logs = logs;
      this.notify(sessionId);
    } else {
      const st = this.getState(sessionId);
      st.logs = logs;
      this.states.set(sessionId, st);
      this.notify(sessionId);
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(`vip_terminal_logs_${sessionId}`, JSON.stringify(logs.slice(-200)));
      }
    } catch (_) {}
  }

  public isRunning(sessionId: string): boolean {
    return this.states.get(sessionId)?.isRunning || false;
  }

  public subscribe(sessionId: string, listener: RunnerListener): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(listener);

    // Immediately trigger with current state
    listener(this.getState(sessionId));

    return () => {
      this.listeners.get(sessionId)?.delete(listener);
    };
  }

  private notify(sessionId: string) {
    const state = this.getState(sessionId);
    const set = this.listeners.get(sessionId);
    if (set) {
      set.forEach((fn) => {
        try {
          fn(state);
        } catch (e) {
          console.error('[VipRunnerService] Listener error:', e);
        }
      });
    }
  }

  private saveToLocalStorage(sessionId: string, state: VipRunnerState) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(`vip_terminal_logs_${sessionId}`, JSON.stringify(state.logs.slice(-200)));
        window.localStorage.setItem(
          `vip_live_balances_${sessionId}`,
          JSON.stringify({
            ownerMix: state.latestOwnerMix,
            childMix: state.latestChildMix,
            ownerPlan: state.latestOwnerPlan,
            cycleCount: state.cycleCount,
            updatedAt: new Date().toISOString(),
          })
        );
      }
    } catch (_) {}
  }

  public addLog(sessionId: string, message: string, level: 'info' | 'success' | 'warn' | 'error') {
    const state = this.states.get(sessionId);
    if (!state) return;

    const time = new Date().toLocaleTimeString('ar-EG', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    state.logs = [...state.logs.slice(-299), { time, level, message }];

    const parsed = parseBalancesFromLog(message);
    if (parsed.ownerMix !== undefined && parsed.ownerMix > 0) {
      state.latestOwnerMix = parsed.ownerMix;
    }
    if (parsed.childMix !== undefined) state.latestChildMix = parsed.childMix;
    if (parsed.ownerPlan) state.latestOwnerPlan = parsed.ownerPlan;

    this.saveToLocalStorageDebounced(sessionId, state);
    this.notifyThrottled(sessionId);
  }

  /**
   * Start or resume background execution loop for a session
   */
  public async startLoop(sessionId: string, targetMix: number, delaySeconds: number): Promise<void> {
    const existing = this.getState(sessionId);
    // If a loop was marked running but stop was requested or promise died, force-reset and proceed
    existing.stopRequested = false;
    this.loopPromises.delete(sessionId);

    const state: VipRunnerState = {
      ...existing,
      sessionId,
      isRunning: true,
      targetMix,
      delaySeconds,
      stopRequested: false,
      startedAt: new Date().toISOString(),
      currentStep: 'parking',
      stepMessage: 'جاري بدء دورة اتصالات VIP التلقائية في الخلفية...',
      lastError: null,
      consecutiveErrors: 0,
    };
    this.states.set(sessionId, state);
    this.notify(sessionId);

    // Keep screen awake & background worker alive
    requestVipNotificationPermission().catch(() => {});
    await enableVipBackgroundExecution().catch(() => {});

    // Save active state to localStorage so it survives app minimize / restart
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          `vip_active_loop_${sessionId}`,
          JSON.stringify({
            isRunning: true,
            targetMix,
            delaySeconds,
            timestamp: Date.now(),
          })
        );
      }
    } catch (_) {}

    // Sync DB status to active
    try {
      await updateVipAutomationSettings(true, targetMix, null, 'save', sessionId, delaySeconds);
    } catch (e) {
      console.warn('[VipRunnerService] DB update warning:', e);
    }

    this.addLog(sessionId, `==================================================`, 'info');
    this.addLog(
      sessionId,
      `[🚀] تم تشغيل محرك الأتمتة التلقائية (الهدف: ${targetMix.toLocaleString('ar-EG')} ميكس | الانتظار: ${delaySeconds}ث).`,
      'success'
    );
    this.addLog(
      sessionId,
      `[🛡️] نظام حماية الميكسات نشط: مراقبة فورية لعدم فقدان أي ميكس والتحقق القطعي من استقرار الرصيد.`,
      'info'
    );

    sendVipRemotePushNotification(
      '🚀 بدأت دورة اتصالات VIP التلقائية',
      `الجلسة نشطة الآن. الهدف: ${targetMix.toLocaleString('ar-EG')} ميكس.`
    ).catch(() => {});

    showVipPersistentNotification(
      sessionId,
      `الهدف: ${targetMix.toLocaleString('ar-EG')} ميكس | الفاصل: ${delaySeconds}ث`
    );

    if (!this.activeRunningSessions.has(sessionId)) {
      const loopPromise = this.executeLoop(sessionId);
      this.loopPromises.set(sessionId, loopPromise);
    }
  }

  /**
   * Request stop
   */
  public async stopLoop(sessionId: string, reason = 'طلب المستخدم'): Promise<void> {
    const state = this.states.get(sessionId);
    if (state) {
      state.stopRequested = true;
      state.isRunning = false;
      state.currentStep = 'idle';
      state.stepMessage = `تم إيقاف الأتمتة (${reason})`;
      this.notify(sessionId);
      this.addLog(sessionId, `[!] تم إيقاف الدورة التلقائية: ${reason}`, 'warn');
    }

    // Clear persistent active loop from localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(`vip_active_loop_${sessionId}`);
      }
    } catch (_) {}

    // Forcefully update DB to stopped state for both operation and worker
    try {
      await supabase
        .from('vip_sessions')
        .update({
          operation_state: 'stopped',
          automation_enabled: false,
          worker_status: 'stopped',
          current_step: 'idle',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    } catch (e) {
      console.warn('[VipRunnerService] DB stop error:', e);
    }

    sendVipRemotePushNotification(
      '⏹️ تم إيقاف دورة اتصالات VIP',
      `توقفت الأتمتة للجلسة: ${reason}`
    ).catch(() => {});

    dismissVipPersistentNotification(sessionId);
    disableVipBackgroundExecution();
  }

  /**
   * Automatically resume background loop if it was interrupted by minimizing or closing app
   */
  public async resumeLoopIfActive(
    sessionId: string,
    fallbackTarget?: number,
    fallbackDelay?: number
  ): Promise<boolean> {
    const existing = this.getState(sessionId);
    if (existing.isRunning) return true;

    // Check if session has a completion flag in localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const completedMark = window.localStorage.getItem(`vip_target_completed_${sessionId}`);
        if (completedMark) {
          window.localStorage.removeItem(`vip_active_loop_${sessionId}`);
          return false;
        }
      }
    } catch (_) {}

    // Verify session in Supabase: never resume if completed, stopped, or paused!
    try {
      const { data: sess } = await supabase
        .from('vip_sessions')
        .select('automation_enabled, operation_state, owner_mix_balance, target_mix_balance, current_step, cycle_delay_seconds, current_cycle')
        .eq('id', sessionId)
        .maybeSingle();

      if (sess) {
        const isTargetReached =
          (sess.owner_mix_balance || 0) >= (sess.target_mix_balance || 50000) &&
          (sess.owner_mix_balance || 0) > 0;

        if (
          !sess.automation_enabled ||
          sess.operation_state === 'completed' ||
          sess.operation_state === 'stopped' ||
          sess.current_step === 'completed' ||
          isTargetReached
        ) {
          // Strictly delete any stale loop state
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(`vip_active_loop_${sessionId}`);
          }
          return false;
        }

        // If the server session is running or active:
        if (
          sess.automation_enabled &&
          (sess.operation_state === 'running' || sess.operation_state === 'active')
        ) {
          const st = this.states.get(sessionId) || this.getState(sessionId);
          st.isRunning = true;
          st.stopRequested = false;
          st.targetMix = sess.target_mix_balance || fallbackTarget || 100000;
          st.delaySeconds = sess.cycle_delay_seconds || fallbackDelay || 20;
          st.cycleCount = sess.current_cycle || 0;
          st.currentStep = (sess.current_step as any) || 'running';
          st.stepMessage = 'الأتمتة السحابية تعمل في الخلفية على السيرفر 24/7...';
          st.latestOwnerMix = sess.owner_mix_balance;
          this.states.set(sessionId, st);
          this.saveToLocalStorage(sessionId, st);
          this.notify(sessionId);
          enableVipBackgroundExecution().catch(() => {});
          showVipPersistentNotification(
            sessionId,
            `الهدف: ${st.targetMix.toLocaleString('ar-EG')} ميكس | الفاصل: ${st.delaySeconds}ث`
          );

          // If loop runner is not already actively running in this JS window, start execution monitor
          if (!this.loopPromises.has(sessionId)) {
            const loopPromise = this.executeLoop(sessionId);
            this.loopPromises.set(sessionId, loopPromise);
          }
          return true;
        }
      }
    } catch (_) {}

    let savedLoop: any = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(`vip_active_loop_${sessionId}`);
        if (raw) savedLoop = JSON.parse(raw);
      }
    } catch (_) {}

    if (savedLoop && savedLoop.isRunning) {
      const age = Date.now() - (savedLoop.timestamp || 0);
      // Valid if less than 12 hours old
      if (age < 12 * 60 * 60 * 1000) {
        // Prevent duplicate spam on multiple rapid visibility triggers
        const lastResume = this.lastResumeAttempt.get(sessionId) || 0;
        if (Date.now() - lastResume < 15000) {
          return true;
        }
        this.lastResumeAttempt.set(sessionId, Date.now());

        this.addLog(
          sessionId,
          `[🔄] استئناف الأتمتة تلقائياً بعد العودة للتطبيق (استعادة من الخلفية)...`,
          'info'
        );
        this.startLoop(
          sessionId,
          savedLoop.targetMix || fallbackTarget || 100000,
          savedLoop.delaySeconds || fallbackDelay || 20
        );
        return true;
      } else {
        try {
          window.localStorage.removeItem(`vip_active_loop_${sessionId}`);
        } catch (_) {}
      }
    }
    return false;
  }

  private isNetworkGlitch(errorText?: string | null): boolean {
    if (!errorText) return false;
    const txt = errorText.toLowerCase();
    return (
      txt.includes('fetch') ||
      txt.includes('network') ||
      txt.includes('abort') ||
      txt.includes('timeout') ||
      txt.includes('failed to fetch') ||
      txt.includes('connection') ||
      txt.includes('load failed') ||
      txt.includes('stream') ||
      txt.includes('offline') ||
      txt.includes('terminated') ||
      txt.includes('signal') ||
      txt.includes('econnreset') ||
      txt.includes('socket') ||
      txt.includes('unexpected end of') ||
      txt.includes('reader has been cancelled')
    );
  }

  private async executeLoop(sessionId: string) {
    if (this.activeRunningSessions.has(sessionId)) {
      console.warn(`[VipRunnerService] Loop already running for session ${sessionId}. Skipping duplicate launch.`);
      return;
    }
    this.activeRunningSessions.add(sessionId);

    try {
      const MAX_NETWORK_RETRIES = 50;

      while (true) {
      const state = this.states.get(sessionId);
      if (!state || state.stopRequested) {
        break;
      }

      state.cycleCount += 1;
      state.currentStep = 'parking';
      state.stepMessage = `جاري تنفيذ الدورة #${state.cycleCount}...`;
      this.notify(sessionId);

      let cycleResult: VipExecutionResponse;
      try {
        cycleResult = await executeVipRunSingleCycleStream(sessionId, {
          onLog: (liveLog) => {
            const st = this.states.get(sessionId);
            if (st) {
              st.logs = [...st.logs.slice(-299), liveLog];

              // Parse balances directly from the streaming log line
              const parsed = parseBalancesFromLog(liveLog.message);
              if (parsed.ownerMix !== undefined && parsed.ownerMix > 0) {
                st.latestOwnerMix = parsed.ownerMix;
              }
              if (parsed.childMix !== undefined) {
                st.latestChildMix = parsed.childMix;
              }
              if (parsed.ownerPlan) {
                st.latestOwnerPlan = parsed.ownerPlan;
              }

              this.saveToLocalStorageDebounced(sessionId, st);
              this.notifyThrottled(sessionId);
            }
          },
          onStep: (stepInfo) => {
            const st = this.states.get(sessionId);
            if (st) {
              st.currentStep = stepInfo.step;
              st.stepMessage = stepInfo.detail || stepInfo.title;

              // Step-based balance adjustments
              if (stepInfo.step === 'recovering' && st.latestChildMix && st.latestChildMix > 0) {
                // When recovering, child will empty out
                st.latestChildMix = 0;
              }

              this.saveToLocalStorage(sessionId, st);
              this.notify(sessionId);
            }
          },
        });
      } catch (err: any) {
        cycleResult = { success: false, error: err?.message || 'خطأ غير معروف في الاتصال' };
      }

      const st = this.states.get(sessionId);
      if (!st || st.stopRequested) break;

      if (cycleResult.skipped_duplicate) {
        st.cycleCount -= 1;
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }

      if (!cycleResult.success) {
        // CRITICAL RECOVERY GUARD: If error happened during migration / while mixes were parked
        // NEVER ABORT! Auto-rescue child mixes and maintain the loop!
        const hasParkedMixes =
          (st.latestChildMix && st.latestChildMix > 0) ||
          st.currentStep === 'waiting_server' ||
          st.currentStep === 'parking';

        if (hasParkedMixes) {
          // ── حلقة المراقبة الصامدة المستمرة حتى تحول النظام ──
          // عند حدوث تأخير من مقسم اتصالات: لا يتم قطع العملية أو عمل تسجيل خروج أو إعادة الدورة من البداية!
          // يظل النظام مراقباً بنشاط وهدوء حتى اعتماد النظام واسترجاع الميكسات فوراً.
          st.currentStep = 'waiting_server';
          st.stepMessage = 'مراقبة مستمرة لتحول النظام واسترجاع الميكسات بأمان...';
          this.notify(sessionId);

          const previousPlan = st.latestOwnerPlan || '';
          let isPlanSwitched = false;
          let pollAttempt = 0;
          let didActivationStep = false;
          const monitoringStartTime = Date.now();

          this.addLog(
            sessionId,
            `[🔒 حماية الرصيد الصارمة] الميكسات تظل محجوزة ومحمية بالكامل لدى الفرد (${st.latestChildMix ? st.latestChildMix.toLocaleString('ar-EG') : 'الرصيد المحفوظ'} ميكس). الدخول في المراقبة المستمرة الصامدة حتى تأكيد ترحيل النظام بالسيرفر دون إعادة تسجيل دخول...`,
            'info'
          );

          while (!isPlanSwitched && !st.stopRequested) {
            pollAttempt++;
            await new Promise((r) => setTimeout(r, 6000));
            if (st.stopRequested) break;

            const elapsedSec = Math.round((Date.now() - monitoringStartTime) / 1000);

            try {
              const statusCheck = (await executeVipCheckStatus(sessionId)) as any;
              const currentPlan = statusCheck?.owner?.plan || statusCheck?.owner_plan || '';
              const childBalance = statusCheck?.child?.mix_balance ?? st.latestChildMix ?? 0;

              if (statusCheck?.child?.mix_balance !== undefined) {
                st.latestChildMix = statusCheck.child.mix_balance;
              }
              if (statusCheck?.owner?.mix_balance !== undefined) {
                st.latestOwnerMix = statusCheck.owner.mix_balance;
              }

              // Determine target plan based on previousPlan
              const targetIsSeven = !previousPlan.includes('270') && !previousPlan.includes('Parent_7');
              const targetPlanName = targetIsSeven ? 'حكاية ميكسات 270' : 'حكاية ميكسات 180';

              // Has the plan switched?
              const planHasChanged =
                (currentPlan && previousPlan && currentPlan !== previousPlan) ||
                (targetIsSeven && (currentPlan.includes('270') || currentPlan.includes('Parent_7'))) ||
                (!targetIsSeven && (currentPlan.includes('180') || currentPlan.includes('Parent_6')));

              if (planHasChanged) {
                isPlanSwitched = true;
                st.latestOwnerPlan = currentPlan;
                this.addLog(
                  sessionId,
                  `[🎉 تأكيد الترحيل بالسيرفر] استجاب مقسم اتصالات وتأكد تحول نظام الأونر إلى (${currentPlan}) بنجاح تام بعد انتظار (${elapsedSec} ث)!`,
                  'success'
                );

                // Instantly recover parked mixes from child to owner
                this.addLog(
                  sessionId,
                  `[⚡ استرجاع فوري لحظي] جاري سحب واسترجاع الميكسات المحمية (${childBalance.toLocaleString('ar-EG')} ميكس) فوراً إلى حساب الأونر...`,
                  'info'
                );

                st.currentStep = 'recovering';
                st.stepMessage = 'استرجاع الميكسات للأونر...';
                this.notify(sessionId);

                const returnRes = await executeVipReturnChildMixes(sessionId, childBalance);
                if (returnRes.success) {
                  this.addLog(
                    sessionId,
                    `[✓ تم الاسترجاع بنجاح] تم استرجاع كامل الميكسات للأونر بنجاح واكتمال الدورة #${st.cycleCount}!`,
                    'success'
                  );
                } else {
                  this.addLog(
                    sessionId,
                    `[!] استجابة أمر الاسترجاع: ${returnRes.error || returnRes.message || 'تم إرسال الأمر'}. فحص الرصيد المحدث...`,
                    'info'
                  );
                }

                // Refresh updated balances
                await new Promise((r) => setTimeout(r, 2000));
                try {
                  const finalCheck = (await executeVipCheckStatus(sessionId)) as any;
                  if (finalCheck?.owner?.mix_balance !== undefined) {
                    st.latestOwnerMix = finalCheck.owner.mix_balance;
                  }
                  if (finalCheck?.child?.mix_balance !== undefined) {
                    st.latestChildMix = finalCheck.child.mix_balance;
                  }
                } catch (_) {}

                st.currentStep = 'cooldown';
                st.stepMessage = `اكتملت الدورة #${st.cycleCount} بنجاح`;
                this.notify(sessionId);
                break;
              }

              // Periodic live pulse log (every 3 polls ~ 18 seconds)
              if (pollAttempt % 3 === 0) {
                this.addLog(
                  sessionId,
                  `[🔄 مراقبة حية مستمرة #${pollAttempt}] استمرار مراقبة مقسم اتصالات (مضى ${elapsedSec} ث) | الحالي: [${currentPlan || 'قيد الانتظار'}] | المطلوب: [${targetPlanName}] - الرصيد محمي بالفرد (${childBalance.toLocaleString('ar-EG')} ميكس)...`,
                  'info'
                );
              }

              // الخطوة التنشيطية: تنفذ مرة واحدة فقط إذا تأخر النظام أكثر من 70 ثانية
              if (!didActivationStep && elapsedSec >= 70) {
                didActivationStep = true;
                this.addLog(
                  sessionId,
                  `[⚡ خطوة تنشيطية واحدة] تأخر اعتماد النظام بالمقسم (مضى ${elapsedSec} ث). جاري تنفيذ تجديد للباقة وتأكيد طلب الترحيل لتنشيط السيرفر...`,
                  'info'
                );
                try {
                  await executeVipRenewBundle(sessionId);
                  await new Promise((r) => setTimeout(r, 1500));
                  await executeVipChangePlan(sessionId, targetIsSeven ? '7' : '6');
                  this.addLog(
                    sessionId,
                    `[✓] تم إرسال نبضة التنشيط وتأكيد طلب الترحيل بنجاح. المراقبة مستمرة دون مقاطعة حتى الترحيل الكامل...`,
                    'success'
                  );
                } catch (actErr: any) {
                  this.addLog(
                    sessionId,
                    `[!] ملاحظة أثناء الخطوة التنشيطية: ${actErr?.message || actErr}`,
                    'warn'
                  );
                }
              }
            } catch (_pollErr) {
              // Ignore temporary network hiccups during poll and continue monitoring calmly
            }
          }

          if (st.stopRequested) break;

          // If plan successfully switched and mixes recovered, pause briefly then move cleanly to next cycle!
          if (isPlanSwitched) {
            st.consecutiveErrors = 0;
            const delaySec = 15;
            this.addLog(
              sessionId,
              `[⏳] فترة أمان وفصل (${delaySec} ثانية) قبل بدء الدورة التالية #${st.cycleCount + 1}...`,
              'info'
            );
            await new Promise((r) => setTimeout(r, delaySec * 1000));
            continue;
          }
        }

        const canRetryError =
          this.isNetworkGlitch(cycleResult.error) ||
          cycleResult.can_retry === true ||
          (!cycleResult.safety_stop && cycleResult.error?.includes('تعذر تحويل الميكسات'));

        if (canRetryError && st.consecutiveErrors < MAX_NETWORK_RETRIES) {
          st.consecutiveErrors++;
          this.addLog(
            sessionId,
            `[🌐] تعذر مؤقت في خطوة التحويل/الاتصال أثناء الدورة #${st.cycleCount}. الرصيد محفوظ بنسبة 100%. جاري الصمود والمحاولة مجدداً (${st.consecutiveErrors}/${MAX_NETWORK_RETRIES}) خلال 5 ثوانٍ...`,
            'warn'
          );
          st.stepMessage = `إعادة المحاولة التلقائية الصامدة (${st.consecutiveErrors}/${MAX_NETWORK_RETRIES})...`;
          this.notify(sessionId);
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const checkRes = await executeVipCheckStatus(sessionId) as any;
            if (checkRes?.owner?.mix_balance !== undefined) {
              st.latestOwnerMix = checkRes.owner.mix_balance;
            }
            if (checkRes?.child?.mix_balance !== undefined) {
              st.latestChildMix = checkRes.child.mix_balance;
            }
            this.saveToLocalStorage(sessionId, st);
            this.notify(sessionId);
          } catch (_) {}
          st.cycleCount -= 1;
          continue;
        }

        this.addLog(sessionId, `[-] توقفت الدورة بسبب خطأ: ${cycleResult.error || 'حدث خطأ'}`, 'error');
        if (cycleResult.safety_stop) {
          showVipNotification(
            '⚠️ توقف أمان حماية الميكسات',
            'تم رصد خطر تصفير الميكسات. توقفت الدورة وحفظ الرصيد بحساب الفرد.',
            { priority: 'high' }
          );
          sendVipRemotePushNotification(
            '⚠️ تحذير أمان: تم إيقاف الدورة لحماية الميكسات',
            'توقف أمان فوري لضمان عدم ضياع أي ميكس. الرصيد محفوظ عند الفرد.',
            'urgent'
          ).catch(() => {});
        }
        st.lastError = cycleResult.error || 'فشلت الدورة';
        st.isRunning = false;
        st.currentStep = 'error';
        st.stepMessage = `توقفت: ${cycleResult.error || 'حدث خطأ'}`;
        this.notify(sessionId);
        break;
      }

      // Success in cycle
      st.consecutiveErrors = 0;
      const rawOwnerBal =
        cycleResult.final_mix ??
        cycleResult.owner_mix_balance ??
        cycleResult.owner_final_mix ??
        cycleResult.data?.owner_mix_balance ??
        cycleResult.data?.final_mix;

      // STRICT ZERO-LOSS PROTECTION: Never zero out or reduce balance to 0 if previous balance exists
      const ownerBal =
        rawOwnerBal !== undefined && rawOwnerBal > 0
          ? rawOwnerBal
          : (st.latestOwnerMix !== undefined && st.latestOwnerMix > 0 ? st.latestOwnerMix : 0);

      const rawChildBal =
        cycleResult.child_mix_balance ??
        cycleResult.data?.child_mix_balance;
      const childBal =
        rawChildBal !== undefined ? rawChildBal : (st.latestChildMix !== undefined ? st.latestChildMix : 0);

      const totalMix = ownerBal + childBal;

      if (ownerBal > 0) {
        st.latestOwnerMix = ownerBal;
      }
      st.latestChildMix = childBal;
      if (cycleResult.owner_plan || cycleResult.data?.owner_plan) {
        st.latestOwnerPlan = cycleResult.owner_plan || cycleResult.data?.owner_plan;
      }
      this.notify(sessionId);

      // Print clean completion log without ever reporting 0 mixes
      if (totalMix > 0) {
        this.addLog(
          sessionId,
          `[+] اكتملت الدورة #${st.cycleCount} بنجاح! الرصيد الإجمالي: ${totalMix.toLocaleString('ar-EG')} ميكس`,
          'success'
        );
      } else {
        this.addLog(
          sessionId,
          `[+] اكتملت الدورة #${st.cycleCount} بنجاح!`,
          'success'
        );
      }

      // Live update sticky curtain notification
      showVipPersistentNotification(
        sessionId,
        `الدورة #${st.cycleCount} ناجحة | الرصيد: ${totalMix.toLocaleString('ar-EG')} ميكس | الهدف: ${st.targetMix.toLocaleString('ar-EG')}`
      ).catch(() => {});

      // Check Target Reached
      if (st.targetMix > 0 && totalMix >= st.targetMix) {
        // Automatically recover any remaining parked child mixes back to owner before final stop
        if (st.latestChildMix && st.latestChildMix > 0) {
          this.addLog(
            sessionId,
            `[🔄 استرجاع تلقائي نهائي] الهدف مكتمل! جاري إعادة تحويل الرصيد المركون (${st.latestChildMix.toLocaleString('ar-EG')} ميكس) من الفرد للأونر...`,
            'info'
          );
          try {
            const retRes = await executeVipReturnChildMixes(sessionId);
            if (retRes.success) {
              this.addLog(sessionId, `[✓] تم استرجاع ميكسات الفرد للأونر بنجاح! الرصيد مستقر بالكامل في الأونر.`, 'success');
              st.latestOwnerMix = (st.latestOwnerMix || 0) + st.latestChildMix;
              st.latestChildMix = 0;
            } else {
              this.addLog(sessionId, `[!] تعذر الاسترجاع التلقائي لميكسات الفرد: ${retRes.error || 'يرجى النقر على زر الاسترجاع اليدوي'}.`, 'warn');
            }
          } catch (retErr: any) {
            this.addLog(sessionId, `[!] استرجاع الميكسات: ${retErr?.message || 'متاح عبر زر الاسترجاع بكارت درع الأمان'}`, 'warn');
          }
        }

        this.addLog(
          sessionId,
          `🎯 مبروك! تم اكتمال العملية والوصول إلى الحد الأقصى للميكسات المستهدفة (${totalMix.toLocaleString('ar-EG')} >= ${st.targetMix.toLocaleString('ar-EG')})!`,
          'success'
        );
        this.addLog(
          sessionId,
          `🔒 تم إيقاف الدورة التلقائية نهائياً. لا يمكن إعادة تشغيلها إلا بتأكيد يدوي مباشر من المالك لمنع الاستهلاك غير المقصود.`,
          'info'
        );
        showVipNotification(
          '🎯 تم اكتمال الهدف بنجاح وإيقاف الأتمتة!',
          `وصل رصيد الميكسات إلى ${totalMix.toLocaleString('ar-EG')} ميكس. العملية مكتملة تماماً.`,
          { priority: 'high' }
        );
        sendVipRemotePushNotification(
          '🎯 اكتمل الهدف بنجاح!',
          `وصل رصيد الجلسة إلى ${totalMix.toLocaleString('ar-EG')} ميكس وتم إيقاف الأتمتة!`
        ).catch(() => {});

        st.isRunning = false;
        st.currentStep = 'completed';
        st.stepMessage = `تم الوصول للهدف (${totalMix.toLocaleString('ar-EG')} ميكس) واكتمال العملية!`;
        this.notify(sessionId);

        // Strictly remove from localStorage and mark completed flag
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(`vip_active_loop_${sessionId}`);
            window.localStorage.setItem(`vip_target_completed_${sessionId}`, String(Date.now()));
          }
        } catch (_) {}

        // Persist strictly to Supabase so it NEVER auto-restarts on any tab focus or refresh
        try {
          await supabase.from('vip_sessions').update({
            automation_enabled: false,
            operation_state: 'completed',
            pause_reason: `تم اكتمال العملية والوصول للحد المستهدف (${totalMix.toLocaleString('en-US')} ميكس)`,
            current_step: 'completed',
            updated_at: new Date().toISOString(),
          }).eq('id', sessionId);
        } catch (_) {}

        // Check if Auto-Eject child is enabled on complete
        let shouldAutoEject = false;
        try {
          const { data: sessRow } = await supabase
            .from('vip_sessions')
            .select('auto_eject_child_on_complete')
            .eq('id', sessionId)
            .maybeSingle();
          shouldAutoEject = !!sessRow?.auto_eject_child_on_complete;
        } catch (_) {}

        if (shouldAutoEject) {
          this.addLog(sessionId, `[🚀] تفعيل تسلسل الإخراج الذكي التلقائي للفرد بعد اكتمال الجلسة (Auto-Eject)...`, 'warn');
          try {
            const ejectRes = await executeSmartEjectionSequence(sessionId);
            if (ejectRes.logs && ejectRes.logs.length > 0) {
              for (const l of ejectRes.logs) {
                this.addLog(sessionId, l.message, l.level || 'info');
              }
            }
            if (ejectRes.success) {
              this.addLog(sessionId, `[✓] ${ejectRes.message || 'اكتمل تسلسل إخراج الفرد بنجاح تام!'}`, 'success');
            } else {
              this.addLog(sessionId, `[-] تنبيه في تسلسل إخراج الفرد: ${ejectRes.error || ejectRes.message}`, 'warn');
            }
          } catch (ejectErr: any) {
            this.addLog(sessionId, `[-] تعذر تنفيذ الإخراج التلقائي للفرد: ${ejectErr?.message || ejectErr}`, 'error');
          }
        }

        disableVipBackgroundExecution();
        break;
      }

      // Delay between cycles - ABSOLUTE TIMESTAMP BASED (صمود كامل ضد تجميد الخلفية وقفل الشاشة)
      const waitSec = Math.max(st.delaySeconds || 20, 5);
      this.addLog(sessionId, `[⏳] فترة الانتظار بين الدورات: ${waitSec} ثانية...`, 'info');
      st.currentStep = 'waiting';
      const targetEndTime = Date.now() + waitSec * 1000;

      while (Date.now() < targetEndTime) {
        const cur = this.states.get(sessionId);
        if (!cur || cur.stopRequested) break;

        const remainingSec = Math.max(0, Math.ceil((targetEndTime - Date.now()) / 1000));
        st.stepMessage = `الانتظار للدورة القادمة (${remainingSec} ثانية متبقية)...`;
        this.notify(sessionId);

        // Sleep in small increments up to 1000ms
        const sleepMs = Math.min(1000, Math.max(100, targetEndTime - Date.now()));
        await new Promise((r) => setTimeout(r, sleepMs));
      }
    }

    // Final state update
    const finalSt = this.states.get(sessionId);
    if (finalSt) {
      finalSt.isRunning = false;
      if (finalSt.stopRequested) {
        finalSt.currentStep = 'idle';
        finalSt.stepMessage = 'تم الإيقاف بنجاح';
        this.addLog(sessionId, `[✓] تم إيقاف الدورة التلقائية بنجاح.`, 'info');
      }
      this.notify(sessionId);
    }
    } finally {
      this.activeRunningSessions.delete(sessionId);
      this.loopPromises.delete(sessionId);
    }
  }
}

export const vipRunnerService = new VipRunnerService();
