import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Radio,
  Copy,
  Check,
  ShieldCheck,
  ExternalLink,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import type { WhatsAppConfig } from './types';

interface Props {
  config: WhatsAppConfig | null;
  onRefresh: () => void;
  onReachabilityCheck: () => Promise<void>;
  checkingReachability: boolean;
}

export function WhatsAppWebhookTab({
  config,
  onRefresh,
  onReachabilityCheck,
  checkingReachability,
}: Props) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const webhookUrl =
    config?.webhook_url ||
    'https://vchmsnavyhripakyvzom.supabase.co/functions/v1/whatsapp-webhook';

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    toast.success('تم نسخ رابط الـ Webhook إلى الحافظة');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner */}
      <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 flex items-start justify-between gap-4">
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-foreground flex items-center gap-2">
            <Radio className="w-4 h-4 text-sky-400" />
            نظام استقبال إشعارات Meta Webhook
          </p>
          <p className="text-muted-foreground leading-relaxed">
            يقوم هذا الـ Webhook باستقبال أحداث تحديثات الحالات الفورية (Sent, Delivered, Read, Failed) وإشعار التحقق (GET Challenge) والتحقق المشفر من توقيع Meta (x-hub-signature-256).
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onReachabilityCheck}
          disabled={checkingReachability}
          className="shrink-0 gap-1.5 text-xs"
        >
          <Activity className={`w-3.5 h-3.5 ${checkingReachability ? 'animate-pulse' : ''}`} />
          {checkingReachability ? 'جارٍ الفحص...' : 'فحص الوصولية'}
        </Button>
      </div>

      {/* Webhook Endpoint Info */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>رابط الـ Webhook الرسمي (Callback URL)</span>
            {config?.webhook_verified ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                تم التوثيق مع Meta
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-xs gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                في انتظار ربط Meta
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            انسخ هذا الرابط وضعه في إعدادات WhatsApp Configuration داخل لوحة تحكم Meta
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-lg bg-muted/40 font-mono text-xs text-foreground flex-1 break-all border border-border dir-ltr text-left">
              {webhookUrl}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyUrl}
              className="gap-1.5 shrink-0 text-xs"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedUrl ? 'تم النسخ' : 'نسخ الرابط'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="p-3 rounded-lg border border-border bg-card space-y-1">
              <span className="text-xs text-muted-foreground block">رمز التحقق (Verify Token)</span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {config?.webhook_verify_token_configured ? 'محفوظ ومُكوّن' : 'غير مُكوّن'}
                </span>
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-card space-y-1">
              <span className="text-xs text-muted-foreground block">التحقق من التوقيع (HMAC-SHA256)</span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {config?.app_secret_configured ? 'نشط وآمن' : 'مطلوب App Secret'}
                </span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-card space-y-1">
              <span className="text-xs text-muted-foreground block">الحقول المشتركة (Webhook Fields)</span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">messages</span>
                <Badge variant="outline" className="text-[10px]">مطلوب</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step by Step Meta Configuration Guide */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">خطوات الربط في لوحة Meta for Developers</CardTitle>
          <CardDescription className="text-xs">
            دليل إعداد الـ Webhook خطوة بخطوة للتحقق من الاتصال بالكامل
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-xs">
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/60">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                1
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">الدخول إلى قسم WhatsApp Configuration</p>
                <p className="text-muted-foreground leading-relaxed">
                  افتح لوحة تحكم التطبيق في Meta Developers، ثم انتقل إلى: <strong>WhatsApp &gt; Configuration &gt; Webhook</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/60">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                2
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">إدخال رابط الاستدعاء ورمز التحقق</p>
                <p className="text-muted-foreground leading-relaxed">
                  اضغط على زر <strong>Edit</strong>، وألصق <strong>Callback URL</strong> الموضح بالأعلى، ثم أدخل نفس قيمة <strong>Verify Token</strong> التي حددتها في تبويب "إعدادات الاتصال".
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/60">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                3
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">حفظ وتوثيق (Verify and Save)</p>
                <p className="text-muted-foreground leading-relaxed">
                  سترسل Meta طلباً فورياً من نوع <code>GET hub.challenge</code> وسيقوم السيرفر بالرد الفوري وتوثيق الرابط تلقائياً.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/60">
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                4
              </span>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">الاشتراك في حقل messages</p>
                <p className="text-muted-foreground leading-relaxed">
                  تحت قسم <strong>Webhook Fields</strong>، اضغط <strong>Manage</strong> وقم بتفعيل خيار <strong>messages</strong> (Subscribe). هذا يضمن وصول إشعارات تسليم الرسائل وقراءتها.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
