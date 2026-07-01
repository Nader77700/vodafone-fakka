/**
 * OperationDetailPage — صفحة تفاصيل العملية
 * للمستخدم: بيانات أساسية + سبب فشل عربي فقط
 * للأدمن:   بيانات كاملة + Debug Info + API Response + Logs
 */
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import type { Operation } from '@/types/types';
import { parseApiError } from '@/lib/errorMapper';
<<<<<<< HEAD
import { formatEgyptDate, formatEgyptTime, formatEgyptDateTime } from '@/lib/egyptTime';
=======
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
import {
  ArrowRight, CheckCircle2, XCircle, Clock, Hash, Phone,
  CreditCard, Banknote, Calendar, Timer, Wallet, Shield,
  Copy, ChevronDown, ChevronUp, Tag,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── helpers ─────────────────────────────────────────────────────────────────
function statusInfo(s: string) {
  if (s === 'success') return { label: 'ناجحة',  icon: CheckCircle2, color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)' };
  if (s === 'failed')  return { label: 'فاشلة',  icon: XCircle,      color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' };
  return                      { label: 'معلقة',  icon: Clock,        color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)' };
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success('تم النسخ')).catch(() => {});
}

// بطاقة صف بيانات
function DataRow({ label, value, mono = false, copyable = false }: {
  label: string; value: string | number | null | undefined; mono?: boolean; copyable?: boolean;
}) {
  const v = value != null && value !== '' ? String(value) : '—';
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0"
      style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <p className="text-xs text-muted-foreground shrink-0 w-28">{label}</p>
      <p className={`text-xs font-semibold text-white flex-1 min-w-0 ltr ${mono ? 'font-mono break-all' : 'truncate'}`}>{v}</p>
      {copyable && v !== '—' && (
        <button onClick={() => copyText(v)} className="shrink-0 opacity-40 hover:opacity-100 transition-opacity">
          <Copy className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function OperationDetailPage() {
  const { user, profile }  = useAuth();
  const navigate           = useNavigate();
  const location           = useLocation();
  const { id }             = useParams<{ id: string }>();
  const [op, setOp]        = useState<Operation | null>((location.state as { op?: Operation } | null)?.op ?? null);
  const [loading, setLoading] = useState(!op);
  const [showDebug, setShowDebug] = useState(false);

  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin';

  // إذا لم تُمرَّر البيانات عبر state، نجلبها من DB
  useEffect(() => {
    if (op || !id || !user) return;
    setLoading(true);
    supabase
      .from('operations')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setOp(data as unknown as Operation);
        setLoading(false);
      });
  }, [id, user, op]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080000' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#E60000' }} />
      </div>
    );
  }

  if (!op) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#080000' }} dir="rtl">
        <p className="text-3xl">🔍</p>
        <p className="text-sm text-muted-foreground">لم يتم العثور على العملية</p>
        <button onClick={() => navigate(-1)} className="text-xs" style={{ color: '#E60000' }}>العودة</button>
      </div>
    );
  }

  const st = statusInfo(op.status);
  const StIcon = st.icon;

  // cast كامل لجميع الحقول المتاحة
  const opFull = op as unknown as {
    id: string;
    operation_number?: number;
    user_id: string;
    phone_number: string;
    card_type?: string;
    category?: string;
    amount?: number;
    status: string;
    error_message?: string;
    performed_at: string;
    created_at?: string;
    operation_source?: string;
    duration_ms?: number;
    latency_ms?: number;
    retry_count?: number;
    api_response?: string;
    correlation_id?: string;
    idempotency_key?: string;
    execution_layer?: string;
    card_data?: Record<string, unknown>;
  };

  const isBalance =
    opFull.operation_source === 'ana_vodafone_balance' ||
    opFull.card_data?.source === 'ana_vodafone_balance';

  const srcLabel = isBalance ? 'الشحن من الرصيد (أنا فودافون)' : 'Vodafone Cash';

  const mapped = op.status === 'failed' ? parseApiError(op.error_message) : null;

  const performedDate = new Date(opFull.performed_at);
<<<<<<< HEAD
  const dateLabel = formatEgyptDate(performedDate);
  const timeLabel = formatEgyptTime(performedDate);
