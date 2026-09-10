/**
 * LineInfoModal — مودال "معلومات الخط" — المرحلة الثانية
 * Real Provider + فحص رقم آخر + سجل الفحوصات
 */

import { useState, useRef } from 'react';
import {
  X, Phone, Search, Info, Cpu, Banknote, CreditCard,
  Copy, Check, CheckCircle2, XCircle, Loader2, RotateCcw,
  CalendarClock, PackageOpen, ClipboardList, History,
  WifiOff, ServerCrash, HelpCircle, Wifi, ArrowRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  fetchLineInfo,
  getLineInfoHistory,
  type LineInfoResult,
  type LineInfoStatus,
  type LineInfoHistoryEntry,
  type CardItem,
} from '@/lib/lineInfoProvider';
import { useIsLight } from '@/contexts/ThemeContext';

// ── نسخ النص ─────────────────────────────────────────────────
async function copyText(text: string, label: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`تم نسخ ${label}`); }
  catch { toast.error('تعذّر النسخ'); }
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async () => { await copyText(text, label); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
      style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
      title={`نسخ ${label}`}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-white/50" />}
    </button>
  );
}

function InfoRow({ icon, label, value, ct }: { icon: React.ReactNode; label: string; value: string; ct?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/[0.06] last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="shrink-0 text-white/40">{icon}</span>
        <span className="text-xs text-white/50 shrink-0">{label}</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-bold text-white truncate" dir="ltr">{value}</span>
        {ct && <CopyBtn text={ct} label={label} />}
      </div>
    </div>
  );
}

function fmtAllowance(avail: number, unit: string): string {
  return unit ? `${avail} ${unit}` : String(avail);
}

function CardRow({ card, accentColor }: { card: CardItem; accentColor: string }) {
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44` }}>
          <CreditCard className="w-3 h-3" style={{ color: accentColor }} />
        </div>
        <span className="text-sm font-black text-white truncate">{card.name}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { Icon: PackageOpen, label: 'المتبقي',  val: fmtAllowance(card.availableAllowance, card.unitCode) },
          { Icon: PackageOpen, label: 'المستخدم', val: fmtAllowance(card.usedAllowance, card.unitCode) },
          { Icon: CalendarClock, label: 'التجديد', val: card.resetDate || '—' },
        ].map(({ Icon, label, val }) => (
          <div key={label} className="rounded-lg p-1.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[9px] text-white/40 mb-0.5 flex items-center justify-center gap-0.5">
              <Icon className="w-2.5 h-2.5" /> {label}
            </p>
            <p className="text-xs font-black text-white" dir="ltr">{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardSection({ title, cards, accentColor }: { title: string; cards: CardItem[]; accentColor: string }) {
  if (cards.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5" style={{ color: accentColor }} />
          <span className="text-xs font-black text-white">{title}</span>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
            style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}33` }}>
            {cards.length}
          </span>
        </div>
        <CopyBtn text={cards.map(c => `${c.name} | ${fmtAllowance(c.availableAllowance, c.unitCode)} | ${c.resetDate}`).join('\n')} label={title} />
      </div>
      <div className="p-2.5 space-y-2">
        {cards.map((c, i) => <CardRow key={i} card={c} accentColor={accentColor} />)}
      </div>
    </div>
  );
}

function buildCopyAll(data: LineInfoResult): string {
  const lines = [
    `الرقم: ${data.phoneNumber}`,
    data.system      ? `النظام: ${data.system}`     : null,
    data.balance     ? `الرصيد: ${data.balance}`    : null,
    data.loanDetails ? `سلفني: ${data.loanDetails}` : null,
  ].filter(Boolean) as string[];
  if (data.miBundles.length)  lines.push('', 'الباقات:', ...data.miBundles.map(c => `- ${c.name} | ${fmtAllowance(c.availableAllowance, c.unitCode)}`));
  if (data.fakkaCards.length) lines.push('', 'كروت فكة:', ...data.fakkaCards.map(c => `- ${c.name} | ${fmtAllowance(c.availableAllowance, c.unitCode)}`));
  if (data.maredCards.length) lines.push('', 'كروت مارد:', ...data.maredCards.map(c => `- ${c.name} | ${fmtAllowance(c.availableAllowance, c.unitCode)}`));
  return lines.join('\n');
}

