/**
 * PromoCardOverlay — كارت العروض والتحديثات للمستخدم
 *
 * - يظهر فوق كل المحتوى عبر Portal
 * - 6 قوالب بشخصية بصرية مستقلة
 * - Dark / Light / RTL / Responsive
 * - CTA: internal / whatsapp / external / none
 * - إغلاق مع تتبع dismissed
 * - لا بيانات ثابتة — كل شيء من لوحة التحكم
 */

import {
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Gift,
  Globe,
  Hash,
  Layout,
  Megaphone,
  MessageCircle,
  Package,
  RotateCcw,
  Settings2,
  Shield,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useContentCards } from '@/contexts/ContentCardsContext';
import type { CardType, ContentCard } from '@/lib/api';

// ── ثوابت الأنواع ────────────────────────────────────────────
const TYPE_CONFIG: Record<CardType, {
  icon:      React.ElementType;
  accentHex: string;
  label:     string;
  glowClass: string;
}> = {
  offer:        { icon: Tag,       accentHex: '#E60000', label: 'عرض',          glowClass: 'shadow-red-500/25' },
  feature:      { icon: Sparkles,  accentHex: '#00BCD4', label: 'ميزة جديدة',   glowClass: 'shadow-cyan-500/25' },
  section:      { icon: Layout,    accentHex: '#9C27B0', label: 'قسم جديد',     glowClass: 'shadow-purple-500/25' },
  update:       { icon: RotateCcw, accentHex: '#4CAF50', label: 'تحديث',        glowClass: 'shadow-green-500/25' },
  announcement: { icon: Megaphone, accentHex: '#FF9800', label: 'إعلان',        glowClass: 'shadow-orange-500/25' },
  custom:       { icon: Settings2, accentHex: '#607D8B', label: 'قالب مخصص',   glowClass: 'shadow-slate-500/25' },
};

// ── Icon lookup للأيقونات المحفوظة من لوحة التحكم ────────────
const ICON_MAP: Record<string, React.ElementType> = {
  tag: Tag, sparkles: Sparkles, layout: Layout, rotate: RotateCcw,
  megaphone: Megaphone, settings: Settings2, star: Star, zap: Zap,
  gift: Gift, shield: Shield, globe: Globe, bell: Bell,
  trending: TrendingUp, book: BookOpen, package: Package,
};

function DynamicIcon({ name, className, style }: {
  name: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const I = name ? (ICON_MAP[name.toLowerCase()] ?? Tag) : Tag;
  return <I className={className} style={style} />;
}

// ── تنظيف وجهة CTA ───────────────────────────────────────────
function buildCtaHref(type: string, destination: string | null): string | null {
  if (!destination) return null;
  if (type === 'internal') return destination;
  if (type === 'whatsapp') {
    const digits = destination.replace(/[\s\-+()\u00A0]/g, '');
    return `https://wa.me/${digits}`;
  }
  if (type === 'external') {
    try {
      const u = new URL(destination);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch { return null; }
  }
  return null;
}

// ════════════════════════════════════════════════════════════
//  PromoCardOverlay — المكوّن الرئيسي
// ════════════════════════════════════════════════════════════
export default function PromoCardOverlay() {
  const navigate = useNavigate();
  const { currentCard, dismissCard, markSeen, hasCard } = useContentCards();
  const seenRef = useRef<Set<string>>(new Set());
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  // تأثير ظهور/اختفاء
  useEffect(() => {
    if (hasCard) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [hasCard]);

  // تسجيل المشاهدة عند الظهور الأول
  useEffect(() => {
    if (!currentCard) return;
    const key = `${currentCard.id}:${currentCard.revision}`;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);
    markSeen(currentCard.id);
  }, [currentCard, markSeen]);

  const handleDismiss = useCallback(() => {
    if (!currentCard) return;
    dismissCard(currentCard.id);
  }, [currentCard, dismissCard]);

  const handleCta = useCallback(() => {
    if (!currentCard) return;
    const { cta_type, cta_destination } = currentCard;
    if (!cta_type || cta_type === 'none') { handleDismiss(); return; }

    const href = buildCtaHref(cta_type, cta_destination);
    dismissCard(currentCard.id);

    if (cta_type === 'internal' && href) {
      navigate(href);
    } else if ((cta_type === 'whatsapp' || cta_type === 'external') && href) {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }, [currentCard, dismissCard, navigate, handleDismiss]);

  // إغلاق عند Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hasCard) handleDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasCard, handleDismiss]);

  if (!mounted || !currentCard) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleDismiss}
      />

      {/* Card */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
        dir="rtl"
      >
        <div
          className="pointer-events-auto transition-all duration-300"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1) translateY(0)' : 'scale(0.88) translateY(32px)',
          }}
        >
          <CardRenderer
            card={currentCard}
            onDismiss={handleDismiss}
            onCta={handleCta}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}

