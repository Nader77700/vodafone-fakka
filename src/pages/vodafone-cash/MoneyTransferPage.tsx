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

export default function MoneyTransferPage() {
  const navigate = useNavigate();
  const { config } = useRuntimeConfig();

  // Status State
  const [networkName, setNetworkName] = useState('جاري التحقق...');
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingConn, setIsCheckingConn] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [seamlessData, setSeamlessData] = useState<{ token: string | null; msisdn: string | null }>({ token: null, msisdn: null });

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
    const seamlessClientId = config?.security?.sec_seamless_client_id || 'cash-app';
    const seamlessUrl = config?.security?.sec_seamless_url || 'http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth';
    
    try {
      const res = await fetchSeamlessToken(seamlessClientId, seamlessUrl);
      if (res.token) {
        setIsConnected(true);
        setNetworkName('Vodafone Egypt (Mobile Data)');
        setSeamlessData({ token: res.token, msisdn: res.msisdn });
      } else {
        setIsConnected(false);
        setNetworkName('Wi-Fi / شبكة غير مدعومة');
        setSeamlessData({ token: null, msisdn: null });
      }
    } catch (err) {
      setIsConnected(false);
      setNetworkName('غير متصل / فشل الاتصال');
    }
    setLastChecked(new Date());
    setIsCheckingConn(false);
  };

  useEffect(() => {
    checkConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setExecStatus('checking');
    setExecMessage(null);
    setExecLogs([]);

    // We already have seamless token, proceed directly
    setExecStatus('executing');
    setExecLogs(prev => [...prev, { step: 'frontend', status: 'info', detail: 'بدء الاتصال بالخادم...', timestamp: new Date().toISOString() }]);

    const res = await VodafoneCashService.initiateMoneyTransfer({
      receiver_number: receiver,
      amount: Number(amount),
      pin: pin,
      seamless_token: seamlessData.token,
      msisdn: seamlessData.msisdn
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
    <div className="min-h-screen bg-[#0A0A0A] pb-24 text-white font-cairo selection:bg-[#E60000]/30 selection:text-white" dir="rtl">
      {/* Top Nav */}
      <div className="sticky top-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between px-4 h-16">
          <button onClick={() => navigate(-1)} className="p-2 -mr-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors">
            <ArrowLeft className="w-6 h-6 rotate-180" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide">تحويل الأموال</h1>
            <p className="text-[10px] text-[#E60000] font-medium">Vodafone Cash</p>
          </div>
          <button onClick={() => navigate('/vodafone-cash-center/history/transfer')} className="p-2 -ml-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors text-white/70">
            <Clock className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-6">
        {/* System Status Panel */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#E60000]" />
              حالة النظام
            </h2>
            <button onClick={checkConnection} disabled={isCheckingConn} className="text-xs text-white/60 hover:text-white flex items-center gap-1">
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingConn ? 'animate-spin' : ''}`} />
              تحديث
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">حالة الاتصال</span>
              <div className="flex items-center gap-1.5">
                {isCheckingConn ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white/60" />
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
              <span className="text-xs text-white/60">الشبكة الحالية</span>
              <span className="text-xs font-medium text-white/90" dir="ltr">{networkName}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">اخر فحص</span>
              <span className="text-[10px] text-white/40" dir="ltr">
                {lastChecked ? lastChecked.toLocaleTimeString() : '--:--'}
              </span>
            </div>
          </div>
          
          {!isConnected && !isCheckingConn && (
            <div className="mt-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-500/90 leading-relaxed">
                تأكد أنك مشغل الشريحة على خط فودافون وأنك غير متصل بالواي فاي لتتمكن من استخدام الخدمة.
              </p>
            </div>
          )}
        </div>

        {execStatus === 'idle' ? (
          <>
            {/* Form Container */}
            <div className="bg-[#111] border border-white/10 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
              <div className="space-y-5 relative z-10">
                {/* Receiver Field */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-white/80">رقم المستفيد</label>
                  <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-colors ${receiver && (!isReceiverValid || !isReceiverLengthValid) ? 'border-red-500' : 'border-white/10 focus-within:border-[#E60000]'}`}>
                    <div className="pl-3 pr-2 text-white/40">
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
                      className="flex-1 bg-transparent border-none text-white text-lg py-3 outline-none placeholder:text-white/20 text-left"
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
                  <label className="text-sm font-bold text-white/80">المبلغ</label>
                  <div className={`flex items-center bg-[#1A1A1A] border rounded-xl overflow-hidden transition-colors ${amount !== '' && !isAmountValid ? 'border-red-500' : 'border-white/10 focus-within:border-[#E60000]'}`}>
                    <div className="pl-3 pr-2 text-white/40">
                      <span className="text-sm font-bold">EGP</span>
                    </div>
                    <input
                      type="tel"
                      dir="ltr"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="0"
                      className="flex-1 bg-transparent border-none text-white text-lg py-3 outline-none placeholder:text-white/20 text-left"
                    />
                  </div>
                  <div className="flex justify-between items-center px-1">
                    {amount !== '' && !isAmountValid ? (
                      <p className="text-xs text-red-500 font-medium">خطأ: الحد الأدنى 2 جنيه</p>
                    ) : (
                      <p className="text-[10px] text-white/40">الحد الأدنى للتحويل: 2 ج.م</p>
                    )}
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2 mt-4">
                  <div className="bg-[#1C1C1C] rounded-2xl p-4 border border-white/5">
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
                  ? 'bg-[#E60000] text-white shadow-[0_0_20px_rgba(230,0,0,0.4)] hover:bg-[#CC0000] active:scale-[0.98]' 
                  : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'}`}
            >
              <Send className="w-5 h-5" />
              تحويل الآن
            </button>
          </>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Status Card */}
            <div className="bg-[#111] border border-white/10 rounded-2xl p-6 text-center shadow-xl">
              <div className="flex justify-center mb-4">
                {execStatus === 'checking' || execStatus === 'executing' ? (
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-[#E60000] animate-spin" />
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
                  className="mt-6 px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-colors"
                >
                  إجراء تحويل جديد
                </button>
              )}
            </div>

            {/* Execution Logs */}
            {execLogs.length > 0 && (
              <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
                <h4 className="text-xs font-bold text-white/60 mb-3 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  سجل التنفيذ (من السيرفر)
                </h4>
                <div className="space-y-2">
                  {execLogs.map((log, i) => (
                    <div key={i} className="flex gap-3 text-xs bg-black/40 p-2.5 rounded-lg border border-white/5">
                      <div className="w-12 shrink-0 text-white/30 font-mono text-[10px] mt-0.5" dir="ltr">
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
                          <span className="font-mono text-white/50 text-[10px]">{log.step}</span>
                        </div>
                        <p className="text-white/80 break-words leading-relaxed" dir="auto">{log.detail}</p>
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