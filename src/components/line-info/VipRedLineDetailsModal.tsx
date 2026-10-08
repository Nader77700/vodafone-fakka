/**
 * VipRedLineDetailsModal — نافذة تفاصيل الخط المحفوظ في مراقبة ريد VIP
 */

import { useState } from 'react';
import {
  X, Phone, Cpu, Banknote, Info, Copy, Check, CheckCircle2,
  PackageOpen, RotateCcw, AlertTriangle, Clock, Crown, Calendar,
  Package, KeyRound
} from 'lucide-react';
import { toast } from 'sonner';
import type { VipRedLine } from '@/types/vipRed';
import { classifyLineSystem, VIP_RED_PACKAGES } from '@/types/vipRed';

interface Props {
  line: VipRedLine | null;
  isOpen: boolean;
  onClose: () => void;
  onRecheck: (line: VipRedLine) => Promise<void>;
  isRechecking: boolean;
  L: boolean;
}

export default function VipRedLineDetailsModal({
  line,
  isOpen,
  onClose,
  onRecheck,
  isRechecking,
  L,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !line) return null;

  const textC   = L ? '#1a1a2e' : '#ffffff';
  const mutC    = L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const cardBg  = L ? '#ffffff' : '#0e1420';
  const cardBdr = L ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
  const innerBg = L ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';

  const classification = classifyLineSystem(line.current_system);
  const info = line.last_line_info || {};

  const copyLineSummary = () => {
    const summary = [
      `رقم الهاتف: ${line.phone_number}`,
      `النظام الحالي: ${line.current_system || 'غير معروف'}`,
      `الحالة: ${classification.label}`,
      info.balance ? `الرصيد: ${info.balance}` : null,
      info.loanDetails ? `سلفني: ${info.loanDetails}` : null,
      line.last_checked_at ? `آخر فحص: ${new Date(line.last_checked_at).toLocaleString('ar-EG')}` : null,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(summary);
    setCopied(true);
    toast.success('تم نسخ تفاصيل الخط');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[90dvh]"
        style={{
          background: cardBg,
          border: `1px solid ${cardBdr}`,
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: cardBdr, background: L ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(230,0,0,0.12)', border: '1px solid rgba(230,0,0,0.25)' }}
            >
              <Info className="w-4 h-4 text-[#E60000]" />
            </div>
            <div>
              <h2 className="text-sm font-black" style={{ color: textC }}>
                تفاصيل الخط: <span dir="ltr" className="font-mono text-[#E60000]">{line.phone_number}</span>
              </h2>
              <p className="text-[11px]" style={{ color: mutC }}>
                سجل المراقبة وبيانات الخط المسترجعة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            style={{ color: mutC }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Status Banner */}
          <div
            className="p-3.5 rounded-xl flex items-start gap-3 border"
            style={{
              background: classification.badgeBg,
              borderColor: classification.badgeBorder,
              color: classification.badgeText,
            }}
          >
            {classification.status === 'converted' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
            ) : classification.status === 'monitoring' ? (
              <Clock className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
            )}
            <div>
              <p className="font-bold text-sm">{classification.label}</p>
              <p className="text-xs opacity-90 mt-0.5">{classification.description}</p>
            </div>
          </div>

          {/* Core Info */}
          <div className="rounded-xl p-3.5 space-y-2.5 border" style={{ background: innerBg, borderColor: cardBdr }}>
            <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
              <span className="flex items-center gap-1.5" style={{ color: mutC }}>
                <Phone className="w-3.5 h-3.5" /> رقم الهاتف
              </span>
              <span className="font-mono font-bold" style={{ color: textC }} dir="ltr">{line.phone_number}</span>
            </div>

            <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
              <span className="flex items-center gap-1.5" style={{ color: mutC }}>
                <Crown className="w-3.5 h-3.5 text-amber-500" /> التاجر المرتبط
              </span>
              <span className="font-bold" style={{ color: line.merchant ? '#f59e0b' : mutC }}>
                {line.merchant ? line.merchant.name : 'غير محدد'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
              <span className="flex items-center gap-1.5" style={{ color: mutC }}>
                <Calendar className="w-3.5 h-3.5 text-purple-500" /> موعد التفعيل
              </span>
              <span className="font-bold" style={{ color: line.activation_day ? '#a855f7' : mutC }}>
                {line.activation_day ? `يوم ${line.activation_day}` : 'غير محدد'}
              </span>
            </div>

            {/* باقة الخط وسعرها */}
            <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
              <span className="flex items-center gap-1.5" style={{ color: mutC }}>
                <Package className="w-3.5 h-3.5 text-[#E60000]" /> باقة ريد بيزنس
              </span>
              <div className="text-left font-bold" style={{ color: textC }}>
                <span>{VIP_RED_PACKAGES[line.package_tier || '100gb']?.gigabytes || 100} جيجا ({Number(line.package_price) || VIP_RED_PACKAGES[line.package_tier || '100gb']?.price || 450} ج.م)</span>
                <span className="text-[10px] text-muted-foreground block">
                  {VIP_RED_PACKAGES[line.package_tier || '100gb']?.minutes.toLocaleString() || '6,000'} دقيقة
                </span>
              </div>
            </div>

            {/* باسورد أنا فودافون المسجل من العميل أو التاجر */}
            {line.ana_vodafone_password && (
              <div className="flex items-center justify-between py-1 border-b bg-purple-500/10 px-2 rounded-lg" style={{ borderColor: cardBdr }}>
                <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-bold">
                  <KeyRound className="w-3.5 h-3.5" /> باسورد أنا فودافون
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black text-purple-700 dark:text-purple-300 text-xs">
                    {line.ana_vodafone_password}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(line.ana_vodafone_password || '');
                      toast.success('تم نسخ باسورد أنا فودافون');
                    }}
                    className="p-1 hover:bg-purple-500/20 rounded transition text-purple-600 dark:text-purple-400"
                    title="نسخ الباسورد"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
              <span className="flex items-center gap-1.5" style={{ color: mutC }}>
                <Cpu className="w-3.5 h-3.5" /> النظام المسجل
              </span>
              <span className="font-bold truncate max-w-[220px]" style={{ color: textC }} dir="ltr">
                {line.current_system || 'لم يُفحص بعد'}
              </span>
            </div>

            {info.balance && (
              <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
                <span className="flex items-center gap-1.5" style={{ color: mutC }}>
                  <Banknote className="w-3.5 h-3.5" /> الرصيد المتبقي
                </span>
                <span className="font-bold text-emerald-500" dir="ltr">{info.balance}</span>
              </div>
            )}

            {info.loanDetails && (
              <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
                <span className="flex items-center gap-1.5" style={{ color: mutC }}>
                  <Info className="w-3.5 h-3.5" /> سلفني
                </span>
                <span className="font-bold" style={{ color: textC }} dir="ltr">{info.loanDetails}</span>
              </div>
            )}

            <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
              <span className="flex items-center gap-1.5" style={{ color: mutC }}>
                <Clock className="w-3.5 h-3.5" /> آخر فحص
              </span>
              <span className="font-medium" style={{ color: textC }}>
                {line.last_checked_at ? new Date(line.last_checked_at).toLocaleString('ar-EG') : 'لم يُفحص'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="flex items-center gap-1.5" style={{ color: mutC }}>
                <RotateCcw className="w-3.5 h-3.5" /> عدد مرات الفحص
              </span>
              <span className="font-bold" style={{ color: textC }}>
                {line.check_count || 0} مرة
              </span>
            </div>
          </div>

          {/* Active Bundles if any */}
          {Array.isArray(info.miBundles) && info.miBundles.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-xs" style={{ color: textC }}>
                <PackageOpen className="w-3.5 h-3.5 text-indigo-500" /> الباقات النشطة ({info.miBundles.length})
              </p>
              <div className="space-y-1.5">
                {info.miBundles.map((b, i) => (
                  <div key={i} className="p-2.5 rounded-lg border flex items-center justify-between" style={{ background: innerBg, borderColor: cardBdr }}>
                    <span className="font-bold truncate" style={{ color: textC }}>{b.name}</span>
                    <span className="font-mono text-indigo-400 font-bold">{b.availableAllowance} {b.unitCode}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fakka Cards if any */}
          {Array.isArray(info.fakkaCards) && info.fakkaCards.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-xs text-[#E60000]">
                كروت فكة نشطة ({info.fakkaCards.length})
              </p>
              <div className="space-y-1.5">
                {info.fakkaCards.map((b, i) => (
                  <div key={i} className="p-2.5 rounded-lg border flex items-center justify-between" style={{ background: innerBg, borderColor: cardBdr }}>
                    <span className="font-bold truncate" style={{ color: textC }}>{b.name}</span>
                    <span className="font-mono text-[#E60000] font-bold">{b.availableAllowance} {b.unitCode}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className="p-4 border-t shrink-0 flex items-center gap-2.5"
          style={{ borderColor: cardBdr, background: L ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}
        >
          <button
            onClick={() => onRecheck(line)}
            disabled={isRechecking}
            className="flex-1 h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            style={{ background: '#E60000', color: '#ffffff' }}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRechecking ? 'animate-spin' : ''}`} />
            {isRechecking ? 'جاري الفحص...' : 'فحص الرقم الآن'}
          </button>

          <button
            onClick={copyLineSummary}
            className="h-10 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition-all active:scale-95"
            style={{ background: innerBg, borderColor: cardBdr, color: textC }}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            نسخ
          </button>

          <button
            onClick={onClose}
            className="h-10 px-4 rounded-xl font-bold text-xs border transition-all active:scale-95"
            style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
