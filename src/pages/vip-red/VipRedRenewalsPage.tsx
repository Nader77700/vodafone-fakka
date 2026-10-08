import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Calendar,
  User,
  Users,
  Edit2,
  Trash2,
  PhoneCall,
  Clock,
  ChevronDown,
  ShieldAlert,
  Coins,
  CheckCheck,
  Building2,
  Sparkles,
  FileText,
  KeyRound,
  Copy,
  Printer,
  Download,
  Package,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/db/supabase';
import {
  getConvertedRenewalLines,
  updateLinePaymentStatus,
  updateLineCustomerName,
  updateLineMerchantAndActivation,
  updateLinePackageTier,
  deleteMonitoredLine,
  getMerchants,
  getLinkedMerchantForUser,
} from '@/lib/vipRedService';
import {
  runActivationRemindersCheck,
  getNextActivationDateForDay,
  calculateMerchantActivationStats,
} from '@/lib/vipRedActivationReminders';
import {
  VIP_RED_PACKAGES,
  type VipRedLine,
  type VipRedActivationDay,
  type VipRedPaymentStatus,
  type VipRedMerchant,
  type VipRedPackageTier,
} from '@/types/vipRed';

// حوار تعديل اسم العميل
interface EditCustomerModalProps {
  isOpen: boolean;
  line: VipRedLine | null;
  onClose: () => void;
  onSaved: (updatedLine: VipRedLine) => void;
  isLight: boolean;
}

