import React, { useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Terminal, Copy, Trash2, ArrowDownCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import type { VipExecutionLog } from '@/lib/vipApi';

interface Props {
  logs: VipExecutionLog[];
  onClear: () => void;
  isRunning?: boolean;
}

export function VipTerminalLogs({ logs, onClear, isRunning = false }: Props) {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCopyLogs = () => {
    if (logs.length === 0) {
      toast.info('لا توجد سجلات لنسخها');
      return;
    }
    const text = logs.map((l) => `[${l.time}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    toast.success('تم نسخ السجلات الطرفية بنجاح');
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
    if (msg.startsWith('---') || msg.startsWith('===')) {
      return <span className="text-purple-300 font-mono font-bold">{msg}</span>;
    }
    return <span className="text-zinc-300">{msg}</span>;
  };

  return (
    <Card className="border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl overflow-hidden" dir="rtl">
      <CardHeader className="p-3 bg-zinc-900/90 border-b border-zinc-800 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <CardTitle className="text-xs font-bold font-mono text-zinc-200 flex items-center gap-2">
            شاشة السجلات الحية للسكريبت (EtisalatBot Console)
            {isRunning ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0 animate-pulse">
                الطرفية نشطة • قيد التنفيذ
              </Badge>
            ) : (
              <Badge variant="outline" className="text-zinc-400 border-zinc-700 text-[10px] px-1.5 py-0">
                جاهز للأوامر
              </Badge>
            )}
          </CardTitle>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyLogs}
            className="h-7 text-[11px] px-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 gap-1"
            title="نسخ السجلات"
          >
            <Copy className="w-3 h-3" />
            <span className="hidden sm:inline">نسخ</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 text-[11px] px-2 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 gap-1"
            title="مسح الطرفية"
          >
            <Trash2 className="w-3 h-3" />
            <span className="hidden sm:inline">مسح</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-2 sm:p-3">
        <div className="font-mono text-xs sm:text-[13px] leading-relaxed max-h-[270px] sm:max-h-[320px] min-h-[140px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-700 bg-zinc-950/80 p-2 rounded-lg border border-zinc-900">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-500 space-y-2">
              <Terminal className="w-7 h-7 opacity-40" />
              <p className="text-xs">في انتظار تنفيذ أوامر السكريبت أو بدء الدورة...</p>
              <p className="text-[10px] text-zinc-600">ستظهر هنا تفاصيل الاتصال، تسجيل الدخول، وفحص الاستهلاك خطوة بخطوة</p>
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex items-start gap-2 py-0.5 hover:bg-zinc-900/60 px-1 rounded transition-colors">
                <span className="text-zinc-500 text-[11px] shrink-0 select-none pt-0.5 font-mono">
                  {log.time}
                </span>
                <div className="flex-1 min-w-0 break-words font-mono">
                  {renderColoredMessage(log.message)}
                </div>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </CardContent>
    </Card>
  );
}