// ════════════════════════════════════════════════════════════
//  CardRenderer — الغلاف + dispatch لكل قالب
// ════════════════════════════════════════════════════════════
function CardRenderer({
  card, onDismiss, onCta,
}: {
  card:      ContentCard;
  onDismiss: () => void;
  onCta:     () => void;
}) {
  const cfg = TYPE_CONFIG[card.card_type] ?? TYPE_CONFIG.announcement;

  return (
    <div
      className={`
        relative w-full max-w-sm
        rounded-3xl overflow-hidden
        shadow-2xl ${cfg.glowClass}
        bg-card border border-border/60
      `}
      onClick={e => e.stopPropagation()}
    >
      {/* شريط لوني علوي */}
      <div
        className="h-1 w-full"
        style={{
          background: `linear-gradient(90deg, ${cfg.accentHex}, ${cfg.accentHex}80)`,
        }}
      />

      {/* محتوى الكارت حسب النوع */}
      {card.card_type === 'offer'        && <OfferTemplate        card={card} cfg={cfg} onCta={onCta} onDismiss={onDismiss} />}
      {card.card_type === 'feature'      && <FeatureTemplate      card={card} cfg={cfg} onCta={onCta} onDismiss={onDismiss} />}
      {card.card_type === 'section'      && <SectionTemplate      card={card} cfg={cfg} onCta={onCta} onDismiss={onDismiss} />}
      {card.card_type === 'update'       && <UpdateTemplate       card={card} cfg={cfg} onCta={onCta} onDismiss={onDismiss} />}
      {card.card_type === 'announcement' && <AnnouncementTemplate card={card} cfg={cfg} onCta={onCta} onDismiss={onDismiss} />}
      {card.card_type === 'custom'       && <CustomTemplate       card={card} cfg={cfg} onCta={onCta} onDismiss={onDismiss} />}
    </div>
  );
}

// ── مكوّنات مشتركة ────────────────────────────────────────────

/** رأس الكارت: أيقونة + Badge + زر إغلاق */
function CardHeader({
  card, cfg, onDismiss,
}: {
  card:      ContentCard;
  cfg:       typeof TYPE_CONFIG[CardType];
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 pt-5">
      <div className="flex items-center gap-2.5 min-w-0">
        {/* أيقونة */}
        <div
          className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: `${cfg.accentHex}18`,
            border: `1.5px solid ${cfg.accentHex}40`,
          }}
        >
          <DynamicIcon
            name={card.icon_name ?? null}
            className="w-4 h-4"
            style={{ color: cfg.accentHex }}
          />
        </div>

        {/* Badge */}
        {card.badge_text && (
          <span
            className="text-[11px] font-black px-2.5 py-0.5 rounded-full text-white leading-none shrink-0"
            style={{ background: card.badge_color ?? cfg.accentHex }}
          >
            {card.badge_text}
          </span>
        )}
      </div>

      {/* زر الإغلاق */}
      <button
        onClick={onDismiss}
        className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        aria-label="إغلاق"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** زر CTA */
function CtaButton({
  label, accent, onClick, ctaType,
}: {
  label:   string;
  accent:  string;
  onClick: () => void;
  ctaType: string;
}) {
  if (!label || ctaType === 'none') return null;

  const CtaIcons: Record<string, React.ElementType> = {
    internal: ChevronLeft,
    whatsapp: MessageCircle,
    external: Globe,
    none:     Zap,
  };
  const CtaIcon = CtaIcons[ctaType] ?? Zap;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 hover:opacity-90"
      style={{
        background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
        boxShadow: `0 4px 20px ${accent}40`,
      }}
    >
      <CtaIcon className="w-4 h-4" />
      {label}
    </button>
  );
}

// ════════════════════════════════════════════════════════════
//  قوالب الكروت
// ════════════════════════════════════════════════════════════

