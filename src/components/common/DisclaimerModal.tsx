/**
 * DisclaimerModal — نافذة إخلاء المسؤولية
 * وضعان:
 *   - mandatory: إخلاء إجباري (لا يمكن إغلاقه) — يظهر بعد تسجيل الدخول
 *   - readonly:  وضع القراءة من القائمة الجانبية (لا checkbox، لا logout)
 */
import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, ScrollText, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DisclaimerConfig } from '@/hooks/useDisclaimer';

interface Props {
  open: boolean;
  mode: 'mandatory' | 'readonly';
  config: DisclaimerConfig;
  onAccept?: () => Promise<void>;
  onReject?: () => Promise<void>;
  onClose?: () => void;
}

export default function DisclaimerModal({ open, mode, config, onAccept, onReject, onClose }: Props) {
  const [checked,    setChecked]    = useState(false);
  const [accepting,  setAccepting]  = useState(false);
  const [rejecting,  setRejecting]  = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  // منع إغلاق الـ modal بالضغط على الخلفية في وضع إجباري
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (mode === 'readonly') { onClose?.(); }
    e.stopPropagation();
  };

  const handleAccept = async () => {
    if (!checked || accepting) return;
    setAccepting(true);
    try { await onAccept?.(); } finally { setAccepting(false); }
  };

  const handleReject = async () => {
    if (rejecting) return;
    setRejecting(true);
    try { await onReject?.(); } finally { setRejecting(false); }
  };

  // نص الإخلاء — نقسمه على فقرات
  const paragraphs = config.body.split('\n\n').filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center p-0 md:p-4"
      dir="rtl"
      onClick={handleBackdropClick}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* النافذة */}
      <div
        className="relative w-full md:max-w-lg max-h-[95dvh] md:max-h-[90dvh] flex flex-col rounded-t-3xl md:rounded-2xl overflow-hidden"
        style={{
          background: 'var(--background)',
          border: '1px solid rgba(230,0,0,0.25)',
          boxShadow: '0 0 40px rgba(230,0,0,0.15), 0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── رأس النافذة ─────────────────────────────── */}
        <div
          className="shrink-0 flex items-center gap-3 px-5 py-4"
          style={{
            background: 'linear-gradient(135deg, rgba(230,0,0,0.12) 0%, rgba(230,0,0,0.04) 100%)',
            borderBottom: '1px solid rgba(230,0,0,0.15)',
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.3)' }}
          >
            <Shield className="w-5 h-5" style={{ color: '#E60000' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black" style={{ color: '#E60000' }}>
              {config.title}
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              {mode === 'mandatory'
                ? 'يرجى القراءة والموافقة للمتابعة'
                : `الإصدار ${config.version} · ${config.developer}`}
            </p>
          </div>
          {/* زر إغلاق للوضع القراءة فقط */}
          {mode === 'readonly' && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors"
              style={{ background: 'var(--muted)' }}
            >
              <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            </button>
          )}
        </div>

        {/* ── النص القابل للتمرير ─────────────────────── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
          style={{ overscrollBehavior: 'contain' }}
        >
          {/* أيقونة توضيحية */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl"
            style={{ background: 'rgba(230,0,0,0.06)', border: '1px solid rgba(230,0,0,0.12)' }}>
            <FileText className="w-4 h-4 shrink-0" style={{ color: '#E60000' }} />
            <p className="text-xs font-bold" style={{ color: '#E60000' }}>
              Vodafone Fakka Premium · by {config.developer}
            </p>
          </div>

          {/* فقرات النص */}
          {paragraphs.map((para, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed"
              style={{ color: 'var(--foreground)', opacity: 0.85 }}
            >
              {para}
            </p>
          ))}

          {/* رقم النسخة */}
          <div className="flex items-center justify-between pt-2 pb-1">
            <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              رقم النسخة: {config.version}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              مطور التطبيق: {config.developer}
            </span>
          </div>
        </div>

        {/* ── أزرار الوضع الإجباري ────────────────────── */}
        {mode === 'mandatory' && !showRejectConfirm && (
          <div
            className="shrink-0 px-5 py-4 space-y-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* Checkbox الموافقة */}
            <label
              className="flex items-start gap-3 cursor-pointer select-none"
              onClick={() => setChecked(v => !v)}
            >
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center border-2 shrink-0 mt-0.5 transition-all"
                style={{
                  borderColor: checked ? '#E60000' : 'rgba(255,255,255,0.25)',
                  background:  checked ? '#E60000' : 'transparent',
                }}
              >
                {checked && (
                  <svg viewBox="0 0 10 8" fill="none" className="w-3 h-3">
                    <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span className="text-xs leading-relaxed" style={{ color: 'var(--foreground)' }}>
                أوافق وأتحمل مسؤولية استخدام التطبيق
              </span>
            </label>

            {/* زر الموافقة */}
            <Button
              className="w-full h-12 font-black text-base rounded-xl transition-all"
              disabled={!checked || accepting}
              onClick={handleAccept}
              style={{
                background: checked ? '#E60000' : 'rgba(230,0,0,0.2)',
                color: checked ? '#fff' : 'rgba(255,255,255,0.4)',
                border: 'none',
              }}
            >
              {accepting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جاري الحفظ...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  أوافق ومتابعة
                </span>
              )}
            </Button>

            {/* زر الرفض */}
            <button
              onClick={() => setShowRejectConfirm(true)}
              className="w-full text-center text-xs py-1 transition-opacity hover:opacity-80"
              style={{ color: 'var(--muted-foreground)' }}
            >
              رفض ولا أريد المتابعة
            </button>
          </div>
        )}

        {/* ── تأكيد الرفض ─────────────────────────────── */}
        {mode === 'mandatory' && showRejectConfirm && (
          <div
            className="shrink-0 px-5 py-5 space-y-4"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(230,0,0,0.06)',
            }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#E60000' }} />
              <div>
                <p className="text-sm font-bold mb-1" style={{ color: '#E60000' }}>
                  هل أنت متأكد من الرفض؟
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  برفضك لإخلاء المسؤولية سيتم تسجيل خروجك من التطبيق. يمكنك تسجيل الدخول مجدداً في أي وقت.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl border-border"
                onClick={() => setShowRejectConfirm(false)}
                disabled={rejecting}
              >
                العودة
              </Button>
              <Button
                className="flex-1 h-11 rounded-xl font-bold"
                style={{ background: '#E60000', color: '#fff', border: 'none' }}
                onClick={handleReject}
                disabled={rejecting}
              >
                {rejecting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'تأكيد الرفض وتسجيل الخروج'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* زر إغلاق الوضع القراءة في الأسفل */}
        {mode === 'readonly' && (
          <div className="shrink-0 px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <Button
              className="w-full h-11 rounded-xl"
              variant="outline"
              onClick={onClose}
            >
              <ScrollText className="w-4 h-4 ml-2" />
              إغلاق
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
