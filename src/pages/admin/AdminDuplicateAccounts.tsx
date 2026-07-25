// صفحة إدارة الحسابات المكررة — القائمة الرئيسية v3.0.252
// ─────────────────────────────────────────────────────────────
// تعرض قائمة مجموعات الأجهزة المكررة بشكل منظم
// الضغط على أي مجموعة → صفحة تفاصيل كاملة مع كل الإجراءات
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone, RefreshCw, Loader2, Search,
  ScanSearch, ShieldX, ShieldCheck, Users, ChevronLeft,
  Ban, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import AdminShell from '@/components/admin/AdminShell';
import {
  getDuplicateDevices, getDeviceBans, getBannedAccounts,
  type DuplicateDeviceGroup, type DeviceBan, type BannedAccount,
} from '@/lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy', { locale: ar }); }
  catch { return d; }
}
function shortFp(fp?: string | null) {
  if (!fp) return '—';
  return fp.length > 14 ? `${fp.slice(0, 7)}…${fp.slice(-6)}` : fp;
}

// ── بطاقة مجموعة جهاز واحد ──────────────────────────────────────────────────
function GroupCard({ group, onClick }: { group: DuplicateDeviceGroup; onClick: () => void }) {
  const names = group.usernames.filter(Boolean);
  const displayNames = names.slice(0, 3).join('، ') + (names.length > 3 ? `، +${names.length - 3}` : '');

  return (
    <button
      onClick={onClick}
      className={`w-full text-right rounded-2xl border bg-card p-4 flex items-center gap-3 active:scale-[0.99] transition-all hover:border-primary/30 hover:shadow-md ${group.is_banned ? 'border-destructive/40' : 'border-border'}`}
    >
      {/* أيقونة */}
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${group.is_banned ? 'bg-destructive/10' : 'bg-warning/10'}`}>
        {group.is_banned
          ? <ShieldX className="w-5 h-5 text-destructive" />
          : <Smartphone className="w-5 h-5 text-warning" />
        }
      </div>

      {/* المحتوى */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-sm truncate leading-snug">{displayNames || '—'}</p>
          {group.is_banned && (
            <Badge variant="destructive" className="text-[9px] px-1.5 h-4 shrink-0">محظور</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {group.user_count} حسابات
          </span>
          <span className="truncate font-mono">{shortFp(group.device_fp ?? group.hardware_hash)}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          آخر نشاط: {fmtDate(group.last_seen)}
        </p>
      </div>

      {/* سهم */}
      <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

// ── الصفحة الرئيسية ─────────────────────────────────────────────────────────
type TabId = 'duplicates' | 'banned_accounts' | 'device_bans';

export default function AdminDuplicateAccounts() {
  const navigate = useNavigate();
  const [tab, setTab]             = useState<TabId>('duplicates');
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');

  const [duplicates, setDuplicates]     = useState<DuplicateDeviceGroup[]>([]);
  const [deviceBans, setDeviceBans]     = useState<DeviceBan[]>([]);
  const [bannedAccs, setBannedAccs]     = useState<BannedAccount[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, b, a] = await Promise.all([
        getDuplicateDevices(),
        getDeviceBans(),
        getBannedAccounts(),
      ]);
      if (d.success) setDuplicates(d.data);
      if (b.success) setDeviceBans(b.data);
      setBannedAccs(a.data ?? []);
    } catch (e) {
      toast.error('فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── فلترة ──
  const filteredDups = duplicates.filter(g => {
    const q = search.toLowerCase();
    return !q
      || g.usernames.some(u => u?.toLowerCase().includes(q))
      || g.phones.some(p => p?.toLowerCase().includes(q))
      || (g.device_fp ?? '').toLowerCase().includes(q)
      || (g.hardware_hash ?? '').toLowerCase().includes(q);
  });
  const filteredBannedAccs = bannedAccs.filter(a => {
    const q = search.toLowerCase();
    return !q || (a.username ?? '').toLowerCase().includes(q) || (a.phone ?? '').includes(q);
  });
  const filteredDeviceBans = deviceBans.filter(b => {
    const q = search.toLowerCase();
    return !q
      || (b.ban_reason ?? '').toLowerCase().includes(q)
      || b.associated_usernames?.some(u => u.toLowerCase().includes(q))
      || (b.device_fp ?? '').toLowerCase().includes(q);
  });

  // ── إحصائيات ──
  const stats = [
    { label: 'أجهزة مكررة',      val: duplicates.length,                      icon: Smartphone,  color: 'text-warning'     },
    { label: 'حسابات محظورة',    val: bannedAccs.length,                       icon: Ban,         color: 'text-destructive'  },
    { label: 'حظر الأجهزة',      val: deviceBans.filter(b => b.is_active).length, icon: ShieldX, color: 'text-destructive'  },
    { label: 'أجهزة محظورة نشطة',val: duplicates.filter(d => d.is_banned).length, icon: AlertTriangle, color: 'text-orange-400' },
  ];

  const TABS: { id: TabId; label: string; count: number }[] = [
    { id: 'duplicates',      label: 'أجهزة مكررة',   count: duplicates.length },
    { id: 'banned_accounts', label: 'حسابات محظورة', count: bannedAccs.length },
    { id: 'device_bans',     label: 'حظر الأجهزة',   count: deviceBans.filter(b => b.is_active).length },
  ];

  const handleGroupClick = (g: DuplicateDeviceGroup) => {
    // تمرير البيانات عبر state لتجنب encoding مشاكل في URL
    const key = g.device_fp ?? g.hardware_hash ?? g.device_id ?? '';
    navigate(`/admin/duplicate-accounts/${encodeURIComponent(key)}`, { state: { group: g } });
  };

  return (
    <AdminShell
      title="الحسابات المكررة"
      subtitle="كشف وإدارة الأجهزة ذات الحسابات المتعددة"
      breadcrumbs={[{ label: 'الإدارة', href: '/admin' }, { label: 'الحسابات المكررة' }]}
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          تحديث
        </Button>
      }
    >
      {/* إحصائيات */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-2xl border bg-card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div>
              <p className="text-xl font-bold leading-none">{s.val}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* فحص شامل */}
      <div className="mb-4">
        <Button
          variant="outline"
          className="gap-2 w-full md:w-auto border-primary/30 text-primary hover:bg-primary/5"
          onClick={load}
        >
          <ScanSearch className="w-4 h-4" />
          فحص شامل للأجهزة المكررة
        </Button>
      </div>

      {/* بحث */}
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الجهاز أو الهاتف..."
          className="pr-9 h-11 rounded-xl"
        />
      </div>

      {/* تبويبات */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium shrink-0 transition-colors ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20' : 'bg-background'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* المحتوى */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── أجهزة مكررة ── */}
          {tab === 'duplicates' && (
            <div className="space-y-3">
              {filteredDups.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>لا توجد أجهزة مكررة</p>
                </div>
              ) : (
                filteredDups.map((g, i) => (
                  <GroupCard key={i} group={g} onClick={() => handleGroupClick(g)} />
                ))
              )}
            </div>
          )}

          {/* ── حسابات محظورة ── */}
          {tab === 'banned_accounts' && (
            <div className="space-y-3">
              {filteredBannedAccs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>لا توجد حسابات محظورة</p>
                </div>
              ) : filteredBannedAccs.map(a => (
                <div key={a.id} className="rounded-2xl border border-destructive/30 bg-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                    <Ban className="w-4 h-4 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{a.username ?? '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.phone ?? a.email ?? '—'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {a.updated_at ? format(new Date(a.updated_at), 'dd MMM yyyy', { locale: ar }) : '—'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs h-8"
                    onClick={() => navigate(`/admin/users/${a.id}`)}
                  >
                    عرض
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* ── حظر الأجهزة ── */}
          {tab === 'device_bans' && (
            <div className="space-y-3">
              {filteredDeviceBans.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>لا توجد أجهزة محظورة</p>
                </div>
              ) : filteredDeviceBans.map(b => (
                <div key={b.id} className={`rounded-2xl border bg-card p-4 ${b.is_active ? 'border-destructive/40' : 'border-border opacity-60'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                      <ShieldX className="w-4 h-4 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {b.associated_usernames?.join('، ') || '—'}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        {shortFp(b.device_fp ?? b.hardware_hash)}
                      </p>
                    </div>
                    <Badge variant={b.is_active ? 'destructive' : 'secondary'} className="text-[9px] shrink-0">
                      {b.is_active ? 'نشط' : 'ملغي'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    <span className="font-medium">السبب: </span>{b.ban_reason || '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    بواسطة: {b.banned_by_name ?? '—'} · {b.banned_at ? format(new Date(b.banned_at), 'dd MMM yyyy', { locale: ar }) : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
