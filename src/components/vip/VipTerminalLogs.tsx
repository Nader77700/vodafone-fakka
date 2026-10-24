import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Terminal,
  Copy,
  Trash2,
  ArrowDownCircle,
  CheckCircle2,
  Maximize2,
  Minimize2,
  PauseCircle,
  PlayCircle,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import type { VipExecutionLog } from '@/lib/vipApi';

interface Props {
  logs: VipExecutionLog[];
  onClear: () => void;
  isRunning?: boolean;
  isDelegatedUser?: boolean;
}

// ── Sanitizer for Delegated Users (Zero-Trust Protection of Proprietary Script) ──
export function sanitizeLogForDelegatedUser(msg: string): string | null {
  if (!msg) return null;
  const lower = msg.toLowerCase();

  // 1. Strip sensitive internal scripts, auth tokens, headers, curls, endpoints, uuids, passwords
  if (
    lower.includes('bearer') ||
    lower.includes('token') ||
    lower.includes('auth_') ||
    lower.includes('password') ||
    lower.includes('curl') ||
    lower.includes('http://') ||
    lower.includes('https://') ||
    lower.includes('user-agent') ||
    lower.includes('api_key') ||
    lower.includes('cookie') ||
    lower.includes('session_token') ||
    lower.includes('request_id') ||
    lower.includes('trace_id') ||
    lower.includes('node:') ||
    lower.includes('python') ||
    lower.includes('subprocess') ||
    lower.includes('minion')
  ) {
    return null;
  }

  // 2. Hide internal proprietary mechanics & system transition steps (180, 270, ahlan, golden shield, migration, attempt counts)
  if (
    msg.includes('درع الأمان') ||
    msg.includes('محجوزة ومحمية') ||
    msg.includes('يحظر استرجاعها') ||
    msg.includes('حكاية ميكسات 180') ||
    msg.includes('حكاية ميكسات 270') ||
    msg.includes('باقة 180') ||
    msg.includes('باقة 270') ||
    msg.includes('نظام 180') ||
    msg.includes('نظام 270') ||
    msg.includes('Parent_6') ||
    msg.includes('Parent_7') ||
    msg.includes('أهلاً أقوى كارت') ||
    msg.includes('تغيير النظام إلى') ||
    msg.includes('اعتماد النظام الجديد') ||
    msg.includes('فحص استجابة السيرفر للنظام') ||
    msg.includes('تنشيط ومزامنة العقد') ||
    msg.includes('تجديد باقة الأونر') ||
    msg.includes('رصد تحويل وهمي') ||
    msg.includes('فك تعليق') ||
    msg.includes('فك التعليق') ||
    msg.includes('ترحيل') ||
    msg.includes('الترحيل') ||
    /محاولة \d+\/\d+/i.test(msg) ||
    /فحص رصيد الفرد \(\d+\/\d+\)/i.test(msg) ||
    msg.includes('فحص ذكي لوصول الميكسات') ||
    msg.includes('بحد أقصى ثانيتان')
  ) {
    return null;
  }

  // 3. Hide internal seconds countdown / timer mechanics so clients don't reverse-engineer script pacing
  if (
    (lower.includes('متبقي') && (lower.includes('ثانية') || lower.includes('ثواني'))) ||
    /\[\d+s\]/i.test(msg) ||
    /waiting \d+s/i.test(msg) ||
    /انتظار \d+\s*ث/i.test(msg) ||
    /تأخير \d+\s*ث/i.test(msg) ||
    /sleep\s*\(/i.test(msg)
  ) {
    return null;
  }

  // 4. Strip internal server order IDs / transaction hashes
  let cleaned = msg
    .replace(/\[\s*رقم أمر التحويل بسيرفر اتصالات:\s*[a-f0-9-]+\s*\]/gi, '')
    .replace(/\[\s*[a-f0-9]{8}-[a-f0-9-]{12,}\s*\]/gi, '')
    .replace(/Hekaya_XRP_MIX_Parent_\d+/gi, 'حكاية ميكسات')
    .replace(/XRP_MIX_\w+/gi, 'باقة ميكسات')
    .replace(/sess_[a-f0-9]+/gi, 'جلسة VIP')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '***');

  // Clean double spaces or trailing punctuation
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned || null;
}

// Helper to convert Arabic-Indic numerals to standard English numbers
function toEnglishDigits(str: string): string {
  if (!str) return '';
  return str.replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
}

