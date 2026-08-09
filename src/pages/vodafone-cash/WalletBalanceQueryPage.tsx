import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wallet, Loader2, CheckCircle2, XCircle,
  Wifi, WifiOff, RefreshCw, ShieldCheck, AlertTriangle, Clock
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { VodafoneDetector } from '@/lib/vodafoneDetector';
import { fetchSeamlessToken } from '@/lib/seamless';
import { VodafoneCashService } from '@/services/vodafone-cash/VodafoneCashService';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { PinInputBlock } from '@/components/vodafone-cash/PinInputBlock';
import { toast } from 'sonner';

type QueryStatus = 'idle' | 'checking' | 'querying' | 'success' | 'failed';

export default function WalletBalanceQueryPage() {
  const navigate = useNavigate();
  const { config } = useRuntimeConfig();

  // الشبكة
  const [networkName, setNetworkName]       = useState('جاري التحقق...');
  const [isConnected, setIsConnected]       = useState(false);
  const [isCheckingConn, setIsCheckingConn] = useState(true);
  const [lastChecked, setLastChecked]       = useState<Date | null>(null);

  // PIN
  const [pin, setPin] = useState('');

  // نتيجة
  const [queryStatus, setQueryStatus]   = useState<QueryStatus>('idle');
  const [balance, setBalance]           = useState<string | null>(null);
  const [walletMsisdn, setWalletMsisdn] = useState<string | null>(null);
  const [queriedAt, setQueriedAt]       = useState<string | null>(null);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);

  const isPinValid  = pin.length >= 4;
  const canSubmit   = isPinValid && isConnected && queryStatus === 'idle';

  const checkConnection = async () => {
    setIsCheckingConn(true);
    setNetworkName('جاري فحص الشبكة...');
    try {
      if (Capacitor.isNativePlatform() && VodafoneDetector?.requestPhonePermission) {
        await VodafoneDetector.requestPhonePermission();
        const result = await Promise.race([
          VodafoneDetector.getNetworkInfo(),
          new Promise<any>((res) => setTimeout(() => res({ canExecuteNative: true, isVodafoneSim: true }), 4000))
        ]);
        const isVfReady = result?.isVodafoneMobile && result?.isMobileDataActive;
        if (isVfReady) {
          setIsConnected(true);
          setNetworkName('Vodafone Egypt (Mobile Data)');
        } else if (result?.isWifiActive) {
          setIsConnected(false); setNetworkName('Wi-Fi / شبكة غير مدعومة');
        } else {
          setIsConnected(false); setNetworkName('غير متصل / بيانات معطلة');
        }
      } else {
        setIsConnected(false); setNetworkName('غير مدعوم على المتصفح');
      }
    } catch {
      setIsConnected(false); setNetworkName('خطأ في فحص الشبكة');
    } finally {
      setLastChecked(new Date());
      setIsCheckingConn(false);
    }
  };

  useEffect(() => { checkConnection(); }, []);

  const handleQuery = async () => {
    if (!canSubmit) return;
    setQueryStatus('checking');
    setErrorMsg(null);
    setBalance(null);

    const toastId = toast.loading('جاري التحقق من فودافون كاش...');

    const seamlessClientId = config?.security?.sec_seamless_client_id || 'ana-vodafone-app-seamless';
    const seamlessUrl = config?.security?.sec_seamless_url;
    const seamless = await fetchSeamlessToken(seamlessClientId, seamlessUrl);

    if (!seamless.token) {
      toast.warning('تعذر التعرف على الخط تلقائياً، جاري المحاولة عبر PIN...', { id: toastId });
    }

    setQueryStatus('querying');
    toast.loading('جاري الاستعلام عن الرصيد...', { id: toastId });

    const res = await VodafoneCashService.getWalletBalance({
      pin,
      seamless_token: seamless.token,
      msisdn: seamless.msisdn,
    });

    if (res.success) {
      setBalance(res.balance ?? null);
      setWalletMsisdn(res.msisdn ?? null);
      setQueriedAt(res.queried_at ?? null);
      setQueryStatus('success');
      toast.success('تم الحصول على الرصيد بنجاح', { id: toastId });
    } else {
      setErrorMsg(res.message);
      setQueryStatus('failed');
      toast.error(res.message || 'تعذر الحصول على الرصيد', { id: toastId, duration: 5000 });
    }
  };

  const handleReset = () => {
    setQueryStatus('idle');
    setBalance(null);
    setErrorMsg(null);
    setPin('');
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatQueriedAt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('ar-EG', {
        dateStyle: 'short', timeStyle: 'medium', timeZone: 'Africa/Cairo'
      });
    } catch { return iso; }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24 text-white font-cairo">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between px-4 h-16">
          <button onClick={() => navigate('/vodafone-cash-center/wallet-balance')}
            className="p-2 -mr-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide">الاستعلام عن الرصيد</h1>
            <p className="text-[10px] text-[#E60000] font-medium">Vodafone Cash Balance</p>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 space-y-5">
        {/* بطاقة حالة النظام */}
        <div className={`rounded-2xl border p-4 transition-all duration-500
          ${isConnected
            ? 'bg-[#0D1F12] border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
            : 'bg-[#1A0D0D] border-[#E60000]/30'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${isConnected ? 'text-green-400' : 'text-[#E60000]'}`} />
              <span className="text-xs font-bold text-white/80">حالة الاتصال</span>
            </div>
            <button onClick={checkConnection} disabled={isCheckingConn}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 text-white/60 ${isCheckingConn ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-[#E60000]'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {isConnected
                  ? <Wifi className="w-4 h-4 text-green-400 shrink-0" />
                  : <WifiOff className="w-4 h-4 text-[#E60000] shrink-0" />}
                <span className="text-sm font-bold truncate">{networkName}</span>
              </div>
              {lastChecked && (
                <p className="text-[10px] text-white/40 mt-0.5">آخر فحص: {formatTime(lastChecked)}</p>
              )}
            </div>
            <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-[#E60000]/20 text-[#E60000]'}`}>
              {isConnected ? 'جاهز' : 'غير جاهز'}
            </div>
          </div>
        </div>

        {/* نتيجة ناجحة */}
        {queryStatus === 'success' && balance !== null && (
          <div className="bg-[#0D1F12] border border-green-500/40 rounded-2xl p-6 shadow-[0_0_30px_rgba(34,197,94,0.1)]">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
              <h3 className="text-base font-bold text-green-400">تم الحصول على الرصيد بنجاح</h3>
            </div>
            <div className="space-y-3">
              {walletMsisdn && (
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-xs text-white/50">رقم المحفظة</span>
                  <span className="text-sm font-bold font-mono" dir="ltr">{walletMsisdn}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-xs text-white/50">الرصيد الحالي</span>
                <span className="text-2xl font-black text-green-400">{balance} <span className="text-base font-bold">جنيه</span></span>
              </div>
              {queriedAt && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-white/50">وقت الاستعلام</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-white/40" />
                    <span className="text-xs text-white/60">{formatQueriedAt(queriedAt)}</span>
                  </div>
                </div>
              )}
            </div>
            <button onClick={handleReset}
              className="mt-5 w-full py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white/80 hover:bg-white/10 transition-colors">
              استعلام جديد
            </button>
          </div>
        )}

        {/* نتيجة فاشلة */}
        {queryStatus === 'failed' && errorMsg && (
          <div className="bg-[#1A0D0D] border border-[#E60000]/40 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-[#E60000] shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-[#E60000] mb-1">تعذر الحصول على الرصيد</h3>
                <p className="text-xs text-white/60">{errorMsg}</p>
              </div>
            </div>
            <button onClick={handleReset}
              className="mt-4 w-full py-3 rounded-xl bg-[#E60000]/10 border border-[#E60000]/30 text-sm font-bold text-[#E60000] hover:bg-[#E60000]/20 transition-colors">
              حاول مرة أخرى
            </button>
          </div>
        )}

        {/* فورم الـ PIN */}
        {(queryStatus === 'idle' || queryStatus === 'checking' || queryStatus === 'querying') && (
          <div className="bg-[#111] border border-white/10 rounded-2xl p-5 space-y-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#E60000]/5 rounded-full blur-3xl" />
            <div className="relative z-10 space-y-5">
              <p className="text-sm text-white/60">أدخل PIN محفظتك Vodafone Cash للاستعلام عن الرصيد. لن يُحفظ أو يُسجَّل.</p>
              <div className="bg-[#1C1C1C] rounded-2xl p-4 border border-white/5">
                <PinInputBlock pin={pin} setPin={setPin} submitting={queryStatus !== 'idle'} />
              </div>
            </div>
          </div>
        )}

        {/* زر الاستعلام */}
        {(queryStatus === 'idle' || queryStatus === 'checking' || queryStatus === 'querying') && (
          <button
            disabled={!canSubmit || queryStatus !== 'idle'}
            onClick={handleQuery}
            className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 text-base font-bold transition-all duration-300
              ${canSubmit && queryStatus === 'idle'
                ? 'bg-[#E60000] text-white shadow-[0_0_20px_rgba(230,0,0,0.4)] hover:bg-[#CC0000] active:scale-[0.98]'
                : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'}`}>
            {queryStatus === 'checking' || queryStatus === 'querying'
              ? <><Loader2 className="w-5 h-5 animate-spin" /> جاري الاستعلام...</>
              : <><Wallet className="w-5 h-5" /> استعلام عن الرصيد</>}
          </button>
        )}

        {/* تحذير Wi-Fi */}
        {!isConnected && !isCheckingConn && queryStatus === 'idle' && (
          <div className="bg-[#1A0D0D] border border-[#E60000]/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#E60000] shrink-0 mt-0.5" />
            <p className="text-xs text-white/60">
              يجب تشغيل <span className="text-[#E60000] font-bold">بيانات فودافون</span> لاستخدام هذه الخدمة. Wi-Fi وحده غير كافٍ.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
