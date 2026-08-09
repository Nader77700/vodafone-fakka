import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Lock, AlertTriangle, Zap, Clock, Loader2,
  Wifi, WifiOff, RefreshCw, CheckCircle2, XCircle, UserCheck,
} from 'lucide-react';
import { VodafoneCashService } from '../../services/vodafone-cash/VodafoneCashService';
import { fetchSeamlessToken } from '../../lib/seamless';
import { useRuntimeConfig } from '../../contexts/RuntimeConfigContext';
import { toast } from 'sonner';
import { PinInputBlock } from '@/components/vodafone-cash/PinInputBlock';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { VodafoneDetector } from '@/lib/vodafoneDetector';

export default function RechargeBalancePage() {
  const navigate = useNavigate();
  const { config } = useRuntimeConfig();

  // ── حالة الجسر ─────────────────────────────────────────────────
  const [networkName, setNetworkName] = useState('جاري التحقق...');
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingConn, setIsCheckingConn] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // ── حالة النموذج ────────────────────────────────────────────────
  const [rechargeForSelf, setRechargeForSelf] = useState(false);
  const [detectedMsisdn, setDetectedMsisdn] = useState<string | null>(null);
  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── حالة التنفيذ ────────────────────────────────────────────────
  const [execStatus, setExecStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [execMessage, setExecMessage] = useState<string | null>(null);
  const [execLogs, setExecLogs] = useState<any[]>([]);

  // ── Validations ─────────────────────────────────────────────────
  const activeReceiver = rechargeForSelf ? (detectedMsisdn ?? '') : receiver;
  const isReceiverValid = activeReceiver.startsWith('010') || activeReceiver.startsWith('011')
    || activeReceiver.startsWith('012') || activeReceiver.startsWith('015');
  const isReceiverLengthValid = activeReceiver.length === 11;
  const isAmountValid = amount !== '' && Number(amount) >= 2;
  const isPinValid = pin.length >= 4;
  const canSubmit = isReceiverValid && isReceiverLengthValid && isAmountValid && isPinValid
    && !isSubmitting && isConnected;

  // ── فحص الشبكة ─────────────────────────────────────────────────
  const checkConnection = async () => {
    setIsCheckingConn(true);
    setNetworkName('جاري فحص الشبكة...');
    try {
      if (Capacitor.isNativePlatform() && VodafoneDetector?.requestPhonePermission) {
        await VodafoneDetector.requestPhonePermission();
        const result = await Promise.race([
          VodafoneDetector.getNetworkInfo(),
          new Promise<any>((r) => setTimeout(() => r({
            canExecuteNative: true, isVodafoneSim: true,
            activeNetwork: 'timeout_fallback',
            activeDataSimOperatorName: 'Vodafone (Fallback)',
          }), 4000)),
        ]);
        const isVfReady = result?.isVodafoneMobile && result?.isMobileDataActive;
        if (isVfReady) {
          setIsConnected(true);
          setNetworkName('Vodafone Egypt (Mobile Data)');
          // استخراج الرقم المكتشف
          const msisdn = result?.msisdn || result?.phoneNumber || null;
          if (msisdn) setDetectedMsisdn(String(msisdn).replace(/^2/, '0').slice(-11));
        } else if (result?.isWifiActive) {
          setIsConnected(false);
          setNetworkName('Wi-Fi / شبكة غير مدعومة');
        } else {
          setIsConnected(false);
          setNetworkName('غير متصل / بيانات معطلة');
        }
      } else {
        setIsConnected(false);
        setNetworkName('غير مدعوم على المتصفح');
      }
    } catch {
      setIsConnected(false);
      setNetworkName('فشل فحص الشبكة');
    }
    setLastChecked(new Date());
    setIsCheckingConn(false);
  };

  useEffect(() => {
    checkConnection();
    let networkListener: any;
    const setup = async () => {
      networkListener = await Network.addListener('networkStatusChange', () => {
        setTimeout(() => checkConnection(), 1500);
      });
    };
    setup();
    return () => { networkListener?.remove?.(); };
  }, []);

  // عند تفعيل "شحن لنفسي" نملأ الرقم تلقائياً
  useEffect(() => {
    if (rechargeForSelf && detectedMsisdn) {
      setReceiver(detectedMsisdn);
    } else if (!rechargeForSelf) {
      setReceiver('');
    }
  }, [rechargeForSelf, detectedMsisdn]);

  // ── تنفيذ الشحن ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setExecStatus('idle');
    setExecLogs([]);

    const toastId = toast.loading('جاري التحقق من فودافون كاش...');
    const seamlessClientId = config?.security?.sec_seamless_client_id || 'ana-vodafone-app-seamless';
    const seamlessUrl = config?.security?.sec_seamless_url
      || 'http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth';
    const seamless = await fetchSeamlessToken(seamlessClientId, seamlessUrl);

    if (!seamless.token) {
      toast.dismiss(toastId);
    } else {
      toast.loading('جاري تنفيذ عملية الشحن...', { id: toastId });
    }

    const res = await VodafoneCashService.initiateRecharge({
      receiver_number: activeReceiver,
      amount: Number(amount),
      pin,
      seamless_token: seamless.token,
      msisdn: seamless.msisdn,
    });

    if (res.success) {
      toast.success(res.message || 'تم الشحن بنجاح', { id: toastId });
      setExecStatus('success');
      setExecMessage(res.message || 'تم الشحن بنجاح');
      setExecLogs(res.data?.debugSteps || []);

      // حفظ الباسورد عند النجاح
      const pendingPin = localStorage.getItem('vcc_pending_save_pin');
      if (pendingPin && pendingPin === pin) {
        const existing = JSON.parse(localStorage.getItem('vcc_saved_pins') || '[]');
        if (!existing.includes(pin)) { existing.push(pin); localStorage.setItem('vcc_saved_pins', JSON.stringify(existing)); }
        localStorage.setItem('vcc_default_pin', pin);
        localStorage.removeItem('vcc_pending_save_pin');
        window.dispatchEvent(new Event('vcc_pins_updated'));
      }

      if (!rechargeForSelf) setReceiver('');
      setAmount('');
    } else {
      toast.error(res.message || 'فشلت العملية', { id: toastId, duration: 5000 });
      setExecStatus('failed');
      setExecMessage(res.message || 'فشلت العملية');
      setExecLogs(res.data?.debugSteps || []);
    }

    setIsSubmitting(false);
  };

  const handleReceiverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (rechargeForSelf) return;
    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
    setReceiver(val);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value.replace(/\D/g, ''));
  };

  // ── وقت آخر فحص ───────────────────────────────────────────────
  const lastCheckedStr = lastChecked
    ? lastChecked.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24 text-white font-cairo selection:bg-[#E60000]/30 selection:text-white">

      {/* ── Top Nav ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between px-4 h-16">
          <button onClick={() => navigate(-1)} className="p-2 -mr-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide">شحن الرصيد</h1>
            <p className="text-[10px] text-[#E60000] font-medium">Vodafone Cash</p>
          </div>
          <button
            onClick={() => navigate('/vodafone-cash-center/history/recharge')}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors text-white/70"
          >
            <Clock className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4">

        {/* ── بطاقة حالة الجسر ────────────────────────────────── */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#E60000]/15 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-[#E60000]" />
              </div>
              <span className="text-sm font-bold text-white/90">حالة النظام</span>
            </div>
            <button
              onClick={checkConnection}
              disabled={isCheckingConn}
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingConn ? 'animate-spin' : ''}`} />
              تحديث
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="text-white/40 text-right">حالة الاتصال</div>
            <div className="flex items-center gap-1.5">
              {isCheckingConn ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />
              ) : isConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-green-400 font-bold">متصل وجاهز</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-red-400 font-bold">غير متصل</span>
                </>
              )}
            </div>
            <div className="text-white/40 text-right">الشبكة الحالية</div>
            <div className="text-white/80 font-medium truncate">{networkName}</div>
            <div className="text-white/40 text-right">آخر فحص</div>
            <div className="text-white/50">{lastCheckedStr}</div>
          </div>
        </div>

        {/* ── النموذج ─────────────────────────────────────────── */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#E60000]/5 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-5 relative z-10">

            {/* Checkbox شحن لنفسي — فوق خانة الرقم */}
            <button
              type="button"
              onClick={() => setRechargeForSelf(v => !v)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200
                ${rechargeForSelf
                  ? 'border-[#E60000]/60 bg-[#E60000]/10'
                  : 'border-white/10 bg-[#1A1A1A] hover:border-white/20'}`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors
                ${rechargeForSelf ? 'bg-[#E60000] border-[#E60000]' : 'border-white/30 bg-transparent'}`}>
                {rechargeForSelf && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <div className="flex items-center gap-2 flex-1">
                <UserCheck className={`w-4 h-4 ${rechargeForSelf ? 'text-[#E60000]' : 'text-white/40'}`} />
                <span className={`text-sm font-bold ${rechargeForSelf ? 'text-[#E60000]' : 'text-white/70'}`}>
                  شحن رصيد لنفسي
                </span>
              </div>
              {rechargeForSelf && detectedMsisdn && (
                <span className="text-xs text-white/50 font-mono shrink-0">{detectedMsisdn}</span>
              )}
            </button>

            {/* رقم الهاتف */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-white/80">رقم الهاتف</label>
              <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-colors
                ${rechargeForSelf ? 'border-white/5 opacity-60' : activeReceiver && (!isReceiverValid || !isReceiverLengthValid)
                  ? 'border-red-500' : 'border-white/10 focus-within:border-[#E60000]'}`}>
                <div className="pl-3 pr-2 text-white/40">
                  <Phone className="w-5 h-5" />
                </div>
                <input
                  type="tel"
                  dir="ltr"
                  value={activeReceiver}
                  onChange={handleReceiverChange}
                  readOnly={rechargeForSelf}
                  placeholder="01xxxxxxxxx"
                  className="flex-1 bg-transparent border-none text-white text-lg py-3 outline-none placeholder:text-white/20"
                />
              </div>
              {!rechargeForSelf && activeReceiver.length > 0 && !isReceiverValid && (
                <p className="text-xs text-red-500 font-medium">يجب أن يبدأ الرقم بـ 010 أو 011 أو 012 أو 015</p>
              )}
              {!rechargeForSelf && activeReceiver.length > 0 && isReceiverValid && !isReceiverLengthValid && (
                <p className="text-xs text-red-500 font-medium">الرقم يجب أن يتكون من 11 رقماً</p>
              )}
            </div>

            {/* المبلغ */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-white/80">المبلغ</label>
              <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-colors
                ${amount !== '' && !isAmountValid ? 'border-red-500' : 'border-white/10 focus-within:border-[#E60000]'}`}>
                <div className="pl-3 pr-2 text-white/40">
                  <span className="text-sm font-bold">EGP</span>
                </div>
                <input
                  type="tel"
                  dir="ltr"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0"
                  className="flex-1 bg-transparent border-none text-white text-lg py-3 outline-none placeholder:text-white/20"
                />
              </div>
              {amount !== '' && !isAmountValid && (
                <p className="text-xs text-red-500 font-medium">الحد الأدنى للشحن هو 2 جنيه</p>
              )}
            </div>

            {/* كلمة السر */}
            <div className="space-y-2">
              <div className="bg-[#1C1C1C] rounded-2xl p-4 border border-white/5">
                <PinInputBlock pin={pin} setPin={setPin} submitting={isSubmitting} />
              </div>
            </div>
          </div>
        </div>

        {/* ── نتيجة التنفيذ ────────────────────────────────────── */}
        {execStatus !== 'idle' && (
          <div className={`rounded-2xl p-4 border flex items-start gap-3
            ${execStatus === 'success'
              ? 'bg-green-900/20 border-green-500/30'
              : 'bg-red-900/20 border-red-500/30'}`}>
            {execStatus === 'success'
              ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              : <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${execStatus === 'success' ? 'text-green-300' : 'text-red-300'}`}>
                {execMessage}
              </p>
              {execLogs.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-white/40 cursor-pointer select-none">عرض السجلات التفصيلية</summary>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {execLogs.map((log, i) => (
                      <div key={i} className={`text-xs font-mono px-2 py-1 rounded flex gap-2
                        ${log.status === 'ok' ? 'text-green-400' : log.status === 'warn' ? 'text-yellow-400' : 'text-red-400'}`}>
                        <span className="opacity-60">[{log.step}]</span>
                        <span>{log.detail}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        )}

        {/* ── ملاحظات هامة ─────────────────────────────────────── */}
        <div className="bg-[#1A1A1A] border border-[#E60000]/20 rounded-xl p-4 shadow-[0_0_15px_rgba(230,0,0,0.05)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#E60000] shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-[#E60000]">ملاحظات هامة:</h4>
              <ul className="text-xs text-white/70 space-y-1.5 list-disc list-inside pr-1">
                <li>يجب تشغيل بيانات فودافون (Vodafone Data).</li>
                <li>يجب أن تكون محفظتك مفعلة.</li>
                <li>يجب توفر رصيد كافٍ في المحفظة.</li>
                <li>بعد 3 محاولات خاطئة يُقفل الحساب تلقائياً.</li>
                <li>لن يُخصم أي رصيد عند فشل التنفيذ.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── زر الشحن ─────────────────────────────────────────── */}
        <button
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 text-base font-bold transition-all duration-300
            ${canSubmit
              ? 'bg-[#E60000] text-white shadow-[0_0_20px_rgba(230,0,0,0.4)] hover:bg-[#CC0000] active:scale-[0.98]'
              : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'}`}
        >
          {isSubmitting
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <Zap className="w-5 h-5" />}
          {isSubmitting ? 'جاري الشحن...' : 'شحن الآن'}
        </button>

        {!isConnected && !isCheckingConn && (
          <p className="text-center text-xs text-red-400">
            ⚠️ يجب تشغيل بيانات فودافون لإتمام العملية
          </p>
        )}

      </div>
    </div>
  );
}