function ErrorBanner({ status, message }: { status: LineInfoStatus; message?: string }) {
  const map: Record<string, { icon: React.ReactNode; color: string }> = {
    invalid_number:      { icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,    color: '#f87171' },
    number_unavailable:  { icon: <HelpCircle className="w-3.5 h-3.5 shrink-0" />, color: '#fb923c' },
    no_data:             { icon: <Info className="w-3.5 h-3.5 shrink-0" />,        color: '#fbbf24' },
    service_unavailable: { icon: <ServerCrash className="w-3.5 h-3.5 shrink-0" />,color: '#fb923c' },
    connection_error:    { icon: <WifiOff className="w-3.5 h-3.5 shrink-0" />,    color: '#f87171' },
    timeout:             { icon: <Wifi className="w-3.5 h-3.5 shrink-0" />,       color: '#fbbf24' },
    error:               { icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,    color: '#f87171' },
  };
  const cfg = map[status] ?? map['error'];
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold"
      style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}40`, color: cfg.color }}>
      {cfg.icon} <span>{message ?? 'حدث خطأ، حاول مرة أخرى.'}</span>
    </div>
  );
}

function HistoryPanel({ onSelect }: { onSelect: (e: LineInfoHistoryEntry) => void }) {
  const entries = getLineInfoHistory();
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <History className="w-3.5 h-3.5 shrink-0" style={{ color: '#E60000' }} />
        <span className="text-xs font-black text-white">سجل الفحوصات</span>
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(230,0,0,0.12)', color: '#E60000', border: '1px solid rgba(230,0,0,0.22)' }}>
          {entries.length}
        </span>
      </div>
      <div>
        {entries.map(e => (
          <button key={e.id} onClick={() => onSelect(e)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-right border-b border-white/[0.04] last:border-0 active:bg-white/5 transition-colors">
            <div className="min-w-0">
              <p className="text-sm font-black text-white" dir="ltr">{e.phone}</p>
              <p className="text-[10px] text-white/40 mt-0.5">{e.result.system ?? '—'}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mr-2">
              {e.result.balance && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.20)' }}>
                  {e.result.balance}
                </span>
              )}
              <ArrowRight className="w-3 h-3 text-white/25" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// الـ Modal
// ═══════════════════════════════════════════════════════════════
interface LineInfoModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialPhone?: string;
}

export default function LineInfoModal({ open, onOpenChange, initialPhone }: LineInfoModalProps) {
  const L = useIsLight();
  const [phone,   setPhone]   = useState(initialPhone ?? '');
  const [status,  setStatus]  = useState<LineInfoStatus>('idle');
  const [result,  setResult]  = useState<LineInfoResult | null>(null);
  const [errMsg,  setErrMsg]  = useState<string | undefined>();
  const [histKey, setHistKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (v: boolean) => {
    if (!v) { setPhone(''); setStatus('idle'); setResult(null); setErrMsg(undefined); }
    onOpenChange(v);
  };

  const handleSearch = async () => {
    const trimmed = phone.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }
    setStatus('loading');
    setResult(null);
    setErrMsg(undefined);
    const res = await fetchLineInfo(trimmed);
    setStatus(res.status);
    setErrMsg(res.errorMessage);
    if (res.status === 'success' && res.data) {
      setResult(res.data);
      setHistKey(k => k + 1);
    }
  };

  const handleReset = () => {
    setResult(null);
    setStatus('idle');
    setErrMsg(undefined);
    setPhone('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSelectHistory = (entry: LineInfoHistoryEntry) => {
    setPhone(entry.phone);
    setResult(entry.result);
    setStatus('success');
    setErrMsg(undefined);
  };

  const isLoading = status === 'loading';
  const isError   = ['invalid_number','no_data','number_unavailable','service_unavailable','connection_error','timeout','error'].includes(status);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto p-0 gap-0"
        dir="rtl"
        style={{ background: L ? '#ffffff' : '#0d1117', border: `1px solid ${L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}` }}
      >
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0"
          style={{ borderColor: L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }}>
          <DialogTitle className="flex items-center gap-2 text-base font-black" style={{ color: L ? '#1a1a2e' : '#ffffff' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.25)' }}>
              <Info className="w-3.5 h-3.5" style={{ color: '#E60000' }} />
            </div>
            معلومات الخط
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* حقل الإدخال */}
          <div className="space-y-2">
            <label className="text-xs font-bold" style={{ color: L ? '#1a1a2e' : 'rgba(255,255,255,0.70)' }}>رقم الهاتف</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: L ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.30)' }} />
                <input ref={inputRef} type="tel" inputMode="numeric" value={phone}
                  onChange={e => { setPhone(e.target.value); if (status !== 'idle' && status !== 'success') setStatus('idle'); }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="أدخل رقم الهاتف" maxLength={13} disabled={isLoading}
                  className="w-full h-11 rounded-xl pr-9 pl-3 text-sm font-medium outline-none"
                  style={{ background: L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', border: `1px solid ${L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`, color: L ? '#1a1a2e' : '#ffffff', direction: 'ltr' }}
                  dir="ltr" />
              </div>
              <button onClick={handleSearch} disabled={isLoading || !phone.trim()}
                className="h-11 px-4 rounded-xl flex items-center gap-2 font-black text-sm shrink-0 transition-all active:scale-95 disabled:opacity-50"
                style={{ background: '#E60000', color: '#ffffff' }}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {isLoading ? 'جاري...' : 'فحص'}
              </button>
            </div>
            {isLoading && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.20)', color: '#818cf8' }}>
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> جاري الفحص… قد يستغرق حتى 15 ثانية
              </div>
            )}
            {isError && <ErrorBanner status={status} message={errMsg} />}
          </div>

          {/* نتيجة */}
          {status === 'success' && result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-xs font-bold text-green-400">تم الفحص بنجاح</span>
                </div>
                <button onClick={handleReset}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-black transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)' }}>
                  <RotateCcw className="w-3 h-3" /> فحص رقم آخر
                </button>
              </div>

              {/* المعلومات الأساسية */}
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5" style={{ color: '#E60000' }} />
                    <span className="text-xs font-black text-white">المعلومات الأساسية</span>
                  </div>
                  <CopyBtn text={[`الرقم: ${result.phoneNumber}`, result.system ? `النظام: ${result.system}` : null, result.balance ? `الرصيد: ${result.balance}` : null].filter(Boolean).join('\n')} label="المعلومات" />
                </div>
                <div className="px-3 py-1">
                  <InfoRow icon={<Phone className="w-3.5 h-3.5" />}   label="الرقم"  value={result.phoneNumber}  ct={result.phoneNumber} />
                  {result.system      && <InfoRow icon={<Cpu     className="w-3.5 h-3.5" />} label="النظام" value={result.system} />}
                  {result.balance     && <InfoRow icon={<Banknote className="w-3.5 h-3.5" />} label="الرصيد" value={result.balance} />}
                  {result.loanDetails && <InfoRow icon={<Info    className="w-3.5 h-3.5" />} label="سلفني"  value={result.loanDetails} />}
                </div>
              </div>

              <CardSection title="الباقات"    cards={result.miBundles}   accentColor="#6366f1" />
              <CardSection title="كروت فكة"   cards={result.fakkaCards}  accentColor="#E60000" />
              <CardSection title="كروت مارد"  cards={result.maredCards}  accentColor="#F7C948" />

              <button onClick={() => copyText(buildCopyAll(result), 'كل المعلومات')}
                className="w-full h-11 rounded-xl flex items-center justify-center gap-2 font-black text-sm transition-all active:scale-[0.98]"
                style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.22)', color: '#E60000' }}>
                <Copy className="w-4 h-4" /> نسخ الكل
              </button>
            </div>
          )}

          {/* سجل الفحوصات */}
          <HistoryPanel key={histKey} onSelect={handleSelectHistory} />

          {/* idle */}
          {status === 'idle' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(230,0,0,0.10)', border: '1px solid rgba(230,0,0,0.20)' }}>
                <Phone className="w-6 h-6" style={{ color: '#E60000' }} />
              </div>
              <div>
                <p className="text-sm font-black" style={{ color: L ? '#1a1a2e' : '#ffffff' }}>أدخل رقم الهاتف</p>
                <p className="text-xs text-muted-foreground mt-0.5">سيتم عرض النظام والرصيد والباقات وكروت الخط</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
