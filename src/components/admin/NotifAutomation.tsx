// لوحة الإشعارات التلقائية — إدارة قواعد التشغيل التلقائي
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, ChevronDown, ChevronUp, Zap, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getAutomationRules, toggleAutomationRule, updateAutomationRule, type AutomationRule } from '@/lib/api';
import DeepLinkSelect from './DeepLinkSelect';

const TRIGGER_GROUPS = [
  {
    label: 'الاشتراك',
    icon: '💳',
    events: ['subscription_expiry_7d','subscription_expiry_3d','subscription_expiry_24h','subscription_expiry_6h','subscription_expiry_1h','subscription_expired','subscription_activated'],
  },
  {
    label: 'المدفوعات',
    icon: '💰',
    events: ['payment_approved','payment_rejected'],
  },
  {
    label: 'التحديثات',
    icon: '⬇',
    events: ['new_version'],
  },
  {
    label: 'الاستخدام اليومي',
    icon: '📅',
    events: ['daily_limit_reached','daily_reset'],
  },
  {
    label: 'الرصيد',
    icon: '💵',
    events: ['balance_added','balance_deducted'],
  },
  {
    label: 'الحساب',
    icon: '👤',
    events: ['account_suspended','account_reactivated'],
  },
  {
    label: 'أخرى',
    icon: '📢',
    events: ['maintenance_start','news','offer'],
  },
];

const NOTIF_TYPES = [
  { value: 'info',                   label: 'معلومة' },
  { value: 'message',                label: 'رسالة' },
  { value: 'system',                 label: 'نظام' },
  { value: 'announcement',           label: 'إعلان' },
  { value: 'offer',                  label: 'عرض' },
  { value: 'security',               label: 'أمان' },
  { value: 'maintenance',            label: 'صيانة' },
  { value: 'subscription_renewal',   label: 'تجديد اشتراك' },
  { value: 'subscription_expiry',    label: 'انتهاء اشتراك' },
  { value: 'subscription_activated', label: 'تفعيل اشتراك' },
  { value: 'subscription_failed',    label: 'فشل اشتراك' },
  { value: 'update_available',       label: 'تحديث' },
  { value: 'operation',              label: 'عملية' },
];

interface EditingRule {
  id: string;
  title_template: string;
  body_template: string;
  type: string;
  priority: string;
  action_url: string;
}

