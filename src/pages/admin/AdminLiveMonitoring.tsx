// صفحة Live Monitoring — /admin/live-monitoring
// مراقبة المستخدمين في الوقت الفعلي
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, RefreshCw, Wifi, WifiOff, Users,
  Clock, Filter, Search, Loader2, Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import AdminShell, { SectionCard } from '@/components/admin/AdminShell';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'HH:mm dd/MM', { locale: ar }); } catch { return d; }
}
function ago(d?: string | null) {
  if (!d) return '—';
  try { return formatDistanceToNow(new Date(d), { locale: ar, addSuffix: true }); } catch { return d; }
}

interface LiveUser {
  id: string;
  username: string | null;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  role: string;
  last_login: string | null;
}

const ONLINE_THRESHOLD_MINUTES = 5; // مستخدم نشط إذا آخر نشاط خلال 5 دقائق

export default function AdminLiveMonitoring() {
  const navigate = useNavigate();
  const [users,    setUsers]    = useState<LiveUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState<'all' | 'online' | 'offline'>('all');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, email, is_active, role, last_login')
        .order('last_login', { ascending: false })
        .limit(200);

      setUsers(Array.isArray(data) ? data : []);
      setLastUpdate(new Date());
    } catch { if (!silent) toast.error('فشل تحميل بيانات المراقبة'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load(true), 10000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const isOnline = (u: LiveUser) => {
    if (!u.last_login) return false;
    const diff = (Date.now() - new Date(u.last_login).getTime()) / 60000;
    return diff <= ONLINE_THRESHOLD_MINUTES;
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || [u.username, u.full_name, u.email]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    const matchFilter = filter === 'all'
      || (filter === 'online' && isOnline(u))
      || (filter === 'offline' && !isOnline(u));
    return matchSearch && matchFilter;
  });

  const onlineCount  = users.filter(isOnline).length;
  const offlineCount = users.length - onlineCount;

  return (
    <AdminShell
      title="Live Monitoring"
      subtitle={`آخر تحديث: ${lastUpdate ? fmt(lastUpdate.toISOString()) : '—'}`}
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/admin' },
        { label: 'Live Monitoring' },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            تحديث كل 10ث
          </span>
          <Button size="sm" variant="outline" onClick={() => load()} className="h-8 gap-1">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      }
    >
      <div className="space-y-5">

        {/* ── إحصائيات حية ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'متصل الآن',    value: onlineCount,  icon: Wifi,     color: 'text-success' },
            { label: 'غير متصل',     value: offlineCount, icon: WifiOff,  color: 'text-muted-foreground' },
            { label: 'إجمالي المستخدمين', value: users.length, icon: Users, color: 'text-primary' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.color.replace('text-', 'bg-')}/10`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── فلترة ── */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد أو الإصدار..."
              className="pr-9 h-9"
            />
          </div>
          <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="online">متصل</SelectItem>
              <SelectItem value="offline">غير متصل</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── قائمة المستخدمين ── */}
        <SectionCard title={`المستخدمون (${filtered.length})`} icon={Activity}>
          {loading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl bg-muted" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">لا يوجد مستخدمون</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(u => {
                const online = isOnline(u);
                return (
                  <button
                    key={u.id}
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors text-right"
                  >
                    {/* حالة الاتصال */}
                    <div className="shrink-0">
                      <Circle className={`w-2.5 h-2.5 ${online ? 'fill-success text-success' : 'fill-muted-foreground text-muted-foreground'}`} />
                    </div>
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-black text-primary shrink-0">
                      {(u.full_name || u.username || '?').charAt(0).toUpperCase()}
                    </div>
                    {/* معلومات */}
                    <div className="flex-1 min-w-0 text-right">
                      <p className="text-xs font-semibold truncate">{u.full_name || u.username || u.email}</p>
                      <p className="text-[10px] text-muted-foreground">
                        آخر دخول: {ago(u.last_login)}
                      </p>
                    </div>
                    {/* تاريخ */}
                    <div className="text-left shrink-0">
                      <p className="text-[10px] text-muted-foreground">{fmt(u.last_login)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

      </div>
    </AdminShell>
  );
}
