// لوحة إرسال إشعار Premium — مع Preview + عداد + Multi-select + قوالب
import { useState, useEffect, useCallback } from 'react';
import {
  Bell, Send, Loader2, BookTemplate, Save, ChevronDown, ChevronUp, Eye, EyeOff,
  AlertCircle, Info, Zap, Tag, Megaphone, Settings, Shield, Wrench, CreditCard,
  RefreshCw, Download, CheckCircle2, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  sendNotification, sendNotificationBulk,
  getNotificationTemplates, saveNotificationTemplate, deleteNotificationTemplate,
  type NotificationTemplate,
} from '@/lib/api';
import UserPickerSheet from './UserPickerSheet';
import DeepLinkSelect from './DeepLinkSelect';

const NOTIF_TYPES = [
  { value: 'info',                  label: 'معلومة',        icon: Info,          color: 'text-success' },
  { value: 'message',               label: 'رسالة',         icon: MessageSquare, color: 'text-primary' },
  { value: 'system',                label: 'نظام',          icon: Settings,      color: 'text-info' },
  { value: 'announcement',          label: 'إعلان',         icon: Megaphone,     color: 'text-info' },
  { value: 'offer',                 label: 'عرض',           icon: Tag,           color: 'text-success' },
  { value: 'security',              label: 'أمان',          icon: Shield,        color: 'text-destructive' },
  { value: 'maintenance',           label: 'صيانة',         icon: Wrench,        color: 'text-warning' },
  { value: 'subscription_renewal',  label: 'تجديد اشتراك', icon: CreditCard,    color: 'text-primary' },
  { value: 'subscription_expiry',   label: 'انتهاء اشتراك',icon: RefreshCw,     color: 'text-destructive' },
  { value: 'subscription_activated',label: 'تفعيل اشتراك', icon: CheckCircle2,  color: 'text-success' },
  { value: 'subscription_failed',   label: 'فشل اشتراك',   icon: AlertCircle,   color: 'text-destructive' },
  { value: 'update_available',      label: 'تحديث',         icon: Download,      color: 'text-info' },
  { value: 'operation',             label: 'عملية',         icon: Zap,           color: 'text-primary' },
];

interface NotifComposerProps {
  onSent?: () => void;
}

