import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Send,
  AlertCircle,
  FileText,
  MessageSquare,
  ShieldAlert,
  Info,
  CheckCircle2,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import type { WhatsAppConfig, WhatsAppMessageType } from './types';

interface Props {
  config: WhatsAppConfig | null;
  onSendMessage: (payload: {
    recipient_phone: string;
    message_type: WhatsAppMessageType;
    template_name?: string;
    template_language?: string;
    template_variables?: string[];
    body_text?: string;
  }) => Promise<{ success: boolean; wamid?: string; error?: string }>;
  onViewLogs: () => void;
}

export function WhatsAppSendSettingsTab({
  config,
  onSendMessage,
  onViewLogs,
}: Props) {
  const [recipientPhone, setRecipientPhone] = useState('');
  const [messageType, setMessageType] = useState<WhatsAppMessageType>('template');
  const [templateName, setTemplateName] = useState('hello_world');
  const [templateLang, setTemplateLang] = useState('ar');
  const [variables, setVariables] = useState<string[]>([]);
  const [newVar, setNewVar] = useState('');
  const [bodyText, setBodyText] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    wamid?: string;
    error?: string;
    phone?: string;
  } | null>(null);

  const handleAddVariable = () => {
    if (!newVar.trim()) return;
    setVariables([...variables, newVar.trim()]);
    setNewVar('');
  };

  const handleRemoveVariable = (idx: number) => {
    setVariables(variables.filter((_, i) => i !== idx));
  };

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientPhone.trim()) {
      toast.error('يرجى إدخال رقم هاتف المستلم');
      return;
    }
    if (messageType === 'text' && !bodyText.trim()) {
      toast.error('يرجى كتابة نص الرسالة');
      return;
    }
    if (messageType === 'template' && !templateName.trim()) {
      toast.error('يرجى تحديد اسم القالب');
      return;
    }
    setConfirmOpen(true);
  };

  const handleExecuteSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setLastResult(null);

    try {
      const res = await onSendMessage({
        recipient_phone: recipientPhone.trim(),
        message_type: messageType,
        template_name: messageType === 'template' ? templateName.trim() : undefined,
        template_language: messageType === 'template' ? templateLang.trim() : undefined,
        template_variables: messageType === 'template' ? variables : undefined,
        body_text: messageType === 'text' ? bodyText.trim() : undefined,
      });

      setLastResult({
        success: res.success,
        wamid: res.wamid,
        error: res.error,
        phone: recipientPhone.trim(),
      });

      if (res.success) {
        toast.success(`تم قبول الرسالة من Meta بنجاح! WAMID: ${res.wamid}`);
      } else {
        toast.error(res.error || 'فشل إرسال الرسالة من Meta');
      }
    } catch (err: any) {
      toast.error(err?.message || 'خطأ أثناء الإرسال');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Notice on Phase 1 Boundary */}
      <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 flex items-start gap-3">
        <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-foreground">حدود المرحلة الأولى (Phase 1 Scope)</p>
          <p className="text-muted-foreground leading-relaxed">
            الإرسال متاح هنا حصرياً للاختبار اليدوي والتحقق المعتمد. الإرسال الآلي المرتبط بأحداث التطبيق (مثل تأكيد الشحن، تنبيهات التجديد، إشعارات Vodafone Cash) مؤجل بالكامل إلى المرحلة الثانية ولن يتم تفعيله حتى تكتمل الاختبارات وتعتمد القوالب.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                إرسال رسالة اختبارية يدوية
              </CardTitle>
              <CardDescription className="text-xs">
                إرسال فحصي آمن للتأكد من وصول الرسائل وتتبع WAMID وحالات التسليم
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleOpenConfirm} className="space-y-5">
                {/* Recipient Phone */}
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-medium flex items-center justify-between">
                    <span>رقم هاتف المستلم (مع كود الدولة)</span>
                    <span className="text-muted-foreground text-[11px]">يتم تحويل 01xxxxxxxxx تلقائياً إلى 201xxxxxxxxx</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="phone"
                      placeholder="01012345678 أو 201012345678"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      className="font-mono text-xs dir-ltr text-right pl-9"
                    />
                    <Phone className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  </div>
                </div>

                {/* Message Type Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">نوع الرسالة</Label>
                  <RadioGroup
                    value={messageType}
                    onValueChange={(val) => setMessageType(val as WhatsAppMessageType)}
                    className="grid grid-cols-2 gap-3"
                  >
                    <label
                      htmlFor="type_template"
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        messageType === 'template'
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted/30'
                      }`}
                    >
                      <RadioGroupItem value="template" id="type_template" className="mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <FileText className="w-3.5 h-3.5 text-primary" />
                          <span>قالب معتمد (Template)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          موصى به؛ يفتح محادثة دون حاجة لمراسلة سابقة من المستخدم
                        </p>
                      </div>
                    </label>

                    <label
                      htmlFor="type_text"
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        messageType === 'text'
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted/30'
                      }`}
                    >
                      <RadioGroupItem value="text" id="type_text" className="mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                          <span>نص حر (Session Message)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          يتطلب نافذة محادثة نشطة خلال آخر 24 ساعة من قِبل المستخدم
                        </p>
                      </div>
                    </label>
                  </RadioGroup>
                </div>

                {/* Template Fields */}
                {messageType === 'template' && (
                  <div className="space-y-4 p-4 rounded-xl border border-border/80 bg-muted/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="template_name" className="text-xs font-medium">اسم القالب (Template Name)</Label>
                        <Input
                          id="template_name"
                          placeholder="hello_world"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          className="font-mono text-xs dir-ltr text-right"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="template_lang" className="text-xs font-medium">كود اللغة (Language Code)</Label>
                        <Input
                          id="template_lang"
                          placeholder="ar أو en_US"
                          value={templateLang}
                          onChange={(e) => setTemplateLang(e.target.value)}
                          className="font-mono text-xs dir-ltr text-right"
                        />
                      </div>
                    </div>

                    {/* Template Variables */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center justify-between">
                        <span>متغيرات نص القالب (Body Parameters)</span>
                        <span className="text-[11px] text-muted-foreground">تُستبدل بـ {'{{1}}'}, {'{{2}}'}, ...</span>
                      </Label>

                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="أدخل قيمة المتغير التالي..."
                          value={newVar}
                          onChange={(e) => setNewVar(e.target.value)}
                          className="text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddVariable();
                            }
                          }}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={handleAddVariable} className="gap-1 text-xs shrink-0">
                          <Plus className="w-3.5 h-3.5" />
                          إضافة
                        </Button>
                      </div>

                      {variables.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {variables.map((v, i) => (
                            <Badge key={i} variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs">
                              <span className="font-mono text-primary font-bold">#{i + 1}:</span>
                              <span>{v}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveVariable(i)}
                                className="text-muted-foreground hover:text-rose-400 mr-1"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Text Message Field */}
                {messageType === 'text' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="body_text" className="text-xs font-medium">نص الرسالة</Label>
                      <span className="text-[11px] text-muted-foreground font-mono">{bodyText.length}/1000</span>
                    </div>
                    <Textarea
                      id="body_text"
                      rows={4}
                      placeholder="اكتب نص الرسالة هنا..."
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      className="text-xs resize-none"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={sending}
                  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Send className={`w-4 h-4 ${sending ? 'animate-spin' : ''}`} />
                  {sending ? 'جارٍ الإرسال إلى Meta...' : 'إرسال الرسالة الاختبارية'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Guidelines & Last Result */}
        <div className="space-y-6">
          {/* Rules Card */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                قواعد الإرسال عبر Cloud API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="font-bold text-primary">•</span>
                <span>
                  <strong>نافذة الـ 24 ساعة:</strong> لا يمكن إرسال رسائل نصية حرة (Text) إلا إذا أرسل المستخدم رسالة أولاً خلال 24 ساعة.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-primary">•</span>
                <span>
                  <strong>القوالب المعتمدة:</strong> لبدء المحادثات من طرف النظام، يجب استخدام قوالب معتمدة مسبقاً في Meta Business Manager.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-primary">•</span>
                <span>
                  <strong>قالب hello_world:</strong> متاح تلقائياً في كل حسابات WhatsApp Business الجديدة لاختبار الإرسال دون انتظار اعتماد.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Result Card if any */}
          {lastResult && (
            <Card className={`border ${lastResult.success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold flex items-center gap-2">
                  {lastResult.success ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">نجح الإرسال المبدئي</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                      <span className="text-rose-400">فشل الإرسال</span>
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {lastResult.success ? (
                  <>
                    <p className="text-muted-foreground">
                      قبلت Meta الرسالة برقم المعرّف (WAMID):
                    </p>
                    <div className="p-2 rounded bg-background/80 font-mono text-[10px] break-all border border-border">
                      {lastResult.wamid}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onViewLogs}
                      className="w-full text-xs mt-2"
                    >
                      متابعة الحالة في سجل الرسائل
                    </Button>
                  </>
                ) : (
                  <p className="text-rose-400/90 leading-relaxed font-mono text-[11px]">
                    {lastResult.error}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              تأكيد إرسال رسالة WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs">
              يرجى مراجعة التفاصيل قبل الإرسال إلى رقم الهاتف المستهدف:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="flex justify-between p-2 rounded bg-muted/40">
              <span className="text-muted-foreground">المستلم:</span>
              <span className="font-mono font-bold dir-ltr">{recipientPhone}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-muted/40">
              <span className="text-muted-foreground">نوع الرسالة:</span>
              <span className="font-medium">{messageType === 'template' ? 'قالب WhatsApp' : 'نص حر'}</span>
            </div>
            {messageType === 'template' && (
              <div className="flex justify-between p-2 rounded bg-muted/40">
                <span className="text-muted-foreground">اسم القالب:</span>
                <span className="font-mono font-medium">{templateName}</span>
              </div>
            )}
            {messageType === 'text' && (
              <div className="p-2 rounded bg-muted/40 space-y-1">
                <span className="text-muted-foreground block">محتوى النص:</span>
                <p className="font-normal text-foreground line-clamp-3">{bodyText}</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleExecuteSend} className="bg-primary text-primary-foreground">
              تأكيد وإرسال الآن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
