/**
 * SingleLineInvoiceModal — نافذة استخراج فاتورة فردية بريميوم لكل رقم ريد VIP
 */

import React, { useMemo } from 'react';
import {
  X, Printer, Download, Share2, Copy, CheckCircle2, Clock,
  Crown, Calendar, Phone, User, Building2, Package, ShieldCheck,
  FileText, AlertCircle, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import type { VipRedLine } from '@/types/vipRed';
import { VIP_RED_PACKAGES } from '@/types/vipRed';

interface SingleLineInvoiceModalProps {
  isOpen: boolean;
  line: VipRedLine | null;
  onClose: () => void;
  isLight: boolean;
  onPaymentStatusChanged?: (updatedLine: VipRedLine) => void;
}

export const SingleLineInvoiceModal: React.FC<SingleLineInvoiceModalProps> = ({
  isOpen,
  line,
  onClose,
  isLight,
}) => {
  // حساب تواريخ الدورة والتجديد بدقة
  const invoiceData = useMemo(() => {
    if (!line) return null;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-based
    const currentDay = now.getDate();

    const activationDay = line.activation_day || 11;

    // تاريخ التجديد للشهر الحالي
    const thisMonthRenewal = new Date(currentYear, currentMonth, activationDay, 0, 0, 0);

    // إذا كان تاريخ اليوم بعد تاريخ التجديد للشهر الحالي بأكثر من يومين، فالتجديد المستهدف القادم في الشهر التالي
    let targetRenewalDate: Date;
    let cycleMonthName: string;

    if (currentDay > activationDay) {
      // موعد التجديد لهذا الشهر قد مضى، فالموعد القادم هو الشهر التالي
      targetRenewalDate = new Date(currentYear, currentMonth + 1, activationDay, 0, 0, 0);
    } else {
      // موعد التجديد لهذا الشهر قادم
      targetRenewalDate = thisMonthRenewal;
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const formattedRenewalDate = `${pad(targetRenewalDate.getDate())}/${pad(targetRenewalDate.getMonth() + 1)}/${targetRenewalDate.getFullYear()}`;
    const formattedCurrentDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

    // حساب الأيام المتبقية
    const diffTime = targetRenewalDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const pkgKey = line.package_tier || '100gb';
    const pkgDef = VIP_RED_PACKAGES[pkgKey] || VIP_RED_PACKAGES['100gb'];
    const price = Number(line.package_price) || pkgDef.price || 450;

    const invoiceNo = `VR-${targetRenewalDate.getFullYear()}${pad(targetRenewalDate.getMonth() + 1)}-${line.phone_number.slice(-6)}`;

    const isPaid = line.payment_status === 'paid';
    const isRenewed = line.bundle_status === 'renewed';

    return {
      invoiceNo,
      issueDate: formattedCurrentDate,
      renewalDate: formattedRenewalDate,
      diffDays,
      activationDay,
      pkgDef,
      price,
      isPaid,
      isRenewed,
      customerName: line.customer_name || 'عميل فودافون ريد VIP',
      merchantName: line.merchant?.name || 'الإدارة المباشرة',
    };
  }, [line]);

  if (!isOpen || !line || !invoiceData) return null;

  const bg = isLight ? '#ffffff' : '#0f172a';
  const innerBg = isLight ? '#f8fafc' : '#1e293b';
  const border = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';
  const textC = isLight ? '#0f172a' : '#f8fafc';
  const mutC = isLight ? '#64748b' : '#94a3b8';

  // طباعة الفاتورة
  const handlePrint = () => {
    window.print();
  };

  // نسخ ملخص الفاتورة
  const handleCopyText = () => {
    const text = `🧾 فاتورة اشتراك فودافون ريد VIP
━━━━━━━━━━━━━━━━━━━━
📌 رقم الفاتورة: ${invoiceData.invoiceNo}
📱 رقم الهاتف: ${line.phone_number}
👤 العميل: ${invoiceData.customerName}
🏢 التاجر: ${invoiceData.merchantName}
📦 الباقة: ${invoiceData.pkgDef.name}
💰 قيمة الاشتراك: ${invoiceData.price} ج.م
📅 موعد التجديد: ${invoiceData.renewalDate} (يوم ${invoiceData.activationDay})
💳 حالة السداد: ${invoiceData.isPaid ? 'تم سداد المبلغ بالكامل ✅' : 'مستحق السداد ⏳'}
🔄 حالة التجديد: ${invoiceData.isRenewed ? 'تم تجديد الباقة بنجاح ✨' : 'بانتظار ميعاد التجديد 📅'}
━━━━━━━━━━━━━━━━━━━━
منصة فودافون فكة بريميوم VIP`;

    navigator.clipboard.writeText(text);
    toast.success('تم نسخ تفاصيل الفاتورة بنجاح!');
  };

  // مشاركة عبر واتساب
  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(`🧾 فاتورة اشتراك فودافون ريد VIP
━━━━━━━━━━━━━━━━━━━━
📌 رقم الفاتورة: ${invoiceData.invoiceNo}
📱 رقم الخط: ${line.phone_number}
👤 العميل: ${invoiceData.customerName}
📦 الباقة: ${invoiceData.pkgDef.name}
💰 المبلغ المستحق: ${invoiceData.price} ج.م
📅 تاريخ التجديد: ${invoiceData.renewalDate}
💳 حالة الدفع: ${invoiceData.isPaid ? 'مدفوع ومسدد بالكامل ✅' : 'مستحق السداد برجاء الدفع ⏳'}
━━━━━━━━━━━━━━━━━━━━
شكراً لاختياركم فودافون ريد VIP`);

    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // تنزيل ملف الفاتورة بتنسيق HTML مستقل قابل للفتح والحفظ كـ PDF
  const handleDownloadHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>فاتورة_${line.phone_number}_${invoiceData.invoiceNo}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", Tahoma, sans-serif; background: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }
    .invoice-card { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px rgba(0,0,0,0.05); overflow: hidden; }
    .header { background: linear-gradient(135deg, #E60000 0%, #b30000 100%); color: #ffffff; padding: 24px; display: flex; justify-content: space-between; align-items: center; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon { width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
    .brand h1 { margin: 0; font-size: 20px; font-weight: 900; }
    .brand p { margin: 2px 0 0; font-size: 12px; opacity: 0.9; }
    .invoice-meta { text-align: left; }
    .invoice-meta h2 { margin: 0; font-size: 14px; letter-spacing: 1px; font-family: monospace; }
    .invoice-meta p { margin: 3px 0 0; font-size: 11px; opacity: 0.85; }
    .content { padding: 24px; }
    .status-banner { padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 13px; }
    .status-paid { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .status-unpaid { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
    .info-box label { font-size: 11px; color: #64748b; display: block; margin-bottom: 4px; font-weight: bold; }
    .info-box span { font-size: 14px; font-weight: bold; color: #0f172a; }
    .table-box { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; text-align: right; }
    th { background: #f8fafc; padding: 10px 14px; font-size: 12px; color: #475569; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .total-row { background: #f8fafc; font-weight: 900; font-size: 15px; color: #E60000; }
    .footer { text-align: center; padding: 16px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
    @media print { body { padding: 0; background: #ffffff; } .invoice-card { box-shadow: none; border: none; max-width: 100%; } }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div class="brand">
        <div class="brand-icon">👑</div>
        <div>
          <h1>فودافون ريد VIP</h1>
          <p>Vodafone Red Business Enterprise</p>
        </div>
      </div>
      <div class="invoice-meta">
        <h2>${invoiceData.invoiceNo}</h2>
        <p>تاريخ الإصدار: ${invoiceData.issueDate}</p>
      </div>
    </div>

    <div class="content">
      <div class="status-banner ${invoiceData.isPaid ? 'status-paid' : 'status-unpaid'}">
        <span>${invoiceData.isPaid ? '✅ تم سداد الفاتورة بالكامل (خلو طرف)' : '⏳ فاتورة مطالبة — مستحق السداد'}</span>
        <span>موعد التجديد: ${invoiceData.renewalDate}</span>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <label>رقم الخط المشترك</label>
          <span style="font-family: monospace; font-size: 16px; letter-spacing: 1px;">${line.phone_number}</span>
        </div>
        <div class="info-box">
          <label>اسم المشترك / العميل</label>
          <span>${invoiceData.customerName}</span>
        </div>
        <div class="info-box">
          <label>التاجر المسؤول</label>
          <span>${invoiceData.merchantName}</span>
        </div>
        <div class="info-box">
          <label>موعد تجديد الدورة الشهرية</label>
          <span>يوم ${invoiceData.activationDay} من كل شهر (${invoiceData.renewalDate})</span>
        </div>
      </div>

      <div class="table-box">
        <table>
          <thead>
            <tr>
              <th>الوصف والخدمة</th>
              <th>سعة الباقة</th>
              <th>حالة التجديد</th>
              <th style="text-align: left;">المبلغ (ج.م)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>اشتراك باقة فودافون ريد بيزنس الشهري</td>
              <td>${invoiceData.pkgDef.gigabytes} جيجا + دمج باقات</td>
              <td>${invoiceData.isRenewed ? 'تم التجديد بنجاح' : 'بانتظار دورة التجديد'}</td>
              <td style="text-align: left; font-weight: bold;">${invoiceData.price}.00</td>
            </tr>
            <tr>
              <td>رسوم الدعم الفني والمراقبة الذكية</td>
              <td>شامل</td>
              <td>مفعل</td>
              <td style="text-align: left; font-weight: bold;">0.00</td>
            </tr>
            <tr class="total-row">
              <td colspan="3">الإجمالي النهائي المستحق:</td>
              <td style="text-align: left;">${invoiceData.price}.00 ج.م</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="footer">
      منصة فودافون فكة بريميوم VIP — هذه الفاتورة معتمدة ومصدرة رسمياً من نظام مراقبة وتجديد خطوط ريد
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `فاتورة_${line.phone_number}_${invoiceData.invoiceNo}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('تم تنزيل ملف الفاتورة بنجاح!');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 print:p-0 print:bg-white"
      dir="rtl"
    >
      <div
        className="w-full max-w-lg max-h-[92vh] rounded-2xl border flex flex-col shadow-2xl overflow-hidden print:max-w-none print:max-h-none print:border-none print:shadow-none"
        style={{ backgroundColor: bg, borderColor: border }}
      >
        {/* شريط الإجراءات العلوي (مخفي عند الطباعة) */}
        <div
          className="p-3 border-b flex items-center justify-between gap-2 shrink-0 print:hidden"
          style={{ borderColor: border, backgroundColor: innerBg }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#E60000] text-white flex items-center justify-center shadow-xs shrink-0">
              <Crown className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black truncate" style={{ color: textC }}>
                فاتورة خط ريد VIP فردية
              </h3>
              <p className="text-[10px] text-muted-foreground truncate">
                رقم الفاتورة: <strong className="font-mono">{invoiceData.invoiceNo}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="h-7 px-2 rounded-lg border text-xs font-bold flex items-center gap-1 transition active:scale-95 hover:bg-muted"
              style={{ borderColor: border, color: textC }}
              title="طباعة الفاتورة"
            >
              <Printer className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">طباعة</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="h-7 px-2 rounded-lg border text-xs font-bold flex items-center gap-1 transition active:scale-95 hover:bg-muted"
              style={{ borderColor: border, color: textC }}
              title="تنزيل الفاتورة HTML"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">تنزيل</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="h-7 px-2 rounded-lg border text-xs font-bold flex items-center gap-1 transition active:scale-95 text-emerald-600 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
              title="مشاركة الفاتورة عبر واتساب"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">واتساب</span>
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              className="h-7 px-2 rounded-lg border text-xs font-bold flex items-center gap-1 transition active:scale-95 hover:bg-muted"
              style={{ borderColor: border, color: textC }}
              title="نسخ ملخص الفاتورة"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold hover:bg-muted transition-all active:scale-95 shrink-0"
              style={{ borderColor: border, color: textC }}
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* جسم الفاتورة القابل للتمرير والطباعة */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 print:p-0">
          {/* ترويسة الفاتورة الفاخرة */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#E60000] to-[#b30000] text-white flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-xl shrink-0">
                👑
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-wide">فودافون ريد VIP</h2>
                <p className="text-[11px] text-white/85">Enterprise Business Member Line</p>
              </div>
            </div>
            <div className="text-left font-mono">
              <span className="text-xs font-bold block bg-black/25 px-2 py-0.5 rounded-md text-white/95">
                {invoiceData.invoiceNo}
              </span>
              <span className="text-[10px] text-white/80 block mt-1">
                تاريخ الإصدار: {invoiceData.issueDate}
              </span>
            </div>
          </div>

          {/* شريط حالة السداد وموعد التجديد الرسمي */}
          <div
            className={`p-3 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-bold ${
              invoiceData.isPaid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {invoiceData.isPaid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>تم سداد المبلغ بالكامل ✅ (خلو طرف للدورة الحالية)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>فاتورة مطالبة مالية ⚠️ (مستحق السداد)</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                موعد التجديد: <strong className="font-mono">{invoiceData.renewalDate}</strong> (يوم {invoiceData.activationDay})
              </span>
            </div>
          </div>

          {/* شبكة معلومات الخط والمشترك */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-xl border space-y-1" style={{ background: innerBg, borderColor: border }}>
              <span className="text-[10px] font-bold block" style={{ color: mutC }}>
                رقم الهاتف المشترك
              </span>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm sm:text-base font-black tracking-wide" style={{ color: textC }} dir="ltr">
                  {line.phone_number}
                </span>
                <Phone className="w-3.5 h-3.5 text-primary" />
              </div>
            </div>

            <div className="p-3 rounded-xl border space-y-1" style={{ background: innerBg, borderColor: border }}>
              <span className="text-[10px] font-bold block" style={{ color: mutC }}>
                اسم المشترك / العميل
              </span>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold truncate" style={{ color: textC }}>
                  {invoiceData.customerName}
                </span>
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>

            <div className="p-3 rounded-xl border space-y-1" style={{ background: innerBg, borderColor: border }}>
              <span className="text-[10px] font-bold block" style={{ color: mutC }}>
                التاجر المسؤول
              </span>
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold truncate" style={{ color: textC }}>
                  {invoiceData.merchantName}
                </span>
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>

            <div className="p-3 rounded-xl border space-y-1" style={{ background: innerBg, borderColor: border }}>
              <span className="text-[10px] font-bold block" style={{ color: mutC }}>
                حالة تجديد الباقة
              </span>
              <div className="flex items-center justify-between">
                <span className={`text-xs sm:text-sm font-bold truncate ${invoiceData.isRenewed ? 'text-emerald-500' : 'text-blue-500'}`}>
                  {invoiceData.isRenewed ? 'تم التجديد بنجاح ✨' : `بانتظار التجديد (${invoiceData.renewalDate})`}
                </span>
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              </div>
            </div>
          </div>

          {/* جدول بنود الفاتورة والرسوم المالية */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: border }}>
            <table className="w-full text-xs">
              <thead style={{ background: innerBg }}>
                <tr className="border-b" style={{ borderColor: border }}>
                  <th className="py-2.5 px-3 text-right font-bold" style={{ color: mutC }}>بند الاشتراك والخدمة</th>
                  <th className="py-2.5 px-3 text-center font-bold" style={{ color: mutC }}>السعة والمميزات</th>
                  <th className="py-2.5 px-3 text-left font-bold" style={{ color: mutC }}>المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: border }}>
                <tr>
                  <td className="py-3 px-3">
                    <p className="font-bold" style={{ color: textC }}>اشتراك فودافون ريد VIP الشهري</p>
                    <p className="text-[10px]" style={{ color: mutC }}>يشمل إدارة الخط والربط بنظام البيزنس</p>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                      {invoiceData.pkgDef.name}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-left font-mono font-bold" style={{ color: textC }}>
                    {invoiceData.price}.00 ج.م
                  </td>
                </tr>

                <tr>
                  <td className="py-3 px-3">
                    <p className="font-bold" style={{ color: textC }}>الدعم الفني والفحص التلقائي المستمر</p>
                    <p className="text-[10px]" style={{ color: mutC }}>مراقبة التحويل وتنبيهات مواعيد التجديد</p>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="text-[10px] font-bold text-emerald-500">مجاناً</span>
                  </td>
                  <td className="py-3 px-3 text-left font-mono font-bold text-emerald-500">
                    0.00 ج.م
                  </td>
                </tr>

                <tr style={{ background: innerBg }}>
                  <td colSpan={2} className="py-3 px-3 font-black text-xs sm:text-sm" style={{ color: textC }}>
                    الإجمالي النهائي المستحق:
                  </td>
                  <td className="py-3 px-3 text-left font-mono font-black text-sm sm:text-base text-[#E60000]">
                    {invoiceData.price}.00 ج.م
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ختم رسمي وتوقيع المنصة */}
          <div className="p-3 rounded-xl border border-dashed flex items-center justify-between gap-3 text-xs" style={{ borderColor: border }}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <p className="font-black" style={{ color: textC }}>منظومة فودافون ريد VIP المعتمدة</p>
                <p className="text-[10px]" style={{ color: mutC }}>
                  إيصال رسمي صادر عن نظام الإدارة لمتابعة سداد ودورات التجديد
                </p>
              </div>
            </div>

            {/* ختم الحالة الجرافيكي */}
            <div className={`px-3 py-1 rounded-lg border-2 text-center rotate-[-3deg] font-black text-[11px] uppercase tracking-wider shrink-0 ${
              invoiceData.isPaid
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10'
                : 'border-red-500 text-red-500 bg-red-500/10'
            }`}>
              {invoiceData.isPaid ? 'PAID / مسدد' : 'UNPAID / غير مسدد'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