interface ParsedToken {
  type:
    | 'phantom_alert'
    | 'double_check_confirm'
    | 'hekaya_270'
    | 'hekaya_180'
    | 'transfer_owner'
    | 'transfer_child'
    | 'phone'
    | 'mix_balance'
    | 'owner_ref'
    | 'child_ref'
    | 'text';
  content: string;
}

function parseLogTokens(rawMsg: string): ParsedToken[] {
  const msg = toEnglishDigits(rawMsg);

  const tokenRegex = new RegExp(
    [
      '(فحص تأكيدي(?: مزدوج)?[^\\n!]+!?)', // 0. Double-check confirmation
      '(تنشيط ومزامنة العقد|تجديد باقة الأونر|رصد تحويل وهمي(?:\\/معلق)?|رصد عدم تحرك الميكسات[^\\n!]+!?)', // 1. Contract sync / renewal
      '(حكاية ميكسات 270|Hekaya_XRP_MIX_Parent_7|باقة 270|نظام 270)', // 2. Hekaya 270
      '(حكاية ميكسات 180|Hekaya_XRP_MIX_Parent_6|باقة 180|نظام 180|170)', // 3. Hekaya 180
      '(رجعنا للأونر|استرجاع الميكسات للأونر|تم استرجاع)', // 4. Return to owner
      '(تم تحويل|جاري تحويل|أمر النقل|نقل الميكسات للفرد)', // 5. Transfer to child
      '(\\b(?:011|11)\\d{8}\\b)', // 6. Phone numbers
      '(\\(\\d{1,3}(?:,\\d{3})*(?:\\s*ميكس)?\\))', // 7. (88,600) or (88,600 ميكس)
      '(\\b\\d{1,3}(?:,\\d{3})+(?:\\s*ميكس)?\\b)', // 8. 88,600 ميكس
      '(الأونر|حساب الأونر|باقة الأونر)', // 9. Owner
      '(الفرد|حساب الفرد|باقة الفرد)', // 10. Child
    ].join('|'),
    'gi'
  );

  const parts: ParsedToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(msg)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: msg.substring(lastIndex, match.index),
      });
    }

    const matchedText = match[0];

    if (/فحص تأكيدي مزدوج/i.test(matchedText)) {
      parts.push({ type: 'double_check_confirm', content: matchedText });
    } else if (/تحويل وهمي/i.test(matchedText)) {
      parts.push({ type: 'phantom_alert', content: matchedText });
    } else if (/270|Parent_7/i.test(matchedText)) {
      parts.push({ type: 'hekaya_270', content: matchedText });
    } else if (/180|170|Parent_6/i.test(matchedText)) {
      parts.push({ type: 'hekaya_180', content: matchedText });
    } else if (/رجعنا للأونر|استرجاع/i.test(matchedText)) {
      parts.push({ type: 'transfer_owner', content: matchedText });
    } else if (/تحويل|أمر النقل/i.test(matchedText)) {
      parts.push({ type: 'transfer_child', content: matchedText });
    } else if (/^(?:011|11)\d{8}$/.test(matchedText)) {
      parts.push({ type: 'phone', content: matchedText });
    } else if (/\d/.test(matchedText)) {
      parts.push({ type: 'mix_balance', content: matchedText });
    } else if (/الأونر/i.test(matchedText)) {
      parts.push({ type: 'owner_ref', content: matchedText });
    } else if (/الفرد/i.test(matchedText)) {
      parts.push({ type: 'child_ref', content: matchedText });
    } else {
      parts.push({ type: 'text', content: matchedText });
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < msg.length) {
    parts.push({
      type: 'text',
      content: msg.substring(lastIndex),
    });
  }

  return parts;
}

