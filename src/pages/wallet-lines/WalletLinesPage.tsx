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
import { useState } from 'react';

export default function WalletLinesPage() {
  const navigate = useNavigate();
  const { isAccessible, loading: cfgLoading } = useServicesControl();

  // ── حجب الدخول لو الخدمة معطلة أو في صيانة فقط ─────────────
  // لا يُمنع الدخول بسبب الاشتراك؛ القسم خدمة مجانية لجميع المستخدمين
  if (!cfgLoading) {
    const access = isAccessible('wallet-lines', true, true);
    if (!access.allowed) {
      return (
        <div className="min-h-screen flex flex-col" dir="rtl"
          style={{ background: 'var(--gradient-background)' }}>
          <div className="sticky top-0 z-30 px-4 pt-safe-top"
            style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-3 py-4">
              <button onClick={() => navigate('/services')}
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5"
                aria-label="رجوع">
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
              <h1 className="text-base font-black text-white">خدمات الخطوط والمحافظ</h1>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
            {access.reason === 'no_subscription'
              ? <Lock className="w-12 h-12 text-amber-400" />
              : <Wrench className="w-12 h-12 text-white/30" />}
            <p className="text-white font-black text-lg">
              {access.reason === 'maintenance'     ? (access.message ?? 'الخدمة في صيانة مؤقتة')    :
               access.reason === 'disabled'        ? 'هذه الخدمة معطلة حالياً'                       :
               'الخدمة غير متاحة'}
            </p>
            <p className="text-sm text-white/40">
              نعتذر عن الإزعاج، يرجى المحاولة لاحقاً
            </p>
            <button onClick={() => navigate('/services')}
              className="text-indigo-400 text-sm font-semibold flex items-center gap-1">
              <ArrowRight className="w-4 h-4" /> العودة للخدمات
            </button>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen pb-28 flex flex-col" dir="rtl"
      style={{ background: 'var(--gradient-background)' }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 py-4">
          <button
            onClick={() => navigate('/services')}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all"
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black text-white">خدمات الخطوط والمحافظ</h1>
            <p className="text-[10px] text-muted-foreground">استعلام آمن عبر My NTRA</p>
          </div>
          {cfgLoading ? (
            <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
          ) : (
            <span className="text-[9px] font-black px-2 py-1 rounded-full"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
              BETA
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pt-6 flex flex-col gap-5">

        {/* ── بطاقة التوضيح الرسمي — My NTRA ── */}
        <div className="relative rounded-[24px] overflow-hidden border border-amber-500/20 p-4"
          style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(8,13,20,0.95) 100%)' }}>
          {/* top accent */}
          <div className="absolute top-0 left-0 right-0 h-0.5"
            style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />

          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-amber-500/25"
              style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.22), rgba(251,191,36,0.08))' }}>
              <Info className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-black text-white mb-1">خدمة رسمية من My NTRA</h2>
              <p className="text-[11px] text-white/55 leading-relaxed">
                الاستعلام عن بيانات الخطوط والمحافظ المسجلة باسمك يتم مباشرةً عبر My NTRA
                التابع للجهاز القومي لتنظيم الاتصالات في مصر. تسجيل الدخول يستخدم حسابك الرسمي على My NTRA.
              </p>
            </div>
          </div>
        </div>

        {/* ── Card تعريفي ── */}
        <div className="relative rounded-[24px] overflow-hidden border border-indigo-500/20 p-5"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(8,13,20,0.95) 100%)' }}>
          {/* top accent */}
          <div className="absolute top-0 left-0 right-0 h-0.5"
            style={{ background: 'linear-gradient(90deg, #6366f1, #818cf8, #6366f1)' }} />

          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-500/25"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(99,102,241,0.1))' }}>
              <ScanLine className="w-7 h-7 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-white mb-1">ما يمكنك معرفته؟</h2>
              <p className="text-xs text-white/55 leading-relaxed">
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
              <div key={f.label} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-white/6 bg-white/3 text-center">
                <span style={{ color: f.color }}>{f.icon}</span>
                <span className="text-[10px] font-bold text-white/70">{f.label}</span>
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
            className="group w-full relative rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 border active:scale-[0.98] hover:scale-[1.01]"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.05))', borderColor: 'rgba(99,102,241,0.3)' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-indigo-400/25"
              style={{ background: 'rgba(99,102,241,0.2)' }}>
              <ScanLine className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-sm font-black text-white">تسجيل الدخول</p>
              <p className="text-[11px] text-white/50 mt-0.5">لديك حساب مسبق؟ ادخل مباشرة</p>
            </div>
            <ChevronLeftIcon />
          </button>

          {/* إنشاء حساب */}
          <button
            onClick={() => navigate('/wallet-lines/register')}
            className="group w-full relative rounded-2xl p-4 flex items-center gap-4 transition-all duration-300 border active:scale-[0.98] hover:scale-[1.01]"
            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03))', borderColor: 'rgba(34,197,94,0.25)' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-green-500/25"
              style={{ background: 'rgba(34,197,94,0.15)' }}>
              <Users className="w-6 h-6 text-green-400" />
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-sm font-black text-white">إنشاء حساب جديد</p>
              <p className="text-[11px] text-white/50 mt-0.5">سجّل مجانًا وابدأ الاستعلام</p>
            </div>
            <ChevronLeftIcon />
          </button>
        </div>

        {/* ملاحظة أمان */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl border border-white/6 bg-white/3">
          <ShieldCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-white/45 leading-relaxed">
            بياناتك محمية بالكامل ولا تُشارَك مع أي طرف ثالث. الاستعلام يتم بشكل آمن ومشفر.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <div className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center shrink-0 border border-white/10">
      <ArrowRight className="w-3.5 h-3.5 text-white/60 rotate-180" />
    </div>
  );
}
