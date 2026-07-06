/**
 * PrintHtmlBuilder — تحويل بيانات الفاتورة إلى HTML للطباعة
 * يدعم: 58mm, 80mm, وطباعة عامة عبر Android Print Dialog
 */
import type { InvoiceData, PaperWidth } from './types';

const LOGO_URL = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-bkii4kb9ihvk/app-ck2v94t1nev5/20260623/file_00000000191471f49ddde7c1651efc02.png';

export function buildPrintHtml(invoice: InvoiceData, paperWidth: PaperWidth = 80): string {
  const mmWidth = paperWidth === 58 ? '58mm' : '80mm';

  const rows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'رقم العملية',   value: invoice.opNumber != null ? `#${invoice.opNumber}` : '—', bold: true },
    { label: 'الحالة',         value: invoice.status === 'success' ? 'ناجحة ✓' : invoice.status === 'failed' ? 'فاشلة ✗' : 'معلقة' },
    { label: '─────────────', value: '─────────────' },
    { label: 'المنتج',         value: invoice.productName },
    { label: 'الفئة',          value: invoice.category },
    { label: 'سعر الكارت',    value: invoice.cardPrice, bold: true },
    { label: 'عدد الوحدات',   value: invoice.units },
    ...(invoice.validity ? [{ label: 'صلاحية الكارت', value: invoice.validity }] : []),
    { label: '─────────────', value: '─────────────' },
    { label: 'رقم الهاتف',    value: invoice.receiverPhone, bold: true },
    { label: 'تاريخ التنفيذ', value: invoice.date },
    { label: 'وقت التنفيذ',   value: invoice.time },
    { label: 'طريقة التنفيذ', value: invoice.via },
    ...(invoice.merchantName ? [{ label: 'التاجر', value: invoice.merchantName }] : []),
  ];

  const rowsHtml = rows.map(r => {
    if (r.label.startsWith('─')) {
      return `<tr><td colspan="2" class="sep">${'─'.repeat(22)}</td></tr>`;
    }
    return `
      <tr>
        <td class="lbl">${r.label}</td>
        <td class="val${r.bold ? ' bold' : ''}">${r.value}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>فاتورة شحن — Vodafone Fakka</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Cairo', 'Arial', sans-serif;
    direction: rtl;
    width: ${mmWidth};
    margin: 0 auto;
    padding: 4px;
    background: #fff;
    color: #000;
    font-size: 10pt;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #000;
    padding-bottom: 6px;
    margin-bottom: 6px;
  }
  .logo {
    width: 48px;
    height: 48px;
    object-fit: contain;
    margin-bottom: 2px;
  }
  .app-name {
    font-size: 13pt;
    font-weight: 900;
    letter-spacing: 0.5px;
  }
  .app-sub {
    font-size: 7.5pt;
    color: #444;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  td {
    padding: 2px 1px;
    font-size: 9.5pt;
    vertical-align: top;
  }
  .lbl {
    color: #555;
    width: 45%;
    white-space: nowrap;
  }
  .val {
    color: #000;
    word-break: break-word;
    text-align: left;
  }
  .val.bold {
    font-weight: 700;
  }
  .sep {
    color: #999;
    font-size: 8pt;
    text-align: center;
    padding: 1px 0;
    letter-spacing: 2px;
  }
  .footer {
    border-top: 1px dashed #999;
    margin-top: 8px;
    padding-top: 6px;
    text-align: center;
    font-size: 8pt;
    color: #555;
  }
  @media print {
    @page {
      size: ${mmWidth} auto;
      margin: 0;
    }
    body { width: ${mmWidth}; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="header">
  <img class="logo" src="${LOGO_URL}" alt="Vodafone Fakka" onerror="this.style.display='none'" />
  <div class="app-name">Vodafone Fakka</div>
  <div class="app-sub">vodafone-fakka.app</div>
</div>

<table>${rowsHtml}</table>

<div class="footer">
  <div>شكراً لاستخدامك Vodafone Fakka</div>
  <div>Thank you for using Vodafone Fakka</div>
</div>
</body>
</html>`;
}
