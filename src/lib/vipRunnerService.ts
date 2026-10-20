// ── VIP Persistent Background Runner Service ──
// Singleton engine that executes VIP cycles continuously even when navigating away from the page,
// switching tabs, or when the screen is locked/backgrounded.
// Maintains global state, live logs, step trackers, and database persistence.

import { supabase } from '@/db/supabase';
import {
  executeVipRunSingleCycleStream,
  executeVipCheckStatus,
  updateVipAutomationSettings,
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
}

type RunnerListener = (state: VipRunnerState) => void;

class VipRunnerService {
  private states = new Map<string, VipRunnerState>();
  private listeners = new Map<string, Set<RunnerListener>>();
  private loopPromises = new Map<string, Promise<void>>();

  constructor() {
    // Restore or sync when initialized
  }

  public getState(sessionId: string): VipRunnerState {
    let state = this.states.get(sessionId);
    if (!state) {
      state = {
        sessionId,
        isRunning: false,
        targetMix: 100000,
        delaySeconds: 60,
        cycleCount: 0,
        currentStep: 'idle',
        stepMessage: 'جاهز لبدء الدورة',
        logs: [],
        lastError: null,
        consecutiveErrors: 0,
        stopRequested: false,
        startedAt: null,
      };
      this.states.set(sessionId, state);
    }
    return { ...state };
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

    // Sync DB status
    try {
      await updateVipAutomationSettings(true, targetMix, null, 'save', sessionId, delaySeconds);
    } catch (e) {
      console.warn('[VipRunnerService] DB update warning:', e);
    }

    this.addLog(sessionId, `==================================================`, 'info');
    this.addLog(
      sessionId,
      `[🚀] تم تشغيل محرك الأتمتة المستمر في الخلفية (الهدف: ${targetMix.toLocaleString('ar-EG')} ميكس | الانتظار: ${delaySeconds}ث).`,
      'success'
    );
    this.addLog(
      sessionId,
      `[🛡️] نظام الصمود ضد انقطاع الشبكة واستمرار العمل بالخلفية قيد التشغيل (لن يتوقف بالخروج من القسم).`,
      'info'
    );

    sendVipRemotePushNotification(
      '🚀 بدأت دورة اتصالات VIP التلقائية',
      `الجلسة نشطة الآن في الخلفية. الهدف: ${targetMix.toLocaleString('ar-EG')} ميكس.`
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

    // Update DB
    try {
      await updateVipAutomationSettings(false, state.targetMix, null, 'stop', sessionId, state.delaySeconds);
    } catch (e) {
      console.warn('[VipRunnerService] DB stop error:', e);
    }

    sendVipRemotePushNotification(
      '⏹️ تم إيقاف دورة اتصالات VIP',
      `توقفت الأتمتة للجلسة: ${reason}`
    ).catch(() => {});

    disableVipBackgroundExecution();
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
              this.notify(sessionId);
            }
          },
          onStep: (stepInfo) => {
            const st = this.states.get(sessionId);
            if (st) {
              st.currentStep = stepInfo.step;
              st.stepMessage = stepInfo.detail || stepInfo.title;
              this.notify(sessionId);
            }
          },
        });
      } catch (err: any) {
        cycleResult = { success: false, error: err?.message || 'خطأ غير معروف في الاتصال' };
      }

      const st = this.states.get(sessionId);
      if (!st || st.stopRequested) break;

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
      const ownerBal =
        cycleResult.final_mix ??
        cycleResult.owner_final_mix ??
        cycleResult.data?.owner_mix_balance ??
        cycleResult.data?.final_mix ??
        0;
      const childBal = cycleResult.data?.child_mix_balance ?? 0;
      const totalMix = ownerBal + childBal;

      this.addLog(
        sessionId,
        `[+] اكتملت الدورة #${st.cycleCount} بنجاح! الرصيد الإجمالي: ${totalMix.toLocaleString('ar-EG')} ميكس`,
        'success'
      );

      // Check Target Reached
      if (st.targetMix > 0 && totalMix >= st.targetMix) {
        this.addLog(
          sessionId,
          `🎯 مبروك! تم الوصول إلى رصيد الميكسات المستهدف (${totalMix.toLocaleString('ar-EG')} >= ${st.targetMix.toLocaleString('ar-EG')})!`,
          'success'
        );
        showVipNotification(
          '🎯 تم الوصول للهدف المستهدف بنجاح!',
          `رصيد الميكسات الآن: ${totalMix.toLocaleString('ar-EG')} ميكس.`,
          { priority: 'high' }
        );
        sendVipRemotePushNotification(
          '🎯 اكتمل الهدف بنجاح!',
          `وصل رصيد الجلسة إلى ${totalMix.toLocaleString('ar-EG')} ميكس!`
        ).catch(() => {});
        st.isRunning = false;
        st.currentStep = 'completed';
        st.stepMessage = `تم الوصول للهدف (${totalMix.toLocaleString('ar-EG')} ميكس)!`;
        this.notify(sessionId);
        break;
      }

      // Delay between cycles
      const waitSec = Math.max(st.delaySeconds || 20, 5);
      this.addLog(sessionId, `[⏳] فترة الانتظار بين الدورات: ${waitSec} ثانية...`, 'info');
      st.currentStep = 'waiting';
      for (let sec = waitSec; sec > 0; sec--) {
        const cur = this.states.get(sessionId);
        if (!cur || cur.stopRequested) break;
        st.stepMessage = `الانتظار للدورة القادمة (${sec} ثانية متبقية)...`;
        this.notify(sessionId);
        await new Promise((r) => setTimeout(r, 1000));
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
