// صفحة الشحن من رصيد أنا فودافون
// نظام مستقل تماماً — لا يؤثر على أي نظام موجود

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import {
  insertOperation, checkAndConsumeOperation, refundOperation,
  logActivity, insertSystemLog, sendNotification,
} from '@/lib/api';
import {
  checkRealConnectivity, enqueuePendingOp, markOpSynced, syncPendingOps,
} from '@/lib/pendingOpsQueue';
import type { OpsCheckResult } from '@/lib/api';
import {
  saveBalanceSession, getBalanceSession, clearBalanceSession,
  saveRememberedCredentials, getRememberedCredentials, clearRememberedCredentials,
  signOutBalance, sessionRemainingMinutes, sessionExpiryLabel, isBalanceSessionActive,
  getAllSessions, switchToSession, removeSession,
  sessionExpiryFullLabel, sessionProgressPercent, sessionRemainingLabel,
} from '@/lib/balanceSession';
import type { BalanceSession } from '@/lib/balanceSession';
import type { BalanceProduct } from '@/data/balanceProducts';
import { BALANCE_PRODUCTS_FALLBACK, mergeScriptLabels } from '@/data/balanceProducts';
import TrialExhaustedPopup from '@/components/TrialExhaustedPopup';
import { toast } from 'sonner';
import {
  Wallet, LogIn, LogOut, Phone, Lock, Eye, EyeOff,
  Zap, Loader2, CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, RefreshCw, Clock, Shield, User, Info,
  Users, Plus, Trash2, ChevronLeft, SwitchCamera,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useMerchantClient } from '@/contexts/MerchantClientContext';

// ── ألوان هوية التطبيق الأحمر/الأسود ──
const C = {
  red:         '#E60000',
  redLight:    'rgba(230,0,0,0.15)',
  redBorder:   'rgba(230,0,0,0.25)',
  redGlow:     'rgba(230,0,0,0.35)',
  redDeep:     '#c00000',
  bg:          '#080000',
  bgCard:      'rgba(255,255,255,0.03)',
  bgCardBorder:'rgba(255,255,255,0.07)',
  muted:       'rgba(255,255,255,0.45)',
  warning:     '#fbbf24',
  warningBg:   'rgba(251,191,36,0.08)',
  warningBd:   'rgba(251,191,36,0.25)',
  green:       '#4ade80',
  greenBg:     'rgba(74,222,128,0.10)',
  greenBd:     'rgba(74,222,128,0.22)',
};

// ══════════════════════════════════════════════════════════
// مكوّن: كارت منتج الشحن من الرصيد
// ══════════════════════════════════════════════════════════
function BalanceProductCard({ product, onSelect }: { product: BalanceProduct; onSelect: (p: BalanceProduct) => void }) {
  const isDisabled = !product.is_enabled;
  const isMared = product.category === 'mared';
  const cardColor = isMared ? '#cc2200' : C.red;

  return (
    <button
      className="relative w-full text-right rounded-2xl overflow-hidden transition-all active:scale-[0.97] disabled:opacity-40"
      style={{
        background: `linear-gradient(135deg, rgba(230,0,0,0.12), rgba(230,0,0,0.05))`,
        border: `1px solid rgba(230,0,0,0.22)`,
        boxShadow: `0 2px 14px rgba(230,0,0,0.10)`,
        padding: '12px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
      }}
      disabled={isDisabled}
      onClick={() => !isDisabled && onSelect(product)}
    >
      <div className="flex items-start justify-between gap-1 mb-2">
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
          style={{ background: C.redLight, color: cardColor }}>
          {isMared ? '🔥 مارد' : '⚡ فكة'}
        </span>
        {isDisabled && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive">متوقف</span>
        )}
      </div>
      <p className="text-base font-black leading-tight" style={{ color: C.red }}>
        {product.price} <span className="text-[10px] font-medium" style={{ color: C.muted }}>جنيه</span>
      </p>
      <p className="text-[11px] font-bold text-foreground/80 mt-0.5">
        {product.units_label ?? `${product.units} ${product.product_type}`}
      </p>
      <p className="text-[10px] mt-1" style={{ color: C.muted }}>{product.validity}</p>
      {product.net_charge_label && (
        <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          صافي: {product.net_charge_label === 'غير محدد' ? 'غير محدد' : `${product.net_charge_label} ج`}
        </p>
      )}
    </button>
  );
}

