import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, History, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Wifi, WifiOff, RefreshCw, ShieldCheck, Calendar, ChevronDown,
  ArrowUpRight, ArrowDownLeft, Clock, User, Hash, CreditCard, Filter
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { VodafoneDetector } from '@/lib/vodafoneDetector';
import { fetchSeamlessToken } from '@/lib/seamless';
import { VodafoneCashService } from '@/services/vodafone-cash/VodafoneCashService';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { PinInputBlock } from '@/components/vodafone-cash/PinInputBlock';
import { toast } from 'sonner';

type HistoryStatus = 'idle' | 'checking' | 'loading' | 'success' | 'failed';
type Period = '1m' | '3m' | '6m' | 'custom';

interface Transaction {
  name?: string;
  amount?: { value?: number | string };
  paymentDate?: string;
  channel?: { id?: string };
  paymentMethod?: { relatedParty?: { id?: string; name?: string } };
  taxAmount?: { value?: number | string };
  [key: string]: any;
}

const EGYPT_TZ = 'Africa/Cairo';

function egyptNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: EGYPT_TZ }));
}

function subtractDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - days);
  r.setHours(0, 0, 0, 0);
  return r;
}

function formatDisplayDate(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: EGYPT_TZ }),
      time: d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: EGYPT_TZ }),
    };
  } catch { return { date: iso, time: '' }; }
}

