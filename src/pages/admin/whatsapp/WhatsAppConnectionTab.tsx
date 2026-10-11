import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  KeyRound,
  ShieldCheck,
  Save,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Globe,
  HelpCircle,
  Info,
} from 'lucide-react';
import type { WhatsAppConfig } from './types';

interface Props {
  config: WhatsAppConfig | null;
  onSaveConfig: (data: {
    meta_app_id: string;
    waba_id: string;
    phone_number_id: string;
    display_phone: string;
    graph_api_version: string;
    access_token?: string;
    app_secret?: string;
    webhook_verify_token?: string;
  }) => Promise<boolean>;
  onTestConnection: () => void;
  testingConnection: boolean;
}

export function WhatsAppConnectionTab({
  config,
  onSaveConfig,
  onTestConnection,
  testingConnection,
}: Props) {
  const [metaAppId, setMetaAppId] = React.useState(config?.meta_app_id || '');
  const [wabaId, setWabaId] = React.useState(config?.waba_id || '');
  const [phoneNumberId, setPhoneNumberId] = React.useState(config?.phone_number_id || '');
  const [displayPhone, setDisplayPhone] = React.useState(config?.display_phone_number || '');
  const [apiVersion, setApiVersion] = React.useState(config?.graph_api_version || 'v20.0');

  // Secrets inputs (kept empty by default; only filled if user wants to replace)
  const [accessToken, setAccessToken] = React.useState('');
  const [appSecret, setAppSecret] = React.useState('');
  const [verifyToken, setVerifyToken] = React.useState('');

  const [saving, setSaving] = React.useState(false);

  // Sync if config changes externally
  React.useEffect(() => {
    if (config) {
      setMetaAppId(config.meta_app_id || '');
      setWabaId(config.waba_id || '');
      setPhoneNumberId(config.phone_number_id || '');
      setDisplayPhone(config.display_phone_number || '');
      setApiVersion(config.graph_api_version || 'v20.0');
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        meta_app_id: metaAppId.trim(),
        waba_id: wabaId.trim(),
        phone_number_id: phoneNumberId.trim(),
        display_phone: displayPhone.trim(),
        graph_api_version: apiVersion.trim() || 'v20.0',
      };

      if (accessToken.trim()) payload.access_token = accessToken.trim();
      if (appSecret.trim()) payload.app_secret = appSecret.trim();
      if (verifyToken.trim()) payload.webhook_verify_token = verifyToken.trim();

      const ok = await onSaveConfig(payload);
      if (ok) {
        toast.success('تم حفظ إعدادات الاتصال مع Meta بأمان على السيرفر');
        setAccessToken('');
        setAppSecret('');
        setVerifyToken('');
      }
    } catch (err: any) {
      toast.error(err?.message || 'فشل حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const connectionDetails = config?.connection_details;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Informative Header Banner */}
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-foreground">حماية المفاتيح والأسرار البرمجية</p>
          <p className="text-muted-foreground leading-relaxed">
            يتم تخزين الرموز السرية (Access Token، App Secret، Verify Token) داخل جدول محمي حصرياً لصلاحية السيرفر (service_role). لا تُرسل المفاتيح مطلقاً إلى المتصفح أو التخزين المحلي، ويمكن استبدال أي مفتاح في أي وقت.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Identifiers */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              معرفات تطبيق وحساب Meta
            </CardTitle>
            <CardDescription className="text-xs">
              البيانات المستخرجة من لوحة تحكم Meta for Developers & WhatsApp Business Manager
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="meta_app_id" className="text-xs font-medium">Meta App ID</Label>
                <Input
                  id="meta_app_id"
                  placeholder="مثال: 123456789012345"
                  value={metaAppId}
                  onChange={(e) => setMetaAppId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="waba_id" className="text-xs font-medium">WhatsApp Business Account ID (WABA ID)</Label>
                <Input
                  id="waba_id"
                  placeholder="مثال: 987654321098765"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone_number_id" className="text-xs font-medium">Phone Number ID (معرف رقم الإرسال)</Label>
                <Input
                  id="phone_number_id"
                  placeholder="مثال: 543210987654321"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="display_phone" className="text-xs font-medium">رقم الهاتف الظاهر (Display Phone)</Label>
                <Input
                  id="display_phone"
                  placeholder="+201xxxxxxxxx"
                  value={displayPhone}
                  onChange={(e) => setDisplayPhone(e.target.value)}
                  className="font-mono text-xs dir-ltr text-right"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="graph_version" className="text-xs font-medium">إصدار Graph API</Label>
                <Input
                  id="graph_version"
                  placeholder="v20.0"
                  value={apiVersion}
                  onChange={(e) => setApiVersion(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Secure Credentials */}
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-500" />
              المفاتيح والرموز السرية (Meta Credentials)
            </CardTitle>
            <CardDescription className="text-xs">
              تُحفظ في بيئة السيرفر المشفرة ولا يتم إظهار قيمتها السابقة بعد الحفظ
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Access Token */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="access_token" className="text-xs font-medium">
                  Meta Permanent Access Token (رمز وصول مستخدم النظام الدائم)
                </Label>
                {config?.access_token_configured ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 ml-1" />
                    محفوظ ومُكوّن مسبقاً
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-rose-400 border-rose-500/30 text-[10px]">
                    غير مُكوّن
                  </Badge>
                )}
              </div>
              <Input
                id="access_token"
                type="password"
                placeholder={config?.access_token_configured ? '•••••••••••••••••••••••• (أدخل قيمة جديدة للاستبدال)' : 'EAAB... أدخل رمز الوصول الدائم هنا'}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            {/* App Secret */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="app_secret" className="text-xs font-medium">
                  Meta App Secret (المفتاح السري للتحقق من توقيع الـ Webhook)
                </Label>
                {config?.app_secret_configured ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 ml-1" />
                    محفوظ ومُكوّن مسبقاً
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-rose-400 border-rose-500/30 text-[10px]">
                    غير مُكوّن
                  </Badge>
                )}
              </div>
              <Input
                id="app_secret"
                type="password"
                placeholder={config?.app_secret_configured ? '•••••••••••••••• (أدخل قيمة جديدة للاستبدال)' : 'أدخل App Secret من لوحة Meta'}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            {/* Webhook Verify Token */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="verify_token" className="text-xs font-medium">
                  Webhook Verification Token (رمز التحقق من Webhook)
                </Label>
                {config?.webhook_verify_token_configured ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 ml-1" />
                    محفوظ ومُكوّن مسبقاً
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-rose-400 border-rose-500/30 text-[10px]">
                    غير مُكوّن
                  </Badge>
                )}
              </div>
              <Input
                id="verify_token"
                type="password"
                placeholder={config?.webhook_verify_token_configured ? '•••••••••••••••• (أدخل قيمة جديدة للاستبدال)' : 'اختر كلمة مرور أو رمز سري مطابق لإعداد Meta Webhook'}
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="w-4 h-4" />
            {saving ? 'جارٍ الحفظ بأمان...' : 'حفظ إعدادات الاتصال'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onTestConnection}
            disabled={testingConnection}
            className="w-full sm:w-auto gap-2"
          >
            <Zap className={`w-4 h-4 ${testingConnection ? 'animate-spin' : ''}`} />
            {testingConnection ? 'جارٍ فحص الاتصال مع Meta...' : 'اختبار الاتصال الفعلي الآن'}
          </Button>
        </div>
      </form>

      {/* Live Connection Diagnostics Results */}
      {connectionDetails && (
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span>نتائج فحص الاتصال الأخيرة</span>
              <span className="text-xs text-muted-foreground font-mono">
                {config?.last_connection_test_at
                  ? new Date(config.last_connection_test_at).toLocaleString('ar-EG')
                  : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* App / Token Check */}
              <div className="p-3 rounded-lg border border-border bg-card">
                <span className="text-xs text-muted-foreground block mb-1">صلاحية رمز الوصول (Token)</span>
                {connectionDetails.app_me?.id ? (
                  <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>صالح (App: {connectionDetails.app_me.name || connectionDetails.app_me.id})</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-rose-400 font-medium text-xs">
                    <XCircle className="w-4 h-4" />
                    <span>{connectionDetails.error_message || 'رمز غير صالح أو منتهي'}</span>
                  </div>
                )}
              </div>

              {/* Phone Check */}
              <div className="p-3 rounded-lg border border-border bg-card">
                <span className="text-xs text-muted-foreground block mb-1">رقم الهاتف (Phone ID)</span>
                {connectionDetails.phone_number?.display_phone_number ? (
                  <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="dir-ltr">{connectionDetails.phone_number.display_phone_number}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-400 font-medium text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{connectionDetails.phone_number?.error || 'لم يتم العثور على الرقم'}</span>
                  </div>
                )}
              </div>

              {/* WABA Check */}
              <div className="p-3 rounded-lg border border-border bg-card">
                <span className="text-xs text-muted-foreground block mb-1">حساب الأعمال (WABA)</span>
                {connectionDetails.waba?.id ? (
                  <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>نشط ({connectionDetails.waba.name || connectionDetails.waba.id})</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-400 font-medium text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{connectionDetails.waba?.error || 'لم يتم العثور على حساب الأعمال'}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
