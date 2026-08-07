// لوحة إدارة الإحالات — نظام الإحالات المرحلة الأولى
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Users, ChevronRight, ChevronLeft, CheckCircle, Clock, XCircle,
  RefreshCw, ToggleLeft, ToggleRight, Gift, Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  getAllReferralStats,
  getAdminReferralRecords,
  updateReferralStatus,
  getReferralSettings,
  updateReferralSettings,
  type AdminReferralRow,
  type ReferralRecord,
  type ReferralSettings,
} from '@/lib/api';

const STATUS_MAP = {
  accepted: { label: 'مقبولة',  icon: CheckCircle, cls: 'text-success bg-success/10 border-success/20' },
  pending:  { label: 'معلقة',   icon: Clock,       cls: 'text-warning bg-warning/10 border-warning/20' },
  rejected: { label: 'مرفوضة', icon: XCircle,     cls: 'text-destructive bg-destructive/10 border-destructive/20' },
} as const;

export default function AdminReferralManagement() {
  const [rows,     setRows]     = useState<AdminReferralRow[]>([]);
  const [settings, setSettings] = useState<ReferralSettings>({ system_enabled: true, accepting_referrals: true, counting_paused: false });
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');

  // تفاصيل مستخدم مختار
  const [selectedUser,    setSelectedUser]    = useState<AdminReferralRow | null>(null);
  const [detailRecords,   setDetailRecords]   = useState<(ReferralRecord & { referred_username?: string })[]>([]);
  const [detailLoading,   setDetailLoading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [statsData, settingsData] = await Promise.all([
      getAllReferralStats(),
      getReferralSettings(),
    ]);
    setRows(statsData);
    setSettings(settingsData);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (row: AdminReferralRow) => {
    setSelectedUser(row);
    setDetailLoading(true);
    const records = await getAdminReferralRecords(row.user_id);
    setDetailRecords(records);
    setDetailLoading(false);
  };

  const handleSettingToggle = async (key: keyof ReferralSettings) => {
    const newVal = !settings[key];
    const updated = { ...settings, [key]: newVal };
    setSettings(updated);
    const res = await updateReferralSettings({ [key]: newVal });
    if (!res.success) {
      setSettings(settings); // rollback
      toast.error('فشل تحديث الإعداد');
    } else {
      toast.success('تم تحديث الإعداد');
    }
  };

  const handleStatusChange = async (
    recordId: string,
    status: 'accepted' | 'rejected'
  ) => {
    const res = await updateReferralStatus(recordId, status);
    if (res.success) {
      setDetailRecords(prev =>
        prev.map(r => r.id === recordId ? { ...r, status, resolved_at: new Date().toISOString() } : r)
      );
      toast.success(`تم تغيير الحالة إلى ${STATUS_MAP[status].label}`);
      // أعد تحميل الإحصائيات
      load();
    } else {
      toast.error('فشل تحديث الحالة');
    }
  };

  const filteredRows = rows.filter(r =>
    r.username.toLowerCase().includes(search.toLowerCase()) ||
    r.referral_code.toLowerCase().includes(search.toLowerCase())
  );

  // ── عرض تفاصيل مستخدم ──
  if (selectedUser) {
    return (
      <div className="space-y-4 page-enter">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)} className="gap-1.5">
            <ChevronRight className="w-4 h-4" />
            رجوع
          </Button>
          <div>
            <h2 className="font-semibold text-foreground">{selectedUser.username}</h2>
            <p className="text-xs text-muted-foreground">كود: <span className="font-mono">{selectedUser.referral_code}</span></p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'الإجمالي', value: selectedUser.total,    cls: 'text-primary' },
            { label: 'مقبولة',   value: selectedUser.accepted, cls: 'text-success' },
            { label: 'معلقة',    value: selectedUser.pending,  cls: 'text-warning' },
            { label: 'مرفوضة',  value: selectedUser.rejected, cls: 'text-destructive' },
          ].map(({ label, value, cls }) => (
            <Card key={label} className="border-border">
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">سجل الدعوات</CardTitle>
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : detailRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد سجلات دعوات</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="pb-2 text-right font-medium">المدعو</th>
                      <th className="pb-2 text-right font-medium">تاريخ الدعوة</th>
                      <th className="pb-2 text-right font-medium">الحالة</th>
                      <th className="pb-2 text-right font-medium">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detailRecords.map(r => {
                      const s = STATUS_MAP[r.status] ?? STATUS_MAP.pending;
                      const Icon = s.icon;
                      return (
                        <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 font-medium text-foreground whitespace-nowrap">
                            {r.referred_username ?? r.referred_id.slice(0, 8)}
                          </td>
                          <td className="py-2.5 text-muted-foreground whitespace-nowrap">
                            {new Date(r.referred_at).toLocaleDateString('ar-EG')}
                          </td>
                          <td className="py-2.5 whitespace-nowrap">
                            <Badge className={`text-xs border ${s.cls}`}>
                              <Icon className="w-3 h-3 ml-1" />
                              {s.label}
                            </Badge>
                          </td>
                          <td className="py-2.5 whitespace-nowrap">
                            {r.status === 'pending' && (
                              <div className="flex gap-1.5">
                                <Button size="sm" variant="outline" className="h-7 text-xs text-success border-success/30 hover:bg-success/10"
                                  onClick={() => handleStatusChange(r.id, 'accepted')}>قبول</Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={() => handleStatusChange(r.id, 'rejected')}>رفض</Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── القائمة الرئيسية ──
  return (
    <div className="space-y-4 page-enter">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            Referral Management
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">إدارة نظام الإحالات ومتابعة سجلات الدعوات</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </Button>
      </div>

      {/* ── إعدادات النظام ── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">إعدادات نظام الإحالات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: 'system_enabled'      as const, label: 'تفعيل النظام',          desc: 'تشغيل أو إيقاف نظام الإحالات كاملاً' },
            { key: 'accepting_referrals' as const, label: 'استقبال الدعوات',       desc: 'السماح بتسجيل دعوات جديدة' },
            { key: 'counting_paused'     as const, label: 'إيقاف احتساب الدعوات', desc: 'تعليق قبول الدعوات تلقائياً (تبقى معلقة)' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/40 border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                checked={settings[key]}
                onCheckedChange={() => handleSettingToggle(key)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── إحصائيات إجمالية ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'المستخدمون',  value: rows.length,                       cls: 'text-primary' },
          { label: 'إجمالي الدعوات', value: rows.reduce((a,r)=>a+Number(r.total),0),    cls: 'text-foreground' },
          { label: 'مقبولة',       value: rows.reduce((a,r)=>a+Number(r.accepted),0),  cls: 'text-success' },
          { label: 'معلقة',        value: rows.reduce((a,r)=>a+Number(r.pending),0),   cls: 'text-warning' },
        ].map(({ label, value, cls }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${cls}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── جدول المستخدمين ── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              المستخدمون وأكواد الدعوة
            </CardTitle>
            <div className="relative flex-1 min-w-[160px] max-w-xs mr-auto">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pr-8 h-8 text-sm bg-muted/40 border-border"
                placeholder="بحث باسم أو كود..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">لا توجد نتائج</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="pb-2 text-right font-medium">المستخدم</th>
                    <th className="pb-2 text-right font-medium">الكود</th>
                    <th className="pb-2 text-right font-medium whitespace-nowrap">الإجمالي</th>
                    <th className="pb-2 text-right font-medium whitespace-nowrap">مقبولة</th>
                    <th className="pb-2 text-right font-medium whitespace-nowrap">معلقة</th>
                    <th className="pb-2 text-right font-medium whitespace-nowrap">مرفوضة</th>
                    <th className="pb-2 text-right font-medium">تفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRows.map(row => (
                    <tr key={row.user_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 font-medium text-foreground whitespace-nowrap">{row.username}</td>
                      <td className="py-2.5 whitespace-nowrap">
                        <code className="font-mono text-xs bg-muted/60 px-2 py-0.5 rounded text-primary">
                          {row.referral_code}
                        </code>
                      </td>
                      <td className="py-2.5 text-center font-bold text-foreground">{row.total}</td>
                      <td className="py-2.5 text-center text-success font-medium">{row.accepted}</td>
                      <td className="py-2.5 text-center text-warning font-medium">{row.pending}</td>
                      <td className="py-2.5 text-center text-destructive font-medium">{row.rejected}</td>
                      <td className="py-2.5 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-primary hover:text-primary"
                          onClick={() => openDetail(row)}
                        >
                          عرض
                          <ChevronLeft className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