=======
  const dateLabel = performedDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeLabel = performedDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)

  const durationMs = opFull.duration_ms ?? opFull.latency_ms;

  // ── صفوف البيانات الأساسية ──
  const basicRows = [
    { icon: Hash,       label: 'رقم العملية',  value: opFull.operation_number != null ? `#${opFull.operation_number}` : '—', copyable: false },
    { icon: Phone,      label: 'رقم الهاتف',   value: opFull.phone_number, copyable: true },
    { icon: CreditCard, label: 'المنتج',        value: opFull.card_type },
    { icon: Tag,        label: 'الفئة',         value: opFull.category },
    { icon: Banknote,   label: 'المبلغ',        value: opFull.amount != null ? `${opFull.amount} جنيه` : '—' },
    { icon: Calendar,   label: 'التاريخ',       value: dateLabel },
    { icon: Timer,      label: 'الوقت',         value: timeLabel },
    { icon: Wallet,     label: 'مصدر العملية',  value: srcLabel },
    ...(durationMs != null ? [{ icon: Timer, label: 'مدة التنفيذ', value: durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s` }] : []),
  ];

  // ── صفوف Debug (للأدمن فقط) ──
  const cardDataStr = opFull.card_data ? JSON.stringify(opFull.card_data, null, 2) : null;
  const apiResponseStr = opFull.api_response ?? null;

  return (
    <div className="min-h-screen pb-10" style={{ background: '#080000' }} dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b"
        style={{ background: 'rgba(8,0,0,0.95)', borderColor: 'rgba(230,0,0,0.15)', backdropFilter: 'blur(8px)' }}>
        <button onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(230,0,0,0.1)', border: '1px solid rgba(230,0,0,0.2)' }}>
          <ArrowRight className="w-4 h-4" style={{ color: '#E60000' }} />
        </button>
        <h1 className="flex-1 text-sm font-black text-white truncate">تفاصيل العملية</h1>
        {isAdmin && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(230,0,0,0.15)', color: '#ff8888', border: '1px solid rgba(230,0,0,0.25)' }}>
            <Shield className="w-2.5 h-2.5 inline ml-1" />أدمن
          </span>
        )}
      </div>

      <div className="px-4 pt-6 space-y-4">
        {/* بطاقة الحالة */}
        <div className="rounded-2xl border p-5 flex flex-col items-center gap-3 text-center"
          style={{ background: st.bg, borderColor: st.border }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: st.bg, border: `2px solid ${st.border}` }}>
            <StIcon className="w-7 h-7" style={{ color: st.color }} />
          </div>
          <div>
            <p className="text-lg font-black" style={{ color: st.color }}>{st.label}</p>
            <p className="text-[11px] mt-0.5 flex items-center gap-1.5 justify-center flex-wrap"
              style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{
                  background: isBalance ? 'rgba(230,0,0,0.12)' : 'rgba(245,158,11,0.12)',
                  color: isBalance ? '#ff8888' : '#fbbf24',
                  border: isBalance ? '1px solid rgba(230,0,0,0.2)' : '1px solid rgba(245,158,11,0.2)',
                }}>
                <Wallet className="w-2.5 h-2.5" />{srcLabel}
              </span>
              <span>{opFull.category ?? 'فكة'} · {opFull.card_type}</span>
            </p>
          </div>
          {opFull.amount != null && (
            <p className="text-2xl font-black text-white">
              {opFull.amount} <span className="text-base font-normal" style={{ color: 'rgba(255,255,255,0.5)' }}>جنيه</span>
            </p>
          )}
          {/* سبب النجاح */}
          {op.status === 'success' && (
            <p className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
              ✓ تمّت العملية بنجاح كامل
            </p>
          )}
        </div>

        {/* تفاصيل أساسية */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}>
          {basicRows.map((row, i) => {
            const RowIcon = row.icon;
            const v = row.value != null && row.value !== '' ? String(row.value) : '—';
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0"
                style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(230,0,0,0.1)', border: '1px solid rgba(230,0,0,0.15)' }}>
                  <RowIcon className="w-3.5 h-3.5" style={{ color: '#E60000' }} />
                </div>
                <p className="text-xs text-muted-foreground shrink-0 w-24">{row.label}</p>
                <p className="text-xs font-semibold text-white flex-1 min-w-0 ltr truncate">{v}</p>
                {row.copyable && v !== '—' && (
                  <button onClick={() => copyText(v)} className="shrink-0 opacity-40 hover:opacity-100">
                    <Copy className="w-3 h-3 text-white" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* سبب الفشل — عربي */}
        {mapped && (
          <div className="rounded-2xl border p-4 space-y-2"
            style={{ background: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.2)' }}>
            <p className="text-xs font-bold" style={{ color: '#f87171' }}>سبب الفشل</p>
            {mapped.arabicMessage.split('\n').filter(Boolean).map((line, i) => (
              <p key={i} className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{line}</p>
            ))}
          </div>
        )}

        {/* ═══ DEBUG INFO — للأدمن فقط ═══ */}
        {isAdmin && (
          <div className="rounded-2xl border overflow-hidden"
            style={{ borderColor: 'rgba(230,0,0,0.2)' }}>
            {/* رأس قابل للطي */}
            <button
              onClick={() => setShowDebug(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3"
              style={{ background: 'rgba(230,0,0,0.08)' }}>
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" style={{ color: '#ff8888' }} />
                <span className="text-xs font-bold" style={{ color: '#ff8888' }}>Debug Info — أدمن فقط</span>
              </div>
              {showDebug ? <ChevronUp className="w-4 h-4" style={{ color: '#ff8888' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#ff8888' }} />}
            </button>

            {showDebug && (
              <div style={{ background: 'rgba(255,255,255,0.015)' }}>
                {/* IDs */}
                <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-bold text-muted-foreground mb-1.5">معرّفات التتبع</p>
                  <DataRow label="Operation ID"    value={opFull.id}                mono copyable />
                  <DataRow label="User ID"          value={opFull.user_id}           mono copyable />
                  <DataRow label="Correlation ID"   value={opFull.correlation_id}    mono copyable />
                  <DataRow label="Idempotency Key"  value={opFull.idempotency_key}   mono copyable />
                </div>

                {/* تنفيذ */}
                <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-bold text-muted-foreground mb-1.5">تفاصيل التنفيذ</p>
                  <DataRow label="Operation Source" value={opFull.operation_source ?? 'vodafone_cash'} />
                  <DataRow label="Execution Layer"  value={opFull.execution_layer} />
                  <DataRow label="Retry Count"      value={opFull.retry_count ?? 0} />
                  <DataRow label="Duration (ms)"    value={durationMs} />
<<<<<<< HEAD
                  <DataRow label="Created At"       value={opFull.created_at ? formatEgyptDateTime(opFull.created_at) : '—'} />
=======
                  <DataRow label="Created At"       value={opFull.created_at ? new Date(opFull.created_at).toLocaleString('ar-EG') : '—'} />
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
                </div>

                {/* نتيجة */}
                <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-bold text-muted-foreground mb-1.5">نتيجة العملية</p>
                  <DataRow label="Status"           value={op.status} />
                  {op.status === 'success' && <DataRow label="سبب النجاح" value="اكتملت العملية بنجاح عبر API" />}
                  {op.status === 'failed'  && <DataRow label="سبب الفشل"  value={mapped?.arabicMessage.split('\n')[0] ?? op.error_message} />}
                  {op.status === 'failed'  && <DataRow label="Raw Error"   value={op.error_message} mono />}
                </div>

                {/* API Response */}
                {apiResponseStr && (
                  <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-bold text-muted-foreground">API Response</p>
                      <button onClick={() => copyText(apiResponseStr)} className="text-[10px] text-primary hover:opacity-70 flex items-center gap-1">
                        <Copy className="w-2.5 h-2.5" /> نسخ
                      </button>
                    </div>
                    <pre className="text-[10px] font-mono text-foreground/70 break-words whitespace-pre-wrap bg-muted/20 rounded-lg p-2 max-h-36 overflow-y-auto">
                      {apiResponseStr}
                    </pre>
                  </div>
                )}

                {/* card_data */}
                {cardDataStr && (
                  <div className="px-3 py-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-bold text-muted-foreground">Card Data (Internal)</p>
                      <button onClick={() => copyText(cardDataStr)} className="text-[10px] text-primary hover:opacity-70 flex items-center gap-1">
                        <Copy className="w-2.5 h-2.5" /> نسخ
                      </button>
                    </div>
                    <pre className="text-[10px] font-mono text-foreground/70 break-words whitespace-pre-wrap bg-muted/20 rounded-lg p-2 max-h-36 overflow-y-auto">
                      {cardDataStr}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* زر العودة */}
        <button
          onClick={() => navigate(-1)}
          className="w-full py-3 rounded-xl text-sm font-bold"
          style={{ background: 'rgba(230,0,0,0.1)', color: '#ff6666', border: '1px solid rgba(230,0,0,0.2)' }}
        >
          العودة للقائمة
        </button>
      </div>
    </div>
  );
}
