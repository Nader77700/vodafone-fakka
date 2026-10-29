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
  Radar,
} from 'lucide-react';
import { toast } from 'sonner';
import type { VipExecutionLog } from '@/lib/vipApi';

interface Props {
  logs: VipExecutionLog[];
  onClear: () => void;
  isRunning?: boolean;
  isDelegatedUser?: boolean;
  onOpenTransferMonitor?: () => void;
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

// Pure fast lightweight row renderer with zero heavy regex or DOM explosion
const LogLineRow = React.memo(function LogLineRow({ log }: { log: VipExecutionLog }) {
  const msg = log.message || '';
  let colorClass = 'text-zinc-300';
  if (log.level === 'success' || msg.startsWith('[+]') || msg.startsWith('[✓]')) {
    colorClass = 'text-emerald-400 font-medium';
  } else if (log.level === 'error' || msg.startsWith('[-]')) {
    colorClass = 'text-rose-400 font-medium';
  } else if (log.level === 'warn' || msg.startsWith('[!]') || msg.startsWith('[⚠️]')) {
    colorClass = 'text-amber-400 font-medium';
  } else if (msg.startsWith('[*]')) {
    colorClass = 'text-sky-400';
  } else if (msg.startsWith('[⚡]')) {
    colorClass = 'text-yellow-300';
  } else if (msg.startsWith('[🛡️]')) {
    colorClass = 'text-cyan-300';
  }

  return (
    <div className="flex items-start gap-2 py-0.5 hover:bg-zinc-900/60 px-1 rounded transition-colors text-right">
      <span className="text-zinc-500 text-[10px] shrink-0 select-none pt-0.5 font-mono" dir="ltr">
        {log.time}
      </span>
      <div className={`flex-1 min-w-0 break-words font-mono text-[11.5px] leading-snug text-right ${colorClass}`}>
        {msg}
      </div>
    </div>
  );
});

export const VipTerminalLogs = React.memo(function VipTerminalLogs({
  logs,
  onClear,
  isRunning = false,
  isDelegatedUser = false,
  onOpenTransferMonitor,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasScrolledUp, setHasScrolledUp] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);

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

  // Windowed visible logs to keep DOM node count capped at 80 items during live updates
  const visibleLogs = React.useMemo(() => {
    if (showAllLogs) return effectiveLogs;
    if (effectiveLogs.length <= 80) return effectiveLogs;
    return effectiveLogs.slice(-80);
  }, [effectiveLogs, showAllLogs]);

  // Track whether user intentionally scrolled up using touch or wheel
  const isUserTouchingOrWheelingRef = useRef(false);

  // Perform container-ONLY scrolling with requestAnimationFrame for 60fps silky smooth rendering
  const scrollRafRef = useRef<number | null>(null);
  const scrollToBottom = useCallback(() => {
    if (!containerRef.current) return;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);

    scrollRafRef.current = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const { scrollHeight, clientHeight } = containerRef.current;
      // Instant auto-scroll without smooth animation overhead preventing main thread queuing
      containerRef.current.scrollTop = scrollHeight - clientHeight;
      setHasScrolledUp(false);
      isUserTouchingOrWheelingRef.current = false;
    });
  }, []);

  // When a run starts (isRunning becomes true), automatically scroll to bottom and resume follow
  useEffect(() => {
    if (isRunning) {
      setHasScrolledUp(false);
      setAutoScroll(true);
      scrollToBottom();
    }
  }, [isRunning, scrollToBottom]);

  // Listen to inner container scroll to detect if user manually scrolled up
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (isNearBottom) {
      setHasScrolledUp(false);
      isUserTouchingOrWheelingRef.current = false;
    } else if (isUserTouchingOrWheelingRef.current && !autoScroll) {
      setHasScrolledUp(true);
    }
  }, [autoScroll]);

  // Auto-scroll when new logs arrive: if autoScroll is active, snap to bottom instantly via rAF
  useEffect(() => {
    if (autoScroll) {
      scrollToBottom();
    }
  }, [effectiveLogs.length, autoScroll, scrollToBottom]);

  // When component mounts or comes into view, ensure it points to the latest log
  useEffect(() => {
    if (effectiveLogs.length > 0) {
      const timer = setTimeout(() => scrollToBottom(), 50);
      return () => clearTimeout(timer);
    }
  }, [scrollToBottom]);

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
        {onOpenTransferMonitor && (
          <div className="flex items-center justify-between p-2 mb-2 bg-primary/10 border border-primary/20 rounded-lg text-xs gap-2">
            <div className="flex items-center gap-1.5 text-primary font-bold min-w-0">
              <Radar className="w-4 h-4 animate-pulse shrink-0" />
              <span className="truncate">ترغب في مراقبة كل ريكوست وتحويل XML مع اتصالات لحظة بلحظة؟</span>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={onOpenTransferMonitor}
              className="h-6 text-[11px] px-2.5 font-bold gap-1 shrink-0 shadow-sm"
            >
              <span>فتح شاشة المراقبة</span>
              <span dir="ltr">→</span>
            </Button>
          </div>
        )}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          onTouchStart={() => { isUserTouchingOrWheelingRef.current = true; }}
          onWheel={() => { isUserTouchingOrWheelingRef.current = true; }}
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
            <>
              {!showAllLogs && effectiveLogs.length > 80 && (
                <div className="flex items-center justify-between p-1.5 mb-1 bg-zinc-900/80 rounded border border-zinc-800 text-[11px] text-zinc-400">
                  <span>تم تفعيل العرض الدائري فائق السلاسة (أحدث 80 سجل) لمنع أي تعليق أو سخونة.</span>
                  <button
                    onClick={() => setShowAllLogs(true)}
                    className="text-primary hover:underline font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[10px]"
                  >
                    عرض كافة السجلات ({effectiveLogs.length})
                  </button>
                </div>
              )}
              {visibleLogs.map((log, index) => (
                <LogLineRow
                  key={`${log.time}_${index}_${log.message.slice(0, 10)}`}
                  log={log}
                />
              ))}
            </>
          )}
        </div>

        {/* Floating Indicator ONLY when user explicitly turned off autoScroll and scrolled up */}
        {!autoScroll && hasScrolledUp && logs.length > 0 && (
          <button
            onClick={() => {
              setAutoScroll(true);
              scrollToBottom();
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-full shadow-lg border border-emerald-400/50 cursor-pointer transition-all"
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
            <span>استئناف المتابعة التلقائية (أحدث السجلات)</span>
          </button>
        )}
      </CardContent>
    </Card>
  );
});
