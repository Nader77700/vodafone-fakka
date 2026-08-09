import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wallet, History, Wifi, WifiOff, RefreshCw,
  ShieldCheck, AlertTriangle, ChevronRight
} from 'lucide-react';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { VodafoneDetector } from '@/lib/vodafoneDetector';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

export default function WalletBalancePage() {
  const navigate = useNavigate();
  const { config } = useRuntimeConfig();

  const [networkName, setNetworkName]       = useState('جاري التحقق...');
  const [isConnected, setIsConnected]       = useState(false);
  const [isCheckingConn, setIsCheckingConn] = useState(true);
  const [lastChecked, setLastChecked]       = useState<Date | null>(null);

  const checkConnection = async () => {
    setIsCheckingConn(true);
    setNetworkName('جاري فحص الشبكة...');
    try {
      if (Capacitor.isNativePlatform() && VodafoneDetector?.requestPhonePermission) {
        await VodafoneDetector.requestPhonePermission();
        const result = await Promise.race([
          VodafoneDetector.getNetworkInfo(),
          new Promise<any>((res) => setTimeout(() => res({
            canExecuteNative: true, isVodafoneSim: true,
            activeNetwork: 'timeout_fallback', activeDataSimOperatorName: 'Vodafone (Fallback)'
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
        setIsConnected(false);
        setNetworkName('غير مدعوم على المتصفح');
      }
    } catch {
      setIsConnected(false);
      setNetworkName('خطأ في فحص الشبكة');
    } finally {
      setLastChecked(new Date());
      setIsCheckingConn(false);
    }
  };

  useEffect(() => { checkConnection(); }, []);

  // ── تحديث تلقائي عند تغيير الشبكة ─────────────────────────────
  useEffect(() => {
    let listener: any;
    (async () => {
      listener = await Network.addListener('networkStatusChange', () => {
        checkConnection();
      });
    })();
    return () => { listener?.remove?.(); };
  }, []);

  const services = [
    {
      id: 'balance',
      title: 'الاستعلام عن الرصيد',
      desc: 'اعرف رصيد محفظتك Vodafone Cash فوراً',
      icon: <Wallet className="w-6 h-6" />,
      path: '/vodafone-cash-center/wallet-balance/query',
    },
    {
      id: 'history',
      title: 'سجل العمليات',
      desc: 'تصفح كل معاملاتك في فترة زمنية محددة',
      icon: <History className="w-6 h-6" />,
      path: '/vodafone-cash-center/wallet-balance/transactions',
    },
  ];

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24 text-white font-cairo">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between px-4 h-16">
          <button onClick={() => navigate('/vodafone-cash-center')}
            className="p-2 -mr-2 rounded-full hover:bg-white/10 active:bg-white/5 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide">رصيد المحفظة وسجل العمليات</h1>
            <p className="text-[10px] text-[#E60000] font-medium">Vodafone Cash</p>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 space-y-5">
        {/* بطاقة حالة النظام */}
        <div className={`rounded-2xl border p-4 transition-all duration-500
          ${isConnected
            ? 'bg-[#0D1F12] border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
            : 'bg-[#1A0D0D] border-[#E60000]/30 shadow-[0_0_20px_rgba(230,0,0,0.08)]'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${isConnected ? 'text-green-400' : 'text-[#E60000]'}`} />
              <span className="text-xs font-bold text-white/80">حالة النظام</span>
            </div>
            <button onClick={checkConnection} disabled={isCheckingConn}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 text-white/60 ${isCheckingConn ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-[#E60000]'}`} />
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
          {!isConnected && !isCheckingConn && (
            <p className="text-xs text-[#E60000]/80 mt-3 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              يجب تشغيل بيانات فودافون (Vodafone Mobile Data) لاستخدام هذه الخدمة. Wi-Fi وحده لا يكفي.
            </p>
          )}
        </div>

        {/* الخيارات */}
        <div className="space-y-4">
          {services.map((svc) => (
            <button
              key={svc.id}
              onClick={() => { if (isConnected || isCheckingConn) navigate(svc.path); }}
              disabled={!isConnected && !isCheckingConn}
              className={`w-full rounded-2xl border p-5 flex items-center gap-4 text-right transition-all duration-300
                ${isConnected
                  ? 'bg-[#111] border-white/10 hover:border-[#E60000]/50 hover:bg-[#1a0a0a] active:scale-[0.98] cursor-pointer'
                  : 'bg-[#111]/50 border-white/5 opacity-50 cursor-not-allowed'}`}>
              <div className="w-12 h-12 rounded-xl bg-[#E60000]/10 border border-[#E60000]/20 flex items-center justify-center text-[#E60000] shrink-0">
                {svc.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white">{svc.title}</h3>
                <p className="text-xs text-white/50 mt-0.5">{svc.desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/30 shrink-0 rotate-180" />
            </button>
          ))}
        </div>

        {/* ملاحظات */}
        <div className="bg-[#1A1A1A] border border-[#E60000]/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#E60000] shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <h4 className="text-sm font-bold text-[#E60000]">ملاحظات هامة:</h4>
              <ul className="text-xs text-white/60 space-y-1 list-disc list-inside pr-1">
                <li>يجب تشغيل بيانات فودافون (Vodafone Data) للاستخدام.</li>
                <li>PIN المحفظة مطلوب لكل عملية ولا يُحفظ.</li>
                <li>لن يتم إجراء أي عملية تحويل — استعلام فقط.</li>
                <li>البيانات تُعرض مباشرة من Vodafone Cash.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