export default function NotifComposer({ onSent }: NotifComposerProps) {
  const [targetType, setTargetType] = useState<'all' | 'specific' | 'multiple'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [priority, setPriority] = useState('normal');
  const [actionUrl, setActionUrl] = useState('');
  const [sendPush, setSendPush] = useState(true);
  const [sending, setSending] = useState(false);

  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    const data = await getNotificationTemplates();
    setTemplates(data);
    setTemplatesLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const applyTemplate = (t: NotificationTemplate) => {
    setTitle(t.title);
    setBody(t.body);
    setType(t.type);
    setPriority(t.priority);
    setActionUrl(t.action_url ?? '');
    setShowTemplates(false);
    toast.success(`تم تطبيق القالب: ${t.name}`);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !title.trim()) { toast.error('أدخل اسم القالب والعنوان'); return; }
    setSavingTemplate(true);
    const { error } = await saveNotificationTemplate({ name: templateName, title, body, type, priority, action_url: actionUrl || null });
    if (error) toast.error('خطأ في الحفظ');
    else { toast.success('تم حفظ القالب'); setTemplateName(''); setShowSaveTemplate(false); loadTemplates(); }
    setSavingTemplate(false);
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { toast.error('أكمل العنوان والمحتوى'); return; }
    if ((targetType === 'specific' || targetType === 'multiple') && selectedUserIds.length === 0) {
      toast.error('اختر مستخدماً واحداً على الأقل'); return;
    }
    setSending(true);
    try {
      if (targetType === 'all') {
        const { error } = await sendNotification({ title, body, type, priority, action_url: actionUrl || undefined, is_global: true, send_push: sendPush });
        if (error) { toast.error('خطأ في الإرسال'); return; }
        toast.success('تم الإرسال للجميع');
      } else {
        const result = await sendNotificationBulk(selectedUserIds, { title, body, type, priority, action_url: actionUrl || undefined, send_push: sendPush });
        toast.success(`تم الإرسال: ${result.sent} نجح, ${result.failed} فشل`);
      }
      setTitle(''); setBody(''); setActionUrl('');
      setTargetType('all'); setSelectedUserIds([]);
      onSent?.();
    } finally { setSending(false); }
  };

  const currentType = NOTIF_TYPES.find(t => t.value === type) ?? NOTIF_TYPES[0];
  const TypeIcon = currentType.icon;
  const titleCount = title.length;
  const bodyCount = body.length;

  return (
    <div className="space-y-4">

      {/* Templates bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-8 text-xs border-border gap-1.5"
          onClick={() => setShowTemplates(v => !v)}>
          <BookTemplate className="w-3.5 h-3.5" />
          القوالب ({templates.length})
          {showTemplates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs border-border gap-1.5"
          onClick={() => setShowPreview(v => !v)}>
          {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showPreview ? 'إخفاء المعاينة' : 'معاينة'}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs border-border gap-1.5"
          onClick={() => setShowSaveTemplate(v => !v)}>
          <Save className="w-3.5 h-3.5" /> حفظ قالب
        </Button>
      </div>

      {/* Templates list */}
      {showTemplates && (
        <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">القوالب المحفوظة</p>
          {templatesLoading ? (
            <div className="flex justify-center py-3"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">لا توجد قوالب محفوظة</p>
          ) : templates.map(t => (
            <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{t.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{t.title}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-primary" onClick={() => applyTemplate(t)}>تطبيق</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-destructive"
                  onClick={async () => { await deleteNotificationTemplate(t.id); loadTemplates(); toast.success('تم الحذف'); }}>
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save template form */}
      {showSaveTemplate && (
        <div className="flex gap-2 items-center">
          <Input value={templateName} onChange={e => setTemplateName(e.target.value)}
            placeholder="اسم القالب..." className="bg-background border-border h-9 text-sm flex-1" />
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-3" onClick={handleSaveTemplate} disabled={savingTemplate}>
            {savingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'حفظ'}
          </Button>
        </div>
      )}

      {/* Notification Preview */}
      {showPreview && (title || body) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">معاينة الإشعار</p>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border shadow-sm">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border', currentType.color, 'bg-current/10 border-current/20')}>
              <TypeIcon className={cn('w-5 h-5', currentType.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold truncate">{title || 'عنوان الإشعار'}</p>
                <span className="text-[10px] text-muted-foreground shrink-0">الآن</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 text-pretty">{body || 'محتوى الإشعار...'}</p>
              {actionUrl && (
                <p className="text-[10px] text-primary mt-1 font-mono truncate">🔗 {actionUrl}</p>
              )}
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', currentType.color, 'bg-current/10 border-current/20')}>{currentType.label}</span>
                {priority !== 'normal' && (
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium',
                    priority === 'urgent' ? 'text-destructive bg-destructive/10 border-destructive/20' : 'text-warning bg-warning/10 border-warning/20'
                  )}>{priority === 'urgent' ? 'عاجل' : 'مهم'}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Target */}
      <div className="space-y-1.5">
        <Label className="text-sm font-normal text-muted-foreground">المستهدف</Label>
        <Select value={targetType} onValueChange={v => { setTargetType(v as typeof targetType); setSelectedUserIds([]); }}>
          <SelectTrigger className="bg-card border-border h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">👥 جميع المستخدمين</SelectItem>
            <SelectItem value="multiple">✅ مستخدمون محددون (Multi-select)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Multi-user picker */}
      {(targetType === 'specific' || targetType === 'multiple') && (
        <div className="space-y-1.5">
          <Label className="text-sm font-normal text-muted-foreground">
            اختر المستخدمين
            {selectedUserIds.length > 0 && (
              <Badge variant="outline" className="mr-2 text-[10px] border-primary/40 text-primary">{selectedUserIds.length} محدد</Badge>
            )}
          </Label>
          <UserPickerSheet selectedIds={selectedUserIds} onSelect={setSelectedUserIds} />
        </div>
      )}

      {/* Title + char counter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-normal text-muted-foreground">العنوان</Label>
          <span className={cn('text-[10px] tabular-nums', titleCount > 60 ? 'text-destructive' : 'text-muted-foreground')}>
            {titleCount}/65
          </span>
        </div>
        <Input className="bg-background border-border" value={title}
          onChange={e => setTitle(e.target.value)} placeholder="عنوان الإشعار" maxLength={65} />
      </div>

      {/* Body + char counter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-normal text-muted-foreground">المحتوى</Label>
          <span className={cn('text-[10px] tabular-nums', bodyCount > 230 ? 'text-destructive' : 'text-muted-foreground')}>
            {bodyCount}/240
          </span>
        </div>
        <Textarea className="bg-background border-border resize-none text-sm" rows={3}
          value={body} onChange={e => setBody(e.target.value)}
          placeholder="محتوى الإشعار..." maxLength={240} />
      </div>

      {/* Type + Priority */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-normal text-muted-foreground">النوع</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="bg-card border-border h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-52">
              {NOTIF_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  <span className="flex items-center gap-1.5">
                    <t.icon className={cn('w-3 h-3', t.color)} />
                    {t.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-normal text-muted-foreground">الأولوية</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="bg-card border-border h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">عادي</SelectItem>
              <SelectItem value="important">🔶 مهم</SelectItem>
              <SelectItem value="urgent">🔴 عاجل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Action URL — Deep Link */}
      <div className="space-y-1.5">
        <Label className="text-sm font-normal text-muted-foreground">الرابط عند الضغط (اختياري)</Label>
        <DeepLinkSelect value={actionUrl} onChange={setActionUrl} />
      </div>

      {/* Push toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
        <div>
          <p className="text-sm font-semibold">إرسال Push Notification</p>
          <p className="text-xs text-muted-foreground">إشعار حقيقي حتى عند إغلاق التطبيق</p>
        </div>
        <button
          onClick={() => setSendPush(v => !v)}
          className={cn('relative w-12 h-6 rounded-full transition-colors duration-200', sendPush ? 'bg-primary' : 'bg-muted')}
        >
          <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200', sendPush ? 'right-0.5' : 'left-0.5')} />
        </button>
      </div>

      {/* Send button */}
      <Button
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-bold gap-2 text-sm"
        onClick={handleSend}
        disabled={sending || !title.trim() || !body.trim()}
      >
        {sending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الإرسال…</>
          : <><Bell className="w-4 h-4" /><Send className="w-4 h-4" />
            {targetType === 'all' ? 'إرسال للجميع' : `إرسال لـ ${selectedUserIds.length} مستخدم`}</>
        }
      </Button>
    </div>
  );
}
