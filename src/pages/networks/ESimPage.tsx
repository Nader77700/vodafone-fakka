// ─── صفحة شرائح eSIM ──────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wifi, ChevronLeft, Plus, Edit2, Trash2, Eye, EyeOff,
  Star, Copy, Settings, ChevronUp, ChevronDown, Shield,
  ShieldOff, Zap, Clock, Tag, ToggleLeft, ToggleRight,
  AlertTriangle, Megaphone, PackageX, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import AppFooter from '@/components/common/AppFooter';
import type { ESimOffer, ESimSettings } from '@/types/esim';
import {
  getESimOffers, getESimSettings, updateESimSettings,
  deleteESimOffer, updateESimOffer, reorderESimOffers,
  duplicateESimOffer, createESimOffer,
} from '@/lib/esimApi';
import ESimOfferFormModal from '@/components/esim/ESimOfferFormModal';

const BLUE = '#1E6FFF';
const BLUE_GLOW = 'rgba(30,111,255,0.25)';

// ── بطاقة عرض ────────────────────────────────────────────────────────────────
function OfferCard({
  offer, settings, isAdmin,
  onEdit, onDelete, onToggleHidden, onFeature, onDuplicate, onMoveUp, onMoveDown,
}: {
  offer: ESimOffer;
  settings: ESimSettings;
  isAdmin: boolean;
  onEdit: (o: ESimOffer) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (o: ESimOffer) => void;
  onFeature: (o: ESimOffer) => void;
  onDuplicate: (o: ESimOffer) => void;
  onMoveUp: (o: ESimOffer) => void;
  onMoveDown: (o: ESimOffer) => void;
}) {
  const navigate = useNavigate();
  const borderColor = offer.is_featured ? '#FFD700' : offer.hidden ? 'rgba(255,255,255,0.08)' : `${BLUE}50`;

  return (
    <div
      className="relative rounded-2xl overflow-hidden select-none"
      style={{
        background: offer.hidden
          ? 'rgba(255,255,255,0.03)'
          : `linear-gradient(135deg,${BLUE}12,${BLUE}06)`,
        border: `1.5px solid ${borderColor}`,
        boxShadow: offer.is_featured ? `0 4px 20px rgba(255,215,0,0.15)` : `0 2px 12px ${BLUE_GLOW}`,
        opacity: offer.hidden ? 0.6 : 1,
      }}
    >
      {/* شريط Glow */}
      <div className="h-px w-full" style={{ background: `linear-gradient(90deg,transparent,${BLUE}80,transparent)` }} />

      {offer.is_featured && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black"
          style={{ background: 'rgba(255,215,0,0.2)', border: '1px solid rgba(255,215,0,0.5)', color: '#FFD700' }}>
          <Star className="w-2.5 h-2.5" /> مميز
        </div>
      )}
      {offer.hidden && isAdmin && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black"
          style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          <EyeOff className="w-2.5 h-2.5" /> مخفي
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* صورة العرض */}
          <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: `${BLUE}18`, border: `1px solid ${BLUE}30` }}>
            {offer.image ? (
              <img src={offer.image} alt={offer.title} className="w-full h-full object-cover" />
            ) : (
              <Wifi className="w-7 h-7" style={{ color: BLUE }} />
            )}
          </div>

          {/* بيانات العرض */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-black text-foreground">{offer.title}</p>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: `${BLUE}20`, color: BLUE, border: `1px solid ${BLUE}30` }}>
                {offer.data_size}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-2 text-pretty">{offer.description}</p>

            <div className="flex items-center gap-3 flex-wrap pt-1">
              {settings.show_prices && (
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black" style={{ color: BLUE }}>{offer.price} جنيه</span>
                  {settings.show_discounts && offer.old_price && (
                    <span className="text-[10px] line-through text-muted-foreground">{offer.old_price}</span>
                  )}
                  {settings.show_discounts && offer.discount && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                      -{offer.discount}%
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{offer.duration}</span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3" style={{ color: BLUE }} />
                <span className="text-[10px]" style={{ color: BLUE }}>{offer.speed}</span>
              </div>
              <div className="flex items-center gap-1">
                {offer.warranty
                  ? <Shield className="w-3 h-3 text-success" />
                  : <ShieldOff className="w-3 h-3 text-muted-foreground" />}
                <span className={`text-[10px] ${offer.warranty ? 'text-success' : 'text-muted-foreground'}`}>
                  {offer.warranty ? 'ضمان' : 'بدون ضمان'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* أزرار */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => navigate(`/networks/esim/${offer.id}`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95"
            style={{ background: `${BLUE}20`, border: `1px solid ${BLUE}40`, color: BLUE }}
          >
            التفاصيل <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onMoveUp(offer)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => onMoveDown(offer)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => onFeature(offer)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: offer.is_featured ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${offer.is_featured ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                <Star className="w-3.5 h-3.5" style={{ color: offer.is_featured ? '#FFD700' : undefined }} />
              </button>
              <button onClick={() => onToggleHidden(offer)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {offer.hidden ? <Eye className="w-3.5 h-3.5 text-success" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
              <button onClick={() => onDuplicate(offer)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => onEdit(offer)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${BLUE}20`, border: `1px solid ${BLUE}40` }}>
                <Edit2 className="w-3.5 h-3.5" style={{ color: BLUE }} />
              </button>
              <button onClick={() => onDelete(offer.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── لوحة تحكم حالة القسم (أدمن فقط) ────────────────────────────────────────
const STATUS_OPTIONS: { value: ESimSettings['section_status']; label: string; color: string; icon: React.ElementType }[] = [
  { value: 'active',       label: 'مفعّل',           color: '#22c55e', icon: ToggleRight },
  { value: 'hidden',       label: 'مخفي',            color: '#ef4444', icon: EyeOff },
  { value: 'maintenance',  label: 'تحت التطوير',     color: '#F7C948', icon: AlertTriangle },
  { value: 'coming_soon',  label: 'قريباً',           color: '#a78bfa', icon: Megaphone },
];

function AdminStatusPanel({ settings, onUpdate }: { settings: ESimSettings; onUpdate: (s: ESimSettings) => void }) {
  const [saving, setSaving] = useState(false);

  const handleStatusChange = async (val: ESimSettings['section_status']) => {
    setSaving(true);
    const ok = await updateESimSettings({ section_status: val });
    setSaving(false);
    if (ok) { onUpdate({ ...settings, section_status: val }); toast.success('تم تحديث حالة القسم'); }
    else toast.error('فشل تحديث الحالة');
  };

  const handleTogglePrices = async () => {
    const ok = await updateESimSettings({ show_prices: !settings.show_prices });
    if (ok) onUpdate({ ...settings, show_prices: !settings.show_prices });
  };
  const handleToggleDiscounts = async () => {
    const ok = await updateESimSettings({ show_discounts: !settings.show_discounts });
    if (ok) onUpdate({ ...settings, show_discounts: !settings.show_discounts });
  };

  return (
    <div className="rounded-2xl p-4 space-y-4"
      style={{ background: 'rgba(30,111,255,0.05)', border: '1.5px solid rgba(30,111,255,0.2)' }}>
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4" style={{ color: BLUE }} />
        <p className="text-sm font-black" style={{ color: BLUE }}>لوحة إدارة eSIM</p>
        {saving && <span className="text-[10px] text-muted-foreground">جاري الحفظ...</span>}
      </div>

      {/* حالة القسم */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-2">حالة القسم</p>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const active = settings.section_status === opt.value;
            return (
              <button key={opt.value} onClick={() => handleStatusChange(opt.value)}
                className="flex items-center gap-2 p-2 rounded-xl text-[11px] font-bold transition-all"
                style={{
                  background: active ? `${opt.color}20` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? `${opt.color}50` : 'rgba(255,255,255,0.08)'}`,
                  color: active ? opt.color : undefined,
                }}>
                <Icon className="w-3.5 h-3.5" style={{ color: opt.color }} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* إعدادات العرض */}
      <div className="flex gap-2">
        <button onClick={handleTogglePrices}
          className="flex-1 flex items-center justify-between gap-2 p-2.5 rounded-xl text-[11px] font-bold"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="flex items-center gap-1.5"><Tag className="w-3 h-3" style={{ color: BLUE }} /> عرض الأسعار</span>
          {settings.show_prices ? <ToggleRight className="w-5 h-5" style={{ color: BLUE }} /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
        </button>
        <button onClick={handleToggleDiscounts}
          className="flex-1 flex items-center justify-between gap-2 p-2.5 rounded-xl text-[11px] font-bold"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="flex items-center gap-1.5"><Tag className="w-3 h-3 text-success" /> الخصومات</span>
          {settings.show_discounts ? <ToggleRight className="w-5 h-5 text-success" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
        </button>
      </div>
    </div>
  );
}

// ── الصفحة الرئيسية ───────────────────────────────────────────────────────────
export default function ESimPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const [offers, setOffers] = useState<ESimOffer[]>([]);
  const [settings, setSettings] = useState<ESimSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOffer, setEditOffer] = useState<ESimOffer | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadData = useCallback(async () => {
    const [offs, setts] = await Promise.all([getESimOffers(isAdmin), getESimSettings()]);
    setOffers(offs);
    setSettings(setts);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: string) => {
    if (!confirm('هل تريد حذف هذا العرض؟')) return;
    const ok = await deleteESimOffer(id);
    if (ok) { setOffers(o => o.filter(x => x.id !== id)); toast.success('تم الحذف'); }
    else toast.error('فشل الحذف');
  };

  const handleToggleHidden = async (offer: ESimOffer) => {
    const ok = await updateESimOffer(offer.id, { hidden: !offer.hidden });
    if (ok) { setOffers(o => o.map(x => x.id === offer.id ? { ...x, hidden: !x.hidden } : x)); }
  };

  const handleFeature = async (offer: ESimOffer) => {
    const ok = await updateESimOffer(offer.id, { is_featured: !offer.is_featured });
    if (ok) { setOffers(o => o.map(x => x.id === offer.id ? { ...x, is_featured: !x.is_featured } : x)); }
  };

  const handleDuplicate = async (offer: ESimOffer) => {
    const newOffer = await duplicateESimOffer(offer);
    if (newOffer) { setOffers(o => [...o, newOffer]); toast.success('تم النسخ'); }
    else toast.error('فشل النسخ');
  };

  const handleMoveUp = async (offer: ESimOffer) => {
    const idx = offers.findIndex(o => o.id === offer.id);
    if (idx <= 0) return;
    const newOffers = [...offers];
    [newOffers[idx - 1], newOffers[idx]] = [newOffers[idx], newOffers[idx - 1]];
    setOffers(newOffers);
    await reorderESimOffers(newOffers.map(o => o.id));
  };

  const handleMoveDown = async (offer: ESimOffer) => {
    const idx = offers.findIndex(o => o.id === offer.id);
    if (idx >= offers.length - 1) return;
    const newOffers = [...offers];
    [newOffers[idx], newOffers[idx + 1]] = [newOffers[idx + 1], newOffers[idx]];
    setOffers(newOffers);
    await reorderESimOffers(newOffers.map(o => o.id));
  };

  const handleSaveOffer = async (offer: ESimOffer | null) => {
    setShowForm(false);
    setEditOffer(null);
    await loadData();
    if (offer) toast.success(editOffer ? 'تم التحديث' : 'تم الإضافة');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: `${BLUE}40`, borderTopColor: BLUE }} />
      </div>
    );
  }

  const status = settings?.section_status ?? 'active';
  const visibleOffers = isAdmin ? offers : offers.filter(o => !o.hidden);

  // ── محتوى حسب الحالة ────────────────────────────────────────────────────────
  const renderContent = () => {
    if (!isAdmin) {
      if (status === 'hidden') return null;
      if (status === 'maintenance') {
        return (
          <div className="rounded-2xl p-6 text-center space-y-3"
            style={{ background: 'rgba(247,201,72,0.08)', border: '1.5px solid rgba(247,201,72,0.3)' }}>
            <div className="text-3xl">🚧</div>
            <p className="text-base font-black text-warning">القسم تحت التطوير</p>
            <p className="text-[12px] text-muted-foreground text-pretty">
              {settings?.maintenance_message}
            </p>
          </div>
        );
      }
      if (status === 'coming_soon') {
        return (
          <div className="rounded-2xl p-6 text-center space-y-3"
            style={{ background: 'rgba(167,139,250,0.08)', border: '1.5px solid rgba(167,139,250,0.3)' }}>
            <div className="text-3xl">📢</div>
            <p className="text-base font-black" style={{ color: '#a78bfa' }}>ستتوفر العروض قريباً</p>
            <p className="text-[12px] text-muted-foreground">{settings?.coming_soon_message}</p>
          </div>
        );
      }
    }

    if (visibleOffers.length === 0) {
      return (
        <div className="rounded-2xl p-6 text-center space-y-3"
          style={{ background: `${BLUE}08`, border: `1.5px solid ${BLUE}25` }}>
          <PackageX className="w-10 h-10 mx-auto" style={{ color: BLUE }} />
          <p className="text-base font-black text-foreground">لا توجد عروض حالياً</p>
          <p className="text-[12px] text-muted-foreground">{settings?.empty_message}</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {visibleOffers.map(offer => (
          <OfferCard
            key={offer.id}
            offer={offer}
            settings={settings!}
            isAdmin={isAdmin}
            onEdit={o => { setEditOffer(o); setShowForm(true); }}
            onDelete={handleDelete}
            onToggleHidden={handleToggleHidden}
            onFeature={handleFeature}
            onDuplicate={handleDuplicate}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-6 page-enter" dir="rtl">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/networks')}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: `${BLUE}15`, border: `1px solid ${BLUE}30` }}>
            <ChevronLeft className="w-4 h-4" style={{ color: BLUE }} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-foreground text-balance">📶 شرائح eSIM</h1>
            <p className="text-[11px] text-muted-foreground">إلكترونية جاهزة للتفعيل فوراً · بدون VPN</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setEditOffer(null); setShowForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold"
              style={{ background: `${BLUE}20`, border: `1px solid ${BLUE}40`, color: BLUE }}>
              <Plus className="w-3.5 h-3.5" /> إضافة عرض
            </button>
          )}
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* لوحة الأدمن */}
        {isAdmin && settings && (
          <AdminStatusPanel settings={settings} onUpdate={setSettings} />
        )}

        {/* المحتوى */}
        {renderContent()}
      </div>

      <AppFooter />

      {/* مودال الإضافة/التعديل */}
      {showForm && (
        <ESimOfferFormModal
          offer={editOffer}
          onClose={() => { setShowForm(false); setEditOffer(null); }}
          onSave={handleSaveOffer}
        />
      )}
    </div>
  );
}
