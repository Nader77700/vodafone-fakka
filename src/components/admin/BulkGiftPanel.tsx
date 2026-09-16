/**
 * BulkGiftPanel — لوحة الهدايا الجماعية للأدمن
 * تتحكم في bulk-activate-and-notify Edge Function
 * 3 فئات: غير مشتركين (48h) | غير محدود (+يومين) | محدود (+10 عمليات)
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import {
  Gift, Users, Infinity, Hash, Send, RefreshCw,
  ChevronDown, ChevronUp, Loader2, CheckCircle2, Eye,
} from 'lucide-react';

// ── types ──────────────────────────────────────────────────────────────────
type Mode = 'all_three' | 'unsubscribed' | 'unlimited' | 'limited_ops';

interface NotifText { title: string; body: string; }
interface Stats {
  total_users: number;
  unsubscribed_count: number;
  unlimited_count: number;
  limited_ops_count: number;
  activated_unsubscribed?: number;
  extended_unlimited?: number;
  added_ops_limited?: number;
  fcm_unsubscribed?: number;
  fcm_unlimited?: number;
  fcm_limited_ops?: number;
}

const DEFAULT_NOTIFS: Record<Exclude<Mode, 'all_three'>, NotifText> = {
  unsubscribed: {
    title: '🎁 هدية خاصة لك من Vodafone Fakka!',
    body:  'تم تفعيل اشتراك مجاني لمدة 48 ساعة 🚀 افتح التطبيق الآن واستمتع بجميع الخدمات مجاناً!',
  },
  unlimited: {
    title: '🎉 تمديد اشتراكك مجاناً!',
    body:  'تمت إضافة يومين إضافيين لاشتراكك غير المحدود 💎 استمتع بالخدمات بدون حدود!',
  },
  limited_ops: {
    title: '⚡ رصيد عمليات مجاني!',
    body:  'تمت إضافة 10 عمليات إضافية مجانية لاشتراكك 🔥 استخدمها الآن!',
  },
};

// ── sub-components ────────────────────────────────────────────────────────

interface CategoryCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  count: number | null;
  notif: NotifText;
  onChange: (n: NotifText) => void;
  onSendSingle: () => void;
  sending: boolean;
  color: string;
}

function CategoryCard({ icon, label, description, count, notif, onChange, onSendSingle, sending, color }: CategoryCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-xl border ${color} bg-card overflow-hidden`}>
      <button
        className="w-full flex items-center justify-between p-3 gap-3 text-right"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0">{icon}</div>
          <div className="min-w-0 text-right">
            <p className="font-bold text-sm">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {count !== null && (
            <Badge variant="secondary" className="text-xs font-bold">{count?.toLocaleString('ar-EG')}</Badge>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          <p className="text-xs text-muted-foreground font-bold">نص الإشعار</p>
          <input
            type="text"
            value={notif.title}
            onChange={e => onChange({ ...notif, title: e.target.value })}
            placeholder="عنوان الإشعار..."
            className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors text-right"
          />
          <Textarea
            value={notif.body}
            onChange={e => onChange({ ...notif, body: e.target.value })}
            placeholder="نص الإشعار..."
            className="text-sm resize-none text-right"
            rows={2}
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={onSendSingle}
            disabled={sending || count === 0}
          >
            {sending
              ? <Loader2 className="w-4 h-4 animate-spin ml-2" />
              : <Send className="w-4 h-4 ml-2" />}
            إرسال لهذه الفئة فقط ({count?.toLocaleString('ar-EG') ?? '…'})
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function BulkGiftPanel() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [sending, setSending] = useState<Mode | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  const [notifs, setNotifs] = useState({ ...DEFAULT_NOTIFS });

  // ── جلب الإحصائيات (dry_run) ─────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-activate-and-notify', {
        body: { mode: 'all_three', dry_run: true },
      });
      if (error) throw error;
      if (data?.stats) setStats(data.stats);
    } catch (e: any) {
      toast.error('تعذر جلب الإحصائيات: ' + (e?.message ?? e));
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── تنفيذ الإرسال ─────────────────────────────────────────────────────
  async function execute(mode: Mode) {
    setSending(mode);
    try {
      const body: any = { mode, dry_run: false };
      if (mode === 'all_three' || mode === 'unsubscribed') body.notif_unsubscribed = notifs.unsubscribed;
      if (mode === 'all_three' || mode === 'unlimited')    body.notif_unlimited    = notifs.unlimited;
      if (mode === 'all_three' || mode === 'limited_ops')  body.notif_limited_ops  = notifs.limited_ops;

      const { data, error } = await supabase.functions.invoke('bulk-activate-and-notify', { body });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'فشل غير معروف');

      setLastResult(data);
      const s = data.stats;
      const lines = [
        s.activated_unsubscribed  ? `✅ ${s.activated_unsubscribed} غير مشترك — اشتراك 48h` : '',
        s.extended_unlimited      ? `✅ ${s.extended_unlimited} مشترك غير محدود — +يومين` : '',
        s.added_ops_limited       ? `✅ ${s.added_ops_limited} مشترك محدود — +10 عمليات` : '',
        `📲 إشعارات: ${(s.fcm_unsubscribed??0)+(s.fcm_unlimited??0)+(s.fcm_limited_ops??0)} جهاز`,
      ].filter(Boolean).join('\n');
      toast.success('تم الإرسال بنجاح 🎉\n' + lines);
      await fetchStats();
    } catch (e: any) {
      toast.error('فشل الإرسال: ' + (e?.message ?? e));
    } finally {
      setSending(null);
    }
  }

  const isSendingAny = sending !== null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-base">الهدايا والتعويضات الجماعية</h2>
            <p className="text-xs text-muted-foreground">تفعيل اشتراكات + إشعارات Push لكل الفئات</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loadingStats || isSendingAny}>
          <RefreshCw className={`w-4 h-4 ${loadingStats ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'غير مشتركين', val: stats?.unsubscribed_count, icon: <Users className="w-3.5 h-3.5" />, color: 'text-orange-500' },
          { label: 'غير محدود',   val: stats?.unlimited_count,    icon: <Infinity className="w-3.5 h-3.5" />, color: 'text-blue-500' },
          { label: 'محدود عمليات', val: stats?.limited_ops_count,  icon: <Hash className="w-3.5 h-3.5" />, color: 'text-purple-500' },
        ].map(item => (
          <div key={item.label} className="bg-muted/40 rounded-xl p-3 text-center">
            <div className={`flex justify-center mb-1 ${item.color}`}>{item.icon}</div>
            <p className="text-lg font-bold">
              {loadingStats ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (item.val?.toLocaleString('ar-EG') ?? '—')}
            </p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      <Separator />

      {/* بطاقات الفئات */}
      <div className="space-y-2">
        <CategoryCard
          icon={<Users className="w-5 h-5 text-orange-500" />}
          label="غير المشتركين"
          description="اشتراك تعويضي مجاني — 48 ساعة"
          count={stats?.unsubscribed_count ?? null}
          notif={notifs.unsubscribed}
          onChange={n => setNotifs(p => ({ ...p, unsubscribed: n }))}
          onSendSingle={() => execute('unsubscribed')}
          sending={sending === 'unsubscribed'}
          color="border-orange-500/30"
        />
        <CategoryCard
          icon={<Infinity className="w-5 h-5 text-blue-500" />}
          label="المشتركون غير المحدودين"
          description="تمديد تلقائي — +يومين لـ expires_at"
          count={stats?.unlimited_count ?? null}
          notif={notifs.unlimited}
          onChange={n => setNotifs(p => ({ ...p, unlimited: n }))}
          onSendSingle={() => execute('unlimited')}
          sending={sending === 'unlimited'}
          color="border-blue-500/30"
        />
        <CategoryCard
          icon={<Hash className="w-5 h-5 text-purple-500" />}
          label="المشتركون المحدودو العمليات"
          description="إضافة 10 عمليات لـ ops_remaining"
          count={stats?.limited_ops_count ?? null}
          notif={notifs.limited_ops}
          onChange={n => setNotifs(p => ({ ...p, limited_ops: n }))}
          onSendSingle={() => execute('limited_ops')}
          sending={sending === 'limited_ops'}
          color="border-purple-500/30"
        />
      </div>

      <Separator />

      {/* زر الإرسال الكلي */}
      <Button
        className="w-full font-bold"
        size="lg"
        onClick={() => execute('all_three')}
        disabled={isSendingAny || loadingStats}
      >
        {sending === 'all_three'
          ? <><Loader2 className="w-5 h-5 animate-spin ml-2" />جارٍ الإرسال للجميع…</>
          : <><Send className="w-5 h-5 ml-2" />إرسال للفئات الثلاث دفعة واحدة</>}
      </Button>

      {/* نتيجة آخر إرسال */}
      {lastResult && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-2 text-green-600 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4" />
            نتيجة آخر إرسال
          </div>
          {[
            { label: 'اشتراكات جديدة (غير مشتركين)',   val: lastResult.stats?.activated_unsubscribed },
            { label: 'اشتراكات ممدودة (غير محدود)',     val: lastResult.stats?.extended_unlimited },
            { label: 'عمليات مضافة (محدود)',             val: lastResult.stats?.added_ops_limited },
            { label: 'إشعارات لغير المشتركين',           val: lastResult.stats?.fcm_unsubscribed },
            { label: 'إشعارات لغير المحدودين',           val: lastResult.stats?.fcm_unlimited },
            { label: 'إشعارات لمحدودي العمليات',         val: lastResult.stats?.fcm_limited_ops },
          ].filter(r => r.val != null && r.val > 0).map(r => (
            <div key={r.label} className="flex justify-between text-xs text-muted-foreground">
              <span>{r.label}</span>
              <span className="font-bold text-foreground">{r.val?.toLocaleString('ar-EG')}</span>
            </div>
          ))}
        </div>
      )}

      {/* preview button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs text-muted-foreground"
        onClick={fetchStats}
        disabled={loadingStats || isSendingAny}
      >
        <Eye className="w-3.5 h-3.5 ml-1" />
        معاينة الأعداد (dry run)
      </Button>
    </div>
  );
}
