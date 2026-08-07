// لوحة تحكم الأدمن — نظام مكافآت الإحالات
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Trophy, Plus, Pencil, Trash2, Loader2, Users,
  ArrowRightLeft, Gift, Settings2, Check, X,
  BarChart3, Wallet, ChevronDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  rwAdminGetTasks, rwAdminCreateTask, rwAdminUpdateTask, rwAdminDeleteTask,
  rwAdminGetOverview, rwGetRewardSettings, rwUpdateRewardSettings,
  rwAdminGetAllLogs, rwAdminGetAllClaims, rwAdminGetAllTransfers,
  rwAdminGetAllBalances, rwAdminAdjustBalance, rwAdminCancelTransfer,
  type ReferralTask, type ReferralRewardSettings,
} from '@/lib/api';

function fmt(n: number) { return n.toLocaleString('ar-EG'); }
function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

const EMPTY_TASK: Partial<ReferralTask> = {
  title: '', description: '', required_referrals: 10,
  reward_value: 10, daily_limit: 0, is_active: true,
  starts_at: null, ends_at: null,
};

// ══════════ نظرة عامة ══════════
function OverviewCards() {
  const [data, setData] = useState({ total_claimed: 0, total_transferred: 0, pending_claims: 0, active_tasks: 0, active_users_30d: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => { rwAdminGetOverview().then(d => { setData(d); setLoading(false); }); }, []);
  const cards = [
    { label: 'إجمالي المطالبات',        value: data.total_claimed,     icon: Gift },
    { label: 'إجمالي التحويلات',        value: data.total_transferred, icon: ArrowRightLeft },
    { label: 'مطالبات معلقة',           value: data.pending_claims,    icon: Trophy },
    { label: 'مهام نشطة',              value: data.active_tasks,      icon: BarChart3 },
    { label: 'مستخدمون نشطون (30 يوم)', value: data.active_users_30d,  icon: Users },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(c => (
        <Card key={c.label} className="border-border">
          <CardContent className="p-4 space-y-1">
            <c.icon className="w-4 h-4 text-primary" />
            {loading
              ? <div className="h-7 bg-muted rounded animate-pulse mt-1" />
              : <p className="text-2xl font-bold font-mono text-foreground">{fmt(c.value)}</p>}
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ══════════ إدارة المهام ══════════
function TasksManager() {
  const [tasks, setTasks]       = useState<ReferralTask[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dlgOpen, setDlgOpen]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm]         = useState<Partial<ReferralTask>>(EMPTY_TASK);
  const [editId, setEditId]     = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); setTasks(await rwAdminGetTasks()); setLoading(false); }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_TASK); setEditId(null); setDlgOpen(true); };
  const openEdit   = (t: ReferralTask) => { setForm(t); setEditId(t.id); setDlgOpen(true); };

  const handleSave = async () => {
    if (!form.title?.trim()) { toast.error('أدخل عنوان المهمة'); return; }
    setSaving(true);
    const payload = {
      title: form.title!.trim(), description: form.description ?? null,
      required_referrals: Number(form.required_referrals) || 10,
      reward_value: Number(form.reward_value) || 10,
      daily_limit: Number(form.daily_limit) || 0,
      starts_at: form.starts_at ?? null, ends_at: form.ends_at ?? null,
    };
    const res = editId
      ? await rwAdminUpdateTask(editId, { ...payload, is_active: form.is_active })
      : await rwAdminCreateTask(payload);
    if (res.success) { toast.success(editId ? 'تم تعديل المهمة' : 'تم إنشاء المهمة'); setDlgOpen(false); await load(); }
    else toast.error('فشلت العملية');
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await rwAdminDeleteTask(deleteId);
    if (res.success) { toast.success('تم حذف المهمة'); await load(); } else toast.error('فشل الحذف');
    setDeleteId(null);
  };

  const toggleActive = async (t: ReferralTask) => { await rwAdminUpdateTask(t.id, { is_active: !t.is_active }); await load(); };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">المهام ({tasks.length})</h3>
        <Button size="sm" className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> مهمة جديدة
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">جارٍ التحميل...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <Trophy className="w-8 h-8" /><p className="text-sm">لا توجد مهام — أنشئ أولى مهامك</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 min-w-0">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                  <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px] h-5 px-1.5 shrink-0">
                    {t.is_active ? 'نشطة' : 'متوقفة'}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>{t.required_referrals} دعوة</span>
                  <span className="text-primary font-medium">+{t.reward_value} عملية</span>
                  {t.ends_at && <span>ينتهي {fmtDate(t.ends_at)}</span>}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} className="scale-90" />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader><DialogTitle className="text-base">{editId ? 'تعديل المهمة' : 'مهمة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">عنوان المهمة *</Label>
              <Input value={form.title ?? ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="ادعُ 10 مستخدمين" className="text-sm h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الوصف</Label>
              <Input value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="وصف اختياري" className="text-sm h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">عدد الدعوات المطلوبة</Label>
                <Input type="number" min={1} value={form.required_referrals ?? 10} onChange={e => setForm(p => ({ ...p, required_referrals: +e.target.value }))} className="text-sm h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">قيمة المكافأة (عمليات)</Label>
                <Input type="number" min={1} value={form.reward_value ?? 10} onChange={e => setForm(p => ({ ...p, reward_value: +e.target.value }))} className="text-sm h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">الحد الأقصى اليومي (0 = بلا حد)</Label>
                <Input type="number" min={0} value={form.daily_limit ?? 0} onChange={e => setForm(p => ({ ...p, daily_limit: +e.target.value }))} className="text-sm h-9" />
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <Label className="text-xs">حالة المهمة</Label>
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={!!form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
                  <span className="text-xs text-muted-foreground">{form.is_active ? 'نشطة' : 'متوقفة'}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">تاريخ البداية</Label>
                <Input type="datetime-local" value={form.starts_at ? form.starts_at.slice(0,16) : ''}
                  onChange={e => setForm(p => ({ ...p, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                  className="text-sm h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">تاريخ الانتهاء</Label>
                <Input type="datetime-local" value={form.ends_at ? form.ends_at.slice(0,16) : ''}
                  onChange={e => setForm(p => ({ ...p, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                  className="text-sm h-9" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-row-reverse">
            <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving} onClick={handleSave}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {editId ? 'حفظ التعديلات' : 'إنشاء المهمة'}
            </Button>
            <Button variant="outline" onClick={() => setDlgOpen(false)} disabled={saving}><X className="w-3.5 h-3.5" /></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>حذف المهمة؟</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ══════════ إعدادات النظام ══════════
function RewardSettingsPanel() {
  const [s, setS]             = useState<ReferralRewardSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const load = useCallback(async () => { setLoading(true); setS(await rwGetRewardSettings()); setLoading(false); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    const { success } = await rwUpdateRewardSettings({
      rewards_system_enabled: s.rewards_system_enabled, tasks_enabled: s.tasks_enabled,
      claims_enabled: s.claims_enabled, transfers_enabled: s.transfers_enabled,
      min_transfer_ops: s.min_transfer_ops, transfer_validity_days: s.transfer_validity_days,
      max_claims_per_day: s.max_claims_per_day,
    });
    if (success) toast.success('تم حفظ الإعدادات'); else toast.error('فشل الحفظ');
    setSaving(false);
  };

  if (loading || !s) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border divide-y divide-border px-4">
        {([
          ['تفعيل نظام المكافآت', 'rewards_system_enabled', 'تشغيل/إيقاف النظام كاملاً'],
          ['تفعيل المهام',        'tasks_enabled',          'إظهار المهام للمستخدمين'],
          ['تفعيل المطالبات',    'claims_enabled',         'السماح بمطالبة المكافآت'],
          ['تفعيل التحويلات',    'transfers_enabled',      'السماح بتحويل الرصيد'],
        ] as [string, keyof ReferralRewardSettings, string][]).map(([label, key, desc]) => (
          <div key={key} className="flex items-center justify-between gap-3 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Switch checked={!!s[key]} onCheckedChange={v => setS(prev => prev ? { ...prev, [key]: v } : prev)} />
          </div>
        ))}
        {([
          ['الحد الأدنى للتحويل',  'min_transfer_ops',       'أقل عدد عمليات للتحويل'],
          ['صلاحية التحويل (أيام)', 'transfer_validity_days', 'عدد أيام الصلاحية بعد التحويل'],
          ['حد المطالبات اليومي',  'max_claims_per_day',     '0 = بلا حد'],
        ] as [string, keyof ReferralRewardSettings, string][]).map(([label, key, desc]) => (
          <div key={key} className="flex items-center justify-between gap-3 py-3">
            <div className="space-y-0.5 flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Input type="number" min={0} value={s[key] as number}
              onChange={e => setS(prev => prev ? { ...prev, [key]: +e.target.value } : prev)}
              className="w-24 h-8 text-sm text-center shrink-0" />
          </div>
        ))}
      </div>
      <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" disabled={saving} onClick={save}>
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        حفظ الإعدادات
      </Button>
      <p className="text-xs text-muted-foreground text-center">آخر تحديث: {fmtDate(s.updated_at)}</p>
    </div>
  );
}

// ══════════ سجلات المطالبات ══════════
function ClaimsLog() {
  type ClaimRow = Record<string, unknown>;
  const [items, setItems]     = useState<ClaimRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    rwAdminGetAllClaims(100).then(r => { setItems(r.items as ClaimRow[]); setTotal(r.total); setLoading(false); });
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  const statusCls: Record<string, string> = {
    claimed:   'text-success bg-success/10 border-success/20',
    unclaimed: 'text-warning bg-warning/10 border-warning/20',
    failed:    'text-destructive bg-destructive/10 border-destructive/20',
    rejected:  'text-destructive bg-destructive/10 border-destructive/20',
  };
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">إجمالي المطالبات: {fmt(total)}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead><tr className="text-xs text-muted-foreground border-b border-border">
            {['المستخدم','المهمة','الحالة','المكافأة','التاريخ'].map(h => (
              <th key={h} className="text-right pb-2 font-normal whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {items.map((item, i) => {
              const prof = item.profiles as Record<string,string>|null;
              const task = item.referral_tasks as Record<string,string>|null;
              return (
                <tr key={i} className="text-xs">
                  <td className="py-2 pr-0 font-mono text-foreground/80 whitespace-nowrap">{prof?.username ?? '—'}</td>
                  <td className="py-2 whitespace-nowrap">{task?.title ?? '—'}</td>
                  <td className="py-2"><Badge className={`text-[10px] border ${statusCls[item.claim_status as string] ?? ''}`}>{item.claim_status as string}</Badge></td>
                  <td className="py-2 font-mono text-primary">{(item.reward_value as number) ?? '—'}</td>
                  <td className="py-2 whitespace-nowrap text-muted-foreground">{fmtDate(item.completed_at as string)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════ سجلات التحويلات ══════════
function TransfersLog() {
  const { user } = useAuth();
  type TransferRow = Record<string, unknown>;
  const [items, setItems]       = useState<TransferRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await rwAdminGetAllTransfers(100);
    setItems(r.items as TransferRow[]);
    setTotal(r.total);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleCancel = async () => {
    if (!cancelId || !user?.id) return;
    setCancelling(true);
    const res = await rwAdminCancelTransfer(user.id, cancelId);
    if (res.success) { toast.success('تم إلغاء التحويل'); await load(); }
    else toast.error(res.reason ?? 'فشل الإلغاء');
    setCancelling(false); setCancelId(null);
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">إجمالي التحويلات: {fmt(total)}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead><tr className="text-xs text-muted-foreground border-b border-border">
            {['المستخدم','العمليات','الحالة','صالح حتى','التاريخ',''].map((h,i) => (
              <th key={i} className="text-right pb-2 font-normal whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {items.map((item, i) => {
              const prof = item.profiles as Record<string,string>|null;
              return (
                <tr key={i} className="text-xs">
                  <td className="py-2 pr-0 font-mono text-foreground/80 whitespace-nowrap">{prof?.username ?? '—'}</td>
                  <td className="py-2 font-mono font-bold text-primary">{fmt(item.operations as number)}</td>
                  <td className="py-2"><Badge variant={item.status === 'success' ? 'default' : 'secondary'} className="text-[10px]">{item.status as string}</Badge></td>
                  <td className="py-2 whitespace-nowrap text-muted-foreground">{fmtDate(item.transfer_valid_until as string)}</td>
                  <td className="py-2 whitespace-nowrap text-muted-foreground">{fmtDate(item.created_at as string)}</td>
                  <td className="py-2">
                    {item.status === 'success' && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive hover:text-destructive px-2"
                        onClick={() => setCancelId(item.id as string)}>إلغاء</Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AlertDialog open={!!cancelId} onOpenChange={o => !o && setCancelId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>إلغاء التحويل؟</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'تأكيد الإلغاء'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ══════════ أرصدة المستخدمين ══════════
function BalancesTable() {
  const { user } = useAuth();
  type BalRow = Record<string, unknown>;
  const [items, setItems]         = useState<BalRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [adjustDlg, setAdjustDlg] = useState<{ userId: string; username: string } | null>(null);
  const [adjAmount, setAdjAmount] = useState('10');
  const [adjType, setAdjType]     = useState<'manual_grant' | 'manual_deduct'>('manual_grant');
  const [adjNotes, setAdjNotes]   = useState('');
  const [adjSaving, setAdjSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await rwAdminGetAllBalances(100);
    setItems(r.items as unknown as BalRow[]);
    setTotal(r.total);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleAdjust = async () => {
    if (!adjustDlg || !user?.id) return;
    const amt = parseInt(adjAmount);
    if (!amt || amt <= 0) { toast.error('أدخل قيمة صحيحة'); return; }
    setAdjSaving(true);
    const res = await rwAdminAdjustBalance(user.id, adjustDlg.userId, amt, adjType, adjNotes);
    if (res.success) {
      toast.success(adjType === 'manual_grant' ? `✅ تم منح ${amt} عملية` : `✅ تم خصم ${amt} عملية`);
      setAdjustDlg(null); await load();
    } else toast.error(res.reason === 'insufficient_balance' ? 'الرصيد غير كافٍ' : 'فشلت العملية');
    setAdjSaving(false);
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">إجمالي المستخدمين: {fmt(total)}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead><tr className="text-xs text-muted-foreground border-b border-border">
            {['المستخدم','المكتسبة','المستخدمة','المتبقي','آخر مطالبة',''].map((h,i) => (
              <th key={i} className="text-right pb-2 font-normal whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {items.map((item, i) => {
              const prof = item.profiles as Record<string,string>|null;
              const avail = (item.total_earned as number) - (item.total_used as number);
              return (
                <tr key={i} className="text-xs">
                  <td className="py-2 pr-0 font-mono text-foreground/80 whitespace-nowrap">{prof?.username ?? '—'}</td>
                  <td className="py-2 font-mono text-success">{fmt(item.total_earned as number)}</td>
                  <td className="py-2 font-mono text-destructive">{fmt(item.total_used as number)}</td>
                  <td className="py-2 font-mono font-bold text-primary">{fmt(avail)}</td>
                  <td className="py-2 whitespace-nowrap text-muted-foreground">{fmtDate(item.last_claim_at as string)}</td>
                  <td className="py-2">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                      onClick={() => { setAdjustDlg({ userId: item.user_id as string, username: prof?.username ?? '—' }); setAdjAmount('10'); setAdjNotes(''); setAdjType('manual_grant'); }}>
                      تعديل
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Dialog open={!!adjustDlg} onOpenChange={o => !o && setAdjustDlg(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              تعديل رصيد: {adjustDlg?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['manual_grant','manual_deduct'] as const).map(t => (
                <button key={t} onClick={() => setAdjType(t)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${adjType === t ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
                  {t === 'manual_grant' ? '+ منح' : '- خصم'}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">عدد العمليات</Label>
              <Input type="number" min={1} value={adjAmount} onChange={e => setAdjAmount(e.target.value)} className="text-sm h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظة (اختياري)</Label>
              <Input value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="سبب التعديل..." className="text-sm h-9" />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-row-reverse">
            <Button disabled={adjSaving} onClick={handleAdjust}
              className={`flex-1 ${adjType === 'manual_grant' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}`}>
              {adjSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : adjType === 'manual_grant' ? 'منح' : 'خصم'}
            </Button>
            <Button variant="outline" onClick={() => setAdjustDlg(null)} disabled={adjSaving}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ══════════ جميع السجلات ══════════
function AllLogsTable() {
  type LogRow = Record<string, unknown>;
  const [items, setItems]     = useState<LogRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    rwAdminGetAllLogs(100).then(r => { setItems(r.logs as unknown as LogRow[]); setTotal(r.total); setLoading(false); });
  }, []);
  const LOG_LABELS: Record<string,string> = { claim:'مطالبة', transfer:'تحويل', manual_grant:'منح', manual_deduct:'خصم', transfer_cancel:'إلغاء تحويل' };
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">إجمالي السجلات: {fmt(total)}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead><tr className="text-xs text-muted-foreground border-b border-border">
            {['المستخدم','النوع','العمليات','الحالة','التاريخ'].map(h => (
              <th key={h} className="text-right pb-2 font-normal whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {items.map((item, i) => {
              const prof = item.profiles as Record<string,string>|null;
              const isDebit = ['manual_deduct','transfer'].includes(item.log_type as string);
              return (
                <tr key={i} className="text-xs">
                  <td className="py-2 pr-0 font-mono text-foreground/80 whitespace-nowrap">{prof?.username ?? '—'}</td>
                  <td className="py-2 whitespace-nowrap">{LOG_LABELS[item.log_type as string] ?? item.log_type as string}</td>
                  <td className={`py-2 font-mono font-bold ${isDebit ? 'text-destructive' : 'text-success'}`}>
                    {isDebit ? '-' : '+'}{fmt(item.operations as number)}
                  </td>
                  <td className="py-2"><Badge variant={item.status === 'success' ? 'default' : 'secondary'} className="text-[10px]">{item.status as string}</Badge></td>
                  <td className="py-2 whitespace-nowrap text-muted-foreground">{fmtDate(item.created_at as string)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════ المكوّن الرئيسي ══════════
export default function AdminReferralRewards() {
  const [tab, setTab] = useState('tasks');
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">Referral Rewards</h2>
          <p className="text-xs text-muted-foreground">إدارة مهام ومكافآت نظام الإحالات</p>
        </div>
      </div>
      <OverviewCards />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-5 h-9">
          <TabsTrigger value="tasks"     className="text-xs gap-1"><Trophy className="w-3 h-3" /><span className="hidden sm:inline">مهام</span></TabsTrigger>
          <TabsTrigger value="claims"    className="text-xs gap-1"><Gift className="w-3 h-3" /><span className="hidden sm:inline">مطالبات</span></TabsTrigger>
          <TabsTrigger value="transfers" className="text-xs gap-1"><ArrowRightLeft className="w-3 h-3" /><span className="hidden sm:inline">تحويلات</span></TabsTrigger>
          <TabsTrigger value="balances"  className="text-xs gap-1"><Wallet className="w-3 h-3" /><span className="hidden sm:inline">أرصدة</span></TabsTrigger>
          <TabsTrigger value="settings"  className="text-xs gap-1"><Settings2 className="w-3 h-3" /><span className="hidden sm:inline">إعدادات</span></TabsTrigger>
        </TabsList>
        <TabsContent value="tasks"     className="mt-4"><TasksManager /></TabsContent>
        <TabsContent value="claims"    className="mt-4"><ClaimsLog /></TabsContent>
        <TabsContent value="transfers" className="mt-4"><TransfersLog /></TabsContent>
        <TabsContent value="balances"  className="mt-4">
          <Tabs defaultValue="balances_tbl">
            <TabsList className="mb-3 h-8">
              <TabsTrigger value="balances_tbl" className="text-xs">أرصدة المستخدمين</TabsTrigger>
              <TabsTrigger value="logs_tbl"     className="text-xs gap-1"><ChevronDown className="w-3 h-3" />جميع السجلات</TabsTrigger>
            </TabsList>
            <TabsContent value="balances_tbl"><BalancesTable /></TabsContent>
            <TabsContent value="logs_tbl"><AllLogsTable /></TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="settings"  className="mt-4"><RewardSettingsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
