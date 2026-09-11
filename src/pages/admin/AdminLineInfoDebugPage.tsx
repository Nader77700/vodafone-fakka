/**
 * AdminLineInfoDebugPage — شاشة تشخيص "معلومات الخط" للأدمن
 * تعرض كل خطوة من الـ flow: productionKey → conversation → WebSocket → result
 * وكل رسالة log وصلت من Edge Function
 */

import { useState } from 'react';
import {
  ArrowRight, Search, Play, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Copy, Check, ChevronDown, ChevronUp,
  Terminal, Wifi, WifiOff, Key, MessageSquare, Database, Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useNavigate } from 'react-router-dom';

// ── نوع نتيجة الاختبار ────────────────────────────────────────
interface DebugStep {
  label: string;
  status: 'pending' | 'running' | 'ok' | 'error' | 'warn';
  detail: string;
  ts: number;
}

interface DebugResult {
  steps: DebugStep[];
  rawResponse: unknown;
  durationMs: number;
  finalStatus: 'success' | 'error' | 'partial';
}

// ── أيقونة حالة ───────────────────────────────────────────────
function StepIcon({ status }: { status: DebugStep['status'] }) {
  if (status === 'pending') return <div className="w-4 h-4 rounded-full bg-white/10 border border-white/20" />;
  if (status === 'running') return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
  if (status === 'ok')      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
  if (status === 'error')   return <XCircle className="w-4 h-4 text-red-400" />;
  return <AlertTriangle className="w-4 h-4 text-amber-400" />;
}

// ── زر نسخ ────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        toast.success('تم النسخ');
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="p-1 rounded hover:bg-white/10 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-white/40" />}
    </button>
  );
}

// ── بناء خطوات الـ debug من الـ response ─────────────────────
function buildSteps(
  data: Record<string, unknown> | null,
  error: unknown,
  durationMs: number,
): DebugStep[] {
  const ts = Date.now();
  const steps: DebugStep[] = [];

  if (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    steps.push({
      label: 'استدعاء Edge Function',
      status: 'error',
      detail: `فشل الاستدعاء: ${errMsg}`,
      ts,
    });
    return steps;
  }

  if (!data) {
    steps.push({ label: 'استدعاء Edge Function', status: 'error', detail: 'لا يوجد رد من السيرفر', ts });
    return steps;
  }

  // خطوة 1: Edge Function وصلت
  steps.push({
    label: '🔌 Edge Function استجابت',
    status: 'ok',
    detail: `المدة: ${durationMs}ms`,
    ts,
  });

  // خطوة 2: تحليل الخطأ أو النجاح
  if (data['error']) {
    const errCode = data['error'] as string;
    const errMsg  = (data['message'] as string) || errCode;
    let status: DebugStep['status'] = 'error';
    let detail = errMsg;

    if (errCode === 'service_unavailable') {
      detail = `❌ فشل getProductionKey — Vodafone Web API لا يرد\nرسالة: ${errMsg}`;
    } else if (errCode === 'connection_error') {
      detail = `❌ فشل createConversation — DirectLine لا يقبل الاتصال\nرسالة: ${errMsg}`;
    } else if (errCode === 'no_data') {
      status = 'warn';
      detail = `⚠️ WebSocket اتصل لكن لا توجد بيانات — الرقم ليس فودافون أو الخدمة بطيئة\nرسالة: ${errMsg}`;
    } else if (errCode === 'number_unavailable') {
      status = 'warn';
      detail = `⚠️ الرقم غير متوفر أو غير صحيح\nرسالة: ${errMsg}`;
    } else if (errCode === 'unauthorized') {
      detail = `🔒 رُفض من Zero Trust — تحقق من الـ token\nرسالة: ${errMsg}`;
    } else {
      detail = `خطأ [${errCode}]: ${errMsg}`;
    }

    steps.push({ label: 'تشخيص الخطأ', status, detail, ts });
  } else if (data['success'] && data['data']) {
    const d = data['data'] as Record<string, unknown>;
    steps.push({
      label: '🔑 productionKey',
      status: 'ok',
      detail: 'تم جلبه بنجاح من Vodafone Web API',
      ts,
    });
    steps.push({
      label: '💬 DirectLine Conversation',
      status: 'ok',
      detail: 'تم الاتصال وفتح WebSocket بنجاح',
      ts,
    });
    steps.push({
      label: '📡 WebSocket + Bot Response',
      status: 'ok',
      detail: 'استُقبلت البيانات عبر streamUrl',
      ts,
    });
    steps.push({
      label: '✅ البيانات',
      status: 'ok',
      detail: [
        d['system']      ? `النظام: ${d['system']}` : null,
        d['balance']     ? `الرصيد: ${d['balance']}` : null,
        d['loanDetails'] ? `سلفني: ${d['loanDetails']}` : null,
        `باقات MI: ${(d['miBundles'] as unknown[])?.length ?? 0}`,
        `فكة: ${(d['fakkaCards'] as unknown[])?.length ?? 0}`,
        `مارد: ${(d['maredCards'] as unknown[])?.length ?? 0}`,
      ].filter(Boolean).join(' | '),
      ts,
    });
  }

  return steps;
}

