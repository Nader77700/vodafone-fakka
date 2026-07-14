// الصفحة الرئيسية — كروت الشحن + معلومات المستخدم

// لوجو احتياطي — محلي دائمًا، لا يعتمد على الشبكة
const HEADER_FALLBACK_LOGO = '/vfp-logo.png';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import { useAssets } from '@/hooks/use-assets';
import { supabase } from '@/db/supabase';
import {
  getUserSubscription, getUserOperations, calcDaysRemaining, calcTimeRemaining,
  validateAndSyncSubscription,
  getActivityTimeline, logActivity, insertOperation, checkAndConsumeOperation, refundOperation,
  executeVodafoneOrder, checkLocalBridge, sendNotification, getUnreadNotificationCount,
  getExpiryNotificationSentToday, getSubscriptionOpsInfo, insertSystemLog,
  getProductConfig, type ProductConfig,
} from '@/lib/api';
import { staleWhileRevalidate, cacheGetStale, cacheSet } from '@/lib/appCache';
import type { ActivityEntry, SubscriptionOpsInfo, OpsCheckResult } from '@/lib/api';
import type { ChargeDebugStep } from '@/lib/api';
import type { Subscription, Operation } from '@/types/types';
import { parseApiError, shouldShowNetworkTips, getFirstLine, isPinLocked, isUnregisteredMsisdn } from '@/lib/errorMapper';
import { formatEgyptTime, formatEgyptDate, formatReceiptDate, formatReceiptTime } from '@/lib/egyptTime';
import InvoiceReceipt from '@/components/invoice/InvoiceReceipt';
import PrintButton from '@/components/invoice/PrintButton';
import type { InvoiceData } from '@/lib/printer/types';
import { ALL_PRODUCTS, FAKKA_PRODUCTS, MARED_PRODUCTS } from '@/data/products';
import type { VodafoneProduct } from '@/data/products';
import { VodafoneDetector, isNativeAndroid } from '@/lib/vodafoneDetector';
import type { NetworkInfo } from '@/lib/vodafoneDetector';
import {
  Bell, Key, Calendar, Clock, Zap, Phone, Lock,
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  Shield, CreditCard, Users, ChevronLeft,
  Database, Sparkles, Gift, Wifi, Signal, RefreshCw,
  Smartphone, Copy, Info, Home, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import AppFooter from '@/components/common/AppFooter';
import SubscriptionAlertBanner from '@/components/subscription/SubscriptionAlertBanner';
import type { SubStatus } from '@/hooks/useSubscriptionEngine';
import { useSubscriptionValidator } from '@/lib/subscriptionValidator';
import ActivationPreviewModal from '@/components/subscription/ActivationPreviewModal';
import ExpiryModal from '@/components/subscription/ExpiryModal';
import SubscriptionNotificationCenter from '@/components/subscription/SubscriptionNotificationCenter';
import SubscriptionPremiumCard from '@/components/subscription/SubscriptionPremiumCard';
import TrialExhaustedPopup from '@/components/TrialExhaustedPopup';
import { fmtTimeLeft } from '@/lib/formatUtils';
import { toast } from 'sonner';
import { Radio, ArrowLeft, Wallet } from 'lucide-react';
import PromotionBanner from '@/components/common/PromotionBanner';
import { formatError } from '@/lib/formatError';


// ── كارت Premium — عروض باقي الشبكات ──
function NetworksPremiumCard() {
  const navigate = useNavigate();
  return (
    <div className="px-4 pt-3">
      <div
        onClick={() => navigate('/networks')}
        className="relative rounded-2xl overflow-hidden cursor-pointer select-none transition-transform duration-200 active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg,rgba(230,0,0,0.10) 0%,rgba(0,0,0,0.70) 60%,rgba(180,0,0,0.12) 100%)',
          backdropFilter: 'blur(12px)',
          border: '1.5px solid rgba(230,0,0,0.28)',
          boxShadow: '0 4px 32px rgba(230,0,0,0.12), 0 1px 0 rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Glow layer */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 10% 50%,rgba(230,0,0,0.10),transparent)' }} />
        <div className="relative p-4 flex items-center gap-4">
          {/* أيقونة */}
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(230,0,0,0.25),rgba(180,0,0,0.15))', border: '1px solid rgba(230,0,0,0.35)' }}>
            <Radio className="w-6 h-6" style={{ color: '#E60000' }} />
          </div>
          {/* نصوص */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(230,0,0,0.18)', color: '#FF4444', border: '1px solid rgba(230,0,0,0.30)' }}>
                Premium
              </span>
            </div>
            <p className="text-sm font-black text-foreground leading-tight text-balance">📡 عروض باقي الشبكات</p>
            <p className="text-[11px] text-muted-foreground mt-1 text-pretty leading-relaxed">
              استعرض عروض <span className="font-bold" style={{ color: '#E60000' }}>Vodafone</span>{' '}·{' '}
              <span className="font-bold" style={{ color: '#FF6600' }}>Orange</span>{' '}·{' '}
              <span className="font-bold" style={{ color: '#00AA00' }}>Etisalat</span>{' '}·{' '}
              <span className="font-bold" style={{ color: '#7B2FBE' }}>WE</span>
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">اختر الشبكة واستعرض جميع العروض والخدمات.</p>
          </div>
          {/* سهم */}
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(230,0,0,0.18)', border: '1px solid rgba(230,0,0,0.30)' }}>
              <ArrowLeft className="w-4 h-4" style={{ color: '#E60000' }} />
            </div>
          </div>
        </div>
        {/* زر الاستعراض */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-all"
            style={{ background: 'linear-gradient(90deg,#E60000,#B30000)', color: '#fff', boxShadow: '0 2px 12px rgba(230,0,0,0.30)' }}>
            <Radio className="w-4 h-4" />
            استعراض الشبكات
            <ArrowLeft className="w-4 h-4 opacity-80" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// كارت الشحن من رصيد أنا فودافون — يُضاف فوق شبكة الكروت
// مستقل تماماً — لا يؤثر على أي كارت موجود
// ══════════════════════════════════════════════════════════
function BalanceChargeHomeCard() {
  const navigate = useNavigate();
  return (
    <div className="px-4 pt-3">
      <div
        onClick={() => navigate('/balance-charge')}
        className="relative rounded-2xl overflow-hidden cursor-pointer select-none transition-transform duration-200 active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg,rgba(0,200,150,0.12) 0%,rgba(0,0,0,0.72) 60%,rgba(0,160,120,0.10) 100%)',
          backdropFilter: 'blur(12px)',
          border: '1.5px solid rgba(0,200,150,0.28)',
          boxShadow: '0 4px 32px rgba(0,200,150,0.12), 0 1px 0 rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Glow layer */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 10% 50%,rgba(0,200,150,0.10),transparent)' }} />

        <div className="relative p-4 flex items-center gap-4">
          {/* أيقونة */}
          <div className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(0,200,150,0.25),rgba(0,160,120,0.15))', border: '1px solid rgba(0,200,150,0.35)' }}>
            <Wallet className="w-6 h-6" style={{ color: '#00c896' }} />
          </div>

          {/* نصوص */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(0,200,150,0.18)', color: '#00c896', border: '1px solid rgba(0,200,150,0.30)' }}>
                New
              </span>
            </div>
            <p className="text-sm font-black text-foreground leading-tight text-balance">
              💳 الشحن من رصيد أنا فودافون
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 text-pretty leading-relaxed">
              شحن كروت الفكة والمارد مباشرة من{' '}
              <span className="font-bold" style={{ color: '#00c896' }}>رصيد حسابك</span>
              {' '}بدون Vodafone Cash
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">سجّل دخولك مرة واحدة واشحن بسرعة.</p>
          </div>

          {/* سهم */}
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,200,150,0.18)', border: '1px solid rgba(0,200,150,0.30)' }}>
              <ArrowLeft className="w-4 h-4" style={{ color: '#00c896' }} />
            </div>
          </div>
        </div>

        {/* زر الدخول */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold"
            style={{ background: 'linear-gradient(90deg,#00c896,#00a37a)', color: '#fff', boxShadow: '0 2px 12px rgba(0,200,150,0.30)' }}>
            <Wallet className="w-4 h-4" />
            ابدأ الشحن من الرصيد
            <ArrowLeft className="w-4 h-4 opacity-80" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Vodafone Mini Logo SVG ──
function VFLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" fill="#E60000" />
      <path d="M10 10 L16 22 L22 10" stroke="white" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════
//  NativeDebugPanel — القيم الحقيقية من Android TelephonyManager
//  يعرض القيم الخام مباشرة — SIM / Network / Data State
// ════════════════════════════════════════════════════════════════

// بطاقة قيمة واحدة — تعرض العنوان + القيمة الخام + الحالة
function DebugValueCard({
  label, source, rawValue, subValue, status,
}: {
  label: string;
  source: string;
  rawValue: string;
  subValue?: string;
  status: 'ok' | 'warn' | 'error' | 'info';
}) {
  const colors = {
    ok:    { border: '#22c55e33', bg: '#0d1f0d', dot: '#22c55e', val: '#4ade80' },
    warn:  { border: '#f59e0b33', bg: '#1f160a', dot: '#f59e0b', val: '#fbbf24' },
    error: { border: '#ef444433', bg: '#1f0d0d', dot: '#ef4444', val: '#f87171' },
    info:  { border: '#3b82f633', bg: '#0d1020', dot: '#60a5fa', val: '#93c5fd' },
  }[status];

  return (
    <div className="rounded-xl p-3 flex flex-col gap-1.5 min-w-0"
      style={{ border: `1px solid ${colors.border}`, background: colors.bg }}>
      {/* Label + source */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: colors.dot }}>{label}</span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: '#ffffff08', color: '#ffffff40' }}>{source}</span>
      </div>
      {/* Raw value — أكبر حجم وأوضح */}
      <p className="text-sm font-bold font-mono leading-tight break-all"
        style={{ color: colors.val }}>{rawValue}</p>
      {/* Sub value (e.g. MCC+MNC code) */}
      {subValue && (
        <p className="text-[11px] font-mono" style={{ color: '#ffffff55' }}>{subValue}</p>
      )}
    </div>
  );
}

// ── Tiny row helper for RAW RESPONSE VIEWER ──
function Row({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0" style={{ color: '#ffffff30' }}>{k}:</span>
      <span className="text-right break-all" style={{ color: c ?? '#94a3b8' }}>{v}</span>
    </div>
  );
}

