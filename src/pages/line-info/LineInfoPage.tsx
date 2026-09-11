/**
 * LineInfoPage — صفحة خدمة "معلومات الخط" — المرحلة الثانية
 * Real Provider + فحص رقم آخر + سجل الفحوصات (7 أيام)
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Info, Search, Phone, Cpu, Banknote,
  CreditCard, Copy, Check, CheckCircle2, XCircle, Loader2,
  CalendarClock, PackageOpen, ClipboardList, History,
  RotateCcw, WifiOff, ServerCrash, HelpCircle, Wifi,
  ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useIsLight } from '@/contexts/ThemeContext';
import { useHotfixLineInfoDisabled } from '@/contexts/RuntimeConfigContext';
import {
  fetchLineInfo,
  getLineInfoHistory,
  type LineInfoResult,
  type LineInfoStatus,
  type LineInfoHistoryEntry,
  type CardItem,
} from '@/lib/lineInfoProvider';

// ── نسخ النص ─────────────────────────────────────────────────
async function copyText(text: string, label: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`تم نسخ ${label}`); }
  catch { toast.error('تعذّر النسخ'); }
}

// ── زر نسخ صغير ──────────────────────────────────────────────
function CopyBtn({ text, label, L }: { text: string; label: string; L: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async () => { await copyText(text, label); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
      style={{ background: copied ? 'rgba(34,197,94,0.15)' : L ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)', border: `1px solid ${L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}` }}
      title={`نسخ ${label}`}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" style={{ color: L ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.50)' }} />}
    </button>
  );
}

// ── صف معلومة ────────────────────────────────────────────────
function InfoRow({ icon, label, value, ct, L }: { icon: React.ReactNode; label: string; value: string; ct?: string; L: boolean }) {
  const textC = L ? '#1a1a2e' : '#ffffff';
  const mutC  = L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.50)';
  const borderC = L ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b last:border-0" style={{ borderColor: borderC }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="shrink-0" style={{ color: mutC }}>{icon}</span>
        <span className="text-xs shrink-0" style={{ color: mutC }}>{label}</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-bold truncate" style={{ color: textC }} dir="ltr">{value}</span>
        {ct && <CopyBtn text={ct} label={label} L={L} />}
      </div>
    </div>
  );
}

// ── فورمات الرقم المتبقي ──────────────────────────────────────
function fmtAllowance(avail: number, unit: string): string {
  if (!unit) return String(avail);
  return `${avail} ${unit}`;
}

// ── كارت باقة / فكة / مارد ───────────────────────────────────
function CardRow({ card, accentColor, L }: { card: CardItem; accentColor: string; L: boolean }) {
  const bg     = L ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';
  const border = L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.09)';
  const innerBg     = L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';
  const innerBorder = L ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
  const textC  = L ? '#1a1a2e' : '#ffffff';
  const mutC   = L ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.40)';
  return (
    <div className="rounded-2xl p-3.5 space-y-2" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44` }}>
          <CreditCard className="w-3.5 h-3.5" style={{ color: accentColor }} />
        </div>
        <span className="text-sm font-black truncate" style={{ color: textC }}>{card.name}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { Icon: PackageOpen, label: 'المتبقي',  val: fmtAllowance(card.availableAllowance, card.unitCode) },
          { Icon: PackageOpen, label: 'المستخدم', val: fmtAllowance(card.usedAllowance, card.unitCode) },
          { Icon: CalendarClock, label: 'التجديد', val: card.resetDate || '—' },
        ].map(({ Icon, label, val }) => (
          <div key={label} className="rounded-xl p-2 text-center" style={{ background: innerBg, border: `1px solid ${innerBorder}` }}>
            <p className="text-xs mb-0.5 flex items-center justify-center gap-0.5" style={{ color: mutC }}>
              <Icon className="w-2.5 h-2.5" /> {label}
            </p>
            <p className="text-xs font-black" style={{ color: textC }} dir="ltr">{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section للكروت ────────────────────────────────────────────
function CardSection({ title, cards, accentColor, L }: { title: string; cards: CardItem[]; accentColor: string; L: boolean }) {
  if (cards.length === 0) return null;
  const bg     = L ? '#ffffff' : 'rgba(255,255,255,0.04)';
  const border = L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.09)';
  const textC  = L ? '#1a1a2e' : '#ffffff';
  const hdrBorder = L ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: bg, border: `1px solid ${border}`, boxShadow: L ? '0 2px 12px rgba(0,0,0,0.07)' : 'none' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${hdrBorder}` }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44` }}>
            <ClipboardList className="w-3.5 h-3.5" style={{ color: accentColor }} />
          </div>
          <span className="text-sm font-black" style={{ color: textC }}>{title}</span>
          <span className="text-xs font-black px-2 py-0.5 rounded-full"
            style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}33` }}>
            {cards.length}
          </span>
        </div>
        <CopyBtn text={cards.map(c => `${c.name} | ${fmtAllowance(c.availableAllowance, c.unitCode)} | ${c.resetDate}`).join('\n')} label={title} L={L} />
      </div>
      <div className="p-3 space-y-2">
        {cards.map((c, i) => <CardRow key={i} card={c} accentColor={accentColor} L={L} />)}
      </div>
    </div>
  );
}

// ── بناء نص "نسخ الكل" ───────────────────────────────────────
function buildCopyAll(data: LineInfoResult): string {
  const lines: string[] = [
    `الرقم: ${data.phoneNumber}`,
    data.system      ? `النظام: ${data.system}`          : null,
    data.balance     ? `الرصيد: ${data.balance}`         : null,
    data.loanDetails ? `سلفني: ${data.loanDetails}`      : null,
  ].filter(Boolean) as string[];

  if (data.miBundles.length)  lines.push('', 'الباقات:', ...data.miBundles.map(c => `- ${c.name} | ${fmtAllowance(c.availableAllowance, c.unitCode)} | ${c.resetDate}`));
  if (data.fakkaCards.length) lines.push('', 'كروت فكة:', ...data.fakkaCards.map(c => `- ${c.name} | ${fmtAllowance(c.availableAllowance, c.unitCode)} | ${c.resetDate}`));
  if (data.maredCards.length) lines.push('', 'كروت مارد:', ...data.maredCards.map(c => `- ${c.name} | ${fmtAllowance(c.availableAllowance, c.unitCode)} | ${c.resetDate}`));
  return lines.join('\n');
}

// ── عرض خطأ ──────────────────────────────────────────────────
function ErrorBanner({ status, message, L }: { status: LineInfoStatus; message?: string; L: boolean }) {
  const map: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    invalid_number:      { icon: <XCircle className="w-4 h-4 shrink-0" />,      color: '#f87171', bg: 'rgba(239,68,68,0.10)'  },
    number_unavailable:  { icon: <HelpCircle className="w-4 h-4 shrink-0" />,   color: '#fb923c', bg: 'rgba(251,146,60,0.10)' },
    no_data:             { icon: <Info className="w-4 h-4 shrink-0" />,          color: '#fbbf24', bg: 'rgba(245,158,11,0.10)' },
    service_unavailable: { icon: <ServerCrash className="w-4 h-4 shrink-0" />,  color: '#fb923c', bg: 'rgba(251,146,60,0.10)' },
    connection_error:    { icon: <WifiOff className="w-4 h-4 shrink-0" />,      color: '#f87171', bg: 'rgba(239,68,68,0.10)'  },
    timeout:             { icon: <Wifi className="w-4 h-4 shrink-0" />,         color: '#fbbf24', bg: 'rgba(245,158,11,0.10)' },
    error:               { icon: <XCircle className="w-4 h-4 shrink-0" />,      color: '#f87171', bg: 'rgba(239,68,68,0.10)'  },
  };
  const cfg = map[status] ?? map['error'];
  const border = L ? `${cfg.color}40` : `${cfg.color}40`;
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl text-xs font-semibold"
      style={{ background: cfg.bg, border: `1px solid ${border}`, color: cfg.color }}>
      {cfg.icon}
      <span>{message ?? 'حدث خطأ، حاول مرة أخرى.'}</span>
    </div>
  );
}

// ── سجل الفحوصات ─────────────────────────────────────────────
function HistoryPanel({ onSelect, L }: { onSelect: (entry: LineInfoHistoryEntry) => void; L: boolean }) {
  const entries = getLineInfoHistory();
  const bg      = L ? '#ffffff' : 'rgba(255,255,255,0.04)';
  const border  = L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.09)';
  const textC   = L ? '#1a1a2e' : '#ffffff';
  const mutC    = L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const hdrBorder = L ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';

  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: bg, border: `1px solid ${border}`, boxShadow: L ? '0 2px 12px rgba(0,0,0,0.07)' : 'none' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${hdrBorder}` }}>
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(230,0,0,0.14)', border: '1px solid rgba(230,0,0,0.25)' }}>
          <History className="w-3.5 h-3.5" style={{ color: '#E60000' }} />
        </div>
        <span className="text-sm font-black" style={{ color: textC }}>سجل الفحوصات</span>
        <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(230,0,0,0.12)', color: '#E60000', border: '1px solid rgba(230,0,0,0.22)' }}>
          {entries.length}
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: hdrBorder }}>
        {entries.map(entry => (
          <button key={entry.id} onClick={() => onSelect(entry)}
            className="w-full flex items-center justify-between px-4 py-3 text-right transition-colors hover:bg-black/5 active:scale-[0.99]">
            <div className="min-w-0">
              <p className="text-sm font-black" style={{ color: textC }} dir="ltr">{entry.phone}</p>
              <p className="text-xs mt-0.5" style={{ color: mutC }}>
                {entry.result.system ?? '—'} · {new Date(entry.checkedAt).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mr-2">
              {entry.result.balance && (
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.20)' }}>
                  {entry.result.balance}
                </span>
              )}
              <ArrowRight className="w-3.5 h-3.5" style={{ color: mutC }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ═══════════════════════════════════════════════════════════════
export default function LineInfoPage() {
  const navigate = useNavigate();
  const L        = useIsLight();
  const { disabled: lineInfoDisabled, message: lineInfoMsg } = useHotfixLineInfoDisabled();

  const [phone,   setPhone]   = useState('');
  const [status,  setStatus]  = useState<LineInfoStatus>('idle');
  const [result,  setResult]  = useState<LineInfoResult | null>(null);
  const [errMsg,  setErrMsg]  = useState<string | undefined>();
  const [histKey, setHistKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    const trimmed = phone.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }
    // ── HotFix Kill Switch ──────────────────────────────────────
    if (lineInfoDisabled) {
      toast.error(lineInfoMsg || 'خدمة معلومات الخط متوقفة مؤقتاً.');
      return;
    }
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

  // ── HotFix Banner — يظهر تحت الـ header مباشرة ────────────────
  const hotfixBanner = lineInfoDisabled ? (
    <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
      style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
      <ShieldOff className="w-4 h-4 shrink-0" />
      <span>{lineInfoMsg || 'خدمة معلومات الخط متوقفة مؤقتاً. نعود قريباً.'}</span>
    </div>
  ) : null;

  // زر "فحص رقم آخر" — تمسح النتيجة فقط
  const handleReset = () => {
    setResult(null);
    setStatus('idle');
    setErrMsg(undefined);
    setPhone('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // فتح سجل محفوظ بدون إعادة فحص
  const handleSelectHistory = (entry: LineInfoHistoryEntry) => {
    setPhone(entry.phone);
    setResult(entry.result);
    setStatus('success');
    setErrMsg(undefined);
  };

  const isLoading = status === 'loading';
  const isError   = ['invalid_number', 'no_data', 'number_unavailable', 'service_unavailable', 'connection_error', 'timeout', 'error'].includes(status);

  const cardBg    = L ? '#ffffff' : 'rgba(255,255,255,0.04)';
  const cardBdr   = L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.09)';
  const textC     = L ? '#1a1a2e' : '#ffffff';
  const mutC      = L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const hdrBorder = L ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';

  return (
    <div className="min-h-screen pb-28" dir="rtl"
      style={{ background: L ? '#f5f7fa' : 'linear-gradient(180deg, #080d14 0%, #0a0a0f 100%)' }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: L ? 'rgba(255,255,255,0.96)' : 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}` }}>
        <div className="flex items-center gap-3 py-4">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors active:scale-95"
            style={{ border: `1px solid ${L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`, background: L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)' }}>
            <ArrowRight className="w-4 h-4" style={{ color: textC }} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black" style={{ color: textC }}>معلومات الخط</h1>
            <p className="text-xs text-muted-foreground">أدخل رقم الهاتف لمعرفة بيانات الخط</p>
          </div>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.22)' }}>
            <Info className="w-4 h-4" style={{ color: '#E60000' }} />
          </div>
        </div>

      {/* ── HotFix Banner ── */}
      {hotfixBanner}
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── بطاقة الإدخال ── */}
        <div className="rounded-2xl p-4 space-y-3"
          style={{ background: cardBg, border: `1px solid ${cardBdr}`, boxShadow: L ? '0 2px 12px rgba(0,0,0,0.07)' : 'none' }}>
          <div className="space-y-1.5">
            <label className="text-xs font-bold" style={{ color: textC }}>رقم الهاتف</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: mutC }} />
                <input ref={inputRef} type="tel" inputMode="numeric" value={phone}
                  onChange={e => { setPhone(e.target.value); if (status !== 'idle' && status !== 'success') setStatus('idle'); }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="أدخل رقم الهاتف" maxLength={13} disabled={isLoading}
                  className="w-full h-11 rounded-xl pr-9 pl-3 text-sm font-medium outline-none transition-all"
                  style={{ background: L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', border: `1px solid ${cardBdr}`, color: textC, direction: 'ltr' }}
                  dir="ltr" />
              </div>
              <button onClick={handleSearch} disabled={isLoading || !phone.trim()}
                className="h-11 px-4 rounded-xl flex items-center gap-2 font-black text-sm shrink-0 transition-all active:scale-95 disabled:opacity-50"
                style={{ background: '#E60000', color: '#ffffff' }}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {isLoading ? 'جاري...' : 'فحص الرقم'}
              </button>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs font-semibold"
              style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.20)', color: '#818cf8' }}>
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> جاري فحص الرقم… قد يستغرق حتى 15 ثانية
            </div>
          )}
          {isError && <ErrorBanner status={status} message={errMsg} L={L} />}
        </div>

        {/* ── نتيجة الفحص ── */}
        {status === 'success' && result && (
          <>
            <div className="flex items-center gap-2 px-1">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span className="text-xs font-bold text-green-400">تم الفحص بنجاح</span>
            </div>

            {/* زر "فحص رقم آخر" */}
            <button onClick={handleReset}
              className="w-full h-11 rounded-2xl flex items-center justify-center gap-2 font-black text-sm transition-all active:scale-[0.98]"
              style={{ background: L ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)', border: `1px solid ${cardBdr}`, color: textC }}>
              <RotateCcw className="w-4 h-4" />
              فحص رقم آخر
            </button>

            {/* المعلومات الأساسية */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: cardBg, border: `1px solid ${cardBdr}`, boxShadow: L ? '0 2px 12px rgba(0,0,0,0.07)' : 'none' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${hdrBorder}` }}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.25)' }}>
                    <Info className="w-3.5 h-3.5" style={{ color: '#E60000' }} />
                  </div>
                  <span className="text-sm font-black" style={{ color: textC }}>المعلومات الأساسية</span>
                </div>
                <CopyBtn text={[`الرقم: ${result.phoneNumber}`, result.system ? `النظام: ${result.system}` : null, result.balance ? `الرصيد: ${result.balance}` : null].filter(Boolean).join('\n')} label="المعلومات الأساسية" L={L} />
              </div>
              <div className="px-4 py-1">
                <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="الرقم"  value={result.phoneNumber}    ct={result.phoneNumber} L={L} />
                {result.system  && <InfoRow icon={<Cpu     className="w-3.5 h-3.5" />} label="النظام" value={result.system}                    L={L} />}
                {result.balance && <InfoRow icon={<Banknote className="w-3.5 h-3.5" />} label="الرصيد" value={result.balance}                  L={L} />}
                {result.loanDetails && <InfoRow icon={<Info className="w-3.5 h-3.5" />} label="سلفني" value={result.loanDetails}              L={L} />}
              </div>
            </div>

            {/* الباقات */}
            <CardSection title="الباقات"      cards={result.miBundles}   accentColor="#6366f1" L={L} />
            <CardSection title="كروت فكة"     cards={result.fakkaCards}  accentColor="#E60000" L={L} />
            <CardSection title="كروت مارد"    cards={result.maredCards}  accentColor="#F7C948" L={L} />

            {/* نسخ الكل */}
            <button onClick={() => copyText(buildCopyAll(result), 'كل المعلومات')}
              className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-black text-sm transition-all active:scale-[0.98]"
              style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.22)', color: '#E60000' }}>
              <Copy className="w-4 h-4" /> نسخ الكل
            </button>
          </>
        )}

        {/* ── سجل الفحوصات ── */}
        <HistoryPanel key={histKey} onSelect={handleSelectHistory} L={L} />

        {/* الحالة المبدئية */}
        {status === 'idle' && (
          <div className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
            style={{ background: cardBg, border: `1px solid ${cardBdr}` }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(230,0,0,0.10)', border: '1px solid rgba(230,0,0,0.20)' }}>
              <Phone className="w-7 h-7" style={{ color: '#E60000' }} />
            </div>
            <div>
              <p className="text-sm font-black" style={{ color: textC }}>أدخل رقم الهاتف</p>
              <p className="text-xs text-muted-foreground mt-1">سيتم عرض النظام والرصيد والباقات وكروت الخط</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