/** قالب العرض — يُبرز السعر والخصم */
function OfferTemplate({
  card, cfg, onCta, onDismiss,
}: {
  card: ContentCard; cfg: typeof TYPE_CONFIG[CardType];
  onCta: () => void; onDismiss: () => void;
}) {
  return (
    <div className="pb-5 space-y-4">
      <CardHeader card={card} cfg={cfg} onDismiss={onDismiss} />
      <div className="px-5 space-y-3">
        {/* عنوان */}
        <h2 className="text-lg font-bold text-foreground leading-snug">{card.title}</h2>

        {/* أسعار */}
        {(card.old_price || card.new_price || card.discount_value) && (
          <div
            className="flex items-center gap-3 p-3 rounded-2xl"
            style={{ background: `${cfg.accentHex}10`, border: `1px solid ${cfg.accentHex}25` }}
          >
            {card.old_price && (
              <span className="text-base line-through text-muted-foreground shrink-0">
                {card.old_price}
              </span>
            )}
            {card.new_price && (
              <span
                className="text-2xl font-black shrink-0"
                style={{ color: cfg.accentHex }}
              >
                {card.new_price}
              </span>
            )}
            {card.discount_value && (
              <span
                className="text-xs font-black px-2 py-1 rounded-full text-white mr-auto shrink-0"
                style={{ background: cfg.accentHex }}
              >
                خصم {card.discount_value}
              </span>
            )}
          </div>
        )}

        {/* وصف */}
        {card.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {card.description}
          </p>
        )}

        {/* مدة العرض */}
        {card.offer_duration && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{card.offer_duration}</span>
          </div>
        )}

        {/* تاريخ الانتهاء */}
        {card.end_date && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>ينتهي: {new Date(card.end_date).toLocaleDateString('ar-EG')}</span>
          </div>
        )}

        {/* تفاصيل إضافية */}
        {card.details && (
          <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-xl leading-relaxed line-clamp-2">
            {card.details}
          </p>
        )}

        {/* CTA */}
        <CtaButton
          label={card.cta_label ?? 'اطلب الآن'}
          accent={cfg.accentHex}
          onClick={onCta}
          ctaType={card.cta_type ?? 'none'}
        />
      </div>
    </div>
  );
}

/** قالب الميزة الجديدة */
function FeatureTemplate({
  card, cfg, onCta, onDismiss,
}: {
  card: ContentCard; cfg: typeof TYPE_CONFIG[CardType];
  onCta: () => void; onDismiss: () => void;
}) {
  const points = card.feature_points ?? [];
  return (
    <div className="pb-5 space-y-4">
      <CardHeader card={card} cfg={cfg} onDismiss={onDismiss} />
      <div className="px-5 space-y-3">
        <h2 className="text-lg font-bold text-foreground leading-snug">{card.title}</h2>

        {card.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{card.description}</p>
        )}

        {/* نقاط الميزة */}
        {points.length > 0 && (
          <div className="space-y-2">
            {points.slice(0, 4).map((pt, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle2
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: cfg.accentHex }}
                />
                <span className="text-sm text-foreground">{pt}</span>
              </div>
            ))}
          </div>
        )}

        <CtaButton
          label={card.cta_label ?? 'اكتشف الآن'}
          accent={cfg.accentHex}
          onClick={onCta}
          ctaType={card.cta_type ?? 'none'}
        />
      </div>
    </div>
  );
}

