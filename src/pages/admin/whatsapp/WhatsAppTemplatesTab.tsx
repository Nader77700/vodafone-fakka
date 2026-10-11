/**
 * WhatsAppTemplatesTab — إدارة ومطابقة قوالب Meta المعتمدة والمعاينة الآمنة
 */
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  FileCheck2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Info,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import type { WhatsAppConfig } from './types';

interface Props {
  config?: WhatsAppConfig | null;
}

interface TemplateDef {
  categoryKey: string;
  categoryTitle: string;
  templateName: string;
  language: string;
  metaApprovalStatus: 'approved' | 'unverified' | 'pending';
  requiredVariables: string[];
  description: string;
  samplePreview: string;
}

const TEMPLATES: TemplateDef[] = [
  {
    categoryKey: 'conversion',
    categoryTitle: 'إشعار تحويل الخط إلى فودافون RED',
    templateName: 'red_conversion_success',
    language: 'ar',
    metaApprovalStatus: 'unverified',
    requiredVariables: ['اسم العميل', 'رقم الهاتف', 'وقت وتاريخ التحويل'],
    description: 'يُرسل للعميل فور نجاح فحص الخط وتأكيد تحويله لنظام فودافون ريد بيزنس VIP.',
    samplePreview: 'مرحباً نادر أكرم، يسعدنا إبلاغك بأنه تم بنجاح تحويل خطك 01012345678 إلى باقة فودافون ريد بيزنس VIP بتاريخ اليوم الساعة 10:30 ص. خطك الآن جاهز للاستخدام والتفعيل.',
  },
  {
    categoryKey: 'renewal_lead',
    categoryTitle: 'تذكير التجديد المسبق (قبل الموعد بيومين)',
    templateName: 'red_renewal_lead_reminder',
    language: 'ar',
    metaApprovalStatus: 'unverified',
    requiredVariables: ['اسم العميل', 'رقم الهاتف', 'تاريخ التجديد', 'مبلغ الباقة'],
    description: 'يُرسل تلقائياً قبل يومين من تاريخ التجديد (يوم 5، 9، 23) لتذكير العميل بموعد الشحن.',
    samplePreview: 'عزيزي نادر أكرم، نود تذكيرك بأن موعد تجديد باقة خطك 01012345678 يوافق 2026-10-25 بمبلغ 350 ج.م. يرجى التأكد من جاهزية الرصيد لضمان استمرار الباقة.',
  },
  {
    categoryKey: 'renewal_same_day',
    categoryTitle: 'تذكير يوم التجديد نفسه',
    templateName: 'red_renewal_due_today',
    language: 'ar',
    metaApprovalStatus: 'unverified',
    requiredVariables: ['اسم العميل', 'رقم الهاتف', 'تاريخ اليوم', 'مبلغ الباقة'],
    description: 'يُرسل صباح موعد التجديد (يوم 7، 11، 25) للخطوط المستحقة.',
    samplePreview: 'صباح الخير نادر أكرم، اليوم هو موعد تجديد باقة فودافون ريد للخط 01012345678 بمبلغ 350 ج.م. جاري التجديد اليوم.',
  },
  {
    categoryKey: 'renewal_confirmed',
    categoryTitle: 'تأكيد تجديد الباقة رسمياً',
    templateName: 'red_renewal_confirmed',
    language: 'ar',
    metaApprovalStatus: 'unverified',
    requiredVariables: ['اسم العميل', 'رقم الهاتف', 'تاريخ التجديد'],
    description: 'يُرسل فقط عند تسجيل حدث تأكيد تجديد الباقة الفعلي في النظام (bundle_renewed_at).',
    samplePreview: 'تم بنجاح تجديد باقة فودافون ريد لخطك 01012345678 لدورة هذا الشهر. شكراً لثقتكم بنا.',
  },
  {
    categoryKey: 'invoice_due',
    categoryTitle: 'تذكير استحقاق الفاتورة',
    templateName: 'red_invoice_due_alert',
    language: 'ar',
    metaApprovalStatus: 'unverified',
    requiredVariables: ['اسم العميل', 'رقم الهاتف', 'المبلغ المستحق', 'تاريخ الاستحقاق'],
    description: 'يُرسل للخطوط غير المسددة عند حلول موعد الفاتورة. يُلغى تلقائياً فور تسجيل السداد.',
    samplePreview: 'تنبيه استحقاق: فاتورة خطك 01012345678 بمبلغ 350 ج.م مستحقة السداد اليوم. يرجى السداد لتجنب انقطاع الخدمة.',
  },
  {
    categoryKey: 'payment_confirmed',
    categoryTitle: 'تأكيد استلام سداد الفاتورة',
    templateName: 'red_payment_confirmed',
    language: 'ar',
    metaApprovalStatus: 'unverified',
    requiredVariables: ['اسم العميل', 'رقم الهاتف', 'المبلغ المسدد'],
    description: 'يُرسل فور تأكيد تسجيل السداد للخط أو الفاتورة في النظام.',
    samplePreview: 'شكراً لك نادر أكرم، تم بنجاح استلام سداد فاتورة الخط 01012345678 بمبلغ 350 ج.م. تم تحديث حسابك.',
  },
];

