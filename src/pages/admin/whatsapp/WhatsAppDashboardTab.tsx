import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Radio,
  Clock,
  Eye,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { WhatsAppConfig, WhatsAppMessage } from './types';

interface Props {
  config: WhatsAppConfig | null;
  messages: WhatsAppMessage[];
  loading: boolean;
  onRefresh: () => void;
  onTestConnection: () => void;
  testingConnection: boolean;
  onSwitchTab: (tab: string) => void;
}

export function WhatsAppDashboardTab({
  config,
  messages,
  loading,
  onRefresh,
  onTestConnection,
  testingConnection,
  onSwitchTab,
}: Props) {
  // Aggregate real stats
  const total = messages.length;
  const accepted = messages.filter((m) => m.status === 'accepted').length;
  const sent = messages.filter((m) => m.status === 'sent').length;
  const delivered = messages.filter((m) => m.status === 'delivered').length;
  const read = messages.filter((m) => m.status === 'read').length;
  const failed = messages.filter((m) => m.status === 'failed').length;

  const deliveredTotal = delivered + read;
  const deliveryRate = total > 0 ? Math.round((deliveredTotal / total) * 100) : 0;
  const readRate = deliveredTotal > 0 ? Math.round((read / deliveredTotal) * 100) : 0;

  // Connection badge helper
  const renderConnBadge = () => {
    const status = config?.last_connection_status || 'untested';
    if (status === 'success') {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 gap-1.5 px-3 py-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          متصل وجاهز
        </Badge>
      );
    }
    if (status === 'incomplete') {
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 gap-1.5 px-3 py-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          إعدادات غير مكتملة
        </Badge>
      );
    }
    if (status === 'insufficient_permissions') {
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 gap-1.5 px-3 py-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          صلاحيات ناقصة
        </Badge>
      );
    }
    if (status === 'failed') {
      return (
        <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30 gap-1.5 px-3 py-1">
          <XCircle className="w-3.5 h-3.5" />
          فشل الاتصال
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground gap-1.5 px-3 py-1">
        <Clock className="w-3.5 h-3.5" />
        لم يُفحص بعد
      </Badge>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner: Status & Quick Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight">نظرة عامة على واتساب للأعمال</h2>
            {renderConnBadge()}
          </div>
          <p className="text-sm text-muted-foreground">
            المرحلة الأولى: بنية تحتية آمنة، فحص اتصال Meta، إرسال اختباري موثق، وتتبع حالات التسليم والقراءة.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="flex-1 md:flex-none gap-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>

          <Button
            size="sm"
            onClick={onTestConnection}
            disabled={testingConnection}
            className="flex-1 md:flex-none gap-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Zap className={`w-3.5 h-3.5 ${testingConnection ? 'animate-pulse' : ''}`} />
            {testingConnection ? 'جارٍ الفحص...' : 'فحص الاتصال مع Meta'}
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Messages */}
        <Card className="border border-border/80 bg-card/60 shadow-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">إجمالي الرسائل المرسلة</CardTitle>
            <Send className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              مقبولة: {accepted + sent}
            </p>
          </CardContent>
        </Card>

        {/* Delivered Rate */}
        <Card className="border border-border/80 bg-card/60 shadow-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">نسبة التسليم الفعلي</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-emerald-500">{deliveryRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              تم التسليم: {deliveredTotal} رسالة
            </p>
          </CardContent>
        </Card>

        {/* Read Rate */}
        <Card className="border border-border/80 bg-card/60 shadow-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">نسبة القراءة الموثقة</CardTitle>
            <Eye className="w-4 h-4 text-sky-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-sky-500">{read}</div>
            <p className="text-xs text-muted-foreground mt-1">
              نسبة القراءة: {readRate}%
            </p>
          </CardContent>
        </Card>

        {/* Failed */}
        <Card className="border border-border/80 bg-card/60 shadow-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">الرسائل الفاشلة</CardTitle>
            <XCircle className="w-4 h-4 text-rose-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-rose-500">{failed}</div>
            <p className="text-xs text-muted-foreground mt-1">
              مؤهلة لإعادة المحاولة اليدوية
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Integration Status Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Meta Connection Card */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-semibold">حالة الاتصال مع Meta</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSwitchTab('connection')}
                className="text-xs gap-1 text-primary hover:text-primary/80"
              >
                تعديل الإعدادات
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              معرفات الربط مع WhatsApp Cloud API ومفاتيح الوصول السرية
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-border/60">
              <span className="text-muted-foreground">App ID:</span>
              <span className="font-mono font-medium">{config?.meta_app_id || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/60">
              <span className="text-muted-foreground">WABA ID:</span>
              <span className="font-mono font-medium">{config?.waba_id || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/60">
              <span className="text-muted-foreground">Phone Number ID:</span>
              <span className="font-mono font-medium">{config?.phone_number_id || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/60">
              <span className="text-muted-foreground">رقم الإرسال المعتمد:</span>
              <span className="font-medium text-emerald-400 dir-ltr">{config?.display_phone_number || 'لم يتم المزامنة بعد'}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">رمز الوصول (Access Token):</span>
              <span>
                {config?.access_token_configured ? (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                    تم الحفظ بأمان على السيرفر
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-rose-400 border-rose-500/30">
                    غير مُكوّن
                  </Badge>
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Status Card */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-sky-400" />
                <CardTitle className="text-base font-semibold">حالة Webhook وتحديثات الحالات</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSwitchTab('webhook')}
                className="text-xs gap-1 text-primary hover:text-primary/80"
              >
                تفاصيل Webhook
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              استقبال تحديثات التسليم والقراءة ورسائل الرد من Meta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-border/60">
              <span className="text-muted-foreground">رابط الاستدعاء (Callback URL):</span>
              <span className="text-emerald-400 font-medium">نشط ومنشور على Edge Functions</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/60">
              <span className="text-muted-foreground">توثيق Meta Webhook (Challenge):</span>
              <span>
                {config?.webhook_verified ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    تم التوثيق بنجاح
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                    في انتظار تأكيد Meta
                  </Badge>
                )}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/60">
              <span className="text-muted-foreground">التحقق من التوقيع الرقمي (x-hub-signature-256):</span>
              <span>
                {config?.app_secret_configured ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    HMAC-SHA256 مفعّل
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-rose-400 border-rose-500/30">
                    Meta App Secret ناقص
                  </Badge>
                )}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">معالجة التكرار (Idempotency):</span>
              <span className="text-emerald-400 font-semibold">مفعلة على مستوى قاعدة البيانات</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Messages Preview */}
      <Card className="border border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">آخر الرسائل الصادرة والواردة</CardTitle>
            <CardDescription className="text-xs">
              عرض أحدث الرسائل وحالاتها المسجلة في السجل
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSwitchTab('messages')}
            className="text-xs gap-1"
          >
            عرض سجل الرسائل كاملاً
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              لا توجد رسائل مسجلة بعد. يمكنك إرسال رسالة اختبارية من تبويب "إعدادات إرسال الرسائل".
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.slice(0, 5).map((msg) => (
                <div key={msg.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold dir-ltr">{msg.recipient_phone}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-2">
                        {msg.message_type === 'template' ? `قالب: ${msg.template_name}` : 'نص مخصص'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {msg.body_text || `قالب WhatsApp: ${msg.template_name || 'بدون اسم'}`}
                    </p>
                  </div>

                  <div className="text-left space-y-1">
                    <div>
                      {msg.status === 'read' && (
                        <Badge className="bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[11px]">
                          تمت القراءة
                        </Badge>
                      )}
                      {msg.status === 'delivered' && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px]">
                          تم التسليم
                        </Badge>
                      )}
                      {msg.status === 'sent' && (
                        <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[11px]">
                          تم الإرسال
                        </Badge>
                      )}
                      {msg.status === 'accepted' && (
                        <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[11px]">
                          مقبولة من Meta
                        </Badge>
                      )}
                      {msg.status === 'failed' && (
                        <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px]">
                          فشل
                        </Badge>
                      )}
                      {msg.status === 'sending' && (
                        <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[11px]">
                          جارٍ الإرسال...
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground block font-mono">
                      {new Date(msg.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