function NativeDebugPanel() {
  const [info, setInfo]       = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const isNative = isNativeAndroid();

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isNative) await VodafoneDetector.requestPhonePermission();
      const result = await VodafoneDetector.getNetworkInfo();
      setInfo(result);
    } catch (e) {
      const msg = formatError(e);
      setError(msg);
      console.error('[NativeDebug] error:', e);
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  // ── Phase 2: TelephonyCallback native event + web fallbacks ──
  useEffect(() => {
    if (!isNative) return;

    // (A) TelephonyCallback native event — الأسرع (فوري عند تغيير Data SIM)
    let nativeHandle: { remove: () => void } | null = null;
    try {
      nativeHandle = VodafoneDetector.addListener(
        'networkStateChanged',
        (data: { trigger: string; timestamp: number }) => {
          if (import.meta.env.DEV) console.log('[NativeDebug] TelephonyCallback event:', data.trigger, data.timestamp);
          fetchInfo();
        }
      ) as unknown as { remove: () => void };
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[NativeDebug] addListener not available:', e);
    }

    // (B) Web events كـ backup عند تغيير الاتصال
    const handleOnline  = () => { if (import.meta.env.DEV) console.log('[NativeDebug] online event'); fetchInfo(); };
    const handleOffline = () => { if (import.meta.env.DEV) console.log('[NativeDebug] offline event'); fetchInfo(); };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        if (import.meta.env.DEV) console.log('[NativeDebug] app foregrounded — refreshing carrier info');
        fetchInfo();
      }
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    // (C) Polling كـ safety net — خُفِّض إلى 5 ثوانٍ
    const interval = setInterval(fetchInfo, 5000);

    return () => {
      nativeHandle?.remove();
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
      clearInterval(interval);
    };
  }, [isNative, fetchInfo]);

  const canExec = info?.canExecuteNative ?? false;

  return (
    <div className="mx-4 rounded-2xl overflow-hidden border"
      style={{ borderColor: '#ffffff12', background: '#080d14' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: 'linear-gradient(90deg,#0d1523 0%,#0f1a2e 100%)', borderBottom: '1px solid #ffffff0d' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0 animate-pulse"
            style={{ backgroundColor: canExec ? '#22c55e' : loading ? '#60a5fa' : '#f59e0b' }} />
          <span className="text-[11px] font-bold tracking-widest text-foreground/70 font-mono">
            NATIVE DEBUG PANEL
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold shrink-0"
            style={{
              background: isNative ? '#22c55e20' : '#f59e0b20',
              color: isNative ? '#4ade80' : '#fbbf24',
              border: `1px solid ${isNative ? '#22c55e30' : '#f59e0b30'}`,
            }}>
            {isNative ? '● APK' : '○ WEB'}
          </span>
        </div>
        <button onClick={fetchInfo} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95"
          style={{ background: '#00E5FF15', color: '#00E5FF', border: '1px solid #00E5FF25' }}>
          {loading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RefreshCw className="w-3 h-3" />}
          {loading ? 'قراءة…' : 'تحديث'}
        </button>
      </div>

      {/* ── Loading ── */}
      {loading && !info && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#00E5FF' }} />
          <p className="text-xs font-mono" style={{ color: '#ffffff50' }}>
            يقرأ TelephonyManager…
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mx-4 my-3 px-4 py-3 rounded-xl flex items-start gap-2"
          style={{ background: '#1f0d0d', border: '1px solid #ef444433' }}>
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <p className="text-xs font-mono break-all" style={{ color: '#fca5a5' }}>{error}</p>
        </div>
      )}

      {/* ── 4 Main Value Cards ── */}
      {info && (
        <div className="p-4 grid grid-cols-2 gap-3">

          {/* 1. Active Data SIM — القرار الحقيقي */}
          <DebugValueCard
            label="Active Data SIM"
            source="getActiveDataSubscriptionId()"
            rawValue={info.activeDataSimOperatorName}
            subValue={`MCC+MNC: ${info.activeDataSimOperator} | subId: ${info.activeDataSubId}`}
            status={info.isVodafoneMobile ? 'ok' : info.activeDataSimOperator === 'غير متوفر' ? 'error' : 'warn'}
          />

          {/* 2. Network Operator (للعرض فقط) */}
          <DebugValueCard
            label="Network Operator"
            source="getNetworkOperatorName()"
            rawValue={info.networkOperatorName}
            subValue={`MCC+MNC: ${info.networkOperator}`}
            status={info.networkOperator === 'غير متوفر' ? 'error' : 'info'}
          />

          {/* 3. Active Network */}
          <DebugValueCard
            label="Active Network"
            source="getActiveNetwork()"
            rawValue={info.activeNetwork}
            status={info.isMobileDataActive ? 'ok' : info.isWifiActive ? 'warn' : 'error'}
          />

          {/* 4. Mobile Data State */}
          <DebugValueCard
            label="Mobile Data State"
            source="TRANSPORT_CELLULAR"
            rawValue={info.isMobileDataActive ? 'CONNECTED' : 'DISCONNECTED'}
            subValue={info.isMobileDataActive ? 'بيانات الجوال نشطة' : 'بيانات الجوال مطفية'}
            status={info.isMobileDataActive ? 'ok' : 'error'}
          />
        </div>
      )}

      {/* ── Divider ── */}
      {info && <div style={{ height: '1px', background: '#ffffff08', margin: '0 16px' }} />}

      {/* ── Extra Info rows ── */}
      {info && (
        <div className="px-4 py-3 grid grid-cols-1 gap-0 divide-y divide-white/[0.04]">
          {[
            { k: 'Phone Permission',    v: info.hasPhonePermission ? 'GRANTED ✓' : 'DENIED ✗',           ok: info.hasPhonePermission },
            { k: 'Active Data SIM',     v: info.isVodafoneMobile  ? 'Vodafone EG ✓' : `${info.activeDataSimOperatorName}`, ok: info.isVodafoneMobile },
            { k: 'SIM1 (display only)', v: info.isVodafoneSim     ? 'Vodafone EG ✓' : `${info.simOperatorName}`,           ok: info.isVodafoneSim },
            { k: 'SubId',               v: String(info.activeDataSubId) },
            { k: 'Device',              v: info.deviceModel },
            { k: 'Android',             v: info.androidVersion },
          ].map(row => (
            <div key={row.k} className="flex items-center justify-between py-2 gap-3">
              <span className="text-[10px] font-mono shrink-0" style={{ color: '#ffffff45' }}>{row.k}</span>
              <span className="text-[11px] font-mono font-bold text-right break-all"
                style={{ color: row.ok === true ? '#4ade80' : row.ok === false ? '#f87171' : '#94a3b8' }}>
                {row.v}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── canExecuteNative banner ── */}
      {info && (
        <div className="px-4 pb-4">
          <div className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{
              background: canExec ? '#0d1f0d' : '#1f160a',
              border: `1px solid ${canExec ? '#22c55e33' : '#f59e0b33'}`,
            }}>
            {canExec
              ? <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#22c55e' }} />
              : <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: '#f59e0b' }} />}
            <div className="min-w-0">
              <p className="text-xs font-bold font-mono"
                style={{ color: canExec ? '#4ade80' : '#fbbf24' }}>
                canExecuteNative = {canExec ? 'true' : 'false'}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: '#ffffff55' }}>
                {canExec
                  ? 'Active Data SIM = Vodafone ✓  +  بيانات جوال ✓'
                  : [
                    !info.isVodafoneMobile   && `Active Data SIM = ${info.activeDataSimOperatorName}`,
                    !info.isMobileDataActive && 'بيانات الجوال مطفية',
                  ].filter(Boolean).join('  •  ')
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Web hint ── */}
      {!isNative && (
        <div className="px-4 pb-3 text-center">
          <p className="text-[10px] font-mono" style={{ color: '#ffffff25' }}>
            ⓘ القيم الحقيقية من TelephonyManager تظهر فقط داخل APK الأصلي
          </p>
        </div>
      )}
    </div>
  );
}

// ── مدة صلاحية المنتج ──
function getValidity(product: VodafoneProduct): string {
  return product.validity;
}

// ── أيقونة نوع المنتج ──
function ProductIcon({ type, className = 'w-4 h-4', style }: { type: string; className?: string; style?: React.CSSProperties }) {
  if (type === 'دقايق') return <Phone className={className} style={style} />;
  if (type === 'فليكس') return <Zap className={className} style={style} />;
  if (type === 'سوشيال') return <Users className={className} style={style} />;
  return <CreditCard className={className} style={style} />;
}


// ── كارت المنتج — P1-P4: مضغوط، بلا تكرار، توزيع بيانات محسّن ──
function ProductCard({ product, onSelect }: { product: VodafoneProduct; onSelect: (p: VodafoneProduct) => void }) {
  const isMared = product.category === 'mared';
  const validity = getValidity(product);

  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="relative w-full overflow-hidden select-none"
      style={{
        minHeight: 136,   // P1: تقليل من 190 → 136px (~28%)
        borderRadius: 14,
        border: '1.5px solid rgba(230,0,0,0.45)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.70)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
        background: '#0D0303',
      }}
      onTouchStart={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'scale(0.97)';
        el.style.boxShadow = '0 2px 14px rgba(0,0,0,0.80), 0 0 22px rgba(230,0,0,0.40)';
      }}
      onTouchEnd={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'scale(1)';
        el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.70)';
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(-3px)';
        el.style.boxShadow = '0 12px 36px rgba(0,0,0,0.75), 0 0 28px rgba(230,0,0,0.42)';
        el.style.borderColor = 'rgba(230,0,0,0.75)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.70)';
        el.style.borderColor = 'rgba(230,0,0,0.45)';
      }}
    >
      {/* خلفية AI */}
      <img
        src="/images/vf-card-bg.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ borderRadius: 'inherit', objectPosition: 'center center' }}
      />
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to right, rgba(4,0,0,0.95) 38%, rgba(4,0,0,0.55) 58%, rgba(4,0,0,0.02) 100%)',
        borderRadius: 'inherit',
      }} />

      {/* Layout: يسار = لوجو+توقيع، يمين = بيانات */}
      <div className="relative z-10 flex flex-row h-full" style={{ minHeight: 136 }}>

        {/* الجانب الأيسر — لوجو + توقيع */}
        <div className="flex flex-col justify-between py-2 px-2" style={{ width: '36%', minWidth: 0 }}>
          <div className="flex items-center gap-1">
            <VFLogo size={15} />
            <span className="text-[8px] font-black text-white leading-none"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.90)' }}>vodafone</span>
          </div>
          <div>
            <p className="text-[9px] font-bold leading-tight text-white"
              style={{ fontFamily: "'Dancing Script','Brush Script MT',cursive", textShadow: '0 1px 6px rgba(0,0,0,0.95)' }}>
              Nader Akram
            </p>
            <p className="text-[7px] font-bold" style={{ color: '#E60000' }}>Developer</p>
          </div>
        </div>

        {/* الجانب الأيمن — P2: حُذف displayName (كان مكرراً مع السعر) */}
        {/* P3: توزيع رأسي: badge → سعر → وحدات → صافي → صلاحية → زر */}
        <div className="flex flex-col flex-1 min-w-0 px-2 py-1.5 text-right justify-between">

          {/* Badge النوع فقط — P2: لا اسم كارت مكرر */}
          <div className="flex justify-end">
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
              style={{ color: '#fff', background: '#E60000', border: '1px solid rgba(255,255,255,0.20)' }}>
              {isMared ? 'مارد' : 'فكة'}
            </span>
          </div>

          {/* السعر الكبير */}
          <p className="text-[28px] font-black tabular-nums leading-none mt-0.5"
            style={{ color: '#ffffff', textShadow: '0 0 18px rgba(230,0,0,0.75), 0 2px 8px rgba(0,0,0,0.90)' }}>
            {product.priceLabel}
          </p>

          {/* الوحدات + صافي الربح في صف واحد — P3: لا فراغات هدر */}
          <div className="flex items-center justify-end gap-2 mt-0.5">
            <span className="text-[10px] font-semibold tabular-nums"
              style={{ color: 'rgba(255,255,255,0.80)' }}>
              {product.unitsLabel}
            </span>
            {product.net_balance > 0 && (
              <span className="text-[10px] font-semibold"
                style={{ color: 'rgba(255,200,0,0.90)', textShadow: '0 1px 3px rgba(0,0,0,0.80)' }}>
                صافي: {product.net_balance.toFixed(2)} ج
              </span>
            )}
          </div>

          {/* الصلاحية + زر تنفيذ في صف واحد — P3 */}
          <div className="flex items-center justify-between mt-1"
            style={{ borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 5 }}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(0,229,255,0.14)', border: '1px solid rgba(0,229,255,0.38)' }}>
              <ChevronLeft className="w-3 h-3" style={{ color: '#00E5FF' }} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-white/70">🗓 {validity}</span>
              <span className="text-[11px] font-black"
                style={{ color: '#00E5FF', textShadow: '0 0 10px rgba(0,229,255,0.55)' }}>
                تنفيذ الآن
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ── مكوّن: نافذة تفاصيل العملية — تستخدم InvoiceReceipt الموحّدة ──
function OperationDetailsDialog({
  open, onClose, invoice,
}: {
  open: boolean;
  onClose: () => void;
  invoice: InvoiceData;
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] w-[92vw] md:max-w-[400px] p-0 border-0 max-h-[88dvh] overflow-y-auto"
        style={{ background: '#0a0000', border: '1px solid rgba(230,0,0,0.25)', borderRadius: 20 }}
        dir="rtl"
      >
        <div className="h-1 w-full rounded-t-[20px]"
          style={{ background: 'linear-gradient(90deg,#E60000,#ff3333 50%,#E60000)' }} />
        <div className="flex items-center gap-3 px-4 py-3.5 border-b"
          style={{ borderColor: 'rgba(230,0,0,0.12)', background: 'rgba(230,0,0,0.04)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)' }}>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-sm font-black text-white flex-1 min-w-0">تفاصيل العملية الكاملة</p>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <XCircle className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        {/* ── فاتورة موحّدة ── */}
        <InvoiceReceipt invoice={invoice} compact />
        <div className="px-5 py-3 space-y-2">
          <PrintButton invoice={invoice} variant="full" />
          <button
            className="w-full h-10 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
            onClick={onClose}
          >إغلاق</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── مكوّن: شاشة الإيصال بعد نجاح الشحن — تستخدم InvoiceReceipt الموحّدة ──
function ReceiptView({
  invoice, onChargeAnother, onClose,
}: {
  invoice: InvoiceData;
  onChargeAnother: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="flex flex-col" dir="rtl">
      {/* شريط علوي أخضر */}
      <div className="h-1 w-full rounded-t-[20px] shrink-0"
        style={{ background: 'linear-gradient(90deg,#22c55e,#4ade80 50%,#22c55e)' }} />

      {/* فاتورة موحّدة */}
      <InvoiceReceipt invoice={invoice} />

      {/* أزرار الإجراءات */}
      <div className="px-5 py-4 space-y-2.5">
        <PrintButton invoice={invoice} variant="full" />
        <button
          className="w-full h-11 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
          onClick={() => setDetailsOpen(true)}
        >
          <Info className="w-4 h-4" />عرض التفاصيل الكاملة
        </button>
        <button
          className="w-full h-11 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
          style={{ background: 'linear-gradient(135deg,#E60000,#cc0000)', color: '#fff', boxShadow: '0 0 20px rgba(230,0,0,0.35)' }}
          onClick={onChargeAnother}
        >
          <RotateCcw className="w-4 h-4" />شحن كارت آخر
        </button>
        <button
          className="w-full h-11 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)' }}
          onClick={() => { onClose(); navigate('/'); }}
        >
          <Home className="w-4 h-4" />الرجوع للرئيسية
        </button>
      </div>

      {/* نافذة التفاصيل */}
      <OperationDetailsDialog open={detailsOpen} onClose={() => setDetailsOpen(false)} invoice={invoice} />
    </div>
  );
}

// ── Modal تنفيذ الطلب Premium — هوية Vodafone Fakka الكاملة ──
function ExecuteModal({
  product, open, onClose, onSuccess, isAdmin = false, prefillPhone = '', logoUrl = '',
}: {
  product: VodafoneProduct | null; open: boolean; onClose: () => void; onSuccess: () => void; isAdmin?: boolean; prefillPhone?: string; logoUrl?: string;
}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(prefillPhone);
  const [pin, setPin] = useState('');
  const [sender, setSender] = useState(''); // مقروء تلقائياً من Native — لا يظهر للمستخدم
  const [loadingStep, setLoadingStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastErrorType, setLastErrorType] = useState<import('@/lib/errorMapper').ErrorType>('unknown');
  const [debugSteps, setDebugSteps] = useState<ChargeDebugStep[]>([]);
  const [bridgeActive, setBridgeActive] = useState<boolean | null>(null);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [trialExhausted, setTrialExhausted] = useState(false);
  const [trialOpsUsed, setTrialOpsUsed] = useState(0);
  const [trialMaxOps, setTrialMaxOps] = useState(2);
  const [isTrialMode, setIsTrialMode] = useState(true);
  // ── حالة الفاتورة الموحّدة بعد النجاح ──
  const [receipt, setReceipt] = useState<InvoiceData | null>(null);
  // منع تنفيذ متعدد عبر ref متزامن
  const executingRef   = useRef(false);
  const lastFailedAtRef = useRef<number>(0); // cooldown بعد الفشل
  const RETRY_COOLDOWN_MS = 15_000; // 15 ثانية بين المحاولات بعد الفشل

  const isNativeAPK = isNativeAndroid();
  const isVodafoneReady = isNativeAPK && (networkInfo?.canExecuteNative ?? false);

  // ── جلب معلومات الشبكة ──────────────────────────────────────────────────
  const fetchNetworkInfo = useCallback(async () => {
    if (!isNativeAPK) return;
    try {
      await VodafoneDetector.requestPhonePermission();
      const result = await VodafoneDetector.getNetworkInfo();
      setNetworkInfo(result);
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Dialog] fetchNetworkInfo error:', e);
    }
  }, [isNativeAPK]);

  // ── تهيئة عند الفتح ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setPhone(prefillPhone); setPin(''); setSender(''); setLoadingStep(0);
    setLastError(null); setLastErrorType('unknown'); setDebugSteps([]);
    setBridgeActive(null); setNetworkInfo(null); setReceipt(null);
    executingRef.current = false;
    if (isNativeAPK) {
      fetchNetworkInfo();
    } else {
      checkLocalBridge().then(ok => setBridgeActive(ok));
    }
  }, [open, isNativeAPK, fetchNetworkInfo]);

  // ── Network Observer — يعمل طوال فترة فتح الـ Dialog ───────────────────
  useEffect(() => {
    if (!open || !isNativeAPK) return;

    // (A) TelephonyCallback native event — فوري عند تغيير Data SIM
    let nativeHandle: { remove: () => void } | null = null;
    try {
      nativeHandle = VodafoneDetector.addListener(
        'networkStateChanged',
        () => { fetchNetworkInfo(); }
      ) as unknown as { remove: () => void };
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Dialog] addListener not available:', e);
    }

    // (B) Web events كـ backup
    const handleOnline  = () => fetchNetworkInfo();
    const handleOffline = () => fetchNetworkInfo();
    const handleVisible = () => {
      if (document.visibilityState === 'visible') fetchNetworkInfo();
    };
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    // (C) Polling — كل 5 ثوانٍ كـ safety net
    const interval = setInterval(fetchNetworkInfo, 5000);

    return () => {
      nativeHandle?.remove();
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
      clearInterval(interval);
    };
  }, [open, isNativeAPK, fetchNetworkInfo]);

  const isMared = product?.category === 'mared';
  const accentColor = '#E60000';
  const validity = product ? getValidity(product) : '';

  const handleExecute = async () => {
    if (!user || !product) return;
    // منع التنفيذ المزدوج — أي ضغطة أثناء التنفيذ تُهمَل فوراً
    if (executingRef.current) return;
    // cooldown 15 ثانية بعد آخر فشل — يمنع double-submit غير المقصود
    const timeSinceFail = Date.now() - lastFailedAtRef.current;
    if (lastFailedAtRef.current > 0 && timeSinceFail < RETRY_COOLDOWN_MS) {
      const secsLeft = Math.ceil((RETRY_COOLDOWN_MS - timeSinceFail) / 1000);
      toast.warning(`انتظر ${secsLeft} ث قبل إعادة المحاولة`, { duration: 3000 });
      return;
    }
    executingRef.current = true;

    const trimPhone  = phone.trim();
    const trimPin    = pin.trim();
    const trimSender = sender.trim(); // يُقرأ تلقائياً من Native — يُمرَّر للـ API فارغاً إذا لم يُتاح
    if (!trimPhone) { executingRef.current = false; toast.error('يرجى إدخال رقم الهاتف المستفيد'); return; }
    if (!trimPhone.startsWith('01') || trimPhone.length !== 11) {
      executingRef.current = false; toast.error('رقم الهاتف غير صحيح — 11 رقم يبدأ بـ 01'); return;
    }
    if (!trimPin) { executingRef.current = false; toast.error('يرجى إدخال الرقم السري'); return; }

    // ── فحص قفل Vodafone Cash قبل البدء (بدون استهلاك عملية) ──────────────
    if (!isAdmin && profile?.vodafone_pin_locked_at) {
      const lockedAt = new Date(profile.vodafone_pin_locked_at).getTime();
      const hoursSinceLock = (Date.now() - lockedAt) / (1000 * 60 * 60);
      if (hoursSinceLock < 24) {
        const hoursLeft = Math.ceil(24 - hoursSinceLock);
        executingRef.current = false;
        setLastError(
          `🔒 حسابك مجمَّد مؤقتاً\nبسبب تكرار الرقم السري الخاطئ 3 مرات.\n\nالوقت المتبقي للفتح: ${hoursLeft} ساعة\nأو اتصل على 888 من خطك لإعادة التعيين`
        );
        setLastErrorType('pin_locked');
        toast.error('🔒 الحساب مجمَّد — لا يمكن تنفيذ عمليات الآن', { duration: 6000 });
        return;
      }
    }

    // ── Idempotency Key + Correlation ID — فريد لكل محاولة تنفيذ ──
    // يمنع تنفيذ نفس عملية الشحن مرتين حتى عند انقطاع الإنترنت أو Retry
    const idempotencyKey = `${user.id}-${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const correlationId  = `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const executeStartedAt = Date.now();

    setSubmitting(true);
    setLastError(null);
    setLastErrorType('unknown');
    setLoadingStep(1);

    // ── Pre-flight: تحقق من صلاحية الجلسة قبل استهلاك أي عملية ──
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) {
      executingRef.current = false;
      setSubmitting(false); setLoadingStep(0);
      toast.error('انتهت جلستك — يرجى إعادة تسجيل الدخول', { duration: 6000 });
      return;
    }

    // ── Admin يتجاوز جميع قيود الحصة والاشتراك ─────────────────────────
    if (!isAdmin) {
      const opsCheck: OpsCheckResult = await checkAndConsumeOperation(user.id);
      if (!opsCheck.allowed) {
        setTrialOpsUsed(opsCheck.opsUsed ?? 0);
        setTrialMaxOps(opsCheck.opsLimit ?? 0);
        setIsTrialMode(opsCheck.isTrial ?? true);
        setTrialExhausted(true);
        setSubmitting(false); setLoadingStep(0);
        executingRef.current = false;
        return;
      }
    }

    setLoadingStep(2);
    await new Promise(r => setTimeout(r, 600));
    setLoadingStep(3);

    const result = await executeVodafoneOrder({
      product_id: product.id, receiver: trimPhone, pin: trimPin, sender: trimSender,
      idempotencyKey, correlationId,
    });

    const executeLatencyMs = Date.now() - executeStartedAt;
    if (result.debugSteps?.length) setDebugSteps(result.debugSteps);

    const performedAt = new Date().toISOString();

    // ── إذا جاء التنفيذ عبر Edge Function → العملية مسجّلة سيرفر-سايد مسبقاً ──
    // لا حاجة لـ insertOperation من العميل (يعمل حتى لو المستخدم بدون إنترنت)
    const serverRegistered = result.via === 'server' && result.registered === true;
    let opNumber: number | null = serverRegistered ? (result.operation_number ?? null) : null;

    if (!serverRegistered) {
      // مسار native / bridge → نسجّل من العميل كالمعتاد
      const { error: opErr, data: opData } = await insertOperation({
        user_id: user.id, phone_number: trimPhone, card_type: product.displayName,
        card_data: {
          product_id: product.id, price: product.price, units: product.units,
          units_label: product.unitsLabel, validity: product.validity ?? '',
          type: product.type, via: result.via ?? 'unknown',
        } as Record<string, unknown>,
        idempotency_key: idempotencyKey,
        correlation_id:  correlationId,
        retry_count:     result.retryCount ?? 0,
        latency_ms:      executeLatencyMs,
        category: isMared ? 'مارد' : 'فكة', amount: product.price,
        status: result.success ? 'success' : 'failed',
        error_message: result.error ?? null, performed_at: performedAt,
        api_response: (result.error ? (result.error ?? '').split('\n')[0] : (result.success ? 'Completed' : null)) ?? null,
        operation_source: 'vodafone_cash',
      });
      if (opData && !opErr) {
         if ((opData as any).operation_number) {
            opNumber = (opData as any).operation_number;
         }
      }
      if (opErr) {
        console.error('Database Insert Error:', opErr);

        if (!result.success) {
          await refundOperation(user.id);
          toast.error('⚠️ فشل تسجيل العملية — تم استرداد العملية', { description: 'يرجى إعادة المحاولة', duration: 8000 });
          setSubmitting(false); setLoadingStep(0);
          executingRef.current = false;
          return;
        } else {
          // إذا نجح الشحن لكن فشل التسجيل، لا نوقف التدفق كي تظهر الفاتورة للمستخدم
          toast.warning('⚠️ تم الشحن، ولكن تعذر تسجيل العملية مؤقتاً في السجل', { duration: 5000 });
        }
      }

      // ← العملية الفاشلة لا تُخصم — نسترد النقطة فوراً
      if (!result.success && !isAdmin) {
        await refundOperation(user.id);
      }

      opNumber = (opData as { operation_number?: number } | null)?.operation_number ?? null;
    } else if (!result.success && !isAdmin) {
      // فشل عبر Edge Function → استرداد النقطة
      await refundOperation(user.id);
    }
    const timeLabel = formatReceiptTime(performedAt);
    const dateLabel = formatReceiptDate(performedAt);
    const username  = profile?.username ?? user.email ?? 'المستخدم';

    // لو Edge Function سجّلت سيرفر-سايد → لا تُكرر الـ logs/notifications هنا
    if (!serverRegistered) {
      await insertSystemLog({
        user_id: user.id,
        level: result.success ? 'info' : 'warning',
        action: result.success ? 'recharge_success' : 'recharge_failed',
        message: result.success
          ? `شحن ناجح — ${product.displayName} — ${product.priceLabel} — ${trimPhone}${opNumber != null ? ` — #${opNumber}` : ''}`
          : `شحن فاشل — ${product.displayName} — ${trimPhone} — ${(result.error ?? '').split('\n')[0]}`,
        metadata: {
          idempotency_key: idempotencyKey,
          correlation_id:  correlationId,
          operation_number: opNumber,
          product_id:      product.id,
          phone:           trimPhone,
          category:        isMared ? 'مارد' : 'فكة',
          amount:          product.price,
          execution_layer: result.via ?? 'unknown',
          retry_count:     result.retryCount ?? 0,
          latency_ms:      executeLatencyMs,
          error_layer: result.success ? null : (result.via === 'native' ? 'Vodafone-API' : result.via === 'bridge' ? 'Bridge' : 'EdgeFunction'),
          raw_error:   result.error ?? null,
          debug_steps_count: result.debugSteps?.length ?? 0,
        },
      });

      await logActivity(
        user.id, 'recharge',
        result.success ? `شحن ناجح — ${product.displayName}` : `شحن فاشل — ${product.displayName}`,
        `الرقم: ${trimPhone} | المبلغ: ${product.priceLabel}${opNumber != null ? ` | #${opNumber}` : ''}`,
        { product_id: product.id, phone: trimPhone, amount: product.price, status: result.success ? 'success' : 'failed', operation_number: opNumber }
      );

      await sendNotification({
        user_id: user.id,
        title: result.success ? `✅ تم شحن ${product.displayName}` : `❌ فشل الشحن — ${product.displayName}`,
        body: result.success
          ? `المستخدم: ${username}\nالرقم: ${trimPhone}${opNumber != null ? `\nرقم العملية: #${opNumber}` : ''}\nالتاريخ: ${dateLabel}\nالوقت: ${timeLabel}\nالحالة: ناجحة`
          : `المستخدم: ${username}\nالرقم: ${trimPhone}\nالتاريخ: ${dateLabel}\nالوقت: ${timeLabel}\nالسبب: ${(result.error ?? 'تعذّر تنفيذ الشحن').split('\n')[0]}`,
        type: 'operation',
        is_global: false,
      });
    }

    setSubmitting(false);
    setLoadingStep(0);
    executingRef.current = false;

    if (result.success) {
      toast.success('✅ تم الشحن بنجاح!', { description: `${product.displayName} — ${product.priceLabel} للرقم ${trimPhone}`, duration: 5000 });
      // عرض الإيصال داخل نفس الشاشة بدلاً من الإغلاق الفوري
      setReceipt({
        opNumber:      opNumber,
        receiverPhone: trimPhone,
        productName:   product.displayName,
        cardPrice:     product.priceLabel,
        units:         product.unitsLabel,
        validity:      product.validity ?? '',
        category:      isMared ? 'مارد' : 'فكة',
        time:          timeLabel,
        date:          dateLabel,
        correlationId: correlationId,
        latencyMs:     executeLatencyMs,
        via:           result.via ?? 'native',
        status:        'success',
      });
      onSuccess();
    } else {
      // تحويل خطأ API إلى رسالة عربية موحدة — لا تقنيات للمستخدم
      const mapped = parseApiError(result.error);
      setLastError(mapped.arabicMessage);
      setLastErrorType(mapped.errorType);
      lastFailedAtRef.current = Date.now(); // بدء cooldown 15 ثانية
      toast.error('❌ فشل الشحن', { description: getFirstLine(mapped.arabicMessage), duration: 8000 });
    }
  };

  return (
    <>
      <TrialExhaustedPopup open={trialExhausted} opsUsed={trialOpsUsed} maxOps={trialMaxOps} isTrial={isTrialMode} />
      <Dialog open={open} onOpenChange={v => { if (!v && !submitting && !receipt) onClose(); }}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] w-[92vw] md:max-w-[460px] p-0 border-0 max-h-[92dvh] overflow-y-auto gap-0"
          style={{ background: '#0a0000', border: '1px solid rgba(230,0,0,0.25)', borderRadius: 20 }}
          dir="rtl"
        >
          {product && !receipt && (
            <div className="flex flex-col">
              {/* ── شريط علوي أحمر ── */}
              <div className="h-1 w-full rounded-t-[20px] shrink-0"
                style={{ background: 'linear-gradient(90deg,#E60000,#ff3333 50%,#E60000)' }} />

              {/* ── Header: لوجو + اسم الكارت ── */}
              <div className="flex items-center gap-3 px-5 py-4 border-b"
                style={{ borderColor: 'rgba(230,0,0,0.15)', background: 'rgba(230,0,0,0.04)' }}>
                <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border"
                  style={{ borderColor: 'rgba(230,0,0,0.3)', background: '#0d0000' }}>
                  {logoUrl
                    ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                    : <VFLogo size={28} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-black text-white text-balance">تنفيذ شحن كارت</p>
                  <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(230,0,0,0.6)' }}>
                    {product.id}
                  </p>
                </div>
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: isMared ? 'rgba(247,201,72,0.15)' : 'rgba(230,0,0,0.15)', color: isMared ? '#F7C948' : '#ff6666', border: `1px solid ${isMared ? 'rgba(247,201,72,0.3)' : 'rgba(230,0,0,0.3)'}` }}>
                  {isMared ? '🟡 مارد' : '🔴 فكة'}
                </span>
              </div>

              <div className="p-5 space-y-4">

                {/* ── بنر قفل Vodafone Cash — يحجب النموذج بالكامل ── */}
                {!isAdmin && profile?.vodafone_pin_locked_at && (() => {
                  const lockedAt = new Date(profile.vodafone_pin_locked_at!).getTime();
                  const hoursLeft = Math.max(0, Math.ceil(24 - (Date.now() - lockedAt) / 3600000));
                  const isStillLocked = hoursLeft > 0;
                  if (!isStillLocked) return null;
                  return (
                    <div className="rounded-2xl border p-5 space-y-4 text-center"
                      style={{ background: 'rgba(251,146,60,0.06)', borderColor: 'rgba(251,146,60,0.35)' }}>
                      <div className="text-4xl">🔒</div>
                      <div className="space-y-1.5">
                        <p className="text-sm font-black text-orange-300">حسابك مجمَّد مؤقتاً</p>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                          تم تجميد Vodafone Cash بسبب تكرار الرقم السري الخاطئ 3 مرات.
                        </p>
                      </div>
                      <div className="rounded-xl py-3 px-4"
                        style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)' }}>
                        <p className="text-[10px] font-semibold mb-1" style={{ color: 'rgba(251,146,60,0.7)' }}>الوقت المتبقي للفتح التلقائي</p>
                        <p className="text-2xl font-black tabular-nums text-orange-300">{hoursLeft} ساعة</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>لفتح الحساب فوراً:</p>
                        {['اتصل على 888 من خطك وقل "رقم سري"', 'أو اكتب #912# وأرسل من نفس الخط'].map((s, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className="text-[10px] font-black text-orange-400 shrink-0">{i + 1}.</span>
                            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{s}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        سيُفتح الحساب تلقائياً عند انتهاء المدة
                      </p>
                    </div>
                  );
                })()}

                {/* ── بطاقة تفاصيل الكارت 2×2 ── */}
                <div className="rounded-2xl overflow-hidden border"
                  style={{ borderColor: 'rgba(230,0,0,0.2)', background: 'linear-gradient(135deg,rgba(230,0,0,0.06) 0%,transparent 60%)' }}>
                  {/* اسم الكارت */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b"
                    style={{ borderColor: 'rgba(230,0,0,0.12)', background: 'rgba(230,0,0,0.06)' }}>
                    <ProductIcon type={product.type} className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                    <p className="text-sm font-black text-white flex-1 min-w-0 truncate text-balance">{product.name}</p>
                  </div>
                  {/* شبكة 2×2 */}
                  <div className="grid grid-cols-2">
                    {[
                      { label: 'سعر الكارت',    value: product.priceLabel,  big: true },
                      { label: 'عدد الوحدات',   value: product.unitsLabel,  big: false },
                      { label: 'الرصيد الصافي', value: product.net_balance > 0 ? `${product.net_balance.toFixed(2)} ج` : '—', big: false },
                      { label: 'مدة الصلاحية',  value: validity,            big: false },
                    ].map((cell, i) => (
                      <div key={i} className="p-3 text-right border-b border-l last:border-b-0"
                        style={{ borderColor: 'rgba(230,0,0,0.1)' }}>
                        <p className="text-[10px] mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{cell.label}</p>
                        <p className={`font-black tabular-nums leading-none ${cell.big ? 'text-2xl' : 'text-sm'}`}
                          style={{ color: accentColor }}>{cell.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── رسالة تنبيه قبل التنفيذ ── */}
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <span className="text-amber-400 shrink-0 mt-0.5 text-sm leading-none">⚠</span>
                  <p className="text-[11px] leading-relaxed text-pretty" style={{ color: 'rgba(245,200,100,0.8)' }}>
                    يرجى التأكد قبل التنفيذ من عدم وجود أي مبلغ مستحق أو استلاف أو نوتة على الخط المرسل إليه، لأن ذلك قد يؤدي إلى عدم إتمام العملية بنجاح.
                  </p>
                </div>

                {/* ── حالة الاتصال ── */}
                {(() => {
                  if (isNativeAPK) {
                    if (!networkInfo) return (
                      <div className="flex items-center gap-2.5 p-3 rounded-xl border"
                        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>قراءة بيانات الشبكة…</p>
                      </div>
                    );
                    if (isVodafoneReady) return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5 p-3 rounded-xl border"
                          style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.25)' }}>
                          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                          <p className="text-xs font-bold text-green-400">فودافون Native — جاهز للتنفيذ المباشر</p>
                        </div>
                        {networkInfo?.isWifiActive && (
                          <div className="flex items-center gap-2.5 p-3 rounded-xl border"
                            style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)' }}>
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            <p className="text-xs text-amber-400">⚠️ الـ WiFi مفعّل — إذا فشل الشحن أوقفه وأعد المحاولة</p>
                          </div>
                        )}
                      </div>
                    );
                    return (
                      <div className="rounded-xl border overflow-hidden"
                        style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)' }}>
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <p className="text-xs font-bold text-amber-400">APK مُثبَّت — الشبكة غير مكتملة</p>
                        </div>
                        {isAdmin && (
                          <div className="px-3 pb-2.5 space-y-1 text-[11px] border-t" style={{ borderColor: 'rgba(245,158,11,0.15)' }}>
                            {[
                              { label: 'SIM',      value: networkInfo.simOperatorName,    ok: networkInfo.isVodafoneSim },
                              { label: 'الشبكة',   value: networkInfo.networkOperatorName, ok: networkInfo.isVodafoneMobile },
                              { label: 'البيانات', value: networkInfo.activeNetwork,       ok: networkInfo.isMobileDataActive },
                            ].map(r => (
                              <div key={r.label} className="flex items-center justify-between pt-1">
                                <span style={{ color: 'rgba(255,255,255,0.35)' }}>{r.label}</span>
                                <span className="font-bold font-mono" style={{ color: r.ok ? '#4ade80' : '#f87171' }}>{r.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  if (bridgeActive === null) return (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl border"
                      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>جارٍ فحص الجسر المحلي…</p>
                    </div>
                  );
                  if (bridgeActive === true) return (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl border"
                      style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.25)' }}>
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-green-400">الجسر المحلي متصل</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>سيتم تنفيذ الشحن مباشرة عبر شبكة فودافون.</p>
                      </div>
                    </div>
                  );
                  return (
                    <div className="flex flex-col gap-3 p-4 rounded-xl border"
                      style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.25)' }}>
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-amber-400">يلزم تشغيل جسر الشحن أولاً</p>
                          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                            شغّل سكريبت الجسر على موبايلك بشبكة فودافون.
                          </p>
                        </div>
                      </div>
                      <a href="/vodafone_bridge.py" download="vodafone_bridge.py"
                        className="flex items-center justify-center gap-2 w-full h-10 font-bold text-sm rounded-xl"
                        style={{ background: 'rgba(247,201,72,0.15)', color: '#F7C948', border: '1px solid rgba(247,201,72,0.3)' }}>
                        <span>📥</span> تحميل سكريبت الجسر
                      </a>
                    </div>
                  );
                })()}

                {/* ── مراحل التنفيذ ── */}
                {submitting && (
                  <div className="rounded-xl p-3.5 border space-y-2.5"
                    style={{ background: 'rgba(230,0,0,0.05)', borderColor: 'rgba(230,0,0,0.2)' }}>
                    {[
                      { step: 1, label: 'تسجيل الدخول للمحفظة' },
                      { step: 2, label: 'التحقق من الرصيد والبيانات' },
                      { step: 3, label: 'تنفيذ عملية الشحن' },
                    ].map(({ step, label }) => (
                      <div key={step} className="flex items-center gap-2.5">
                        {loadingStep > step ? (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-green-500">
                            <span className="text-white text-[10px] font-black">✓</span>
                          </div>
                        ) : loadingStep === step ? (
                          <Loader2 className="w-5 h-5 animate-spin shrink-0 text-primary" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border shrink-0" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
                        )}
                        <span className={`text-sm ${loadingStep >= step ? 'text-white font-medium' : ''}`}
                          style={loadingStep < step ? { color: 'rgba(255,255,255,0.3)' } : {}}>
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── بطاقة التعليمات: رقم المحفظة يُقرأ تلقائياً ── */}
                <div className="rounded-2xl border overflow-hidden"
                  style={{ background: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)' }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b"
                    style={{ borderColor: 'rgba(34,197,94,0.15)', background: 'rgba(34,197,94,0.08)' }}>
                    <Info className="w-3.5 h-3.5 shrink-0" style={{ color: '#4ade80' }} />
                    <p className="text-[11px] font-black" style={{ color: '#4ade80' }}>سيتم التعرف على رقم المحفظة تلقائياً</p>
                  </div>
                  <ul className="px-4 py-3 space-y-1.5">
                    {[
                      'شغّل بيانات Vodafone من نفس الخط المرتبط بمحفظة Vodafone Cash.',
                      'لا تستخدم بيانات من شريحة أخرى.',
                      'في حالة استخدام WiFi أو بيانات خط آخر لن يتم التعرف على المحفظة.',
                      'تأكد من صحة الرقم السري قبل التنفيذ.',
                    ].map((tip, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: '#4ade80', opacity: 0.6 }} />
                        <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{tip}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* ── حقل رقم المستفيد ── */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-white">رقم الهاتف المستفيد</Label>
                  <div className="relative rounded-xl overflow-hidden border h-12"
                    style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10" style={{ color: 'rgba(255,255,255,0.35)' }} />
                    <Input type="tel" inputMode="numeric" maxLength={11}
                      className="border-0 focus-visible:ring-0 pr-9 text-right h-full text-base bg-transparent text-white placeholder:text-white/25"
                      placeholder="01xxxxxxxxx" value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} dir="ltr"
                      disabled={submitting} />
                  </div>
                </div>

                {/* ── حقل الرقم السري ── */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-white">الرقم السري للمحفظة</Label>
                  <div className="relative rounded-xl overflow-hidden border h-12"
                    style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10" style={{ color: 'rgba(255,255,255,0.35)' }} />
                    <Input type="password" inputMode="numeric"
                      className="border-0 focus-visible:ring-0 pr-9 text-right h-full text-base bg-transparent text-white placeholder:text-white/25"
                      placeholder="أدخل الرقم السري" value={pin}
                      onChange={e => setPin(e.target.value)} disabled={submitting} />
                  </div>
                  {/* تحذير قفل الحساب */}
                  <p className="text-[11px] pr-1 flex items-center gap-1" style={{ color: 'rgba(251,146,60,0.7)' }}>
                    <span>⚠️</span>
                    <span>رقم سري Vodafone Cash المكوّن من 6 أرقام — بعد 3 محاولات خاطئة يُقفل الحساب</span>
                  </p>
                </div>

                {/* ── بطاقة الخطأ — السبب والحل بشكل واضح ── */}
                {lastError && !submitting && (() => {
                  const locked       = isPinLocked(lastErrorType);
                  const unregistered = isUnregisteredMsisdn(lastErrorType);
                  const borderColor  = locked ? 'rgba(251,146,60,0.4)' : unregistered ? 'rgba(99,102,241,0.4)' : 'rgba(220,38,38,0.3)';
                  const bgColor      = locked ? 'rgba(251,146,60,0.08)' : unregistered ? 'rgba(99,102,241,0.08)' : 'rgba(220,38,38,0.08)';
                  const titleColor   = locked ? '#fb923c' : unregistered ? '#a5b4fc' : '#f87171';
                  const Icon         = locked ? AlertTriangle : XCircle;
                  const iconColor    = locked ? 'text-orange-400' : unregistered ? 'text-indigo-400' : 'text-red-400';

                  // تقسيم الرسالة إلى السبب والحل
                  const parts         = lastError.split('\n\n');
                  const sababLine     = parts[0] ?? '';
                  const hallLines     = parts.slice(1).join('\n').trim().split('\n').filter(Boolean);
                  const hasSolution   = hallLines.length > 0;

                  return (
                    <div className="rounded-xl border p-4 space-y-3"
                      style={{ background: bgColor, borderColor }}>
                      {/* السبب */}
                      <div className="flex items-start gap-2.5">
                        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
                        <div className="flex-1 min-w-0">
                          {sababLine.split('\n').filter(Boolean).map((line, i) => (
                            <p key={i} className="text-xs leading-relaxed font-medium" style={{ color: titleColor }}>{line}</p>
                          ))}
                        </div>
                      </div>

                      {/* الحل */}
                      {hasSolution && (
                        <div className="pt-2.5 border-t space-y-1.5" style={{ borderColor: locked ? 'rgba(251,146,60,0.2)' : 'rgba(220,38,38,0.2)' }}>
                          <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>الحل</p>
                          {hallLines.map((line, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <span className="text-[9px] shrink-0 mt-1" style={{ color: titleColor }}>▸</span>
                              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                                {line.replace(/^[•\-]\s*/, '')}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* تحذير إضافي عند القفل */}
                      {locked && (
                        <div className="pt-2 border-t" style={{ borderColor: 'rgba(251,146,60,0.2)' }}>
                          <p className="text-[11px] font-bold text-orange-300">⛔ لا تحاول مجدداً الآن — محاولات إضافية لن تُفيد.</p>
                        </div>
                      )}

                      {/* نصائح الشبكة */}
                      {shouldShowNetworkTips(lastErrorType) && (
                        <div className="pt-2 border-t" style={{ borderColor: 'rgba(220,38,38,0.2)' }}>
                          <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>تحقق أيضاً</p>
                          {['أوقف الـ WiFi وشغّل بيانات الهاتف (4G)', 'تأكد أن الشريحة النشطة هي Vodafone', 'أعد تشغيل بيانات الهاتف ثم حاول مجدداً'].map((tip, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <span className="text-[9px] shrink-0 mt-1 text-red-400">▸</span>
                              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{tip}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Debug Panel — Admin فقط */}
                {isAdmin && debugSteps.length > 0 && !submitting && (
                  <div className="rounded-xl overflow-hidden border" style={{ background: '#080d14', borderColor: '#ffffff10' }}>
                    <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: '#ffffff08', background: '#0d1523' }}>
                      <Database className="w-3.5 h-3.5 shrink-0" style={{ color: '#00E5FF' }} />
                      <span className="text-[10px] font-bold tracking-widest font-mono" style={{ color: '#00E5FF70' }}>CHARGE DEBUG</span>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                      {debugSteps.map(s => (
                        <div key={s.step} className="px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono shrink-0 w-12 text-right" style={{ color: '#ffffff25' }}>Step {s.step}</span>
                            <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0 ${s.status==='pass'?'text-green-400 bg-green-400/10':s.status==='fail'?'text-red-400 bg-red-400/10':'text-amber-400 bg-amber-400/10'}`}>
                              {s.status.toUpperCase()}
                            </span>
                            <span className="text-[10px] font-mono font-semibold truncate" style={{ color: s.status==='pass'?'#4ade80':s.status==='fail'?'#f87171':'#fbbf24' }}>
                              {s.label}
                            </span>
                          </div>
                          <p className="text-[10px] font-mono pl-14 break-all leading-relaxed" style={{ color: '#ffffff40' }}>{s.detail}</p>
                          {s.inspect && (
                            <div className="ml-14 mt-1.5 rounded-lg border overflow-hidden" style={{ borderColor: '#00E5FF12', background: '#050810' }}>
                              <div className="px-2 py-1 border-b" style={{ borderColor: '#00E5FF08', background: '#0a1020' }}>
                                <span className="text-[9px] font-bold font-mono tracking-widest" style={{ color: '#00E5FF50' }}>RAW RESPONSE</span>
                              </div>
                              <div className="p-2 space-y-0.5 text-[9px] font-mono">
                                <Row k="HTTP Status" v={String(s.inspect.httpStatus)} c={s.inspect.httpStatus===200?'#4ade80':'#f87171'} />
                                <Row k="Token From"  v={s.inspect.tokenExtractedFrom} c={s.inspect.tokenExtractedFrom!=='NONE'?'#4ade80':'#f87171'} />
                                <Row k="Raw (500c)"  v={s.inspect.rawFirst5000.slice(0,500)||'(empty)'} />
                              </div>
                            </div>
                          )}
                          {!s.inspect && s.raw && (
                            <p className="text-[9px] font-mono pl-14 break-all" style={{ color: '#ffffff20' }}>
                              {s.raw.slice(0,180)}{s.raw.length>180?'…':''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── زر التنفيذ ── */}
                {(() => {
                  const canExecute = isVodafoneReady || (!isNativeAPK && bridgeActive === true);
                  const accountLocked = isPinLocked(lastErrorType);
                  const isRetry = !!lastError && !accountLocked;
                  const isDisabled = submitting || !phone || !pin || !canExecute || accountLocked;
                  return (
                    <button
                      className="w-full h-14 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                      style={{
                        background: accountLocked
                          ? 'rgba(251,146,60,0.15)'
                          : canExecute
                            ? 'linear-gradient(135deg,#E60000,#cc0000)'
                            : 'rgba(255,255,255,0.08)',
                        boxShadow: (!accountLocked && canExecute) ? '0 0 28px rgba(230,0,0,0.4), 0 4px 16px rgba(230,0,0,0.2)' : 'none',
                        border: accountLocked
                          ? '1px solid rgba(251,146,60,0.3)'
                          : canExecute
                            ? '1px solid rgba(230,0,0,0.4)'
                            : '1px solid rgba(255,255,255,0.1)',
                        color: accountLocked ? 'rgba(251,146,60,0.6)' : canExecute ? '#fff' : 'rgba(255,255,255,0.3)',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled && !accountLocked ? 0.7 : 1,
                      }}
                      disabled={isDisabled}
                      onClick={handleExecute}
                    >
                      {submitting
                        ? <><Loader2 className="w-5 h-5 animate-spin" />جارٍ التنفيذ…</>
                        : accountLocked
                          ? <><AlertTriangle className="w-5 h-5" />الحساب مجمَّد — انتظر 24 ساعة</>
                          : !canExecute
                            ? isNativeAPK
                              ? <><Signal className="w-5 h-5" />فعّل بيانات فودافون أولاً</>
                              : <><AlertTriangle className="w-5 h-5" />شغّل الجسر أولاً</>
                            : isRetry
                              ? <><Zap className="w-5 h-5" />إعادة المحاولة</>
                              : <><Zap className="w-5 h-5" />{isVodafoneReady ? 'تنفيذ Native مباشر' : 'تنفيذ الشحن الآن'}</>}
                    </button>
                  );
                })()}

                {/* ── زر الإلغاء ── */}
                <button
                  className="w-full h-11 rounded-2xl font-medium text-sm transition-all active:scale-[0.97]"
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.35)',
                  }}
                  onClick={onClose}
                  disabled={submitting}
                >
                  إلغاء
                </button>

              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              شاشة الإيصال — تظهر بعد نجاح الشحن مباشرة
          ══════════════════════════════════════════════════════ */}
          {receipt && (
            <ReceiptView
              invoice={receipt}
              onChargeAnother={() => { setReceipt(null); setPhone(''); setPin(''); setLastError(null); }}
              onClose={onClose}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── شريط تنبيه فترة السماح ──
function GracePeriodBanner({ graceEndsAt, onRenew }: { graceEndsAt: string; onRenew: () => void }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const tick = () => {
      const diff = new Date(graceEndsAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('00:00'); return; }
      const m = String(Math.floor(diff / 60000)).padStart(2, '0');
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
      setRemaining(`${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [graceEndsAt]);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-warning/15 border-b border-warning/30">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-warning text-lg shrink-0">⚠️</span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-warning-foreground text-balance">انتهى الاشتراك</p>
          <p className="text-[11px] text-muted-foreground">فترة السماح تنتهي خلال {remaining}</p>
        </div>
      </div>
      <button onClick={onRenew}
        className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-warning text-warning-foreground hover:bg-warning/90 transition-all">
        جدد الآن
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// الصفحة الرئيسية — Home Dashboard
// ══════════════════════════════════════════════════════
export default function HomePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { config } = useRuntimeConfig();
  const { isMerchantClient } = useMerchantClient();
  const { isSubActive, subscriptionBlockReason } = useMerchantClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { getUrl } = useAssets();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [opsInfo, setOpsInfo]            = useState<SubscriptionOpsInfo | null>(null);
  const [lastOp, setLastOp] = useState<Operation | null>(null);
  const [opsCount, setOpsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [activationOpen, setActivationOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<VodafoneProduct | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'fakka' | 'mared'>('all');
  // Dialog تعطيل كارت (صيانة / تطوير / غير متوفر) — ديناميكي من DB
  const [disabledProductOpen, setDisabledProductOpen] = useState(false);
  // ── Product Config من DB — stale-while-revalidate ──────────────────────
  const [productConfigs, setProductConfigs] = useState<ProductConfig[]>([]);
  // رقم الهاتف المُمرَّر من صفحة المفضلة "شحن سريع"
  const prefillPhone = (location.state as { prefillPhone?: string; preSelectProduct?: VodafoneProduct } | null)?.prefillPhone ?? '';

  // ── فتح نافذة الشحن تلقائياً عند الانتقال من واجهة عميل التاجر ──────────
  useEffect(() => {
    const state = location.state as { preSelectProduct?: VodafoneProduct } | null;
    if (state?.preSelectProduct) {
      // نستخدم setTimeout لضمان تحميل الصفحة أولاً
      const t = setTimeout(() => {
        setSelectedProduct(state.preSelectProduct!);
        setSheetOpen(true);
        // مسح الـ state لمنع إعادة الفتح عند العودة
        window.history.replaceState({}, '', window.location.pathname);
      }, 100);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  // وضع التصحيح: للمسؤول فقط أو عند وجود ?debug=true في الرابط
  const debugMode = isAdmin || new URLSearchParams(location.search).get('debug') === 'true';
  const headerLogoUrl = getUrl('header_logo');
  const heroLogoUrl   = getUrl('home_hero_logo');   // P8: لوجو Hero الديناميكي
  const welcomeIconUrl = getUrl('welcome_icon');
  const homeBannerUrl = getUrl('home_banner');

  const loadData = () => {
    if (!user || !profile) return;
    let isMounted = true;

    // ── cache-first: اعرض البيانات المخزنة فوراً قبل أي network call ──
    Promise.all([
      cacheGetStale<ReturnType<typeof getUserSubscription> extends Promise<infer T> ? T : never>(`cache_subscription_${user.id}`),
      cacheGetStale<{ data: Operation[]; count: number }>(`cache_ops_p1_${user.id}`),
    ]).then(([cachedSub, cachedOps]) => {
      if (!isMounted) return;
      if (cachedSub !== null) { setSubscription(cachedSub); setLoading(false); }
      if (cachedOps !== null) { setLastOp(cachedOps.data[0] ?? null); setOpsCount(cachedOps.count); }
    }).catch(() => {});

    Promise.all([
      getUserSubscription(user.id),
      getUserOperations(user.id, 1),
      getActivityTimeline(user.id, 10),
      getUnreadNotificationCount(user.id),
      getSubscriptionOpsInfo(user.id),
    ]).then(async ([sub, ops, acts, unread, ops_info]) => {
      if (!isMounted) return;
      // حفظ في الكاش لاستخدامه عند إعادة الفتح
      cacheSet(`cache_subscription_${user.id}`, sub, undefined).catch(() => {});
      cacheSet(`cache_ops_p1_${user.id}`, ops, undefined).catch(() => {});
      setLastOp(ops.data[0] ?? null);
      setOpsCount(ops.count);
      setActivities(acts);
      setUnreadCount(unread);
      setOpsInfo(ops_info);
      setLoading(false);

      // ── إذا نفدت الحصة وكان الوضع BY_USAGE → إعادة جلب الاشتراك المُنتهَى ──
      let effectiveSub = sub;
      if (!isAdmin && ops_info?.isExhaustedByUsage && sub?.status === 'active') {
        const freshSub = await getUserSubscription(user.id);
        effectiveSub = freshSub;
        if (isMounted) getUnreadNotificationCount(user.id).then(setUnreadCount);
      }
      if (isMounted) setSubscription(effectiveSub);

      if (!isAdmin && !isMerchantClient && (!effectiveSub || effectiveSub.status !== 'active')) {
        // فحص فترة السماح
        if (effectiveSub?.in_grace_period && effectiveSub.grace_ends_at) {
          const graceExpired = new Date(effectiveSub.grace_ends_at) < new Date();
          if (graceExpired) {
            if (isMounted) navigate('/activate', { replace: true });
            return;
          }
          // لا يزال في فترة السماح — يبقى على الصفحة
        } else if (!effectiveSub?.in_grace_period) {
          // ابدأ فترة السماح إن لم تكن بدأت بعد
          if (effectiveSub) {
            const graceEnds = new Date(Date.now() + 60 * 60 * 1000);
            await supabase.from('subscriptions').update({
              in_grace_period: true,
              grace_started_at: new Date().toISOString(),
              grace_ends_at: graceEnds.toISOString(),
            }).eq('user_id', user.id);
            if (isMounted) setSubscription({ ...effectiveSub, in_grace_period: true, grace_ends_at: graceEnds.toISOString() } as typeof effectiveSub);
          } else {
            if (isMounted) navigate('/activate', { replace: true });
            return;
          }
        }
      }

      // تحذير انتهاء الاشتراك: احتياطي من جهة الواجهة
      if (effectiveSub && effectiveSub.status === 'active' && effectiveSub.expires_at) {
        const daysLeft = Math.ceil((new Date(effectiveSub.expires_at).getTime() - Date.now()) / 86400000);
        if (daysLeft > 0 && daysLeft <= 3) {
          const alreadySent = await getExpiryNotificationSentToday(user.id);
          if (!alreadySent && isMounted) {
            await sendNotification({
              user_id: user.id,
              title: `⚠️ ينتهي اشتراكك خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`,
              body: `اشتراكك سينتهي في ${new Date(effectiveSub.expires_at).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. جدّد الآن لتجنب الانقطاع.`,
              type: 'subscription_renewal',
              is_global: false,
            });
            if (isMounted) getUnreadNotificationCount(user.id).then(setUnreadCount);
          }
        }
      }
    });
    return () => { isMounted = false; };
  };

  useEffect(() => {
    loadData(); // eslint-disable-line react-hooks/exhaustive-deps

    if (!user) return;

    // ── تحميل product_config بنظام stale-while-revalidate ──────────────
    staleWhileRevalidate<ProductConfig[]>(
      'cache_product_config_v2',
      () => getProductConfig(),
      (fresh) => setProductConfigs(fresh),
    ).then(cached => { if (cached) setProductConfigs(cached); }).catch(() => {});

    // Realtime: تحديث عداد الإشعارات لحظياً
    const channel = supabase
      .channel(`home-notifs-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        getUnreadNotificationCount(user.id).then(setUnreadCount);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-verify قفل Vodafone: إذا كان الحساب مقفولاً وانتهت مدة 24 ساعة → ارفع القفل تلقائياً ──
  useEffect(() => {
    if (!user || !profile?.vodafone_pin_locked_at || isAdmin) return;
    const lockedAt  = new Date(profile.vodafone_pin_locked_at).getTime();
    const hoursElapsed = (Date.now() - lockedAt) / 3600000;
    if (hoursElapsed >= 24) {
      // المدة انتهت — ارفع القفل في DB وحدّث profile محلياً
      supabase.from('profiles').update({
        vodafone_pin_locked_at: null,
        vodafone_lock_reason: null,
      }).eq('id', user.id).then(({ error }) => {
        if (!error) refreshProfile();
      });
    }
  }, [user?.id, profile?.vodafone_pin_locked_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const daysLeft       = subscription ? calcDaysRemaining(subscription.expires_at) : 0;
  // الحالة الفعلية: لا نعتمد فقط على القيمة المخزنة في DB
  const subActive      = !!(subscription?.status === 'active'
    && (!subscription?.expires_at || new Date(subscription.expires_at).getTime() > Date.now()));
  const isUnlimited    = subActive && !subscription?.expires_at && opsInfo?.opsLimit === null;
  const isExpiringSoon = !isUnlimited && daysLeft > 0 && daysLeft <= 7;

  // ── محرك التحقق من صحة الاشتراك (كل دقيقة + عودة من الخلفية + mount) ──
  useSubscriptionValidator({
    userId: user?.id ?? null,
    subscription,
    onUpdate: (fresh) => {
      if (fresh) setSubscription(fresh);
      else setSubscription(null);
    },
  });

  // Live countdown — يُحدَّث كل ثانية دائماً (إصلاح "أقل من يوم")
  const [liveTime, setLiveTime] = useState(() => fmtTimeLeft(subscription?.expires_at));
  useEffect(() => {
    if (!subscription?.expires_at || !subActive) return;
    const update = () => setLiveTime(fmtTimeLeft(subscription.expires_at));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [subscription?.expires_at, subActive]); // eslint-disable-line react-hooks/exhaustive-deps
  const isSuspendedSub = !isAdmin && subscription?.status === 'suspended';
  const isExpired      = !isAdmin && subscription?.status !== 'active' && !isSuspendedSub;

  // P3: badge نوع الاشتراك — يعرض الاسم الحقيقي للخطة من planLabel + PHASE 12 كل الحالات
  const subBadge: { label: string; color: string; bg: string } = (() => {
    if (isAdmin) return { label: '👑 مسؤول', color: '#00E5FF', bg: 'rgba(0,229,255,0.12)' };
    // PHASE 12: حالات خاصة قبل الفحص العام
    if (isSuspendedSub)                               return { label: '⏸ معلق',   color: '#F7C948', bg: 'rgba(247,201,72,0.12)' };
    if (subscription?.status === 'cancelled')         return { label: '🚫 ملغي',  color: '#ef4444', bg: 'rgba(239,68,68,0.10)' };
    if (!subActive)                                    return { label: '❌ منتهي', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
    const ct = opsInfo?.codeType;
    const planName = opsInfo?.planLabel;
    if (ct === 'trial') return { label: `⚡ ${planName ?? 'تجريبي'}`, color: '#F7C948', bg: 'rgba(247,201,72,0.12)' };
    if (ct === 'gift')  return { label: `🎁 ${planName ?? 'هدية'}`,   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' };
    if (ct === 'paid')  return { label: `📅 ${planName ?? 'شهري'}`,   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' };
    return { label: `💎 ${planName ?? 'Premium'}`, color: '#D4AF37', bg: 'rgba(212,175,55,0.12)' };
  })();

  const displayName = profile?.full_name ?? profile?.username ?? 'المستخدم';

  // ── دمج productConfigs من DB مع بيانات المنتجات الثابتة ───────────────
  // إذا وُجد config في DB → يُستخدم كمصدر الحقيقة للسعر / الوحدات / الصلاحية / الربح / الترتيب
  // إذا لم يُحمَّل بعد → تُستخدم القيم الثابتة كـ fallback (لا يختفي الكارت)
  const mergedProducts = useMemo((): VodafoneProduct[] => {
    // قبل تحميل أي config → عرض كل الكروت كما هي
    if (productConfigs.length === 0) {
      return [...FAKKA_PRODUCTS, ...MARED_PRODUCTS];
    }
    const cfgMap = new Map(productConfigs.map(c => [c.product_id, c]));
    const allBase = [...FAKKA_PRODUCTS, ...MARED_PRODUCTS];
    const merged = allBase
      .map(p => {
        const cfg = cfgMap.get(p.id);
        if (!cfg) return p; // لا يوجد config → الكارت بقيمه الثابتة

        // الكارت المخفي يُحذف من القائمة نهائياً
        if (!cfg.is_visible) return null;

        // تطبيق قيم DB إذا كانت موجودة
        const price     = cfg.price      ?? p.price;
        const units     = cfg.units      ?? p.units;
        const validity  = cfg.validity   ?? p.validity;
        const netBal    = cfg.net_balance ?? p.net_balance;
        // إعادة حساب labels من القيم الجديدة
        const priceLabel  = price  !== p.price  ? `${price} جنيه`         : p.priceLabel;
        const unitsLabel  = units  !== p.units  ? `${units} وحدة`         : p.unitsLabel;

        return {
          ...p,
          price,
          units,
          validity,
          net_balance: netBal,
          priceLabel,
          unitsLabel,
          // sort_order مخصص من DB يُستخدم في الترتيب
          _sortOrder: cfg.sort_order,
        } as VodafoneProduct & { _sortOrder?: number };
      })
      .filter((p): p is (VodafoneProduct & { _sortOrder?: number }) => p !== null);

    // ترتيب: sort_order من DB أولاً، ثم السعر كـ fallback
    merged.sort((a, b) => {
      const sa = (a as VodafoneProduct & { _sortOrder?: number })._sortOrder;
      const sb = (b as VodafoneProduct & { _sortOrder?: number })._sortOrder;
      if (sa != null && sb != null) return sa - sb;
      if (sa != null) return -1;
      if (sb != null) return 1;
      return a.price - b.price;
    });

    return merged;
  }, [productConfigs]);

  // المنتجات المعروضة — مفلترة حسب التبويب، مصدرها mergedProducts (من DB)
  const displayedFakka = useMemo(() =>
    (activeTab === 'mared' ? [] : mergedProducts.filter(p => p.category === 'fakka')),
    [activeTab, mergedProducts]);

  const displayedMared = useMemo(() =>
    (activeTab === 'fakka' ? [] : mergedProducts.filter(p => p.category === 'mared')),
    [activeTab, mergedProducts]);

  const handleSelectProduct = (product: VodafoneProduct) => {
    if (!subActive && !isAdmin && !isMerchantClient) {
      toast.error('اشتراكك غير نشط، يرجى التفعيل أولاً');
      navigate('/activate'); return;
    }
    // فحص اشتراك التاجر لعملاء التجار
    if (isMerchantClient && !isSubActive) {
      toast.error(subscriptionBlockReason || 'اشتراكك مع التاجر غير نشط. تواصل مع تاجرك.', { duration: 4000 });
      return;
    }

    // ── فحص حالة الكارت من DB (product_config) ─────────────────────────
    const cfg = productConfigs.find(c => c.product_id === product.id);
    if (cfg) {
      // كارت مخفي — الكارت لا يظهر في القائمة أصلاً لكن كحماية إضافية
      if (!cfg.is_visible) return;

      // حالات التوقف: صيانة / تطوير / غير متوفر
      if (['maintenance', 'development', 'unavailable'].includes(cfg.status)) {
        setDisabledProductOpen(true);
        return;
      }

      // تعطيل التنفيذ فقط — الكارت ظاهر لكن لا ينفّذ
      if (cfg.status === 'disabled_execution') {
        setDisabledProductOpen(true);
        return;
      }
    } else {
      // fallback: الحماية القديمة لكارت 26 جنيه إذا لم يُحمَّل config بعد
      if (product.id === 'Fakka_26_Unite') {
        setDisabledProductOpen(true);
        return;
      }
    }

    setSelectedProduct(product);
    setSheetOpen(true);
  };

  if (loading) {
    // skeleton بسيط بدلاً من شاشة تحميل كاملة تحجب المحتوى
    return (
      <div className="pb-6 space-y-4 px-4 pt-4" dir="rtl">
        <div className="h-32 rounded-2xl bg-muted animate-pulse" />
        <div className="h-48 rounded-2xl bg-muted animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6 space-y-0 page-enter" dir="rtl">
      <ExpiryModal open={!isMerchantClient && isExpired && !subscription?.in_grace_period} reason="expired" />
      {/* PHASE 7: نافذة التعليق — تظهر بدل "انتهى اشتراكك" عند التعليق */}
      <ExpiryModal
        open={!isMerchantClient && isSuspendedSub}
        reason="suspended"
        suspendReason={(subscription as (typeof subscription & { suspend_reason?: string | null }))?.suspend_reason}
      />

      {/* ── شريط فترة السماح — يظهر للمستخدمين الذين انتهى اشتراكهم ولم تنته ساعة السماح ── */}
      {!isAdmin && !isMerchantClient && subscription?.in_grace_period && subscription.grace_ends_at && (
        <GracePeriodBanner graceEndsAt={subscription.grace_ends_at} onRenew={() => navigate('/activate')} />
      )}

      {/* ══════════════════════════════════════
          1. HERO HEADER — ثابت أعلى الصفحة
         ══════════════════════════════════════ */}
      <div className="relative overflow-hidden px-4 pt-5 pb-5"
        style={{ background: 'var(--gradient-hero)', borderBottom: '1px solid rgba(0,229,255,0.10)' }}>
        {/* خلفية decorative */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-primary/6 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-24 h-24 rounded-full bg-accent/6 blur-2xl" />
        </div>
        <div className="relative z-10 space-y-2">
          {/* اسم التطبيق + شعار ديناميكي */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
          {/* P8: لوجو Hero الديناميكي — fallback فوري محلي بدون شبكة */}
          <img
            src={heroLogoUrl || headerLogoUrl || HEADER_FALLBACK_LOGO}
            alt="Logo"
            className="w-10 h-10 rounded-xl object-cover shrink-0 border border-primary/20"
            onError={(e) => { (e.target as HTMLImageElement).src = '/vfp-logo.png'; }}
          />
              <div className="space-y-0.5">
                <h1 className="text-xl font-black tracking-tight text-balance" style={{
                  background: 'linear-gradient(90deg,#00E5FF,#F7C948)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  Vodafone Fakka Premium
                </h1>
                <p className="text-[11px] text-muted-foreground font-medium tracking-wide">
                  Smart Vodafone Cash Cards Platform
                </p>
              </div>
            </div>
            {/* زر الإشعارات */}
            <button onClick={() => setNotifOpen(true)}
              className="relative w-9 h-9 rounded-xl border border-primary/20 bg-primary/8 flex items-center justify-center shrink-0 hover:bg-primary/15 transition-colors">
              <Bell className="w-4 h-4 text-primary" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Developer Badge — Admin فقط */}
          {isAdmin && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/8">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[11px] font-bold text-accent tracking-wide">Nader Akram</span>
              <span className="text-[10px] text-foreground/50">•</span>
              <span className="text-[10px] text-foreground/60 font-medium">Founder & Developer</span>
            </div>
          )}
        </div>
      </div>

      {/* تنبيه انتهاء الاشتراك — يُخفى لعملاء التاجر (لديهم نظام اشتراك منفصل) */}
      {!isMerchantClient && (
      <div className="px-4 pt-3">
        <SubscriptionAlertBanner
          status={(() => {
            if (isAdmin) return 'admin' as SubStatus;
            if (!subActive) return (subscription?.status === 'cancelled' ? 'cancelled' : 'expired') as SubStatus;
            if (daysLeft === 0) return 'expiring' as SubStatus;
            if (daysLeft <= 3) return 'critical' as SubStatus;
            if (daysLeft <= 7) return 'expiring' as SubStatus;
            return 'active' as SubStatus;
          })()}
          isAdmin={isAdmin}
          opsRem={isAdmin ? null : (opsInfo?.opsLimit != null ? Math.max(0, opsInfo.opsLimit - (opsInfo.opsUsed ?? 0)) : null)}
          opsLimit={isAdmin ? null : (opsInfo?.opsLimit ?? null)}
          exhaustedByUsage={!isAdmin && !!(opsInfo?.isExhaustedByUsage)}
          daysLeft={isUnlimited ? 999 : daysLeft}
          hoursLeft={subscription?.expires_at ? Math.max(0, Math.floor((new Date(subscription.expires_at).getTime() - Date.now()) / 3600000)) : 0}
          isCancelled={subscription?.status === 'cancelled'}
          onRenew={() => setActivationOpen(true)}
        />
      </div>
      )}

      {/* ══════════════════════════════════════
          2. WELCOME CARD — Premium Redesign
         ══════════════════════════════════════ */}
      <div className="px-4 pt-3">
        {/* ── بطاقة الترحيب Premium ── */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg,#0a0000 0%,#1a0000 50%,#0d0d0d 100%)',
            border: '1.5px solid rgba(230,0,0,0.25)',
            boxShadow: '0 4px 32px rgba(230,0,0,0.12), 0 1px 0 rgba(255,255,255,0.04) inset',
          }}
        >
          {/* top glow line */}
          <div className="h-px w-full" style={{ background: 'linear-gradient(90deg,transparent,#E6000080,transparent)' }} />
          {/* bg radial glow */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 50% at 85% 15%,rgba(230,0,0,0.12),transparent)' }} />

          <div className="relative p-4 space-y-4">
            {/* ── Header row ── */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 flex-1 min-w-0">
                {/* Badge: منتهي فقط عند الانتهاء — لا تكرار نوع الخطة */}
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-black tracking-wider"
                  style={{ borderColor: `${subBadge.color}40`, background: subBadge.bg, color: subBadge.color }}
                >
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: subBadge.color }} />
                  {subBadge.label}
                </span>
                {/* Username — white bold + red glow */}
                <h2
                  className="text-2xl font-black leading-tight text-white"
                  style={{
                    textShadow: '0 0 12px rgba(230,0,0,0.55), 0 0 24px rgba(230,0,0,0.25)',
                  }}
                >
                  {displayName}
                </h2>
                <p className="text-[11px] text-muted-foreground/80 text-pretty leading-relaxed">
                  منصة احترافية لإدارة وشحن كروت Vodafone Cash بسرعة وأمان<br />مع متابعة الاشتراك والعمليات بشكل لحظي.
                </p>
              </div>
              {/* Logo */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg,rgba(230,0,0,0.20),rgba(180,0,0,0.12))',
                  border: '1.5px solid rgba(230,0,0,0.35)',
                  boxShadow: '0 0 16px rgba(230,0,0,0.25)',
                }}
              >
                {(heroLogoUrl || headerLogoUrl || welcomeIconUrl) ? (
                  <img src={heroLogoUrl || headerLogoUrl || welcomeIconUrl!} alt="logo"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/vfp-logo.png'; }} />
                ) : (
                  <VFLogo size={32} />
                )}
              </div>
            </div>

            {/* ── Stats Grid — Premium Cards ── */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* 1. الكروت المتاحة */}
              {[
                {
                  label: 'الكروت المتاحة',
                  value: String(ALL_PRODUCTS.length),
                  color: '#E60000',
                  icon: CreditCard,
                  glow: true,
                },
                {
                  label: 'العمليات المنفذة',
                  value: String(opsCount),
                  color: '#F7C948',
                  icon: Zap,
                  glow: false,
                },
                {
                  // ── BUG FIX: يعرض المتبقي إذا كان محدوداً، وغير محدود فقط إذا opsLimit===null ──
                  label: isAdmin
                    ? 'الحد الشهري'
                    : opsInfo?.opsLimit !== null && opsInfo?.opsLimit != null
                      ? 'المتبقي من العمليات'
                      : 'الحد الشهري',
                  value: isAdmin
                    ? 'غير محدود ♾️'
                    : opsInfo?.opsLimit == null
                      ? 'غير محدود ♾️'
                      : opsInfo.opsLimit != null
                        ? `${Math.max(0, opsInfo.opsLimit - (opsInfo.opsUsed ?? 0))} / ${opsInfo.opsLimit}`
                        : '—',
                  color: isAdmin || opsInfo?.opsLimit == null ? '#00C896'
                    : (opsInfo.opsLimit - (opsInfo.opsUsed ?? 0)) <= Math.ceil(opsInfo.opsLimit * 0.1)
                      ? '#ef4444'  // أحمر إذا تبقى أقل من 10%
                      : (opsInfo.opsLimit - (opsInfo.opsUsed ?? 0)) <= Math.ceil(opsInfo.opsLimit * 0.3)
                        ? '#F7C948' // أصفر إذا تبقى أقل من 30%
                        : '#00C896',
                  icon: Zap,
                  glow: false,
                },
                {
                  label: isAdmin || isUnlimited ? 'نوع الخطة' : 'الوقت المتبقي',
                  value: isAdmin ? 'مسؤول'
                    : isUnlimited ? '∞ غير محدود'
                    : subActive ? liveTime.label
                    : subscription?.in_grace_period ? 'فترة سماح'
                    : 'منتهٍ',
                  color: isAdmin ? '#00E5FF'
                    : isUnlimited ? '#00C896'
                    : !subActive ? '#ef4444'
                    : liveTime.color,
                  icon: Clock,
                  glow: !isAdmin && !isUnlimited && subActive && (liveTime.status === 'critical' || liveTime.status === 'expiring'),
                },
              ].map(({ label, value, color, icon: Icon, glow }) => (
                <div
                  key={label}
                  className="relative flex items-center gap-2.5 p-3 rounded-2xl overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg,${color}12,${color}06)`,
                    border: `1px solid ${color}25`,
                    boxShadow: glow ? `0 0 12px ${color}30` : undefined,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${color}20`, color }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[8px] text-muted-foreground/70 leading-tight line-clamp-2 tracking-wide">{label}</p>
                    <p className="text-[13px] font-black tabular-nums leading-tight truncate"
                      style={{ color }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          2.3. SUBSCRIPTION PREMIUM CARD
         ══════════════════════════════════════ */}
      <div className="px-4 pt-3">
        <SubscriptionPremiumCard
          subscription={subscription}
          opsInfo={opsInfo}
          isAdmin={isAdmin}
          onRenew={() => setActivationOpen(true)}
        />
      </div>

      {/* ══════════════════════════════════════
          2.5. NATIVE DEBUG PANEL — Admin أو ?debug=true فقط
         ══════════════════════════════════════ */}
      {debugMode && (
        <div className="pt-3">
          <NativeDebugPanel />
        </div>
      )}

      {/* ══════════════════════════════════════
          2.6. HOME BANNER — ديناميكي من Admin
         ══════════════════════════════════════ */}
      {homeBannerUrl && (
        <div className="px-4 pt-3">
          <div className="relative rounded-2xl overflow-hidden border border-primary/12"
            style={{ minHeight: 120 }}>
            <img src={homeBannerUrl} alt="Banner" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          3. QUICK FEATURES SECTION
         ══════════════════════════════════════ */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: '⚡', label: 'شحن سريع',            desc: 'تنفيذ فوري مباشر',         color: '#00E5FF' },
            { icon: '📊', label: 'إحصائيات فورية',       desc: 'تقارير العمليات',          color: '#F7C948' },
            { icon: '🔒', label: 'نظام اشتراكات آمن',   desc: 'حماية كاملة',              color: '#00C896' },
            { icon: '🎁', label: 'أكواد تفعيل ذكية',    desc: 'تجديد بضغطة واحدة',       color: '#a78bfa' },
          ].map(({ icon, label, desc, color }) => (
            <div key={label} className="flex items-center gap-2.5 p-3 rounded-xl border border-white/6 bg-card/60">
              <span className="text-lg shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-balance truncate" style={{ color }}>{label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          بانر العروض الديناميكي
         ══════════════════════════════════════ */}
      <PromotionBanner />

      {/* ══════════════════════════════════════
          4. NETWORKS PREMIUM CARD
         ══════════════════════════════════════ */}
      <NetworksPremiumCard />

      {/* ══════════════════════════════════════
          4.5 BALANCE CHARGE CARD — نظام جديد مستقل
         ══════════════════════════════════════ */}
      <BalanceChargeHomeCard />

      {/* ══════════════════════════════════════
          4.7 VODAFONE CASH CLARIFICATION BANNER
         ══════════════════════════════════════ */}
      <div className="px-4 pt-4">
        <div className="relative rounded-2xl border border-primary/25 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(230,0,0,0.07) 0%, rgba(230,0,0,0.03) 100%)' }}>
          {/* خط علوي ملوّن */}
          <div className="absolute top-0 right-0 left-0 h-0.5"
            style={{ background: 'linear-gradient(90deg, #E60000 0%, rgba(230,0,0,0.3) 100%)' }} />
          <div className="flex items-center gap-3 p-4">
            {/* أيقونة Vodafone Cash */}
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-primary/25"
              style={{ background: 'rgba(230,0,0,0.12)' }}>
              <span className="text-lg">💳</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-black text-foreground">كروت الفكة من Vodafone Cash</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: 'rgba(230,0,0,0.12)', color: '#E60000', border: '1px solid rgba(230,0,0,0.2)' }}>
                  VCash
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                يمكنك شحن جميع كروت الفكة باستخدام رصيد محفظة Vodafone Cash فقط.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          5. FILTERS + PRODUCTS GRID
         ══════════════════════════════════════ */}
      <div className="px-4 pt-3">
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
          <TabsList className="w-full bg-muted/40 h-10 gap-1">
            <TabsTrigger value="all" className="flex-1 text-xs font-semibold">
              الكل <span className="mr-1 text-[10px] opacity-60">({ALL_PRODUCTS.length})</span>
            </TabsTrigger>
            <TabsTrigger value="fakka" className="flex-1 text-xs font-semibold">
              فكة <span className="mr-1 text-[10px] opacity-60">({FAKKA_PRODUCTS.length})</span>
            </TabsTrigger>
            <TabsTrigger value="mared" className="flex-1 text-xs font-semibold">
              مارد <span className="mr-1 text-[10px] opacity-60">({MARED_PRODUCTS.length})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="px-4 pt-3 space-y-4">
        {/* مجموعة كروت الفكة */}
        {displayedFakka.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-sm font-bold text-foreground">🎯 كروت الفكة</span>
              <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                {displayedFakka.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {displayedFakka.map(product => (
                <ProductCard key={product.id} product={product} onSelect={handleSelectProduct} />
              ))}
            </div>
          </div>
        )}

        {/* مجموعة كروت المارد */}
        {displayedMared.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-sm font-bold text-foreground">🔥 كروت المارد</span>
              <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                {displayedMared.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {displayedMared.map(product => (
                <ProductCard key={product.id} product={product} onSelect={handleSelectProduct} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* حالة الاشتراك */}
      {!subActive && !isAdmin && (
        <div className="px-4 pt-3">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">اشتراكك غير نشط</p>
              <p className="text-xs text-foreground/60 mt-0.5">يجب تفعيل الاشتراك لتنفيذ عمليات الشحن.</p>
            </div>
            <Button size="sm" className="h-8 text-xs bg-primary text-primary-foreground shrink-0"
              onClick={() => navigate('/activate')}>تفعيل</Button>
          </div>
        </div>
      )}
      {subActive && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-success/8 border border-success/15">
            <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
            <p className="text-[11px] text-success font-medium">اشتراكك نشط — اضغط على أي كارت للتنفيذ</p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          7. PROFESSIONAL FOOTER
         ══════════════════════════════════════ */}
      <div className="px-4 pt-5">
        <div className="relative rounded-2xl overflow-hidden border border-white/6 p-4 text-center space-y-2"
          style={{ background: 'linear-gradient(135deg,rgba(0,229,255,0.04),rgba(247,201,72,0.03))' }}>
          <div className="h-px w-full mb-3" style={{ background: 'linear-gradient(90deg,transparent,rgba(0,229,255,0.25),rgba(247,201,72,0.20),transparent)' }} />
          <p className="text-sm font-black" style={{ background: 'linear-gradient(90deg,#00E5FF,#F7C948)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Vodafone Fakka Premium
          </p>
          <p className="text-[11px] text-muted-foreground">
            Developed By{' '}
            <span className="font-bold text-accent">Nader Akram</span>
          </p>
          <div className="flex items-center justify-center gap-1.5">
            <Gift className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">© 2026 جميع الحقوق محفوظة</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 pb-24">
        <AppFooter />
      </div>

      {/* WhatsApp Fixed Button */}
      {config.ui.ui_support_whatsapp && (
        <button
          onClick={() => window.open(config.ui.ui_support_whatsapp, '_blank')}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-[0_4px_24px_rgba(34,197,94,0.4)] transition-transform hover:scale-110 active:scale-95"
        >
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.305-.885-.653-1.482-1.46-1.656-1.758-.173-.298-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
          </svg>
        </button>
      )}

      {/* Modals — ActivationPreviewModal مخفي لعملاء التاجر */}
      {user && !isMerchantClient && (
        <ActivationPreviewModal open={activationOpen} onOpenChange={setActivationOpen}
          userId={user.id} onSuccess={loadData} />
      )}
      <SubscriptionNotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)}
        subscription={subscription} activities={activities}
        onRenew={() => { setNotifOpen(false); setActivationOpen(true); }} />
      <ExecuteModal product={selectedProduct} open={sheetOpen}
        onClose={() => setSheetOpen(false)} onSuccess={loadData} isAdmin={isAdmin}
        prefillPhone={prefillPhone} logoUrl={heroLogoUrl || headerLogoUrl || welcomeIconUrl || ''} />

      {/* ── Dialog: كارت موقف / صيانة / غير متوفر (ديناميكي من DB) ── */}
      <Dialog open={disabledProductOpen} onOpenChange={setDisabledProductOpen}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] w-[88vw] md:max-w-sm p-0 border-0"
          style={{ background: '#0a0000', border: '1px solid rgba(230,0,0,0.25)', borderRadius: 20 }}
          dir="rtl"
        >
          <div className="h-1 w-full rounded-t-[20px]"
            style={{ background: 'linear-gradient(90deg,#E60000,#ff3333 50%,#E60000)' }} />
          <div className="px-6 py-6 space-y-4 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
              style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.3)' }}>
              <span className="text-2xl">🚫</span>
            </div>
            <DialogHeader>
              <DialogTitle className="text-white text-base font-black text-balance">
                المنتج موقف مؤقتاً
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-pretty" style={{ color: 'rgba(255,255,255,0.55)' }}>
                تم إيقاف هذا المنتج مؤقتاً، وسيعود للعمل فور توفره.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="justify-center">
              <Button
                onClick={() => setDisabledProductOpen(false)}
                className="w-full font-bold"
                style={{ background: 'rgba(230,0,0,0.15)', color: '#ff6666', border: '1px solid rgba(230,0,0,0.3)' }}
              >
                حسناً
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