/** قالب القسم الجديد */
function SectionTemplate({
  card, cfg, onCta, onDismiss,
}: {
  card: ContentCard; cfg: typeof TYPE_CONFIG[CardType];
  onCta: () => void; onDismiss: () => void;
}) {
  return (
    <div className="pb-5 space-y-4">
      <CardHeader card={card} cfg={cfg} onDismiss={onDismiss} />
      <div className="px-5 space-y-3">
        {/* لافتة القسم */}
        <div
          className="flex items-center gap-3 p-3.5 rounded-2xl"
          style={{ background: `${cfg.accentHex}12`, border: `1px solid ${cfg.accentHex}30` }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${cfg.accentHex}20` }}
          >
            <DynamicIcon name={card.icon_name ?? 'layout'} className="w-5 h-5" style={{ color: cfg.accentHex }} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-base text-foreground truncate">{card.title}</p>
            {card.section_route && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{card.section_route}</p>
            )}
          </div>
        </div>

        {card.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{card.description}</p>
        )}

        <CtaButton
          label={card.cta_label ?? 'فتح القسم'}
          accent={cfg.accentHex}
          onClick={onCta}
          ctaType={card.cta_type ?? 'internal'}
        />
      </div>
    </div>
  );
}

/** قالب التحديث */
function UpdateTemplate({
  card, cfg, onCta, onDismiss,
}: {
  card: ContentCard; cfg: typeof TYPE_CONFIG[CardType];
  onCta: () => void; onDismiss: () => void;
}) {
  const changelog = card.changelog ?? [];
  return (
    <div className="pb-5 space-y-4">
      <CardHeader card={card} cfg={cfg} onDismiss={onDismiss} />
      <div className="px-5 space-y-3">
        {/* رأس التحديث */}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-foreground">{card.title}</h2>
          {card.version_name && (
            <span
              className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg"
              style={{
                background: `${cfg.accentHex}15`,
                color: cfg.accentHex,
                border: `1px solid ${cfg.accentHex}30`,
              }}
            >
              <Hash className="w-3 h-3" />
              {card.version_name}
            </span>
          )}
        </div>

        {card.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{card.description}</p>
        )}

        {/* قائمة التغييرات */}
        {changelog.length > 0 && (
          <div className="space-y-1.5">
            {changelog.slice(0, 5).map((ch, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: cfg.accentHex }}
                />
                <span className="text-sm text-foreground">{ch}</span>
              </div>
            ))}
          </div>
        )}

        {card.cta_type && card.cta_type !== 'none' && card.cta_label && (
          <CtaButton
            label={card.cta_label}
            accent={cfg.accentHex}
            onClick={onCta}
            ctaType={card.cta_type}
          />
        )}

        {/* زر «حسناً» إذا لا يوجد CTA */}
        {(!card.cta_type || card.cta_type === 'none') && (
          <button
            onClick={onDismiss}
            className="w-full py-2.5 rounded-2xl text-sm font-bold border border-border hover:bg-muted transition-colors text-foreground"
          >
            حسناً، شكراً
          </button>
        )}
      </div>
    </div>
  );
}

/** قالب الإعلان العام */
function AnnouncementTemplate({
  card, cfg, onCta, onDismiss,
}: {
  card: ContentCard; cfg: typeof TYPE_CONFIG[CardType];
  onCta: () => void; onDismiss: () => void;
}) {
  return (
    <div className="pb-5 space-y-4">
      <CardHeader card={card} cfg={cfg} onDismiss={onDismiss} />
      <div className="px-5 space-y-3">
        <h2 className="text-lg font-bold text-foreground leading-snug">{card.title}</h2>

        {card.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{card.description}</p>
        )}

        {/* تاريخ الانتهاء */}
        {card.end_date && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>حتى: {new Date(card.end_date).toLocaleDateString('ar-EG')}</span>
          </div>
        )}

        <div className="flex gap-2">
          {card.cta_type && card.cta_type !== 'none' && card.cta_label && (
            <div className="flex-1">
              <CtaButton
                label={card.cta_label}
                accent={cfg.accentHex}
                onClick={onCta}
                ctaType={card.cta_type}
              />
            </div>
          )}
          <button
            onClick={onDismiss}
            className="flex-1 py-3 rounded-2xl text-sm font-bold border border-border hover:bg-muted transition-colors text-muted-foreground"
          >
            تم
          </button>
        </div>
      </div>
    </div>
  );
}

/** قالب مخصص — يعتمد على custom_fields وfield_values */
function CustomTemplate({
  card, cfg, onCta, onDismiss,
}: {
  card: ContentCard; cfg: typeof TYPE_CONFIG[CardType];
  onCta: () => void; onDismiss: () => void;
}) {
  // استخرج الحقول من config
  const fields = (card.custom_fields as { fields?: { key: string; label: string; visible: boolean }[] })?.fields ?? [];
  const values = card.field_values as Record<string, string | boolean | number> ?? {};

  return (
    <div className="pb-5 space-y-4">
      <CardHeader card={card} cfg={cfg} onDismiss={onDismiss} />
      <div className="px-5 space-y-3">
        <h2 className="text-lg font-bold text-foreground">{card.title}</h2>

        {card.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">{card.description}</p>
        )}

        {/* الحقول المخصصة */}
        {fields.filter(f => f.visible).map(f => {
          const val = values[f.key];
          if (val === undefined || val === '' || val === null) return null;
          return (
            <div key={f.key} className="flex items-start gap-2 text-sm">
              <span className="text-muted-foreground shrink-0 min-w-[80px]">{f.label}:</span>
              <span className="text-foreground font-medium">{String(val)}</span>
            </div>
          );
        })}

        <CtaButton
          label={card.cta_label ?? 'تفاصيل'}
          accent={cfg.accentHex}
          onClick={onCta}
          ctaType={card.cta_type ?? 'none'}
        />
      </div>
    </div>
  );
}
