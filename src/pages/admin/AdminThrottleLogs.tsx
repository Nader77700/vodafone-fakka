// صفحة سجلات تقييد الشحن (تضارب الأجهزة) — /admin/throttle-logs
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Loader2, ShieldOff, Shield, Clock,
  ChevronLeft, ChevronRight, AlertTriangle, X,
  CheckCircle, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import AdminShell, { SectionCard, ConfirmDialog, type BreadcrumbItem } from '@/components/admin/AdminShell';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface ThrottleRecord {
  id: string;
  user_id: string;
  throttled_at: string;
  expires_at: string;
  is_active: boolean;
  reason: string;
  device1_fp: string | null;
  device2_fp: string | null;
  ops_count: number;
  lifted_at: string | null;
  lifted_by_name: string | null;
  notes: string | null;
  profile?: { username: string | null; phone: string | null };
}

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}

const PAGE_SIZE = 20;

export default function AdminThrottleLogs() {
  const navigate    = useNavigate();
  const { profile } = useAuth();

  const [logs,    setLogs]    = useState<ThrottleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [showActive, setShowActive] = useState(false);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const [lifting, setLifting] = useState<string | null>(null);
  const [confirmData, setConfirmData] = useState<{
    open: boolean; title: string; desc?: string;
    action: () => Promise<void>; variant?: 'default' | 'destructive';
  }>({ open: false, title: '', action: async () => {} });

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('charge_throttles')
        .select('*', { count: 'exact' })
        .order('throttled_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (showActive) q = q.eq('is_active', true).gt('expires_at', new Date().toISOString());

      const { data, count, error } = await q;
      if (error) throw error;
      
      const records = (data ?? []) as any[];
      if (records.length > 0) {
        const userIds = [...new Set(records.map(r => r.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, phone')
          .in('id', userIds);
          
        const profileMap = new Map();
        (profiles ?? []).forEach(p => profileMap.set(p.id, p));
        
        records.forEach(r => {
          r.profile = profileMap.get(r.user_id);
        });
      }
      
      setLogs(records as ThrottleRecord[]);
      setTotal(count ?? 0);
    } catch (e) {
      toast.error(`فشل التحميل: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [page, showActive]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const liftThrottle = async (rec: ThrottleRecord) => {
    setLifting(rec.id);
    const { error } = await supabase
      .from('charge_throttles')
      .update({
        is_active:      false,
        lifted_at:      new Date().toISOString(),
        lifted_by_name: profile?.username ?? 'أدمن',
      })
      .eq('id', rec.id);
    setLifting(null);
    if (error) { toast.error(`فشل: ${error.message}`); return; }
    toast.success('✅ تم رفع التقييد');
    loadLogs();
  };

  const filtered = search
    ? logs.filter(l =>
        l.profile?.username?.toLowerCase().includes(search.toLowerCase()) ||
        l.profile?.phone?.includes(search) ||
        l.reason.includes(search)
      )
    : logs;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeCount = logs.filter(l => l.is_active && new Date(l.expires_at) > new Date()).length;

  if (!isAdmin) {
    return (
      <AdminShell title="سجلات التقييد" breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'سجلات التقييد' }]}>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Shield className="w-8 h-8 mr-2" />
          <span>غير مصرح</span>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="سجلات تقييد الشحن"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/admin' }, { label: 'سجلات التقييد' }]}
      actions={
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={loadLogs}>
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
      }
    >
      <div className="space-y-4 pb-8">

        {/* ── ملخص ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-card border border-border/40 p-4 flex flex-col gap-1">
            <p className="text-[10px] text-muted-foreground">إجمالي التقييدات</p>
            <p className="text-2xl font-black tabular-nums text-foreground">{total}</p>
          </div>
          <div className={`rounded-xl border p-4 flex flex-col gap-1 ${activeCount > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-card border-border/40'}`}>
            <p className="text-[10px] text-muted-foreground">تقييدات نشطة الآن</p>
            <p className={`text-2xl font-black tabular-nums ${activeCount > 0 ? 'text-destructive' : 'text-foreground'}`}>{activeCount}</p>
          </div>
        </div>

        {/* ── فلاتر ── */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث باسم المستخدم أو الهاتف..."
              className="pr-9 h-9"
            />
          </div>
          <button
            onClick={() => { setShowActive(v => !v); setPage(1); }}
            className={`text-[11px] flex items-center gap-1 transition-colors ${showActive ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <AlertTriangle className="w-3 h-3" />
            {showActive ? 'عرض الكل' : 'عرض النشطة فقط'}
          </button>
        </div>

        {/* ── القائمة ── */}
        <SectionCard title={`السجلات (${total})`} icon={Clock}>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl bg-muted" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">لا توجد سجلات تضارب</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(rec => {
                const now = new Date();
                const isStillActive = rec.is_active && new Date(rec.expires_at) > now;
                const minsLeft = isStillActive
                  ? Math.ceil((new Date(rec.expires_at).getTime() - now.getTime()) / 60000)
                  : 0;

                return (
                  <div key={rec.id}
                    className={`rounded-xl border p-4 space-y-2 ${isStillActive ? 'border-destructive/40 bg-destructive/5' : 'border-border/40 bg-card'}`}
                  >
                    {/* رأس */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isStillActive
                          ? <ShieldOff className="w-4 h-4 text-destructive shrink-0" />
                          : <CheckCircle className="w-4 h-4 text-success shrink-0" />
                        }
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">
                            {rec.profile?.username ?? '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{rec.profile?.phone ?? '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isStillActive && (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <Clock className="w-2.5 h-2.5" /> {minsLeft} د
                          </Badge>
                        )}
                        {!isStillActive && (
                          <Badge className="text-[10px] bg-success/20 text-success border-success/30">
                            مرفوع
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* تفاصيل */}
                    <div className="text-[11px] text-muted-foreground space-y-1 pr-6">
                      <p><span className="text-foreground font-medium">السبب: </span>{rec.reason}</p>
                      <p><span className="text-foreground font-medium">وقت التقييد: </span>{fmt(rec.throttled_at)}</p>
                      <p><span className="text-foreground font-medium">ينتهي في: </span>{fmt(rec.expires_at)}</p>
                      {rec.device1_fp && (
                        <p className="font-mono text-[10px] truncate">
                          <span className="text-foreground font-medium not-italic">جهاز 1: </span>
                          {rec.device1_fp.slice(0, 16)}…
                        </p>
                      )}
                      {rec.device2_fp && (
                        <p className="font-mono text-[10px] truncate">
                          <span className="text-foreground font-medium not-italic">جهاز 2: </span>
                          {rec.device2_fp.slice(0, 16)}…
                        </p>
                      )}
                      <p><span className="text-foreground font-medium">عدد العمليات: </span>{rec.ops_count}</p>
                      {rec.lifted_by_name && (
                        <p className="text-success"><span className="font-medium">رُفع بواسطة: </span>{rec.lifted_by_name} — {fmt(rec.lifted_at)}</p>
                      )}
                    </div>

                    {/* زر رفع التقييد */}
                    {isStillActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1 border-success/40 text-success hover:bg-success/10 w-full"
                        disabled={lifting === rec.id}
                        onClick={() => setConfirmData({
                          open: true,
                          title: 'رفع التقييد',
                          desc: `هل تريد رفع تقييد الشحن عن "${rec.profile?.username}"؟ سيتمكن المستخدم من الشحن فوراً.`,
                          action: () => liftThrottle(rec),
                        })}
                      >
                        {lifting === rec.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <X className="w-3 h-3" />
                        }
                        رفع التقييد
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button size="icon" variant="outline" className="w-8 h-8"
                disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">{page} / {totalPages}</span>
              <Button size="icon" variant="outline" className="w-8 h-8"
                disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          )}
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirmData.open}
        onOpenChange={v => setConfirmData(p => ({ ...p, open: v }))}
        title={confirmData.title}
        description={confirmData.desc}
        variant={confirmData.variant}
        onConfirm={async () => {
          setConfirmData(p => ({ ...p, open: false }));
          await confirmData.action();
        }}
      />
    </AdminShell>
  );
}