// ── المكون الرئيسي ────────────────────────────────────────────
export default function AdminLineInfoDebugPage() {
  const navigate = useNavigate();
  const [phone, setPhone]           = useState('01097273680');
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<DebugResult | null>(null);
  const [showRaw, setShowRaw]       = useState(false);
  const [history, setHistory]       = useState<Array<{ phone: string; ts: number; status: string; ms: number }>>([]);

  const runTest = async () => {
    if (!phone.trim()) { toast.error('أدخل رقم الهاتف'); return; }
    setLoading(true);
    setResult(null);

    const start = Date.now();
    let rawData: Record<string, unknown> | null = null;
    let rawError: unknown = null;

    try {
      // استدعاء Edge Function مباشرة بـ supabase-js
      const { data, error } = await supabase.functions.invoke('line-info-query', {
        body: { phone: phone.trim() },
      });
      rawData  = data  as Record<string, unknown> | null;
      rawError = error || null;
    } catch (e) {
      rawError = e;
    }

    const durationMs = Date.now() - start;
    const steps = buildSteps(rawData, rawError, durationMs);
    const finalStatus = rawError
      ? 'error'
      : rawData?.['success']
      ? 'success'
      : steps.some((s) => s.status === 'error') ? 'error' : 'partial';

    setResult({ steps, rawResponse: rawData ?? rawError, durationMs, finalStatus });
    setHistory((prev) => [{ phone: phone.trim(), ts: Date.now(), status: finalStatus, ms: durationMs }, ...prev].slice(0, 10));
    setLoading(false);
  };

  const statusColor = {
    success: 'text-green-400 border-green-400/30 bg-green-400/10',
    error:   'text-red-400 border-red-400/30 bg-red-400/10',
    partial: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            تشخيص معلومات الخط
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">فحص كل خطوة من flow معلومات الخط</p>
        </div>
      </div>

      {/* حقل الإدخال */}
      <Card className="border-border">
        <CardContent className="pt-4 space-y-3">
          <label className="text-sm font-medium text-foreground">رقم الهاتف للاختبار</label>
          <div className="flex gap-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="flex-1 text-left font-mono"
              dir="ltr"
              disabled={loading}
              onKeyDown={(e) => e.key === 'Enter' && runTest()}
            />
            <Button onClick={runTest} disabled={loading} className="shrink-0 gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {loading ? 'جارٍ الاختبار…' : 'تشغيل الاختبار'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            المدة المتوقعة: 5–20 ثانية (WebSocket + Bot processing)
          </p>
        </CardContent>
      </Card>

      {/* نتيجة الاختبار */}
      {loading && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">جارٍ الاختبار…</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  يتصل بـ Vodafone → DirectLine → WebSocket stream
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result && !loading && (
        <div className="space-y-4">
          {/* بطاقة الملخص */}
          <Card className={`border ${statusColor[result.finalStatus]}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.finalStatus === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : result.finalStatus === 'error' ? (
                    <XCircle className="w-5 h-5 text-red-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  )}
                  <span className="font-bold text-foreground">
                    {result.finalStatus === 'success' ? 'نجح الاختبار ✅' :
                     result.finalStatus === 'error'   ? 'فشل الاختبار ❌' :
                     'نتيجة جزئية ⚠️'}
                  </span>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {result.durationMs}ms
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* خطوات التشخيص */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                خطوات التنفيذ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30">
                  <StepIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{step.label}</p>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{step.detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* الـ Raw Response */}
          <Card className="border-border">
            <CardHeader className="pb-0">
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="flex items-center justify-between w-full text-right"
              >
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  Raw Response (JSON)
                </CardTitle>
                <div className="flex items-center gap-2">
                  <CopyBtn text={JSON.stringify(result.rawResponse, null, 2)} />
                  {showRaw ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>
            </CardHeader>
            {showRaw && (
              <CardContent className="pt-3">
                <pre className="text-xs font-mono bg-black/40 p-3 rounded-xl overflow-x-auto text-green-300 max-h-80 overflow-y-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(result.rawResponse, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* سجل الاختبارات */}
      {history.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">سجل الاختبارات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                <div className="flex items-center gap-2">
                  {h.status === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : h.status === 'error' ? (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span className="text-sm font-mono text-foreground">{h.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">{h.ms}ms</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(h.ts).toLocaleTimeString('ar-EG')}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* دليل التشخيص */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground">دليل التشخيص</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Key className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-400" />
            <span><strong className="text-foreground">service_unavailable:</strong> Vodafone Web API لا يرد — مشكلة في جانب فودافون</span>
          </div>
          <div className="flex items-start gap-2">
            <Wifi className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
            <span><strong className="text-foreground">connection_error:</strong> DirectLine لا يقبل الـ token — الـ productionKey انتهت</span>
          </div>
          <div className="flex items-start gap-2">
            <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
            <span><strong className="text-foreground">no_data:</strong> WebSocket اتصل لكن Bot لم يرد — الرقم غير فودافون أو timeout</span>
          </div>
          <div className="flex items-start gap-2">
            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
            <span><strong className="text-foreground">number_unavailable:</strong> Bot رد بـ "الخدمة غير متاحة" — الرقم غلط أو موقوف</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
