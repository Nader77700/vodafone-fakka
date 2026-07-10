// صفحة Application Version Center — /admin/version-center
// إدارة إصدارات التطبيق وعرض توزيع المستخدمين
import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, RefreshCw, Shield, Loader2, CheckCircle,
  AlertTriangle, Ban, Users, Zap, Calendar, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import AdminShell, { SectionCard, InfoRow, ConfirmDialog } from '@/components/admin/AdminShell';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { BUILD_INFO } from '@/lib/buildInfo';

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy', { locale: ar }); } catch { return d; }
}

interface AppVersion {
  id: string;
  version: string;
  version_code: number;
  apk_url: string | null;
  release_notes: string | null;
  is_latest: boolean;
  update_type: string | null;
  created_at: string;
}

interface AppConfig {
  key: string;
  value: string;
}

export default function AdminVersionCenter() {
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [configs,  setConfigs]  = useState<Record<string, string>>({});
  const [userDist, setUserDist] = useState<Record<string, number>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  const [minCode,     setMinCode]     = useState('');
  const [blockedList, setBlockedList] = useState('');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; desc?: string; action: () => Promise<void>; variant?: 'default' | 'destructive' }>({ open: false, title: '', action: async () => {} });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [verRes, cfgRes, profRes] = await Promise.all([
        supabase.from('app_versions').select('*').order('version_code', { ascending: false }),
        // قراءة version_min_supported (المفتاح الصحيح الذي يقرأه useUpdateChecker)
        supabase.from('app_config').select('key,value').in('key', [
          'version_min_supported', 'version_min_code', 'version_blocked_codes',
          'version_force_update', 'version_latest_code', 'version_latest_name',
          'version_apk_url', 'version_recommended',
        ]),
        supabase.from('profiles').select('app_version'),
      ]);

      setVersions(Array.isArray(verRes.data) ? verRes.data : []);

      const cfgMap: Record<string, string> = {};
      (Array.isArray(cfgRes.data) ? cfgRes.data : []).forEach((c: AppConfig) => { cfgMap[c.key] = c.value; });
      setConfigs(cfgMap);
      // version_min_supported هو المفتاح الصحيح المقروء بواسطة useUpdateChecker
      setMinCode(cfgMap['version_min_supported'] ?? cfgMap['version_min_code'] ?? '0');
      setBlockedList(cfgMap['version_blocked_codes'] ?? '');
      setForceUpdate(cfgMap['version_force_update'] === 'true');

      // توزيع المستخدمين حسب الإصدار
      const dist: Record<string, number> = {};
      (Array.isArray(profRes.data) ? profRes.data : []).forEach((p: { app_version?: string | null }) => {
        const v = p.app_version ?? 'غير معروف';
        dist[v] = (dist[v] ?? 0) + 1;
      });
      setUserDist(dist);
    } catch { toast.error('فشل تحميل بيانات الإصدارات'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // حفظ مفتاح واحد في app_config
  const saveConfig = async (key: string, value: string, label: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('app_config').upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      if (error) throw error;
      toast.success(`✅ تم حفظ ${label}`);
      await load();
    } catch (e) { toast.error(`فشل: ${String(e)}`); }
    finally { setSaving(false); }
  };

  // تفعيل/إيقاف التحديث الإجباري — يكتب على version_min_supported (المفتاح الذي يقرأه useUpdateChecker)
  const handleForceUpdateToggle = async (enabled: boolean) => {
    setForceUpdate(enabled);
    setSaving(true);
    try {
      const latestCode = versions.find(v => v.is_latest)?.version_code ?? 0;
      // عند التفعيل: الحد الأدنى = أحدث إصدار + 1 (يجبر الكل حتى من لديه أحدث إصدار)
      // عند الإيقاف: الحد الأدنى = 0 (لا إجبار)
      const newMinCode = enabled ? String(latestCode + 1) : '0';
      const now = new Date().toISOString();
      const { error } = await supabase.from('app_config').upsert([
        { key: 'version_force_update',  value: String(enabled), updated_at: now },
        { key: 'version_min_supported', value: newMinCode,      updated_at: now },
        { key: 'version_min_code',      value: newMinCode,      updated_at: now },
      ], { onConflict: 'key' });
      if (error) throw error;
      if (enabled) {
        toast.success(`🚨 التحديث الإجباري مُفعَّل — الحد الأدنى = ${newMinCode} (جميع المستخدمين مُجبَرون)`);
      } else {
        toast.success('✅ التحديث الإجباري مُعطَّل — الكل يستطيع الدخول');
      }
      setMinCode(newMinCode);
      await load();
    } catch (e) { toast.error(`فشل: ${String(e)}`); setForceUpdate(!enabled); }
    finally { setSaving(false); }
  };

  const latest = versions.find(v => v.is_latest);
  const totalUsers = Object.values(userDist).reduce((s, n) => s + n, 0);

  return (
    <AdminShell
      title="Application Version Center"
      subtitle="إدارة إصدارات التطبيق ومراقبة التوزيع"
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/admin' },
        { label: 'Version Center' },
      ]}
      actions={
        <Button size="sm" variant="outline" onClick={load} className="h-8 gap-1">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      }
    >
      <div className="space-y-5">

        {/* ── ملخص الإصدارات ── */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl bg-muted" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'أحدث إصدار',    value: latest?.version ?? '—', icon: CheckCircle, color: 'text-success' },
              { label: 'كود الإصدار',   value: String(latest?.version_code ?? '—'), icon: Info, color: 'text-primary' },
              { label: 'الحد الأدنى',   value: configs['version_min_supported'] ?? configs['version_min_code'] ?? '—', icon: Shield, color: 'text-warning' },
              { label: 'إجمالي المستخدمين', value: String(totalUsers), icon: Users, color: 'text-blue-500' },
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
        )}

        {/* ── معلومات الإصدار الحالي للسيرفر ── */}
        <SectionCard title="الإصدار الحالي (Server)" icon={Smartphone}>
          <div className="rounded-xl border border-border overflow-hidden">
            <InfoRow label="Version Name"   value={BUILD_INFO.appVersion} />
            <InfoRow label="Version Code"   value={String(BUILD_INFO.versionCode)} />
            <InfoRow label="Build Date"     value={BUILD_INFO.buildTimestamp} />
            <InfoRow label="APK URL"        value={latest?.apk_url ?? '—'} copyable />
            <InfoRow label="Release Notes"  value={latest?.release_notes ?? '—'} />
          </div>
        </SectionCard>

        {/* ── إعدادات Force Update ── */}
        <SectionCard title="Force Update" icon={Zap}>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">تفعيل التحديث الإجباري</p>
                <p className="text-xs text-muted-foreground">يجبر المستخدمين القدامى على التحديث</p>
              </div>
              <Switch
                checked={forceUpdate}
                disabled={saving}
                onCheckedChange={handleForceUpdateToggle}
              />
            </div>
            <div>
              <Label className="text-xs mb-2 block">الحد الأدنى للإصدار (Version Code)</Label>
              <div className="flex gap-2">
                <Input value={minCode} onChange={e => setMinCode(e.target.value)} type="number" className="h-9 flex-1" />
                {/* يكتب على version_min_supported (المفتاح الصحيح) وكذلك version_min_code للتوافق */}
                <Button size="sm" className="h-9" disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const now = new Date().toISOString();
                      const { error } = await supabase.from('app_config').upsert([
                        { key: 'version_min_supported', value: minCode, updated_at: now },
                        { key: 'version_min_code',      value: minCode, updated_at: now },
                      ], { onConflict: 'key' });
                      if (error) throw error;
                      toast.success(`✅ تم تحديث الحد الأدنى: ${minCode}`);
                      await load();
                    } catch (e) { toast.error(`فشل: ${String(e)}`); }
                    finally { setSaving(false); }
                  }}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                أي مستخدم بكود أقل من هذا الرقم سيُجبَر على التحديث. <strong>0</strong> = لا إجبار.
              </p>
            </div>
            <div>
              <Label className="text-xs mb-2 block">الإصدارات المحظورة (version codes مفصولة بفاصلة)</Label>
              <div className="flex gap-2">
                <Input value={blockedList} onChange={e => setBlockedList(e.target.value)} className="h-9 flex-1" placeholder="95,96,97" />
                <Button size="sm" className="h-9" disabled={saving}
                  onClick={() => saveConfig('version_blocked_codes', blockedList, 'الإصدارات المحظورة')}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ'}
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── توزيع المستخدمين حسب الإصدار ── */}
        <SectionCard title="توزيع المستخدمين حسب الإصدار" icon={Users}>
          {loading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl bg-muted" />)}</div>
          ) : Object.keys(userDist).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(userDist)
                .sort((a, b) => b[1] - a[1])
                .map(([version, count]) => {
                  const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
                  const isLatest = version === latest?.version;
                  return (
                    <div key={version} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{version}</span>
                          {isLatest && <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded-full border border-success/20">أحدث</span>}
                        </div>
                        <span className="text-muted-foreground tabular-nums">{count} مستخدم ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isLatest ? 'bg-success' : 'bg-primary'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </SectionCard>

        {/* ── قائمة الإصدارات ── */}
        <SectionCard title="جميع الإصدارات" icon={Calendar}>
          {loading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl bg-muted" />)}</div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد إصدارات</p>
          ) : (
            <div className="space-y-2">
              {versions.map(v => (
                <div key={v.id} className={`p-3 rounded-xl border flex items-center gap-3 ${v.is_latest ? 'border-success/30 bg-success/5' : 'border-border bg-muted/20'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{v.version}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">code: {v.version_code}</span>
                      {v.is_latest && <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded-full border border-success/20">أحدث</span>}
                      {blockedList.split(',').includes(String(v.version_code)) && (
                        <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full border border-destructive/20">محظور</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(v.created_at)}</p>
                    {v.release_notes && <p className="text-[10px] text-muted-foreground truncate">{v.release_notes}</p>}
                  </div>
                  <div className="text-center shrink-0">
                    <p className="text-lg font-black tabular-nums text-primary">
                      {userDist[v.version] ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground">مستخدم</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={v => setConfirm(p => ({ ...p, open: v }))}
        title={confirm.title}
        description={confirm.desc}
        variant={confirm.variant}
        onConfirm={async () => { setConfirm(p => ({ ...p, open: false })); await confirm.action(); }}
      />
    </AdminShell>
  );
}
