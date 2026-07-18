// ── Phase 10: MerchantControlCenter — Admin Component ───────────────────────
// مركز تحكم كامل داخل لوحة الإدارة
// ADDITIVE — يُضاف كـ SectionCard داخل AdminMerchantDetail

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Power, PowerOff, Wrench, RefreshCw, LogOut,
  WifiOff, Zap, Link2, RotateCcw, Eye, AlertTriangle,
  Activity, Users, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, Loader2, BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { adminMerchantAction, getMerchantLiveStats, getMerchantAuditLog, getMerchantControlConfig } from '@/lib/api';
import type {
  MerchantControlAction, MerchantLiveStats,
  MerchantAuditEntry, MerchantControlConfig,
} from '@/lib/api';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { ar } from 'date-fns/locale';

const fmt = (d?: string | null) => {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
};
const rel = (d?: string | null) => {
  if (!d) return '—';
  try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ar }); } catch { return d; }
};

interface ActionBtn {
  action:   MerchantControlAction;
  label:    string;
  icon:     React.ElementType;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost';
  cls?:     string;
  confirm?: string;
  group:    'status' | 'control' | 'invite' | 'session';
}

const ACTIONS: ActionBtn[] = [
  // ── حالة التاجر ──────────────────────────────────────────────
  { action:'enable',    label:'تفعيل',         icon:Power,       variant:'outline', cls:'border-success/40 text-success hover:bg-success/10',    group:'status', confirm:'تفعيل التاجر ومستخدميه' },
  { action:'disable',   label:'تعطيل',         icon:PowerOff,    variant:'outline', cls:'border-muted text-muted-foreground',                      group:'status', confirm:'تعطيل التاجر بالكامل' },
  { action:'suspend',   label:'إيقاف مؤقت',   icon:AlertTriangle,variant:'outline',cls:'border-warning/40 text-warning hover:bg-warning/10',      group:'status', confirm:'إيقاف التاجر مؤقتاً' },
  { action:'resume',    label:'استئناف',       icon:CheckCircle2,variant:'outline', cls:'border-success/40 text-success hover:bg-success/10',     group:'status', confirm:'استئناف نشاط التاجر' },
  // ── مفاتيح التحكم ────────────────────────────────────────────
  { action:'kill_switch_on',  label:'Kill Switch ON',   icon:WifiOff,  variant:'destructive',                                                       group:'control', confirm:'⚠️ سيوقف هذا جميع مستخدمي التاجر فوراً' },
  { action:'kill_switch_off', label:'Kill Switch OFF',  icon:Power,    variant:'outline', cls:'border-success/40 text-success hover:bg-success/10',group:'control' },
  { action:'maintenance_on',  label:'صيانة ON',        icon:Wrench,   variant:'outline', cls:'border-warning/40 text-warning hover:bg-warning/10', group:'control', confirm:'تفعيل وضع الصيانة' },
  { action:'maintenance_off', label:'صيانة OFF',       icon:CheckCircle2,variant:'outline',cls:'border-success/40 text-success hover:bg-success/10',group:'control' },
  { action:'force_update_on', label:'Force Update ON',  icon:RefreshCw,variant:'outline', cls:'border-primary/40 text-primary hover:bg-primary/10', group:'control', confirm:'إجبار المستخدمين على التحديث' },
  { action:'force_update_off',label:'Force Update OFF', icon:CheckCircle2,variant:'outline',cls:'border-success/40 text-success hover:bg-success/10',group:'control' },
  { action:'force_sync',       label:'Force Sync',       icon:Zap,     variant:'outline',                                                            group:'control' },
  { action:'force_refresh_config',label:'Refresh Config',icon:RefreshCw,variant:'outline',                                                          group:'control' },
  // ── الجلسات ──────────────────────────────────────────────────
  { action:'force_logout',     label:'Force Logout All', icon:LogOut,  variant:'destructive',                                                        group:'session', confirm:'تسجيل خروج جميع مستخدمي التاجر' },
  { action:'force_logout_clear',label:'مسح Force Logout',icon:CheckCircle2,variant:'outline',cls:'border-success/40 text-success hover:bg-success/10',group:'session' },
  // ── الدعوة ───────────────────────────────────────────────────
  { action:'invite_enable',    label:'تفعيل الدعوة',   icon:Link2,    variant:'outline', cls:'border-success/40 text-success hover:bg-success/10', group:'invite' },
  { action:'invite_disable',   label:'تعطيل الدعوة',   icon:XCircle,  variant:'outline', cls:'border-muted text-muted-foreground',                 group:'invite', confirm:'تعطيل رابط الدعوة' },
  { action:'invite_regenerate',label:'إعادة توليد رابط',icon:RotateCcw,variant:'outline',                                                          group:'invite', confirm:'إعادة توليد رابط الدعوة' },
];