export function WhatsAppTemplatesTab({ config }: Props = {}) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDef | null>(null);

  // Check if any template is approved in Meta WABA connection details
  const metaTemplates: any[] = config?.connection_details?.templates?.items || [];
  const isMetaConnected = config?.last_connection_status === 'success';

  const getTemplateMetaStatus = (templateName: string) => {
    if (!isMetaConnected) {
      return {
        label: 'بحاجة لتوثيق Meta',
        variant: 'outline' as const,
        isApproved: false,
      };
    }
    const found = metaTemplates.find((t: any) => t.name === templateName);
    if (!found) {
      return {
        label: 'غير موجود في Meta',
        variant: 'destructive' as const,
        isApproved: false,
      };
    }
    if (found.status === 'APPROVED') {
      return {
        label: 'مُعتمد في Meta (APPROVED)',
        variant: 'default' as const,
        isApproved: true,
      };
    }
    return {
      label: `حالة Meta: ${found.status}`,
      variant: 'outline' as const,
      isApproved: false,
    };
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Notice Card */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-amber-900 dark:text-amber-300">
          <div className="font-semibold text-sm">تنبيه اعتماد القوالب في Meta Business Manager</div>
          <p>
            تتطلب منصة WhatsApp Business Cloud API إنشاء هذه القوالب واعتمادها رسمياً من شركة Meta أولاً قبل إمكانية إرسالها للعملاء خارج نافذة الـ 24 ساعة.
            القوالب المدرجة أدناه تظهر بحالة <Badge variant="outline" className="text-[10px] mx-1 border-amber-500/50">غير معتمد / بحاجة لتوثيق Meta</Badge> لتجنب أي ادعاء غير حقيقي بالاعتماد.
          </p>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEMPLATES.map((tmpl) => (
          <Card key={tmpl.categoryKey} className="border-border flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold">{tmpl.categoryTitle}</CardTitle>
                  <div className="font-mono text-xs text-primary mt-1">{tmpl.templateName}</div>
                </div>
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40 shrink-0">
                  بحاجة لتوثيق Meta
                </Badge>
              </div>
              <CardDescription className="text-xs pt-2">
                {tmpl.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg space-y-1">
                <span className="font-semibold text-foreground">المتغيرات المطلوبة (Variables):</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {tmpl.requiredVariables.map((v, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {`{{${i + 1}}}`} {v}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-[11px] text-muted-foreground">اللغة: {tmpl.language === 'ar' ? 'العربية (ar)' : tmpl.language}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTemplate(tmpl)}
                  className="gap-1.5 text-xs text-primary"
                >
                  <Eye className="w-3.5 h-3.5" />
                  معاينة آمنة للقالب
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Safe Preview Modal */}
      <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              معاينة آمنة للقالب: {selectedTemplate?.templateName}
            </DialogTitle>
            <DialogDescription className="text-xs">
              معاينة توضيحية ببيانات نموذجية آمنة. هذه المعاينة لا ترسل أي رسائل حقيقية للعملاء.
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-4">
              {/* WhatsApp Bubble Preview */}
              <div className="p-4 rounded-xl bg-muted/60 border border-border">
                <div className="max-w-[85%] bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/20 text-foreground p-3.5 rounded-2xl rounded-tr-none text-xs leading-relaxed shadow-sm">
                  <div className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1 text-[11px]">
                    فودافون ريد بيزنس VIP
                  </div>
                  <p>{selectedTemplate.samplePreview}</p>
                  <div className="text-[10px] text-muted-foreground text-left mt-2">
                    10:30 ص ✓✓
                  </div>
                </div>
              </div>

              <div className="text-xs space-y-1.5 text-muted-foreground">
                <div className="font-semibold text-foreground">تعليمات الاعتماد في Meta:</div>
                <p>1. ادخل إلى Meta Business Manager ثم قسم WhatsApp Manager &gt; Message Templates.</p>
                <p>2. أنشئ قالباً بالاسم: <code className="text-primary font-mono">{selectedTemplate.templateName}</code> باللغة العربية.</p>
                <p>3. عيّن المتغيرات المرقمة <code className="text-primary font-mono">{'{{1}}'}</code> حسب ترتيب الحقول الموضح أعلاه.</p>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedTemplate(null)}>
                  إغلاق المعاينة
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
