/**
 * WalletLinesLogsPage — لوحة أخطاء خدمة الخطوط والمحافظ
 * للأدمن فقط — تُظهر آخر 200 خطأ مع تفاصيل كاملة
 */

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, Loader2, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/db/supabase';

// ── Types ─────────────────────────────────────────────────────────
interface WlLog {
  id: number;
  created_at: string;
  action: string;
  error_code: string;
  http_status: number | null;
  message: string | null;
  phone_hint: string | null;
  device_id: string | null;
  request_id: string | null;
  extra: Record<string, unknown> | null;
}

// ── Helpers ───────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  login: 'تسجيل الدخول',
  register: 'إنشاء حساب',
  verify_otp: 'تأكيد OTP',
  lookup: 'الرقم القومي',
};

const ERROR_COLORS: Record<string, string> = {
  INVALID_CREDENTIALS:  'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  SERVICE_UNAVAILABLE:  'bg-red-500/15 text-red-300 border-red-500/30',
  CONNECTION_ERROR:     'bg-orange-500/15 text-orange-300 border-orange-500/30',
  TIMEOUT:              'bg-orange-500/15 text-orange-300 border-orange-500/30',
  INVALID_RESPONSE:     'bg-purple-500/15 text-purple-300 border-purple-500/30',
  REGISTER_FAILED:      'bg-red-500/15 text-red-300 border-red-500/30',
  OTP_INVALID:          'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  NATIONAL_ID_INVALID:  'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  UNEXPECTED_ERROR:     'bg-gray-500/15 text-gray-300 border-gray-500/30',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ar-EG', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ── Component ─────────────────────────────────────────────────────
export default function WalletLinesLogsPage() {
  const [logs, setLogs]         = useState<WlLog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterCode, setFilterCode]     = useState('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('wl_error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLoading(false);
    if (err) { setError(err.message); return; }
    setLogs(data ?? []);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // فلترة محلية
  const filtered = logs.filter(l => {
    if (filterAction !== 'all' && l.action !== filterAction) return false;
    if (filterCode   !== 'all' && l.error_code !== filterCode) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.error_code.toLowerCase().includes(q) ||
        (l.message ?? '').toLowerCase().includes(q) ||
        (l.phone_hint ?? '').includes(q) ||
        l.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const uniqueCodes   = [...new Set(logs.map(l => l.error_code))].sort();
  const uniqueActions = [...new Set(logs.map(l => l.action))].sort();

  // إحصائيات
  const stats = {
    total:       logs.length,
    last24h:     logs.filter(l => Date.now() - new Date(l.created_at).getTime() < 86_400_000).length,
    serviceDown: logs.filter(l => l.error_code === 'SERVICE_UNAVAILABLE').length,
    badCreds:    logs.filter(l => l.error_code === 'INVALID_CREDENTIALS').length,
  };

  return (
    <div className="min-h-screen pb-16 flex flex-col" dir="rtl"
      style={{ background: 'var(--gradient-background)' }}>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 py-3"
        style={{ background: 'rgba(8,13,20,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-black text-white">سجل أخطاء الخطوط والمحافظ</h1>
            <p className="text-[10px] text-muted-foreground">آخر 200 خطأ — للأدمن فقط</p>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchLogs} disabled={loading}
            className="w-9 h-9 border border-white/10 bg-white/5 hover:bg-white/10 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 pt-4 space-y-4">

        {/* إحصائيات */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'إجمالي الأخطاء', value: stats.total,       color: 'text-white' },
            { label: 'آخر 24 ساعة',    value: stats.last24h,     color: 'text-yellow-300' },
            { label: 'خدمة محجوبة',    value: stats.serviceDown, color: 'text-red-400' },
            { label: 'بيانات خاطئة',   value: stats.badCreds,    color: 'text-orange-300' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-white/8 bg-white/4 p-3">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-white/50 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* فلاتر */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
            <Input placeholder="بحث في الأخطاء..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-full md:w-44 bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="الإجراء" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الإجراءات</SelectItem>
              {uniqueActions.map(a => (
                <SelectItem key={a} value={a}>{ACTION_LABELS[a] ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCode} onValueChange={setFilterCode}>
            <SelectTrigger className="w-full md:w-52 bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="كود الخطأ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأكواد</SelectItem>
              {uniqueCodes.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* حالة الخطأ */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-red-500/25 bg-red-500/8">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-red-300 font-semibold">تعذر تحميل السجلات</p>
              <p className="text-[11px] text-red-400/70 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* جدول السجلات */}
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16 gap-3 text-white/40">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">جاري التحميل...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 className="w-10 h-10 text-green-400/60" />
            <p className="text-sm text-white/40">
              {logs.length === 0 ? 'لا توجد أخطاء مسجلة' : 'لا توجد نتائج للبحث الحالي'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-white/30">{filtered.length} نتيجة</p>
            {filtered.map(log => (
              <div key={log.id}
                className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                {/* Row رئيسي */}
                <button
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  className="w-full flex items-start gap-3 p-3 text-right hover:bg-white/4 transition-colors">
                  {/* كود الخطأ */}
                  <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border
                    ${ERROR_COLORS[log.error_code] ?? 'bg-gray-500/15 text-gray-300 border-gray-500/30'}`}>
                    {log.error_code}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-white/80">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                      {log.http_status && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded
                          ${log.http_status >= 500 ? 'bg-red-500/20 text-red-300' :
                            log.http_status >= 400 ? 'bg-yellow-500/20 text-yellow-300' :
                            'bg-white/10 text-white/50'}`}>
                          HTTP {log.http_status}
                        </span>
                      )}
                      {log.phone_hint && (
                        <span className="text-[10px] text-white/30 font-mono">***{log.phone_hint}</span>
                      )}
                    </div>
                    {log.message && (
                      <p className="text-[11px] text-white/50 mt-0.5 truncate">{log.message}</p>
                    )}
                    <p className="text-[10px] text-white/25 mt-1 font-mono">{formatDate(log.created_at)}</p>
                  </div>
                </button>

                {/* تفاصيل موسعة */}
                {expanded === log.id && (
                  <div className="border-t border-white/8 px-3 pb-3 pt-2 space-y-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <Row label="الكود" value={log.error_code} mono />
                      <Row label="HTTP" value={log.http_status?.toString() ?? '—'} mono />
                      <Row label="الإجراء" value={ACTION_LABELS[log.action] ?? log.action} />
                      <Row label="Device ID" value={log.device_id ?? '—'} mono />
                      <Row label="Request ID" value={log.request_id ?? '—'} mono />
                      <Row label="رقم الهاتف" value={log.phone_hint ? `***${log.phone_hint}` : '—'} mono />
                    </div>
                    {log.message && (
                      <div className="rounded-lg bg-white/5 p-2">
                        <p className="text-[10px] text-white/40 mb-1">الرسالة</p>
                        <p className="text-white/70 leading-relaxed">{log.message}</p>
                      </div>
                    )}
                    {log.extra && Object.keys(log.extra).length > 0 && (
                      <div className="rounded-lg bg-white/5 p-2">
                        <p className="text-[10px] text-white/40 mb-1">بيانات إضافية</p>
                        <pre className="text-[10px] text-white/50 whitespace-pre-wrap font-mono overflow-x-auto">
                          {JSON.stringify(log.extra, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-white/30">{label}: </span>
      <span className={`text-white/65 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