// ══════════════════════════════════════════════════════════
// مكوّن: كارت جلسة واحدة في لوحة الحسابات
// ══════════════════════════════════════════════════════════
function SessionAccountCard({
  session,
  isActive,
  onSwitch,
  onRemove,
  switching,
}: {
  session: BalanceSession;
  isActive: boolean;
  onSwitch: (phone: string) => void;
  onRemove: (phone: string) => void;
  switching: string | null;
}) {
  const progress = sessionProgressPercent(session);
  const remaining = sessionRemainingLabel(session);
  const expiryFull = new Date(session.expires_at).toLocaleString('ar-EG', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const isSwitching = switching === session.phone;
  const isExpiringSoon = (session.expires_at - Date.now()) < 60 * 60 * 1000; // أقل من ساعة

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        border: isActive ? `1.5px solid ${C.red}` : `1px solid rgba(255,255,255,0.08)`,
        background: isActive ? 'rgba(230,0,0,0.06)' : 'rgba(255,255,255,0.03)',
      }}
    >
      {/* معلومات الحساب */}
      <div className="p-3.5">
        <div className="flex items-center gap-3">
          {/* أيقونة الحساب */}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: isActive ? C.redLight : 'rgba(255,255,255,0.05)', border: `1px solid ${isActive ? C.redBorder : 'rgba(255,255,255,0.1)'}` }}>
            <User className="w-4 h-4" style={{ color: isActive ? C.red : C.muted }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-black font-mono text-white">{session.phone}</p>
              {isActive && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                  style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBd}` }}>
                  ● نشط
                </span>
              )}
            </div>
            {/* وقت الانتهاء */}
            <p className="text-[10px] mt-0.5" style={{ color: isExpiringSoon ? C.warning : C.muted }}>
              {isExpiringSoon ? '⚠️ ' : ''}ينتهي {expiryFull} · باقي {remaining}
            </p>
          </div>

          {/* زر الحذف */}
          <button
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
            style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.15)' }}
            onClick={() => onRemove(session.phone)}
          >
            <Trash2 className="w-3 h-3" style={{ color: 'rgba(230,0,0,0.6)' }} />
          </button>
        </div>

        {/* شريط التقدم (مدة الجلسة) */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px]" style={{ color: C.muted }}>مدة الجلسة (24 ساعة)</span>
            <span className="text-[9px] font-bold"
              style={{ color: isExpiringSoon ? C.warning : (progress > 75 ? '#f87171' : C.muted) }}>
              {100 - progress}% متبقي
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: isExpiringSoon
                  ? `linear-gradient(90deg,${C.warning},#f59e0b)`
                  : progress > 75
                    ? `linear-gradient(90deg,#f87171,${C.red})`
                    : `linear-gradient(90deg,${C.red},${C.redDeep})`,
              }}
            />
          </div>
        </div>
      </div>

      {/* زر التبديل (للحسابات غير النشطة) */}
      {!isActive && (
        <button
          className="w-full py-2.5 flex items-center justify-center gap-2 transition-all text-xs font-bold border-t"
          style={{ borderColor: 'rgba(255,255,255,0.06)', color: isSwitching ? C.muted : C.red }}
          disabled={!!switching}
          onClick={() => onSwitch(session.phone)}
        >
          {isSwitching
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />جاري تسجيل الدخول…</>
            : <><SwitchCamera className="w-3.5 h-3.5" />تبديل لهذا الحساب</>}
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// مكوّن: لوحة إدارة الحسابات (Sheet)
// ══════════════════════════════════════════════════════════
function AccountsPanel({
  open,
  onClose,
  activeSession,
  onSwitch,
  onAddAccount,
  onSignOutAll,
}: {
  open: boolean;
  onClose: () => void;
  activeSession: BalanceSession | null;
  onSwitch: (s: BalanceSession | null) => void;
  onAddAccount: () => void;
  onSignOutAll: () => void;
}) {
  const [sessions, setSessions] = useState<BalanceSession[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSessions(getAllSessions());
  }, [open]);

  const handleSwitch = async (phone: string) => {
    setSwitching(phone);
    await new Promise(r => setTimeout(r, 600)); // delay مؤكد للـ UX
    const s = switchToSession(phone);
    setSwitching(null);
    if (s) { onSwitch(s); onClose(); }
    // session is BalanceSession | null
    else toast.error('انتهت صلاحية هذه الجلسة — أعد تسجيل الدخول');
  };

  const handleRemove = (phone: string) => {
    removeSession(phone);
    setSessions(getAllSessions());
    if (activeSession?.phone === phone) onSwitch(null);
    toast.info(`تم حذف حساب ${phone}`);
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[85vw] max-w-[340px] p-0 border-0 flex flex-col"
        style={{ background: '#0a0000', borderLeft: `1px solid rgba(230,0,0,0.2)` }}
      >
        {/* هيدر اللوحة */}
        <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: 'rgba(230,0,0,0.12)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: C.redLight, border: `1px solid ${C.redBorder}` }}>
            <Users className="w-4 h-4" style={{ color: C.red }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">إدارة الحسابات</p>
            <p className="text-[10px]" style={{ color: C.muted }}>{sessions.length} حساب محفوظ · جلسات 24 ساعة</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* قائمة الحسابات */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" dir="rtl">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Users className="w-8 h-8" style={{ color: 'rgba(230,0,0,0.3)' }} />
              <p className="text-xs text-center" style={{ color: C.muted }}>لا توجد حسابات محفوظة</p>
            </div>
          ) : (
            sessions.map(s => (
              <SessionAccountCard
                key={s.phone}
                session={s}
                isActive={activeSession?.phone === s.phone}
                onSwitch={handleSwitch}
                onRemove={handleRemove}
                switching={switching}
              />
            ))
          )}
        </div>

        {/* أزرار الإجراءات */}
        <div className="p-4 border-t space-y-2.5" style={{ borderColor: 'rgba(230,0,0,0.10)' }}>
          {/* إضافة حساب جديد */}
          <button
            className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{ background: `linear-gradient(135deg,${C.red},${C.redDeep})`, color: '#fff', boxShadow: `0 0 20px ${C.redGlow}` }}
            onClick={() => { onClose(); setTimeout(onAddAccount, 200); }}
          >
            <Plus className="w-4 h-4" />إضافة حساب آخر
          </button>

          {/* تسجيل الخروج من الكل */}
          {sessions.length > 0 && (
            <button
              className="w-full h-9 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(230,0,0,0.07)', border: '1px solid rgba(230,0,0,0.15)', color: '#ff9999' }}
              onClick={() => { signOutBalance(); setSessions([]); onSignOutAll(); onClose(); }}
            >
              <LogOut className="w-3.5 h-3.5" />خروج من جميع الحسابات
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════════
// مكوّن: بانر معلومات القسم الثابت (PHASE 10) — يظهر دائماً
// ══════════════════════════════════════════════════════════
function SectionInfoBanner({ hasSession }: { hasSession: boolean }) {
  // PHASE 10: بانر مصغّر عند وجود جلسة، كامل بدونها
  if (hasSession) {
    return (
      <div className="mx-4 mt-3 flex items-center gap-2.5 p-3 rounded-xl"
        style={{ background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.18)' }}>
        <Phone className="w-4 h-4 shrink-0" style={{ color: '#60a5fa' }} />
        <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
          هذا القسم يشحن من <span className="font-black text-white">رصيد الهاتف مباشرة</span> وليس من Vodafone Cash.
          سيُخصَم مبلغ الكارت من رصيد الخط.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-4 mt-4 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(230,0,0,0.2)` }}>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: C.redLight, border: `1px solid ${C.redBorder}` }}>
            <Phone className="w-5 h-5" style={{ color: C.red }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-white">الشحن من رصيد الهاتف مباشرة</p>
            <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: C.muted }}>
              هذا القسم يخصم قيمة الكارت من رصيد الخط — <span className="font-bold" style={{ color: C.red }}>لا يستخدم Vodafone Cash</span>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Zap className="w-3.5 h-3.5" style={{ color: C.red }} />, text: 'شحن فوري' },
            { icon: <Clock className="w-3.5 h-3.5" style={{ color: C.warning }} />, text: 'جلسة 24 ساعة' },
            { icon: <Users className="w-3.5 h-3.5" style={{ color: '#60a5fa' }} />, text: 'حسابات متعددة' },
          ].map((f, i) => (
            <div key={i} className="flex flex-col items-center gap-1 p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {f.icon}
              <span className="text-[9px] font-bold text-center" style={{ color: C.muted }}>{f.text}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 p-3 rounded-xl"
          style={{ background: C.warningBg, border: `1px solid ${C.warningBd}` }}>
          <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.warning }} />
          <div className="space-y-1">
            <p className="text-[10px] font-black" style={{ color: C.warning }}>قبل البدء تأكد من:</p>
            <ul className="space-y-0.5">
              {[
                'امتلاك حساب أنا فودافون نشط',
                'وجود رصيد كافٍ على الخط',
                'الاتصال بشبكة فودافون',
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="text-[8px] font-black" style={{ color: C.warning }}>•</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// مكوّن: بطاقة الانتقال لـ Vodafone Cash (PHASE 9)
// ══════════════════════════════════════════════════════════
function VodafoneCashCard({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="mx-4 mb-4 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(230,0,0,0.1)', border: '1px solid rgba(230,0,0,0.2)' }}>
          <Wallet className="w-5 h-5" style={{ color: C.red }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-white">هل تريد الشحن بـ Vodafone Cash؟</p>
          <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: C.muted }}>
            إذا كنت تفضل الشحن من المحفظة فهو أسرع وأسهل.
          </p>
        </div>
        <button
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold transition-all active:scale-[0.96]"
          style={{ background: C.redLight, border: `1px solid ${C.redBorder}`, color: C.red }}
          onClick={onNavigate}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          الانتقال
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// مكوّن: كارت الجلسة المحسَّن
// ══════════════════════════════════════════════════════════
function SessionCard({ session, allCount, onManageAccounts }: {
  session: BalanceSession;
  allCount: number;
  onManageAccounts: () => void;
}) {
  const progress   = sessionProgressPercent(session);
  const remaining  = sessionRemainingLabel(session);
  const expiryFull = sessionExpiryFullLabel();
  const mins       = sessionRemainingMinutes();
  const isWarn     = mins < 60;

  return (
    <div className="mx-4 mt-4 rounded-2xl overflow-hidden"
      style={{ border: `1.5px solid rgba(230,0,0,0.3)`, background: 'rgba(255,255,255,0.03)' }}>

      {/* رأس: الحساب النشط */}
      <div className="p-4 border-b" style={{ borderColor: 'rgba(230,0,0,0.10)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: C.redLight, border: `1px solid ${C.redBorder}` }}>
            <Shield className="w-5 h-5" style={{ color: C.red }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-black" style={{ color: C.red }}>الشحن من رصيد أنا فودافون</p>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBd}` }}>
                ● جلسة نشطة
              </span>
            </div>
            <p className="text-[11px] mt-0.5 font-mono font-bold text-white">{session.phone}</p>
          </div>

          {/* زر الحسابات */}
          <button
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold shrink-0 transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
            onClick={onManageAccounts}
          >
            <Users className="w-3 h-3" />
            <span>الحسابات</span>
            {allCount > 1 && (
              <span className="px-1 rounded-full text-[8px] font-black"
                style={{ background: C.redLight, color: C.red }}>{allCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* تفاصيل مدة الجلسة */}
      <div className="p-4 space-y-3">
        {/* شريط الوقت */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" style={{ color: isWarn ? C.warning : C.muted }} />
              <span className="text-[11px] font-bold" style={{ color: isWarn ? C.warning : 'rgba(255,255,255,0.8)' }}>
                {isWarn ? `⚠️ تنتهي خلال ${remaining}` : `باقي على الجلسة ${remaining}`}
              </span>
            </div>
            <span className="text-[10px]" style={{ color: C.muted }}>{100 - progress}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: isWarn
                  ? `linear-gradient(90deg,${C.warning},#f59e0b)`
                  : `linear-gradient(90deg,${C.red},${C.redDeep})`,
              }} />
          </div>
          <p className="text-[10px]" style={{ color: C.muted }}>
            ينتهي: {expiryFull}
          </p>
        </div>

        {/* التعليمات */}
        <div className="space-y-1.5">
          {[
            'تأكد من تسجيل الدخول بحساب أنا فودافون الصحيح',
            'تأكد من وجود رصيد كافٍ على الخط',
            'سيتم خصم قيمة الكارت مباشرة من رصيد الهاتف بالسعر القديم',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: C.redLight, border: `1px solid ${C.redBorder}` }}>
                <span className="text-[8px] font-black" style={{ color: C.red }}>{i + 1}</span>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: C.muted }}>{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Dialog: تسجيل الدخول بأنا فودافون
// ══════════════════════════════════════════════════════════
function BalanceLoginDialog({
  open, onClose, onLoginSuccess,
}: {
  open: boolean; onClose: () => void; onLoginSuccess: (s: BalanceSession) => void;
}) {
  const creds = getRememberedCredentials();
  const [phone, setPhone]         = useState(creds?.phone ?? '');
  const [password, setPassword]   = useState(creds?.password ?? '');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(!!creds);

  const handleLogin = async () => {
    const trimPhone = phone.trim();
    const trimPass  = password.trim();
    if (!trimPhone.startsWith('01') || trimPhone.length !== 11) {
      setError('رقم الهاتف غير صحيح — 11 رقم يبدأ بـ 01'); return;
    }
    if (!trimPass) { setError('أدخل كلمة المرور'); return; }
    setLoading(true); setError(null);

    // استخدام fetch() مباشر بدلاً من supabase.functions.invoke لتجاوز CapacitorHttp
    // تمرير Authorization header مطلوب من قِبَل edge function للتحقق من هوية المستخدم
    const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const authSession  = (await supabase.auth.getSession()).data.session;
    const authToken    = authSession?.access_token ?? '';
    type LoginResult = { success: boolean; access_token?: string; expires_in?: number; error?: string; };
    let data: LoginResult | null = null;
    let loginNetworkErr = false;
    try {
      const ctrl = new AbortController();
      const timerId = setTimeout(() => ctrl.abort(), 20_000);
      const res = await fetch(`${supabaseUrl}/functions/v1/ana-balance-login`, {
        method: 'POST', signal: ctrl.signal,
        headers: {
          'Content-Type':  'application/json',
          'apikey':        supabaseAnon,
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ phone: trimPhone, password: trimPass }),
      });
      clearTimeout(timerId);
      const txt = await res.text();
      try { data = JSON.parse(txt) as LoginResult; } catch { loginNetworkErr = true; }
    } catch { loginNetworkErr = true; }

    if (loginNetworkErr || !data?.success || !data.access_token) {
      const errText = loginNetworkErr ? 'تعذر الاتصال بالخادم — تأكد من الإنترنت'
        : (data?.error ?? 'رقم الهاتف أو كلمة المرور غير صحيحة');
      setError(errText); setLoading(false); return;
    }

    const session: BalanceSession = {
      access_token: data.access_token,
      refresh_token: '',
      phone: trimPhone, msisdn: trimPhone,
      expires_at: Date.now() + (data.expires_in ?? 86400) * 1000,
      created_at: Date.now(),
    };
    saveBalanceSession(session);
    if (rememberMe) saveRememberedCredentials(trimPhone, trimPass);
    else clearRememberedCredentials();
    setLoading(false);
    toast.success('✅ تم تسجيل الدخول بنجاح!', { description: `مرحباً: ${trimPhone}` });
    onLoginSuccess(session);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !loading) onClose(); }}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] w-[92vw] md:max-w-[420px] p-0 border-0 gap-0 max-h-[90dvh] overflow-y-auto"
        style={{ background: '#0d0000', border: `1px solid ${C.redBorder}`, borderRadius: 20 }}
        dir="rtl"
      >
        <div className="p-5 pb-3 border-b" style={{ borderColor: 'rgba(230,0,0,0.12)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: C.redLight, border: `1px solid ${C.redBorder}` }}>
              <LogIn className="w-5 h-5" style={{ color: C.red }} />
            </div>
            <div>
              <p className="text-sm font-black text-white">تسجيل الدخول</p>
              <p className="text-[11px]" style={{ color: C.muted }}>أنا فودافون · جلسة 24 ساعة</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: C.muted }}>رقم الهاتف</label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
              <input
                className="w-full h-11 rounded-xl pr-9 pl-3 text-sm font-medium outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                placeholder="01XXXXXXXXX" type="tel" inputMode="numeric" maxLength={11}
                value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                disabled={loading} dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: C.muted }}>كلمة المرور</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
              <input
                className="w-full h-11 rounded-xl pr-9 pl-10 text-sm font-medium outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                placeholder="••••••••" type={showPass ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                disabled={loading}
              />
              <button className="absolute left-3 top-1/2 -translate-y-1/2" onClick={() => setShowPass(v => !v)} type="button">
                {showPass ? <EyeOff className="w-4 h-4" style={{ color: C.muted }} /> : <Eye className="w-4 h-4" style={{ color: C.muted }} />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all"
              style={{ background: rememberMe ? C.red : 'rgba(255,255,255,0.06)', border: `1px solid ${rememberMe ? C.red : 'rgba(255,255,255,0.15)'}` }}
              onClick={() => setRememberMe(v => !v)}
            >
              {rememberMe && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <span className="text-xs" style={{ color: C.muted }}>تذكر بياناتي (7 أيام)</span>
          </label>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl"
              style={{ background: 'rgba(230,0,0,0.08)', border: '1px solid rgba(230,0,0,0.2)' }}>
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.red }} />
              <p className="text-xs leading-relaxed" style={{ color: '#ff8888' }}>{error}</p>
            </div>
          )}

          <button
            className="w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{
              background: loading ? 'rgba(230,0,0,0.1)' : `linear-gradient(135deg,${C.red},${C.redDeep})`,
              boxShadow: loading ? 'none' : `0 0 28px ${C.redGlow}`,
              color: '#fff', border: `1px solid ${C.redBorder}`,
            }}
            disabled={loading}
            onClick={handleLogin}
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />جارٍ تسجيل الدخول…</> : <><LogIn className="w-4 h-4" />دخول</>}
          </button>

          <p className="text-[10px] text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <Shield className="w-3 h-3 inline ml-1" />
            بيانات الدخول مشفّرة · الجلسة تستمر 24 ساعة تلقائياً
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════
// PHASE 2: خريطة أخطاء السيرفر → رسائل عربية واضحة
// ══════════════════════════════════════════════════════════
function mapServerError(raw: string | null | undefined): {
  title: string; reason: string; solution: string; isBalanceError: boolean; isSessionError: boolean;
} {
  const s = (raw ?? '').toLowerCase();
  // رصيد غير كافٍ
  if (s.includes('رصيد غير كافٍ') || s.includes('رصيد') || s.includes('insufficient') || s.includes('2252') || s.includes('6051')) {
    return {
      title: 'لا يوجد رصيد كافٍ',
      reason: 'لا يوجد رصيد كافٍ على الخط المستخدم للشحن.',
      solution: 'يرجى التأكد من وجود رصيد كافٍ على الخط ثم أعد المحاولة، أو اشحن الخط أولاً.',
      isBalanceError: true, isSessionError: false,
    };
  }
  // جلسة منتهية
  if (s.includes('انتهت صلاحية') || s.includes('token') || s.includes('expired') || s.includes('session') || s.includes('401')) {
    return {
      title: 'انتهت صلاحية الجلسة',
      reason: 'انتهت صلاحية جلسة تسجيل الدخول.',
      solution: 'يرجى تسجيل الدخول مرة أخرى للمتابعة.',
      isBalanceError: false, isSessionError: true,
    };
  }
  // فشل تسجيل دخول
  if (s.includes('login') || s.includes('password') || s.includes('incorrect') || s.includes('كلمة المرور') || s.includes('رقم الهاتف')) {
    return {
      title: 'فشل تسجيل الدخول',
      reason: 'بيانات الدخول غير صحيحة.',
      solution: 'تأكد من رقم الهاتف وكلمة المرور ثم حاول مجدداً.',
      isBalanceError: false, isSessionError: false,
    };
  }
  // خطأ شبكة
  if (s.includes('network') || s.includes('fetch') || s.includes('اتصال') || s.includes('خادم') || s.includes('timeout')) {
    return {
      title: 'تعذر الاتصال',
      reason: 'تعذر الاتصال بالخادم.',
      solution: 'تأكد من اتصالك بالإنترنت ثم أعد المحاولة.',
      isBalanceError: false, isSessionError: false,
    };
  }
  // رقم غير مسجل
  if (s.includes('unregistered') || s.includes('غير مسجّل') || s.includes('1051')) {
    return {
      title: 'رقم غير مسجّل',
      reason: 'رقمك غير مسجّل في خدمة أنا فودافون.',
      solution: 'فعّل خدمة أنا فودافون أولاً ثم أعد المحاولة.',
      isBalanceError: false, isSessionError: false,
    };
  }
  // خطأ مؤقت فودافون
  if (s.includes('3999') || s.includes('مؤقت') || s.includes('خوادم فودافون')) {
    return {
      title: 'خطأ مؤقت',
      reason: 'خطأ مؤقت من خوادم فودافون.',
      solution: 'أعد المحاولة بعد ثوانٍ قليلة.',
      isBalanceError: false, isSessionError: false,
    };
  }
  // خطأ عام
  return {
    title: 'حدث خطأ',
    reason: raw ? raw.replace(/^[❌💳⚠️🔑📵]\s*/u, '') : 'حدث خطأ غير متوقع.',
    solution: 'يرجى إعادة المحاولة لاحقاً.',
    isBalanceError: false, isSessionError: false,
  };
}