function parseDateInput(val: string): Date | null {
  // DD-MM-YYYY
  const m = val.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00+03:00`);
  return isNaN(d.getTime()) ? null : d;
}

// ─── بطاقة عملية واحدة ───────────────────────────────────
function TxCard({ tx, index }: { tx: Transaction; index: number }) {
  const name       = tx.name || 'عملية';
  const amount     = tx.amount?.value ?? '—';
  const payDate    = tx.paymentDate || '';
  const channel    = tx.channel?.id || '';
  const receiver   = tx.paymentMethod?.relatedParty?.id || '';
  const recvName   = tx.paymentMethod?.relatedParty?.name || '';
  const tax        = tx.taxAmount?.value;
  const { date, time } = formatDisplayDate(payDate);
  const isOut      = Number(amount) < 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      {/* رأس البطاقة */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${isOut ? 'bg-[#E60000]/10 border border-[#E60000]/20' : 'bg-green-500/10 border border-green-500/20'}`}>
          {isOut
            ? <ArrowUpRight className="w-5 h-5 text-[#E60000]" />
            : <ArrowDownLeft className="w-5 h-5 text-green-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{name}</p>
          <p className="text-[10px] text-white/40 mt-0.5">#{index}</p>
        </div>
        <div className={`text-base font-black shrink-0 ${isOut ? 'text-[#E60000]' : 'text-green-400'}`}>
          {isOut ? '' : '+'}{amount} <span className="text-xs font-bold">ج</span>
        </div>
      </div>

      {/* تفاصيل */}
      <div className="grid grid-cols-2 gap-2">
        {receiver && (
          <div className="flex items-center gap-1.5 bg-white/3 rounded-lg px-2.5 py-1.5 min-w-0">
            <Hash className="w-3 h-3 text-white/30 shrink-0" />
            <span className="text-[11px] text-white/60 truncate font-mono" dir="ltr">{receiver}</span>
          </div>
        )}
        {recvName && (
          <div className="flex items-center gap-1.5 bg-white/3 rounded-lg px-2.5 py-1.5 min-w-0">
            <User className="w-3 h-3 text-white/30 shrink-0" />
            <span className="text-[11px] text-white/60 truncate">{recvName}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 bg-white/3 rounded-lg px-2.5 py-1.5 min-w-0">
          <Calendar className="w-3 h-3 text-white/30 shrink-0" />
          <span className="text-[11px] text-white/60 truncate" dir="ltr">{date}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white/3 rounded-lg px-2.5 py-1.5 min-w-0">
          <Clock className="w-3 h-3 text-white/30 shrink-0" />
          <span className="text-[11px] text-white/60 truncate" dir="ltr">{time}</span>
        </div>
        {channel && (
          <div className="flex items-center gap-1.5 bg-white/3 rounded-lg px-2.5 py-1.5 min-w-0">
            <CreditCard className="w-3 h-3 text-white/30 shrink-0" />
            <span className="text-[11px] text-white/60 truncate">{channel}</span>
          </div>
        )}
        {tax !== undefined && tax !== 0 && (
          <div className="flex items-center gap-1.5 bg-white/3 rounded-lg px-2.5 py-1.5 min-w-0">
            <span className="text-[10px] text-white/30 shrink-0">ضريبة</span>
            <span className="text-[11px] text-white/60 truncate">{tax} ج</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TransactionHistoryPage() {
  const navigate = useNavigate();
  const { config } = useRuntimeConfig();

  const [networkName, setNetworkName]       = useState('جاري التحقق...');
  const [isConnected, setIsConnected]       = useState(false);
  const [isCheckingConn, setIsCheckingConn] = useState(true);
  const [lastChecked, setLastChecked]       = useState<Date | null>(null);

  const [pin, setPin]           = useState('');
  const [period, setPeriod]     = useState<Period>('1m');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');

  const [status, setStatus]         = useState<HistoryStatus>('idle');
  const [transactions, setTx]       = useState<Transaction[]>([]);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [paginationErr, setPagErr]  = useState(false);
  const [periodLabel, setPeriodLabel] = useState('');

  const isPinValid = pin.length >= 4;
  const canSubmit  = isPinValid && isConnected && status === 'idle';

  const checkConnection = async () => {
    setIsCheckingConn(true); setNetworkName('جاري فحص الشبكة...');
    try {
      if (Capacitor.isNativePlatform() && VodafoneDetector?.requestPhonePermission) {
        await VodafoneDetector.requestPhonePermission();
        const result = await Promise.race([
          VodafoneDetector.getNetworkInfo(),
          new Promise<any>((res) => setTimeout(() => res({ canExecuteNative: true, isVodafoneSim: true }), 4000))
        ]);
        if (result?.isVodafoneMobile && result?.isMobileDataActive) {
          setIsConnected(true); setNetworkName('Vodafone Egypt (Mobile Data)');
        } else if (result?.isWifiActive) {
          setIsConnected(false); setNetworkName('Wi-Fi / شبكة غير مدعومة');
        } else {
          setIsConnected(false); setNetworkName('غير متصل / بيانات معطلة');
        }
      } else {
        setIsConnected(false); setNetworkName('غير مدعوم على المتصفح');
      }
    } catch { setIsConnected(false); setNetworkName('خطأ في فحص الشبكة'); }
    finally { setLastChecked(new Date()); setIsCheckingConn(false); }
  };

  useEffect(() => { checkConnection(); }, []);

  const getDateRange = (): { start: Date; end: Date } | null => {
    const now = egyptNow();
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    if (period === '1m') return { start: subtractDays(now, 31), end };
    if (period === '3m') return { start: subtractDays(now, 92), end };
    if (period === '6m') return { start: subtractDays(now, 183), end };
    if (period === 'custom') {
      const s = parseDateInput(customStart);
      const e = parseDateInput(customEnd);
      if (!s || !e) { toast.error('صيغة التاريخ غير صحيحة. استخدم DD-MM-YYYY'); return null; }
      if (s > e) { toast.error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية'); return null; }
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    return null;
  };

  const handleLoad = async () => {
    if (!canSubmit) return;
    const range = getDateRange();
    if (!range) return;

    setStatus('checking');
    setErrorMsg(null);
    setTx([]);
    setPagErr(false);

    const label = period === 'custom'
      ? `${customStart} → ${customEnd}`
      : period === '1m' ? 'آخر شهر' : period === '3m' ? 'آخر 3 شهور' : 'آخر 6 شهور';
    setPeriodLabel(label);

    const toastId = toast.loading('جاري التحقق من فودافون كاش...');

    const seamlessClientId = config?.security?.sec_seamless_client_id || 'ana-vodafone-app-seamless';
    const seamlessUrl = config?.security?.sec_seamless_url;
    const seamless = await fetchSeamlessToken(seamlessClientId, seamlessUrl);

    if (!seamless.token) toast.warning('تعذر التعرف تلقائياً، جاري المحاولة عبر PIN...', { id: toastId });

    setStatus('loading');
    toast.loading('جاري تحميل سجل العمليات...', { id: toastId });

    const res = await VodafoneCashService.getTransactionHistory({
      pin,
      seamless_token: seamless.token,
      msisdn: seamless.msisdn,
      start_date: range.start.toISOString(),
      end_date: range.end.toISOString(),
    });

    if (res.success) {
      setTx(res.transactions || []);
      setPagErr(res.pagination_error || false);
      setStatus('success');
      if (res.pagination_error) {
        toast.warning(`تم تحميل ${res.total} عملية (جزئي — توقف التصفح)`, { id: toastId, duration: 4000 });
      } else {
        toast.success(`تم تحميل ${res.total} عملية بنجاح`, { id: toastId });
      }
    } else {
      setErrorMsg(res.message);
      setStatus('failed');
      toast.error(res.message || 'تعذر تحميل السجل', { id: toastId, duration: 5000 });
    }
  };

  const handleReset = () => {
    setStatus('idle'); setTx([]); setErrorMsg(null); setPin(''); setPagErr(false);
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const PERIODS: { value: Period; label: string }[] = [
    { value: '1m', label: 'آخر شهر' },
    { value: '3m', label: 'آخر 3 شهور' },
    { value: '6m', label: 'آخر 6 شهور' },
    { value: 'custom', label: 'فترة مخصصة' },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 font-cairo">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 h-16">
          <button onClick={() => navigate('/vodafone-cash-center/wallet-balance')}
            className="p-2 -mr-2 rounded-full hover:bg-accent active:bg-accent/50 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-[17px] font-bold tracking-wide">سجل العمليات</h1>
            <p className="text-[10px] text-[#E60000] font-medium">Vodafone Cash History</p>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 space-y-5">
        {/* حالة الاتصال */}
        <div className={`rounded-2xl border p-4 transition-all duration-500
          ${isConnected ? 'bg-[#0D1F12] border-green-500/30' : 'bg-[#1A0D0D] border-[#E60000]/30'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-[#E60000]'}`} />
              {isConnected
                ? <Wifi className="w-4 h-4 text-green-400" />
                : <WifiOff className="w-4 h-4 text-[#E60000]" />}
              <span className="text-sm font-bold truncate">{networkName}</span>
            </div>
            <button onClick={checkConnection} disabled={isCheckingConn}
              className="p-1.5 rounded-full hover:bg-accent transition-colors disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 text-white/60 ${isCheckingConn ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {lastChecked && (
            <p className="text-[10px] text-white/40 mt-1.5">آخر فحص: {formatTime(lastChecked)}</p>
          )}
        </div>

        {/* فورم الاختيار */}
        {(status === 'idle' || status === 'checking' || status === 'loading') && (
          <>
            {/* اختيار الفترة */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Filter className="w-4 h-4 text-[#E60000]" />
                <h3 className="text-sm font-bold text-white/80">اختر الفترة الزمنية</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PERIODS.map((p) => (
                  <button key={p.value} onClick={() => setPeriod(p.value)}
                    className={`py-2.5 px-3 rounded-xl text-sm font-bold transition-all duration-200
                      ${period === p.value
                        ? 'bg-[#E60000] text-white shadow-[0_0_15px_rgba(230,0,0,0.3)]'
                        : 'bg-muted text-muted-foreground border border-border hover:border-primary/40'}`}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* فترة مخصصة */}
              {period === 'custom' && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-white/50">الصيغة: DD-MM-YYYY (مثال: 01-01-2025)</p>
                  <div className="space-y-2">
                    <input
                      type="text" placeholder="تاريخ البداية (DD-MM-YYYY)"
                      value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                      dir="ltr"
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-[#E60000] focus:outline-none font-mono"
                    />
                    <input
                      type="text" placeholder="تاريخ النهاية (DD-MM-YYYY)"
                      value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                      dir="ltr"
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-[#E60000] focus:outline-none font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* PIN */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#E60000]/5 rounded-full blur-3xl" />
              <p className="text-xs text-white/50 relative z-10">PIN محفظة Vodafone Cash — لن يُحفظ أو يُسجَّل.</p>
              <div className="bg-[#1C1C1C] rounded-2xl p-4 border border-border relative z-10">
                <PinInputBlock pin={pin} setPin={setPin} submitting={status !== 'idle'} />
              </div>
            </div>

            {/* زر التحميل */}
            <button disabled={!canSubmit || status !== 'idle'} onClick={handleLoad}
              className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 text-base font-bold transition-all duration-300
                ${canSubmit && status === 'idle'
                  ? 'bg-[#E60000] text-white shadow-[0_0_20px_rgba(230,0,0,0.4)] hover:bg-[#CC0000] active:scale-[0.98]'
                  : 'bg-white/5 text-white/30 cursor-not-allowed border border-border'}`}>
              {status === 'checking' || status === 'loading'
                ? <><Loader2 className="w-5 h-5 animate-spin" /> جاري التحميل...</>
                : <><History className="w-5 h-5" /> تحميل السجل</>}
            </button>
          </>
        )}

        {/* نتائج */}
        {status === 'success' && (
          <div className="space-y-4">
            {/* رأس النتائج */}
            <div className={`rounded-2xl border p-4 ${paginationErr ? 'bg-yellow-900/20 border-yellow-500/30' : 'bg-[#0D1F12] border-green-500/30'}`}>
              <div className="flex items-center gap-3">
                {paginationErr
                  ? <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
                  : <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${paginationErr ? 'text-yellow-400' : 'text-green-400'}`}>
                    {transactions.length} عملية {paginationErr ? '(جزئي)' : ''}
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">{periodLabel}</p>
                </div>
                <button onClick={handleReset}
                  className="text-xs font-bold text-white/50 bg-white/5 px-3 py-1.5 rounded-lg hover:bg-accent transition-colors shrink-0">
                  بحث جديد
                </button>
              </div>
              {paginationErr && (
                <p className="text-xs text-yellow-300/70 mt-2">
                  تعذر تحميل كل الصفحات. البيانات المعروضة قد تكون غير مكتملة.
                </p>
              )}
            </div>

            {/* قائمة العمليات */}
            {transactions.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <History className="w-12 h-12 text-white/10 mx-auto" />
                <p className="text-white/40 font-bold">لا توجد عمليات في هذه الفترة</p>
                <p className="text-xs text-white/25">جرب فترة زمنية أوسع</p>
                <button onClick={handleReset}
                  className="mt-4 px-6 py-2.5 rounded-xl bg-white/5 border border-border text-sm font-bold text-white/60 hover:bg-accent transition-colors">
                  بحث جديد
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx, i) => (
                  <TxCard key={i} tx={tx} index={i + 1} />
                ))}
                <p className="text-center text-xs text-white/25 pt-2">
                  تم عرض {transactions.length} عملية بالكامل
                </p>
              </div>
            )}
          </div>
        )}

        {/* فشل */}
        {status === 'failed' && errorMsg && (
          <div className="bg-[#1A0D0D] border border-[#E60000]/40 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-[#E60000] shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-[#E60000] mb-1">تعذر تحميل السجل</h3>
                <p className="text-xs text-white/60">{errorMsg}</p>
              </div>
            </div>
            <button onClick={handleReset}
              className="mt-4 w-full py-3 rounded-xl bg-[#E60000]/10 border border-[#E60000]/30 text-sm font-bold text-[#E60000] hover:bg-[#E60000]/20 transition-colors">
              حاول مرة أخرى
            </button>
          </div>
        )}

        {/* تحذير عدم الاتصال */}
        {!isConnected && !isCheckingConn && status === 'idle' && (
          <div className="bg-[#1A0D0D] border border-[#E60000]/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#E60000] shrink-0 mt-0.5" />
            <p className="text-xs text-white/60">
              يجب تشغيل <span className="text-[#E60000] font-bold">بيانات فودافون</span> لعرض سجل العمليات.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
