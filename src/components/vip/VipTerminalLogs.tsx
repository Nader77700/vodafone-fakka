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
}

export function VipTerminalLogs({ logs, onClear, isRunning = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasScrolledUp, setHasScrolledUp] = useState(false);

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
  }, [logs, autoScroll, hasScrolledUp, scrollToBottom]);

  const handleCopyLogs = () => {
    if (logs.length === 0) {
      toast.info('لا توجد سجلات لنسخها');
      return;
    }
    const text = logs.map((l) => `[${l.time}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('تم نسخ السجلات الطرفية بنجاح');
  };

  const handleDownloadLogs = () => {
    if (logs.length === 0) {
      toast.info('لا توجد سجلات للتحميل');
      return;
    }
    const text = logs.map((l) => `[${l.time}] ${l.message}`).join('\n');
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
    if (msg.startsWith('[*]')) {
      return <span className="text-sky-400 font-semibold">{msg}</span>;
    }
    if (msg.startsWith('[+]')) {
      return <span className="text-emerald-400 font-bold">{msg}</span>;
    }
    if (msg.startsWith('[-]')) {
      return <span className="text-rose-400 font-semibold">{msg}</span>;
    }
    if (msg.startsWith('[!]')) {
      return <span className="text-amber-400 font-semibold">{msg}</span>;
    }
    if (msg.startsWith('[🎉]')) {
      return <span className="text-amber-300 font-black">{msg}</span>;
    }
    if (msg.startsWith('[⚡]')) {
      return <span className="text-yellow-300 font-bold">{msg}</span>;
    }
    if (msg.startsWith('[🛡️]') || msg.startsWith('[🌐]')) {
      return <span className="text-cyan-300 font-semibold">{msg}</span>;
    }
    if (msg.startsWith('---') || msg.startsWith('===')) {
      return <span className="text-purple-300 font-mono font-bold">{msg}</span>;
    }
    return <span className="text-zinc-300">{msg}</span>;
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
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-500 space-y-2">
              <Terminal className="w-8 h-8 opacity-40 text-emerald-400" />
              <p className="text-xs font-semibold text-zinc-400">في انتظار بدء الدورة أو تنفيذ الأوامر...</p>
              <p className="text-[10px] text-zinc-600 max-w-sm text-center">
                ستظهر هنا تفاصيل الاتصال، خطوات الركن والاسترجاع، وحالة المزامنة لحظة بلحظة.
              </p>
            </div>
          ) : (
            logs.map((log, index) => (
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
