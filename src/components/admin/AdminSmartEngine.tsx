// ── لوحة النظام الذكي — واجهة الأوامر البسيطة ────────────────────────────────
// تترجم طلبات الأدمن البسيطة إلى عمليات كاملة على كل الأجهزة
// بدون الحاجة للدخول إلى Feature Flags أو Runtime Config

import { useState, useEffect, useCallback } from 'react';
import {
  Power, AlertTriangle, Shield, Bell, Zap,
  RefreshCw, ChevronDown, ChevronUp, CheckCircle, XCircle,
  Loader2, Megaphone, Smartphone, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
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
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await engineGetStatus();
      setStatus(s);
      setMinCode(String(s.minVersion));
      setBlockCodes(s.blockedCodes.join(', '));
      setAnnoText(s.announcement.text);
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
          <p className="text-[11px] text-muted-foreground">أوامر بسيطة — تطبّق على كل الأجهزة فوراً</p>
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
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">الحد الأدنى للإصدار (code)</label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="مثال: 100"
              value={minCode}
              onChange={e => setMinCode(e.target.value)}
              className="text-sm"
            />
            <Button size="sm" variant="default" className="h-9 text-xs shrink-0 gap-1"
              disabled={busy === 'force_update'}
              onClick={() => run('force_update', () => engineForceUpdate(Number(minCode)))}>
              {busy === 'force_update' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              تطبيق
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">الحالي: كل من عنده code أقل من <strong>{status.minVersion}</strong> مجبور يحدّث</p>
        </div>
        <div className="space-y-2 pt-2 border-t border-border/40">
          <label className="text-xs text-muted-foreground">حجب إصدارات محددة (أرقام مفصولة بفاصلة)</label>
          <div className="flex gap-2">
            <Input
              placeholder="مثال: 95, 96, 98"
              value={blockCodes}
              onChange={e => setBlockCodes(e.target.value)}
              className="text-sm font-mono"
            />
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">محجوب الآن:</span>
              {status.blockedCodes.map(c => (
                <span key={c} className="text-[10px] font-mono font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">{c}</span>
              ))}
              <button className="text-[10px] text-muted-foreground underline"
                onClick={() => run('unblock_all', () => engineBlockVersion([]))}>
                إلغاء الكل
              </button>
            </div>
          )}
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
