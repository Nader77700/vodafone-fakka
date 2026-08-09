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
  // خانتا المبلغ — الرصيد الصافي والمبلغ الإجمالي المخصوم من الكاش
  const [netAmount, setNetAmount]     = useState('');   // الرصيد الصافي
  const [totalAmount, setTotalAmount] = useState('');   // المبلغ الإجمالي (يشمل 30%)
  const [lastEdited, setLastEdited]   = useState<'net' | 'total'>('net');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── حسابات الضريبة 30% ──────────────────────────────────────────
  // إجمالي = صافي × (100 / 70) ≈ صافي × 1.4286  (تقريباً للأعلى)
  // صافي   = إجمالي × (70 / 100) = إجمالي × 0.7
  const TAX_RATE = 0.30; // 30%
  function netToTotal(net: number): number {
    return Math.ceil(net / (1 - TAX_RATE));
  }
  function totalToNet(total: number): number {
    return Math.floor(total * (1 - TAX_RATE));
  }

  // القيمة الفعلية للـ submit هي دائماً المبلغ الإجمالي
  const amount = totalAmount;

  const QUICK_PICKS_NET = [50, 70, 80]; // رصيد صافي مقترح

  // ── حالة التنفيذ ────────────────────────────────────────────────
  const [execStatus, setExecStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [execMessage, setExecMessage] = useState<string | null>(null);
  const [execLogs, setExecLogs] = useState<any[]>([]);

  // ── Validations ─────────────────────────────────────────────────
  const activeReceiver = rechargeForSelf ? (detectedMsisdn ?? '') : receiver;
  const isReceiverValid = activeReceiver.startsWith('010') || activeReceiver.startsWith('011')
    || activeReceiver.startsWith('012') || activeReceiver.startsWith('015');
  const isReceiverLengthValid = activeReceiver.length === 11;
  const isAmountValid = totalAmount !== '' && Number(totalAmount) >= 3;
  const isPinValid = pin.length >= 4;
  // عند "شحن لنفسي" الرقم يأتي من seamless أثناء التنفيذ — لا نشترط detectedMsisdn مسبقاً
  const receiverReady = rechargeForSelf ? isConnected : (isReceiverValid && isReceiverLengthValid);
  const canSubmit = receiverReady && isAmountValid && isPinValid && !isSubmitting && isConnected;

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
      receiver_number: rechargeForSelf ? (seamless.msisdn || detectedMsisdn || activeReceiver) : activeReceiver,
      amount: Number(totalAmount),
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
      setNetAmount('');
      setTotalAmount('');
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

  // ── handlers الخانتين ───────────────────────────────────────────
  const handleNetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '');
    setNetAmount(v);
    setLastEdited('net');
    if (v === '') { setTotalAmount(''); return; }
    const n = Number(v);
    setTotalAmount(n > 0 ? String(netToTotal(n)) : '');
  };

  const handleTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '');
    setTotalAmount(v);
    setLastEdited('total');
    if (v === '') { setNetAmount(''); return; }
    const n = Number(v);
    setNetAmount(n > 0 ? String(totalToNet(n)) : '');
  };

  const handleQuickPick = (netVal: number) => {
    setNetAmount(String(netVal));
    setTotalAmount(String(netToTotal(netVal)));
    setLastEdited('net');
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

            {/* ── قيمة الشحن — خانتان ذكيتان ─────────────────────── */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-white/80">قيمة الشحن</label>

              {/* الخانتان جنباً إلى جنب */}
              <div className="flex items-center gap-2">

                {/* خانة الرصيد الصافي */}
                <div className="flex-1 relative">
                  <span className="absolute -top-[9px] right-3 text-[10px] font-bold px-1 bg-[#111]"
                    style={{ color: lastEdited === 'net' ? '#E60000' : 'rgba(255,255,255,0.35)' }}>
                    الرصيد الصافي
                  </span>
                  <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-all duration-200
                    ${lastEdited === 'net'
                      ? 'border-[#E60000] shadow-[0_0_10px_rgba(230,0,0,0.18)]'
                      : netAmount !== '' && Number(netAmount) < 2
                        ? 'border-red-500/60'
                        : 'border-white/10'}`}>
                    <input
                      type="tel"
                      dir="ltr"
                      inputMode="numeric"
                      value={netAmount}
                      onChange={handleNetChange}
                      onFocus={() => setLastEdited('net')}
                      placeholder="0"
                      className="flex-1 bg-transparent border-none text-white text-xl font-bold py-3.5 px-3 outline-none placeholder:text-white/20 text-center"
                    />
                    <span className="text-[10px] font-bold text-white/30 pl-2 pr-1 shrink-0">ج</span>
                  </div>
                </div>

                {/* سهم التحويل */}
                <div className="flex flex-col items-center shrink-0 gap-0.5">
                  <div className="w-7 h-7 rounded-full border border-white/10 bg-[#1A1A1A] flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 5.5 L8.5 5.5 L6.5 3.5 M12 8.5 L5.5 8.5 L7.5 10.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  {netAmount && totalAmount && (
                    <span className="text-[8px] text-white/20 font-bold">30%</span>
                  )}
                </div>

                {/* خانة المبلغ الإجمالي (المخصوم من الكاش) */}
                <div className="flex-1 relative">
                  <span className="absolute -top-[9px] right-3 text-[10px] font-bold px-1 bg-[#111]"
                    style={{ color: lastEdited === 'total' ? '#E60000' : 'rgba(255,255,255,0.35)' }}>
                    المبلغ الإجمالي
                  </span>
                  <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-all duration-200
                    ${lastEdited === 'total'
                      ? 'border-[#E60000] shadow-[0_0_10px_rgba(230,0,0,0.18)]'
                      : totalAmount !== '' && Number(totalAmount) < 3
                        ? 'border-red-500/60'
                        : 'border-white/10'}`}>
                    <input
                      type="tel"
                      dir="ltr"
                      inputMode="numeric"
                      value={totalAmount}
                      onChange={handleTotalChange}
                      onFocus={() => setLastEdited('total')}
                      placeholder="0"
                      className="flex-1 bg-transparent border-none text-white text-xl font-bold py-3.5 px-3 outline-none placeholder:text-white/20 text-center"
                    />
                    <span className="text-[10px] font-bold text-white/30 pl-2 pr-1 shrink-0">ج</span>
                  </div>
                </div>
              </div>

              {/* تلميح توضيحي */}
              {netAmount && totalAmount && Number(netAmount) >= 2 && (
                <div className="flex items-center justify-between text-[11px] px-1">
                  <span className="text-white/30">💡 يُضاف 30% ضريبة على المبلغ الإجمالي</span>
                  <span className="text-white/40 font-mono">
                    {netAmount} + {Number(totalAmount) - Number(netAmount)} = {totalAmount} ج
                  </span>
                </div>
              )}
              {totalAmount !== '' && Number(totalAmount) < 3 && (
                <p className="text-xs text-red-500 font-medium">الحد الأدنى للشحن 3 جنيه إجمالي</p>
              )}

              {/* Quick-picks (رصيد صافي مقترح) */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-white/35 font-semibold">خيارات مقترحة للرصيد</p>
                <div className="flex gap-2">
                  {QUICK_PICKS_NET.map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleQuickPick(n)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 border
                        ${Number(netAmount) === n
                          ? 'bg-[#E60000]/15 border-[#E60000]/60 text-[#E60000]'
                          : 'bg-[#1A1A1A] border-white/8 text-white/60 hover:border-white/20 active:scale-95'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
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