export function VipTerminalLogs({ logs, onClear, isRunning = false, isDelegatedUser = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasScrolledUp, setHasScrolledUp] = useState(false);

  // Apply sanitized logs filter for delegated users (zero-trust protection)
  const effectiveLogs = React.useMemo(() => {
    if (!isDelegatedUser) return logs;
    const sanitized: VipExecutionLog[] = [];
    for (const log of logs) {
      const sanitizedMsg = sanitizeLogForDelegatedUser(log.message);
      if (sanitizedMsg) {
        sanitized.push({
          ...log,
          message: sanitizedMsg,
        });
      }
    }
    return sanitized;
  }, [logs, isDelegatedUser]);

  // Perform container-ONLY scrolling (NEVER scroll the main window/page!)
  const scrollToBottom = useCallback((smooth = true) => {
    if (!containerRef.current) return;
    const { scrollHeight, clientHeight } = containerRef.current;
    containerRef.current.scrollTo({
      top: scrollHeight - clientHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    setHasScrolledUp(false);
  }, []);

  // Listen to inner container scroll to detect if user is inspecting older logs
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (!isNearBottom) {
      setHasScrolledUp(true);
    } else {
      setHasScrolledUp(false);
    }
  };

  // Only auto-scroll when new logs arrive IF autoScroll is active and user hasn't scrolled up
  useEffect(() => {
    if (autoScroll && !hasScrolledUp) {
      scrollToBottom(false);
    }
  }, [effectiveLogs, autoScroll, hasScrolledUp, scrollToBottom]);

  const handleCopyLogs = () => {
    if (effectiveLogs.length === 0) {
      toast.info('لا توجد سجلات لنسخها');
      return;
    }
    const text = effectiveLogs.map((l) => `[${l.time}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('تم نسخ السجلات الطرفية بنجاح');
  };

  const handleDownloadLogs = () => {
    if (effectiveLogs.length === 0) {
      toast.info('لا توجد سجلات للتحميل');
      return;
    }
    const text = effectiveLogs.map((l) => `[${l.time}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etisalat_vip_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير ملف السجلات بنجاح');
  };

  const renderColoredMessage = (msg: string) => {
    if (msg.startsWith('---') || msg.startsWith('===')) {
      return <span className="text-purple-300 font-mono font-bold">{toEnglishDigits(msg)}</span>;
    }

    let baseTextColor = 'text-zinc-300';
    let prefixIcon = '';
    if (msg.startsWith('[*]')) baseTextColor = 'text-sky-400';
    else if (msg.startsWith('[+]')) baseTextColor = 'text-emerald-400';
    else if (msg.startsWith('[-]')) baseTextColor = 'text-rose-400';
    else if (msg.startsWith('[!]')) baseTextColor = 'text-amber-400';
    else if (msg.startsWith('[⚠️]')) baseTextColor = 'text-amber-300';
    else if (msg.startsWith('[✓]')) baseTextColor = 'text-emerald-300';
    else if (msg.startsWith('[🎉]')) baseTextColor = 'text-amber-300';
    else if (msg.startsWith('[⚡]')) baseTextColor = 'text-yellow-300';
    else if (msg.startsWith('[🛡️]') || msg.startsWith('[🌐]')) baseTextColor = 'text-cyan-300';
    else if (msg.startsWith('[🚀]')) baseTextColor = 'text-purple-300';
    else if (msg.startsWith('[☁️]')) baseTextColor = 'text-sky-300';

    const isFinalBalanceLine = msg.includes('رصيده الآن') || msg.includes('الرصيد الإجمالي') || msg.includes('الرصيد النهائي');
    const tokens = parseLogTokens(msg);

    return (
      <span className="leading-relaxed">
        {tokens.map((token, i) => {
          switch (token.type) {
            case 'double_check_confirm':
              return (
                <span key={i} className="font-bold text-emerald-400">
                  {token.content}
                </span>
              );
            case 'phantom_alert':
              return (
                <span key={i} className="font-bold text-amber-400">
                  {token.content}
                </span>
              );
            case 'hekaya_270':
              return (
                <span key={i} className="font-semibold text-sky-400">
                  {token.content}
                </span>
              );
            case 'hekaya_180':
              return (
                <span key={i} className="font-semibold text-amber-300">
                  {token.content}
                </span>
              );
            case 'transfer_owner':
              return (
                <span key={i} className="font-semibold text-emerald-300">
                  {token.content}
                </span>
              );
            case 'transfer_child':
              return (
                <span key={i} className="font-semibold text-purple-300">
                  {token.content}
                </span>
              );
            case 'phone':
              return (
                <span key={i} className="font-mono font-medium text-yellow-300" dir="ltr">
                  {token.content}
                </span>
              );
            case 'mix_balance':
              if (isFinalBalanceLine) {
                return (
                  <span key={i} className="font-mono font-bold text-emerald-300" dir="ltr">
                    {token.content}
                  </span>
                );
              }
              return (
                <span key={i} className="font-mono font-semibold text-cyan-300" dir="ltr">
                  {token.content}
                </span>
              );
            case 'owner_ref':
              return (
                <span key={i} className="font-medium text-amber-200">
                  {token.content}
                </span>
              );
            case 'child_ref':
              return (
                <span key={i} className="font-medium text-purple-300">
                  {token.content}
                </span>
              );
            case 'text':
            default:
              return (
                <span key={i} className={baseTextColor}>
                  {token.content}
                </span>
              );
          }
        })}
      </span>
    );
  };

  return (
    <Card className="border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl overflow-hidden relative transition-all duration-200" dir="rtl">
      <CardHeader className="p-2 sm:p-2.5 bg-zinc-900/95 border-b border-zinc-800 flex flex-row items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <CardTitle className="text-xs font-bold font-mono text-zinc-200 flex items-center gap-1.5 truncate">
            <span>شاشة السجلات الحية</span>
            <span className="text-[10px] text-zinc-500 hidden sm:inline">(EtisalatBot Console)</span>
            {isRunning ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] px-1.5 py-0 animate-pulse shrink-0">
                الطرفية نشطة
              </Badge>
            ) : (
              <Badge variant="outline" className="text-zinc-400 border-zinc-700 text-[9px] px-1.5 py-0 shrink-0">
                جاهز
              </Badge>
            )}
          </CardTitle>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Auto Scroll Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`h-6 text-[10px] px-1.5 gap-1 ${
              autoScroll ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title={autoScroll ? 'التمرير التلقائي مفعل' : 'التمرير التلقائي متوقف'}
          >
            {autoScroll ? <PlayCircle className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
            <span className="hidden sm:inline">{autoScroll ? 'تثبيت' : 'حر'}</span>
          </Button>

          {/* Expand Height Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="h-6 text-[10px] px-1.5 text-zinc-400 hover:text-zinc-200 gap-1"
            title={isExpanded ? 'تصغير الشاشة' : 'تكبير الشاشة'}
          >
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            <span className="hidden sm:inline">{isExpanded ? 'تصغير' : 'تكبير'}</span>
          </Button>

          {/* Copy Logs */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyLogs}
            className="h-6 text-[10px] px-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 gap-1"
            title="نسخ السجلات"
          >
            <Copy className="w-3 h-3" />
            <span className="hidden sm:inline">نسخ</span>
          </Button>

          {/* Download Text */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadLogs}
            className="h-6 text-[10px] px-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 gap-1"
            title="تنزيل كملف نصي"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">ملف</span>
          </Button>

          {/* Clear Console */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-6 text-[10px] px-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 gap-1"
            title="مسح الطرفية"
          >
            <Trash2 className="w-3 h-3" />
            <span className="hidden sm:inline">مسح</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-2 sm:p-2.5 relative">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className={`font-mono text-xs sm:text-[12.5px] leading-relaxed overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 bg-zinc-950 p-2 sm:p-2.5 rounded-lg border border-zinc-900 transition-all duration-200 ${
            isExpanded ? 'max-h-[580px] min-h-[380px]' : 'max-h-[300px] sm:max-h-[340px] min-h-[160px]'
          }`}
        >
          {effectiveLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-500 space-y-2">
              <Terminal className="w-8 h-8 opacity-40 text-emerald-400" />
              <p className="text-xs font-semibold text-zinc-400">في انتظار بدء الدورة أو تنفيذ الأوامر...</p>
              <p className="text-[10px] text-zinc-600 max-w-sm text-center">
                ستظهر هنا تفاصيل الاتصال، خطوات الركن والاسترجاع، وحالة المزامنة لحظة بلحظة.
              </p>
            </div>
          ) : (
            effectiveLogs.map((log, index) => (
              <div
                key={index}
                className="flex items-start gap-2 py-0.5 hover:bg-zinc-900/60 px-1 rounded transition-colors text-right"
              >
                <span className="text-zinc-500 text-[10.5px] shrink-0 select-none pt-0.5 font-mono" dir="ltr">
                  {log.time}
                </span>
                <div className="flex-1 min-w-0 break-words font-mono text-zinc-200 text-right leading-snug">
                  {renderColoredMessage(log.message)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Floating Indicator when user scrolled up and new logs are waiting */}
        {hasScrolledUp && logs.length > 0 && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground text-[11px] font-bold rounded-full shadow-lg border border-primary/50 animate-bounce cursor-pointer hover:bg-primary/90"
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
            <span>سجلات جديدة بالأسفل (انقر للمتابعة)</span>
          </button>
        )}
      </CardContent>
    </Card>
  );
}
