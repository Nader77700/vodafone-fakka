/**
 * WalletLinesPage — صفحة خدمات الخطوط والمحافظ — PHASE 2
 * - التحقق من الاشتراك + إعدادات السيرفر قبل الدخول
 */

import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ScanLine, ShieldCheck, Zap, Users, Info,
  Lock, Wrench, Loader2,
} from 'lucide-react';
import { useServicesControl } from '@/hooks/useServicesControl';
import { useIsLight } from '@/contexts/ThemeContext';
import { useState } from 'react';

export default function WalletLinesPage() {
  const navigate = useNavigate();
  const { isAccessible, loading: cfgLoading } = useServicesControl();
  const L = useIsLight();

  // ── خلفية + header مشتركة ──
  const pageBg = L ? '#f5f7fa' : 'linear-gradient(180deg, #080d14 0%, #0a0a12 100%)';
  const headerBg = L ? 'rgba(255,255,255,0.96)' : 'rgba(8,13,20,0.92)';
  const headerBorder = L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
  const btnBorder = L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';
  const btnBg = L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  const titleColor = L ? '#1a1a2e' : '#ffffff';
  const subColor = L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';

  // ── حجب الدخول لو الخدمة معطلة أو في صيانة فقط ─────────────
  if (!cfgLoading) {
    const access = isAccessible('wallet-lines', true, true);
    if (!access.allowed) {
      return (
        <div className="min-h-screen flex flex-col" dir="rtl"
          style={{ background: pageBg }}>
          <div className="sticky top-0 z-30 px-4 pt-safe-top"
            style={{ background: headerBg, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${headerBorder}` }}>
            <div className="flex items-center gap-3 py-4">
              <button onClick={() => navigate('/services')}
                className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                style={{ border: `1px solid ${btnBorder}`, background: btnBg }}
                aria-label="رجوع">
                <ArrowRight className="w-4 h-4" style={{ color: titleColor }} />
              </button>
              <h1 className="text-base font-black" style={{ color: titleColor }}>خدمات الخطوط والمحافظ</h1>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
            {access.reason === 'no_subscription'
              ? <Lock className="w-12 h-12 text-amber-400" />
              : <Wrench className="w-12 h-12" style={{ color: L ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.30)' }} />}
            <p className="font-black text-lg" style={{ color: titleColor }}>
              {access.reason === 'maintenance' ? (access.message ?? 'الخدمة في صيانة مؤقتة')
                : access.reason === 'disabled' ? 'هذه الخدمة معطلة حالياً'
                : 'الخدمة غير متاحة'}
            </p>
            <p className="text-sm" style={{ color: subColor }}>نعتذر عن الإزعاج، يرجى المحاولة لاحقاً</p>
            <button onClick={() => navigate('/services')} className="text-indigo-400 text-sm font-semibold flex items-center gap-1">
              <ArrowRight className="w-4 h-4" /> العودة للخدمات
            </button>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen pb-28 flex flex-col" dir="rtl"
      style={{ background: pageBg }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: headerBg, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${headerBorder}` }}>
        <div className="flex items-center gap-3 py-4">
          <button
            onClick={() => navigate('/services')}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all"
            style={{ border: `1px solid ${btnBorder}`, background: btnBg }}
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4" style={{ color: titleColor }} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black" style={{ color: titleColor }}>خدمات الخطوط والمحافظ</h1>
            <p className="text-[10px] text-muted-foreground">استعلام آمن عبر My NTRA</p>
          </div>
          {cfgLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: L ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.30)' }} />
          ) : (
            <span className="text-[9px] font-black px-2 py-1 rounded-full"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)' }}>
              BETA
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pt-6 flex flex-col gap-5">

        {/* ── بطاقة التوضيح الرسمي — My NTRA ── */}
        <div className="relative rounded-[24px] overflow-hidden p-4"
          style={{
            background: L
              ? 'linear-gradient(135deg, rgba(251,191,36,0.06) 0%, #ffffff 100%)'
              : 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(8,13,20,0.95) 100%)',
            border: `1px solid ${L ? 'rgba(251,191,36,0.20)' : 'rgba(251,191,36,0.20)'}`,
          }}>
          <div className="absolute top-0 left-0 right-0 h-0.5"
            style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-amber-500/25"
              style={{ background: L ? 'rgba(251,191,36,0.12)' : 'linear-gradient(135deg, rgba(251,191,36,0.22), rgba(251,191,36,0.08))' }}>
              <Info className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-black mb-1" style={{ color: titleColor }}>خدمة رسمية من My NTRA</h2>
              <p className="text-[11px] leading-relaxed" style={{ color: subColor }}>
                الاستعلام عن بيانات الخطوط والمحافظ المسجلة باسمك يتم مباشرةً عبر My NTRA
                التابع للجهاز القومي لتنظيم الاتصالات في مصر.
              </p>
            </div>
          </div>
        </div>

        {/* ── Card تعريفي ── */}
        <div className="relative rounded-[24px] overflow-hidden p-5"
          style={{
            background: L
              ? 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, #ffffff 100%)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(8,13,20,0.95) 100%)',
            border: `1px solid ${L ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.20)'}`,
          }}>
          <div className="absolute top-0 left-0 right-0 h-0.5"
            style={{ background: 'linear-gradient(90deg, #6366f1, #818cf8, #6366f1)' }} />

          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-500/25"
              style={{ background: L ? 'rgba(99,102,241,0.10)' : 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(99,102,241,0.1))' }}>
              <ScanLine className="w-7 h-7 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black mb-1" style={{ color: titleColor }}>ما يمكنك معرفته؟</h2>
              <p className="text-xs leading-relaxed" style={{ color: subColor }}>
                اكتشف المحافظ الإلكترونية والخطوط المسجلة برقمك القومي لدى شركات
                (Vodafone — Orange — Etisalat — WE) في ثوانٍ معدودة.
              </p>
            </div>
          </div>

          {/* مميزات */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { icon: <ShieldCheck className="w-4 h-4" />, label: 'آمن بالكامل', color: '#22c55e' },
              { icon: <Zap className="w-4 h-4" />, label: 'نتائج فورية', color: '#F7C948' },
              { icon: <Users className="w-4 h-4" />, label: '4 شركات', color: '#6366f1' },
            ].map(f => (
              <div key={f.label} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-center"
                style={{ border: `1px solid ${L ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'}`, background: L ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
                <span style={{ color: f.color }}>{f.icon}</span>
                <span className="text-[10px] font-bold" style={{ color: L ? 'rgba(0,0,0,0.60)' : 'rgba(255,255,255,0.70)' }}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── اختر كيف تبدأ ── */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground px-1">اختر كيف تبدأ</p>

          {/* تسجيل الدخول */}
          <button
            onClick={() => navigate('/wallet-lines/login')}
            className="group w-full relative rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 active:scale-[0.98] hover:scale-[1.01]"
            style={{
              background: L ? '#ffffff' : 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.05))',
              border: `1px solid ${L ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.30)'}`,
              boxShadow: L ? '0 1px 6px rgba(99,102,241,0.08)' : 'none',
            }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-indigo-400/25"
              style={{ background: L ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.20)' }}>
              <ScanLine className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-sm font-black" style={{ color: titleColor }}>تسجيل الدخول</p>
              <p className="text-[11px] mt-0.5" style={{ color: subColor }}>لديك حساب مسبق؟ ادخل مباشرة</p>
            </div>
            <ChevronLeftIcon L={L} />
          </button>

          {/* إنشاء حساب */}
          <button
            onClick={() => navigate('/wallet-lines/register')}
            className="group w-full relative rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 active:scale-[0.98] hover:scale-[1.01]"
            style={{
              background: L ? '#ffffff' : 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03))',
              border: `1px solid ${L ? 'rgba(34,197,94,0.20)' : 'rgba(34,197,94,0.25)'}`,
              boxShadow: L ? '0 1px 6px rgba(34,197,94,0.06)' : 'none',
            }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-green-500/25"
              style={{ background: L ? 'rgba(34,197,94,0.10)' : 'rgba(34,197,94,0.15)' }}>
              <Users className="w-6 h-6 text-green-500" />
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-sm font-black" style={{ color: titleColor }}>إنشاء حساب جديد</p>
              <p className="text-[11px] mt-0.5" style={{ color: subColor }}>سجّل مجانًا وابدأ الاستعلام</p>
            </div>
            <ChevronLeftIcon L={L} />
          </button>
        </div>

        {/* ملاحظة أمان */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl"
          style={{ border: `1px solid ${L ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'}`, background: L ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)' }}>
          <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed" style={{ color: subColor }}>
            بياناتك محمية بالكامل ولا تُشارَك مع أي طرف ثالث. الاستعلام يتم بشكل آمن ومشفر.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChevronLeftIcon({ L }: { L: boolean }) {
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
      style={{ background: L ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', border: `1px solid ${L ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.10)'}` }}>
      <ArrowRight className="w-3.5 h-3.5 rotate-180" style={{ color: L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.60)' }} />
    </div>
  );
}
