// ── VIP Persistent Background Runner Service ──
// Singleton engine that executes VIP cycles continuously even when navigating away from the page,
// switching tabs, or when the screen is locked/backgrounded.
// Maintains global state, live logs, step trackers, and database persistence.

import { supabase } from '@/db/supabase';
import {
  executeVipRunSingleCycleStream,
  executeVipCheckStatus,
  updateVipAutomationSettings,
  invokeVipExecutor,
  VipExecutionLog,
  VipExecutionResponse,
} from '@/lib/vipApi';
import {
  enableVipBackgroundExecution,
  disableVipBackgroundExecution,
  showVipNotification,
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
  const returnMatch = clean.match(/رجعنا للأونر\s*\|\s*رصيده الآن:\s*(\d+)\s*ميكس/);
  if (returnMatch) {
    res.ownerMix = parseInt(returnMatch[1], 10);
    res.childMix = 0; // After recovery, child is cleared
  }

  // 2. "رصيده الآن: 66100 ميكس"
  const ownerNowMatch = clean.match(/رصيده الآن:\s*(\d+)\s*ميكس/);
  if (ownerNowMatch) {
    res.ownerMix = parseInt(ownerNowMatch[1], 10);
  }

  // 3. "الفرد جاهز ولديه (66100) ميكس مركونة بأمان"
  const childParkedMatch = clean.match(/الفرد جاهز ولديه\s*\(?(\d+)\)?\s*ميكس/);
  if (childParkedMatch) {
    res.childMix = parseInt(childParkedMatch[1], 10);
    res.ownerMix = 0; // While parked, owner temporarily holds 0 until drop
  }

  // 4. "جاري تحويل (66100) ميكس إلى الرقم"
  const transferMatch = clean.match(/جاري تحويل\s*\(?(\d+)\)?\s*ميكس إلى الرقم/);
  if (transferMatch) {
    res.childMix = parseInt(transferMatch[1], 10);
  }

  // 5. "تم تأكيد نزول ميكسات الباقة الجديدة للأونر بنجاح: (6000)"
  const dropMatch = clean.match(/تأكيد نزول ميكسات الباقة الجديدة للأونر بنجاح:\s*\(?(\d+)\)?/);
  if (dropMatch) {
    res.ownerMix = parseInt(dropMatch[1], 10);
  }

  // 6. "فحص رصيد الفرد الفعلي بالسيرفر: 0 ميكس متبقية"
  const childServerMatch = clean.match(/فحص رصيد الفرد الفعلي بالسيرفر:\s*(\d+)\s*ميكس/);
  if (childServerMatch) {
    res.childMix = parseInt(childServerMatch[1], 10);
  }

  // 7. "نجح استرجاع (66100) ميكس من الفرد إلى الأونر"
  const recoveredMatch = clean.match(/نجح استرجاع\s*\(?(\d+)\)?\s*ميكس من الفرد إلى الأونر/);
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
  private lastResumeAttempt = new Map<string, number>();

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

  private addLog(sessionId: string, message: string, level: 'info' | 'success' | 'warn' | 'error') {
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
    if (parsed.ownerMix !== undefined) state.latestOwnerMix = parsed.ownerMix;
    if (parsed.childMix !== undefined) state.latestChildMix = parsed.childMix;
    if (parsed.ownerPlan) state.latestOwnerPlan = parsed.ownerPlan;

    this.saveToLocalStorage(sessionId, state);
    this.notify(sessionId);
  }

  /**
   * Start or resume background execution loop for a session
   */
  public async startLoop(sessionId: string, targetMix: number, delaySeconds: number): Promise<void> {
    const existing = this.getState(sessionId);
    if (existing.isRunning) {
      console.warn(`[VipRunnerService] Session ${sessionId} is already running.`);
      return;
    }

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

    const loopPromise = this.executeLoop(sessionId);
    this.loopPromises.set(sessionId, loopPromise);
  }

  /**
   * Request stop
   */
  public async stopLoop(sessionId: string, reason = 'طلب المستخدم'): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state || !state.isRunning) return;

    state.stopRequested = true;
    state.currentStep = 'stopping';
    state.stepMessage = `جاري إيقاف الدورة التلقائية (${reason})...`;
    this.notify(sessionId);

    this.addLog(sessionId, `[!] جاري إيقاف الدورة التلقائية: ${reason}...`, 'warn');

    // Clear persistent active loop from localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(`vip_active_loop_${sessionId}`);
      }
    } catch (_) {}

    // Update DB
    try {
      await updateVipAutomationSettings(false, state.targetMix, null, 'stop', sessionId, state.delaySeconds);
    } catch (e) {
      console.warn('[VipRunnerService] DB stop error:', e);
    }

    // Stop server-side persistent cloud runner
    invokeVipExecutor('stop_server_loop', {
      session_id: sessionId,
    }).catch((e) => console.warn('[VipRunnerService] Server background loop stop trigger error:', e));

    sendVipRemotePushNotification(
      '⏹️ تم إيقاف دورة اتصالات VIP',
      `توقفت الأتمتة للجلسة: ${reason}`
    ).catch(() => {});

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
        .select('automation_enabled, operation_state, owner_mix_balance, target_mix_balance, current_step')
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
      txt.includes('offline')
    );
  }

  private async executeLoop(sessionId: string) {
    const MAX_NETWORK_RETRIES = 5;

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
              if (parsed.ownerMix !== undefined) {
                st.latestOwnerMix = parsed.ownerMix;
              }
              if (parsed.childMix !== undefined) {
                st.latestChildMix = parsed.childMix;
              }
              if (parsed.ownerPlan) {
                st.latestOwnerPlan = parsed.ownerPlan;
              }

              this.saveToLocalStorage(sessionId, st);
              this.notify(sessionId);
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
        if (this.isNetworkGlitch(cycleResult.error) && st.consecutiveErrors < MAX_NETWORK_RETRIES) {
          st.consecutiveErrors++;
          this.addLog(
            sessionId,
            `[🌐] انقطاع مؤقت في الاتصال أثناء الدورة #${st.cycleCount}. جاري الصمود والمحاولة مجدداً (${st.consecutiveErrors}/${MAX_NETWORK_RETRIES}) خلال 4 ثوانٍ...`,
            'warn'
          );
          st.stepMessage = `إعادة الاتصال التلقائي (${st.consecutiveErrors}/${MAX_NETWORK_RETRIES})...`;
          this.notify(sessionId);
          await new Promise((r) => setTimeout(r, 4000));
          try {
            await executeVipCheckStatus(sessionId);
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

      // Check Target Reached
      if (st.targetMix > 0 && totalMix >= st.targetMix) {
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
  }
}

export const vipRunnerService = new VipRunnerService();
