import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, ArrowLeft, Phone, Clock, Loader2, ShieldCheck, 
  Wifi, WifiOff, RefreshCw, Send, AlertTriangle, XCircle, Info
} from 'lucide-react';
import { VodafoneCashService } from '../../services/vodafone-cash/VodafoneCashService';
import { fetchSeamlessToken } from '../../lib/seamless';
import { useRuntimeConfig } from '../../contexts/RuntimeConfigContext';
import { toast } from 'sonner';
import { PinInputBlock } from '@/components/vodafone-cash/PinInputBlock';
import { Network } from '@capacitor/network';

import { Capacitor } from '@capacitor/core';
import { VodafoneDetector } from '@/lib/vodafoneDetector';

export default function MoneyTransferPage() {
  const navigate = useNavigate();
  const { config } = useRuntimeConfig();

  // Status State
  const [networkName, setNetworkName] = useState('جاري التحقق...');
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingConn, setIsCheckingConn] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Form State
  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Execution State
  const [execStatus, setExecStatus] = useState<'idle' | 'checking' | 'executing' | 'success' | 'failed'>('idle');
  const [execMessage, setExecMessage] = useState<string | null>(null);
  const [execLogs, setExecLogs] = useState<any[]>([]);

  // Validations
  const isReceiverValid = receiver.startsWith('010') || receiver.startsWith('011') || receiver.startsWith('012') || receiver.startsWith('015');
  const isReceiverLengthValid = receiver.length === 11;
  const isAmountValid = amount !== '' && Number(amount) >= 2;
  const isPinValid = pin.length >= 4;

  const canSubmit = isReceiverValid && isReceiverLengthValid && isAmountValid && isPinValid && !isSubmitting && isConnected;

  const checkConnection = async () => {
    setIsCheckingConn(true);
    setNetworkName('جاري فحص الشبكة...');
    
    try {
      if (Capacitor.isNativePlatform() && VodafoneDetector && VodafoneDetector.requestPhonePermission) {
        await VodafoneDetector.requestPhonePermission();
        const result = await Promise.race([
          VodafoneDetector.getNetworkInfo(),
          new Promise<any>((resolve) => setTimeout(() => resolve({
            canExecuteNative: true,
            isVodafoneSim: true,
            activeNetwork: 'timeout_fallback',
            activeDataSimOperatorName: 'Vodafone (Fallback)'
          }), 4000))
        ]);

        const isVfReady = result?.isVodafoneMobile && result?.isMobileDataActive;
        if (isVfReady) {
          setIsConnected(true);
          setNetworkName('Vodafone Egypt (Mobile Data)');
        } else if (result?.isWifiActive) {
          setIsConnected(false);
          setNetworkName('Wi-Fi / شبكة غير مدعومة');
        } else {
          setIsConnected(false);
          setNetworkName('غير متصل / بيانات معطلة');
        }
      } else {
        // Fallback for Web / Missing Plugin
        setIsConnected(false);
        setNetworkName('غير مدعوم على المتصفح');
      }
    } catch (err) {
      setIsConnected(false);
      setNetworkName('فشل فحص الشبكة');
    }
    setLastChecked(new Date());
    setIsCheckingConn(false);
  };

  useEffect(() => {
    checkConnection();
    
    // إعداد مستمع مباشر لتغيرات الشبكة
    let networkListener: any;
    const setupNetworkListener = async () => {
      networkListener = await Network.addListener('networkStatusChange', (status) => {
        // ننتظر ثانية ونصف حتى تستقر الشبكة الجديدة ثم نفحصها
        setTimeout(() => checkConnection(), 1500);
      });
    };
    setupNetworkListener();

    return () => {
      if (networkListener && networkListener.remove) {
        networkListener.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setExecStatus('checking');
    setExecMessage(null);
    setExecLogs([]);

    // 1. Fetch Seamless Token
    setExecLogs(prev => [...prev, { step: 'frontend', status: 'info', detail: 'جاري المصادقة مع شبكة فودافون...', timestamp: new Date().toISOString() }]);
    
    const seamlessClientId = config?.security?.sec_seamless_client_id || 'cash-app';
    const seamlessUrl = config?.security?.sec_seamless_url || 'http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth';
    const seamless = await fetchSeamlessToken(seamlessClientId, seamlessUrl);

    if (!seamless.token) {
       setExecLogs(prev => [...prev, { step: 'seamless', status: 'fail', detail: `فشل في استخراج التوكن: ${seamless.error || 'تأكد من إغلاق الـ Wi-Fi والـ VPN.'}`, timestamp: new Date().toISOString() }]);
       setExecStatus('failed');
       setExecMessage('فشل المصادقة مع شبكة فودافون كاش. أغلق الواي فاي وجرب مرة أخرى.');
       setIsSubmitting(false);
       return;
    }

    setExecStatus('executing');
    setExecLogs(prev => [...prev, { step: 'frontend', status: 'info', detail: 'بدء الاتصال بالخادم...', timestamp: new Date().toISOString() }]);

    const res = await VodafoneCashService.initiateMoneyTransfer({
      receiver_number: receiver,
      amount: Number(amount),
      pin: pin,
      seamless_token: seamless.token,
      msisdn: seamless.msisdn
    });

    if (res.data?.debugSteps) {
      setExecLogs(prev => [...prev, ...res.data.debugSteps]);
    }

    if (res.success) {
      setExecStatus('success');
      setExecMessage(res.message || 'اكتملت العملية بنجاح');
      
      const pendingPin = localStorage.getItem('vcc_pending_save_pin');
      if (pendingPin && pendingPin === pin) {
        const existing = JSON.parse(localStorage.getItem('vcc_saved_pins') || '[]');
        if (!existing.includes(pin)) {
          existing.push(pin);
          localStorage.setItem('vcc_saved_pins', JSON.stringify(existing));
        }
        localStorage.setItem('vcc_default_pin', pin);
        localStorage.removeItem('vcc_pending_save_pin');
        window.dispatchEvent(new Event('vcc_pins_updated'));
      }
    } else {
      setExecStatus('failed');
      setExecMessage(res.message || 'فشلت العملية لسبب غير معروف');
    }
    
    setIsSubmitting(false);
  };

  const resetForm = () => {
    setReceiver('');
    setAmount('');
    setPin('');
    setExecStatus('idle');
    setExecMessage(null);
    setExecLogs([]);
  };

  return (
    <div className="min-h-screen bg-background pb-24 font-cairo" dir="rtl">
      {/* Top Nav */}
      <div className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border shadow-sm">
        <div className="flex items-center justify-between px-4 h-16">
          <button onClick={() => navigate(-1)} className="p-2 -mr-2 rounded-full hover:bg-muted active:bg-muted/70 transition-colors">
            <ArrowLeft className="w-6 h-6 rotate-180" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide">تحويل الأموال</h1>
            <p className="text-[10px] text-primary font-medium">Vodafone Cash</p>
          </div>
          <button onClick={() => navigate('/vodafone-cash-center/history/transfer')} className="p-2 -ml-2 rounded-full hover:bg-muted active:bg-muted/50 transition-colors text-muted-foreground">
            <Clock className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-6">
        {/* System Status Panel */}
        <div className="bg-card border border-border rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              حالة النظام
            </h2>
            <button onClick={checkConnection} disabled={isCheckingConn} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingConn ? 'animate-spin' : ''}`} />
              تحديث
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">حالة الاتصال</span>
              <div className="flex items-center gap-1.5">
                {isCheckingConn ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                ) : isConnected ? (
                  <Wifi className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className={`text-xs font-bold ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                  {isCheckingConn ? 'جاري التحقق...' : isConnected ? 'متصل وجاهز' : 'غير جاهز'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">الشبكة الحالية</span>
              <span className="text-xs font-medium text-foreground" dir="ltr">{networkName}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">اخر فحص</span>
              <span className="text-[10px] text-muted-foreground" dir="ltr">
                {lastChecked ? lastChecked.toLocaleTimeString() : '--:--'}
              </span>
            </div>
          </div>
          
          {!isConnected && !isCheckingConn && (
            <div className="mt-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-500/90 leading-relaxed">
                تأكد أنك مشغل الشريحة على خط فودافون وأنك غير متصل بالواي فاي (Wi-Fi) لتتمكن من استخدام الخدمة.
                <br/>
                <span className="font-bold opacity-80 mt-1 block">💡 ملاحظة هامة: إذا كنت تستخدم بيانات فودافون وتظهر هذه المشكلة، يرجى إغلاق الـ (VPN) إن وجد. كما أن هذه الميزة مخصصة للعمل داخل تطبيق الأندرويد فقط وليس عبر متصفح الويب.</span>
              </p>
            </div>
          )}
        </div>

        {execStatus === 'idle' ? (
          <>
            {/* Form Container */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-2xl relative overflow-hidden">
              <div className="space-y-5 relative z-10">
                {/* Receiver Field */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">رقم المستفيد</label>
                  <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-colors ${receiver && (!isReceiverValid || !isReceiverLengthValid) ? 'border-red-500' : 'border-border focus-within:border-[#E60000]'}`}>
                    <div className="pl-3 pr-2 text-muted-foreground">
                      <Phone className="w-5 h-5" />
                    </div>
                    <input
                      type="tel"
                      dir="ltr"
                      value={receiver}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\s/g, '').replace(/[^0-9]/g, '');
                        if (val.length <= 11) setReceiver(val);
                      }}
                      placeholder="01xxxxxxxxx"
                      className="flex-1 bg-transparent border-none text-foreground text-lg py-3 outline-none placeholder:text-muted-foreground/40 text-left"
                    />
                  </div>
                  {receiver.length > 0 && !isReceiverValid && (
                    <p className="text-xs text-red-500 font-medium">يجب أن يبدأ الرقم بـ 010, 011, 012, أو 015</p>
                  )}
                  {receiver.length > 0 && isReceiverValid && !isReceiverLengthValid && (
                    <p className="text-xs text-red-500 font-medium">الرقم يجب أن يتكون من 11 رقماً</p>
                  )}
                </div>

                {/* Amount Field */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">المبلغ</label>
                  <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-colors ${amount !== '' && !isAmountValid ? 'border-red-500' : 'border-border focus-within:border-[#E60000]'}`}>
                    <div className="pl-3 pr-2 text-muted-foreground">
                      <span className="text-sm font-bold">EGP</span>
                    </div>
                    <input
                      type="tel"
                      dir="ltr"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="0"
                      className="flex-1 bg-transparent border-none text-foreground text-lg py-3 outline-none placeholder:text-muted-foreground/40 text-left"
                    />
                  </div>
                  <div className="flex justify-between items-center px-1">
                    {amount !== '' && !isAmountValid ? (
                      <p className="text-xs text-red-500 font-medium">خطأ: الحد الأدنى 2 جنيه</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">الحد الأدنى للتحويل: 2 ج.م</p>
                    )}
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2 mt-4">
                  <div className="bg-[#1C1C1C] rounded-2xl p-4 border border-border">
                    <PinInputBlock pin={pin} setPin={setPin} submitting={isSubmitting} />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              disabled={!canSubmit}
              onClick={handleSubmit}
              className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 text-base font-bold transition-all duration-300
                ${canSubmit 
                  ? 'bg-[#E60000] text-foreground shadow-[0_0_20px_rgba(230,0,0,0.4)] hover:bg-[#CC0000] active:scale-[0.98]' 
                  : 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed border border-border'}`}
            >
              <Send className="w-5 h-5" />
              تحويل الآن
            </button>
          </>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Status Card */}
            <div className="bg-card border border-border rounded-2xl p-6 text-center shadow-xl">
              <div className="flex justify-center mb-4">
                {execStatus === 'checking' || execStatus === 'executing' ? (
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                ) : execStatus === 'success' ? (
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-500" />
                  </div>
                )}
              </div>
              
              <h3 className="text-xl font-bold mb-2">
                {execStatus === 'checking' && 'جاري التحقق...'}
                {execStatus === 'executing' && 'جاري التنفيذ...'}
                {execStatus === 'success' && 'اكتملت العملية'}
                {execStatus === 'failed' && 'فشلت العملية'}
              </h3>
              
              {execMessage && (
                <p className={`text-sm ${execStatus === 'success' ? 'text-green-400' : 'text-red-400'} font-medium`}>
                  {execMessage}
                </p>
              )}

              {(execStatus === 'success' || execStatus === 'failed') && (
                <button
                  onClick={resetForm}
                  className="mt-6 px-6 py-2.5 bg-muted hover:bg-muted rounded-xl text-sm font-bold transition-colors"
                >
                  إجراء تحويل جديد
                </button>
              )}
            </div>

            {/* Execution Logs */}
            {execLogs.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4">
                <h4 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  سجل التنفيذ (من السيرفر)
                </h4>
                <div className="space-y-2">
                  {execLogs.map((log, i) => (
                    <div key={i} className="flex gap-3 text-xs bg-black/40 p-2.5 rounded-lg border border-border">
                      <div className="w-12 shrink-0 text-muted-foreground/50 font-mono text-[10px] mt-0.5" dir="ltr">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' })}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase
                            ${log.status === 'ok' ? 'bg-green-500/20 text-green-500' : 
                              log.status === 'fail' || log.status === 'error' ? 'bg-red-500/20 text-red-500' : 
                              log.status === 'warn' ? 'bg-yellow-500/20 text-yellow-500' : 
                              'bg-blue-500/20 text-blue-400'}`}>
                            {log.status}
                          </span>
                          <span className="font-mono text-muted-foreground text-[10px]">{log.step}</span>
                        </div>
                        <p className="text-foreground break-words leading-relaxed" dir="auto">{log.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}