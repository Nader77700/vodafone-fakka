/**
 * AdminOffersCenter — مركز العروض والتحديثات
 * المرحلة الأولى: لوحة التحكم الكاملة + القوالب + البيانات
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight, Plus, RefreshCw, Pencil, Trash2, Copy, Eye,
  ToggleLeft as ToggleOff, ToggleRight as ToggleOn,
  Tag, Sparkles, Layout, RotateCcw, Megaphone, Settings2,
  Save, X, ChevronDown, ChevronUp, GripVertical, Globe,
  MessageCircle, Link2, Ban, Star, Zap, Gift, Shield,
  Loader2, AlertTriangle, CheckCircle2, Clock, Calendar,
  Hash, Type, AlignLeft, ToggleLeft, List, SlidersHorizontal,
  BookOpen, TrendingUp, Bell, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ContentCard, CardTemplate, CardType, CardStatus, CtaType,
  RepeatPolicy, TemplateField,
  adminGetAllContentCards, adminCreateContentCard,
  adminUpdateContentCard, adminDeleteContentCard,
  adminCloneContentCard, adminBumpCardRevision,
  adminGetAllCardTemplates, adminCreateCardTemplate,
  adminUpdateCardTemplate, adminDeleteCardTemplate,
} from '@/lib/api';
import { supabase } from '@/db/supabase';

// ── قائمة الصفحات المستخرجة من Navigation ─────────────────────
const APP_ROUTES: { label: string; value: string; group: string }[] = [
  { group: 'الرئيسية',       label: 'الصفحة الرئيسية',          value: '/home' },
  { group: 'الشبكات',        label: 'كل الشبكات',               value: '/networks' },
  { group: 'الشبكات',        label: 'Vodafone',                  value: '/networks/vodafone' },
  { group: 'الشبكات',        label: 'Orange',                    value: '/networks/orange' },
  { group: 'الشبكات',        label: 'Etisalat',                  value: '/networks/etisalat' },
  { group: 'الشبكات',        label: 'WE',                        value: '/networks/we' },
  { group: 'الشبكات',        label: 'eSIM',                      value: '/networks/esim' },
  { group: 'الخدمات',        label: 'الخدمات',                   value: '/services' },
  { group: 'الخدمات',        label: 'عروض Vodafone',             value: '/vodafone-offers' },
  { group: 'الخدمات',        label: 'عروض الإنترنت',             value: '/vodafone-offers/internet' },
  { group: 'الخدمات',        label: 'عروض فليكس',               value: '/vodafone-offers/flex' },
  { group: 'الخدمات',        label: 'شحن الرصيد',               value: '/recharge' },
  { group: 'الخدمات',        label: 'شحن بالرصيد',              value: '/balance-charge' },
  { group: 'الخدمات',        label: 'خطوط المحفظة',             value: '/wallet-lines' },
  { group: 'الحساب',         label: 'المفضلة',                   value: '/favorites' },
  { group: 'الحساب',         label: 'العمليات',                  value: '/operations' },
  { group: 'الحساب',         label: 'الإحصائيات',               value: '/statistics' },
  { group: 'الحساب',         label: 'الإشعارات',                value: '/notifications' },
  { group: 'الحساب',         label: 'الإعدادات',                value: '/settings' },
  { group: 'الحساب',         label: 'تاريخ الاشتراكات',         value: '/subscription-history' },
  { group: 'الحساب',         label: 'الإحالات',                 value: '/referrals' },
  { group: 'أخرى',           label: 'التحديثات',                value: '/updates' },
  { group: 'أخرى',           label: 'معلومات الخط',             value: '/line-info' },
];

// ── أنواع الكروت ─────────────────────────────────────────────
const CARD_TYPES: { id: CardType; label: string; icon: React.ElementType; color: string; desc: string }[] = [
  { id: 'offer',        label: 'عرض',            icon: Tag,        color: '#E60000', desc: 'سعر قديم وجديد وخصم ومدة' },
  { id: 'feature',      label: 'ميزة جديدة',     icon: Sparkles,   color: '#00BCD4', desc: 'شرح ميزة مع نقاط مميزة' },
  { id: 'section',      label: 'قسم جديد',       icon: Layout,     color: '#9C27B0', desc: 'تعريف بقسم أو صفحة في التطبيق' },
  { id: 'update',       label: 'تحديث',          icon: RotateCcw,  color: '#4CAF50', desc: 'رقم إصدار وقائمة تغييرات' },
  { id: 'announcement', label: 'إعلان',          icon: Megaphone,  color: '#FF9800', desc: 'رسالة عامة مع مدة ظهور' },
  { id: 'custom',       label: 'قالب مخصص',      icon: Settings2,  color: '#607D8B', desc: 'حقول من قالب مخصص' },
];

const STATUS_META: Record<CardStatus, { label: string; color: string }> = {
  draft:     { label: 'مسودة',  color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  active:    { label: 'نشط',    color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  scheduled: { label: 'مجدول', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
  disabled:  { label: 'معطّل', color: 'text-muted-foreground bg-muted border-border' },
  ended:     { label: 'منتهي', color: 'text-red-400/80 bg-red-400/10 border-red-400/30' },
};

const REPEAT_LABELS: Record<RepeatPolicy, string> = {
  once:       'مرة واحدة',
  every_open: 'عند كل فتح',
  hourly:     'كل X ساعات',
  daily:      'كل X أيام',
  weekly:     'كل X أسابيع',
  monthly:    'كل X أشهر',
};

const CTA_ICONS: Record<CtaType, React.ElementType> = {
  internal:  Layout,
  whatsapp:  MessageCircle,
  external:  Globe,
  none:      Ban,
};

// ── الكارت الافتراضي الجديد ────────────────────────────────
function defaultCard(type: CardType): Omit<ContentCard, 'id' | 'created_at' | 'updated_at'> {
  return {
    card_type: type, template_name: null, status: 'draft',
    title: '', description: null, badge_text: null, badge_color: '#E60000',
    icon_name: null, image_url: null,
    old_price: null, new_price: null, discount_value: null,
    offer_duration: null, details: null,
    feature_points: [], section_route: null,
    version_name: null, changelog: [],
    cta_label: 'اكتشف الآن', cta_type: 'none', cta_destination: null,
    start_date: null, end_date: null,
    repeat_policy: 'once', repeat_value: 1,
    priority: 0, sort_order: 0,
    is_active: true, system_enabled: true,
    revision: 1, parent_id: null,
    custom_fields: {}, field_values: {},
    created_by: null,
  };
}

// ── Icon lookup ───────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  tag: Tag, sparkles: Sparkles, layout: Layout, rotate: RotateCcw,
  megaphone: Megaphone, settings: Settings2, star: Star, zap: Zap,
  gift: Gift, shield: Shield, globe: Globe, bell: Bell,
  trending: TrendingUp, book: BookOpen, package: Package,
};
function CardIcon({ name, className }: { name: string | null; className?: string }) {
  const I = name ? (ICON_MAP[name.toLowerCase()] ?? Tag) : Tag;
  return <I className={className} />;
}

// ── Sanitize URL ──────────────────────────────────────────────
function sanitizeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch { return null; }
}
function sanitizeWhatsApp(raw: string): string {
  const digits = raw.replace(/[\s\-+()\u00A0]/g, '');
  return `https://wa.me/${digits}`;
}

// ════════════════════════════════════════════════════════════════
//  المكوّن الرئيسي
// ════════════════════════════════════════════════════════════════
export default function AdminOffersCenter() {
  const navigate = useNavigate();

  // ── بيانات ─────────────────────────────────────────────────
  const [cards, setCards]               = useState<ContentCard[]>([]);
  const [templates, setTemplates]       = useState<CardTemplate[]>([]);
  const [loading, setLoading]           = useState(true);
  const [tplLoading, setTplLoading]     = useState(false);

  // ── حوارات ─────────────────────────────────────────────────
  const [editCard, setEditCard]         = useState<Partial<ContentCard> | null>(null);
  const [isNewCard, setIsNewCard]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContentCard | null>(null);
  const [previewCard, setPreviewCard]   = useState<ContentCard | null>(null);
  const [editTpl, setEditTpl]           = useState<Partial<CardTemplate> | null>(null);
  const [isNewTpl, setIsNewTpl]         = useState(false);
  const [savingTpl, setSavingTpl]       = useState(false);
  const [deleteTplTarget, setDeleteTplTarget] = useState<CardTemplate | null>(null);

  // ── فلتر ──────────────────────────────────────────────────
  const [filterType, setFilterType]     = useState<CardType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<CardStatus | 'all'>('all');
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  // ── تحميل ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try { setCards(await adminGetAllContentCards()); }
    catch { toast.error('فشل تحميل الكروت'); }
    finally { setLoading(false); }
  }, []);

  const loadTemplates = useCallback(async () => {
    setTplLoading(true);
    try { setTemplates(await adminGetAllCardTemplates()); }
    catch { toast.error('فشل تحميل القوالب'); }
    finally { setTplLoading(false); }
  }, []);

  useEffect(() => { load(); loadTemplates(); }, [load, loadTemplates]);

  // ── فلترة ─────────────────────────────────────────────────
  const filtered = useMemo(() => cards.filter(c =>
    (filterType === 'all' || c.card_type === filterType) &&
    (filterStatus === 'all' || c.status === filterStatus)
  ), [cards, filterType, filterStatus]);

  // ── حفظ الكارت ────────────────────────────────────────────
  const handleSaveCard = useCallback(async () => {
    if (!editCard?.title?.trim()) { toast.error('العنوان مطلوب'); return; }
    if (editCard.cta_type === 'external' && editCard.cta_destination) {
      if (!sanitizeUrl(editCard.cta_destination)) {
        toast.error('رابط خارجي غير صالح — يجب أن يبدأ بـ http أو https');
        return;
      }
    }
    setSaving(true);
    try {
      if (isNewCard) {
        const currentUser = (await supabase.auth.getUser()).data.user;
        await adminCreateContentCard({
          ...(editCard as Omit<ContentCard, 'id' | 'created_at' | 'updated_at'>),
          created_by: currentUser?.id ?? null,
          feature_points: editCard.feature_points ?? [],
          changelog: editCard.changelog ?? [],
        });
        toast.success('تم إنشاء الكارت');
      } else {
        await adminUpdateContentCard(editCard.id!, editCard);
        toast.success('تم حفظ التعديلات');
      }
      setEditCard(null);
      await load();
    } catch (e) {
      toast.error('فشل الحفظ: ' + (e as Error).message);
    } finally { setSaving(false); }
  }, [editCard, isNewCard, load]);

  // ── حذف الكارت ────────────────────────────────────────────
  const handleDeleteCard = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await adminDeleteContentCard(deleteTarget.id);
      toast.success('تم الحذف');
      setDeleteTarget(null);
      await load();
    } catch { toast.error('فشل الحذف'); }
  }, [deleteTarget, load]);

  // ── Clone ──────────────────────────────────────────────────
  const handleClone = useCallback(async (id: string) => {
    try {
      await adminCloneContentCard(id);
      toast.success('تم نسخ الكارت كمسودة');
      await load();
    } catch { toast.error('فشل النسخ'); }
  }, [load]);

  // ── Bump Revision ─────────────────────────────────────────
  const handleBumpRevision = useCallback(async (id: string) => {
    try {
      const rev = await adminBumpCardRevision(id);
      toast.success(`تم نشر Revision ${rev} — سيُعرض للمستخدمين من جديد`);
      await load();
    } catch { toast.error('فشل نشر الـ Revision'); }
  }, [load]);

  // ── Toggle Active ─────────────────────────────────────────
  const handleToggleActive = useCallback(async (card: ContentCard) => {
    try {
      await adminUpdateContentCard(card.id, { is_active: !card.is_active });
      await load();
    } catch { toast.error('فشل التغيير'); }
  }, [load]);

  // ── حفظ القالب ────────────────────────────────────────────
  const handleSaveTpl = useCallback(async () => {
    if (!editTpl?.name?.trim()) { toast.error('اسم القالب مطلوب'); return; }
    setSavingTpl(true);
    try {
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (isNewTpl) {
        await adminCreateCardTemplate({
          name: editTpl.name!,
          description: editTpl.description ?? null,
          fields_config: editTpl.fields_config ?? [],
          is_active: true,
          created_by: currentUser?.id ?? null,
        });
        toast.success('تم إنشاء القالب');
      } else {
        await adminUpdateCardTemplate(editTpl.id!, editTpl);
        toast.success('تم حفظ القالب');
      }
      setEditTpl(null);
      await loadTemplates();
    } catch (e) {
      toast.error('فشل الحفظ: ' + (e as Error).message);
    } finally { setSavingTpl(false); }
  }, [editTpl, isNewTpl, loadTemplates]);

  // ════════════════════════════════════════════════════════════
  //  Render
  // ════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/admin')}>
            <ArrowRight className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base truncate">مركز العروض والتحديثات</h1>
            <p className="text-xs text-muted-foreground">إدارة كروت العروض والميزات والتحديثات</p>
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" onClick={() => { load(); loadTemplates(); }}>
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <Tabs defaultValue="cards">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="cards" className="gap-1.5">
              <Tag className="w-3.5 h-3.5" /> الكروت ({cards.length})
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5">
              <Settings2 className="w-3.5 h-3.5" /> القوالب المخصصة ({templates.length})
            </TabsTrigger>
          </TabsList>

          {/* ══ تاب الكروت ══ */}
          <TabsContent value="cards" className="space-y-4 mt-4">
            {/* ── أدوات التصفية والإنشاء ── */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterType} onValueChange={v => setFilterType(v as CardType | 'all')}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {CARD_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={v => setFilterStatus(v as CardStatus | 'all')}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {(Object.keys(STATUS_META) as CardStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex-1" />
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setTypePickerOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> كارت جديد
              </Button>
            </div>

            {/* ── قائمة الكروت ── */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
                <Tag className="w-8 h-8 mx-auto opacity-30" />
                <p>لا توجد كروت — اضغط «كارت جديد» للبدء</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(card => <CardRow key={card.id} card={card}
                  onEdit={() => { setIsNewCard(false); setEditCard({ ...card }); }}
                  onClone={() => handleClone(card.id)}
                  onDelete={() => setDeleteTarget(card)}
                  onToggle={() => handleToggleActive(card)}
                  onPreview={() => setPreviewCard(card)}
                  onBumpRevision={() => handleBumpRevision(card.id)}
                />)}
              </div>
            )}
          </TabsContent>

          {/* ══ تاب القوالب المخصصة ══ */}
          <TabsContent value="templates" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => {
                setIsNewTpl(true);
                setEditTpl({ name: '', description: '', fields_config: [], is_active: true });
              }}>
                <Plus className="w-3.5 h-3.5" /> قالب جديد
              </Button>
            </div>
            {tplLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
                <Settings2 className="w-8 h-8 mx-auto opacity-30" />
                <p>لا توجد قوالب مخصصة — اضغط «قالب جديد» لإنشاء أول قالب</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map(tpl => (
                  <div key={tpl.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Settings2 className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{tpl.name}</p>
                          <p className="text-xs text-muted-foreground">{tpl.fields_config.length} حقل</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => { setIsNewTpl(false); setEditTpl({ ...tpl }); }}>
                          <Pencil className="w-3 h-3" /> تعديل
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => setDeleteTplTarget(tpl)}>
                          <Trash2 className="w-3 h-3" /> حذف
                        </Button>
                      </div>
                    </div>
                    {tpl.description && (
                      <p className="mt-2 text-xs text-muted-foreground">{tpl.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ══ حوار اختيار نوع الكارت الجديد ══ */}
      <Dialog open={typePickerOpen} onOpenChange={setTypePickerOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> اختر نوع الكارت
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
            {CARD_TYPES.map(t => (
              <button key={t.id}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-center"
                onClick={() => {
                  setTypePickerOpen(false);
                  setIsNewCard(true);
                  const d = defaultCard(t.id);
                  // badge defaults حسب النوع
                  const badgeDefaults: Partial<typeof d> = {
                    offer:        { badge_text: 'عرض',    badge_color: '#E60000', cta_label: 'اطلب الآن' },
                    feature:      { badge_text: 'جديد',   badge_color: '#00BCD4', cta_label: 'اكتشف الآن' },
                    section:      { badge_text: 'قسم',    badge_color: '#9C27B0', cta_label: 'انتقل للقسم' },
                    update:       { badge_text: 'تحديث',  badge_color: '#4CAF50', cta_label: 'عرض التفاصيل' },
                    announcement: { badge_text: 'إعلان',  badge_color: '#FF9800', cta_label: '' },
                    custom:       { badge_text: '',        badge_color: '#607D8B', cta_label: '' },
                  }[t.id] as Partial<typeof d>;
                  setEditCard({ ...d, ...badgeDefaults });
                }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${t.color}20`, border: `1.5px solid ${t.color}40` }}>
                  <t.icon className="w-5 h-5" style={{ color: t.color }} />
                </div>
                <div>
                  <p className="font-bold text-xs">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ حوار إنشاء / تعديل كارت ══ */}
      {editCard && (
        <CardEditDialog
          card={editCard}
          isNew={isNewCard}
          saving={saving}
          templates={templates}
          onChange={updates => setEditCard(p => p ? { ...p, ...updates } : p)}
          onSave={handleSaveCard}
          onClose={() => setEditCard(null)}
        />
      )}

      {/* ══ Preview ══ */}
      {previewCard && (
        <Dialog open onOpenChange={() => setPreviewCard(null)}>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" /> معاينة الكارت
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2">
              <CardPreview card={previewCard} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewCard(null)}>إغلاق</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ══ حذف الكارت ══ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الكارت</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف «{deleteTarget?.title}»؟ لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDeleteCard}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ══ حوار تعديل/إنشاء قالب مخصص ══ */}
      {editTpl && (
        <TemplateEditDialog
          tpl={editTpl}
          isNew={isNewTpl}
          saving={savingTpl}
          onChange={u => setEditTpl(p => p ? { ...p, ...u } : p)}
          onSave={handleSaveTpl}
          onClose={() => setEditTpl(null)}
        />
      )}

      {/* ══ حذف القالب ══ */}
      <AlertDialog open={!!deleteTplTarget} onOpenChange={v => { if (!v) setDeleteTplTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القالب</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف قالب «{deleteTplTarget?.name}»؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => {
              if (!deleteTplTarget) return;
              await adminDeleteCardTemplate(deleteTplTarget.id);
              toast.success('تم الحذف');
              setDeleteTplTarget(null);
              loadTemplates();
            }}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  CardRow — صف عرض الكارت في القائمة
// ════════════════════════════════════════════════════════════════
function CardRow({
  card, onEdit, onClone, onDelete, onToggle, onPreview, onBumpRevision,
}: {
  card: ContentCard;
  onEdit: () => void; onClone: () => void; onDelete: () => void;
  onToggle: () => void; onPreview: () => void; onBumpRevision: () => void;
}) {
  const typeInfo = CARD_TYPES.find(t => t.id === card.card_type) ?? CARD_TYPES[0];
  const statusMeta = STATUS_META[card.status] ?? STATUS_META.draft;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: `${typeInfo.color}18`, border: `1.5px solid ${typeInfo.color}35` }}>
            <typeInfo.icon className="w-4 h-4" style={{ color: typeInfo.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sm">{card.title}</p>
              {card.badge_text && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: card.badge_color ?? '#E60000' }}>
                  {card.badge_text}
                </span>
              )}
            </div>
            {card.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{card.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusMeta.color}`}>
                {statusMeta.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{typeInfo.label}</span>
              <span className="text-[10px] text-muted-foreground">v{card.revision}</span>
              {card.priority > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5" /> {card.priority}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              {card.is_active
                ? <ToggleOn className="w-5 h-5 text-green-400" />
                : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
            </button>
            <button onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* أدوات موسّعة */}
      {expanded && (
        <div className="border-t border-border/60 bg-muted/20 px-4 py-3 space-y-3">
          {/* معلومات مختصرة */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {[
              { label: 'التكرار', value: `${REPEAT_LABELS[card.repeat_policy]}${card.repeat_policy !== 'once' && card.repeat_policy !== 'every_open' ? ` (${card.repeat_value})` : ''}` },
              { label: 'الأولوية', value: String(card.priority) },
              { label: 'الوجهة', value: card.cta_type === 'none' ? 'بدون' : (card.cta_destination ?? '—') },
              { label: 'البداية', value: card.start_date ? new Date(card.start_date).toLocaleDateString('ar-EG') : 'فوري' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-background/50 rounded-lg px-2.5 py-1.5">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="font-semibold text-xs truncate">{value}</p>
              </div>
            ))}
          </div>
          {/* أزرار الإجراءات */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onPreview}>
              <Eye className="w-3 h-3" /> معاينة
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onEdit}>
              <Pencil className="w-3 h-3" /> تعديل
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onClone}>
              <Copy className="w-3 h-3" /> نسخ
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-blue-400 border-blue-400/30 hover:bg-blue-400/10"
              onClick={onBumpRevision}>
              <RotateCcw className="w-3 h-3" /> نشر Revision جديد
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={onDelete}>
              <Trash2 className="w-3 h-3" /> حذف
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  CardEditDialog — حوار إنشاء / تعديل كارت كامل
// ════════════════════════════════════════════════════════════════
function CardEditDialog({
  card, isNew, saving, templates, onChange, onSave, onClose,
}: {
  card: Partial<ContentCard>; isNew: boolean; saving: boolean;
  templates: CardTemplate[];
  onChange: (u: Partial<ContentCard>) => void;
  onSave: () => void; onClose: () => void;
}) {
  const typeInfo = CARD_TYPES.find(t => t.id === card.card_type) ?? CARD_TYPES[0];
  const [showPreview, setShowPreview] = useState(false);

  // حقول الـ feature_points و changelog كـ string مؤقت
  const [featurePointsText, setFeaturePointsText] = useState(
    (card.feature_points ?? []).join('\n')
  );
  const [changelogText, setChangelogText] = useState(
    (card.changelog ?? []).join('\n')
  );

  return (
    <Dialog open onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border overflow-y-auto max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: `${typeInfo.color}20` }}>
              <typeInfo.icon className="w-3.5 h-3.5" style={{ color: typeInfo.color }} />
            </div>
            {isNew ? `إنشاء ${typeInfo.label}` : `تعديل — ${card.title}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* ── عنوان + وصف ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">العنوان *</Label>
              <Input value={card.title ?? ''} onChange={e => onChange({ title: e.target.value })} placeholder="عنوان الكارت" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Badge النص</Label>
              <div className="flex gap-2">
                <Input value={card.badge_text ?? ''} onChange={e => onChange({ badge_text: e.target.value })} placeholder="جديد / عرض / تحديث" className="flex-1" />
                <input type="color" value={card.badge_color ?? '#E60000'}
                  onChange={e => onChange({ badge_color: e.target.value })}
                  className="h-9 w-10 rounded border border-border cursor-pointer bg-transparent" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">الوصف</Label>
            <Textarea value={card.description ?? ''} onChange={e => onChange({ description: e.target.value })} rows={2} placeholder="وصف مختصر يظهر في الكارت" />
          </div>

          {/* ── حقول خاصة بـ Offer ── */}
          {card.card_type === 'offer' && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> تفاصيل العرض
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">السعر القديم</Label>
                  <Input value={card.old_price ?? ''} onChange={e => onChange({ old_price: e.target.value })} placeholder="مثلاً 50 جنيه" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">السعر الجديد</Label>
                  <Input value={card.new_price ?? ''} onChange={e => onChange({ new_price: e.target.value })} placeholder="مثلاً 30 جنيه" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الخصم</Label>
                  <Input value={card.discount_value ?? ''} onChange={e => onChange({ discount_value: e.target.value })} placeholder="40% أو 20 جنيه" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">مدة العرض</Label>
                  <Input value={card.offer_duration ?? ''} onChange={e => onChange({ offer_duration: e.target.value })} placeholder="3 أيام فقط" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">التفاصيل الكاملة</Label>
                <Textarea value={card.details ?? ''} onChange={e => onChange({ details: e.target.value })} rows={2} placeholder="تفاصيل إضافية للعرض..." />
              </div>
            </div>
          )}

          {/* ── حقول Feature ── */}
          {card.card_type === 'feature' && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> أهم النقاط
              </p>
              <Textarea
                value={featurePointsText}
                onChange={e => {
                  setFeaturePointsText(e.target.value);
                  onChange({ feature_points: e.target.value.split('\n').filter(Boolean) });
                }}
                rows={4}
                placeholder="نقطة واحدة في كل سطر" />
            </div>
          )}

          {/* ── حقول Section ── */}
          {card.card_type === 'section' && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Layout className="w-3.5 h-3.5" /> القسم المستهدف
              </p>
              <div className="space-y-1">
                <Label className="text-xs">اختر القسم من التطبيق</Label>
                <RouteSelector value={card.section_route ?? ''} onChange={v => onChange({ section_route: v })} />
              </div>
            </div>
          )}

          {/* ── حقول Update ── */}
          {card.card_type === 'update' && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> تفاصيل التحديث
              </p>
              <div className="space-y-1">
                <Label className="text-xs">رقم/اسم الإصدار (اختياري)</Label>
                <Input value={card.version_name ?? ''} onChange={e => onChange({ version_name: e.target.value })} placeholder="مثلاً v2.5.0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">قائمة التغييرات (سطر لكل تغيير)</Label>
                <Textarea
                  value={changelogText}
                  onChange={e => {
                    setChangelogText(e.target.value);
                    onChange({ changelog: e.target.value.split('\n').filter(Boolean) });
                  }}
                  rows={4}
                  placeholder="إضافة ميزة جديدة&#10;إصلاح مشكلة الشحن&#10;تحسين الأداء" />
              </div>
            </div>
          )}

          {/* ── حقول Custom ── */}
          {card.card_type === 'custom' && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" /> القالب المخصص
              </p>
              <div className="space-y-1">
                <Label className="text-xs">اسم القالب</Label>
                <Input value={card.template_name ?? ''} onChange={e => onChange({ template_name: e.target.value })} placeholder="اسم القالب المخصص" />
              </div>
              {templates.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">استخدم قالب جاهز</Label>
                  <Select onValueChange={v => {
                    const tpl = templates.find(t => t.id === v);
                    if (tpl) onChange({ template_name: tpl.name, custom_fields: { fields: tpl.fields_config } });
                  }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="اختر قالبًا..." /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* ── نظام CTA ── */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> زر الدعوة (CTA)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">نص الزر</Label>
                <Input value={card.cta_label ?? ''} onChange={e => onChange({ cta_label: e.target.value })} placeholder="اكتشف الآن" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع الوجهة</Label>
                <Select value={card.cta_type ?? 'none'} onValueChange={v => onChange({ cta_type: v as CtaType, cta_destination: '' })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون إجراء</SelectItem>
                    <SelectItem value="internal">صفحة داخلية</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="external">رابط خارجي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {card.cta_type === 'internal' && (
              <div className="space-y-1">
                <Label className="text-xs">اختر الصفحة / القسم</Label>
                <RouteSelector value={card.cta_destination ?? ''} onChange={v => onChange({ cta_destination: v })} />
              </div>
            )}
            {card.cta_type === 'whatsapp' && (
              <div className="space-y-1">
                <Label className="text-xs">رقم WhatsApp (بكود الدولة)</Label>
                <Input value={card.cta_destination ?? ''} onChange={e => onChange({ cta_destination: e.target.value })}
                  placeholder="201012345678 أو +20 101 234 5678" dir="ltr" />
                <p className="text-[10px] text-muted-foreground">سيتم تنظيف الرقم وإنشاء الرابط تلقائيًا</p>
              </div>
            )}
            {card.cta_type === 'external' && (
              <div className="space-y-1">
                <Label className="text-xs">الرابط الخارجي</Label>
                <Input value={card.cta_destination ?? ''} onChange={e => onChange({ cta_destination: e.target.value })}
                  placeholder="https://..." dir="ltr" />
                <p className="text-[10px] text-muted-foreground">مسموح فقط بـ http و https</p>
              </div>
            )}
          </div>

          {/* ── الجدولة والتكرار ── */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> الجدولة والتكرار
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">تاريخ البداية</Label>
                <Input type="datetime-local" value={card.start_date?.slice(0, 16) ?? ''}
                  onChange={e => onChange({ start_date: e.target.value || null })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تاريخ النهاية</Label>
                <Input type="datetime-local" value={card.end_date?.slice(0, 16) ?? ''}
                  onChange={e => onChange({ end_date: e.target.value || null })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">سياسة التكرار</Label>
                <Select value={card.repeat_policy ?? 'once'} onValueChange={v => onChange({ repeat_policy: v as RepeatPolicy })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">مرة واحدة فقط</SelectItem>
                    <SelectItem value="every_open">عند كل فتح</SelectItem>
                    <SelectItem value="hourly">كل X ساعات</SelectItem>
                    <SelectItem value="daily">كل X أيام</SelectItem>
                    <SelectItem value="weekly">كل X أسابيع</SelectItem>
                    <SelectItem value="monthly">كل X أشهر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {card.repeat_policy && !['once', 'every_open'].includes(card.repeat_policy) && (
                <div className="space-y-1">
                  <Label className="text-xs">القيمة (X)</Label>
                  <Input type="number" min="1" value={card.repeat_value ?? 1}
                    onChange={e => onChange({ repeat_value: +e.target.value })} />
                </div>
              )}
            </div>
          </div>

          {/* ── الحالة والأولوية ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">الحالة</Label>
              <Select value={card.status ?? 'draft'} onValueChange={v => onChange({ status: v as CardStatus })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="scheduled">مجدول</SelectItem>
                  <SelectItem value="disabled">معطّل</SelectItem>
                  <SelectItem value="ended">منتهي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الأولوية</Label>
              <Input type="number" value={card.priority ?? 0}
                onChange={e => onChange({ priority: +e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الترتيب</Label>
              <Input type="number" value={card.sort_order ?? 0}
                onChange={e => onChange({ sort_order: +e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">التفعيل</Label>
              <button className="flex items-center gap-2 h-9 w-full px-3 rounded-md border border-border bg-background text-sm"
                onClick={() => onChange({ is_active: !card.is_active })}>
                {card.is_active
                  ? <><ToggleOn className="w-5 h-5 text-green-400" /><span className="text-xs">نشط</span></>
                  : <><ToggleOff className="w-5 h-5 text-muted-foreground" /><span className="text-xs">معطّل</span></>}
              </button>
            </div>
          </div>

          {/* Preview مصغّر */}
          {showPreview && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> معاينة
              </p>
              <CardPreview card={card as ContentCard} />
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2 flex-wrap">
          <Button variant="outline" className="h-9 gap-1.5" onClick={() => setShowPreview(v => !v)}>
            <Eye className="w-4 h-4" /> {showPreview ? 'إخفاء المعاينة' : 'معاينة'}
          </Button>
          <div className="flex-1" />
          <Button variant="outline" className="h-9" onClick={onClose} disabled={saving}>
            <X className="w-4 h-4" /> إلغاء
          </Button>
          <Button className="h-9 gap-1.5" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isNew ? 'إنشاء' : 'حفظ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════
//  RouteSelector — قائمة الصفحات المستخرجة من Navigation
// ════════════════════════════════════════════════════════════════
function RouteSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const groups = useMemo(() => {
    const g: Record<string, typeof APP_ROUTES> = {};
    APP_ROUTES.forEach(r => { (g[r.group] ??= []).push(r); });
    return g;
  }, []);

  return (
    <Select value={value || '__none__'} onValueChange={v => onChange(v === '__none__' ? '' : v)}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder="اختر صفحة أو قسم..." />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        <SelectItem value="__none__">— لا يوجد —</SelectItem>
        {Object.entries(groups).map(([group, routes]) => (
          <React.Fragment key={group}>
            <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {group}
            </div>
            {routes.map(r => (
              <SelectItem key={r.value} value={r.value}>
                {r.label} <span className="text-muted-foreground text-[10px] mr-1">{r.value}</span>
              </SelectItem>
            ))}
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}

// ════════════════════════════════════════════════════════════════
//  CardPreview — معاينة الكارت بنفس شكله الحقيقي
// ════════════════════════════════════════════════════════════════
export function CardPreview({ card }: { card: Partial<ContentCard> }) {
  const typeInfo = CARD_TYPES.find(t => t.id === card.card_type) ?? CARD_TYPES[0];
  const CtaIconComp = CTA_ICONS[card.cta_type ?? 'none'];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg max-w-sm mx-auto">
      {/* Header strip */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${typeInfo.color}, ${typeInfo.color}80)` }} />

      <div className="p-4 space-y-3">
        {/* Badge + Icon */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${typeInfo.color}18`, border: `1.5px solid ${typeInfo.color}35` }}>
              <CardIcon name={card.icon_name ?? null} className="w-4 h-4" />
            </div>
            {card.badge_text && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
                style={{ background: card.badge_color ?? typeInfo.color }}>
                {card.badge_text}
              </span>
            )}
          </div>
          <button className="text-muted-foreground hover:text-foreground p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Title */}
        {card.title && <h3 className="font-bold text-base leading-snug">{card.title}</h3>}

        {/* Offer prices */}
        {card.card_type === 'offer' && (card.old_price || card.new_price) && (
          <div className="flex items-center gap-3">
            {card.old_price && (
              <span className="text-sm line-through text-muted-foreground">{card.old_price}</span>
            )}
            {card.new_price && (
              <span className="text-lg font-black" style={{ color: typeInfo.color }}>{card.new_price}</span>
            )}
            {card.discount_value && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                style={{ background: typeInfo.color }}>
                خصم {card.discount_value}
              </span>
            )}
          </div>
        )}

        {/* Description */}
        {card.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
        )}

        {/* Feature points */}
        {card.card_type === 'feature' && (card.feature_points ?? []).length > 0 && (
          <ul className="space-y-1">
            {(card.feature_points ?? []).map((pt, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: typeInfo.color }} />
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Changelog */}
        {card.card_type === 'update' && (card.changelog ?? []).length > 0 && (
          <ul className="space-y-1">
            {(card.changelog ?? []).slice(0, 4).map((ch, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: typeInfo.color }} />
                <span>{ch}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Offer duration */}
        {card.card_type === 'offer' && card.offer_duration && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{card.offer_duration}</span>
          </div>
        )}

        {/* Version name */}
        {card.card_type === 'update' && card.version_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hash className="w-3.5 h-3.5" />
            <span>{card.version_name}</span>
          </div>
        )}

        {/* CTA Button */}
        {card.cta_label && card.cta_type !== 'none' && (
          <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${typeInfo.color}, ${typeInfo.color}cc)` }}>
            <CtaIconComp className="w-4 h-4" />
            {card.cta_label}
          </button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  TemplateEditDialog — حوار إنشاء / تعديل قالب مخصص
// ════════════════════════════════════════════════════════════════
function TemplateEditDialog({
  tpl, isNew, saving, onChange, onSave, onClose,
}: {
  tpl: Partial<CardTemplate>; isNew: boolean; saving: boolean;
  onChange: (u: Partial<CardTemplate>) => void;
  onSave: () => void; onClose: () => void;
}) {
  const fields: TemplateField[] = tpl.fields_config ?? [];

  const addField = () => {
    const newField: TemplateField = {
      key: `field_${Date.now()}`,
      label: 'حقل جديد',
      type: 'text',
      required: false,
      visible: true,
      order: fields.length,
      placeholder: '',
    };
    onChange({ fields_config: [...fields, newField] });
  };

  const updateField = (i: number, updates: Partial<TemplateField>) => {
    const updated = fields.map((f, idx) => idx === i ? { ...f, ...updates } : f);
    onChange({ fields_config: updated });
  };

  const removeField = (i: number) => {
    onChange({ fields_config: fields.filter((_, idx) => idx !== i) });
  };

  const moveField = (i: number, dir: -1 | 1) => {
    const arr = [...fields];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange({ fields_config: arr.map((f, idx) => ({ ...f, order: idx })) });
  };

  return (
    <Dialog open onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl bg-card border-border overflow-y-auto max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            {isNew ? 'إنشاء قالب مخصص' : `تعديل — ${tpl.name}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">اسم القالب *</Label>
              <Input value={tpl.name ?? ''} onChange={e => onChange({ name: e.target.value })} placeholder="مثلاً: قالب شركاء" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الوصف</Label>
              <Input value={tpl.description ?? ''} onChange={e => onChange({ description: e.target.value })} placeholder="وصف اختياري" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">الحقول ({fields.length})</Label>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addField}>
                <Plus className="w-3 h-3" /> إضافة حقل
              </Button>
            </div>
            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                لا توجد حقول — اضغط «إضافة حقل»
              </p>
            ) : (
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.key} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Input value={f.label} onChange={e => updateField(i, { label: e.target.value })}
                        placeholder="اسم الحقل" className="flex-1 h-7 text-xs" />
                      <Select value={f.type} onValueChange={v => updateField(i, { type: v as TemplateField['type'] })}>
                        <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">نص</SelectItem>
                          <SelectItem value="textarea">نص طويل</SelectItem>
                          <SelectItem value="number">رقم</SelectItem>
                          <SelectItem value="boolean">نعم/لا</SelectItem>
                          <SelectItem value="select">قائمة</SelectItem>
                          <SelectItem value="list">قائمة نقاط</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex gap-0.5 shrink-0">
                        <button onClick={() => moveField(i, -1)} className="p-1 hover:bg-muted rounded">
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => moveField(i, 1)} className="p-1 hover:bg-muted rounded">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button onClick={() => removeField(i)} className="p-1 hover:bg-destructive/10 rounded text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={f.required} onChange={e => updateField(i, { required: e.target.checked })} className="rounded" />
                        مطلوب
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={f.visible} onChange={e => updateField(i, { visible: e.target.checked })} className="rounded" />
                        مرئي
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" className="h-9" onClick={onClose} disabled={saving}>
            <X className="w-4 h-4" /> إلغاء
          </Button>
          <Button className="h-9 gap-1.5 flex-1" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isNew ? 'إنشاء القالب' : 'حفظ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
