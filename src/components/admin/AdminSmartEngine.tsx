// ── لوحة النظام الذكي — واجهة الأوامر البسيطة ────────────────────────────────
// تترجم طلبات الأدمن البسيطة إلى عمليات كاملة على كل الأجهزة
// بدون الحاجة للدخول إلى Feature Flags أو Runtime Config

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Shield, Bell, Zap, Lock,
  RefreshCw, ChevronDown, ChevronUp, CheckCircle, XCircle,
  Loader2, Megaphone, Smartphone, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import {
  engineSetProduct, engineSetMaintenance, engineForceUpdate,
  engineBlockVersion, engineSetAnnouncement, engineSetFeature,
  engineGetStatus, type SystemStatus, type ProductKey, type FeatureKey,
} from '@/lib/adminEngine';

interface Props { onNavigate: (tab: string) => void; }

// ── Toggle بسيط ──────────────────────────────────────────────────────────────
function EngineToggle({
  label, enabled, loading, onToggle, danger = false,
}: { label: string; enabled: boolean; loading: boolean; onToggle: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      className={cn(
        'flex items-center justify-between w-full px-3 py-2.5 rounded-xl border transition-all',
        enabled
          ? danger
            ? 'bg-destructive/8 border-destructive/20 text-destructive'
            : 'bg-success/8 border-success/20 text-success'
          : 'bg-card border-border text-muted-foreground hover:border-primary/30',
        loading && 'opacity-60 cursor-not-allowed',
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : enabled ? (
        <ToggleRight className={cn('w-5 h-5 shrink-0', danger ? 'text-destructive' : 'text-success')} />
      ) : (
        <ToggleLeft className="w-5 h-5 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

// ── قسم قابل للطي ────────────────────────────────────────────────────────────
function Section({
  icon: Icon, title, subtitle, defaultOpen = false, children,
}: { icon: React.ElementType; title: string; subtitle: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-premium overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-4 text-right hover:bg-muted/20 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-sm font-bold">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-2 border-t border-border/50 pt-3">{children}</div>}
    </div>
  );
}

export default function AdminSmartEngine({ onNavigate }: Props) {
  const [status, setStatus]   = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);

  // حقول الأوامر
  const [minCode,    setMinCode]    = useState('');
  const [blockCodes, setBlockCodes] = useState('');
  const [annoText,   setAnnoText]   = useState('');
  const [annoType,   setAnnoType]   = useState<'info' | 'warning' | 'error' | 'success'>('info');
  const [mainMsg,    setMainMsg]    = useState('');

  // بيانات الإصدار الأحدث والإصدارات المحظورة نهائياً
  const [latestCode,      setLatestCode]      = useState<number>(0);
  const [latestName,      setLatestName]      = useState<string>('');
  const [permanentBanned, setPermanentBanned] = useState<{ version_code: number; version_name: string; reason: string }[]>([]);
  const [newBanCode,      setNewBanCode]      = useState('');
  const [newBanName,      setNewBanName]      = useState('');
  const [forceUpdateOn,   setForceUpdateOn]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // حالة النظام + أحدث إصدار + القائمة الدائمة — بالتوازي
      const [s, verRes, banRes, cfgRes] = await Promise.all([
        engineGetStatus(),
        supabase.from('app_versions').select('version_code,version').eq('is_latest', true).maybeSingle(),
        supabase.from('permanent_blocked_versions').select('version_code,version_name,reason').order('created_at', { ascending: false }),
        supabase.from('app_config').select('key,value').in('key', ['version_force_update']),
      ]);
      setStatus(s);
      setMinCode(String(s.minVersion));
      setBlockCodes(s.blockedCodes.join(', '));
      setAnnoText(s.announcement.text);

      if (verRes.data) {
        setLatestCode(verRes.data.version_code);
        setLatestName(verRes.data.version);
      }
      setPermanentBanned(Array.isArray(banRes.data) ? banRes.data : []);

      const cfgMap: Record<string,string> = {};
      (Array.isArray(cfgRes.data) ? cfgRes.data : []).forEach((r: { key: string; value: string }) => { cfgMap[r.key] = r.value; });
      setForceUpdateOn(cfgMap['version_force_update'] === 'true' || cfgMap['version_force_update'] === '1');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<{ success: boolean; message: string }>) => {
    setBusy(key);
    const res = await fn();
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    await load();
    setBusy(null);
  };

  // تفعيل/إيقاف التحديث الإجباري الفوري (version_force_update)
  const handleForceUpdateToggle = async (enabled: boolean) => {
    setBusy('force_update_toggle');
    try {
      const now = new Date().toISOString();
      const updates: { key: string; value: string; updated_at: string }[] = [
        { key: 'version_force_update', value: String(enabled), updated_at: now },
      ];
      if (enabled && latestCode > 0) {
        // الحد الأدنى = أحدث إصدار + 1 → يجبر حتى أصحاب أحدث إصدار لو أردنا
        // أو = latest code مباشرة → يجبر فقط من أقل منه
        updates.push({ key: 'version_min_supported', value: String(latestCode), updated_at: now });
        updates.push({ key: 'version_min_code',      value: String(latestCode), updated_at: now });
      } else if (!enabled) {
        updates.push({ key: 'version_min_supported', value: '1', updated_at: now });
        updates.push({ key: 'version_min_code',      value: '1', updated_at: now });
      }
      const { error } = await supabase.from('app_config').upsert(updates, { onConflict: 'key' });
      if (error) throw error;
      setForceUpdateOn(enabled);
      toast.success(enabled
        ? `🚨 التحديث الإجباري مُفعَّل — كل إصدار أقل من ${latestCode} سيُجبَر على التحديث`
        : '✅ التحديث الإجباري مُعطَّل');
      await load();
    } catch (e) {
      toast.error(`فشل: ${(e as Error).message}`);
    } finally { setBusy(null); }
  };

  // إضافة إصدار للحظر الدائم
  const handleAddPermanentBan = async () => {
    const code = Number(newBanCode.trim());
    if (!code || code <= 0) { toast.error('أدخل كود إصدار صحيح'); return; }
    setBusy('perm_ban');
    try {
      const { error } = await supabase.rpc('add_permanent_block', {
        p_version_code: code,
        p_version_name: newBanName.trim() || String(code),
        p_reason: 'حظر دائم من النظام الذكي',
      });
      if (error) throw error;
      // أضفه أيضاً لـ version_blocked_codes لضمان التطبيق الفوري
      const updated = [...new Set([...status!.blockedCodes, code])];
      await engineBlockVersion(updated);
      toast.success(`🔒 الإصدار ${code} محظور نهائياً ولا يمكن رفع الحظر عنه`);
      setNewBanCode('');
      setNewBanName('');
      await load();
    } catch (e) {
      toast.error(`فشل: ${(e as Error).message}`);
    } finally { setBusy(null); }
  };

  if (loading || !status) {
    return (
      <div className="card-premium p-6 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">جارٍ تحميل حالة النظام...</p>
      </div>
    );
  }

  const PRODUCTS: { key: ProductKey; label: string }[] = [
    { key: 'vodafone', label: 'كارت فودافون' },
    { key: 'orange',   label: 'كارت اورنج' },
    { key: 'etisalat', label: 'كارت اتصالات' },
    { key: 'we',       label: 'كارت WE' },
    { key: 'esim',     label: 'eSIM' },
    { key: 'recharge', label: 'الشحن' },
  ];

  const FEATURES: { key: FeatureKey; label: string }[] = [
    { key: 'favorites',     label: 'المفضلة' },
    { key: 'statistics',    label: 'الإحصائيات' },
    { key: 'operations',    label: 'سجل العمليات' },
    { key: 'notifications', label: 'الإشعارات' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">النظام الذكي</h3>
          <p className="text-xs text-muted-foreground">أوامر بسيطة — تطبّق على كل الأجهزة فوراً</p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={load} disabled={loading}>
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} /> تحديث
        </Button>
      </div>

      {/* ── 1. وضع الصيانة ── */}
      <Section icon={AlertTriangle} title="وضع الصيانة" subtitle="يوقف التطبيق كاملاً ويعرض رسالة لكل المستخدمين" defaultOpen={status.maintenance}>
        <EngineToggle
          label={status.maintenance ? '⚠️ الصيانة مفعّلة — التطبيق موقوف' : 'تفعيل وضع الصيانة'}
          enabled={status.maintenance}
          loading={busy === 'maintenance'}
          onToggle={() => run('maintenance', () => engineSetMaintenance(!status.maintenance))}
          danger={!status.maintenance}
        />
        <Input
          placeholder="رسالة الصيانة (اختياري)..."
          value={mainMsg}
          onChange={e => setMainMsg(e.target.value)}
          className="text-sm"
        />
        {mainMsg && (
          <Button size="sm" variant="outline" className="h-8 text-xs w-full border-border"
            onClick={() => run('maintenance_msg', () => engineSetMaintenance(status.maintenance, mainMsg))}>
            تحديث الرسالة فقط
          </Button>
        )}
      </Section>

      {/* ── 2. الكروت والمنتجات ── */}
      <Section icon={Smartphone} title="الكروت والمنتجات" subtitle="تشغيل أو إيقاف أي كارت على الفور — يؤثر على كل الإصدارات">
        {PRODUCTS.map(({ key, label }) => (
          <EngineToggle
            key={key}
            label={label}
            enabled={status.products[key]}
            loading={busy === `product_${key}`}
            onToggle={() => run(`product_${key}`, () => engineSetProduct(key, !status.products[key]))}
          />
        ))}
      </Section>

      {/* ── 3. الميزات ── */}
      <Section icon={ToggleLeft} title="الميزات" subtitle="تشغيل أو إيقاف الميزات الداخلية">
        {FEATURES.map(({ key, label }) => (
          <EngineToggle
            key={key}
            label={label}
            enabled={status.features[key]}
            loading={busy === `feature_${key}`}
            onToggle={() => run(`feature_${key}`, () => engineSetFeature(key, !status.features[key]))}
          />
        ))}
      </Section>

      {/* ── 4. التحديث الإجباري ── */}
      <Section icon={Shield} title="التحديث الإجباري" subtitle="حجب الإصدارات القديمة من الدخول">
        <div className="space-y-3">

          {/* Toggle تفعيل فوري */}
          <div className={cn(
            'flex items-center justify-between p-3 rounded-xl border transition-all',
            forceUpdateOn
              ? 'bg-destructive/8 border-destructive/20'
              : 'bg-card border-border',
          )}>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-bold', forceUpdateOn ? 'text-destructive' : 'text-foreground')}>
                {forceUpdateOn ? '🚨 التحديث الإجباري مُفعَّل' : 'تفعيل التحديث الإجباري'}
              </p>
              <p className="text-xs text-muted-foreground">
                {forceUpdateOn
                  ? `كل إصدار أقل من ${status.minVersion} مُجبَر على التحديث`
                  : latestCode > 0 ? `سيُعيَّن الحد الأدنى = ${latestCode} (أحدث إصدار: ${latestName})` : 'يطلب التحديث من كل المستخدمين'}
              </p>
            </div>
            <button
              disabled={busy === 'force_update_toggle'}
              onClick={() => handleForceUpdateToggle(!forceUpdateOn)}
              className="shrink-0 mr-2"
            >
              {busy === 'force_update_toggle'
                ? <Loader2 className="w-5 h-5 animate-spin text-primary" />
                : forceUpdateOn
                  ? <ToggleRight className="w-6 h-6 text-destructive" />
                  : <ToggleLeft  className="w-6 h-6 text-muted-foreground" />
              }
            </button>
          </div>

          {/* حد أدنى يدوي */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              الحد الأدنى للإصدار (code)
              {latestCode > 0 && (
                <button
                  className="mr-2 text-primary underline text-xs"
                  onClick={() => setMinCode(String(latestCode))}
                >
                  استخدم الأحدث ({latestCode})
                </button>
              )}
            </label>
            <div className="flex gap-2">
              <Input type="number" placeholder="مثال: 100" value={minCode}
                onChange={e => setMinCode(e.target.value)} className="text-sm" />
              <Button size="sm" className="h-9 text-xs shrink-0 gap-1"
                disabled={busy === 'force_update'}
                onClick={() => run('force_update', () => engineForceUpdate(Number(minCode)))}>
                {busy === 'force_update' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                تطبيق
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              الحالي: كل إصدار أقل من <strong>{status.minVersion}</strong> سيُجبَر على التحديث.
            </p>
            <p className="text-xs text-destructive/80">
              ملاحظة: الرقم هو <b>الحد المسموح به</b>. لإجبار إصدار {status.minVersion - 1} اكتب {status.minVersion} هنا.
            </p>
          </div>

          {/* حجب مؤقت (قابل للإلغاء) */}
          <div className="space-y-1.5 pt-2 border-t border-border/40">
            <label className="text-xs text-muted-foreground">حجب مؤقت (أرقام مفصولة بفاصلة)</label>
            <div className="flex gap-2">
              <Input placeholder="مثال: 95, 96" value={blockCodes}
                onChange={e => setBlockCodes(e.target.value)} className="text-sm font-mono" />
              <Button size="sm" variant="outline" className="h-9 text-xs shrink-0 border-border gap-1"
                disabled={busy === 'block_codes'}
                onClick={() => {
                  const codes = blockCodes.split(',').map(s => Number(s.trim())).filter(n => n > 0);
                  run('block_codes', () => engineBlockVersion(codes));
                }}>
                {busy === 'block_codes' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                حجب
              </Button>
            </div>
            {status.blockedCodes.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className="text-xs text-muted-foreground">محجوب الآن:</span>
                {status.blockedCodes.map(c => (
                  <span key={c} className="text-xs font-mono font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">{c}</span>
                ))}
                <button className="text-xs text-muted-foreground underline"
                  onClick={() => run('unblock_all', () => engineBlockVersion([]))}>
                  إلغاء الكل
                </button>
              </div>
            )}
          </div>

          {/* ── حظر دائم (لا يُلغى) ── */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-destructive" />
              <label className="text-xs font-bold text-destructive">حظر نهائي (لا يمكن رفعه)</label>
            </div>
            <p className="text-xs text-muted-foreground">
              يُحفظ في قاعدة البيانات بشكل دائم — حتى لو أُعيد تشغيل النظام أو مُسحت الإعدادات
            </p>
            <div className="flex gap-2">
              <Input type="number" placeholder="كود الإصدار" value={newBanCode}
                onChange={e => setNewBanCode(e.target.value)} className="text-sm font-mono w-28 shrink-0" />
              <Input placeholder="اسم (اختياري)" value={newBanName}
                onChange={e => setNewBanName(e.target.value)} className="text-sm flex-1" />
              <Button size="sm" variant="destructive" className="h-9 text-xs shrink-0 gap-1"
                disabled={busy === 'perm_ban' || !newBanCode.trim()}
                onClick={handleAddPermanentBan}>
                {busy === 'perm_ban' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                حجب
              </Button>
            </div>
            {permanentBanned.length > 0 && (
              <div className="space-y-1 mt-1">
                <p className="text-xs text-muted-foreground">محظور نهائياً ({permanentBanned.length}):</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {permanentBanned.map(b => (
                    <span key={b.version_code}
                      className="text-xs font-mono font-black bg-destructive/15 text-destructive border border-destructive/30 px-2 py-0.5 rounded-full">
                      {b.version_code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </Section>

      {/* ── 5. الإعلانات ── */}
      <Section icon={Megaphone} title="الإعلانات" subtitle="رسائل تظهر في التطبيق لكل المستخدمين">
        <EngineToggle
          label={status.announcement.enabled ? 'الإعلان مفعّل' : 'تفعيل الإعلان'}
          enabled={status.announcement.enabled}
          loading={busy === 'anno_toggle'}
          onToggle={() => run('anno_toggle', () => engineSetAnnouncement(!status.announcement.enabled, annoText, annoType))}
        />
        <Input
          placeholder="نص الإعلان..."
          value={annoText}
          onChange={e => setAnnoText(e.target.value)}
          className="text-sm"
        />
        <div className="flex gap-1.5">
          {(['info', 'warning', 'error', 'success'] as const).map(t => (
            <button key={t} onClick={() => setAnnoType(t)}
              className={cn(
                'flex-1 text-xs py-1.5 rounded-lg border font-semibold transition-colors',
                annoType === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40',
              )}>
              {t === 'info' ? 'معلومة' : t === 'warning' ? 'تحذير' : t === 'error' ? 'خطأ' : 'نجاح'}
            </button>
          ))}
        </div>
        <Button size="sm" variant="default" className="h-9 text-xs w-full gap-1"
          disabled={busy === 'anno_save' || !annoText}
          onClick={() => run('anno_save', () => engineSetAnnouncement(true, annoText, annoType))}>
          {busy === 'anno_save' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
          نشر الإعلان الآن
        </Button>
      </Section>

      {/* ── حالة سريعة ── */}
      <div className="card-premium p-3">
        <p className="text-xs font-bold mb-2 text-muted-foreground">حالة النظام الآن</p>
        <div className="flex items-center gap-3 flex-wrap">
          {status.maintenance
            ? <span className="flex items-center gap-1 text-xs text-destructive font-bold"><XCircle className="w-3.5 h-3.5" /> صيانة</span>
            : <span className="flex items-center gap-1 text-xs text-success font-bold"><CheckCircle className="w-3.5 h-3.5" /> يعمل</span>
          }
          <span className="text-xs text-muted-foreground">
            الكروت: {Object.values(status.products).filter(Boolean).length}/{Object.keys(status.products).length} نشط
          </span>
          <span className="text-xs text-muted-foreground">
            حد الإصدار: {status.minVersion}
          </span>
          {status.blockedCodes.length > 0 && (
            <span className="text-xs text-destructive">{status.blockedCodes.length} إصدار محجوب</span>
          )}
        </div>
      </div>
    </div>
  );
}