export default function NotifAutomation() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingRule | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAutomationRules();
    setRules(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (rule: AutomationRule) => {
    setToggling(rule.id);
    const { error } = await toggleAutomationRule(rule.id, !rule.enabled);
    if (error) toast.error('خطأ في التحديث');
    else {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      toast.success(rule.enabled ? 'تم التعطيل' : 'تم التفعيل');
    }
    setToggling(null);
  };

  const startEdit = (rule: AutomationRule) => {
    setEditing({
      id: rule.id,
      title_template: rule.title_template,
      body_template: rule.body_template,
      type: rule.type,
      priority: rule.priority,
      action_url: rule.action_url ?? '',
    });
    setExpandedId(rule.id);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await updateAutomationRule(editing.id, {
      title_template: editing.title_template,
      body_template: editing.body_template,
      type: editing.type,
      priority: editing.priority,
      action_url: editing.action_url || null,
    });
    if (error) toast.error('خطأ في الحفظ');
    else {
      toast.success('تم حفظ القاعدة');
      setEditing(null);
      setExpandedId(null);
      load();
    }
    setSaving(false);
  };

  const enabledCount = rules.filter(r => r.enabled).length;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">{rules.length} قاعدة</Badge>
        <Badge variant="outline" className="text-[10px] border-success/40 text-success">{enabledCount} مفعّلة</Badge>
        <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">{rules.length - enabledCount} معطّلة</Badge>
        <p className="text-xs text-muted-foreground mr-auto hidden md:block">
          الإشعارات التلقائية تُرسل عند وقوع الحدث المحدد تلقائياً
        </p>
      </div>

      {/* Groups */}
      {TRIGGER_GROUPS.map(group => {
        const groupRules = rules.filter(r => group.events.includes(r.trigger_event));
        if (groupRules.length === 0) return null;
        return (
          <div key={group.label} className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
              <span className="text-base">{group.icon}</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{group.label}</span>
              <Badge variant="outline" className="text-[10px] mr-auto">
                {groupRules.filter(r => r.enabled).length}/{groupRules.length}
              </Badge>
            </div>
            <div className="divide-y divide-border/50">
              {groupRules.map(rule => {
                const isExpanded = expandedId === rule.id;
                const isEditing = editing?.id === rule.id;
                return (
                  <div key={rule.id} className="bg-card">
                    {/* Rule header */}
                    <div className="flex items-center gap-3 p-3">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(rule)}
                        disabled={toggling === rule.id}
                        className={cn(
                          'relative w-10 h-5 rounded-full transition-colors duration-200 shrink-0',
                          rule.enabled ? 'bg-primary' : 'bg-muted',
                          toggling === rule.id && 'opacity-50'
                        )}
                      >
                        {toggling === rule.id
                          ? <Loader2 className="w-3 h-3 animate-spin absolute top-1 left-1 text-white" />
                          : <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200', rule.enabled ? 'right-0.5' : 'left-0.5')} />
                        }
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Bell className="w-3 h-3 text-primary shrink-0" />
                          <p className="text-xs font-semibold truncate">{rule.label}</p>
                          <Badge variant="outline" className={cn('text-[10px]',
                            rule.priority === 'urgent' ? 'border-destructive/40 text-destructive' :
                            rule.priority === 'important' ? 'border-warning/40 text-warning' :
                            'border-muted-foreground/30 text-muted-foreground'
                          )}>
                            {rule.priority === 'urgent' ? 'عاجل' : rule.priority === 'important' ? 'مهم' : 'عادي'}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{rule.title_template}</p>
                      </div>

                      {/* Expand / Edit */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-primary"
                          onClick={() => { if (isEditing) { setEditing(null); setExpandedId(null); } else startEdit(rule); }}>
                          {isEditing ? 'إلغاء' : 'تعديل'}
                        </Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7"
                          onClick={() => setExpandedId(isExpanded && !isEditing ? null : rule.id)}>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>

                    {/* Expanded edit form */}
                    {isExpanded && isEditing && editing && (
                      <div className="px-4 pb-4 space-y-3 bg-muted/20 border-t border-border">
                        <div className="pt-3 space-y-1.5">
                          <Label className="text-xs font-normal text-muted-foreground">العنوان</Label>
                          <Input value={editing.title_template} onChange={e => setEditing(prev => prev ? { ...prev, title_template: e.target.value } : prev)}
                            className="bg-background border-border h-9 text-sm" />
                          <p className="text-[10px] text-muted-foreground">يدعم: {'{username}'}, {'{days}'}, {'{version}'}</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-normal text-muted-foreground">المحتوى</Label>
                          <Textarea value={editing.body_template} onChange={e => setEditing(prev => prev ? { ...prev, body_template: e.target.value } : prev)}
                            className="bg-background border-border resize-none text-sm" rows={2} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-normal text-muted-foreground">النوع</Label>
                            <Select value={editing.type} onValueChange={v => setEditing(prev => prev ? { ...prev, type: v } : prev)}>
                              <SelectTrigger className="bg-card border-border h-9 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent className="max-h-48">
                                {NOTIF_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-normal text-muted-foreground">الأولوية</Label>
                            <Select value={editing.priority} onValueChange={v => setEditing(prev => prev ? { ...prev, priority: v } : prev)}>
                              <SelectTrigger className="bg-card border-border h-9 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="normal">عادي</SelectItem>
                                <SelectItem value="important">مهم</SelectItem>
                                <SelectItem value="urgent">عاجل</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-normal text-muted-foreground">الرابط عند الضغط</Label>
                          <DeepLinkSelect value={editing.action_url} onChange={v => setEditing(prev => prev ? { ...prev, action_url: v } : prev)} />
                        </div>
                        <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-9 text-sm gap-2"
                          onClick={handleSave} disabled={saving}>
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" />حفظ التعديلات</>}
                        </Button>
                      </div>
                    )}

                    {/* Expanded preview (read-only) */}
                    {isExpanded && !isEditing && (
                      <div className="px-4 pb-4 bg-muted/10 border-t border-border space-y-2 pt-3">
                        <div className="flex gap-4 flex-wrap text-xs">
                          <span><span className="text-muted-foreground">الحدث: </span><code className="bg-muted/60 px-1 rounded text-[10px] font-mono">{rule.trigger_event}</code></span>
                          <span><span className="text-muted-foreground">الرابط: </span><span className="text-primary">{rule.action_url ?? '—'}</span></span>
                        </div>
                        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                          <p className="text-xs font-semibold flex items-center gap-1.5"><Zap className="w-3 h-3 text-primary" />{rule.title_template}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">{rule.body_template}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