const EditCustomerModal: React.FC<EditCustomerModalProps> = ({
  isOpen,
  line,
  onClose,
  onSaved,
  isLight,
}) => {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (line) {
      setName(line.customer_name || '');
    }
  }, [line]);

  if (!isOpen || !line) return null;

  const bg = isLight ? '#ffffff' : '#111318';
  const border = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
  const textC = isLight ? '#0f172a' : '#f8fafc';
  const mutC = isLight ? '#64748b' : '#94a3b8';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await updateLineCustomerName(line.id, name);
      if (!res.success || !res.line) {
        toast.error(res.error || 'تعذر حفظ اسم العميل');
        return;
      }
      toast.success('تم تحديث اسم العميل بنجاح');
      onSaved(res.line);
      onClose();
    } catch {
      toast.error('حدث خطأ أثناء حفظ الاسم');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm rounded-xl p-4 shadow-xl border"
        style={{ backgroundColor: bg, borderColor: border, color: textC }}
      >
        <div className="flex items-center justify-between pb-2 mb-3 border-b" style={{ borderColor: border }}>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">اسم العميل / صاحب الخط</span>
          </div>
          <span className="font-mono text-xs text-primary font-bold">{line.phone_number}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: mutC }}>
              اكتب اسم المستخدم أو صاحب الرقم:
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثال: أحمد عبد الله (فرع المعادي)"
              className="w-full px-3 py-2 text-xs rounded-lg border outline-none transition focus:border-primary"
              style={{
                backgroundColor: isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.05)',
                borderColor: border,
                color: textC,
              }}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs rounded-lg border transition hover:bg-muted"
              style={{ borderColor: border, color: mutC }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                'حفظ الاسم'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// حوار تعديل موعد التجديد (7، 11، 25)
interface EditDayModalProps {
  isOpen: boolean;
  line: VipRedLine | null;
  onClose: () => void;
  onSaved: (updatedLine: VipRedLine) => void;
  isLight: boolean;
}

const EditDayModal: React.FC<EditDayModalProps> = ({
  isOpen,
  line,
  onClose,
  onSaved,
  isLight,
}) => {
  const [selectedDay, setSelectedDay] = useState<VipRedActivationDay | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (line) {
      setSelectedDay(line.activation_day || null);
    }
  }, [line]);

  if (!isOpen || !line) return null;

  const bg = isLight ? '#ffffff' : '#111318';
  const border = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
  const textC = isLight ? '#0f172a' : '#f8fafc';
  const mutC = isLight ? '#64748b' : '#94a3b8';

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const res = await updateLineMerchantAndActivation(
        line.id,
        line.merchant_id || null,
        selectedDay
      );
      if (!res.success || !res.line) {
        toast.error(res.error || 'تعذر تعديل موعد التجديد');
        return;
      }
      toast.success('تم تعديل موعد التجديد بنجاح');
      onSaved(res.line);
      onClose();
    } catch {
      toast.error('حدث خطأ أثناء تعديل الموعد');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm rounded-xl p-4 shadow-xl border"
        style={{ backgroundColor: bg, borderColor: border, color: textC }}
      >
        <div className="flex items-center justify-between pb-2 mb-3 border-b" style={{ borderColor: border }}>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">تعديل موعد التجديد للرقم</span>
          </div>
          <span className="font-mono text-xs text-primary font-bold">{line.phone_number}</span>
        </div>

        <div className="space-y-2 mb-4">
          <p className="text-xs" style={{ color: mutC }}>
            اختر موعد دورة التجديد المناسب لهذا الخط:
          </p>

          <div className="grid grid-cols-3 gap-2">
            {([7, 11, 25] as const).map(day => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`p-2.5 rounded-lg border text-center transition flex flex-col items-center justify-center gap-1 ${
                  selectedDay === day
                    ? 'border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <span className="text-xs font-semibold">يوم {day}</span>
                <span className="text-[10px] text-muted-foreground">شهرياً</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className={`w-full py-1.5 px-3 rounded-lg border text-xs transition text-center mt-1 ${
              selectedDay === null
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-500 font-bold'
                : 'border-border text-muted-foreground hover:bg-muted/30'
            }`}
          >
            بدون موعد محدد (إلغاء التعيين)
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: border }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-xs rounded-lg border transition hover:bg-muted"
            style={{ borderColor: border, color: mutC }}
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow flex items-center gap-1.5"
          >
            {isSubmitting ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'حفظ الموعد'}
          </button>
        </div>
      </div>
    </div>
  );
};

// حوار تعديل باقة وسعر خط ريد
interface EditPackageModalProps {
  isOpen: boolean;
  line: VipRedLine | null;
  onClose: () => void;
  onSaved: (updatedLine: VipRedLine) => void;
  isLight: boolean;
}

const EditPackageModal: React.FC<EditPackageModalProps> = ({
  isOpen,
  line,
  onClose,
  onSaved,
  isLight,
}) => {
  const [selectedTier, setSelectedTier] = useState<VipRedPackageTier>('100gb');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (line) {
      setSelectedTier(line.package_tier || '100gb');
    }
  }, [line]);

  if (!isOpen || !line) return null;

  const bg = isLight ? '#ffffff' : '#111318';
  const border = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
  const textC = isLight ? '#0f172a' : '#f8fafc';
  const mutC = isLight ? '#64748b' : '#94a3b8';

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const res = await updateLinePackageTier(line.id, selectedTier);
      if (!res.success || !res.line) {
        toast.error(res.error || 'تعذر تعديل الباقة');
        return;
      }
      toast.success('تم تعديل باقة الخط وسعره بنجاح');
      onSaved(res.line);
      onClose();
    } catch {
      toast.error('حدث خطأ أثناء تعديل الباقة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm rounded-2xl border p-4 space-y-3 shadow-2xl"
        style={{ backgroundColor: bg, borderColor: border }}
      >
        <div className="flex items-center gap-2 border-b pb-2.5" style={{ borderColor: border }}>
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold truncate" style={{ color: textC }}>
              تعديل باقة خط ريد
            </h3>
            <p className="text-[11px] font-mono" style={{ color: mutC }}>
              {line.phone_number}
            </p>
          </div>
        </div>

        <div className="space-y-2 py-1">
          {Object.entries(VIP_RED_PACKAGES).map(([tierKey, pkg]) => {
            const isSelected = selectedTier === tierKey;
            return (
              <button
                key={tierKey}
                type="button"
                onClick={() => setSelectedTier(tierKey as VipRedPackageTier)}
                className={`w-full p-2.5 rounded-xl border text-right transition flex items-center justify-between ${
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-xs'
                    : 'border-border hover:bg-muted/30'
                }`}
              >
                <div>
                  <span className="text-xs font-black block" style={{ color: isSelected ? '#E60000' : textC }}>
                    {pkg.gigabytes} جيجا + {pkg.minutes.toLocaleString()} دقيقة
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    باقة فودافون ريد بيزنس المعتمدة
                  </span>
                </div>
                <div className="text-left font-mono font-black text-sm text-[#E60000]">
                  {pkg.price} ج.م
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: border }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-xs rounded-lg border transition hover:bg-muted"
            style={{ borderColor: border, color: mutC }}
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow flex items-center gap-1.5"
          >
            {isSubmitting ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'حفظ الباقة'}
          </button>
        </div>
      </div>
    </div>
  );
};

// حوار الفاتورة التفصيلية لدورات التجديد (7، 11، 25)
interface ItemizedInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  lines: VipRedLine[];
  initialDay?: VipRedActivationDay | 'all';
  isLight: boolean;
}

const ItemizedInvoiceModal: React.FC<ItemizedInvoiceModalProps> = ({
  isOpen,
  onClose,
  lines,
  initialDay = 'all',
  isLight,
}) => {
  const [selectedCycle, setSelectedCycle] = useState<VipRedActivationDay | 'all'>(initialDay);

  useEffect(() => {
    setSelectedCycle(initialDay);
  }, [initialDay]);

  if (!isOpen) return null;

  const bg = isLight ? '#ffffff' : '#0f1117';
  const border = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
  const textC = isLight ? '#0f172a' : '#f8fafc';
  const innerBg = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.03)';

  const cycleLines = selectedCycle === 'all'
    ? lines
    : lines.filter(l => l.activation_day === selectedCycle);

  const totalAmount = cycleLines.reduce((acc, l) => {
    const price = Number(l.package_price) || (l.package_tier === '200gb' ? 700 : l.package_tier === '150gb' ? 550 : 450);
    return acc + price;
  }, 0);

  const paidAmount = cycleLines
    .filter(l => l.payment_status === 'paid')
    .reduce((acc, l) => {
      const price = Number(l.package_price) || (l.package_tier === '200gb' ? 700 : l.package_tier === '150gb' ? 550 : 450);
      return acc + price;
    }, 0);

  const unpaidAmount = totalAmount - paidAmount;

  // تنزيل كشف الحساب / الفاتورة كملف تقرير رسمي جاهز للطباعة والحفظ
  const handleDownloadInvoice = () => {
    try {
      const cycleTitle = selectedCycle === 'all' ? 'جميع دورات التجديد (7، 11، 25)' : `دورة تجديد يوم ${selectedCycle}`;
      const nowStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
      const nowTimeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

      const rowsHtml = cycleLines.map((line, idx) => {
        const pkgPrice = Number(line.package_price) || (line.package_tier === '200gb' ? 700 : line.package_tier === '150gb' ? 550 : 450);
        const isPaid = line.payment_status === 'paid';
        const merchName = line.merchant?.name || 'بدون تاجر';
        const customer = line.customer_name || 'غير مسجل';
        return `
          <tr style="border-bottom: 1px solid #e2e8f0; text-align: right;">
            <td style="padding: 10px; font-weight: bold; text-align: center;">${idx + 1}</td>
            <td style="padding: 10px; font-family: monospace; font-size: 14px; font-weight: bold; direction: ltr; text-align: left;">${line.phone_number}</td>
            <td style="padding: 10px;">${customer}</td>
            <td style="padding: 10px;">${merchName}</td>
            <td style="padding: 10px; font-weight: bold; color: #7e22ce;">يوم ${line.activation_day || '—'}</td>
            <td style="padding: 10px; font-weight: bold;">${pkgPrice} ج.م</td>
            <td style="padding: 10px; text-align: center;">
              <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; background: ${isPaid ? '#dcfce7' : '#fee2e2'}; color: ${isPaid ? '#15803d' : '#b91c1c'};">
                ${isPaid ? 'تم السداد ✓' : 'غير مسدد ✕'}
              </span>
            </td>
          </tr>
        `;
      }).join('');

      const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاتورة فودافون ريد VIP - ${cycleTitle}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
    .invoice-card { max-width: 900px; margin: 0 auto; background: #ffffff; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; overflow: hidden; }
    .header { background: linear-gradient(135deg, #E60000 0%, #990000 100%); color: #ffffff; padding: 24px; display: flex; justify-content: space-between; align-items: center; }
    .badge { background: rgba(255,255,255,0.22); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 18px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .stat-box { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center; }
    .stat-val { font-size: 18px; font-weight: 900; margin-top: 4px; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #f1f5f9; padding: 10px; font-size: 12px; font-weight: bold; color: #475569; text-align: right; }
    .footer { padding: 18px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; background: #f8fafc; }
    @media print {
      body { background: #fff; padding: 0; }
      .invoice-card { box-shadow: none; border: none; max-width: 100%; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width: 900px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
    <button onclick="window.print()" style="padding: 10px 18px; background: #E60000; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px;">
      🖨️ طباعة أو حفظ بتنسيق PDF
    </button>
    <span style="font-size: 12px; color: #64748b;">(لحفظ الفاتورة كـ PDF على هاتفك أو كمبيوترك: اضغط زر الطباعة ثم اختر حفظ كـ PDF)</span>
  </div>

  <div class="invoice-card">
    <div class="header">
      <div>
        <h1 style="margin: 0; font-size: 20px; font-weight: 900;">👑 فودافون ريد بيزنس VIP</h1>
        <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 13px;">كشف حساب الفاتورة التفصيلية — ${cycleTitle}</p>
      </div>
      <div style="text-align: left;">
        <span class="badge">كشف حساب رسمي</span>
        <div style="font-size: 11px; opacity: 0.85; margin-top: 6px;">${nowStr} - ${nowTimeStr}</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-box">
        <div style="font-size: 11px; color: #64748b; font-weight: bold;">إجمالي المستحق</div>
        <div class="stat-val" style="color: #0f172a;">${totalAmount.toLocaleString()} ج.م</div>
      </div>
      <div class="stat-box" style="border-color: #bbf7d0; background: #f0fdf4;">
        <div style="font-size: 11px; color: #16a34a; font-weight: bold;">تم تحصيله</div>
        <div class="stat-val" style="color: #16a34a;">${paidAmount.toLocaleString()} ج.م</div>
      </div>
      <div class="stat-box" style="border-color: #fecaca; background: #fef2f2;">
        <div style="font-size: 11px; color: #dc2626; font-weight: bold;">متبقي لم يسدد</div>
        <div class="stat-val" style="color: #dc2626;">${unpaidAmount.toLocaleString()} ج.م</div>
      </div>
    </div>

    <div style="padding: 0 24px 20px 24px;">
      <h3 style="font-size: 14px; margin: 18px 0 10px 0; font-weight: 800;">قائمة أرقام الدورة (${cycleLines.length} خط)</h3>
      <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px;">
        <table>
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              <th>رقم الهاتف</th>
              <th>اسم العميل</th>
              <th>التاجر</th>
              <th>يوم التجديد</th>
              <th>قيمة الباقة</th>
              <th style="text-align: center;">حالة السداد</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>

    <div class="footer">
      منصة فودافون فكة بريميوم VIP — تم إنشاء هذا التقرير تلقائياً لدورات التجديد
    </div>
  </div>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `فاتورة_فودافون_ريد_${selectedCycle === 'all' ? 'جميع_الدورات' : 'يوم_' + selectedCycle}_${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('تم تنزيل ملف الفاتورة بنجاح! يمكنك فتحه وحفظه أو مشاركته كـ PDF');
    } catch (e) {
      console.error(e);
      toast.error('تعذر تنزيل الفاتورة');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 print:p-0 print:bg-white" dir="rtl">
      <div
        className="w-full max-w-xl max-h-[92vh] rounded-xl border flex flex-col shadow-2xl overflow-hidden print:max-w-none print:max-h-none print:border-none print:shadow-none"
        style={{ backgroundColor: bg, borderColor: border }}
      >
        {/* رأس الفاتورة المضغوط بنظام صفين ذكيين للموبايل */}
        <div className="p-2 sm:p-2.5 border-b space-y-1.5 shrink-0" style={{ borderColor: border }}>
          {/* السطر الأول: العنوان وزر الإغلاق */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#E60000]/10 text-[#E60000] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-black truncate" style={{ color: textC }}>
                  الفاتورة التفصيلية — ريد VIP
                </h3>
                <p className="text-[10px] text-muted-foreground truncate">
                  كشف حساب واشتراكات دورة التجديد الشهرية
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold hover:bg-muted transition-all active:scale-95 shrink-0"
              style={{ borderColor: border, color: textC }}
              title="إغلاق الفاتورة"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* السطر الثاني: أزرار التنزيل والطباعة بحجم مدمج ومتناسق */}
          <div className="flex items-center gap-1.5 print:hidden">
            <button
              type="button"
              onClick={handleDownloadInvoice}
              className="flex-1 h-7 px-2 rounded-md border text-[11px] font-bold flex items-center justify-center gap-1 bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 transition-all active:scale-95"
              title="تنزيل ملف الفاتورة للحفظ بدون طابعة"
            >
              <Download className="w-3 h-3" />
              <span>تنزيل الفاتورة HTML</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 h-7 px-2 rounded-md border text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-muted transition-all active:scale-95"
              style={{ borderColor: border, color: textC }}
              title="طباعة مباشرة أو اختيار حفظ بتنسيق PDF"
            >
              <Printer className="w-3 h-3" />
              <span>طباعة / PDF</span>
            </button>
          </div>
        </div>

        {/* فلاتر الدورات 7 / 11 / 25 بحجم فائق الانكماش */}
        <div className="p-1.5 sm:p-2 border-b flex items-center justify-between gap-1 print:hidden shrink-0" style={{ borderColor: border, backgroundColor: innerBg }}>
          <div className="flex items-center gap-1">
            {(['all', 7, 11, 25] as const).map(day => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedCycle(day)}
                className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold border transition ${
                  selectedCycle === day
                    ? 'bg-[#E60000] text-white border-[#E60000]'
                    : 'hover:bg-muted border-border text-foreground'
                }`}
              >
                {day === 'all' ? 'الكل' : `يوم ${day}`}
              </button>
            ))}
          </div>

          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
            العدد: <strong className="text-foreground">{cycleLines.length}</strong>
          </span>
        </div>

        {/* كروت ملخص المبالغ الثلاثة بحجم مضغوط */}
        <div className="grid grid-cols-3 gap-1.5 p-1.5 sm:p-2 border-b shrink-0" style={{ borderColor: border }}>
          <div className="p-1.5 rounded-lg border bg-card text-center">
            <span className="text-[9px] text-muted-foreground block">المستحق</span>
            <span className="text-xs sm:text-sm font-black font-mono text-foreground">
              {totalAmount.toLocaleString()} ج.م
            </span>
          </div>

          <div className="p-1.5 rounded-lg border bg-emerald-500/10 border-emerald-500/20 text-center">
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block">المحصل</span>
            <span className="text-xs sm:text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
              {paidAmount.toLocaleString()} ج.م
            </span>
          </div>

          <div className="p-1.5 rounded-lg border bg-rose-500/10 border-rose-500/20 text-center">
            <span className="text-[9px] text-rose-600 dark:text-rose-400 block">المتبقي</span>
            <span className="text-xs sm:text-sm font-black font-mono text-rose-600 dark:text-rose-400">
              {unpaidAmount.toLocaleString()} ج.م
            </span>
          </div>
        </div>

        {/* جدول بنود الخطوط بحجم مضغوط للموبايل */}
        <div className="flex-1 overflow-y-auto p-1.5 sm:p-2 space-y-1">
          {cycleLines.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              لا توجد خطوط مسجلة في هذه الدورة
            </div>
          ) : (
            cycleLines.map((line, idx) => {
              const price = Number(line.package_price) || (line.package_tier === '200gb' ? 700 : line.package_tier === '150gb' ? 550 : 450);
              const pkg = VIP_RED_PACKAGES[line.package_tier || '100gb'];
              const isPaid = line.payment_status === 'paid';

              return (
                <div
                  key={line.id}
                  className="p-1.5 sm:p-2 rounded-lg border flex items-center justify-between gap-1.5 text-xs shadow-xs"
                  style={{ borderColor: border, backgroundColor: innerBg }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground text-[9px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-bold text-foreground text-xs" dir="ltr">
                          {line.phone_number}
                        </span>
                        {line.customer_name && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">
                            ({line.customer_name})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground truncate">
                        <span>يوم {line.activation_day || '—'}</span>
                        {line.merchant && <span>• {line.merchant.name}</span>}
                        <span>• {pkg.gigabytes}GB</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono font-black text-xs text-[#E60000]">
                      {price} ج
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                        isPaid
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                      }`}
                    >
                      {isPaid ? 'مسدد' : 'غير مسدد'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default function VipRedRenewalsPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  // Permission check — فحص شامل ومباشر لصلاحية المالك/الأدمن
  const isAdmin = useMemo(() => {
    return Boolean(
      profile?.role === 'admin' ||
      profile?.role === 'super_admin' ||
      (profile as any)?.is_admin === true ||
      user?.role === 'admin' ||
      (user as any)?.is_admin === true ||
      user?.user_metadata?.role === 'admin' ||
      user?.user_metadata?.role === 'super_admin' ||
      user?.email === 'nader77@miaoda.com'
    );
  }, [user, profile]);
  const { theme } = useTheme();
  const L = theme === 'light';

  const [lines, setLines] = useState<VipRedLine[]>([]);
  const [merchants, setMerchants] = useState<VipRedMerchant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // الفلاتر
  const [dayFilter, setDayFilter] = useState<'all' | '7' | '11' | '25' | 'unset'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'unpaid' | 'paid' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // الحوارات
  const [editingCustomerLine, setEditingCustomerLine] = useState<VipRedLine | null>(null);
  const [editingDayLine, setEditingDayLine] = useState<VipRedLine | null>(null);
  const [editingPackageLine, setEditingPackageLine] = useState<VipRedLine | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState<boolean>(false);
  const [deletingLine, setDeletingLine] = useState<VipRedLine | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ألوان الواجهة
  const bg = L ? '#f8fafc' : '#0a0a0f';
  const cardBg = L ? '#ffffff' : '#111318';
  const cardBdr = L ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
  const innerBg = L ? '#f1f5f9' : 'rgba(255, 255, 255, 0.04)';
  const textC = L ? '#0f172a' : '#f8fafc';
  const mutC = L ? '#64748b' : '#94a3b8';

  // استرجاع فوري من الذاكرة المؤقتة لمنع أي تأخير في العرض
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('vf_vip_red_renewals_lines');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLines(parsed);
          setIsLoading(false);
        }
      }
    } catch {}
  }, []);

  const loadData = useCallback(async () => {
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
      setIsRefreshing(false);
    }, 1800);

    try {
      let activeUserId = user?.id;

      const [renewalLines, allMerchants] = await Promise.all([
        getConvertedRenewalLines(isAdmin ? undefined : activeUserId).catch(() => []),
        getMerchants().catch(() => []),
      ]);

      setLines(renewalLines || []);
      setMerchants(allMerchants || []);
      try {
        sessionStorage.setItem('vf_vip_red_renewals_lines', JSON.stringify(renewalLines || []));
      } catch {}
    } catch (err) {
      console.warn('[VipRedRenewals] loadData error:', err);
    } finally {
      clearTimeout(safetyTimer);
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id, isAdmin]);

  useEffect(() => {
    let isMounted = true;
    loadData().then(() => {
      if (isMounted && user?.id) {
        runActivationRemindersCheck(user.id).catch(console.warn);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loadData, user?.id]);

  // اشتراك Realtime آمن ومحمي لمنع تسرب التحديثات
  useEffect(() => {
    let isMounted = true;

    const channel = supabase
      .channel('vip_red_renewals_feed')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vip_red_monitored_lines',
        },
        payload => {
          if (!isMounted) return;
          if (payload.eventType === 'INSERT') {
            const newLine = payload.new as VipRedLine;
            if (newLine.system_status === 'converted') {
              setLines(prev => (prev.some(l => l.id === newLine.id) ? prev : [newLine, ...prev]));
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as VipRedLine;
            if (updated.system_status === 'converted') {
              setLines(prev => {
                const exists = prev.some(l => l.id === updated.id);
                if (exists) {
                  return prev.map(l => (l.id === updated.id ? { ...l, ...updated } : l));
                }
                return [updated, ...prev];
              });
            } else {
              // إذا لم يعد محولاً يتم استبعاده
              setLines(prev => prev.filter(l => l.id !== updated.id));
            }
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id: string }).id;
            setLines(prev => prev.filter(l => l.id !== oldId));
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
  };

  // تبديل حالة السداد للخط بنقرة واحدة
  const handleTogglePaymentStatus = async (line: VipRedLine) => {
    const newStatus: VipRedPaymentStatus = line.payment_status === 'paid' ? 'unpaid' : 'paid';
    const originalStatus = line.payment_status;

    // تحديث متفائل (Optimistic update)
    setLines(prev =>
      prev.map(l => (l.id === line.id ? { ...l, payment_status: newStatus } : l))
    );

    try {
      const res = await updateLinePaymentStatus(line.id, newStatus);
      if (!res.success || !res.line) {
        // تراجع عند الفشل
        setLines(prev =>
          prev.map(l => (l.id === line.id ? { ...l, payment_status: originalStatus } : l))
        );
        toast.error(res.error || 'فشل تحديث حالة السداد');
        return;
      }

      if (newStatus === 'paid') {
        toast.success(`تم تأكيد السداد والتجديد للرقم ${line.phone_number}`);
      } else {
        toast.info(`تم تمييز الرقم ${line.phone_number} كـ "لم يسدد"`);
      }
    } catch {
      setLines(prev =>
        prev.map(l => (l.id === line.id ? { ...l, payment_status: originalStatus } : l))
      );
      toast.error('حدث خطأ في الشبكة أثناء التحديث');
    }
  };

  // حذف رقم
  const handleDeleteLine = async () => {
    if (!deletingLine) return;
    setIsDeleting(true);
    try {
      const ok = await deleteMonitoredLine(deletingLine.id);
      if (!ok) {
        toast.error('تعذر حذف الخط');
        return;
      }
      toast.success(`تم حذف الرقم ${deletingLine.phone_number} بنجاح`);
      setLines(prev => prev.filter(l => l.id !== deletingLine.id));
      setDeletingLine(null);
    } catch {
      toast.error('حدث خطأ أثناء الحذف');
    } finally {
      setIsDeleting(false);
    }
  };

  // تصفير دورة السداد (إعادة الجميع إلى غير مسدد للشهر الجديد)
  const handleResetCycleToUnpaid = async () => {
    if (lines.length === 0) return;
    const confirmed = window.confirm(
      'هل تريد إعادة ضبط حالة جميع أرقام ريد المحولة إلى "لم يسدد المبلغ" لبدء دورة سداد جديدة؟'
    );
    if (!confirmed) return;

    try {
      toast.loading('جاري تصفير دورة السداد...', { id: 'reset-cycle' });
      const convertedIds = lines.map(l => l.id);
      const { error } = await supabase
        .from('vip_red_monitored_lines')
        .update({
          payment_status: 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .in('id', convertedIds);

      if (error) {
        toast.error('تعذر تصفير الدورة: ' + error.message, { id: 'reset-cycle' });
        return;
      }

      toast.success('تم تصفير دورة السداد لجميع الأرقام بنجاح', { id: 'reset-cycle' });
      setLines(prev => prev.map(l => ({ ...l, payment_status: 'unpaid' })));
    } catch {
      toast.error('حدث خطأ أثناء تصفير الدورة', { id: 'reset-cycle' });
    }
  };

  // تأكيد سداد جميع الأرقام المفلترة حالياً
  const handleMarkAllFilteredAsPaid = async () => {
    const targetLines = filteredLines.filter(l => l.payment_status !== 'paid');
    if (targetLines.length === 0) {
      toast.info('جميع الأرقام المعروضة مسددة بالفعل');
      return;
    }

    const confirmed = window.confirm(
      `هل تريد تأكيد سداد وتجديد عدد (${targetLines.length}) خط دفعة واحدة؟`
    );
    if (!confirmed) return;

    try {
      toast.loading('جاري تأكيد السداد الجماعي...', { id: 'mass-paid' });
      const ids = targetLines.map(l => l.id);
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('vip_red_monitored_lines')
        .update({
          payment_status: 'paid',
          last_payment_date: nowIso,
          updated_at: nowIso,
        })
        .in('id', ids);

      if (error) {
        toast.error('فشل التأكيد الجماعي: ' + error.message, { id: 'mass-paid' });
        return;
      }

      toast.success(`تم تأكيد سداد (${targetLines.length}) خط بنجاح`, { id: 'mass-paid' });
      setLines(prev =>
        prev.map(l => (ids.includes(l.id) ? { ...l, payment_status: 'paid', last_payment_date: nowIso } : l))
      );
    } catch {
      toast.error('حدث خطأ أثناء السداد الجماعي', { id: 'mass-paid' });
    }
  };

  // إحصائيات عامة
  const stats = useMemo(() => {
    const total = lines.length;
    const paid = lines.filter(l => l.payment_status === 'paid').length;
    const unpaid = lines.filter(l => l.payment_status === 'unpaid' || !l.payment_status).length;
    const cancelled = lines.filter(l => l.payment_status === 'cancelled').length;

    const count7 = lines.filter(l => l.activation_day === 7).length;
    const unpaid7 = lines.filter(l => l.activation_day === 7 && l.payment_status !== 'paid').length;

    const count11 = lines.filter(l => l.activation_day === 11).length;
    const unpaid11 = lines.filter(l => l.activation_day === 11 && l.payment_status !== 'paid').length;

    const count25 = lines.filter(l => l.activation_day === 25).length;
    const unpaid25 = lines.filter(l => l.activation_day === 25 && l.payment_status !== 'paid').length;

    const unsetCount = lines.filter(l => !l.activation_day).length;

    // حساب أقرب موعد تجديد قادم
    const now = new Date();
    const candidateDays = [7, 11, 25] as const;
    let nextDate: Date | null = null;
    let nextDay: VipRedActivationDay | null = null;

    candidateDays.forEach(day => {
      const d = getNextActivationDateForDay(day, now);
      if (!nextDate || d.getTime() < (nextDate as Date).getTime()) {
        nextDate = d;
        nextDay = day;
      }
    });

    const diffDays = nextDate
      ? Math.ceil(((nextDate as Date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      total,
      paid,
      unpaid,
      cancelled,
      count7,
      unpaid7,
      count11,
      unpaid11,
      count25,
      unpaid25,
      unsetCount,
      nextDay,
      nextDate,
      diffDays,
    };
  }, [lines]);

  // قائمة الخطوط المفلترة
  const filteredLines = useMemo(() => {
    let res = [...lines];

    // تصفية موعد التجديد
    if (dayFilter === '7') res = res.filter(l => l.activation_day === 7);
    else if (dayFilter === '11') res = res.filter(l => l.activation_day === 11);
    else if (dayFilter === '25') res = res.filter(l => l.activation_day === 25);
    else if (dayFilter === 'unset') res = res.filter(l => !l.activation_day);

    // تصفية حالة السداد
    if (paymentFilter === 'unpaid') res = res.filter(l => l.payment_status === 'unpaid' || !l.payment_status);
    else if (paymentFilter === 'paid') res = res.filter(l => l.payment_status === 'paid');
    else if (paymentFilter === 'cancelled') res = res.filter(l => l.payment_status === 'cancelled');

    // تصفية البحث
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      res = res.filter(l => {
        const matchPhone = l.phone_number?.includes(q);
        const matchCust = l.customer_name?.toLowerCase().includes(q);
        const matchMerch = l.merchant?.name?.toLowerCase().includes(q);
        return matchPhone || matchCust || matchMerch;
      });
    }

    return res;
  }, [lines, dayFilter, paymentFilter, searchQuery]);

  return (
    <div className="min-h-screen pb-32 transition-colors duration-200" style={{ backgroundColor: bg }}>
      {/* ── الرأس العلوي فائق الانكماش المزدوج (Ultra-Compact Mobile Header) ── */}
      <div
        className="sticky top-0 z-30 px-2 sm:px-3 py-1.5 backdrop-blur-md border-b space-y-1.5"
        style={{
          backgroundColor: L ? 'rgba(255, 255, 255, 0.95)' : 'rgba(17, 19, 24, 0.95)',
          borderColor: cardBdr,
        }}
      >
        {/* السطر الأول: الرجوع + العنوان + زر التحديث */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => navigate('/vip-red')}
              className="w-7 h-7 rounded-lg border flex items-center justify-center transition active:scale-95 shrink-0"
              style={{ borderColor: cardBdr }}
              title="الرجوع لمركز فودافون ريد"
            >
              <ArrowRight className="w-3.5 h-3.5 text-primary" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                <h1 className="text-xs sm:text-sm font-black truncate" style={{ color: textC }}>
                  تجديد وسداد خطوط ريد
                </h1>
                <span className="text-[9px] px-1 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                  دورات 7/11/25
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-6.5 px-2 rounded-md border text-[10px] font-bold flex items-center gap-1 transition active:scale-95"
              style={{ borderColor: cardBdr, color: textC }}
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>
          </div>
        </div>

        {/* السطر الثاني: أزرار الإجراءات الرئيسية المدمجة */}
        <div className="grid grid-cols-2 gap-1 pt-0.5">
          <button
            onClick={() => setShowInvoiceModal(true)}
            className="h-6.5 px-2 rounded-md border text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 text-[#E60000] border-[#E60000]/30 bg-[#E60000]/10 hover:bg-[#E60000]/20 transition active:scale-95"
            title="استعراض وطباعة الفاتورة التفصيلية لدورات التجديد"
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">الفاتورة التفصيلية</span>
          </button>

          <button
            onClick={() => navigate('/vip-red/merchants')}
            className="h-6.5 px-2 rounded-md border text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-muted transition active:scale-95"
            style={{ borderColor: cardBdr, color: textC }}
            title="إدارة التجار ومتابعة أرقامهم"
          >
            <Users className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">إدارة التجار ({stats.total})</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-2 sm:px-3 pt-2 space-y-2">
        {/* ── شريط الإحصائيات المضغوط (Compact Mobile Stats Cards) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
          {/* إجمالي خطوط ريد */}
          <div
            className="rounded-xl p-2 border flex items-center gap-2"
            style={{ backgroundColor: cardBg, borderColor: cardBdr }}
          >
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <PhoneCall className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] block truncate" style={{ color: mutC }}>
                إجمالي خطوط ريد
              </span>
              <span className="text-xs sm:text-sm font-black font-mono" style={{ color: textC }}>
                {stats.total}
              </span>
            </div>
          </div>

          {/* لم يسدد المبلغ (تنبيه رئيسي) */}
          <div
            className="rounded-xl p-2 border flex items-center gap-2"
            style={{
              backgroundColor: cardBg,
              borderColor: stats.unpaid > 0 ? 'rgba(239, 68, 68, 0.4)' : cardBdr,
            }}
          >
            <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] block truncate text-red-500 font-bold">
                لم يسدد المبلغ
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-xs sm:text-sm font-black font-mono text-red-500">
                  {stats.unpaid}
                </span>
                <span className="text-[9px] text-muted-foreground">خط</span>
              </div>
            </div>
          </div>

          {/* تم الدفع والتجديد */}
          <div
            className="rounded-xl p-2 border flex items-center gap-2"
            style={{ backgroundColor: cardBg, borderColor: cardBdr }}
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] block truncate text-emerald-500 font-bold">
                تم الدفع والتجديد
              </span>
              <span className="text-xs sm:text-sm font-black font-mono text-emerald-500">
                {stats.paid}
              </span>
            </div>
          </div>

          {/* أقرب موعد تجديد قادم */}
          <div
            className="rounded-xl p-2 border flex items-center gap-2"
            style={{ backgroundColor: cardBg, borderColor: cardBdr }}
          >
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] block truncate" style={{ color: mutC }}>
                أقرب موعد قادم
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] sm:text-xs font-black text-amber-500">
                  {stats.nextDay ? `يوم ${stats.nextDay}` : 'غير محدد'}
                </span>
                {stats.diffDays !== null && (
                  <span className="text-[9px] font-mono bg-amber-500/10 text-amber-500 px-1 py-0.2 rounded">
                    بعد {stats.diffDays} ي
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── شريط توزيع المواعيد (7 / 11 / 25) السريع ── */}
        <div
          className="rounded-xl p-2 border flex items-center justify-between gap-1 text-[11px]"
          style={{ backgroundColor: innerBg, borderColor: cardBdr }}
        >
          <div className="flex items-center gap-1.5 px-2 font-medium shrink-0" style={{ color: mutC }}>
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">توزيع المواعيد:</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {/* يوم 7 */}
            <button
              onClick={() => setDayFilter(dayFilter === '7' ? 'all' : '7')}
              className={`px-2 py-1 rounded-lg border transition text-center shrink-0 flex items-center gap-1.5 ${
                dayFilter === '7'
                  ? 'bg-primary text-primary-foreground border-primary font-bold shadow-sm'
                  : 'bg-background hover:bg-muted text-foreground'
              }`}
              style={{ borderColor: cardBdr }}
            >
              <span>يوم 7:</span>
              <span className="font-mono font-bold">{stats.count7}</span>
              {stats.unpaid7 > 0 && (
                <span className="bg-red-500 text-white text-[9px] px-1 rounded-full font-mono">
                  {stats.unpaid7} متبقي
                </span>
              )}
            </button>

            {/* يوم 11 */}
            <button
              onClick={() => setDayFilter(dayFilter === '11' ? 'all' : '11')}
              className={`px-2 py-1 rounded-lg border transition text-center shrink-0 flex items-center gap-1.5 ${
                dayFilter === '11'
                  ? 'bg-primary text-primary-foreground border-primary font-bold shadow-sm'
                  : 'bg-background hover:bg-muted text-foreground'
              }`}
              style={{ borderColor: cardBdr }}
            >
              <span>يوم 11:</span>
              <span className="font-mono font-bold">{stats.count11}</span>
              {stats.unpaid11 > 0 && (
                <span className="bg-red-500 text-white text-[9px] px-1 rounded-full font-mono">
                  {stats.unpaid11} متبقي
                </span>
              )}
            </button>

            {/* يوم 25 */}
            <button
              onClick={() => setDayFilter(dayFilter === '25' ? 'all' : '25')}
              className={`px-2 py-1 rounded-lg border transition text-center shrink-0 flex items-center gap-1.5 ${
                dayFilter === '25'
                  ? 'bg-primary text-primary-foreground border-primary font-bold shadow-sm'
                  : 'bg-background hover:bg-muted text-foreground'
              }`}
              style={{ borderColor: cardBdr }}
            >
              <span>يوم 25:</span>
              <span className="font-mono font-bold">{stats.count25}</span>
              {stats.unpaid25 > 0 && (
                <span className="bg-red-500 text-white text-[9px] px-1 rounded-full font-mono">
                  {stats.unpaid25} متبقي
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── فلاتر التحكم وأدوات الإجراءات الجماعية (Compact Control Panel) ── */}
        <div
          className="rounded-xl p-2.5 border space-y-2"
          style={{ backgroundColor: cardBg, borderColor: cardBdr }}
        >
          {/* سطر البحث وحالة السداد */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* حقل البحث */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث بالرقم أو اسم العميل أو التاجر..."
                className="w-full pr-8 pl-3 py-1.5 text-xs rounded-lg border outline-none transition focus:border-primary"
                style={{
                  backgroundColor: innerBg,
                  borderColor: cardBdr,
                  color: textC,
                }}
              />
            </div>

            {/* أزرار فلتر حالة السداد */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
              <button
                onClick={() => setPaymentFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs transition border ${
                  paymentFilter === 'all'
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'hover:bg-muted'
                }`}
                style={{ borderColor: cardBdr, color: paymentFilter === 'all' ? undefined : mutC }}
              >
                الكل ({stats.total})
              </button>
              <button
                onClick={() => setPaymentFilter('unpaid')}
                className={`px-2.5 py-1 rounded-lg text-xs transition border flex items-center gap-1 ${
                  paymentFilter === 'unpaid'
                    ? 'bg-red-500 text-white border-red-500 font-semibold'
                    : 'hover:bg-muted text-red-500'
                }`}
                style={{ borderColor: cardBdr }}
              >
                <span>لم يسدد</span>
                <span className="font-mono text-[10px] bg-black/20 px-1 rounded-full">
                  {stats.unpaid}
                </span>
              </button>
              <button
                onClick={() => setPaymentFilter('paid')}
                className={`px-2.5 py-1 rounded-lg text-xs transition border flex items-center gap-1 ${
                  paymentFilter === 'paid'
                    ? 'bg-emerald-600 text-white border-emerald-600 font-semibold'
                    : 'hover:bg-muted text-emerald-500'
                }`}
                style={{ borderColor: cardBdr }}
              >
                <span>تم الدفع</span>
                <span className="font-mono text-[10px] bg-black/20 px-1 rounded-full">
                  {stats.paid}
                </span>
              </button>
            </div>
          </div>

          {/* سطر الإجراءات الجماعية السريعة */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t text-xs" style={{ borderColor: cardBdr }}>
            <span className="text-[11px]" style={{ color: mutC }}>
              عرض <strong className="font-mono text-foreground">{filteredLines.length}</strong> من أصل{' '}
              <span className="font-mono">{stats.total}</span> خط ريد
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              {isAdmin && (
                <button
                  onClick={handleResetCycleToUnpaid}
                  className="px-2 py-1 rounded-lg border text-[11px] text-amber-500 hover:bg-amber-500/10 transition flex items-center gap-1"
                  style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}
                  title="إعادة ضبط الكل كغير مسدد لبداية دورة جديدة"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span className="hidden sm:inline">تصفير الدورة لشهر جديد</span>
                </button>
              )}

              <button
                onClick={handleMarkAllFilteredAsPaid}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium transition flex items-center gap-1 shadow-sm"
                title="تأكيد سداد الأرقام المعروضة حالياً"
              >
                <CheckCheck className="w-3 h-3" />
                <span>تأكيد سداد المعروض ({filteredLines.filter(l => l.payment_status !== 'paid').length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── قائمة بطاقات الخطوط المضغوطة (Invariance Compact Cards) ── */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">جاري استرجاع خطوط التجديد...</span>
          </div>
        ) : filteredLines.length === 0 ? (
          <div
            className="rounded-xl p-8 border text-center space-y-2"
            style={{ backgroundColor: cardBg, borderColor: cardBdr }}
          >
            <ShieldAlert className="w-8 h-8 mx-auto text-muted-foreground opacity-60" />
            <h3 className="text-sm font-bold" style={{ color: textC }}>
              لا توجد أرقام تطابق الفلتر الحالي
            </h3>
            <p className="text-xs max-w-sm mx-auto" style={{ color: mutC }}>
              تأكد من اختيار التبويب المناسب، أو قم بإضافة أرقام مؤهلة في قسم فودافون ريد بيزنس VIP ليتم إدراجها فور تحويلها.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredLines.map(line => {
              const isPaid = line.payment_status === 'paid';
              const isCancelled = line.payment_status === 'cancelled';

              return (
                <div
                  key={line.id}
                  className="rounded-lg p-1.5 sm:p-2 border transition duration-150 hover:border-primary/40 relative overflow-hidden flex flex-col gap-1 shadow-xs"
                  style={{
                    backgroundColor: cardBg,
                    borderColor: isPaid
                      ? 'rgba(16, 185, 129, 0.3)'
                      : isCancelled
                      ? cardBdr
                      : 'rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {/* شريط حالة السداد الجانبي */}
                  <div
                    className={`absolute top-0 right-0 bottom-0 w-1 ${
                      isPaid ? 'bg-emerald-500' : isCancelled ? 'bg-muted' : 'bg-red-500'
                    }`}
                  />

                  {/* السطر الأول: رقم الهاتف + اسم العميل + موعد التجديد */}
                  <div className="flex items-center justify-between gap-2 pr-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      {/* رقم الهاتف */}
                      <span className="font-mono font-bold text-sm" style={{ color: textC }}>
                        {line.phone_number}
                      </span>

                      {/* اسم العميل مع زر التعديل السريع */}
                      <button
                        onClick={() => setEditingCustomerLine(line)}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border transition hover:border-primary max-w-[160px] truncate"
                        style={{
                          backgroundColor: innerBg,
                          borderColor: cardBdr,
                          color: line.customer_name ? textC : mutC,
                        }}
                        title="انقر لتعديل اسم العميل"
                      >
                        <User className="w-3 h-3 text-primary shrink-0" />
                        <span className="truncate">
                          {line.customer_name || '+ أضف اسم العميل'}
                        </span>
                        <Edit2 className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                      </button>

                      {/* شارة التاجر (إن وجد) */}
                      {line.merchant ? (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium truncate max-w-[140px]"
                          style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            borderColor: 'rgba(245, 158, 11, 0.3)',
                            color: '#f59e0b',
                          }}
                        >
                          <Building2 className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{line.merchant.name}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">بدون تاجر</span>
                      )}

                      {/* باقة الخط وسعره */}
                      <button
                        type="button"
                        onClick={() => setEditingPackageLine(line)}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border font-black transition hover:border-[#E60000] bg-[#E60000]/10 border-[#E60000]/30 text-[#E60000]"
                        title="انقر لتعديل باقة وسعر الخط"
                      >
                        <Package className="w-3 h-3 shrink-0" />
                        <span>
                          {VIP_RED_PACKAGES[line.package_tier || '100gb']?.gigabytes || 100} جيجا ({Number(line.package_price) || VIP_RED_PACKAGES[line.package_tier || '100gb']?.price || 450} ج.م)
                        </span>
                        <Edit2 className="w-2.5 h-2.5 opacity-70" />
                      </button>

                      {/* باسورد أنا فودافون المسجل من العميل أو التاجر */}
                      {line.ana_vodafone_password && (
                        <div className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md border bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-300">
                          <KeyRound className="w-3 h-3 text-purple-500 shrink-0" />
                          <span>باسورد أنا فودافون: <strong>{line.ana_vodafone_password}</strong></span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(line.ana_vodafone_password || '');
                              toast.success('تم نسخ باسورد أنا فودافون');
                            }}
                            className="p-0.5 hover:bg-purple-500/20 rounded transition"
                            title="نسخ الباسورد"
                          >
                            <Copy className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* موعد التجديد */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditingDayLine(line)}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 transition ${
                          line.activation_day
                            ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}
                        title="انقر لتعديل موعد التجديد (7، 11، 25)"
                      >
                        <Calendar className="w-3 h-3" />
                        <span>
                          {line.activation_day ? `يوم ${line.activation_day}` : 'حدد موعداً'}
                        </span>
                        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                      </button>
                    </div>
                  </div>

                  {/* السطر الثاني: معلومات الرصيد + شارة الحالة + أزرار الإجراءات */}
                  <div className="flex items-center justify-between gap-2 pr-2 pt-1 border-t text-xs" style={{ borderColor: cardBdr }}>
                    {/* معلومات الرصيد وحالة السداد الحالية */}
                    <div className="flex items-center gap-2 truncate">
                      {/* شارة حالة السداد */}
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>تم الدفع والتجديد</span>
                        </span>
                      ) : isCancelled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                          <span>ملغي / متوقف</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20 animate-pulse">
                          <AlertCircle className="w-3 h-3" />
                          <span>لم يسدد المبلغ</span>
                        </span>
                      )}

                      {/* رصيد الخط إن وجد */}
                      {line.last_line_info?.balance && (
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                          الرصيد: <strong className="font-mono text-foreground">{line.last_line_info.balance} ج.م</strong>
                        </span>
                      )}
                    </div>

                    {/* أزرار الإجراءات السريعة (تأكيد الدفع / حذف) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleTogglePaymentStatus(line)}
                        className={`h-6.5 px-2 rounded-md text-[10px] sm:text-[11px] font-bold transition flex items-center gap-1 active:scale-95 shadow-xs ${
                          isPaid
                            ? 'border border-border bg-background hover:bg-muted text-muted-foreground'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                        title={isPaid ? 'إعادة ضبط كـ لم يسدد' : 'تأكيد استلام المبلغ وتجديد الخط'}
                      >
                        {isPaid ? (
                          <>
                            <Coins className="w-3 h-3" />
                            <span>تراجع لم يسدد</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>تأكيد الدفع والتجديد</span>
                          </>
                        )}
                      </button>

                      {/* زر حذف الخط من المراقبة */}
                      <button
                        onClick={() => setDeletingLine(line)}
                        className="p-1 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition"
                        title="حذف الخط"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* حوار تعديل اسم العميل */}
      <EditCustomerModal
        isOpen={!!editingCustomerLine}
        line={editingCustomerLine}
        onClose={() => setEditingCustomerLine(null)}
        onSaved={updated => {
          setLines(prev => prev.map(l => (l.id === updated.id ? updated : l)));
        }}
        isLight={L}
      />

      {/* حوار تعديل موعد التجديد (7، 11، 25) */}
      <EditDayModal
        isOpen={!!editingDayLine}
        line={editingDayLine}
        onClose={() => setEditingDayLine(null)}
        onSaved={updated => {
          setLines(prev => prev.map(l => (l.id === updated.id ? updated : l)));
        }}
        isLight={L}
      />

      {/* حوار تعديل الباقة والسعر */}
      <EditPackageModal
        isOpen={!!editingPackageLine}
        line={editingPackageLine}
        onClose={() => setEditingPackageLine(null)}
        onSaved={updated => {
          setLines(prev => prev.map(l => (l.id === updated.id ? updated : l)));
        }}
        isLight={L}
      />

      {/* حوار الفاتورة التفصيلية لدورات التجديد */}
      <ItemizedInvoiceModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        lines={lines}
        initialDay={dayFilter === '7' ? 7 : dayFilter === '11' ? 11 : dayFilter === '25' ? 25 : 'all'}
        isLight={L}
      />

      {/* حوار تأكيد حذف الخط */}
      {deletingLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-sm rounded-xl p-4 shadow-xl border"
            style={{ backgroundColor: cardBg, borderColor: cardBdr, color: textC }}
          >
            <div className="flex items-center gap-2 text-red-500 pb-2 mb-2 border-b" style={{ borderColor: cardBdr }}>
              <Trash2 className="w-4 h-4" />
              <span className="font-bold text-sm">تأكيد حذف الرقم</span>
            </div>
            <p className="text-xs mb-4" style={{ color: mutC }}>
              هل أنت متأكد من حذف الرقم{' '}
              <strong className="font-mono text-foreground font-bold">{deletingLine.phone_number}</strong> نهائياً من قائمة التجديدات والمراقبة؟
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingLine(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs rounded-lg border transition hover:bg-muted"
                style={{ borderColor: cardBdr, color: mutC }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteLine}
                disabled={isDeleting}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition shadow flex items-center gap-1.5"
              >
                {isDeleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'نعم، احذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