const GROUP_LABELS: Record<string, string> = {
  status:  'حالة التاجر',
  control: 'مفاتيح التحكم',
  session: 'الجلسات',
  invite:  'رابط الدعوة',
};

// ─── LiveMonitor mini card ────────────────────────────────────────────────
function LiveStat({ label, value, icon: Icon, cls = '' }: { label: string; value: React.ReactNode; icon: React.ElementType; cls?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 flex items-center gap-3">
      <Icon className={cn('w-4 h-4 shrink-0', cls)} />
      <div className="min-w-0">
        <p className="text-xs font-black tabular-nums text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      </div>
    </div>
  );
}

// ─── StatusPill ──────────────────────────────────────────────────────────
function StatusPill({ active, onLabel, offLabel }: { active: boolean; onLabel: string; offLabel: string }) {
  return active
    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">{onLabel}</span>
    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">{offLabel}</span>;
}

interface Props {
  merchantId: string;
  adminId:    string;
  onRefresh?: () => void;
}

export default function MerchantControlCenter({ merchantId, adminId, onRefresh }: Props) {
  const [config,  setConfig]  = useState<MerchantControlConfig | null>(null);
  const [stats,   setStats]   = useState<MerchantLiveStats | null>(null);
  const [audit,   setAudit]   = useState<MerchantAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  // Confirm dialog
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [confirmText,  setConfirmText]  = useState('');
  const [pendingAction, setPendingAction] = useState<MerchantControlAction | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const [cfg, st] = await Promise.all([
      getMerchantControlConfig(merchantId),
      getMerchantLiveStats(merchantId),
    ]);
    if (!mountedRef.current) return;
    setConfig(cfg);
    setStats(st);
    setLoading(false);
  }, [merchantId]);

  const loadAudit = useCallback(async () => {
    const r = await getMerchantAuditLog(merchantId, 20, 0);
    if (mountedRef.current) setAudit(r.rows);
  }, [merchantId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, [load]);

  // Realtime — تحديث config عند أي تغيير
  useEffect(() => {
    const ch = supabase
      .channel(`admin-ctrl-${merchantId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'merchant_control_config',
        filter: `merchant_id=eq.${merchantId}`,
      }, (payload) => {
        if (!mountedRef.current) return;
        setConfig(prev => ({ ...prev!, ...(payload.new as Partial<MerchantControlConfig>) }));
        void getMerchantLiveStats(merchantId).then(s => { if (mountedRef.current && s) setStats(s); });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [merchantId]);

  // Poll stats every 15s
  useEffect(() => {
    const t = setInterval(() => {
      void getMerchantLiveStats(merchantId).then(s => { if (mountedRef.current && s) setStats(s); });
    }, 15_000);
    return () => clearInterval(t);
  }, [merchantId]);

  const ask = (action: MerchantControlAction, confirm?: string) => {
    if (confirm) {
      setPendingAction(action);
      setConfirmText(confirm);
      setConfirmOpen(true);
    } else {
      void execute(action);
    }
  };

  const execute = async (action: MerchantControlAction) => {
    setSaving(true);
    const res = await adminMerchantAction(merchantId, action, adminId);
    setSaving(false);
    if (res.success) {
      toast.success(res.message ?? 'تم تنفيذ الإجراء');
      void load();
      onRefresh?.();
    } else {
      toast.error(res.error ?? 'فشل تنفيذ الإجراء');
    }
  };

  const runConfirm = async () => {
    setConfirmOpen(false);
    if (pendingAction) await execute(pendingAction);
    setPendingAction(null);
  };

  if (loading) return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl bg-muted" />)}
    </div>
  );

  const groups = ['status', 'control', 'session', 'invite'] as const;

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── Status Overview ─────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-primary" />
          <p className="text-sm font-black">الحالة اللحظية</p>
          <button
            onClick={() => void load()}
            className="mr-auto text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Flags */}
        <div className="flex flex-wrap gap-2">
          <StatusPill active={config?.kill_switch    ?? false} onLabel="Kill Switch ON"    offLabel="Kill Switch OFF" />
          <StatusPill active={config?.maintenance_mode ?? false} onLabel="صيانة مفعّلة"   offLabel="لا صيانة" />
          <StatusPill active={config?.force_update   ?? false} onLabel="Force Update ON"   offLabel="لا تحديث إجباري" />
          <StatusPill active={config?.force_logout   ?? false} onLabel="Force Logout ON"   offLabel="الجلسات طبيعية" />
        </div>

        {/* Live stats grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            <LiveStat label="متصل الآن"          value={stats.online_now}          icon={Users}        cls="text-success" />
            <LiveStat label="إجمالي متصل"         value={stats.total_connected}      icon={Activity}     cls="text-primary" />
            <LiveStat label="آخر heartbeat"       value={rel(stats.last_heartbeat)}  icon={Clock}        cls="text-muted-foreground" />
            <LiveStat label="آخر نشاط"            value={rel(stats.last_activity)}   icon={BadgeCheck}   cls="text-muted-foreground" />
            <LiveStat label="اتصال جيد"           value={stats.healthy_connections}  icon={CheckCircle2} cls="text-success" />
            <LiveStat label="اتصال ضعيف"          value={stats.poor_connections}     icon={AlertTriangle}cls="text-warning" />
            <LiveStat label="Config Version"      value={`v${config?.config_version ?? 1}`} icon={Zap} cls="text-primary" />
            <LiveStat label="آخر مزامنة"          value={rel(config?.last_config_push)} icon={RefreshCw} cls="text-muted-foreground" />
          </div>
        )}
      </div>

      {/* ── Action Groups ────────────────────────────────────── */}
      {groups.map(group => (
        <div key={group} className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <Shield className="w-3 h-3" />
            {GROUP_LABELS[group]}
          </p>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.filter(a => a.group === group).map(a => {
              const Icon = a.icon;
              return (
                <Button
                  key={a.action}
                  size="sm"
                  variant={a.variant ?? 'outline'}
                  className={cn('h-8 gap-1.5 text-xs', a.cls)}
                  disabled={saving}
                  onClick={() => ask(a.action, a.confirm)}
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                  {a.label}
                </Button>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Audit Log ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
          onClick={() => { setShowAudit(p => !p); if (!showAudit) void loadAudit(); }}
        >
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-bold">سجل الإجراءات الإدارية</span>
          </div>
          {showAudit ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showAudit && (
          <div className="divide-y divide-border">
            {audit.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">لا توجد إجراءات مسجّلة</p>
            ) : audit.map(e => (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground">{e.action}</p>
                  {e.reason && <p className="text-[10px] text-muted-foreground">{e.reason}</p>}
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                    {e.admin_username ?? 'أدمن'} — {fmt(e.created_at)}
                  </p>
                </div>
                {e.correlation_id && (
                  <p className="text-[8px] text-muted-foreground/50 font-mono shrink-0">{e.correlation_id.slice(0,8)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Confirm Dialog ───────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد الإجراء</DialogTitle>
            <DialogDescription>{confirmText}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-row-reverse">
            <Button variant="destructive" onClick={runConfirm}>تأكيد</Button>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