// ══════════════════════════════════════════════════════════
// PHASE 8: بطاقة تفاصيل الفشل الاحترافية
// ══════════════════════════════════════════════════════════
function ErrorDetailCard({
  errorRaw, opTime, onRetry, onReLogin, cooldownLeft, submitting,
}: {
  errorRaw: string; opTime: string | null;
  onRetry: () => void; onReLogin: () => void;
  cooldownLeft: number; submitting: boolean;
}) {
  const info = mapServerError(errorRaw);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid rgba(230,0,0,0.25)`, background: 'rgba(20,0,0,0.6)' }}>
      {/* رأس البطاقة */}
      <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'rgba(230,0,0,0.12)', background: 'rgba(230,0,0,0.06)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.3)' }}>
          <XCircle className="w-5 h-5" style={{ color: C.red }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black" style={{ color: '#ff6666' }}>{info.title}</p>
          <p className="text-[10px]" style={{ color: C.muted }}>فشلت عملية الشحن من الرصيد</p>
        </div>
        <span className="text-[9px] font-black px-2 py-1 rounded-full"
          style={{ background: 'rgba(230,0,0,0.15)', color: C.red }}>فشل</span>
      </div>

      {/* تفاصيل الخطأ */}
      <div className="p-4 space-y-3">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: C.warning }} />
            <div>
              <p className="text-[10px] font-black" style={{ color: C.warning }}>سبب الفشل</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{info.reason}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: C.green }} />
            <div>
              <p className="text-[10px] font-black" style={{ color: C.green }}>الحل المقترح</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{info.solution}</p>
            </div>
          </div>
        </div>

        {/* وقت العملية */}
        {opTime && (
          <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <Clock className="w-3 h-3" style={{ color: C.muted }} />
            <span className="text-[10px]" style={{ color: C.muted }}>وقت المحاولة: {opTime}</span>
          </div>
        )}

        {/* زر إعادة المحاولة */}
        {!info.isSessionError ? (
          <button
            className="w-full h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{
              background: cooldownLeft > 0 || submitting ? 'rgba(255,255,255,0.05)' : C.redLight,
              border: `1px solid ${cooldownLeft > 0 || submitting ? 'rgba(255,255,255,0.1)' : C.redBorder}`,
              color: cooldownLeft > 0 || submitting ? C.muted : C.red,
            }}
            disabled={cooldownLeft > 0 || submitting}
            onClick={onRetry}
          >
            {cooldownLeft > 0
              ? <><Clock className="w-3.5 h-3.5" />أعد المحاولة بعد {cooldownLeft}ث</>
              : submitting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />جارٍ الشحن…</>
                : <><RefreshCw className="w-3.5 h-3.5" />إعادة المحاولة</>}
          </button>
        ) : (
          <button
            className="w-full h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{ background: C.redLight, border: `1px solid ${C.redBorder}`, color: C.red }}
            onClick={onReLogin}
          >
            <LogIn className="w-3.5 h-3.5" />تسجيل الدخول مجدداً
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// Dialog: تأكيد وتنفيذ الشحن — محسَّن (PHASES 3,4,5,7,8,12,14)
// ══════════════════════════════════════════════════════════
function BalanceExecuteDialog({
  open, onClose, onSuccess, product, session, onSessionExpired,
}: {
  open: boolean; onClose: () => void; onSuccess: () => void;
  product: BalanceProduct | null; session: BalanceSession | null;
  onSessionExpired: () => void;
}) {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  // PHASE 3: مرحلتان — عرض التفاصيل أولاً ثم تأكيد
  const [step, setStep]                   = useState<'details' | 'executing' | 'error'>('details');
  const [submitting, setSubmitting]       = useState(false);
  const [lastError, setLastError]         = useState<string | null>(null);
  const [opTime, setOpTime]               = useState<string | null>(null);
  const [trialExhausted, setTrialExhausted] = useState(false);
  const [trialOpsUsed, setTrialOpsUsed]   = useState(0);
  const [trialMaxOps, setTrialMaxOps]     = useState(0);

  // PHASE 5: Cooldown بعد فشل رصيد
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft]   = useState(0);

  const executingRef = useRef(false);
  const abortRef     = useRef<AbortController | null>(null);
  const receiverPhone = session?.phone ?? '';

  // إعادة ضبط عند فتح الـ Dialog
  useEffect(() => {
    if (open) { setStep('details'); setLastError(null); setOpTime(null); setCooldownUntil(0); setCooldownLeft(0); }
  }, [open]);

  // عداد الـ Cooldown
  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left === 0) setCooldownUntil(0);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const handleExecute = async () => {
    if (!user || !product || !session || !receiverPhone) return;
    if (executingRef.current) return;
    if (cooldownLeft > 0) return;

    // ══ SECURITY GATE 1: فحص اتصال حقيقي بالسيرفر (ليس navigator.onLine فقط) ══
    // navigator.onLine يُرجع true حتى لو الشبكة لا تصل للسيرفر.
    // نفحص ping حقيقي لـ Supabase قبل أي خطوة — بدون اتصال = توقف فوري.
    const isConnected = await checkRealConnectivity();
    if (!isConnected) {
      setLastError('لا يوجد اتصال بالإنترنت\n\nتأكد من تشغيل بيانات شريحة Vodafone Cash\nثم أعد المحاولة');
      setStep('error');
      setOpTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
      return;
    }

    if (!isBalanceSessionActive()) {
      clearBalanceSession();
      toast.error('انتهت صلاحية جلسة تسجيل الدخول — يرجى تسجيل الدخول مرة أخرى');
      onSessionExpired(); return;
    }

    executingRef.current = true;
    abortRef.current = new AbortController();
    setSubmitting(true); setLastError(null);
    setStep('executing');

    if (!isAdmin) {
      const opsCheck: OpsCheckResult = await checkAndConsumeOperation(user.id);
      if (!opsCheck.allowed) {
        setTrialOpsUsed(opsCheck.opsUsed ?? 0);
        setTrialMaxOps(opsCheck.opsLimit ?? 0);
        setTrialExhausted(true);
        setSubmitting(false); executingRef.current = false;
        setStep('details'); return;
      }
    }

    // ══ SECURITY GATE 2: توليد UUID فريد قبل الاتصال — يمنع التكرار ══
    const txUuid = crypto.randomUUID();
    const performedAt = new Date().toISOString();

    // ══ SECURITY GATE 3: حفظ العملية محلياً قبل أي اتصال ══
    // هذا يضمن عدم فقدان العملية حتى لو انقطع الإنترنت أثناء الاستجابة.
    enqueuePendingOp({
      uuid:             txUuid,
      created_at:       performedAt,
      user_id:          user.id,
      phone_number:     receiverPhone,
      card_type:        product.display_name,
      card_data: {
        product_id:       product.product_id,
        price:            product.price,
        units_label:      product.units_label,
        net_charge_label: product.net_charge_label,
        validity:         product.validity,
        source:           'ana_vodafone_balance',
        tx_uuid:          txUuid,
      },
      category:         product.category === 'fakka' ? 'فكة' : 'مارد',
      amount:           product.price,
      charge_success:   false, // سيُحدَّث بعد تأكيد السيرفر
      error_message:    null,
      performed_at:     performedAt,
      api_response:     null,
      operation_source: 'ana_vodafone_balance',
    });

    // ══ استدعاء Edge Function بـ fetch() مباشر بدلاً من supabase.functions.invoke ══
    // السبب: CapacitorHttp يعمل intercept لـ fetch() ويتسبب في fnErr مع supabase-js
    // الحل: استخدام fetch() المباشر مع تحديد كل headers يدوياً + timeout صريح
    const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const authToken    = (await supabase.auth.getSession()).data.session?.access_token ?? '';

    type ChargeResult = { success: boolean; error?: string; session_expired?: boolean; operation_number?: number | null; registered?: boolean; };
    let data: ChargeResult | null = null;
    let fetchErrorMsg: string | null = null;

    try {
      const ctrl = new AbortController();
      const timerId = setTimeout(() => ctrl.abort(), 30_000); // 30 ثانية timeout
      const res = await fetch(`${supabaseUrl}/functions/v1/ana-balance-charge`, {
        method:  'POST',
        signal:  ctrl.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey':        supabaseAnon,
        },
        body: JSON.stringify({
          product_id:   product.product_id,
          receiver:     receiverPhone,
          access_token: session.access_token,
          msisdn:       session.msisdn,
          tx_uuid:      txUuid,
        }),
      });
      clearTimeout(timerId);
      const txt = await res.text();
      try { data = JSON.parse(txt) as ChargeResult; }
      catch { fetchErrorMsg = `استجابة غير صالحة من الخادم (${res.status})`; }
    } catch (fetchErr: unknown) {
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        fetchErrorMsg = 'انتهت مهلة الاتصال — تأكد من الإنترنت وأعد المحاولة';
      } else {
        fetchErrorMsg = 'تعذر الاتصال بالخادم — تأكد من الإنترنت وأعد المحاولة';
      }
    }

    const now = new Date();
    const timeLabel = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    setOpTime(timeLabel);

    let success = false;
    let errorMsg: string | null = null;

    if (fetchErrorMsg) {
      errorMsg = fetchErrorMsg;
    } else if (!data?.success) {
      errorMsg = data?.error ?? 'فشل الشحن من الرصيد';
      if (data?.session_expired) {
        clearBalanceSession();
        toast.error('انتهت صلاحية جلسة تسجيل الدخول — يرجى تسجيل الدخول مرة أخرى');
        setSubmitting(false); executingRef.current = false; onSessionExpired(); return;
      }
    } else { success = true; }

    if (!success && errorMsg) {
      const errInfo = mapServerError(errorMsg);
      if (errInfo.isBalanceError) setCooldownUntil(Date.now() + 30_000);
    }

    // ══ SECURITY GATE 4: السيرفر سجّل العملية (registered=true) → احذفها من القائمة ══
    const serverRegistered = data?.registered === true;
    if (serverRegistered) {
      markOpSynced(txUuid); // العملية مسجّلة سيرفر-سايد — لا حاجة للـ queue
    }

    if (!serverRegistered) {
      const { error: opErr, data: opData } = await insertOperation({
        user_id:          user.id,
        phone_number:     receiverPhone,
        card_type:        product.display_name,
        card_data: {
          product_id:       product.product_id,
          price:            product.price,
          units_label:      product.units_label,
          net_charge_label: product.net_charge_label,
          validity:         product.validity,
          source:           'ana_vodafone_balance',
          tx_uuid:          txUuid, // idempotency: منع التسجيل المزدوج
        } as Record<string, unknown>,
        category:         product.category === 'fakka' ? 'فكة' : 'مارد',
        amount:           product.price,
        status:           success ? 'success' : 'failed',
        error_message:    errorMsg ?? null,
        performed_at:     performedAt,
        api_response:     success ? 'Completed via AnaVodafone Balance' : (errorMsg?.split('\n')[0] ?? null),
        operation_source: 'ana_vodafone_balance',
        idempotency_key:  txUuid,
      } as Parameters<typeof insertOperation>[0]);

      if (opErr) {
        // ══ SECURITY GATE 5: فشل التسجيل — العملية محفوظة في queue ستُزامَن تلقائياً ══
        // لا تُرسَل رسالة "سيُسجَّل لاحقاً" إلا إذا كان الشحن ناجحاً فعلاً
        if (success) {
          toast.warning('✅ تم الشحن — جارٍ حفظ السجل، سيظهر تلقائياً عند استقرار الاتصال', { duration: 10000 });
          // العملية في queue وستُزامَن عند رجوع الإنترنت
        } else {
          await refundOperation(user.id);
          markOpSynced(txUuid); // إلغاء queue لأن الشحن فاشل والعملية مُستردة
          toast.error('⚠️ فشل تسجيل العملية — تم استرداد العملية');
        }
        setSubmitting(false); executingRef.current = false; return;
      }
      // تسجيل ناجح → احذف من queue
      markOpSynced(txUuid);
      if (!success && !isAdmin) await refundOperation(user.id);

      const clientOpNumber = (opData as { operation_number?: number } | null)?.operation_number ?? null;
      const dateLabel = new Date(performedAt).toLocaleDateString('en-GB');
      const username2 = profile?.username ?? user.email ?? 'المستخدم';
      await Promise.all([
        logActivity(user.id, 'recharge',
          success ? `شحن ناجح (رصيد أنا فودافون) — ${product.display_name}` : `شحن فاشل (رصيد أنا فودافون) — ${product.display_name}`,
          `الرقم: ${receiverPhone} | المبلغ: ${product.price} جنيه${clientOpNumber != null ? ` | #${clientOpNumber}` : ''}`,
          { product_id: product.product_id, phone: receiverPhone, amount: product.price, status: success ? 'success' : 'failed', operation_source: 'ana_vodafone_balance', operation_number: clientOpNumber }
        ),
        insertSystemLog({
          user_id: user.id, level: success ? 'info' : 'warning',
          action: success ? 'balance_recharge_success' : 'balance_recharge_failed',
          message: success
            ? `شحن ناجح (رصيد) — ${product.display_name} — ${receiverPhone}`
            : `شحن فاشل (رصيد) — ${product.display_name} — ${receiverPhone} — ${(errorMsg ?? '').split('\n')[0]}`,
          metadata: { product_id: product.product_id, phone: receiverPhone, amount: product.price, operation_source: 'ana_vodafone_balance', operation_number: clientOpNumber },
        }),
        sendNotification({
          user_id: user.id,
          title: success ? `✅ تم شحن ${product.display_name} (رصيد أنا فودافون)` : `❌ فشل الشحن (رصيد) — ${product.display_name}`,
          body: success
            ? `المستخدم: ${username2}\nالرقم: ${receiverPhone}${clientOpNumber != null ? `\nرقم العملية: #${clientOpNumber}` : ''}\nالتاريخ: ${dateLabel}\nالوقت: ${timeLabel}\nالحالة: ناجحة`
            : `المستخدم: ${username2}\nالرقم: ${receiverPhone}\nالتاريخ: ${dateLabel}\nالوقت: ${timeLabel}\nالسبب: ${(errorMsg ?? 'فشل').split('\n')[0]}`,
          type: 'operation', is_global: false,
        }),
      ]).catch(() => {});
      try {
        const upd = success
          ? { usage_count: (product.usage_count ?? 0) + 1, success_count: (product.success_count ?? 0) + 1, last_used_at: performedAt }
          : { usage_count: (product.usage_count ?? 0) + 1, fail_count: (product.fail_count ?? 0) + 1, last_used_at: performedAt };
        await supabase.from('balance_products').update(upd).eq('product_id', product.product_id);
      } catch { /* no-op */ }
      setSubmitting(false); executingRef.current = false;
      if (success) { toast.success('✅ تم الشحن بنجاح!', { description: `${product.display_name} — ${product.price} جنيه`, duration: 5000 }); onSuccess(); onClose(); }
      else { setLastError(errorMsg ?? 'فشل الشحن'); setStep('error'); toast.error('❌ فشل الشحن من الرصيد', { description: mapServerError(errorMsg).reason, duration: 8000 }); }
      return;
    }

    // مسار سيرفر-سايد
    if (!success && !isAdmin) await refundOperation(user.id);
    try {
      const upd = success
        ? { usage_count: (product.usage_count ?? 0) + 1, success_count: (product.success_count ?? 0) + 1, last_used_at: now.toISOString() }
        : { usage_count: (product.usage_count ?? 0) + 1, fail_count: (product.fail_count ?? 0) + 1, last_used_at: now.toISOString() };
      await supabase.from('balance_products').update(upd).eq('product_id', product.product_id);
    } catch { /* no-op */ }

    setSubmitting(false); executingRef.current = false;
    if (success) {
      toast.success('✅ تم الشحن بنجاح!', { description: `${product.display_name} — ${product.price} جنيه`, duration: 5000 });
      onSuccess(); onClose();
    } else {
      setLastError(errorMsg ?? 'فشل الشحن'); setStep('error');
      toast.error('❌ فشل الشحن من الرصيد', { description: mapServerError(errorMsg).reason, duration: 8000 });
    }
  };

  const handleClose = () => { if (!submitting) onClose(); };
  const handleReLogin = () => { clearBalanceSession(); onSessionExpired(); onClose(); };

  if (!product || !session) return null;

  // PHASE 12: تفاصيل العملية الكاملة
  const details = [
    { label: 'اسم الكارت',      value: product.display_name },
    { label: 'السعر',            value: `${product.price} جنيه` },
    { label: 'الرصيد الصافي',   value: product.net_charge_label === 'غير محدد' ? 'غير محدد' : product.net_charge_label ? `${product.net_charge_label} جنيه` : '—' },
    { label: 'الوحدات',          value: product.units_label ?? '—' },
    { label: 'الصلاحية',         value: product.validity },
    { label: 'رقم الشحن',        value: receiverPhone },
    { label: 'طريقة الدفع',      value: 'رصيد الهاتف' },     // PHASE 12
  ];

  return (
    <>
      <TrialExhaustedPopup open={trialExhausted} opsUsed={trialOpsUsed} maxOps={trialMaxOps} />
      <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] w-[92vw] md:max-w-[440px] p-0 border-0 gap-0 max-h-[90dvh] overflow-y-auto"
          style={{ background: '#0d0000', border: `1px solid ${C.redBorder}`, borderRadius: 20 }}
          dir="rtl"
        >
          {/* هيدر */}
          <div className="p-5 pb-3 border-b" style={{ borderColor: 'rgba(230,0,0,0.12)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: C.redLight, border: `1px solid ${C.redBorder}` }}>
                {step === 'error'
                  ? <XCircle className="w-5 h-5" style={{ color: C.red }} />
                  : step === 'executing'
                    ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.red }} />
                    : <Zap className="w-5 h-5" style={{ color: C.red }} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-white truncate">{product.display_name}</p>
                <p className="text-[11px]" style={{ color: C.muted }}>
                  {step === 'error' ? 'فشلت عملية الشحن' : step === 'executing' ? 'جارٍ الشحن…' : 'تأكيد الشحن من رصيد الهاتف'}
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">

            {/* ── مرحلة التفاصيل + التأكيد (PHASE 3) ── */}
            {(step === 'details') && (
              <>
                {/* PHASE 10: بانر توضيحي مصغّر داخل الـ Dialog */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl"
                  style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                  <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#60a5fa' }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    سيتم خصم قيمة الكارت مباشرةً من <span className="font-black text-white">رصيد الخط</span> وليس من محفظة Vodafone Cash.
                  </p>
                </div>

                {/* جدول التفاصيل */}
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.bgCardBorder}`, background: C.bgCard }}>
                  {details.map((row, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b last:border-b-0"
                      style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <span className="text-xs" style={{ color: C.muted }}>{row.label}</span>
                      <span
                        className={`text-xs font-bold ${row.label === 'رقم الشحن' ? 'font-mono' : ''}`}
                        style={{
                          color: row.label === 'السعر' ? C.red
                            : row.label === 'طريقة الدفع' ? C.warning
                            : '#fff',
                        }}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* PHASE 3: تأكيد قبل التنفيذ */}
                <div className="rounded-xl p-3.5 space-y-2" style={{ background: C.warningBg, border: `1px solid ${C.warningBd}` }}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: C.warning }} />
                    <p className="text-xs font-black" style={{ color: C.warning }}>هل أنت متأكد من تنفيذ عملية الشحن؟</p>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    سيتم خصم <span className="font-black text-white">{product.price} جنيه</span> من رصيد الخط الحالي.
                  </p>
                  <ul className="space-y-1">
                    {['وجود رصيد كافٍ على الخط.', 'أن الخط الحالي هو نفس الخط المسجل.', 'أن الخدمة تعمل بشكل طبيعي.'].map((item, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="text-[8px] font-black" style={{ color: C.warning }}>✔</span>
                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* أزرار التأكيد / الإلغاء */}
                <div className="flex gap-2.5">
                  <button
                    className="flex-1 h-11 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
                    onClick={handleClose}
                  >
                    إلغاء
                  </button>
                  <button
                    className="flex-[2] h-11 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                    style={{
                      background: `linear-gradient(135deg,${C.red},${C.redDeep})`,
                      boxShadow: `0 0 24px ${C.redGlow}`,
                      color: '#fff', border: `1px solid ${C.redBorder}`,
                    }}
                    onClick={handleExecute}
                  >
                    <Zap className="w-4 h-4" />تأكيد الشحن
                  </button>
                </div>
              </>
            )}

            {/* ── مرحلة التنفيذ ── */}
            {step === 'executing' && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: C.redLight, border: `1px solid ${C.redBorder}` }}>
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: C.red }} />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-black text-white">جارٍ الشحن من رصيد الهاتف…</p>
                  <p className="text-xs" style={{ color: C.muted }}>لا تغلق هذه النافذة</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    يتم خصم {product.price} جنيه من رصيد خط {receiverPhone}
                  </p>
                </div>
              </div>
            )}

            {/* ── مرحلة الخطأ (PHASE 8) ── */}
            {step === 'error' && lastError && (
              <>
                <ErrorDetailCard
                  errorRaw={lastError}
                  opTime={opTime}
                  onRetry={() => { setStep('details'); setLastError(null); }}
                  onReLogin={handleReLogin}
                  cooldownLeft={cooldownLeft}
                  submitting={submitting}
                />
                {/* PHASE 5: رسالة cooldown واضحة */}
                {cooldownLeft > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-xl"
                    style={{ background: C.warningBg, border: `1px solid ${C.warningBd}` }}>
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.warning }} />
                    <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      لا يوجد رصيد كافٍ على خطك. يرجى شحن الخط أولاً ثم إعادة المحاولة.
                      سيُتاح زر إعادة المحاولة خلال <span className="font-black text-white">{cooldownLeft}</span> ثانية.
                    </p>
                  </div>
                )}
              </>
            )}

            {step !== 'executing' && (
              <p className="text-[10px] text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.25)' }}>
                <Shield className="w-3 h-3 inline ml-1" />
                الشحن يتم من رصيد رقم {receiverPhone} مباشرة — لا علاقة لـ Vodafone Cash
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ══════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ══════════════════════════════════════════════════════════
export default function BalanceChargePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const isMerchantClient = !!(profile?.merchant_id && profile.role === 'user');

  // ── بيانات أهلية التاجر — من Context المشترك (محمّل مسبقاً في MerchantClientLayout) ──
  const { isSubActive, subscriptionBlockReason, isLoading: merchantLoading } = useMerchantClient();

  const [session, setSession]           = useState<BalanceSession | null>(null);
  const [allSessions, setAllSessions]   = useState<BalanceSession[]>([]);
  const [products, setProducts]         = useState<BalanceProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [activeCategory, setActiveCategory]   = useState<'all' | 'fakka' | 'mared'>('all');
  const [selectedProduct, setSelectedProduct] = useState<BalanceProduct | null>(null);
  const [loginOpen, setLoginOpen]       = useState(false);
  const [executeOpen, setExecuteOpen]   = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [successCount, setSuccessCount] = useState(0);

  const refreshSessions = useCallback(() => {
    const s = getBalanceSession();
    setSession(s);
    setAllSessions(getAllSessions());
  }, []);

  useEffect(() => {
    refreshSessions();
    // لا نفتح dialog تلقائياً — المستخدم يختار بنفسه
  }, [refreshSessions]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const { data, error } = await supabase.from('balance_products').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      const raw = (data && data.length > 0) ? data as BalanceProduct[] : BALANCE_PRODUCTS_FALLBACK;
      setProducts(mergeScriptLabels(raw));
    } catch { setProducts(mergeScriptLabels(BALANCE_PRODUCTS_FALLBACK)); }
    finally { setProductsLoading(false); }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const displayedProducts = useMemo(() => products.filter(p => {
    if (!isAdmin && (!p.is_visible || !p.is_enabled)) return false;
    return activeCategory === 'all' || p.category === activeCategory;
  }), [products, activeCategory, isAdmin]);

  const fakkaCount = useMemo(() => products.filter(p => p.category === 'fakka' && (isAdmin || p.is_visible)).length, [products, isAdmin]);
  const maredCount = useMemo(() => products.filter(p => p.category === 'mared' && (isAdmin || p.is_visible)).length, [products, isAdmin]);

  const handleSelectProduct = (p: BalanceProduct) => {
    if (!session) { setLoginOpen(true); return; }
    // منع الشحن إذا كان Context لم ينتهِ التحميل بعد
    if (isMerchantClient && merchantLoading) {
      toast.info('جارٍ التحقق من اشتراكك… انتظر لحظة.', { duration: 2000 });
      return;
    }
    // فحص أهلية الاشتراك
    if (isMerchantClient && !isSubActive) {
      toast.error(subscriptionBlockReason || 'اشتراكك مع التاجر غير نشط. تواصل مع تاجرك.', { duration: 4000 });
      return;
    }
    setSelectedProduct(p); setExecuteOpen(true);
  };

  const handleLoginSuccess = (s: BalanceSession) => {
    setSession(s);
    setAllSessions(getAllSessions());
    setLoginOpen(false);
  };

  const handleSessionSwitch = (s: BalanceSession | null) => {
    setSession(s);
    setAllSessions(getAllSessions());
  };

  const handleSessionExpired = () => {
    refreshSessions();
    setExecuteOpen(false);
    setLoginOpen(true);
  };

  const handleSignOut = () => {
    signOutBalance();
    setSession(null); setAllSessions([]);
    toast.info('تم تسجيل الخروج من أنا فودافون');
  };

  const handleSuccess = () => { setSuccessCount(c => c + 1); loadProducts(); };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.bg }}>
        <p className="text-muted-foreground text-sm">يجب تسجيل الدخول للوصول لهذه الصفحة</p>
      </div>
    );
  }

  // ── حماية أثناء التحقق من الاشتراك (منع ظهور الكروت قبل انتهاء التحقق) ──
  if (isMerchantClient && merchantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }} dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.red}60`, borderTopColor: 'transparent' }} />
          <p className="text-xs text-muted-foreground">جارٍ التحقق من الاشتراك…</p>
        </div>
      </div>
    );
  }

  // ── حماية عمليات عميل التاجر ──────────────────────────────────────────────
  if (isMerchantClient && !isSubActive) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: C.bg }} dir="rtl">
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b"
          style={{ background: 'rgba(8,0,0,0.95)', backdropFilter: 'blur(12px)', borderColor: 'rgba(230,0,0,0.1)' }}>
          <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5"
            onClick={() => navigate('/')}>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
          <p className="text-sm font-black text-white">الشحن من الرصيد</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.25)' }}>
            <AlertTriangle className="w-8 h-8" style={{ color: C.red }} />
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-black text-white">لا يمكن تنفيذ عمليات الشحن</h2>
            <p className="text-sm font-medium leading-relaxed" style={{ color: C.red }}>
              {subscriptionBlockReason || 'حسابك غير مفعل حالياً. يرجى التواصل مع التاجر الخاص بك لتفعيل الاشتراك.'}
            </p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            إعادة التحقق
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: C.bg }} dir="rtl">

      {/* ── هيدر الصفحة ── */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b"
        style={{ background: 'rgba(8,0,0,0.95)', backdropFilter: 'blur(12px)', borderColor: 'rgba(230,0,0,0.1)' }}>
        <button
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 hover:bg-white/5 transition-colors"
          onClick={() => navigate('/')}
        >
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: C.redLight, border: `1px solid ${C.redBorder}` }}>
            <Phone className="w-4 h-4" style={{ color: C.red }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-white truncate">الشحن من الرصيد</p>
            <p className="text-[10px]" style={{ color: C.muted }}>أنا فودافون · رصيد مباشر</p>
          </div>
        </div>

        {/* أزرار الهيدر */}
        {session ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {/* زر إدارة الحسابات */}
            <button
              className="relative flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
              onClick={() => setAccountsOpen(true)}
            >
              <Users className="w-3.5 h-3.5" />
              <span>حسابات</span>
              {allSessions.length > 1 && (
                <span className="w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center absolute -top-1 -left-1"
                  style={{ background: C.red, color: '#fff' }}>{allSessions.length}</span>
              )}
            </button>
            {/* زر خروج */}
            <button
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: C.redLight, border: `1px solid ${C.redBorder}`, color: '#ff8888' }}
              onClick={handleSignOut}
            >
              <LogOut className="w-3.5 h-3.5" />خروج
            </button>
          </div>
        ) : (
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0"
            style={{ background: C.redLight, border: `1px solid ${C.redBorder}`, color: C.red }}
            onClick={() => setLoginOpen(true)}
          >
            <LogIn className="w-3.5 h-3.5" />دخول
          </button>
        )}
      </div>

      {/* ── بانر المعلومات (يظهر دائماً بدون جلسة) ── */}
      <SectionInfoBanner hasSession={!!session} />

      {/* ── كارت الجلسة المحسَّن (عند وجود جلسة) ── */}
      {session && (
        <SessionCard
          session={session}
          allCount={allSessions.length}
          onManageAccounts={() => setAccountsOpen(true)}
        />
      )}

      {/* ── بانر تسجيل الدخول (بدون جلسة) ── */}
      {!session && (
        <div className="mx-4 mt-3">
          <button
            className="w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            style={{ background: `linear-gradient(135deg,${C.red},${C.redDeep})`, color: '#fff', boxShadow: `0 0 24px ${C.redGlow}` }}
            onClick={() => setLoginOpen(true)}
          >
            <LogIn className="w-4 h-4" />سجّل دخولك لأنا فودافون
          </button>
        </div>
      )}

      {/* ── عداد النجاحات ── */}
      {successCount > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 p-2.5 rounded-xl"
          style={{ background: C.greenBg, border: `1px solid ${C.greenBd}` }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: C.green }} />
          <p className="text-xs font-bold" style={{ color: C.green }}>
            {successCount} عملية ناجحة في هذه الجلسة
          </p>
        </div>
      )}

      {/* ── فلتر الفئة ── */}
      <div className="px-4 pt-4">
        <div className="flex gap-2">
          {([
            { value: 'all' as const,   label: 'الكل',   count: productsLoading ? '…' : String(displayedProducts.length) },
            { value: 'fakka' as const, label: '⚡ فكة',  count: String(fakkaCount) },
            { value: 'mared' as const, label: '🔥 مارد', count: String(maredCount) },
          ] as const).map(tab => (
            <button
              key={tab.value}
              className="flex-1 h-9 rounded-xl text-xs font-bold transition-all"
              style={{
                background: activeCategory === tab.value ? C.redLight : 'rgba(255,255,255,0.05)',
                border: activeCategory === tab.value ? `1px solid ${C.redBorder}` : '1px solid rgba(255,255,255,0.08)',
                color: activeCategory === tab.value ? C.red : 'rgba(255,255,255,0.5)',
              }}
              onClick={() => setActiveCategory(tab.value)}
            >
              {tab.label} <span className="opacity-60 text-[10px] mr-0.5">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── شبكة الكروت ── */}
      <div className="px-4 pt-4 pb-8">
        {productsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl animate-pulse"
                style={{ background: 'rgba(230,0,0,0.05)', border: '1px solid rgba(230,0,0,0.1)' }} />
            ))}
          </div>
        ) : displayedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Wallet className="w-10 h-10" style={{ color: 'rgba(230,0,0,0.3)' }} />
            <p className="text-sm text-muted-foreground">لا توجد كروت في هذه الفئة</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {displayedProducts.map(p => (
              <BalanceProductCard key={p.product_id} product={p} onSelect={handleSelectProduct} />
            ))}
          </div>
        )}
      </div>

      {/* ── بطاقة الانتقال لـ Vodafone Cash (PHASE 9) ── */}
      <VodafoneCashCard onNavigate={() => navigate('/')} />

      {/* ── الـ Dialogs / Sheets ── */}
      <BalanceLoginDialog
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
      <BalanceExecuteDialog
        open={executeOpen}
        onClose={() => setExecuteOpen(false)}
        onSuccess={handleSuccess}
        product={selectedProduct}
        session={session}
        onSessionExpired={handleSessionExpired}
      />
      <AccountsPanel
        open={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        activeSession={session}
        onSwitch={handleSessionSwitch}
        onAddAccount={() => setLoginOpen(true)}
        onSignOutAll={() => { setSession(null); setAllSessions([]); }}
      />
    </div>
  );
}

