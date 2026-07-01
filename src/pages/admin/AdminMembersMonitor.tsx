// ─── Phase 6: Admin Members Monitoring Page ──────────────────────────────────
// مراقبة كاملة لجميع التجار والأعضاء والاشتراكات والنقاط
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
  UserCheck, UserX, Ban, Calendar, Zap, Building2, AlertCircle,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { adminGetAllMembers, getAllMerchantsWithStats } from '@/lib/api';
import type { MerchantMember, MerchantFull } from '@/types/types';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy', { locale: ar }); } catch { return d; }
}

const STATUS_LABELS: Record<string, string> = {
  active: 'نشط', pending: 'انتظار', suspended: 'موقوف',
  disabled: 'معطل', blocked: 'محظور', expired: 'منتهي',
};
const STATUS_CLS: Record<string, string> = {
  active:    'bg-success/10 text-success border-success/20',
  pending:   'bg-primary/10 text-primary border-primary/20',
  suspended: 'bg-warning/10 text-warning border-warning/20',
  disabled:  'bg-muted text-muted-foreground border-border',
  blocked:   'bg-destructive/10 text-destructive border-destructive/20',
  expired:   'bg-muted text-muted-foreground border-border',
};
const SUB_STATUS_LABELS: Record<string, string> = {
  active: 'نشط', pending: 'انتظار', expired: 'منتهي', cancelled: 'ملغى',
};

export default function AdminMembersMonitor() {
  const [members, setMembers]     = useState<MerchantMember[]>([]);
  const [total, setTotal]         = useState(0);
  const [pages, setPages]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [merchantFilter, setMerchantFilter] = useState('all');
  const [merchants, setMerchants] = useState<MerchantFull[]>([]);

  // Summary stats
  const [stats, setStats] = useState({
    total: 0, active: 0, suspended: 0, blocked: 0,
    totalPoints: 0, usedPoints: 0,
  });

  const load = useCallback(async (pg = page, q = search, st = statusFilter, m = merchantFilter) => {
    setLoading(true);
    const r = await adminGetAllMembers({
      search:   q   || undefined,
      status:   st !== 'all' ? st : undefined,
      merchant: m  !== 'all' ? m  : undefined,
      page:     pg,
      pageSize: 30,
    });
    setMembers(r.items);
    setTotal(r.total);
    setPages(r.pages);

    // Compute quick stats from current page (full stats would need separate RPC)
    setStats({
      total:       r.total,
      active:      r.items.filter(x => x.member_status === 'active').length,
      suspended:   r.items.filter(x => x.member_status === 'suspended').length,
      blocked:     r.items.filter(x => x.member_status === 'blocked').length,
      totalPoints: r.items.reduce((s, x) => s + (x.assigned_points ?? 0), 0),
      usedPoints:  r.items.reduce((s, x) => s + (x.consumed_points ?? 0), 0),
    });
    setLoading(false);
  }, [page, search, statusFilter, merchantFilter]);

  useEffect(() => {
    getAllMerchantsWithStats().then(setMerchants);
    load(1, '', 'all', 'all');
  }, []); // eslint-disable-line

  // Realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel('admin-members-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_members' },
        () => { load(page, search, statusFilter, merchantFilter); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [page, search, statusFilter, merchantFilter, load]);

  const handleSearch = (q: string) => { setSearch(q); setPage(1); load(1, q, statusFilter, merchantFilter); };
  const handleStatus = (s: string)  => { setStatusFilter(s); setPage(1); load(1, search, s, merchantFilter); };
  const handleMerchant = (m: string) => { setMerchantFilter(m); setPage(1); load(1, search, statusFilter, m); };
  const handlePage = (p: number)    => { setPage(p); load(p, search, statusFilter, merchantFilter); };

  const statCards = [
    { label: 'إجمالي الأعضاء',    val: total,              icon: Users,      cls: 'text-primary',     bg: 'bg-primary/10'     },
    { label: 'نشطون',              val: stats.active,       icon: UserCheck,  cls: 'text-success',     bg: 'bg-success/10'     },
    { label: 'موقوفون',            val: stats.suspended,    icon: UserX,      cls: 'text-warning',     bg: 'bg-warning/10'     },
    { label: 'محظورون',            val: stats.blocked,      icon: Ban,        cls: 'text-destructive', bg: 'bg-destructive/10' },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">مراقبة الأعضاء</h2>
          <p className="text-xs text-muted-foreground">جميع أعضاء جميع التجار</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => load(page, search, statusFilter, merchantFilter)}>
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {statCards.map(({ label, val, icon: Icon, cls, bg }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3 flex items-center gap-2">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', bg)}>
              <Icon className={cn('w-4 h-4', cls)} />
            </div>
            <div className="min-w-0">
              <p className={cn('text-base font-black tabular-nums', cls)}>{val}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="بحث بالاسم أو الهاتف أو التاجر…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="h-9 pr-9 text-sm"
            dir="rtl"
          />
        </div>

        <Select value={statusFilter} onValueChange={handleStatus}>
          <SelectTrigger className="w-32 h-9 text-xs shrink-0">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={merchantFilter} onValueChange={handleMerchant}>
          <SelectTrigger className="w-36 h-9 text-xs shrink-0">
            <SelectValue placeholder="التاجر" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="all">كل التجار</SelectItem>
            {merchants.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 bg-muted rounded-xl" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="py-14 text-center space-y-2">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
          <p className="text-sm text-muted-foreground">لا توجد نتائج</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.member_id} className="rounded-xl border border-border bg-card p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {(m.username ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-semibold truncate">{m.username ?? '—'}</p>
                  <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-semibold',
                    STATUS_CLS[m.member_status] ?? STATUS_CLS.disabled)}>
                    {STATUS_LABELS[m.member_status] ?? m.member_status}
                  </span>
                  {m.sub_status && (
                    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-semibold',
                      m.sub_status === 'active' ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border')}>
                      {SUB_STATUS_LABELS[m.sub_status]}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {m.merchant_name ?? '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-warning" /> {m.remaining_points} نقطة متبقية
                  </span>
                  {m.end_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      ينتهي {fmtDate(m.end_date)}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right space-y-0.5">
                <p className="text-[10px] text-muted-foreground">{m.phone ?? m.email ?? '—'}</p>
                <p className="text-[10px] text-muted-foreground">{fmt(m.member_created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1"
            disabled={page <= 1} onClick={() => handlePage(page - 1)}>
            <ChevronRight className="w-3.5 h-3.5" /> السابق
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">{page} / {pages} ({total} عضو)</span>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1"
            disabled={page >= pages} onClick={() => handlePage(page + 1)}>
            التالي <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
