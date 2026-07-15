// لوحة الإدارة — SaaS Premium v9 (14-Phase Rebuild)
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { formatEgyptDateTime, formatEgyptDate } from '@/lib/egyptTime';
import {
  getAllProfiles, getAllSubscriptions, getAllLicenseKeys,

  getAllOperations, getAllOperationsFiltered, getOperationsStats,
  getSystemLogs, getAllNotifications,
  updateUserRole, toggleUserActive,
  createLicenseKey, disableLicenseKey, deleteLicenseKeyWithCascade, generateCode,
  sendNotification, deleteNotification, deleteAllUserNotifications,
  purgeOldNotifications, getNotificationRetentionDays, setNotificationRetentionDays,
  resendNotification,
  getNotificationDeliveries, createScheduledNotification, getScheduledNotifications, deleteScheduledNotification,
  calcDaysRemaining, calcTimeRemaining,
  getAdminOverview, getUserDetail, getCodeLogs, getPhoneAnalytics, insertCodeLog,
  getAdminChartData, getCodeDetail, getGlobalCodeStats,
  getAllAssets, upsertAsset, uploadAssetToStorage, deleteAssetFromStorage, clearAssetRecord,
  getWelcomeGift, setWelcomeGift, getAllLicenseKeysUnpaged,
  getAllLinkedUsers, renewUserSubscription, extendUserSubscription,
  cancelUserSubscription, suspendUserSubscription, banUser, unlinkUserFromCode,
  reactivateUserSubscription, removeUserFromCode,
  enableLicenseKey,
  changeUserCode, updateSubscriptionExpiry,
  runSystemIntegrityCheck, repairUsedCount, insertSystemLog, adminAdjustOps,
} from '@/lib/api';
import type { WelcomeGift, LinkedUserEntry, DBAuditReport, OperationsFilter, SubsFilter, EnrichedSubscription } from '@/lib/api';
import type {
  Profile, Subscription, LicenseKey, Operation,
  SystemLog, Notification, ScheduledNotification, PaginatedResult,
} from '@/types/types';
import type { UserDetail, CodeLog, PhoneAnalytic, AdminChartPoint, ChartPeriod, CodeDetail, GlobalCodeStats, AppAsset } from '@/lib/api';
import { getProductConfig, updateProductConfig, deleteUserComplete, getMinVersionCode, setMinVersionCode, repairOrphanAccounts, notifyAffectedUsers, type ProductConfig } from '@/lib/api';
import AdminMembersMonitor from '@/pages/admin/AdminMembersMonitor';
import AdminInvitePanel from '@/components/admin/AdminInvitePanel';
import { logAdminAction, getAdminAuditLogs, type AdminAuditLog } from '@/lib/api';
import { getAllMerchants, createMerchant, updateMerchantStatus, generateMerchantInviteLink, regenerateInviteCode, promoteToMerchant, demoteToUser, updateMerchantStatusAdmin, updateMerchantInviteStatus, getAllMerchantsWithStats } from '@/lib/api';
import {
  adminGetAllRedPackages, adminCreateRedPackage, adminUpdateRedPackage, adminDeleteRedPackage, calcPackageDiscount,
  adminGetAllPromotions, adminCreatePromotion, adminUpdatePromotion, adminDeletePromotion,
} from '@/lib/api';
import type { RedPackage, Promotion } from '@/lib/api';
import type { Merchant, MerchantStatus, MerchantFull } from '@/types/types';
import { toast } from 'sonner';
import {
  Users, CreditCard, Key, Zap, Clock, FileText,
  Bell, Settings, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Shield, CheckCircle, XCircle, Ban, Trash2,
  Plus, Search, RefreshCw, Loader2,
  ToggleLeft, ToggleRight, Send, LogOut,
  TrendingUp, Phone, BarChart2, Activity, Eye,
  Home, Copy, Filter, Calendar, Hash, Gift,
  AlertTriangle, Layers, UserCheck, Image,
  Crown, Timer, DatabaseZap, UserX, UserMinus,
  RotateCcw, CalendarDays, Infinity as InfinityIcon,
  Download, MessageSquare, Banknote, Tag, ClipboardList,
  UserCog, PlusCircle, MinusCircle, Link2, Cpu, PlayCircle,
  Package, Globe, ToggleLeft as ToggleOff, ToggleRight as ToggleOn,
  AlertCircle, Pencil, Save, X as XIcon,
  Link as LinkIcon, ShieldCheck, ShieldAlert, ShieldX,
  User, Share2, Check, Building2, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import NotifComposer from '@/components/admin/NotifComposer';
import NavLinksManager from '@/components/admin/NavLinksManager';
import NotifAutomation from '@/components/admin/NotifAutomation';
import ServerConfigTab from '@/components/admin/ServerConfigTab';
import AdminSmartEngine from '@/components/admin/AdminSmartEngine';
import { formatError } from '@/lib/formatError';


// ─────────────────────────────────────────────
// أنواع التبويبات
// ─────────────────────────────────────────────
type AdminTab =
  | 'overview' | 'users' | 'subscriptions' | 'licenses' | 'codelogs'
  | 'numbers'  | 'globalstats' | 'recharge'  | 'operations' | 'logs'
  | 'notifications' | 'notif_automation' | 'navlinks' | 'settings' | 'assets' | 'giftbox' | 'integrity' | 'update_diag' | 'product_config' | 'server_config'
  | 'version_center' | 'live_monitoring' | 'crash_logs' | 'feature_mgmt' | 'card_feedbacks' | 'balance_products' | 'legacy_flex' | 'merchants' | 'member_monitor' | 'duplicate_accounts' | 'charge_throttles'
  | 'red_packages' | 'promotions';

interface TabMeta {
  id: AdminTab;
  label: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
}

// التبويبات المرئية في الشريط الجانبي — المحرك الداخلي مخفي عن القائمة
const VISIBLE_TABS: TabMeta[] = [
  { id: 'overview',       label: 'نظرة عامة',       desc: 'إحصائيات المنصة ورسوم بيانية',    icon: BarChart2 },
  { id: 'users',          label: 'المستخدمون',       desc: 'إدارة الحسابات والأدوار',          icon: Users },
  { id: 'subscriptions',  label: 'الاشتراكات',       desc: 'متابعة حالة الاشتراكات',           icon: CreditCard },
  { id: 'licenses',       label: 'الأكواد',          desc: 'إنشاء وإدارة أكواد التفعيل',       icon: Key },
  { id: 'codelogs',       label: 'سجل الأكواد',      desc: 'تاريخ تفعيل وإجراءات الأكواد',     icon: Activity },
  { id: 'numbers',        label: 'الأرقام',          desc: 'تحليل أرقام الهاتف المشحونة',       icon: Phone },
  { id: 'globalstats',    label: 'إحصائيات',         desc: 'تقارير وإحصائيات متقدمة',           icon: TrendingUp },
  { id: 'recharge',       label: 'محرك الشحن',       desc: 'ربط سكربت الشحن الخارجي',          icon: Zap },
  { id: 'operations',     label: 'العمليات',          desc: 'سجل جميع عمليات الشحن',            icon: Clock },
  { id: 'logs',           label: 'السجلات',           desc: 'سجلات النظام والأخطاء',             icon: FileText },
  { id: 'crash_logs',     label: 'سجلات الأعطال',     desc: 'استعراض تقارير وإغلاقات التطبيق المفاجئة', icon: AlertTriangle },
  { id: 'notifications',  label: 'الإشعارات',        desc: 'إرسال إشعارات للمستخدمين',          icon: Bell },
  { id: 'notif_automation', label: 'إشعارات تلقائية', desc: 'قواعد الإشعارات الآلية',             icon: Cpu },
  { id: 'navlinks',       label: 'مدير الروابط',     desc: 'استعراض جميع روابط التطبيق',         icon: Link2 },
  { id: 'settings',       label: 'الإعدادات',        desc: 'إعدادات الحساب والنظام',            icon: Settings },
  { id: 'assets',         label: 'الأصول المرئية',   desc: 'إدارة الشعارات والصور الديناميكية', icon: Image },
  { id: 'product_config', label: 'إدارة الكروت',     desc: 'تفعيل وإيقاف وتعديل إعدادات الكروت', icon: Package },
  { id: 'giftbox',        label: 'صندوق الهدايا',    desc: 'إدارة الهدية الترحيبية للمستخدمين', icon: Gift },
  { id: 'balance_products', label: 'كروت الرصيد',    desc: 'إدارة كروت نظام الشحن من الرصيد',   icon: Banknote },
  { id: 'legacy_flex',    label: 'أنظمة فليكس',      desc: 'إدارة أنظمة فليكس القديمة (قريباً)',icon: RotateCcw },
  { id: 'merchants',       label: 'التجار',           desc: 'إدارة حسابات التجار وإنشائها',      icon: Building2 },
  { id: 'member_monitor',  label: 'أعضاء التجار',     desc: 'مراقبة أعضاء واشتراكات التجار',     icon: Users },
  { id: 'duplicate_accounts', label: 'الحسابات المكررة', desc: 'كشف الأجهزة المتعددة الحسابات وحظرها', icon: ShieldAlert },
  { id: 'charge_throttles',   label: 'سجلات التقييد',   desc: 'سجلات تقييد الشحن وتضارب الأجهزة',    icon: ShieldX },
  { id: 'red_packages',       label: 'باقات RED',        desc: 'إدارة باقات Vodafone RED ديناميكياً',   icon: Package },
  { id: 'promotions',         label: 'العروض والبانرات', desc: 'إنشاء وإدارة العروض والبانرات',          icon: Tag },
];

// المحرك الداخلي — لا يظهر في الشريط الجانبي لكن قابل للوصول برمجياً
const INTERNAL_TABS: TabMeta[] = [
  { id: 'integrity',      label: 'سلامة النظام',     desc: 'فحص قاعدة البيانات',               icon: DatabaseZap },
  { id: 'update_diag',    label: 'تشخيص التحديثات', desc: 'فحص ملفات APK',                     icon: Download },
  { id: 'server_config',  label: 'إعدادات السيرفر',  desc: 'Feature Flags وإعدادات ديناميكية',  icon: Globe },
  { id: 'version_center', label: 'مركز الإصدارات',   desc: 'إدارة إصدارات التطبيق',             icon: Download },
  { id: 'live_monitoring',label: 'Live Monitoring',   desc: 'مراقبة المتصلين',                   icon: Activity },
  { id: 'feature_mgmt',   label: 'Feature Flags',     desc: 'تشغيل/إيقاف الميزات',              icon: ToggleOn },
  { id: 'card_feedbacks', label: 'تقييمات الكروت',    desc: 'مراجعة الاقتراحات والتقييمات',     icon: MessageSquare },
];

// جميع التبويبات (مرئية + داخلية) للـ rendering
const TABS: TabMeta[] = [...VISIBLE_TABS, ...INTERNAL_TABS];

// ─────────────────────────────────────────────
// ثوابت الحالات — 8 حالات كاملة PHASE 12
// ─────────────────────────────────────────────
const CODE_STATUS_MAP: Record<string, { label: string; cls: string; dot: string }> = {
  active:    { label: 'غير مستخدم', cls: 'text-muted-foreground bg-muted/60 border-border',                    dot: 'bg-muted-foreground' },
  unused:    { label: 'غير مستخدم', cls: 'text-muted-foreground bg-muted/60 border-border',                    dot: 'bg-muted-foreground' },
  used:      { label: 'نشط',        cls: 'text-success bg-success/10 border-success/20',                       dot: 'bg-success' },
  expired:   { label: 'منتهي',      cls: 'text-destructive bg-destructive/10 border-destructive/20',            dot: 'bg-destructive' },
  suspended: { label: 'معلق',       cls: 'text-warning bg-warning/10 border-warning/20',                       dot: 'bg-warning' },
  cancelled: { label: 'ملغي',       cls: 'text-destructive/70 bg-destructive/5 border-destructive/20',         dot: 'bg-destructive/60' },
  archived:  { label: 'مؤرشف',      cls: 'text-muted-foreground bg-muted/40 border-border/60',                 dot: 'bg-muted-foreground/60' },
  replaced:  { label: 'مستبدل',     cls: 'text-primary/70 bg-primary/5 border-primary/20',                    dot: 'bg-primary/60' },
  trial:     { label: 'تجريبي',     cls: 'text-warning bg-warning/10 border-warning/20',                       dot: 'bg-warning' },
  disabled:  { label: 'معطل',       cls: 'text-foreground bg-foreground/10 border-foreground/30',               dot: 'bg-foreground' },
  closed:    { label: 'مغلق',       cls: 'text-foreground bg-foreground/10 border-foreground/30',               dot: 'bg-foreground' },
};

// كود → يحل حالة العرض الحقيقية بما فيها التعليق والإلغاء PHASE 12
function resolveDisplayStatus(k: LicenseKey): string {
  // إذا كان الاشتراك المرتبط له حالة خاصة → نعكسها على الكود
  const subStatus = (k as LicenseKey & { subscription_status?: string }).subscription_status;
  if (subStatus === 'suspended') return 'suspended';
  if (subStatus === 'cancelled') return 'cancelled';
  if (subStatus === 'archived')  return 'archived';
  if (subStatus === 'replaced')  return 'replaced';

  if (k.status === 'used') {
    // تحقق هل الاشتراك انتهى؟ نعتمد على expires_at إن وُجد في الكائن (join)
    const expiry = (k as LicenseKey & { expires_at?: string | null }).expires_at;
    if (expiry && calcDaysRemaining(expiry) <= 0) return 'expired';
    // إذا اقترب من الانتهاء → سيظهر warning (7 أيام)
    return 'used';
  }
  return k.status;
}

// badge للحالة بما فيها "قريب من الانتهاء"
function CodeStatusBadge({ k }: { k: LicenseKey }) {
  const expiry = (k as LicenseKey & { expires_at?: string | null }).expires_at;
  const days   = expiry ? calcDaysRemaining(expiry) : null;
  const expiringSoon = k.status === 'used' && days !== null && days > 0 && days <= 7;

  if (expiringSoon) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-warning bg-warning/10 border-warning/20">
        ⚠ ينتهي قريباً
      </span>
    );
  }
  const disp = resolveDisplayStatus(k);
  const st = CODE_STATUS_MAP[disp] ?? CODE_STATUS_MAP.active;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${st.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${st.dot}`} />
      {st.label}
    </span>
  );
}

// badge نوع الكود
function CodeTypeBadge({ type }: { type: string }) {
  if (type === 'trial') return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-warning bg-warning/10 border-warning/20">🧪 تجريبي</span>;
  if (type === 'gift')  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-success bg-success/10 border-success/20">🎁 هدية</span>;
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-primary bg-primary/10 border-primary/20">💳 مدفوع</span>;
}

const CODE_ACTION_MAP: Record<string, { label: string; color: string }> = {
  created:   { label: 'تم إنشاء الكود',   color: 'bg-primary' },
  copied:    { label: 'تم نسخ الكود',      color: 'bg-muted-foreground' },
  viewed:    { label: 'تم عرض الكود',      color: 'bg-muted-foreground' },
  attempt:   { label: 'محاولة تفعيل',      color: 'bg-warning' },
  activated: { label: 'تم التفعيل',        color: 'bg-success' },
  failed:    { label: 'فشل التفعيل',       color: 'bg-destructive' },
  expired:   { label: 'انتهاء الصلاحية',   color: 'bg-warning' },
  disabled:  { label: 'تم التعطيل',        color: 'bg-destructive' },
  closed:    { label: 'مغلق تلقائياً',     color: 'bg-foreground' },
};

// ─────────────────────────────────────────────
// مكوّنات مشتركة
// ─────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center">
        <Icon className="w-7 h-7 opacity-40" />
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-4">
      <Button variant="outline" size="icon" className="w-8 h-8 border-border" disabled={page === 1} onClick={() => onChange(page - 1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">{page} / {totalPages}</span>
      <Button variant="outline" size="icon" className="w-8 h-8 border-border" disabled={page === totalPages} onClick={() => onChange(page + 1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary', trend }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string; trend?: string;
}) {
  return (
    <div className="card-premium p-5 space-y-3 h-full flex flex-col hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.replace('text-', 'bg-')}/10 border ${color.replace('text-', 'border-')}/20`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        {trend && <span className="text-[10px] text-success bg-success/10 px-2 py-0.5 rounded-full font-medium">{trend}</span>}
      </div>
      <div>
        <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 text-pretty">{label}</p>
      </div>
      {sub && <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-2 mt-auto">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description, count, action }: {
  icon: React.ElementType; title: string; description: string; count?: number | string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black">{title}</h2>
            {count !== undefined && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground tabular-nums font-medium">{count}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronLeft className="w-3 h-3 opacity-40" />}
          {item.onClick ? (
            <button onClick={item.onClick} className="hover:text-foreground transition-colors font-medium">
              {item.label}
            </button>
          ) : (
            <span className={i === items.length - 1 ? 'text-foreground font-semibold' : ''}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ─────────────────────────────────────────────
// Chart Component
// ─────────────────────────────────────────────
function AdminChart({ data, loading }: { data: AdminChartPoint[]; loading: boolean }) {
  if (loading) return <Spinner />;
  if (!data.length) return <EmptyState icon={BarChart2} text="لا توجد بيانات بعد" />;
  return (
    <div className="w-full min-w-0 overflow-hidden h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gOps" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 700 }}
          />
          <Legend layout="horizontal" wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
          <Area type="monotone" dataKey="operations" name="العمليات" stroke="hsl(var(--primary))" fill="url(#gOps)" strokeWidth={2} />
          <Area type="monotone" dataKey="new_users"  name="مستخدمون جدد" stroke="hsl(var(--success))" fill="url(#gUsers)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────
// P9: مكوّن التحكم في لون Hero Accent
// ─────────────────────────────────────────────
function HeroAccentColorControl() {
  const [color, setColor] = useState('#E60000');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'hero_accent_color')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setColor(data.value);
        setLoaded(true);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'hero_accent_color', value: color, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
    if (error) toast.error('فشل حفظ اللون');
    else toast.success('تم حفظ لون Accent بنجاح');
  };

  if (!loaded) return null;

  return (
    <div className="card-premium p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg border border-border flex items-center justify-center"
          style={{ background: color }}>
          <span className="text-[10px] text-white font-bold">A</span>
        </div>
        <div>
          <p className="text-sm font-bold">لون Hero Accent</p>
          <p className="text-[10px] text-muted-foreground font-mono">hero_accent_color · يؤثر على Glow / Border / Highlight</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Color picker */}
        <input
          type="color"
          value={color}
          onChange={e => setColor(e.target.value)}
          className="w-10 h-10 rounded-lg border border-border cursor-pointer"
          title="اختر اللون"
        />
        {/* Hex input */}
        <input
          type="text"
          value={color}
          onChange={e => {
            const v = e.target.value.trim();
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setColor(v);
          }}
          className="flex-1 h-9 px-3 text-sm font-mono rounded-lg border border-border bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="#E60000"
          dir="ltr"
        />
        {/* Preview circle */}
        <div
          className="w-9 h-9 rounded-full shrink-0 border-2 border-border"
          style={{ background: color, boxShadow: `0 0 12px ${color}80` }}
        />
      </div>
      {/* Preset colors */}
      <div className="flex items-center gap-2 flex-wrap">
        {['#E60000','#FF4500','#FF6B00','#F7C948','#00C853','#00B8D9','#6C5CE7','#FD79A8'].map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              background: c,
              borderColor: color === c ? 'white' : 'transparent',
              outline: color === c ? `2px solid ${c}` : 'none',
            }}
            title={c}
          />
        ))}
      </div>
      <Button
        size="sm"
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? <><Loader2 className="w-4 h-4 animate-spin ml-1" />جاري الحفظ...</> : '💾 حفظ اللون'}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Update Diagnostics Panel
// ─────────────────────────────────────────────
interface DiagRow {
  id: string;
  version: string;
  version_code: number;
  apk_url: string;
  is_latest: boolean;
  created_at: string;
  push_notif_sent: boolean;
  push_notif_sent_at: string | null;
  push_total_devices: number;
  push_sent_count: number;
  push_fail_count: number;
  fileExists?: boolean | null;
  fileSize?: string;
}

interface PushResult {
  total_devices: number;
  sent: number;
  failed: number;
  notification_id?: string;
  skipped?: boolean;
}

function UpdateDiagnosticsPanel() {
  const [rows,        setRows]        = useState<DiagRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [pubForm,     setPubForm]     = useState({ version: '', version_code: '', apk_url: '', release_notes: '' });
  const [pubSaving,   setPubSaving]   = useState(false);
  const [pubChecking, setPubChecking] = useState(false);
  const [pubApkOk,    setPubApkOk]    = useState<boolean | null>(null);
  const [pushResult,  setPushResult]  = useState<PushResult | null>(null);
  const [pubStep,     setPubStep]     = useState<'idle' | 'saving' | 'notifying' | 'done'>('idle');

  const run = async () => {
    setLoading(true);
    const { data } = await supabase.from('app_versions').select('*').order('version_code', { ascending: false }).limit(10);
    const base: DiagRow[] = (data ?? []).map(r => ({ ...r, fileExists: null }));
    setRows(base);
    setLoading(false);

    // فحص HEAD لكل رابط بشكل متوازٍ
    await Promise.all(base.map(async (r, i) => {
      try {
        const res  = await fetch(r.apk_url, { method: 'HEAD' });
        const size = res.ok ? (res.headers.get('content-length') ?? null) : null;
        const kb   = size ? `${(parseInt(size) / 1024 / 1024).toFixed(1)} MB` : '—';
        setRows(prev => prev.map((x, xi) => xi === i ? { ...x, fileExists: res.ok, fileSize: kb } : x));
      } catch {
        setRows(prev => prev.map((x, xi) => xi === i ? { ...x, fileExists: false, fileSize: '—' } : x));
      }
    }));
  };

  // فحص APK قبل النشر
  const checkPubApk = async () => {
    if (!pubForm.apk_url) return;
    setPubChecking(true); setPubApkOk(null);
    try {
      const res = await fetch(pubForm.apk_url, { method: 'HEAD' });
      setPubApkOk(res.ok);
    } catch { setPubApkOk(false); }
    finally { setPubChecking(false); }
  };

  const publishVersion = async () => {
    if (!pubApkOk) { toast.error('يجب التحقق من وجود ملف APK أولاً'); return; }
    if (!pubForm.version || !pubForm.version_code || !pubForm.apk_url) {
      toast.error('يرجى ملء جميع الحقول المطلوبة'); return;
    }
    setPubSaving(true);
    setPubStep('saving');
    setPushResult(null);

    // 1. أزل is_latest عن الكل
    await supabase.from('app_versions').update({ is_latest: false }).eq('is_latest', true);

    // 2. أدخل الإصدار الجديد
    const { data: inserted, error } = await supabase.from('app_versions').insert({
      version:       pubForm.version,
      version_code:  parseInt(pubForm.version_code),
      apk_url:       pubForm.apk_url,
      release_notes: pubForm.release_notes || null,
      is_latest:     true,
    }).select('id').single();

    if (error) {
      setPubSaving(false); setPubStep('idle');
      toast.error('فشل النشر: ' + error.message);
      return;
    }

    toast.success(`✅ تم نشر ${pubForm.version} — جارٍ إرسال الإشعارات…`);
    setPubStep('notifying');

    // 3. استدعاء Edge Function مباشرة (safety net إضافي فوق الـ DB trigger)
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('auto-version-notify', {
        body: {
          version:       pubForm.version,
          version_code:  parseInt(pubForm.version_code),
          apk_url:       pubForm.apk_url,
          release_notes: pubForm.release_notes || null,
          version_id:    inserted?.id,
        },
      });
      if (!fnErr && fnData) {
        const res = fnData as PushResult & { skipped?: boolean };
        if (res.skipped) {
          toast.info('📬 الإشعار أُرسل بالفعل عبر الـ trigger التلقائي');
        } else {
          toast.success(`🔔 تم إرسال الإشعار لـ ${res.sent ?? 0} جهاز من أصل ${res.total_devices ?? 0}`);
        }
        setPushResult(res);
      }
    } catch (e) {
      console.error('auto-version-notify invoke error:', e);
      toast.warning('⚠️ تم النشر — لكن قد يتأخر الإشعار قليلاً');
    }

    setPubSaving(false);
    setPubStep('done');
    setPubForm({ version: '', version_code: '', apk_url: '', release_notes: '' });
    setPubApkOk(null);
    run();
  };

  const pubBtnLabel = () => {
    if (pubStep === 'saving')    return <><Loader2 className="w-4 h-4 animate-spin"/>جارٍ النشر…</>;
    if (pubStep === 'notifying') return <><Loader2 className="w-4 h-4 animate-spin"/>جارٍ إرسال الإشعارات…</>;
    return <><Download className="w-4 h-4"/>نشر الإصدار وإرسال الإشعارات</>; 
  };

  return (
    <div className="space-y-5 page-enter" dir="rtl">
      <SectionHeader
        icon={Download}
        title="تشخيص التحديثات"
        description="فحص ملفات APK وحالة كل إصدار — يُرسَل Push Notification تلقائياً عند النشر"
        action={
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 gap-1.5" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            تشغيل الفحص
          </Button>
        }
      />

      {/* جدول الإصدارات */}
      <div className="card-premium overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['الإصدار','كود','APK','الملف','الحجم','تاريخ الرفع','الحالة','🔔 الإشعار','أجهزة','وصل','فشل','وقت الإشعار'].map(h => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? (
                <tr><td colSpan={12} className="text-center py-8 text-muted-foreground text-sm">جارٍ الفحص…</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={12} className="text-center py-8 text-muted-foreground text-sm">اضغط «تشغيل الفحص»</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="whitespace-nowrap px-3 py-2.5 font-bold text-foreground">{r.version}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">{r.version_code}</td>
                  <td className="px-3 py-2.5 max-w-[160px]">
                    <a href={r.apk_url + (r.apk_url.includes('?') ? '&' : '?') + 'download='} target="_blank" rel="noopener noreferrer"
                      className="text-primary text-[11px] font-mono hover:underline break-all line-clamp-1">
                      {r.apk_url.split('/').pop()}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {r.fileExists === null
                      ? <span className="text-muted-foreground text-xs flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/>فحص…</span>
                      : r.fileExists
                        ? <span className="text-success text-xs font-bold">✅</span>
                        : <span className="text-destructive text-xs font-bold">❌</span>
                    }
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{r.fileSize ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {formatEgyptDate(r.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {r.is_latest
                      ? <Badge className="bg-success/15 text-success border-success/30 text-[10px]">✔ الحالي</Badge>
                      : <span className="text-[10px] text-muted-foreground">—</span>}
                  </td>
                  {/* إحصائيات Push Notification */}
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {r.push_notif_sent
                      ? <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">🔔 أُرسل</Badge>
                      : <span className="text-[10px] text-muted-foreground">لم يُرسَل</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                    {r.push_total_devices > 0 ? r.push_total_devices : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-success font-bold">
                    {r.push_sent_count > 0 ? r.push_sent_count : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-destructive font-bold">
                    {r.push_fail_count > 0 ? r.push_fail_count : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[10px] text-muted-foreground tabular-nums">
                    {r.push_notif_sent_at ? formatEgyptDateTime(r.push_notif_sent_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* نتيجة الإشعار الأخير */}
      {pushResult && !pushResult.skipped && (
        <div className="card-premium p-4 border-primary/30 bg-primary/5 space-y-2">
          <p className="text-xs font-bold text-primary flex items-center gap-1.5">🔔 نتيجة آخر إرسال</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="space-y-0.5">
              <p className="text-lg font-bold text-foreground tabular-nums">{pushResult.total_devices}</p>
              <p className="text-[10px] text-muted-foreground">إجمالي الأجهزة</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-lg font-bold text-success tabular-nums">{pushResult.sent}</p>
              <p className="text-[10px] text-muted-foreground">وصل بنجاح</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-lg font-bold text-destructive tabular-nums">{pushResult.failed}</p>
              <p className="text-[10px] text-muted-foreground">فشل</p>
            </div>
          </div>
        </div>
      )}

      {/* نشر إصدار جديد */}
      <div className="card-premium p-5 space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Plus className="w-3.5 h-3.5" /> نشر إصدار جديد
        </h3>
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-primary flex items-start gap-2">
          <Bell className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>بعد النشر يُرسَل <strong>Push Notification تلقائياً</strong> لجميع المستخدمين — لا تحتاج لأي خطوة يدوية.</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">رقم الإصدار (مثال: 3.0.0)</Label>
            <Input value={pubForm.version} onChange={e => setPubForm(p => ({...p, version: e.target.value}))}
              placeholder="3.0.0" className="h-9 text-sm" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">كود الإصدار (مثال: 45)</Label>
            <Input value={pubForm.version_code} onChange={e => setPubForm(p => ({...p, version_code: e.target.value}))}
              type="number" placeholder="45" className="h-9 text-sm" dir="ltr" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">رابط APK في Supabase Storage</Label>
          <div className="flex gap-2">
            <Input value={pubForm.apk_url} onChange={e => { setPubForm(p => ({...p, apk_url: e.target.value})); setPubApkOk(null); }}
              placeholder="https://…/apk-releases/VodafoneFakka-v3.0.0.apk"
              className="h-9 text-sm flex-1 font-mono text-xs" dir="ltr" />
            <Button variant="outline" size="sm" className="h-9 shrink-0 border-border gap-1.5"
              onClick={checkPubApk} disabled={pubChecking || !pubForm.apk_url}>
              {pubChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Search className="w-3.5 h-3.5"/>}
              تحقق
            </Button>
          </div>
          {pubApkOk === true  && <p className="text-xs text-success font-bold flex items-center gap-1">✅ ملف APK موجود — يمكن النشر</p>}
          {pubApkOk === false && <p className="text-xs text-destructive font-bold flex items-center gap-1">❌ ملف APK غير موجود — ارفع الملف أولاً</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ملاحظات الإصدار (اختياري)</Label>
          <Input value={pubForm.release_notes} onChange={e => setPubForm(p => ({...p, release_notes: e.target.value}))}
            placeholder="v3.0.0: وصف التحديثات…" className="h-9 text-sm" />
        </div>
        <Button
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-1.5"
          onClick={publishVersion}
          disabled={pubSaving || pubApkOk !== true}
        >
          {pubBtnLabel()}
        </Button>
        {pubApkOk !== true && (
          <p className="text-[11px] text-muted-foreground text-center">
            ⚠️ لا يمكن النشر حتى يتم التحقق من وجود ملف APK
          </p>
        )}
      </div>

      {/* ── إعداد التحديث الإجباري ── */}
      <ForceUpdateSettingsCard />
    </div>
  );
}

// ─── ForceUpdateSettingsCard — إدارة التحديث الإجباري من لوحة الإدارة ──────
function ForceUpdateSettingsCard() {
  const [current,  setCurrent]  = useState<number>(0);
  const [inputVal, setInputVal] = useState<string>('');
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    getMinVersionCode().then(v => {
      setCurrent(v);
      setInputVal(String(v));
      setLoading(false);
    });
  }, []);

  const save = async () => {
    const code = parseInt(inputVal, 10);
    if (isNaN(code) || code < 0) { toast.error('أدخل رقماً صحيحاً ≥ 0'); return; }
    setSaving(true);
    const { error } = await setMinVersionCode(code);
    setSaving(false);
    if (error) { toast.error('فشل الحفظ: ' + error); return; }
    setCurrent(code);
    toast.success(`✅ تم تحديث الحد الأدنى: ${code === 0 ? 'لا إجبار' : `كود ${code}`}`);
  };

  return (
    <div className="card-premium p-5 space-y-4 border-warning/30">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-warning" /> التحديث الإجباري (Force Update)
      </h3>
      <div className="rounded-lg bg-warning/8 border border-warning/25 p-3 text-xs text-warning-foreground flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" />
        <span>
          هذا الرقم يُمثل <strong>الحد المسموح به</strong>. أي مستخدم يملك APK بكود <strong>أقل</strong> من هذا الرقم سيُجبَر على التحديث.<br/>
          (مثال: إذا كان آخر إصدار هو 236، ضع هنا 236 إذا أردت إجبار من هم أقل من 236 على التحديث. إذا أردت إجبار إصدار 236 نفسه، ضع 237). القيمة <strong>0</strong> = لا إجبار.
        </span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
            <span className="text-xs text-muted-foreground">الحد الأدنى الحالي:</span>
            <span className={`text-sm font-bold tabular-nums ${current > 0 ? 'text-warning' : 'text-success'}`}>
              {current === 0 ? '0 — لا إجبار' : `كود ${current}`}
            </span>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">الحد الأدنى الجديد (0 = إلغاء الإجبار)</Label>
              <Input
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                type="number" min="0"
                placeholder="مثال: 93 (= يُجبر من لديه كود أقل من 93)"
                className="h-9 text-sm font-mono" dir="ltr"
              />
            </div>
            <Button
              className="self-end h-9 bg-warning text-warning-foreground hover:bg-warning/90 font-bold gap-1.5 shrink-0"
              onClick={save} disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            ✏️ مثال: اضبط على <strong>93</strong> لإجبار من لديه كود 92 أو أقل على التحديث.<br/>
            🔓 اضبط على <strong>0</strong> لإلغاء الإجبار والسماح لجميع الإصدارات بالدخول.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// UserDiagnosticsSection — تشخيص الحساب الكامل
// ─────────────────────────────────────────────
function UserDiagnosticsSection({ user }: { user: UserDetail }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  type DiagSeverity = 'ok' | 'warn' | 'error' | 'info';
  type DiagCheck = { label: string; status: DiagSeverity; message: string; action?: string };
  const [checks, setChecks] = useState<DiagCheck[]>([]);

  const runDiag = async () => {
    setOpen(true);
    setLoading(true);
    const results: DiagCheck[] = [];
    const p = user.profile;
    const sub = user.subscription;

    // 1. Authentication
    const authLogin = (p as { auth_last_sign_in?: string | null }).auth_last_sign_in ?? null;
    if (authLogin) {
      const daysSince = Math.floor((Date.now() - new Date(authLogin).getTime()) / 86400000);
      results.push({ label: 'المصادقة (Auth)', status: daysSince < 90 ? 'ok' : 'warn', message: daysSince < 90 ? `آخر تسجيل دخول منذ ${daysSince} يوم` : `لم يسجّل دخول منذ ${daysSince} يوماً — قد يكون حساباً غير نشط`, action: daysSince >= 90 ? 'مراجعة الحساب' : undefined });
    } else {
      results.push({ label: 'المصادقة (Auth)', status: 'warn', message: 'لا يوجد سجل لآخر تسجيل دخول', action: 'فحص auth.users' });
    }

    // 2. قاعدة البيانات — profile
    if (!p.id) {
      results.push({ label: 'بيانات الحساب (Profile)', status: 'error', message: 'لا يوجد profile — سجل يتيم في auth.users', action: 'إنشاء profile' });
    } else {
      results.push({ label: 'بيانات الحساب (Profile)', status: 'ok', message: 'Profile موجود ومرتبط بـ auth.users' });
    }

    // 3. البريد الإلكتروني
    if (!p.email) {
      results.push({ label: 'البريد الإلكتروني', status: 'warn', message: 'لا يوجد بريد إلكتروني مسجّل', action: 'تحديث البيانات' });
    } else {
      results.push({ label: 'البريد الإلكتروني', status: 'ok', message: p.email });
    }

    // 4. الاشتراك
    if (!sub) {
      results.push({ label: 'الاشتراك', status: 'info', message: 'لا يوجد اشتراك — المستخدم لم يفعّل أي كود', action: 'ربط كود اشتراك' });
    } else {
      const now = Date.now();
      const expiresAt = sub.expires_at ? new Date(sub.expires_at).getTime() : null;
      const daysRem = expiresAt ? Math.ceil((expiresAt - now) / 86400000) : null;

      if (sub.status === 'expired' && expiresAt && expiresAt > now) {
        results.push({ label: 'حالة الاشتراك', status: 'error', message: `خطأ timezone: status=expired لكن الاشتراك لا يزال صالحاً (${daysRem} يوم متبقٍ)`, action: 'تجديد الاشتراك لإصلاح الحالة' });
      } else if (sub.status === 'active' && expiresAt && expiresAt < now) {
        results.push({ label: 'حالة الاشتراك', status: 'error', message: 'الاشتراك انتهى لكن status=active — يجب إصلاح DB', action: 'إلغاء وإعادة تفعيل الاشتراك' });
      } else if (sub.status === 'active') {
        results.push({ label: 'حالة الاشتراك', status: daysRem != null && daysRem < 3 ? 'warn' : 'ok', message: daysRem != null ? `نشط — ${daysRem} يوم متبقٍ` : 'نشط', action: daysRem != null && daysRem < 3 ? 'تجديد الاشتراك' : undefined });
      } else if (sub.status === 'suspended') {
        results.push({ label: 'حالة الاشتراك', status: 'warn', message: 'الاشتراك معلق', action: 'رفع التعليق' });
      } else {
        results.push({ label: 'حالة الاشتراك', status: 'error', message: `الاشتراك ${sub.status}`, action: 'إعادة تفعيل أو تجديد' });
      }
    }

    // 5. الكود
    if (sub && !user.license_code) {
      results.push({ label: 'الكود (License)', status: 'warn', message: 'يوجد اشتراك بدون كود مرتبط — orphan subscription', action: 'ربط كود أو مراجعة البيانات' });
    } else if (user.license_code) {
      results.push({ label: 'الكود (License)', status: 'ok', message: `مرتبط بكود: ${user.license_code}` });
    } else {
      results.push({ label: 'الكود (License)', status: 'info', message: 'لا يوجد كود مرتبط' });
    }

    // 6. العمليات
    const opsLimit = sub?.ops_limit ?? null;
    const opsUsed  = sub?.ops_count ?? user.ops_count;
    if (opsLimit != null && opsUsed >= opsLimit) {
      results.push({ label: 'العمليات', status: 'warn', message: `استنفد الحصة الكاملة: ${opsUsed}/${opsLimit}`, action: 'إضافة عمليات أو تجديد الاشتراك' });
    } else if (opsLimit != null) {
      results.push({ label: 'العمليات', status: 'ok', message: `${opsUsed} / ${opsLimit} — متبقٍ ${opsLimit - opsUsed}` });
    } else {
      results.push({ label: 'العمليات', status: 'ok', message: `${opsUsed} عملية — غير محدود` });
    }

    // 7. الحظر
    if (!p.is_active) {
      results.push({ label: 'الحظر / الحالة', status: 'error', message: 'المستخدم محظور (is_active=false)', action: 'رفع الحظر من إجراءات الإدارة' });
    } else {
      results.push({ label: 'الحظر / الحالة', status: 'ok', message: 'الحساب نشط وغير محظور' });
    }

    // 8. فترة السماح
    if (sub?.in_grace_period) {
      const graceEnd = sub.grace_ends_at ? new Date(sub.grace_ends_at) : null;
      results.push({ label: 'فترة السماح', status: 'warn', message: `في فترة السماح${graceEnd ? ` حتى ${formatEgyptDate(graceEnd)}` : ''}`, action: 'تجديد الاشتراك' });
    } else {
      results.push({ label: 'فترة السماح', status: 'ok', message: 'لا توجد فترة سماح نشطة' });
    }

    // 9. الإشعارات
    results.push({ label: 'الإشعارات', status: 'info', message: `${user.notifications.length} إشعار مخزّن` });

    // 10. المزامنة
    const totalErrors  = results.filter(r => r.status === 'error').length;
    const totalWarns   = results.filter(r => r.status === 'warn').length;
    results.push({
      label: 'ملخص التشخيص',
      status: totalErrors > 0 ? 'error' : totalWarns > 0 ? 'warn' : 'ok',
      message: totalErrors > 0
        ? `${totalErrors} مشكلة حرجة + ${totalWarns} تحذير`
        : totalWarns > 0 ? `${totalWarns} تحذير — يُنصح بالمراجعة` : 'الحساب يعمل بشكل سليم',
    });

    setChecks(results);
    setLoading(false);
  };

  const iconFor = (s: DiagSeverity) => {
    if (s === 'ok')    return <ShieldCheck className="w-4 h-4 text-success" />;
    if (s === 'warn')  return <ShieldAlert className="w-4 h-4 text-warning" />;
    if (s === 'error') return <ShieldX className="w-4 h-4 text-destructive" />;
    return <AlertCircle className="w-4 h-4 text-primary" />;
  };

  const bgFor = (s: DiagSeverity) => {
    if (s === 'ok')    return 'bg-success/5 border-success/20';
    if (s === 'warn')  return 'bg-warning/5 border-warning/20';
    if (s === 'error') return 'bg-destructive/5 border-destructive/20';
    return 'bg-primary/5 border-primary/20';
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors"
        onClick={() => open ? setOpen(false) : runDiag()}
      >
        <span className="text-xs font-bold flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" /> تشخيص الحساب
        </span>
        <span className="text-xs text-muted-foreground">{open ? '▲ إخفاء' : '▼ فحص الآن'}</span>
      </button>
      {open && (
        <div className="border-t border-border">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <div className="divide-y divide-border/30">
              {checks.map((c, i) => (
                <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 ${bgFor(c.status)}`}>
                  <div className="shrink-0 mt-0.5">{iconFor(c.status)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{c.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 text-pretty">{c.message}</p>
                    {c.action && (
                      <p className="text-[10px] text-primary font-semibold mt-0.5">← الإجراء المقترح: {c.action}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// المكوّن الرئيسي
// ─────────────────────────────────────────────
export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const user = profile;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  useEffect(() => { if (!isAdmin) navigate('/home', { replace: true }); }, [isAdmin, navigate]);

  // ── Overview ──
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getAdminOverview>> | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('daily');
  const [chartData, setChartData] = useState<AdminChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // ── Users ──
  const [usersResult, setUsersResult] = useState<PaginatedResult<Profile> | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [userDetailOpen, setUserDetailOpen] = useState(false);
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  // ── Subscriptions ──
  const [subsResult, setSubsResult] = useState<{ data: EnrichedSubscription[]; count: number; page: number; pageSize: number } | null>(null);
  const [subsPage, setSubsPage] = useState(1);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsSearch, setSubsSearch] = useState('');
  const [subsStatusFilter, setSubsStatusFilter] = useState('all');
  const [subsTypeFilter, setSubsTypeFilter] = useState('all');

  // ── Licenses ──
  const [keysResult, setKeysResult] = useState<PaginatedResult<LicenseKey> | null>(null);
  const [keysPage, setKeysPage] = useState(1);
  const [keysSearch, setKeysSearch] = useState('');
  const [keysStatusFilter, setKeysStatusFilter] = useState('all');
  const [keysTypeFilter, setKeysTypeFilter] = useState('all');
  const [keysDaysFilter, setKeysDaysFilter] = useState('all');
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyDialog, setNewKeyDialog] = useState(false);
  const [newKeyType, setNewKeyType] = useState<'paid' | 'trial' | 'gift'>('paid');
  const [generatedCode, setGeneratedCode] = useState('');
  const [newKeyDays, setNewKeyDays] = useState('30');
  const [newKeyCustomDays, setNewKeyCustomDays] = useState('');
  const [newKeyUseCustom, setNewKeyUseCustom] = useState(false);
  const [newKeyNotes, setNewKeyNotes] = useState('');
  const [newKeyMaxUsers, setNewKeyMaxUsers] = useState('100');
  const [newKeyActivationLimit, setNewKeyActivationLimit] = useState('1');
  const [newKeyOpsPerUser, setNewKeyOpsPerUser] = useState('20');
  const [newKeyAllowedUsers, setNewKeyAllowedUsers] = useState('100');
  const [newKeyUsesPerUser, setNewKeyUsesPerUser] = useState('1');
  const [newKeyMaxOps, setNewKeyMaxOps] = useState('20');
  const [newKeyExpiryDate, setNewKeyExpiryDate] = useState('');
  const [newKeyExpirationMode, setNewKeyExpirationMode] = useState<'BY_DATE' | 'BY_USAGE' | 'EARLIEST'>('BY_DATE');
  const [keyCreating, setKeyCreating] = useState(false);
  // Code Detail
  const [codeDetail, setCodeDetail] = useState<CodeDetail | null>(null);
  const [codeDetailLoading, setCodeDetailLoading] = useState(false);
  const [codeDetailOpen, setCodeDetailOpen] = useState(false);

  // ── Global Code Stats ──
  const [codeStats, setCodeStats] = useState<GlobalCodeStats | null>(null);
  const [codeStatsLoading, setCodeStatsLoading] = useState(false);
  // Quick filter chip for licenses tab
  const [keysQuickFilter, setKeysQuickFilter] = useState<string>('all');
  const [codeLogsResult, setCodeLogsResult] = useState<PaginatedResult<CodeLog> | null>(null);
  const [codeLogsPage, setCodeLogsPage] = useState(1);
  const [codeLogsLoading, setCodeLogsLoading] = useState(false);

  // ── Phone Analytics ──
  const [phoneResult, setPhoneResult] = useState<PaginatedResult<PhoneAnalytic> | null>(null);
  const [phonePage, setPhonePage] = useState(1);
  const [phoneLoading, setPhoneLoading] = useState(false);

  // ── Operations ──
  const [opsResult, setOpsResult] = useState<PaginatedResult<Operation> | null>(null);
  const [opsPage, setOpsPage] = useState(1);
  const [opsSearch, setOpsSearch] = useState('');
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsFilter, setOpsFilter] = useState<OperationsFilter>({});
  const [opsStats, setOpsStats] = useState<{ total: number; success: number; failed: number; total_amount: number } | null>(null);
  const [opsExpandedId, setOpsExpandedId] = useState<string | null>(null);
  const [opsViewMode, setOpsViewMode] = useState<'list' | 'grouped'>('grouped');

  // ── APK Share (في تاب المستخدمين) ──
  const [apkShareCopied, setApkShareCopied] = useState(false);
  const shareApkFromUsersTab = async () => {
    // اجلب apk_url من DB مباشرة لضمان الرابط الصحيح دائماً
    const { data } = await supabase.from('app_versions').select('version, apk_url').eq('is_latest', true).maybeSingle();
    const url = data?.apk_url;
    const ver = data?.version ?? '—';
    if (!url) { toast.error('تعذّر جلب رابط APK'); return; }
    const shareText = `📱 تحديث Vodafone Fakka Premium\n🚀 الإصدار v${ver}\n⬇️ تحميل APK:\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Vodafone Fakka v${ver}`, text: shareText, url }); return; } catch { /* أُغلقت قائمة المشاركة */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setApkShareCopied(true);
      toast.success('✅ تم نسخ رابط APK');
      setTimeout(() => setApkShareCopied(false), 2500);
    } catch { toast.error('تعذّر النسخ'); }
  };
  // Admin adjust ops dialog
  const [adjustOpsOpen, setAdjustOpsOpen] = useState(false);
  const [adjustOpsTarget, setAdjustOpsTarget] = useState<{ userId: string; username: string } | null>(null);
  const [adjustOpsDelta, setAdjustOpsDelta] = useState('');
  const [adjustOpsReason, setAdjustOpsReason] = useState('');
  const [adjustOpsSaving, setAdjustOpsSaving] = useState(false);
  // Dialog تفاصيل العملية — للإدارة فقط
  const [adminOpDetail, setAdminOpDetail] = useState<{ op: Operation & { api_response?: string; duration_ms?: number } } | null>(null);

  // ── Logs ──
  const [logsResult, setLogsResult] = useState<PaginatedResult<SystemLog> | null>(null);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  // ── Notifications ──
  const [notifsResult, setNotifsResult] = useState<PaginatedResult<Notification> | null>(null);
  const [notifsPage, setNotifsPage] = useState(1);
  const [notifsLoading, setNotifsLoading] = useState(false);
  // إشعار فردي من لوحة المستخدم — يفتح تبويب الإشعارات
  const [deleteNotifId, setDeleteNotifId] = useState<string | null>(null);
  // Delivery tracking
  const [deliveryDialog, setDeliveryDialog] = useState(false);
  const [deliveryData, setDeliveryData] = useState<{ user_id: string; push_sent: boolean; opened_at: string | null; delivered_at: string; profiles?: { username: string | null; email: string | null } }[]>([]);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  // Scheduled notifications
  const [scheduledNotifs, setScheduledNotifs] = useState<ScheduledNotification[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedBody, setSchedBody] = useState('');
  const [schedType, setSchedType] = useState('info');
  const [schedPriority, setSchedPriority] = useState('normal');
  const [schedTargetType, setSchedTargetType] = useState<'all' | 'specific'>('all');
  const [schedTargetUserId, setSchedTargetUserId] = useState('');
  const [schedAt, setSchedAt] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);

  // ── Assets ──
  const [assets, setAssets] = useState<AppAsset[]>([]);
  // ── Product Config state ────────────────────────────────────────────────
  const [productConfigs, setProductConfigs] = useState<ProductConfig[]>([]);
  const [productConfigLoading, setProductConfigLoading] = useState(false);
  const [productConfigEdit, setProductConfigEdit] = useState<Partial<ProductConfig> & { product_id: string } | null>(null);
  const [productConfigSaving, setProductConfigSaving] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Balance Products (كروت الشحن من الرصيد) ──
  interface BalanceProd {
    id: string; product_id: string; name: string; display_name: string;
    category: string; price: number; net_balance: number; units: number;
    product_type: string; validity: string; is_visible: boolean; is_enabled: boolean;
    sort_order: number; notes?: string | null;
    usage_count: number; success_count: number; fail_count: number; last_used_at?: string | null;
  }
  const [balanceProds, setBalanceProds] = useState<BalanceProd[]>([]);
  const [balanceProdsLoading, setBalanceProdsLoading] = useState(false);
  const [balanceProdEdit, setBalanceProdEdit] = useState<Partial<BalanceProd> | null>(null);
  const [balanceProdSaving, setBalanceProdSaving] = useState(false);
  const [balanceProdNew, setBalanceProdNew] = useState(false);
  const [balanceProdDeleteTarget, setBalanceProdDeleteTarget] = useState<BalanceProd | null>(null);
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);

  // ── Merchants state (Phase 4) ────────────────────────────────────────────────
  const [merchants, setMerchants]                     = useState<MerchantFull[]>([]);
  const [merchantsLoading, setMerchantsLoading]       = useState(false);
  const [copiedInvite, setCopiedInvite]               = useState<string | null>(null);
  // Phase 4: Promote/Remove inline dans Users tab
  const [merchantActionLoading, setMerchantActionLoading] = useState<string | null>(null);

  // ── Red Packages state ───────────────────────────────────────────────────────
  const [redPackages, setRedPackages]           = useState<RedPackage[]>([]);
  const [redPkgsLoading, setRedPkgsLoading]     = useState(false);
  const [redPkgEdit, setRedPkgEdit]             = useState<Partial<RedPackage> | null>(null);
  const [redPkgSaving, setRedPkgSaving]         = useState(false);
  const [redPkgIsNew, setRedPkgIsNew]           = useState(false);
  const [redPkgDeleteTarget, setRedPkgDeleteTarget] = useState<RedPackage | null>(null);

  // ── Promotions state ─────────────────────────────────────────────────────────
  const [promotions, setPromotions]             = useState<Promotion[]>([]);
  const [promoLoading, setPromoLoading]         = useState(false);
  const [promoEdit, setPromoEdit]               = useState<Partial<Promotion> | null>(null);
  const [promoSaving, setPromoSaving]           = useState(false);
  const [promoIsNew, setPromoIsNew]             = useState(false);
  const [promoDeleteTarget, setPromoDeleteTarget] = useState<Promotion | null>(null);

  const [assetsLoading, setAssetsLoading] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [deletingAsset,  setDeletingAsset]  = useState<string | null>(null);

  // ── Gift Box ──
  const [giftBox, setGiftBox] = useState<WelcomeGift | null>(null);
  const [giftBoxLoading, setGiftBoxLoading] = useState(false);
  const [giftBoxSaving, setGiftBoxSaving] = useState(false);
  const [giftBoxEnabled, setGiftBoxEnabled] = useState(false);
  const [giftBoxKeyId, setGiftBoxKeyId] = useState<string>('none');
  const [giftBoxAllKeys, setGiftBoxAllKeys] = useState<LicenseKey[]>([]);
  const [giftBoxKeysLoading, setGiftBoxKeysLoading] = useState(false);

  // ── PHASE 1: Delete with cascade ──
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState(false);
  const [deletePreview, setDeletePreview] = useState<{ code: string; affectedUsers: number } | null>(null);

  // ── PHASE 9+10+11+12: Linked Users ──
  const [linkedUsersResult, setLinkedUsersResult] = useState<Awaited<ReturnType<typeof getAllLinkedUsers>> | null>(null);
  const [linkedUsersPage, setLinkedUsersPage] = useState(1);
  const [linkedUsersSearch, setLinkedUsersSearch] = useState('');
  const [linkedUsersLoading, setLinkedUsersLoading] = useState(false);
  const [userActionsOpen, setUserActionsOpen] = useState(false);
  const [userActionsTarget, setUserActionsTarget] = useState<LinkedUserEntry | null>(null);
  const [userActionsLoading, setUserActionsLoading] = useState(false);
  const [subEditorOpen, setSubEditorOpen] = useState(false);
  const [subEditorTarget, setSubEditorTarget] = useState<LinkedUserEntry | null>(null);
  const [subEditorDays, setSubEditorDays] = useState<string>('30');
  const [subEditorSaving, setSubEditorSaving] = useState(false);
  const [changeCodeOpen, setChangeCodeOpen] = useState(false);
  const [changeCodeTarget, setChangeCodeTarget] = useState<LinkedUserEntry | null>(null);
  const [changeCodeKeyId, setChangeCodeKeyId] = useState<string>('');
  const [changeCodeSaving, setChangeCodeSaving] = useState(false);
  const [allKeysForChange, setAllKeysForChange] = useState<LicenseKey[]>([]);

  // ── إشعارات المستخدم — توسيع + حذف ──
  const [showAllNotifs, setShowAllNotifs] = useState(false);
  const [deletingNotifId, setDeletingNotifId] = useState<string | null>(null);
  const [deletingAllNotifs, setDeletingAllNotifs] = useState(false);

  // ── إعداد مدة الاحتفاظ بالإشعارات ──
  const [retentionDays, setRetentionDays] = useState<number>(20);
  const [retentionSaving, setRetentionSaving] = useState(false);

  // ── PHASE 13+14: DB Audit / Integrity ──
  const [integrityReport, setIntegrityReport] = useState<DBAuditReport | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);

  // ── فحص الحسابات المفقودة (orphan repair) ──
  const [orphanResult, setOrphanResult] = useState<{
    total_profiles: number;
    valid_accounts: number;
    orphan_count: number;
    orphans: Array<{ id: string; username: string | null; email: string | null }>;
    message: string;
  } | null>(null);
  const [orphanLoading, setOrphanLoading] = useState(false);
  const [notifyOrphansLoading, setNotifyOrphansLoading] = useState(false);
  const ASSET_KEYS: { key: string; label: string; folder: string; usedIn: string }[] = [
    {
      key: 'app_logo',
      label: 'شعار التطبيق',
      folder: 'logos',
      usedIn: 'شاشة البداية · صفحة تسجيل الدخول · الهيدر',
    },
    {
      key: 'header_logo',
      label: 'شعار الهيدر',
      folder: 'logos',
      usedIn: 'شريط التنقل العلوي',
    },
    {
      key: 'home_hero_logo',
      label: 'لوجو الهيدر الرئيسي (Hero)',
      folder: 'logos',
      usedIn: 'قسم Hero في الصفحة الرئيسية — يحل محل الشعار الثابت',
    },
    {
      key: 'splash_logo',
      label: 'شعار شاشة البداية',
      folder: 'splash',
      usedIn: 'شاشة البداية (الأيقونة المركزية)',
    },
    {
      key: 'splash_image',
      label: 'صورة خلفية شاشة البداية',
      folder: 'splash',
      usedIn: 'شاشة البداية (الخلفية الكاملة)',
    },
    {
      key: 'welcome_icon',
      label: 'أيقونة الترحيب',
      folder: 'logos',
      usedIn: 'بطاقة الترحيب في الصفحة الرئيسية',
    },
    {
      key: 'home_banner',
      label: 'بانر الصفحة الرئيسية',
      folder: 'banners',
      usedIn: 'بانر علوي في الصفحة الرئيسية',
    },
  ];

  // ─── Loaders ───
  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverview(await getAdminOverview());
    setOverviewLoading(false);
  }, []);

  const loadChart = useCallback(async (period: ChartPeriod) => {
    setChartLoading(true);
    setChartData(await getAdminChartData(period));
    setChartLoading(false);
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersResult(await getAllProfiles(usersPage, usersSearch));
    setUsersLoading(false);
  }, [usersPage, usersSearch]);

  const loadSubs = useCallback(async () => {
    setSubsLoading(true);
    setSubsResult(await getAllSubscriptions(subsPage, { search: subsSearch, status: subsStatusFilter, codeType: subsTypeFilter }));
    setSubsLoading(false);
  }, [subsPage, subsSearch, subsStatusFilter, subsTypeFilter]);

  const loadKeys = useCallback(async (p = 1, silent = false) => {
    if (!silent) setKeysLoading(true);
    const res = await getAllLicenseKeys(p);
    setKeysResult(prev => p === 1 ? res : { ...res, data: [...(prev?.data || []), ...res.data] });
    setKeysPage(p);
    setKeysLoading(false);
  }, []);

  const loadCodeLogs = useCallback(async (p = 1, silent = false) => {
    if (!silent) setCodeLogsLoading(true);
    const res = await getCodeLogs(undefined, p);
    setCodeLogsResult(prev => p === 1 ? res : { ...res, data: [...(prev?.data || []), ...res.data] });
    setCodeLogsPage(p);
    setCodeLogsLoading(false);
  }, []);

  const loadCodeStats = useCallback(async () => {
    setCodeStatsLoading(true);
    setCodeStats(await getGlobalCodeStats());
    setCodeStatsLoading(false);
  }, []);

  const loadPhoneAnalytics = useCallback(async () => {
    setPhoneLoading(true);
    setPhoneResult(await getPhoneAnalytics(undefined, phonePage));
    setPhoneLoading(false);
  }, [phonePage]);

  const loadOps = useCallback(async () => {
    setOpsLoading(true);
    const activeFilter = { ...opsFilter, phone: opsSearch || opsFilter.phone };
    const [res, stats] = await Promise.all([
      getAllOperationsFiltered(opsPage, activeFilter),
      getOperationsStats(activeFilter),
    ]);
    setOpsResult(res);
    setOpsStats(stats);
    setOpsLoading(false);
  }, [opsPage, opsSearch, opsFilter]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsResult(await getSystemLogs(logsPage));
    setLogsLoading(false);
  }, [logsPage]);

  const loadNotifs = useCallback(async () => {
    setNotifsLoading(true);
    setNotifsResult(await getAllNotifications(notifsPage));
    setNotifsLoading(false);
  }, [notifsPage]);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    setAssets(await getAllAssets());
    setAssetsLoading(false);
  }, []);

  const loadGiftBox = useCallback(async () => {
    setGiftBoxLoading(true);
    setGiftBoxKeysLoading(true);
    const [gb, keys] = await Promise.all([
      getWelcomeGift(),
      getAllLicenseKeysUnpaged(),
    ]);
    if (gb) {
      setGiftBox(gb);
      setGiftBoxEnabled(gb.is_enabled);
      setGiftBoxKeyId(gb.license_key_id ?? 'none');
    }
    setGiftBoxAllKeys(keys);
    setGiftBoxLoading(false);
    setGiftBoxKeysLoading(false);
  }, []);

  const handleSaveGiftBox = async () => {
    setGiftBoxSaving(true);
    const keyId = giftBoxKeyId === 'none' ? null : giftBoxKeyId;
    const { error } = await setWelcomeGift({ is_enabled: giftBoxEnabled, license_key_id: keyId });
    setGiftBoxSaving(false);
    if (error) { toast.error('فشل حفظ إعدادات صندوق الهدايا'); return; }
    toast.success('تم حفظ إعدادات صندوق الهدايا');
    loadGiftBox();
  };

  const handleAssetUpload = async (assetKey: string, folder: string, file: File) => {
    setUploadingAsset(true);
    try {
      const fileName = `${assetKey}_${Date.now()}.${file.name.split('.').pop()}`;
      const { url, error: uploadErr } = await uploadAssetToStorage(file, folder, fileName);
      if (uploadErr || !url) { toast.error('فشل رفع الصورة'); return; }
      const { error: dbErr } = await upsertAsset({
        asset_key: assetKey, folder, file_name: fileName,
        public_url: url, mime_type: file.type, file_size: file.size,
      });
      if (dbErr) { toast.error('فشل تحديث قاعدة البيانات'); return; }
      toast.success('تم تحديث الأصل بنجاح');
      loadAssets();
    } finally { setUploadingAsset(false); }
  };

  // P2: حذف الأصل — يُفرّغ الرابط ويعرض Placeholder
  const handleAssetDelete = async (assetKey: string, folder: string, fileName?: string) => {
    setDeletingAsset(assetKey);
    try {
      // حذف الملف من Storage إذا كان اسمه معروفاً
      if (fileName) await deleteAssetFromStorage(folder, fileName);
      // تفريغ السجل في DB
      const { error } = await clearAssetRecord(assetKey);
      if (error) { toast.error('فشل حذف الأصل'); return; }
      toast.success('تم حذف الأصل بنجاح');
      loadAssets();
    } finally { setDeletingAsset(null); }
  };

  useEffect(() => { if (activeTab === 'overview')      { loadOverview(); loadChart(chartPeriod); } }, [activeTab]);    // eslint-disable-line
  useEffect(() => { if (activeTab === 'users')          loadUsers(); },         [activeTab, loadUsers]);
  useEffect(() => { if (activeTab === 'subscriptions')  loadSubs(); },          [activeTab, loadSubs]);
  useEffect(() => { if (activeTab === 'licenses') { loadKeys(); loadCodeStats(); } }, [activeTab, loadKeys, loadCodeStats]);
  useEffect(() => { if (activeTab === 'codelogs')       loadCodeLogs(); },      [activeTab, loadCodeLogs]);
  useEffect(() => { if (activeTab === 'numbers' || activeTab === 'globalstats') loadPhoneAnalytics(); }, [activeTab, loadPhoneAnalytics]);
  useEffect(() => { if (activeTab === 'operations')     loadOps(); },           [activeTab, loadOps]);
  useEffect(() => { if (activeTab === 'logs')           loadLogs(); },          [activeTab, loadLogs]);
  useEffect(() => { if (activeTab === 'notifications' || activeTab === 'notif_automation') { loadNotifs(); loadScheduled(); } }, [activeTab, loadNotifs]); // eslint-disable-line
  useEffect(() => { if (activeTab === 'assets') loadAssets(); }, [activeTab]); // eslint-disable-line

  // ── Product Config loader ───────────────────────────────────────────────
  const loadProductConfig = useCallback(async () => {
    setProductConfigLoading(true);
    try {
      const data = await getProductConfig();
      setProductConfigs(data);
    } catch { toast.error('فشل تحميل إعدادات الكروت'); }
    finally { setProductConfigLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === 'product_config') loadProductConfig(); }, [activeTab, loadProductConfig]);

  // ── Balance Products handlers ──
  const loadBalanceProds = useCallback(async () => {
    setBalanceProdsLoading(true);
    const { data } = await supabase.from('balance_products').select('*').order('sort_order', { ascending: true });
    setBalanceProds((data ?? []) as BalanceProd[]);
    setBalanceProdsLoading(false);
  }, []); // eslint-disable-line

  useEffect(() => { if (activeTab === 'balance_products') loadBalanceProds(); }, [activeTab, loadBalanceProds]);

  // ── Merchants load (Phase 4: uses getAllMerchantsWithStats) ──────────────────
  const loadMerchants = useCallback(async () => {
    setMerchantsLoading(true);
    const data = await getAllMerchantsWithStats();
    setMerchants(data);
    setMerchantsLoading(false);
  }, []);
  useEffect(() => { if (activeTab === 'merchants') loadMerchants(); }, [activeTab, loadMerchants]);

  // ── Red Packages loaders ─────────────────────────────────────────────────────
  const loadRedPackages = useCallback(async () => {
    setRedPkgsLoading(true);
    try { setRedPackages(await adminGetAllRedPackages()); } catch { /**/ }
    setRedPkgsLoading(false);
  }, []);
  useEffect(() => { if (activeTab === 'red_packages') loadRedPackages(); }, [activeTab, loadRedPackages]);

  const handleSaveRedPackage = async () => {
    if (!redPkgEdit) return;
    setRedPkgSaving(true);
    try {
      const defaultShowFields = { gb: true, minutes: true, duration: true, renewal: true, features: true, requirements: true, terms: true, instructions: true, pre_msg: true, post_msg: true };
      const payload = {
        name:                      redPkgEdit.name ?? '',
        network_name:              redPkgEdit.network_name ?? 'Vodafone',
        description:               redPkgEdit.description ?? '',
        short_description:         redPkgEdit.short_description ?? '',
        full_description:          redPkgEdit.full_description ?? '',
        data_gb:                   Number(redPkgEdit.data_gb ?? 0),
        minutes:                   Number(redPkgEdit.minutes ?? 0),
        base_price:                Number(redPkgEdit.base_price ?? 0),
        discounted_price:          redPkgEdit.discounted_price != null ? Number(redPkgEdit.discounted_price) : null,
        duration:                  redPkgEdit.duration ?? 'شهر',
        renewal_type:              redPkgEdit.renewal_type ?? 'تجديد تلقائي',
        status:                    (redPkgEdit.status ?? 'available') as RedPackage['status'],
        sort_order:                Number(redPkgEdit.sort_order ?? 0),
        is_visible:                redPkgEdit.is_visible ?? true,
        subscription_enabled:      redPkgEdit.subscription_enabled ?? true,
        whatsapp_number:           redPkgEdit.whatsapp_number ?? '',
        whatsapp_link:             redPkgEdit.whatsapp_link ?? '',
        terms:                     redPkgEdit.terms ?? [],
        features:                  redPkgEdit.features ?? [],
        requirements:              redPkgEdit.requirements ?? [],
        subscription_method:       redPkgEdit.subscription_method ?? '',
        subscription_instructions: redPkgEdit.subscription_instructions ?? '',
        pre_subscription_msg:      redPkgEdit.pre_subscription_msg ?? '',
        post_subscription_msg:     redPkgEdit.post_subscription_msg ?? 'تم إرسال طلبك بنجاح! سيتم التواصل معك قريباً.',
        show_fields:               redPkgEdit.show_fields ?? defaultShowFields,
        image_url:                 redPkgEdit.image_url ?? '',
        card_color:                redPkgEdit.card_color ?? '#E60000',
        bg_color:                  redPkgEdit.bg_color ?? '#1a0000',
        btn_color:                 redPkgEdit.btn_color ?? '#E60000',
        text_color:                redPkgEdit.text_color ?? '#ffffff',
        icon:                      redPkgEdit.icon ?? 'wifi',
        color_primary:             redPkgEdit.color_primary ?? '#E60000',
        color_secondary:           redPkgEdit.color_secondary ?? '#B30000',
        badge_label:               redPkgEdit.badge_label ?? '',
      };
      if (redPkgIsNew) { await adminCreateRedPackage(payload); toast.success('تم إنشاء الباقة'); }
      else if (redPkgEdit.id) { await adminUpdateRedPackage(redPkgEdit.id, payload); toast.success('تم حفظ التعديلات'); }
      setRedPkgEdit(null);
      loadRedPackages();
    } catch (e: unknown) { toast.error(`خطأ: ${formatError(e)}`); }
    setRedPkgSaving(false);
  };

  // ── Promotions loaders ───────────────────────────────────────────────────────
  const loadPromotions = useCallback(async () => {
    setPromoLoading(true);
    try { setPromotions(await adminGetAllPromotions()); } catch { /**/ }
    setPromoLoading(false);
  }, []);
  useEffect(() => { if (activeTab === 'promotions') loadPromotions(); }, [activeTab, loadPromotions]);

  const handleSavePromo = async () => {
    if (!promoEdit) return;
    setPromoSaving(true);
    try {
      const payload = {
        title:             promoEdit.title ?? '',
        description:       promoEdit.description ?? '',
        image_url:         promoEdit.image_url ?? '',
        color_primary:     promoEdit.color_primary ?? '#E60000',
        color_secondary:   promoEdit.color_secondary ?? '#B30000',
        icon:              promoEdit.icon ?? 'zap',
        sort_order:        Number(promoEdit.sort_order ?? 0),
        priority:          Number(promoEdit.priority ?? 0),
        start_date:        promoEdit.start_date ?? null,
        end_date:          promoEdit.end_date ?? null,
        cta_label:         promoEdit.cta_label ?? 'اكتشف الآن',
        internal_route:    promoEdit.internal_route ?? '',
        external_url:      promoEdit.external_url ?? '',
        status:            (promoEdit.status ?? 'active') as Promotion['status'],
        display_frequency: (promoEdit.display_frequency ?? 'always') as Promotion['display_frequency'],
        dismiss_behavior:  (promoEdit.dismiss_behavior ?? 'permanent') as Promotion['dismiss_behavior'],
        dismiss_hours:     Number(promoEdit.dismiss_hours ?? 24),
        send_push:         promoEdit.send_push ?? false,
        is_active:         promoEdit.is_active ?? true,
        show_on_home:      promoEdit.show_on_home ?? true,
      };
      if (promoIsNew) {
        const created = await adminCreatePromotion(payload);
        toast.success('تم إنشاء العرض');
        // إرسال إشعار push إذا طُلب
        if (payload.send_push) {
          await sendNotification({
            title: `🔥 عرض جديد: ${payload.title}`,
            body: payload.description || payload.title,
            type: 'offer',
            is_global: true,
            send_push: true,
            action_url: payload.internal_route || '/home',
            dedup_key: `promo_${created.id}`,
          });
          await adminUpdatePromotion(created.id, { push_sent: true });
          toast.success('تم إرسال الإشعار للمستخدمين');
        }
      } else if (promoEdit.id) {
        await adminUpdatePromotion(promoEdit.id, payload);
        toast.success('تم حفظ التعديلات');
      }
      setPromoEdit(null);
      loadPromotions();
    } catch (e: unknown) { toast.error(`خطأ: ${formatError(e)}`); }
    setPromoSaving(false);
  };

  const handleSaveBalanceProd = async () => {
    if (!balanceProdEdit) return;
    setBalanceProdSaving(true);
    try {
      if (balanceProdNew) {
        const { error } = await supabase.from('balance_products').insert([{
          product_id: balanceProdEdit.product_id ?? '',
          name: balanceProdEdit.name ?? '',
          display_name: balanceProdEdit.display_name ?? '',
          category: balanceProdEdit.category ?? 'fakka',
          price: balanceProdEdit.price ?? 0,
          net_balance: balanceProdEdit.net_balance ?? 0,
          units: balanceProdEdit.units ?? 0,
          product_type: balanceProdEdit.product_type ?? 'وحدة',
          validity: balanceProdEdit.validity ?? 'صالح 24 ساعة',
          is_visible: balanceProdEdit.is_visible ?? true,
          is_enabled: balanceProdEdit.is_enabled ?? true,
          sort_order: balanceProdEdit.sort_order ?? 0,
          notes: balanceProdEdit.notes ?? null,
        }]);
        if (error) { toast.error('فشل الإضافة: ' + error.message); return; }
        toast.success('تم إضافة الكارت بنجاح');
      } else {
        const { id, product_id, ...rest } = balanceProdEdit;
        if (!id) return;
        const { error } = await supabase.from('balance_products').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) { toast.error('فشل الحفظ: ' + error.message); return; }
        toast.success('تم حفظ التغييرات');
      }
      setBalanceProdEdit(null);
      setBalanceProdNew(false);
      loadBalanceProds();
    } finally {
      setBalanceProdSaving(false);
    }
  };

  const handleDeleteBalanceProd = async (prod: BalanceProd) => {
    const { error } = await supabase.from('balance_products').delete().eq('id', prod.id);
    if (error) { toast.error('فشل الحذف: ' + error.message); return; }
    toast.success('تم حذف الكارت');
    setBalanceProdDeleteTarget(null);
    loadBalanceProds();
  };

  const handleSaveProductConfig = async () => {
    if (!productConfigEdit) return;
    setProductConfigSaving(true);
    const { product_id, ...updates } = productConfigEdit;
    const { error } = await updateProductConfig(product_id, updates);
    setProductConfigSaving(false);
    if (error) { toast.error('فشل حفظ الإعدادات'); return; }
    toast.success('تم حفظ إعدادات الكارت');
    setProductConfigEdit(null);
    loadProductConfig();
  };

  const handleDeleteUserComplete = async () => {
    if (!deleteUserTarget) return;
    setDeleteUserLoading(true);
    const result = await deleteUserComplete(deleteUserTarget.id);
    if (profile) await logAdminAction({ adminId: profile.id, action: 'delete_user_complete', targetUserId: deleteUserTarget.id, details: { name: deleteUserTarget.name }, success: result.success, errorMsg: result.error });
    setDeleteUserLoading(false);
    setDeleteUserTarget(null);
    if (!result.success) { toast.error(result.error ?? 'فشل حذف المستخدم — تحقق من الصلاحيات'); return; }
    toast.success('تم حذف المستخدم نهائياً');
    loadLinkedUsers();
  };
  useEffect(() => { if (activeTab === 'giftbox') loadGiftBox(); }, [activeTab]); // eslint-disable-line

  // تحميل إعداد مدة الاحتفاظ بالإشعارات + تشغيل التنظيف التلقائي عند فتح لوحة الإدارة
  useEffect(() => {
    getNotificationRetentionDays().then(d => setRetentionDays(d));
    // تشغيل التنظيف التلقائي في الخلفية (بدون انتظار)
    getNotificationRetentionDays().then(days => purgeOldNotifications(days));
  }, []); // eslint-disable-line
  // PHASE 9+10+12: Linked users
  const loadLinkedUsers = useCallback(async () => {
    setLinkedUsersLoading(true);
    setLinkedUsersResult(await getAllLinkedUsers(linkedUsersPage, linkedUsersSearch));
    setLinkedUsersLoading(false);
  }, [linkedUsersPage, linkedUsersSearch]);
  useEffect(() => { if (activeTab === 'users') loadLinkedUsers(); }, [activeTab, loadLinkedUsers]); // eslint-disable-line

  // PHASE 14: Integrity
  const loadIntegrity = useCallback(async () => {
    setIntegrityLoading(true);
    setIntegrityReport(await runSystemIntegrityCheck());
    setIntegrityLoading(false);
  }, []);
  useEffect(() => { if (activeTab === 'integrity') loadIntegrity(); }, [activeTab, loadIntegrity]); // eslint-disable-line

  // ─── Chart period change ───
  const handlePeriodChange = (p: ChartPeriod) => { setChartPeriod(p); loadChart(p); };

  // ─── User Detail — يفتح صفحة كاملة بدلاً من Modal ───
  const openUserDetail = (userId: string) => {
    navigate(`/admin/users/${userId}`);
  };

  // ─── Code Detail ───
  const openCodeDetail = async (keyId: string) => {
    setCodeDetailOpen(true); setCodeDetailLoading(true);
    setCodeDetail(await getCodeDetail(keyId));
    setCodeDetailLoading(false);
  };

  // ─── Create Key ───
  const handleCreateKey = async () => {
    const effectiveDays = newKeyUseCustom ? parseInt(newKeyCustomDays) : parseInt(newKeyDays);
    if (!effectiveDays || effectiveDays < 1) { toast.error('مدة غير صحيحة'); return; }
    const parsedMaxUsers    = parseInt(newKeyMaxUsers)        || undefined;
    const parsedActLimit    = parseInt(newKeyActivationLimit) || 1;
    // empty/0 → null means unlimited; undefined → null
    const parsedOpsPerUser: number | null = newKeyOpsPerUser === '' ? null : (parseInt(newKeyOpsPerUser) || null);
    setKeyCreating(true);
    const { error, code } = await createLicenseKey({
      code_type:                 newKeyType,
      duration_days:             effectiveDays,
      custom_duration_days:      newKeyUseCustom ? effectiveDays : undefined,
      notes:                     newKeyNotes || undefined,
      created_by:                profile!.id,
      max_users:                 parsedMaxUsers,
      activation_limit_per_user: parsedActLimit,
      operations_per_user:       parsedOpsPerUser ?? undefined,
      allowed_users:             parsedMaxUsers,
      uses_per_user:             parsedActLimit,
      max_ops_per_user:          parsedOpsPerUser ?? undefined,
      expiry_date:               newKeyExpiryDate || null,
      expiration_mode:           newKeyExpirationMode,
    });
    if (error) { toast.error('خطأ أثناء الإنشاء'); }
    else {
      toast.success(`تم إنشاء الكود: ${code}`);
      await insertCodeLog({ action: 'created', details: `كود: ${code} — نوع: ${newKeyType} — مستخدمين: ${parsedMaxUsers ?? '∞'} — عمليات/مستخدم: ${parsedOpsPerUser ?? '∞'}` });
      setNewKeyDialog(false);
      setNewKeyNotes(''); setNewKeyDays('30'); setNewKeyCustomDays(''); setNewKeyUseCustom(false);
      setNewKeyMaxUsers('100'); setNewKeyActivationLimit('1'); setNewKeyOpsPerUser('20');
      setNewKeyAllowedUsers('100'); setNewKeyUsesPerUser('1'); setNewKeyMaxOps('20');
      setNewKeyExpiryDate(''); setNewKeyExpirationMode('BY_DATE');
      setGeneratedCode('');
      loadKeys(); loadCodeStats();
    }
    setKeyCreating(false);
  };

  const handleToggleKeyStatus = async (id: string, code: string, currentStatus: string) => {
    if (currentStatus === 'disabled') {
      const { error } = await enableLicenseKey(id);
      if (error) toast.error('خطأ في إعادة التشغيل');
      else { toast.success('تم إعادة تشغيل الكود ✅'); await insertCodeLog({ action: 'activated', details: `إعادة تشغيل الكود: ${code}` }); loadKeys(); }
    } else {
      const { error } = await disableLicenseKey(id);
      if (error) toast.error('خطأ في التعطيل');
      else { toast.success('تم تعطيل الكود 🚫'); await insertCodeLog({ action: 'disabled', details: `تعطيل الكود: ${code}` }); loadKeys(); }
    }
  };

  // PHASE 1: حذف الكود مع Cascade — يُلغي جميع الاشتراكات المرتبطة
  const handleDeleteKey = async () => {
    if (!deleteKeyId || !profile) return;
    setDeletingKey(true);
    const result = await deleteLicenseKeyWithCascade(deleteKeyId, profile.id);
    setDeletingKey(false);
    if (!result.success) { toast.error(result.error ?? 'خطأ أثناء الحذف'); }
    else {
      toast.success(`تم حذف الكود ${result.keyCode} — أُلغي ${result.affectedUsers} اشتراك`);
      await insertCodeLog({ action: 'disabled', details: `حذف: ${result.keyCode} — ${result.affectedUsers} اشتراك ملغى` });
      loadKeys(); loadCodeStats(); loadLinkedUsers();
    }
    setDeleteKeyId(null);
    setDeletePreview(null);
  };

  // PHASE 10: User actions handlers
  const execUserAction = async (
    action: () => Promise<{ success: boolean; error?: string }>,
    successMsg: string,
    closeAfter = true
  ) => {
    setUserActionsLoading(true);
    const res = await action();
    setUserActionsLoading(false);
    if (!res.success) { toast.error(res.error ?? 'حدث خطأ غير متوقع'); return; }
    toast.success(successMsg);
    if (closeAfter) setUserActionsOpen(false);
    // تحديث جميع البيانات المتأثرة فوراً
    loadLinkedUsers();
    loadUsers();
    loadSubs();
    // تحديث UserDetail إذا كان مفتوحاً — بغض النظر عن userActionsTarget
    if (userDetailOpen && selectedUser) {
      const fresh = await getUserDetail(selectedUser.profile.id);
      setSelectedUser(fresh);
    } else if (userActionsTarget && userDetailOpen && selectedUser?.profile.id === userActionsTarget.profile.id) {
      const fresh = await getUserDetail(userActionsTarget.profile.id);
      setSelectedUser(fresh);
    }
  };

  // PHASE 11: Subscription editor
  const handleSubEditorSave = async () => {
    if (!subEditorTarget) return;
    setSubEditorSaving(true);
    const days = parseInt(subEditorDays);
    const res = await updateSubscriptionExpiry(subEditorTarget.profile.id, isNaN(days) ? null : days, undefined, profile?.id);
    setSubEditorSaving(false);
    if (!res.success) { toast.error(res.error ?? 'فشل تعديل تاريخ الانتهاء'); return; }
    toast.success(`تم تحديث تاريخ الانتهاء — ${res.newExpiry ? formatEgyptDate(res.newExpiry) : ''}`);
    setSubEditorOpen(false);
    loadLinkedUsers();
    // تحديث UserDetail إذا كان مفتوحاً
    if (userDetailOpen && selectedUser?.profile.id === subEditorTarget.profile.id) {
      setSelectedUser(await getUserDetail(subEditorTarget.profile.id));
    }
  };

  // PHASE 10: Change user code
  const handleChangeCode = async () => {
    if (!changeCodeTarget || !changeCodeKeyId) return;
    setChangeCodeSaving(true);
    const keyObj = allKeysForChange.find(k => k.id === changeCodeKeyId);
    const res = await changeUserCode(changeCodeTarget.profile.id, changeCodeKeyId, keyObj?.code ?? '', profile?.id);
    setChangeCodeSaving(false);
    if (!res.success) { toast.error(res.error ?? 'فشل تغيير الكود'); return; }
    toast.success('تم تغيير الكود بنجاح');
    setChangeCodeOpen(false);
    loadLinkedUsers();
    // تحديث UserDetail إذا كان مفتوحاً
    if (userDetailOpen && selectedUser?.profile.id === changeCodeTarget.profile.id) {
      setSelectedUser(await getUserDetail(changeCodeTarget.profile.id));
    }
  };

  // ─── Schedule Notification ───
  const handleScheduleNotif = async () => {
    if (!schedTitle.trim() || !schedBody.trim() || !schedAt) { toast.error('أكمل البيانات'); return; }
    setSchedSaving(true);
    const { error } = await createScheduledNotification({
      title: schedTitle, body: schedBody, type: schedType, priority: schedPriority,
      target_type: schedTargetType,
      target_user_id: schedTargetType === 'specific' ? schedTargetUserId : undefined,
      scheduled_at: new Date(schedAt).toISOString(),
    });
    if (error) toast.error('خطأ في الجدولة');
    else {
      toast.success('تم جدولة الإشعار');
      setScheduleDialog(false);
      setSchedTitle(''); setSchedBody(''); setSchedAt('');
      const data = await getScheduledNotifications();
      setScheduledNotifs(data);
    }
    setSchedSaving(false);
  };

  // ─── Load Scheduled Notifications ───
  const loadScheduled = useCallback(async () => {
    setScheduledLoading(true);
    const data = await getScheduledNotifications();
    setScheduledNotifs(data);
    setScheduledLoading(false);
  }, []);

  // ─── View Delivery ───
  const handleViewDelivery = async (notifId: string) => {
    setDeliveryLoading(true);
    setDeliveryDialog(true);
    const data = await getNotificationDeliveries(notifId);
    setDeliveryData(data as typeof deliveryData);
    setDeliveryLoading(false);
  };

  // ─── Filtered keys (client-side with quick filter + search + dropdowns) ───
  const filteredKeys = (keysResult?.data ?? []).filter(k => {
    const displayStatus = resolveDisplayStatus(k);
    const expiry = (k as LicenseKey & { expires_at?: string | null }).expires_at;
    const days   = expiry ? calcDaysRemaining(expiry) : null;
    const expiringSoon = k.status === 'used' && days !== null && days > 0 && days <= 7;

    // quick filter chips
    if (keysQuickFilter === 'active'    && !(k.status === 'used' && !expiringSoon && displayStatus !== 'expired')) return false;
    if (keysQuickFilter === 'expiring'  && !expiringSoon) return false;
    if (keysQuickFilter === 'unused'    && k.status !== 'active') return false;
    if (keysQuickFilter === 'expired'   && displayStatus !== 'expired') return false;
    if (keysQuickFilter === 'disabled'  && k.status !== 'disabled' && k.status !== 'closed') return false;
    if (keysQuickFilter === 'trial'     && (k.code_type ?? 'paid') !== 'trial') return false;
    if (keysQuickFilter === 'paid'      && (k.code_type ?? 'paid') !== 'paid') return false;
    if (keysQuickFilter === 'gift'      && (k.code_type ?? 'paid') !== 'gift') return false;

    // dropdown filters
    const matchStatus = keysStatusFilter === 'all' || k.status === keysStatusFilter;
    const matchType   = keysTypeFilter === 'all' || (k.code_type ?? 'paid') === keysTypeFilter;
    const matchDays   = keysDaysFilter === 'all' || String(k.duration_days) === keysDaysFilter;

    // search: code, notes, linked user name/email/id
    const linked = k as LicenseKey & { profiles?: { id?: string; username?: string; email?: string; full_name?: string } };
    const q = keysSearch.toLowerCase();
    const matchSearch = !q
      || k.code.toLowerCase().includes(q)
      || (k.notes ?? '').toLowerCase().includes(q)
      || (linked.profiles?.username ?? '').toLowerCase().includes(q)
      || (linked.profiles?.full_name ?? '').toLowerCase().includes(q)
      || (linked.profiles?.email ?? '').toLowerCase().includes(q)
      || (linked.profiles?.id ?? '').toLowerCase().includes(q);

    return matchSearch && matchStatus && matchType && matchDays;
  });

  const currentTabMeta = TABS.find(t => t.id === activeTab)!;

  if (!isAdmin) return null;

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-background" dir="rtl">

      {/* ══════════════════════════════════════
          Sidebar
      ══════════════════════════════════════ */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-sidebar border-l border-sidebar-border fixed right-0 top-0 bottom-0 z-40 overflow-y-auto">
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-black gradient-text leading-tight">لوحة الإدارة</p>
              <p className="text-[10px] text-muted-foreground">Vodafone Fakka Premium</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {VISIBLE_TABS.map(t => {
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-right transition-all group ${
                  active
                    ? 'bg-primary/15 border border-primary/20 text-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border border-transparent'
                }`}
              >
                <t.icon className={`w-4 h-4 shrink-0 mt-0.5 ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold leading-tight ${active ? 'text-primary' : ''}`}>{t.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{t.desc}</p>
                </div>
                {active && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />}
              </button>
            );
          })}
        </nav>

        {/* Footer actions */}
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <Button variant="ghost" size="sm"
            className="w-full justify-start text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground gap-2"
            onClick={() => navigate('/home')}>
            <Home className="w-3.5 h-3.5" /> الرئيسية
          </Button>
          <Button variant="ghost" size="sm"
            className="w-full justify-start text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
            onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>
            <LogOut className="w-3.5 h-3.5" /> تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* ══════════════════════════════════════
          Main Content
      ══════════════════════════════════════ */}
      <div className="flex-1 min-w-0 lg:mr-64 flex flex-col">

        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-background/90 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <p className="text-sm font-black gradient-text">لوحة الإدارة</p>
          </div>
          <button className="p-2 rounded-lg hover:bg-muted transition-colors" onClick={() => setMobileMenuOpen(v => !v)}>
            <ChevronDown className={`w-5 h-5 text-primary transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </header>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-background/98 backdrop-blur-sm overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-base font-black gradient-text">القائمة</p>
                <button onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {VISIBLE_TABS.map(t => (
                  <button key={t.id}
                    onClick={() => { setActiveTab(t.id); setMobileMenuOpen(false); }}
                    className={`flex flex-col items-start gap-1 p-3 rounded-xl text-right transition-all ${
                      activeTab === t.id
                        ? 'bg-primary/15 border border-primary/20 text-primary'
                        : 'bg-card border border-border text-foreground hover:border-primary/30'
                    }`}
                  >
                    <t.icon className={`w-4 h-4 ${activeTab === t.id ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-semibold">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{t.desc}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 border-border text-xs gap-1" onClick={() => navigate('/home')}>
                  <Home className="w-3.5 h-3.5" /> الرئيسية
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 text-xs text-destructive hover:bg-destructive/10 gap-1"
                  onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>
                  <LogOut className="w-3.5 h-3.5" /> خروج
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sticky top bar with breadcrumb */}
        <div className="sticky top-0 lg:top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <Breadcrumb items={[
            { label: 'الرئيسية', onClick: () => navigate('/home') },
            { label: 'الإدارة', onClick: () => setActiveTab('overview') },
            ...(activeTab !== 'overview' ? [{ label: currentTabMeta.label }] : []),
          ]} />
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">{(profile?.username ?? 'A').charAt(0).toUpperCase()}</span>
              </div>
              <span className="text-xs text-muted-foreground">{profile?.username}</span>
            </div>
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-x-hidden">

          {/* ════════════════════════════════════
              نظرة عامة
          ════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6 page-enter">
              <SectionHeader
                icon={BarChart2} title="نظرة عامة" description="إحصائيات شاملة لأداء المنصة"
                action={
                  <Button variant="outline" size="sm" className="border-border h-9 gap-1.5" onClick={() => { loadOverview(); loadChart(chartPeriod); }}>
                    <RefreshCw className="w-3.5 h-3.5" /> تحديث
                  </Button>
                }
              />

              {overviewLoading || !overview ? <Spinner /> : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <StatCard icon={Users}       label="إجمالي المستخدمين"    value={overview.total_users}      color="text-primary" />
                  <StatCard icon={CheckCircle} label="المشتركون النشطون"     value={overview.active_subs}      color="text-success" />
                  <StatCard icon={XCircle}     label="الاشتراكات المنتهية"   value={overview.expired_subs}     color="text-destructive" />
                  <StatCard icon={Clock}       label="كل العمليات"           value={overview.total_operations} color="text-primary" sub={`✅ ${overview.total_success_operations ?? 0} · ❌ ${overview.total_failed_operations ?? 0}`} />
                  <StatCard icon={CreditCard}  label="كروت مشحونة ✅"        value={overview.total_cards}      color="text-success" />
                  <StatCard icon={TrendingUp}  label="إجمالي الإيرادات"      value={`${overview.total_revenue.toFixed(2)} ج.م`} color="text-warning" />
                  <StatCard icon={Key}         label="إجمالي الأكواد"        value={overview.total_codes}      color="text-primary" />
                  <StatCard icon={Hash}        label="أكواد مستخدمة"         value={overview.used_codes}       color="text-muted-foreground" sub={`${overview.total_codes > 0 ? Math.round(overview.used_codes / overview.total_codes * 100) : 0}% من الإجمالي`} />
                </div>
              )}

              {/* ── النظام الذكي — أوامر سريعة ── */}
              <AdminSmartEngine onNavigate={(tab) => setActiveTab(tab as AdminTab)} />

              {/* الرسوم البيانية */}
              <div className="card-premium p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-bold">الأداء عبر الزمن</h3>
                  <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
                    {(['daily','weekly','monthly','yearly'] as ChartPeriod[]).map(p => (
                      <button key={p}
                        onClick={() => handlePeriodChange(p)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          chartPeriod === p ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}>
                        { p === 'daily' ? 'يومي' : p === 'weekly' ? 'أسبوعي' : p === 'monthly' ? 'شهري' : 'سنوي' }
                      </button>
                    ))}
                  </div>
                </div>
                <AdminChart data={chartData} loading={chartLoading} />
              </div>
            </div>
          )}

          {/* ════════════════════════════════════
              المستخدمون
          ════════════════════════════════════ */}
          {activeTab === 'users' && (
            <div className="space-y-5 page-enter">
              {/* PHASE 9+12: Linked Users Control Center — مع بطاقات Owner/Admin مميزة */}
              <SectionHeader icon={Users} title="مركز المستخدمين المرتبطين" description="عرض كامل لكل مستخدم مع كوده واشتراكه وصلاحياته"
                count={linkedUsersResult?.count}
                action={
                  <div className="flex items-center gap-2">
                    {/* زر مشاركة رابط APK — يجلب الرابط الحالي دائماً من DB */}
                    <Button variant="outline" size="sm"
                      className="border-border h-9 gap-1.5"
                      onClick={shareApkFromUsersTab}
                      title="مشاركة رابط APK الحالي">
                      {apkShareCopied
                        ? <><Check className="w-3.5 h-3.5 text-success" /> <span className="hidden md:inline text-success">تم النسخ</span></>
                        : <><Share2 className="w-3.5 h-3.5" /> <span className="hidden md:inline">مشاركة APK</span></>}
                    </Button>
                    <Button variant="outline" size="sm" className="border-border h-9 gap-1.5" onClick={() => { loadUsers(); loadLinkedUsers(); }}>
                      <RefreshCw className="w-3.5 h-3.5" /> تحديث
                    </Button>
                  </div>
                }
              />
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pr-9 bg-card border-border h-10"
                  placeholder="بحث بالاسم أو البريد أو الكود..."
                  value={linkedUsersSearch}
                  onChange={e => { setLinkedUsersSearch(e.target.value); setLinkedUsersPage(1); }}
                />
              </div>

              {linkedUsersLoading ? <Spinner /> : (
                <div className="space-y-3">
                  {/* PHASE 12: Owner & Admin premium cards first */}
                  {[...(linkedUsersResult?.data ?? [])].sort((a, b) => {
                    const rank = (r?: string) => r === 'super_admin' ? 0 : r === 'admin' ? 1 : 2;
                    const roleDiff = rank(a.profile.role) - rank(b.profile.role);
                    if (roleDiff !== 0) return roleDiff;
                    // نفس الرتبة → الأحدث أولاً
                    return new Date(b.profile.created_at ?? 0).getTime() - new Date(a.profile.created_at ?? 0).getTime();
                  }).map(entry => {
                    const isOwner = entry.profile.role === 'super_admin';
                    const isAdmin = entry.profile.role === 'admin';
                    const isPremium = isOwner || isAdmin;
                    const countdown = entry.subscription?.expires_at ? calcTimeRemaining(entry.subscription.expires_at) : null;
                        // PHASE 6+7: null = unlimited
                        const maxOps = (entry.subscription as (typeof entry.subscription & { max_ops_per_user?: number | null }) | null)?.max_ops_per_user ?? null;

                    return (
                      <div key={entry.profile.id} className={`card-premium p-4 transition-all hover:shadow-lg ${
                        isOwner ? 'border-primary/40 bg-gradient-to-l from-primary/5 to-transparent' :
                        isAdmin ? 'border-warning/40 bg-gradient-to-l from-warning/5 to-transparent' : ''
                      }`}>
                        {/* ── الصف العلوي: صورة + معلومات التعريف ── */}
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2 text-lg font-black ${
                            isOwner ? 'border-primary/50 bg-primary/15 text-primary' :
                            isAdmin ? 'border-warning/50 bg-warning/15 text-warning' :
                            'border-border bg-muted/40 text-foreground'
                          }`}>
                            {entry.profile.avatar_url
                              ? <img src={entry.profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                              : isOwner ? <Crown className="w-5 h-5 text-primary" />
                              : isAdmin ? <Shield className="w-5 h-5 text-warning" />
                              : (entry.profile.full_name ?? entry.profile.username ?? 'U').charAt(0).toUpperCase()
                            }
                          </div>

                          {/* المعلومات الأساسية */}
                          <div className="flex-1 min-w-0">
                            {/* الاسم + الشارات */}
                            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                              <p className="text-sm font-bold text-foreground">
                                {entry.profile.full_name ?? entry.profile.username ?? 'مجهول'}
                              </p>
                              {isOwner && <span className="text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">👑 المالك</span>}
                              {isAdmin && <span className="text-[10px] font-black text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded-full">🛡 مسؤول</span>}
                            </div>
                            {/* اسم المستخدم */}
                            {entry.profile.username && entry.profile.full_name && (
                              <p className="text-xs text-muted-foreground">@{entry.profile.username}</p>
                            )}
                            {/* البريد الإلكتروني */}
                            <p className="text-xs text-muted-foreground mt-0.5">{entry.profile.email ?? '—'}</p>
                            {/* الهاتف */}
                            {entry.profile.phone && (
                              <p className="text-xs text-muted-foreground font-mono">{entry.profile.phone}</p>
                            )}
                          </div>

                          {/* حالة الحساب */}
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              entry.is_banned
                                ? 'text-destructive bg-destructive/10 border-destructive/20'
                                : entry.profile.is_active !== false
                                  ? 'text-success bg-success/10 border-success/20'
                                  : 'text-warning bg-warning/10 border-warning/20'
                            }`}>
                              {entry.is_banned ? 'محظور' : entry.profile.is_active !== false ? 'نشط' : 'موقوف'}
                            </span>
                            {entry.subscription && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                entry.subscription.status === 'active'
                                  ? 'text-primary bg-primary/10 border-primary/20'
                                  : 'text-muted-foreground bg-muted/30 border-border'
                              }`}>
                                {entry.subscription.status === 'active' ? 'مشترك' : 'منتهي'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* ── الصف الثاني: الاشتراك + الكود ── */}
                        {(entry.subscription || entry.license_code) && (
                          <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-3 flex-wrap">
                            {entry.license_code && (
                              <div className="flex items-center gap-1.5">
                                <Key className="w-3 h-3 text-primary shrink-0" />
                                <span className="text-xs font-mono font-bold text-primary">{entry.license_code}</span>
                              </div>
                            )}
                            {entry.subscription?.expires_at && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className={`text-xs font-semibold ${countdown?.expired ? 'text-destructive' : 'text-foreground'}`}>
                                  {countdown ? (countdown.expired ? 'منتهي' : countdown.label) : '—'}
                                </span>
                              </div>
                            )}
                            {(entry.ops_count !== undefined) && (
                              <div className="flex items-center gap-1.5 mr-auto">
                                <Timer className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-xs text-muted-foreground">
                                  {entry.ops_count ?? 0} عملية
                                  {maxOps !== null && <span> / {maxOps}</span>}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── الأزرار ── */}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <Button size="sm" variant="default" className="h-8 text-xs gap-1 flex-1"
                            onClick={() => navigate(`/admin/users/${entry.profile.id}`)}>
                            <User className="w-3 h-3" /> تفاصيل
                          </Button>
                          {!isPremium && (
                            <>
                              <Button size="sm" variant="outline" className="h-8 border-border text-xs gap-1 flex-1"
                                onClick={() => navigate(`/admin/users/${entry.profile.id}/subscription`)}>
                                <CalendarDays className="w-3 h-3" /> اشتراك
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 border-border text-xs gap-1 flex-1"
                                onClick={() => navigate(`/admin/users/${entry.profile.id}/actions`)}>
                                <Zap className="w-3 h-3" /> إجراءات
                              </Button>
                            </>
                          )}
                        </div>

                        {/* Phase 4: أزرار Merchant لكل مستخدم */}
                        {!isPremium && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap border-t border-border/30 pt-2">
                            {entry.profile.role !== 'merchant' ? (
                              <Button size="sm" variant="outline"
                                className="h-7 text-[11px] gap-1 text-success border-success/30 hover:bg-success/5"
                                disabled={merchantActionLoading === entry.profile.id}
                                onClick={async () => {
                                  setMerchantActionLoading(entry.profile.id);
                                  const res = await promoteToMerchant(entry.profile.id, profile?.id);
                                  setMerchantActionLoading(null);
                                  if (res.success) {
                                    toast.success(res.is_restored ? `✅ تم استعادة حساب التاجر` : `✅ تم ترقية المستخدم إلى تاجر`);
                                    loadUsers(); loadLinkedUsers(); loadMerchants();
                                  } else {
                                    toast.error(res.error === 'already_merchant' ? 'المستخدم تاجر بالفعل' : res.error ?? 'فشل الترقية');
                                  }
                                }}>
                                {merchantActionLoading === entry.profile.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Building2 className="w-3 h-3" />}
                                ترقية إلى تاجر
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="outline"
                                  className="h-7 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/5"
                                  onClick={() => navigate(`/admin/merchants/${entry.profile.merchant_id}`)}>
                                  <Building2 className="w-3 h-3" /> لوحة التاجر
                                </Button>
                                <Button size="sm" variant="outline"
                                  className="h-7 text-[11px] gap-1 text-destructive border-destructive/20 hover:bg-destructive/5"
                                  disabled={merchantActionLoading === entry.profile.id}
                                  onClick={async () => {
                                    setMerchantActionLoading(entry.profile.id);
                                    const res = await demoteToUser(entry.profile.id, profile?.id);
                                    setMerchantActionLoading(null);
                                    if (res.success) {
                                      toast.success('✅ تم إزالة صلاحيات التاجر — يعود مستخدماً عادياً');
                                      loadUsers(); loadLinkedUsers(); loadMerchants();
                                    } else {
                                      toast.error(res.error ?? 'فشل إزالة التاجر');
                                    }
                                  }}>
                                  {merchantActionLoading === entry.profile.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <UserX className="w-3 h-3" />}
                                  إزالة التاجر
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!linkedUsersResult?.data.length && <EmptyState icon={Users} text="لا يوجد مستخدمون مرتبطون" />}
                </div>
              )}
              <Pagination page={linkedUsersPage} total={linkedUsersResult?.count ?? 0} pageSize={20} onChange={setLinkedUsersPage} />
            </div>
          )}

          {/* ════════════════════════════════════
              الاشتراكات
          ════════════════════════════════════ */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={CreditCard} title="الاشتراكات" description="متابعة حالة جميع اشتراكات المستخدمين"
                count={subsResult?.count}
                action={<Button variant="outline" size="sm" className="border-border h-9 gap-1.5" onClick={loadSubs}><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>}
              />

              {/* ══ Counters Row ══ */}
              {subsResult && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'إجمالي الاشتراكات', val: subsResult.count, cls: 'text-primary', bg: 'bg-primary/10', icon: CreditCard },
                    { label: 'النشطة',             val: subsResult.data.filter(s => s.status === 'active').length,  cls: 'text-success', bg: 'bg-success/10', icon: CheckCircle },
                    { label: 'المنتهية',           val: subsResult.data.filter(s => s.status === 'expired').length, cls: 'text-destructive', bg: 'bg-destructive/10', icon: XCircle },
                  ].map(({ label, val, cls, bg, icon: Icon }) => (
                    <div key={label} className="card-premium p-3 flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-4 h-4 ${cls}`} />
                      </div>
                      <div>
                        <p className={`text-lg font-black tabular-nums ${cls}`}>{val}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ══ Search + Filters ══ */}
              <div className="card-premium p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pr-9 bg-background border-border h-10 text-sm"
                    placeholder="بحث باسم المستخدم، الإيميل، الكود، معرف المستخدم..."
                    value={subsSearch}
                    onChange={e => { setSubsSearch(e.target.value); setSubsPage(1); }}
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  {/* فلتر الحالة */}
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'active', label: '🟢 نشط' },
                    { id: 'expired', label: '🔴 منتهي' },
                    { id: 'suspended', label: '🟠 معلق' },
                  ].map(chip => (
                    <button key={chip.id}
                      onClick={() => { setSubsStatusFilter(chip.id); setSubsPage(1); }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                        subsStatusFilter === chip.id
                          ? 'bg-primary/15 border-primary/50 text-primary'
                          : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/30'
                      }`}>
                      {chip.label}
                    </button>
                  ))}
                  <div className="w-px h-4 bg-border mx-1" />
                  {/* فلتر نوع الكود */}
                  {[
                    { id: 'all',   label: 'كل الأنواع' },
                    { id: 'trial', label: '🧪 تجريبي' },
                    { id: 'gift',  label: '🎁 هدية' },
                    { id: 'paid',  label: '💳 مدفوع/شهري' },
                  ].map(chip => (
                    <button key={chip.id}
                      onClick={() => { setSubsTypeFilter(chip.id); setSubsPage(1); }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                        subsTypeFilter === chip.id
                          ? 'bg-primary/15 border-primary/50 text-primary'
                          : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/30'
                      }`}>
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {subsLoading ? <Spinner /> : (
                <div className="space-y-3">
                  {subsResult?.data.map(s => {
                    const countdown = s.expires_at ? calcTimeRemaining(s.expires_at) : null;
                    const displayName = s.profile?.full_name || s.profile?.username || s.profile?.email || s.user_id.slice(0, 8) + '...';
                    const daysLeft = s.expires_at ? calcDaysRemaining(s.expires_at) : null;
                    const ctLabel = s.code_type === 'trial' ? '🧪 تجريبي' : s.code_type === 'gift' ? '🎁 هدية' : s.code_type === 'paid' ? '💳 مدفوع' : null;
                    const ctColor = s.code_type === 'trial' ? 'text-warning bg-warning/10 border-warning/20' : s.code_type === 'gift' ? 'text-success bg-success/10 border-success/20' : 'text-primary bg-primary/10 border-primary/20';
                    return (
                      <div key={s.id} className="card-premium p-4 hover:shadow-md transition-shadow space-y-3">
                        {/* رأس البطاقة */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                              <span className="text-sm font-black text-primary">{displayName.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold leading-tight">{displayName}</p>
                              {s.profile?.username && s.profile?.full_name && (
                                <p className="text-[11px] text-muted-foreground">@{s.profile.username}</p>
                              )}
                              {s.profile?.email && (
                                <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{s.profile.email}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                              s.status === 'active'   ? 'text-success bg-success/10 border-success/20' :
                              s.status === 'expired'  ? 'text-destructive bg-destructive/10 border-destructive/20' :
                              'text-warning bg-warning/10 border-warning/20'
                            }`}>
                              {s.status === 'active' ? '● نشط' : s.status === 'expired' ? '✕ منتهي' : '◌ معلق'}
                            </span>
                            {ctLabel && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ctColor}`}>{ctLabel}</span>
                            )}
                          </div>
                        </div>

                        {/* معلومات الاتصال */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {s.profile?.phone && (
                            <span className="text-[11px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20">
                              {s.profile.phone}
                            </span>
                          )}
                          {s.license_code && (
                            <span className="text-[11px] font-mono bg-muted/40 px-2 py-0.5 rounded-lg border border-border">
                              🔑 {s.license_code}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground font-mono bg-muted/20 px-1.5 py-0.5 rounded">
                            {s.user_id.slice(0, 8)}…
                          </span>
                        </div>

                        {/* بيانات النظام الجديد — عمليات + مستخدمون */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {[
                            {
                              label: 'العمليات المتبقية',
                              val: s.status !== 'active' ? '0'
                                : s.remaining_operations !== null && s.remaining_operations !== undefined
                                  ? s.remaining_operations
                                  : s.total_operations === null ? '♾️' : '—',
                              cls: s.status !== 'active' ? 'text-muted-foreground' : 'text-primary',
                            },
                            {
                              label: 'إجمالي العمليات',
                              val: s.status !== 'active' ? '—'
                                : s.total_operations !== null && s.total_operations !== undefined ? s.total_operations : '♾️',
                              cls: s.status !== 'active' ? 'text-muted-foreground' : 'text-foreground',
                            },
                            {
                              label: 'المستخدمون المسموح',
                              val: s.status !== 'active' ? '—'
                                : s.allowed_users !== null && s.allowed_users !== undefined ? s.allowed_users : '♾️',
                              cls: s.status !== 'active' ? 'text-muted-foreground' : 'text-foreground',
                            },
                          ].map(({ label, val, cls }) => (
                            <div key={label} className="bg-muted/20 rounded-lg p-2 text-center">
                              <p className={`text-sm font-black tabular-nums ${cls}`}>{String(val)}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
                            </div>
                          ))}
                        </div>

                        {/* شبكة التواريخ */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'تاريخ التفعيل', val: s.activated_at ? formatEgyptDate(s.activated_at) : '—' },
                            { label: 'تاريخ الانتهاء', val: s.expires_at ? formatEgyptDate(s.expires_at) : '—' },
                            { label: 'الوقت المتبقي', val: countdown ? (countdown.expired ? 'منتهي' : countdown.label) : '—' },
                          ].map(({ label, val }) => (
                            <div key={label} className="bg-muted/30 rounded-lg p-2 text-center">
                              <p className="text-xs font-semibold truncate">{val}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>

                        {/* تذييل البطاقة */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/40 flex-wrap gap-2">
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">
                              {s.ops_count ?? 0} عملية مُستخدمة
                            </span>
                          </div>
                          {daysLeft != null && daysLeft <= 7 && daysLeft >= 0 && (
                            <span className="text-[11px] text-warning font-bold">⚠ {daysLeft} أيام متبقية</span>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-[11px] border-border px-2"
                            onClick={() => openUserDetail(s.user_id)}>
                            <Eye className="w-3 h-3 ml-1" /> التفاصيل
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {!subsResult?.data.length && <EmptyState icon={CreditCard} text="لا توجد اشتراكات مطابقة" />}
                </div>
              )}
              <Pagination page={subsPage} total={subsResult?.count ?? 0} pageSize={subsResult?.pageSize ?? 20} onChange={setSubsPage} />
            </div>
          )}

          {/* ════════════════════════════════════
              الأكواد
          ════════════════════════════════════ */}
          {activeTab === 'licenses' && (
            <div className="space-y-5 page-enter">
              {/* ══════════ Header ══════════ */}
              <SectionHeader icon={Key} title="مركز إدارة الأكواد" description="منصة SaaS احترافية لإدارة أكواد الاشتراك المدفوع والتجريبي والهدايا"
                count={keysResult?.count}
                action={
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="border-border h-9 gap-1.5"
                      onClick={() => { loadKeys(); loadCodeStats(); }}>
                      <RefreshCw className="w-3.5 h-3.5" /> تحديث
                    </Button>
                    <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 gap-1.5"
                      onClick={() => { setGeneratedCode(generateCode('NAFK')); setNewKeyDialog(true); }}>
                      <Plus className="w-4 h-4" /> كود جديد
                    </Button>
                  </div>
                }
              />

              {/* ══════════ إحصائيات شاملة ══════════ */}
              {codeStatsLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="card-premium p-4 animate-pulse h-20 bg-muted/20" />
                  ))}
                </div>
              ) : codeStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'إجمالي الأكواد',      val: codeStats.total_codes,        icon: Key,       cls: 'text-foreground',     bg: 'bg-muted/40' },
                    { label: 'نشطة (مستخدمة)',       val: codeStats.used_codes,         icon: CheckCircle, cls: 'text-success',      bg: 'bg-success/10' },
                    { label: 'غير مستخدمة',          val: codeStats.active_codes,       icon: Zap,       cls: 'text-primary',        bg: 'bg-primary/10' },
                    { label: 'منتهية',               val: codeStats.expired_codes,      icon: Clock,     cls: 'text-destructive',    bg: 'bg-destructive/10' },
                    { label: 'أكواد تجريبية',        val: codeStats.trial_codes,        icon: Layers,    cls: 'text-warning',        bg: 'bg-warning/10' },
                    { label: 'أكواد مدفوعة',         val: codeStats.paid_codes,         icon: CreditCard, cls: 'text-primary',       bg: 'bg-primary/10' },
                    { label: 'المستخدمون المرتبطون', val: codeStats.total_linked_users, icon: UserCheck,  cls: 'text-success',       bg: 'bg-success/10' },
                    { label: 'إجمالي التجديدات',     val: codeStats.total_renewals,     icon: TrendingUp, cls: 'text-primary',       bg: 'bg-primary/10' },
                  ].map(({ label, val, icon: Icon, cls, bg }) => (
                    <div key={label} className="card-premium p-4 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-5 h-5 ${cls}`} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground leading-tight text-pretty">{label}</p>
                        <p className={`text-xl font-black tabular-nums ${cls}`}>{val}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ══════════ Quick Filter Chips ══════════ */}
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { id: 'all',      label: 'الكل' },
                  { id: 'active',   label: '🟢 نشط' },
                  { id: 'expiring', label: '🟡 ينتهي قريباً' },
                  { id: 'unused',   label: '⚪ غير مستخدم' },
                  { id: 'expired',  label: '🔴 منتهي' },
                  { id: 'disabled', label: '⚫ ملغي / مغلق' },
                  { id: 'trial',    label: '🧪 تجريبي' },
                  { id: 'paid',     label: '💳 مدفوع' },
                  { id: 'gift',     label: '🎁 هدية' },
                ].map(chip => (
                  <button key={chip.id}
                    onClick={() => setKeysQuickFilter(chip.id)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                      keysQuickFilter === chip.id
                        ? 'bg-primary/15 border-primary/50 text-primary'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/30'
                    }`}>
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* ══════════ Search + Dropdown Filters ══════════ */}
              <div className="card-premium p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pr-9 bg-background border-border h-10"
                    placeholder="بحث بالكود، اسم المستخدم، معرف المستخدم، الملاحظات..."
                    value={keysSearch} onChange={e => setKeysSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <Select value={keysStatusFilter} onValueChange={setKeysStatusFilter}>
                    <SelectTrigger className="h-8 text-xs bg-background border-border w-36">
                      <SelectValue placeholder="الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الحالات</SelectItem>
                      <SelectItem value="active">غير مستخدم</SelectItem>
                      <SelectItem value="used">نشط</SelectItem>
                      <SelectItem value="expired">منتهي</SelectItem>
                      <SelectItem value="disabled">ملغي</SelectItem>
                      <SelectItem value="closed">مغلق</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={keysTypeFilter} onValueChange={setKeysTypeFilter}>
                    <SelectTrigger className="h-8 text-xs bg-background border-border w-32">
                      <SelectValue placeholder="النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الأنواع</SelectItem>
                      <SelectItem value="paid">مدفوع</SelectItem>
                      <SelectItem value="trial">تجريبي</SelectItem>
                      <SelectItem value="gift">هدية</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={keysDaysFilter} onValueChange={setKeysDaysFilter}>
                    <SelectTrigger className="h-8 text-xs bg-background border-border w-32">
                      <SelectValue placeholder="المدة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل المدد</SelectItem>
                      <SelectItem value="7">7 أيام</SelectItem>
                      <SelectItem value="30">30 يوم</SelectItem>
                      <SelectItem value="60">60 يوم</SelectItem>
                      <SelectItem value="90">90 يوم</SelectItem>
                      <SelectItem value="180">180 يوم</SelectItem>
                    </SelectContent>
                  </Select>
                  {(keysSearch || keysStatusFilter !== 'all' || keysTypeFilter !== 'all' || keysDaysFilter !== 'all' || keysQuickFilter !== 'all') && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                      onClick={() => { setKeysSearch(''); setKeysStatusFilter('all'); setKeysTypeFilter('all'); setKeysDaysFilter('all'); setKeysQuickFilter('all'); }}>
                      مسح الفلاتر
                    </Button>
                  )}
                  <span className="mr-auto text-xs text-muted-foreground">{filteredKeys.length} نتيجة</span>
                </div>
              </div>

              {/* ══════════ قائمة الأكواد ══════════ */}
              {keysLoading ? <Spinner /> : (
                <div className="space-y-3">
                  {filteredKeys.map(k => {
                    const isTrialKey = (k.code_type ?? 'paid') === 'trial';
                    const isGiftKey  = (k.code_type ?? 'paid') === 'gift';
                    const linked = k as LicenseKey & { profiles?: { id?: string; username?: string; email?: string; full_name?: string } };
                    const expiry = (k as LicenseKey & { expires_at?: string | null }).expires_at;
                    const daysLeft = expiry ? calcDaysRemaining(expiry) : null;
                    const expiringSoon = k.status === 'used' && daysLeft !== null && daysLeft > 0 && daysLeft <= 7;
                    const usedCount = k.used_count ?? 0;
                    const maxUsers  = k.max_users ?? 1;
                    const trialPct  = isTrialKey && maxUsers > 0 ? Math.min(100, Math.round((usedCount / maxUsers) * 100)) : 0;
                    const iconBg = isTrialKey ? 'bg-warning/10 border-warning/20' : isGiftKey ? 'bg-success/10 border-success/20' : 'bg-primary/10 border-primary/20';
                    const iconClr = isTrialKey ? 'text-warning' : isGiftKey ? 'text-success' : 'text-primary';

                    return (
                      <div key={k.id} className={`card-premium p-4 hover:shadow-md transition-shadow group border ${expiringSoon ? 'border-warning/30' : 'border-border'}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${iconBg}`}>
                            {isGiftKey ? <Gift className={`w-4 h-4 ${iconClr}`} /> : <Key className={`w-4 h-4 ${iconClr}`} />}
                          </div>
                          <div className="flex-1 min-w-0 space-y-3">
                            {/* Row 1: code + badges + actions */}
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-mono font-bold tracking-widest">{k.code}</p>
                                  <button onClick={() => { navigator.clipboard.writeText(k.code); toast.success('تم نسخ الكود'); }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <CodeStatusBadge k={k} />
                                  <CodeTypeBadge type={k.code_type ?? 'paid'} />
                                  {expiringSoon && daysLeft !== null && (
                                    <span className="text-[10px] font-medium text-warning">⏰ {daysLeft} أيام متبقية</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button size="sm" variant="outline" className="h-7 text-[11px] border-border gap-1"
                                  onClick={() => openCodeDetail(k.id)}>
                                  <Eye className="w-3 h-3" /> تفاصيل
                                </Button>
                                {(k.status === 'active' || k.status === 'used') && (
                                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-warning hover:text-warning hover:bg-warning/10"
                                    title="تعطيل الكود"
                                    onClick={() => handleToggleKeyStatus(k.id, k.code, k.status)}>
                                    <Ban className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {k.status === 'disabled' && (
                                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-success hover:text-success hover:bg-success/10"
                                    title="إعادة تشغيل الكود"
                                    onClick={() => handleToggleKeyStatus(k.id, k.code, k.status)}>
                                    <PlayCircle className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
                                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
                                    title="حذف الكود نهائياً"
                                    onClick={() => setDeleteKeyId(k.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Row 2: metadata chips */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {[
                                { label: 'المدة', val: `${k.duration_days} يوم`, icon: Calendar },
                                { label: 'الاستخدامات', val: isTrialKey ? `${usedCount} / ${maxUsers}` : String(usedCount), icon: Users },
                                { label: 'تاريخ الإنشاء', val: formatEgyptDate(k.created_at), icon: Clock },
                                { label: k.used_at ? 'تاريخ التفعيل' : 'الحالة', val: k.used_at ? formatEgyptDate(k.used_at) : '—', icon: CheckCircle },
                              ].map(({ label, val, icon: Icon }) => (
                                <div key={label} className="flex items-center gap-1.5 bg-muted/30 rounded-lg px-2 py-1.5">
                                  <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">{label}</p>
                                    <p className="text-xs font-semibold tabular-nums">{val}</p>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Row 3: Trial progress bar */}
                            {isTrialKey && maxUsers > 0 && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>استهلاك المستخدمين</span>
                                  <span className={`font-bold tabular-nums ${trialPct >= 90 ? 'text-destructive' : trialPct >= 60 ? 'text-warning' : 'text-success'}`}>
                                    {usedCount}/{maxUsers} ({trialPct}%)
                                  </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${trialPct >= 90 ? 'bg-destructive' : trialPct >= 60 ? 'bg-warning' : 'bg-success'}`}
                                    style={{ width: `${trialPct}%` }} />
                                </div>
                                {k.max_ops_per_user !== null ? (
                                  <p className="text-[10px] text-muted-foreground">عمليات/مستخدم: {k.max_ops_per_user}</p>
                                ) : (
                                  <p className="text-[10px] text-primary font-bold">عمليات/مستخدم: ♾️</p>
                                )}
                              </div>
                            )}

                            {/* Row 4: Linked user — PHASE 1,2 قابل للضغط */}
                            {linked.profiles ? (
                              <button
                                className="w-full flex items-center gap-2 bg-success/5 border border-success/20 rounded-lg px-3 py-2 hover:bg-success/10 transition-colors text-right"
                                onClick={() => navigate(`/admin/users/${linked.profiles!.id}`)}
                              >
                                <UserCheck className="w-3.5 h-3.5 text-success shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-semibold text-success truncate">
                                    {(linked.profiles as typeof linked.profiles & { full_name?: string }).full_name ?? linked.profiles.username ?? linked.profiles.email ?? '—'}
                                  </p>
                                  {linked.profiles.email && <p className="text-[10px] text-muted-foreground truncate">{linked.profiles.email}</p>}
                                </div>
                                <ExternalLink className="w-3 h-3 text-success/70 shrink-0" />
                              </button>
                            ) : (
                              <div className="flex items-center gap-2 bg-muted/10 border border-border/40 rounded-lg px-3 py-2">
                                <UserCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <p className="text-[11px] text-muted-foreground">غير مرتبط بأي مستخدم</p>
                              </div>
                            )}

                            {k.notes && <p className="text-[10px] text-muted-foreground bg-muted/20 rounded-lg px-2 py-1">{k.notes}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!filteredKeys.length && (
                    <EmptyState icon={Key} text={
                      keysSearch || keysStatusFilter !== 'all' || keysQuickFilter !== 'all'
                        ? 'لا توجد نتائج مطابقة لمعايير البحث'
                        : 'لا توجد أكواد بعد — أنشئ أول كود'
                    } />
                  )}
                </div>
              )}
              {keysPage < Math.ceil((keysResult?.count ?? 0) / (keysResult?.pageSize ?? 20)) && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    disabled={keysLoading}
                    className="w-full sm:w-auto border-border"
                    onClick={() => loadKeys(keysPage + 1)}
                  >
                    {keysLoading ? 'جاري التحميل...' : 'عرض المزيد'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              سجل الأكواد
          ════════════════════════════════════ */}
          {activeTab === 'codelogs' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Activity} title="سجل نشاط الأكواد" description="تتبع كل الأحداث المرتبطة بأكواد التفعيل"
                count={codeLogsResult?.count}
                action={<Button variant="outline" size="sm" className="border-border h-9 gap-1.5" onClick={() => loadCodeLogs(1)}><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>}
              />
              {codeLogsLoading ? <Spinner /> : (
                <div className="card-premium p-1 divide-y divide-border/40">
                  {codeLogsResult?.data.map(log => {
                    const meta = CODE_ACTION_MAP[log.action] ?? { label: log.action, color: 'bg-primary' };
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3 hover:bg-muted/20 rounded-xl transition-colors">
                        <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${meta.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-xs font-semibold">{meta.label}</p>
                            <p className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                              {formatEgyptDateTime(log.created_at)}
                            </p>
                          </div>
                          {log.details && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{log.details}</p>}
                          {(log as CodeLog & { profile?: { username?: string } }).profile?.username && (
                            <p className="text-[10px] text-primary mt-0.5">
                              بواسطة: {(log as CodeLog & { profile?: { username?: string } }).profile?.username}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!codeLogsResult?.data.length && <EmptyState icon={Activity} text="لا توجد سجلات بعد" />}
                </div>
              )}
              {codeLogsPage < Math.ceil((codeLogsResult?.count ?? 0) / (codeLogsResult?.pageSize ?? 20)) && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    disabled={codeLogsLoading}
                    className="w-full sm:w-auto border-border"
                    onClick={() => loadCodeLogs(codeLogsPage + 1)}
                  >
                    {codeLogsLoading ? 'جاري التحميل...' : 'عرض المزيد'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              تحليل الأرقام
          ════════════════════════════════════ */}
          {activeTab === 'numbers' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Phone} title="تحليل الأرقام" description="أرقام الهاتف الأكثر شحناً وإحصاءاتها"
                count={phoneResult?.count}
                action={<Button variant="outline" size="sm" className="border-border h-9 gap-1.5" onClick={loadPhoneAnalytics}><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>}
              />
              {phoneLoading ? <Spinner /> : (
                <div className="space-y-3">
                  {phoneResult?.data.map((pa, i) => (
                    <div key={i} className="card-premium p-4 hover:shadow-md transition-shadow space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                            <span className="text-xs font-black text-primary">{i + 1}</span>
                          </div>
                          <p className="text-sm font-mono font-bold">{pa.phone_number}</p>
                        </div>
                        <span className="text-sm font-black text-primary tabular-nums">{pa.usage_count}×</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'ناجح', val: pa.success_count, color: 'text-success' },
                          { label: 'إجمالي', val: pa.usage_count, color: 'text-primary' },
                          { label: 'المبالغ', val: `${pa.total_amount.toFixed(0)} ج`, color: 'text-warning' },
                        ].map(({ label, val, color }) => (
                          <div key={label} className="bg-muted/30 rounded-xl p-2 text-center">
                            <p className={`text-sm font-black tabular-nums ${color}`}>{val}</p>
                            <p className="text-[10px] text-muted-foreground">{label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.min(100, (pa.usage_count / (phoneResult.data[0]?.usage_count || 1)) * 100)}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        آخر استخدام: {formatEgyptDateTime(pa.last_used_at)}
                      </p>
                    </div>
                  ))}
                  {!phoneResult?.data.length && <EmptyState icon={Phone} text="لا توجد بيانات أرقام" />}
                </div>
              )}
              <Pagination page={phonePage} total={phoneResult?.count ?? 0} pageSize={phoneResult?.pageSize ?? 20} onChange={setPhonePage} />
            </div>
          )}

          {/* ════════════════════════════════════
              إحصائيات متقدمة
          ════════════════════════════════════ */}
          {activeTab === 'globalstats' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={TrendingUp} title="الإحصائيات المتقدمة" description="تقارير وبيانات تحليلية شاملة للمنصة"
                action={<Button variant="outline" size="sm" className="border-border h-9 gap-1.5" onClick={() => { loadOverview(); loadPhoneAnalytics(); }}><RefreshCw className="w-3.5 h-3.5" /> تحديث</Button>}
              />
              {overviewLoading || !overview ? <Spinner /> : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    <StatCard icon={Users}      label="إجمالي المستخدمين"  value={overview.total_users}      color="text-primary" />
                    <StatCard icon={Clock}      label="كل العمليات"        value={overview.total_operations} color="text-primary" sub={`✅ ${overview.total_success_operations ?? 0} · ❌ ${overview.total_failed_operations ?? 0}`} />
                    <StatCard icon={CreditCard} label="كروت مشحونة ✅"      value={overview.total_cards}      color="text-success" />
                    <StatCard icon={TrendingUp} label="إجمالي الإيرادات"   value={`${overview.total_revenue.toFixed(2)} ج.م`} color="text-warning" />
                    <StatCard icon={CreditCard} label="إجمالي الاشتراكات" value={overview.active_subs + overview.expired_subs} color="text-primary" />
                    <StatCard icon={Key}        label="إجمالي الأكواد"     value={overview.total_codes}      color="text-primary" />
                  </div>
                  <div className="card-premium p-5 space-y-4">
                    <h3 className="text-sm font-bold">أكثر الأرقام استخداماً</h3>
                    {phoneResult?.data.slice(0, 5).map((pa, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs font-black text-muted-foreground w-5 shrink-0">{i + 1}</span>
                        <p className="text-xs font-mono flex-1 min-w-0 truncate">{pa.phone_number}</p>
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min(100, (pa.usage_count / (phoneResult.data[0]?.usage_count || 1)) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-black text-primary tabular-nums shrink-0">{pa.usage_count}</span>
                      </div>
                    ))}
                    {!phoneResult?.data.length && <p className="text-sm text-muted-foreground">لا توجد بيانات</p>}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              محرك الشحن
          ════════════════════════════════════ */}
          {activeTab === 'recharge' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Zap} title="محرك الشحن" description="نقطة ربط سكربت الشحن الخارجي" />
              <div className="card-premium p-8 text-center space-y-5 border-dashed">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                  <Zap className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="text-base font-black gradient-text">Recharge Engine</p>
                  <p className="text-sm text-muted-foreground mt-1">هذا القسم مخصص للربط المستقبلي مع سكربت الشحن الخارجي</p>
                </div>
                <Button variant="outline" className="w-full border-border" disabled onClick={() => {}}>
                  <Zap className="w-4 h-4 ml-2" /> ربط المحرك (قريباً)
                </Button>
                <div className="text-right space-y-2 p-4 bg-muted/20 rounded-xl text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground mb-2">المتطلبات المستقبلية:</p>
                  {['endpoint لاستقبال طلبات الشحن', 'webhook للنتائج الفورية', 'تحديث حالة العمليات تلقائياً'].map(r => (
                    <p key={r}>• {r}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════
              العمليات — سجل شامل منفصل
          ════════════════════════════════════ */}
          {activeTab === 'operations' && (
            <div className="py-8 text-center space-y-4 page-enter">
              <p className="text-muted-foreground text-sm">جارٍ الانتقال إلى سجل العمليات الشامل...</p>
              {(() => { navigate('/admin/operations'); return null; })()}
            </div>
          )}

          {/* ════════════════════════════════════
              السجلات
          ════════════════════════════════════ */}
          {activeTab === 'logs' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={FileText} title="سجلات النظام" description="أحداث وأخطاء النظام المسجلة"
                count={logsResult?.count}
                action={
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="border-border h-9 gap-1.5"
                      onClick={() => {
                        if (!logsResult?.data.length) return;
                        const header = 'المستوى,الإجراء,الرسالة,المستخدم,التاريخ\n';
                        const rows = logsResult.data.map(l =>
                          [l.level, l.action, (l.message ?? '').replace(/,/g, '؛'), l.user_id?.slice(0, 8) ?? '—', formatEgyptDateTime(l.created_at)].join(',')
                        ).join('\n');
                        const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = 'system_logs.csv'; a.click();
                        URL.revokeObjectURL(url);
                      }}>
                      <Download className="w-3.5 h-3.5" /> CSV
                    </Button>
                    <Button variant="outline" size="sm" className="border-border h-9 gap-1.5" onClick={loadLogs}>
                      <RefreshCw className="w-3.5 h-3.5" /> تحديث
                    </Button>
                  </div>
                }
              />
              {logsLoading ? <Spinner /> : (
                <div className="card-premium p-1 divide-y divide-border/40">
                  {logsResult?.data.map(log => {
                    const levelCls = log.level === 'error' ? 'border-destructive/40 text-destructive bg-destructive/10' :
                      log.level === 'warning' ? 'border-warning/40 text-warning bg-warning/10' :
                      log.level === 'debug'   ? 'border-border text-muted-foreground bg-muted/30' :
                      'border-success/40 text-success bg-success/10';
                    const actionCls = log.action?.includes('fail') || log.action?.includes('error') || log.action?.includes('exhaust') ? 'text-destructive' :
                      log.action?.includes('success') || log.action?.includes('consumed') ? 'text-success' :
                      log.action?.includes('warn') ? 'text-warning' : 'text-foreground';
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3 hover:bg-muted/20 rounded-xl transition-colors group">
                        <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                          log.level === 'error' ? 'bg-destructive' : log.level === 'warning' ? 'bg-warning' : log.level === 'debug' ? 'bg-muted-foreground' : 'bg-success'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 justify-between flex-wrap">
                            <p className={`text-xs font-semibold ${actionCls}`}>{log.action}</p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant="outline" className={`text-[9px] ${levelCls}`}>{log.level}</Badge>
                              <button
                                onClick={() => { navigator.clipboard.writeText(`[${log.level}] ${log.action}: ${log.message ?? ''} | ${formatEgyptDateTime(log.created_at)}`); toast.success('تم النسخ'); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          {log.message && <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{log.message}</p>}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {log.user_id && (
                              <span className="text-[10px] text-muted-foreground font-mono bg-muted/30 px-1.5 py-0.5 rounded">
                                👤 {log.user_id.slice(0, 8)}...
                              </span>
                            )}
                            <p className="text-[10px] text-muted-foreground tabular-nums">{formatEgyptDateTime(log.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!logsResult?.data.length && <EmptyState icon={FileText} text="لا توجد سجلات" />}
                </div>
              )}
              <Pagination page={logsPage} total={logsResult?.count ?? 0} pageSize={logsResult?.pageSize ?? 20} onChange={setLogsPage} />
            </div>
          )}

          {/* ════════════════════════════════════
              الإشعارات
          ════════════════════════════════════ */}
          {activeTab === 'notifications' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Bell} title="مركز الإشعارات" description="إرسال وإدارة إشعارات المستخدمين"
                count={notifsResult?.count}
                action={
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-9 gap-1.5 border-border" onClick={() => setScheduleDialog(true)}>
                      <Send className="w-3.5 h-3.5" /> جدولة
                    </Button>
                  </div>
                }
              />

              {/* لوحة الإرسال الاحترافية */}
              <div className="card-premium p-5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">إشعار جديد</p>
                <NotifComposer onSent={() => { loadNotifs(); loadScheduled(); }} />
              </div>

              {/* الإشعارات المجدولة */}
              {scheduledNotifs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">مجدولة ({scheduledNotifs.filter(s => !s.sent_at).length})</p>
                  {scheduledLoading ? <Spinner /> : scheduledNotifs.filter(s => !s.sent_at).map(s => (
                    <div key={s.id} className="card-premium p-3.5 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center shrink-0">
                        <Send className="w-3.5 h-3.5 text-warning" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{s.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.body}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">{formatEgyptDateTime(s.scheduled_at)} · {s.target_type === 'all' ? 'الجميع' : 'مستخدم محدد'}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={async () => { await deleteScheduledNotification(s.id); toast.success('تم الحذف'); loadScheduled(); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* الإشعارات المرسلة */}
              {notifsLoading ? <Spinner /> : (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">المرسلة مؤخراً</p>
                  {notifsResult?.data.map(n => (
                    <div key={n.id} className="card-premium p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Bell className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{n.title}</p>
                            {n.priority && n.priority !== 'normal' && (
                              <Badge variant="outline" className={`text-[10px] ${n.priority === 'urgent' ? 'border-destructive/40 text-destructive' : 'border-warning/40 text-warning'}`}>
                                {n.priority === 'urgent' ? 'عاجل' : 'مهم'}
                              </Badge>
                            )}
                            {n.is_global && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">للجميع</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">{n.body}</p>
                          <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{formatEgyptDateTime(n.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="w-8 h-8 text-primary hover:bg-primary/10"
                            title="تفاصيل التسليم"
                            onClick={() => handleViewDelivery(n.id)}>
                            <Users className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8 text-info hover:bg-info/10"
                            title="إعادة إرسال"
                            onClick={async () => { await resendNotification(n.id); toast.success('تم إعادة الإرسال'); }}>
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive hover:bg-destructive/10"
                            onClick={async () => { await deleteNotification(n.id); toast.success('تم الحذف'); loadNotifs(); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!notifsResult?.data.length && <EmptyState icon={Bell} text="لا توجد إشعارات" />}
                </div>
              )}
              <Pagination page={notifsPage} total={notifsResult?.count ?? 0} pageSize={notifsResult?.pageSize ?? 20} onChange={setNotifsPage} />
            </div>
          )}

          {/* ════════════════════════════════════
              الإشعارات التلقائية
          ════════════════════════════════════ */}
          {activeTab === 'notif_automation' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Cpu} title="الإشعارات التلقائية" description="إدارة قواعد الإشعارات الآلية حسب الأحداث" />
              <NotifAutomation />
            </div>
          )}

          {/* ════════════════════════════════════
              مدير روابط التنقل
          ════════════════════════════════════ */}
          {activeTab === 'navlinks' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Link2} title="مدير الروابط" description="جميع صفحات التطبيق وروابطها الداخلية" />
              <NavLinksManager />
            </div>
          )}

          {/* ════════════════════════════════════
              الإعدادات
          ════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Settings} title="الإعدادات" description="إعدادات حسابك وصلاحيات النظام" />

              <div className="card-premium p-5 space-y-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">الحساب الحالي</h3>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                    <span className="text-xl font-black text-primary">{(profile?.username ?? 'A').charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-base font-bold">{profile?.username ?? 'مسؤول'}</p>
                    <p className="text-sm text-muted-foreground">{profile?.email}</p>
                    <Badge variant="outline" className="text-[10px] mt-1 border-primary/40 text-primary">
                      {profile?.role === 'super_admin' ? '⭐ مدير عام' : '🛡️ مسؤول'}
                    </Badge>
                  </div>
                </div>
              </div>

              {profile?.role === 'super_admin' && (
                <div className="card-premium p-5 space-y-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">إدارة الأدوار</h3>
                  <p className="text-sm text-muted-foreground">يمكن تغيير دور المستخدمين من قسم المستخدمين</p>
                  <Button variant="outline" size="sm" className="border-border gap-1.5" onClick={() => setActiveTab('users')}>
                    <Users className="w-3.5 h-3.5" /> الذهاب لقسم المستخدمين
                  </Button>
                </div>
              )}

              {/* ── إعداد مدة الاحتفاظ بالإشعارات ── */}
              <div className="card-premium p-5 space-y-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5" /> تنظيف الإشعارات التلقائي
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  تُحذف الإشعارات الأقدم من المدة المحددة تلقائياً عند فتح لوحة الإدارة.
                </p>
                <div className="space-y-2">
                  <Label className="text-sm font-normal text-muted-foreground">مدة الاحتفاظ بالإشعارات</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {[7, 15, 20, 30].map(d => (
                      <button
                        key={d}
                        onClick={() => setRetentionDays(d)}
                        className={`h-10 rounded-xl text-sm font-bold border transition-all ${
                          retentionDays === d
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        {d} يوم
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full h-10 font-bold gap-2"
                  disabled={retentionSaving}
                  onClick={async () => {
                    setRetentionSaving(true);
                    await setNotificationRetentionDays(retentionDays);
                    const deleted = await purgeOldNotifications(retentionDays);
                    setRetentionSaving(false);
                    toast.success(`تم الحفظ — حُذف ${deleted.deleted ?? 0} إشعار قديم`);
                  }}
                >
                  {retentionSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4" /> حفظ وتطبيق الآن</>}
                </Button>
              </div>

              <div className="card-premium p-5 space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">حول النظام</h3>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Vodafone Fakka Premium <span className="text-primary">v5</span></p>
                  <p className="text-xs text-muted-foreground">Powered By <span className="text-primary font-bold">Nader Akram</span></p>
                  <p className="text-xs text-muted-foreground">© 2026 جميع الحقوق محفوظة</p>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════
              الأصول المرئية الديناميكية
          ════════════════════════════════════ */}
          {activeTab === 'assets' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Image} title="الأصول المرئية" description="إدارة الشعارات والصور الظاهرة في التطبيق" />

              {/* P9: إعداد لون Hero Accent */}
              <HeroAccentColorControl />

              {assetsLoading ? <Spinner /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ASSET_KEYS.map(({ key, label, folder, usedIn }) => {
                    const asset = assets.find(a => a.asset_key === key);
                    const hasImage = !!(asset && asset.public_url && asset.public_url.trim().length > 0);
                    return (
                      <div key={key} className="card-premium p-4 space-y-3">
                        {/* رأس البطاقة */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold">{label}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{key}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${hasImage ? 'border-success/30 text-success' : 'border-muted-foreground/30 text-muted-foreground'}`}
                            >
                              {hasImage ? '● مفعّل' : '○ فارغ'}
                            </Badge>
                            {/* P2: زر الحذف — يظهر فقط عند وجود صورة */}
                            {hasImage && (
                              <button
                                type="button"
                                onClick={() => handleAssetDelete(key, folder, asset?.file_name ?? undefined)}
                                disabled={deletingAsset === key}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-destructive/15 text-destructive/60 hover:text-destructive disabled:opacity-40"
                                title="حذف الصورة"
                              >
                                {deletingAsset === key
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* معاينة الصورة */}
                        <div className="relative rounded-xl overflow-hidden border border-border bg-muted/30 flex items-center justify-center" style={{ minHeight: 140 }}>
                          {hasImage ? (
                            <img
                              src={`${asset!.public_url}?t=${new Date(asset!.updated_at).getTime()}`}
                              alt={label}
                              className="w-full h-full object-contain max-h-40"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 py-8">
                              <Image className="w-10 h-10 text-muted-foreground/30" />
                              <p className="text-xs text-muted-foreground">لا توجد صورة بعد</p>
                            </div>
                          )}
                        </div>

                        {/* موقع الاستخدام */}
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
                          <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">📍</span>
                          <p className="text-[11px] text-muted-foreground leading-relaxed text-pretty">
                            <span className="font-semibold text-foreground/70">يُستخدم في: </span>
                            {usedIn}
                          </p>
                        </div>

                        {/* رفع صورة */}
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">رفع صورة جديدة</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="file"
                              accept=".png,.jpg,.jpeg,.webp,.svg"
                              className="text-xs bg-background border-border h-9"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 10 * 1024 * 1024) { toast.error('حجم الملف كبير — الحد 10 ميجا'); return; }
                                const allowed = ['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml'];
                                if (!allowed.includes(file.type)) { toast.error('الصيغة غير مدعومة — PNG, JPG, WEBP, SVG'); return; }
                                handleAssetUpload(key, folder, file);
                              }}
                            />
                          </div>
                          {uploadingAsset && (
                            <div className="flex items-center gap-2 text-xs text-primary">
                              <Loader2 className="w-3 h-3 animate-spin" /> جارٍ الرفع…
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              صندوق الهدايا الترحيبي
          ════════════════════════════════════ */}
          {activeTab === 'giftbox' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Gift} title="صندوق الهدايا الترحيبي" description="إدارة الهدية الترحيبية التي تظهر لمستخدمين جدد في صفحة التفعيل" />

              {giftBoxLoading ? <Spinner /> : (
                <div className="space-y-5">

                  {/* ── بطاقة التحكم ── */}
                  <div className="card-premium p-5 space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold">تفعيل صندوق الهدايا</p>
                        <p className="text-xs text-muted-foreground">عند التفعيل يظهر صندوق هدية جذاب للمستخدمين في صفحة التفعيل</p>
                      </div>
                      <button
                        onClick={() => setGiftBoxEnabled(v => !v)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${giftBoxEnabled ? 'bg-primary' : 'bg-muted'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${giftBoxEnabled ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                    </div>

                    {/* ── اختيار الكود ── */}
                    <div className="space-y-2">
                      <Label className="text-sm font-normal text-muted-foreground">اختر الكود المرتبط بالهدية</Label>
                      {giftBoxKeysLoading ? (
                        <div className="h-10 bg-muted rounded-lg animate-pulse" />
                      ) : (
                        <Select value={giftBoxKeyId} onValueChange={setGiftBoxKeyId}>
                          <SelectTrigger className="bg-card border-border h-10 text-sm">
                            <SelectValue placeholder="اختر كود..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— بدون كود —</SelectItem>
                            {giftBoxAllKeys.map(k => (
                              <SelectItem key={k.id} value={k.id}>
                                <span className="font-mono text-xs">{k.code}</span>
                                <span className="mr-2 text-xs text-muted-foreground">
                                  ({k.code_type === 'gift' ? 'هدية' : k.code_type === 'trial' ? 'تجريبي' : 'مدفوع'} — {k.custom_duration_days ?? k.duration_days} يوم)
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <Button
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-10 font-bold gap-2"
                      onClick={handleSaveGiftBox}
                      disabled={giftBoxSaving}
                    >
                      {giftBoxSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gift className="w-4 h-4" />حفظ الإعدادات</>}
                    </Button>
                  </div>

                  {/* ── معاينة بيانات الكود المختار ── */}
                  {giftBoxKeyId && giftBoxKeyId !== 'none' && (() => {
                    const k = giftBoxAllKeys.find(x => x.id === giftBoxKeyId);
                    if (!k) return null;
                    const maxAllowed = k.allowed_users ?? k.max_users ?? null;
                    // P3: نستخدم used_count كمصدر وحيد للعد بعد الإصلاح
                    // (used_count يُزاد فقط عند النسخ الفعلي — لا عند الفتح)
                    const claimedCount = k.used_count ?? 0;
                    const remaining = maxAllowed !== null ? Math.max(0, maxAllowed - claimedCount) : null;
                    const isValid = k.status !== 'disabled' && k.status !== 'expired'
                      && !(k.expiry_date && new Date(k.expiry_date) < new Date())
                      && !(maxAllowed !== null && claimedCount >= maxAllowed)
                      && !(k.code_type === 'paid' && k.status === 'used');

                    return (
                      <div className="card-premium p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold">معاينة الكود المختار</p>
                          <Badge variant="outline" className={isValid ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'}>
                            {isValid ? '✓ صالح' : '✗ غير صالح'}
                          </Badge>
                        </div>
                        <div className="space-y-0">
                          {[
                            { label: 'الكود',              value: <span className="font-mono text-xs">{k.code}</span> },
                            { label: 'النوع',              value: k.code_type === 'gift' ? '🎁 هدية' : k.code_type === 'trial' ? '⚡ تجريبي' : '💳 مدفوع' },
                            { label: 'المدة',              value: `${k.custom_duration_days ?? k.duration_days} يوم` },
                            { label: 'الحالة',             value: k.status },
                            { label: 'المستخدمون المسموح', value: maxAllowed !== null ? `${maxAllowed} مستخدم` : 'غير محدود' },
                            { label: 'المتبقي',            value: remaining !== null ? `${remaining} مستخدم` : '—' },
                            { label: 'عمليات/مستخدم',  value: (() => { const ops = k.operations_per_user ?? k.max_ops_per_user ?? null; return ops !== null ? `${ops} عملية` : '♾️ غير محدود'; })() },
                            { label: 'تاريخ الانتهاء',    value: k.expiry_date ? formatEgyptDate(k.expiry_date) : '—' },
                            { label: 'وضع الانتهاء',      value: k.expiration_mode === 'BY_USAGE' ? 'عند نفاد الحصة' : k.expiration_mode === 'EARLIEST' ? 'الأسبق' : 'بتاريخ الانتهاء' },
                            ...(k.notes ? [{ label: 'ملاحظات', value: k.notes }] : []),
                          ].map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                              <span className="text-xs text-muted-foreground">{label}</span>
                              <span className="text-xs font-semibold">{value}</span>
                            </div>
                          ))}
                        </div>

                        {!isValid && (
                          <div className="p-3 rounded-lg bg-destructive/8 border border-destructive/20">
                            <p className="text-xs text-destructive font-medium text-center">
                              ⚠️ هذا الكود غير صالح — لن يظهر للمستخدمين حتى يتم اختيار كود صالح
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── الحالة الحالية ── */}
                  {giftBox && (
                    <div className="card-premium p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full shrink-0 ${giftBox.is_enabled ? 'bg-success' : 'bg-muted'}`} />
                        <div>
                          <p className="text-xs font-semibold">
                            الحالة المحفوظة: {giftBox.is_enabled ? 'مفعّل' : 'معطّل'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            آخر تحديث: {formatEgyptDateTime(giftBox.updated_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              PHASE 13+14: سلامة النظام
          ════════════════════════════════════ */}
          {activeTab === 'integrity' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={DatabaseZap} title="سلامة النظام" description="فحص شامل لقاعدة البيانات والتحقق من تطابق الإحصائيات — Developer Only" />

              <div className="flex items-center gap-3">
                <Button
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 h-10"
                  onClick={loadIntegrity}
                  disabled={integrityLoading}
                >
                  {integrityLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseZap className="w-4 h-4" />}
                  تشغيل الفحص
                </Button>
                {integrityReport && (
                  <Button
                    variant="outline"
                    className="border-warning/30 text-warning hover:bg-warning/10 gap-2 h-10"
                    onClick={async () => {
                      setRepairLoading(true);
                      const r = await repairUsedCount();
                      setRepairLoading(false);
                      if (!r.error) { toast.success(`إصلاح تام — ${r.fixedRows} سجل صُحِّح`); loadIntegrity(); }
                      else toast.error(r.error ?? 'خطأ في الإصلاح');
                    }}
                    disabled={repairLoading}
                  >
                    {repairLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    إصلاح العدادات
                  </Button>
                )}
              </div>

              {integrityLoading && (
                <div className="card-premium p-8 flex flex-col items-center gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">جارٍ فحص قاعدة البيانات...</p>
                </div>
              )}

              {!integrityLoading && integrityReport && (
                <div className="space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'إجمالي الملفات الشخصية', val: integrityReport.total_profiles,       icon: Users,       cls: 'text-foreground',   bg: 'bg-muted/40' },
                      { label: 'الاشتراكات',              val: integrityReport.total_subscriptions,  icon: CreditCard,  cls: 'text-primary',      bg: 'bg-primary/10' },
                      { label: 'الأكواد الكلية',          val: integrityReport.total_license_keys,   icon: Key,         cls: 'text-warning',      bg: 'bg-warning/10' },
                      { label: 'الهدايا الكلية',          val: integrityReport.total_gift_claims,    icon: Gift,        cls: 'text-success',      bg: 'bg-success/10' },
                    ].map(({ label, val, icon: Icon, cls, bg }) => (
                      <div key={label} className="card-premium p-4 flex items-center gap-3 h-full">
                        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                          <Icon className={`w-5 h-5 ${cls}`} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground leading-tight text-pretty">{label}</p>
                          <p className={`text-xl font-black tabular-nums ${cls}`}>{val}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Issues */}
                  <div className="card-premium p-5 space-y-3">
                    <p className="text-sm font-bold">نتائج الفحص</p>
                    {[
                      { label: 'اشتراكات نشطة',              val: integrityReport.active_subscriptions,   isError: false },
                      { label: 'اشتراكات منتهية',            val: integrityReport.expired_subscriptions,  isError: false },
                      { label: 'اشتراكات بلا مستخدم صحيح',  val: integrityReport.orphan_subscriptions,   isError: integrityReport.orphan_subscriptions > 0 },
                      { label: 'عدادات used_count غير متزامنة', val: integrityReport.mismatched_used_count, isError: integrityReport.mismatched_used_count > 0 },
                      { label: 'اشتراكات نشطة مكررة',       val: integrityReport.duplicate_active_subs,  isError: integrityReport.duplicate_active_subs > 0 },
                      { label: 'هدايا معلقة (pending)',      val: integrityReport.pending_gift_claims,    isError: false },
                    ].map(({ label, val, isError }) => (
                      <div key={label} className={`flex items-center justify-between p-3 rounded-xl border ${
                        isError ? 'border-destructive/20 bg-destructive/5' : 'border-success/20 bg-success/5'
                      }`}>
                        <div className="flex items-center gap-2">
                          {isError
                            ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                            : <CheckCircle className="w-4 h-4 text-success shrink-0" />}
                          <span className="text-sm">{label}</span>
                        </div>
                        <span className={`text-sm font-bold tabular-nums ${isError ? 'text-destructive' : 'text-success'}`}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Overall status */}
                  <div className={`p-4 rounded-xl border text-center ${
                    (integrityReport.orphan_subscriptions + integrityReport.mismatched_used_count + integrityReport.duplicate_active_subs) > 0
                      ? 'border-destructive/30 bg-destructive/8'
                      : 'border-success/30 bg-success/8'
                  }`}>
                    {(() => {
                      const issues = integrityReport.orphan_subscriptions + integrityReport.mismatched_used_count + integrityReport.duplicate_active_subs;
                      return (
                        <>
                          <p className={`text-sm font-bold ${issues > 0 ? 'text-destructive' : 'text-success'}`}>
                            {issues > 0
                              ? `⚠️ تم اكتشاف ${issues} مشكلة — يُنصح بتشغيل الإصلاح`
                              : '✅ قاعدة البيانات سليمة — جميع العدادات متزامنة'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            آخر فحص: {formatEgyptDateTime(integrityReport.check_time)}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {!integrityLoading && !integrityReport && (
                <EmptyState icon={DatabaseZap} text="اضغط على «تشغيل الفحص» لبدء التحقق من سلامة قاعدة البيانات" />
              )}

              {/* ── فحص الحسابات المفقودة ── */}
              <div className="card-premium p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <UserX className="w-4 h-4 text-destructive" />
                    <p className="text-sm font-bold">فحص الحسابات المفقودة</p>
                  </div>
                  <p className="text-xs text-muted-foreground flex-1">
                    profiles موجودة في DB لكن Auth record محذوف (المستخدم لا يقدر يفتح التطبيق)
                  </p>
                  <Button
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-2 h-9"
                    onClick={async () => {
                      setOrphanLoading(true);
                      setOrphanResult(null);
                      const r = await repairOrphanAccounts();
                      setOrphanLoading(false);
                      if (r.success) setOrphanResult(r);
                      else toast.error(r.error ?? 'فشل الفحص');
                    }}
                    disabled={orphanLoading}
                  >
                    {orphanLoading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Shield className="w-4 h-4" />}
                    فحص الحسابات
                  </Button>
                </div>

                {orphanLoading && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30">
                    <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                    <p className="text-sm text-muted-foreground">جارٍ فحص {'\u0643\u0644'} الحسابات — قد يستغرق دقيقة...</p>
                  </div>
                )}

                {orphanResult && !orphanLoading && (
                  <div className="space-y-3">
                    {/* ملخص */}
                    <div className={`p-4 rounded-xl border text-center ${
                      orphanResult.orphan_count > 0
                        ? 'border-destructive/30 bg-destructive/8'
                        : 'border-success/30 bg-success/8'
                    }`}>
                      <p className={`text-sm font-bold ${orphanResult.orphan_count > 0 ? 'text-destructive' : 'text-success'}`}>
                        {orphanResult.message}
                      </p>
                      <div className="flex justify-center gap-6 mt-2">
                        <span className="text-xs text-muted-foreground">إجمالي: <span className="font-semibold text-foreground">{orphanResult.total_profiles}</span></span>
                        <span className="text-xs text-muted-foreground">سليمة: <span className="font-semibold text-success">{orphanResult.valid_accounts}</span></span>
                        <span className="text-xs text-muted-foreground">مفقودة: <span className="font-semibold text-destructive">{orphanResult.orphan_count}</span></span>
                      </div>
                    </div>

                    {/* قائمة الحسابات المفقودة */}
                    {orphanResult.orphan_count > 0 && (
                      <>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {orphanResult.orphans.map(o => (
                            <div key={o.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-destructive/20 bg-destructive/5">
                              <UserX className="w-3.5 h-3.5 text-destructive shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold">@{o.username ?? '—'}</p>
                                <p className="text-[10px] text-muted-foreground font-mono truncate">{o.email ?? o.id.slice(0, 16) + '...'}</p>
                              </div>
                              <Button size="sm" variant="outline"
                                className="h-7 text-xs border-border gap-1 shrink-0"
                                onClick={() => navigate(`/admin/users/${o.id}`)}>
                                عرض
                              </Button>
                            </div>
                          ))}
                        </div>
                        {/* زر إرسال إشعار للمتضررين */}
                        <Button
                          className="w-full gap-2 h-9"
                          onClick={async () => {
                            setNotifyOrphansLoading(true);
                            const ids = orphanResult.orphans.map(o => o.id);
                            const r = await notifyAffectedUsers(
                              ids,
                              '⚠️ مشكلة في حسابك',
                              'تم رصد مشكلة تقنية في حسابك. يرجى التواصل مع الدعم الفني لاستعادة الوصول إلى حسابك.'
                            );
                            setNotifyOrphansLoading(false);
                            if (r.success) toast.success(r.message);
                            else toast.error(r.error ?? 'فشل الإرسال');
                          }}
                          disabled={notifyOrphansLoading}
                        >
                          {notifyOrphansLoading
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Bell className="w-4 h-4" />}
                          إرسال إشعار للمتضررين ({orphanResult.orphan_count})
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════
              تشخيص التحديثات — Update Diagnostics
          ════════════════════════════════════ */}
          {activeTab === 'update_diag' && (
            <UpdateDiagnosticsPanel />
          )}

          {/* ════════════════════════════════════
              إدارة الكروت — Product Config
          ════════════════════════════════════ */}
          {activeTab === 'server_config' && (
            <ServerConfigTab adminEmail={profile?.email ?? 'admin'} />
          )}

          {activeTab === 'version_center' && (
            <div className="py-8 text-center space-y-4 page-enter">
              <p className="text-muted-foreground text-sm">جارٍ الانتقال إلى مركز الإصدارات...</p>
              <Navigate to="/admin/version-center" replace />
            </div>
          )}

          {activeTab === 'legacy_flex' && (
            <div className="py-8 text-center space-y-4 page-enter">
              <p className="text-muted-foreground text-sm">جارٍ الانتقال إلى أنظمة فليكس...</p>
              <Navigate to="/admin/legacy-flex" replace />
            </div>
          )}

          {activeTab === 'live_monitoring' && (
            <div className="py-8 text-center space-y-4 page-enter">
              <p className="text-muted-foreground text-sm">جارٍ الانتقال إلى المراقبة الحية...</p>
              <Navigate to="/admin/live-monitoring" replace />
            </div>
          )}

          {activeTab === 'crash_logs' && (
            <div className="py-8 text-center space-y-4 page-enter">
              <p className="text-muted-foreground text-sm">جارٍ الانتقال إلى سجلات الأعطال...</p>
              <Navigate to="/admin/crash-logs" replace />
            </div>
          )}

          {activeTab === 'feature_mgmt' && (
            <div className="py-8 text-center space-y-4 page-enter">
              <p className="text-muted-foreground text-sm">جارٍ الانتقال إلى إدارة الميزات...</p>
              <Navigate to="/admin/feature-management" replace />
            </div>
          )}

          {activeTab === 'card_feedbacks' && (
            <div className="py-8 text-center space-y-4 page-enter">
              <p className="text-muted-foreground text-sm">جارٍ الانتقال إلى تقييمات الكروت...</p>
              <Navigate to="/admin/card-feedbacks" replace />
            </div>
          )}

          {activeTab === 'charge_throttles' && (
            <div className="py-8 text-center space-y-4 page-enter">
              <p className="text-muted-foreground text-sm">جارٍ الانتقال إلى سجلات التقييد...</p>
              <Navigate to="/admin/throttle-logs" replace />
            </div>
          )}

          {activeTab === 'duplicate_accounts' && (
            <div className="py-8 text-center space-y-4 page-enter">
              <p className="text-muted-foreground text-sm">جارٍ الانتقال إلى الحسابات المكررة...</p>
              <Navigate to="/admin/duplicate-accounts" replace />
            </div>
          )}

          {activeTab === 'product_config' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Package} title="إدارة الكروت" description="تفعيل وإيقاف وتعديل إعدادات جميع الكروت بدون تحديث APK" />

              <div className="flex items-center gap-2 justify-between flex-wrap">
                <Button size="sm" variant="outline" onClick={loadProductConfig} className="gap-1.5 h-8">
                  <RefreshCw className="w-3.5 h-3.5" /> تحديث
                </Button>
                <p className="text-xs text-muted-foreground">أي تعديل ينعكس فوراً على جميع المستخدمين</p>
              </div>

              {productConfigLoading ? <Spinner /> : (
                <div className="space-y-3">
                  {productConfigs.map(cfg => (
                    <div key={cfg.product_id}
                      className="rounded-2xl border border-border bg-card p-4 space-y-3">
                      {/* ── هيدر الكارت ── */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Package className="w-4 h-4 text-primary shrink-0" />
                          <p className="font-bold text-sm truncate">{cfg.display_name}</p>
                          <span className="text-[10px] font-mono text-muted-foreground">{cfg.product_id}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* بادج الحالة */}
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            cfg.status === 'active'             ? 'bg-success/15 text-success border-success/30' :
                            cfg.status === 'disabled_execution' ? 'bg-warning/15 text-warning border-warning/30' :
                                                                  'bg-destructive/15 text-destructive border-destructive/30'
                          }`}>
                            {cfg.status === 'active'             ? '● نشط' :
                             cfg.status === 'maintenance'        ? '🔧 صيانة' :
                             cfg.status === 'development'        ? '⚙ تطوير' :
                             cfg.status === 'unavailable'        ? '✕ غير متوفر' :
                                                                   '⊘ تنفيذ معطّل'}
                          </span>
                          {/* تبديل الظهور */}
                          <button
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={async () => {
                              await updateProductConfig(cfg.product_id, { is_visible: !cfg.is_visible });
                              loadProductConfig();
                            }}>
                            {cfg.is_visible
                              ? <ToggleOn className="w-5 h-5 text-success" />
                              : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
                            <span className="hidden md:inline">{cfg.is_visible ? 'ظاهر' : 'مخفي'}</span>
                          </button>
                          {/* زر تعديل */}
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={() => setProductConfigEdit({
                              product_id:    cfg.product_id,
                              is_visible:    cfg.is_visible,
                              is_enabled:    cfg.is_enabled,
                              status:        cfg.status,
                              price:         cfg.price ?? undefined,
                              units:         cfg.units ?? undefined,
                              validity:      cfg.validity ?? '',
                              net_balance:   cfg.net_balance ?? undefined,
                              profit_margin: cfg.profit_margin ?? undefined,
                              sort_order:    cfg.sort_order,
                              notes:         cfg.notes ?? '',
                            })}>
                            <Pencil className="w-3 h-3" /> تعديل
                          </Button>
                        </div>
                      </div>

                      {/* ── معلومات سريعة ── */}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {cfg.price    != null && <span>السعر: <strong className="text-foreground">{cfg.price} جنيه</strong></span>}
                        {cfg.units    != null && <span>الوحدات: <strong className="text-foreground">{cfg.units}</strong></span>}
                        {cfg.validity        && <span>الصلاحية: <strong className="text-foreground">{cfg.validity}</strong></span>}
                        {cfg.profit_margin != null && <span>الربح: <strong className="text-success">{cfg.profit_margin} جنيه</strong></span>}
                        <span>الترتيب: <strong className="text-foreground">{cfg.sort_order}</strong></span>
                      </div>

                      {cfg.notes && (
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-1.5">{cfg.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Dialog تعديل الكارت ── */}
              <Dialog open={!!productConfigEdit} onOpenChange={v => { if (!v && !productConfigSaving) setProductConfigEdit(null); }}>
                <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border max-h-[90dvh] overflow-y-auto" dir="rtl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Pencil className="w-4 h-4 text-primary" />
                      تعديل: {productConfigEdit?.product_id}
                    </DialogTitle>
                  </DialogHeader>
                  {productConfigEdit && (
                    <div className="space-y-4 pb-2">
                      {/* الحالة */}
                      <div className="space-y-1.5">
                        <Label className="text-sm">الحالة</Label>
                        <select
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                          value={productConfigEdit.status}
                          onChange={e => setProductConfigEdit(p => p ? { ...p, status: e.target.value as ProductConfig['status'] } : p)}>
                          <option value="active">● نشط — للبيع</option>
                          <option value="disabled_execution">⊘ تعطيل التنفيذ فقط (الكارت ظاهر)</option>
                          <option value="maintenance">🔧 تحت الصيانة</option>
                          <option value="development">⚙ قيد التطوير</option>
                          <option value="unavailable">✕ غير متوفر مؤقتاً</option>
                        </select>
                      </div>
                      {/* الظهور + التفعيل */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
                          <Label className="text-xs">ظاهر</Label>
                          <button onClick={() => setProductConfigEdit(p => p ? { ...p, is_visible: !p.is_visible } : p)}>
                            {productConfigEdit.is_visible
                              ? <ToggleOn className="w-6 h-6 text-success" />
                              : <ToggleOff className="w-6 h-6 text-muted-foreground" />}
                          </button>
                        </div>
                        <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
                          <Label className="text-xs">مفعّل</Label>
                          <button onClick={() => setProductConfigEdit(p => p ? { ...p, is_enabled: !p.is_enabled } : p)}>
                            {productConfigEdit.is_enabled
                              ? <ToggleOn className="w-6 h-6 text-success" />
                              : <ToggleOff className="w-6 h-6 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                      {/* السعر والوحدات */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">السعر (جنيه)</Label>
                          <Input type="number" value={productConfigEdit.price ?? ''} className="h-9"
                            onChange={e => setProductConfigEdit(p => p ? { ...p, price: Number(e.target.value) } : p)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">الوحدات</Label>
                          <Input type="number" value={productConfigEdit.units ?? ''} className="h-9"
                            onChange={e => setProductConfigEdit(p => p ? { ...p, units: Number(e.target.value) } : p)} />
                        </div>
                      </div>
                      {/* الصلاحية والربح */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">مدة الصلاحية</Label>
                          <Input value={productConfigEdit.validity ?? ''} className="h-9"
                            onChange={e => setProductConfigEdit(p => p ? { ...p, validity: e.target.value } : p)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">الربح (جنيه)</Label>
                          <Input type="number" value={productConfigEdit.profit_margin ?? ''} className="h-9"
                            onChange={e => setProductConfigEdit(p => p ? { ...p, profit_margin: Number(e.target.value) } : p)} />
                        </div>
                      </div>
                      {/* الترتيب */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">ترتيب الظهور</Label>
                        <Input type="number" value={productConfigEdit.sort_order ?? 0} className="h-9"
                          onChange={e => setProductConfigEdit(p => p ? { ...p, sort_order: Number(e.target.value) } : p)} />
                      </div>
                      {/* ملاحظات */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">ملاحظات داخلية</Label>
                        <Textarea rows={2} value={productConfigEdit.notes ?? ''} className="resize-none text-sm"
                          onChange={e => setProductConfigEdit(p => p ? { ...p, notes: e.target.value } : p)} />
                      </div>
                      {/* أزرار */}
                      <div className="flex gap-2 pt-1">
                        <Button className="flex-1 h-10 gap-1.5" onClick={handleSaveProductConfig} disabled={productConfigSaving}>
                          {productConfigSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          حفظ التغييرات
                        </Button>
                        <Button variant="outline" className="h-10 gap-1" onClick={() => setProductConfigEdit(null)} disabled={productConfigSaving}>
                          <XIcon className="w-4 h-4" /> إلغاء
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              قسم: إدارة كروت الشحن من الرصيد — نظام مستقل جديد
              ══════════════════════════════════════════════════════ */}
          {activeTab === 'balance_products' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Banknote} title="كروت الشحن من الرصيد" description="إدارة كروت نظام أنا فودافون — مستقل تماماً عن كروت VF Cash" />

              <div className="flex items-center gap-2 justify-between flex-wrap">
                <Button size="sm" variant="outline" onClick={loadBalanceProds} className="gap-1.5 h-8">
                  <RefreshCw className="w-3.5 h-3.5" /> تحديث
                </Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={() => { setBalanceProdNew(true); setBalanceProdEdit({ category: 'fakka', is_visible: true, is_enabled: true, price: 0, net_balance: 0, units: 0, product_type: 'وحدة', validity: 'صالح 24 ساعة', sort_order: 0 }); }}>
                  <Plus className="w-3.5 h-3.5" /> إضافة كارت جديد
                </Button>
              </div>

              {balanceProdsLoading ? <Spinner /> : (
                <div className="space-y-3">
                  {balanceProds.map(prod => (
                    <div key={prod.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                      {/* هيدر */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Banknote className="w-4 h-4 text-primary shrink-0" />
                          <p className="font-bold text-sm truncate">{prod.display_name}</p>
                          <span className="text-[10px] font-mono text-muted-foreground">{prod.product_id}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {/* بادج الحالة */}
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            prod.is_enabled && prod.is_visible ? 'bg-success/15 text-success border-success/30' :
                            !prod.is_enabled ? 'bg-destructive/15 text-destructive border-destructive/30' :
                            'bg-warning/15 text-warning border-warning/30'
                          }`}>
                            {prod.is_enabled && prod.is_visible ? '● نشط' : !prod.is_enabled ? '⊘ معطّل' : '◉ مخفي'}
                          </span>
                          {/* تبديل الظهور */}
                          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={async () => { await supabase.from('balance_products').update({ is_visible: !prod.is_visible }).eq('id', prod.id); loadBalanceProds(); }}>
                            {prod.is_visible ? <ToggleOn className="w-5 h-5 text-success" /> : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
                          </button>
                          {/* تعديل */}
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={() => { setBalanceProdNew(false); setBalanceProdEdit({ ...prod }); }}>
                            <Pencil className="w-3 h-3" /> تعديل
                          </Button>
                          {/* حذف */}
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => setBalanceProdDeleteTarget(prod)}>
                            <Trash2 className="w-3 h-3" /> حذف
                          </Button>
                        </div>
                      </div>

                      {/* معلومات سريعة */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        {[
                          { label: 'السعر',    value: `${prod.price} جنيه` },
                          { label: 'صافي',     value: `${prod.net_balance} جنيه` },
                          { label: 'الوحدات',  value: `${prod.units} ${prod.product_type}` },
                          { label: 'الصلاحية', value: prod.validity },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-muted/30 rounded-lg px-2.5 py-1.5">
                            <p className="text-[10px] text-muted-foreground">{label}</p>
                            <p className="font-semibold truncate">{value}</p>
                          </div>
                        ))}
                      </div>

                      {/* إحصاء الاستخدام */}
                      <div className="flex gap-3 text-[11px] pt-1 flex-wrap">
                        <span className="text-muted-foreground">مجموع: <strong>{prod.usage_count}</strong></span>
                        <span className="text-success">نجاح: <strong>{prod.success_count}</strong></span>
                        <span className="text-destructive">فشل: <strong>{prod.fail_count}</strong></span>
                        {prod.usage_count > 0 && (
                          <span className="text-muted-foreground">
                            نسبة النجاح: <strong>{Math.round((prod.success_count / prod.usage_count) * 100)}%</strong>
                          </span>
                        )}
                        {prod.last_used_at && (
                          <span className="text-muted-foreground">
                            آخر استخدام: <strong>{formatEgyptDate(prod.last_used_at)}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {balanceProds.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-sm">لا توجد كروت — أضف كارتاً جديداً</div>
                  )}
                </div>
              )}

              {/* Dialog تعديل / إضافة */}
              <Dialog open={!!balanceProdEdit} onOpenChange={v => { if (!v && !balanceProdSaving) { setBalanceProdEdit(null); setBalanceProdNew(false); } }}>
                <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="text-sm font-black flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-primary" />
                      {balanceProdNew ? 'إضافة كارت جديد' : `تعديل: ${balanceProdEdit?.display_name}`}
                    </DialogTitle>
                  </DialogHeader>
                  {balanceProdEdit && (
                    <div className="space-y-3 pt-1">
                      {/* Product ID */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Product ID <span className="text-destructive">*</span></Label>
                        <Input value={balanceProdEdit.product_id ?? ''} className="h-9 font-mono text-xs"
                          placeholder="Fakka_10_Unite"
                          disabled={!balanceProdNew}
                          onChange={e => setBalanceProdEdit(p => p ? { ...p, product_id: e.target.value } : p)} />
                      </div>
                      {/* اسم الإدارة */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">الاسم الكامل (للإدارة)</Label>
                        <Input value={balanceProdEdit.name ?? ''} className="h-9"
                          onChange={e => setBalanceProdEdit(p => p ? { ...p, name: e.target.value } : p)} />
                      </div>
                      {/* اسم العرض */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">اسم العرض (للمستخدم)</Label>
                        <Input value={balanceProdEdit.display_name ?? ''} className="h-9"
                          onChange={e => setBalanceProdEdit(p => p ? { ...p, display_name: e.target.value } : p)} />
                      </div>
                      {/* الفئة */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">الفئة</Label>
                        <Select value={balanceProdEdit.category ?? 'fakka'}
                          onValueChange={v => setBalanceProdEdit(p => p ? { ...p, category: v } : p)}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fakka">فكة</SelectItem>
                            <SelectItem value="mared">مارد</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* السعر + صافي */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">السعر (جنيه)</Label>
                          <Input type="number" value={balanceProdEdit.price ?? 0} className="h-9"
                            onChange={e => setBalanceProdEdit(p => p ? { ...p, price: Number(e.target.value) } : p)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">السعر الصافي (جنيه)</Label>
                          <Input type="number" value={balanceProdEdit.net_balance ?? 0} className="h-9"
                            onChange={e => setBalanceProdEdit(p => p ? { ...p, net_balance: Number(e.target.value) } : p)} />
                        </div>
                      </div>
                      {/* الوحدات + النوع */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">الوحدات</Label>
                          <Input type="number" value={balanceProdEdit.units ?? 0} className="h-9"
                            onChange={e => setBalanceProdEdit(p => p ? { ...p, units: Number(e.target.value) } : p)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">نوع الوحدة</Label>
                          <Select value={balanceProdEdit.product_type ?? 'وحدة'}
                            onValueChange={v => setBalanceProdEdit(p => p ? { ...p, product_type: v } : p)}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="وحدة">وحدة</SelectItem>
                              <SelectItem value="دقايق">دقايق</SelectItem>
                              <SelectItem value="فليكس">فليكس</SelectItem>
                              <SelectItem value="سوشيال">سوشيال</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* الصلاحية */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">مدة الصلاحية</Label>
                        <Input value={balanceProdEdit.validity ?? ''} className="h-9"
                          placeholder="صالح 24 ساعة"
                          onChange={e => setBalanceProdEdit(p => p ? { ...p, validity: e.target.value } : p)} />
                      </div>
                      {/* ظهور + تفعيل + ترتيب */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">الترتيب</Label>
                          <Input type="number" value={balanceProdEdit.sort_order ?? 0} className="h-9"
                            onChange={e => setBalanceProdEdit(p => p ? { ...p, sort_order: Number(e.target.value) } : p)} />
                        </div>
                        <div className="flex flex-col items-center gap-1.5 pt-1">
                          <Label className="text-xs">ظاهر</Label>
                          <button onClick={() => setBalanceProdEdit(p => p ? { ...p, is_visible: !p.is_visible } : p)}>
                            {balanceProdEdit.is_visible ? <ToggleOn className="w-6 h-6 text-success" /> : <ToggleOff className="w-6 h-6 text-muted-foreground" />}
                          </button>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 pt-1">
                          <Label className="text-xs">مفعّل</Label>
                          <button onClick={() => setBalanceProdEdit(p => p ? { ...p, is_enabled: !p.is_enabled } : p)}>
                            {balanceProdEdit.is_enabled ? <ToggleOn className="w-6 h-6 text-success" /> : <ToggleOff className="w-6 h-6 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                      {/* ملاحظات */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">ملاحظات</Label>
                        <Textarea rows={2} value={balanceProdEdit.notes ?? ''} className="resize-none text-sm"
                          onChange={e => setBalanceProdEdit(p => p ? { ...p, notes: e.target.value } : p)} />
                      </div>
                      {/* أزرار */}
                      <div className="flex gap-2 pt-1">
                        <Button className="flex-1 h-10 gap-1.5" onClick={handleSaveBalanceProd} disabled={balanceProdSaving}>
                          {balanceProdSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          {balanceProdNew ? 'إضافة الكارت' : 'حفظ التغييرات'}
                        </Button>
                        <Button variant="outline" className="h-10 gap-1" onClick={() => { setBalanceProdEdit(null); setBalanceProdNew(false); }} disabled={balanceProdSaving}>
                          <XIcon className="w-4 h-4" /> إلغاء
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              {/* AlertDialog حذف */}
              <AlertDialog open={!!balanceProdDeleteTarget} onOpenChange={v => { if (!v) setBalanceProdDeleteTarget(null); }}>
                <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                    <AlertDialogDescription>
                      هل أنت متأكد من حذف كارت <strong>{balanceProdDeleteTarget?.display_name}</strong>؟
                      <br />هذا الإجراء لا يمكن التراجع عنه.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
                      onClick={() => balanceProdDeleteTarget && handleDeleteBalanceProd(balanceProdDeleteTarget)}>
                      حذف نهائياً
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* ════════════════════════════════════
              التجار — Phase 4 Merchant Management
          ════════════════════════════════════ */}
          {activeTab === 'merchants' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Building2} title="إدارة التجار" description="ترقية المستخدمين وإدارة صلاحيات التجار — Additive Only"
                count={merchants.length}
                action={
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs"
                      onClick={() => { setActiveTab('users'); }}>
                      <Users className="w-3.5 h-3.5" /> ترقية مستخدم
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadMerchants} className="gap-1.5 h-9">
                      <RefreshCw className="w-3.5 h-3.5" /> تحديث
                    </Button>
                  </div>
                }
              />

              {/* Empty state */}
              {merchants.length === 0 && !merchantsLoading && (
                <div className="py-16 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                    <Building2 className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">لا يوجد تجار مسجلون حتى الآن</p>
                  <p className="text-xs text-muted-foreground">لترقية مستخدم إلى تاجر، اذهب إلى تبويب المستخدمون</p>
                </div>
              )}

              {merchantsLoading && (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-muted rounded-2xl animate-pulse" />)}</div>
              )}

              {!merchantsLoading && merchants.length > 0 && (
                <div className="space-y-3">
                  {merchants.map(m => {
                    const statusColors: Record<MerchantStatus, string> = {
                      active:    'bg-success/10 text-success border-success/20',
                      suspended: 'bg-warning/10 text-warning border-warning/20',
                      disabled:  'bg-muted text-muted-foreground border-border',
                      blocked:   'bg-destructive/10 text-destructive border-destructive/20',
                      deleted:   'bg-destructive/10 text-destructive border-destructive/20',
                    };
                    const statusLabels: Record<MerchantStatus, string> = {
                      active: 'نشط', suspended: 'موقوف', disabled: 'معطل', blocked: 'محظور', deleted: 'محذوف',
                    };
                    const inviteLink = generateMerchantInviteLink(m.invite_code);
                    const mFull = m as MerchantFull;
                    return (
                      <div key={m.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        {/* ── رأس البطاقة ── */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                              <Building2 className="w-4 h-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm truncate">{m.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{m.id.slice(0, 16)}…</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusColors[m.status]}`}>
                              {statusLabels[m.status]}
                            </span>
                            {/* Invite status badge */}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                              mFull.invite_status === 'active'
                                ? 'bg-success/10 text-success border-success/20'
                                : mFull.invite_status === 'disabled'
                                ? 'bg-muted text-muted-foreground border-border'
                                : 'bg-destructive/10 text-destructive border-destructive/20'
                            }`}>
                              {mFull.invite_status === 'active' ? '🔗 دعوة نشطة' : mFull.invite_status === 'disabled' ? '⛔ دعوة معطلة' : '⏱ منتهية'}
                            </span>
                          </div>
                        </div>

                        {/* ── إحصائيات ── */}
                        <div className="grid grid-cols-5 gap-2 text-center">
                          {[
                            { label: 'نقاط كلية',    val: m.total_points },
                            { label: 'مستخدمة',       val: m.used_points },
                            { label: 'متبقية',        val: m.total_points - m.used_points },
                            { label: 'المستخدمون',    val: mFull.users_count ?? 0 },
                            { label: 'نشطون',         val: mFull.active_users ?? 0 },
                          ].map(({ label, val }) => (
                            <div key={label} className="rounded-xl bg-muted/60 p-2">
                              <p className="text-xs font-bold tabular-nums">{val}</p>
                              <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                            </div>
                          ))}
                        </div>

                        {/* ── رابط الدعوة ── */}
                        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                          <p className="flex-1 min-w-0 text-[10px] font-mono text-muted-foreground truncate">{inviteLink}</p>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0"
                            onClick={async () => {
                              await navigator.clipboard.writeText(inviteLink);
                              setCopiedInvite(m.id);
                              toast.success('تم نسخ رابط الدعوة');
                              setTimeout(() => setCopiedInvite(null), 2500);
                            }}>
                            {copiedInvite === m.id
                              ? <CheckCircle className="w-3 h-3 text-success" />
                              : <Copy className="w-3 h-3 text-muted-foreground" />}
                          </Button>
                        </div>

                        {/* ── أزرار التحكم في الدعوة ── */}
                        <div className="flex flex-wrap gap-1.5 border-t border-border/30 pt-2">
                          <p className="w-full text-[10px] text-muted-foreground mb-0.5">🔗 إدارة الدعوة:</p>
                          {mFull.invite_status !== 'active' && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-success border-success/30"
                              onClick={async () => {
                                const r = await updateMerchantInviteStatus(m.id, 'active', profile?.id);
                                if (r.success) { toast.success('تم تفعيل الدعوة'); loadMerchants(); }
                                else toast.error(r.error ?? 'خطأ');
                              }}>
                              <ToggleRight className="w-3 h-3" /> تفعيل
                            </Button>
                          )}
                          {mFull.invite_status === 'active' && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                              onClick={async () => {
                                const r = await updateMerchantInviteStatus(m.id, 'disabled', profile?.id);
                                if (r.success) { toast.success('تم تعطيل الدعوة'); loadMerchants(); }
                                else toast.error(r.error ?? 'خطأ');
                              }}>
                              <ToggleLeft className="w-3 h-3" /> تعطيل
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-warning border-warning/30"
                            onClick={async () => {
                              const r = await updateMerchantInviteStatus(m.id, 'expired', profile?.id);
                              if (r.success) { toast.success('تم إنهاء صلاحية الدعوة'); loadMerchants(); }
                              else toast.error(r.error ?? 'خطأ');
                            }}>
                            <Timer className="w-3 h-3" /> إنهاء
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-primary border-primary/30"
                            onClick={async () => {
                              const res = await regenerateInviteCode(m.id);
                              if (res.success) { toast.success('تم توليد رابط جديد ✅'); loadMerchants(); }
                              else toast.error(res.error ?? 'فشل إعادة التوليد');
                            }}>
                            <RotateCcw className="w-3 h-3" /> تجديد
                          </Button>
                        </div>

                        {/* ── أزرار حالة التاجر + عرض التفاصيل ── */}
                        <div className="flex flex-wrap gap-1.5 border-t border-border/30 pt-2">
                          <p className="w-full text-[10px] text-muted-foreground mb-0.5">🏪 حالة التاجر:</p>
                          {(['active', 'suspended', 'disabled', 'blocked'] as MerchantStatus[])
                            .filter(s => s !== m.status)
                            .map(s => (
                              <Button key={s} variant="outline" size="sm"
                                className={`h-7 text-xs gap-1 ${s === 'blocked' ? 'text-destructive border-destructive/20' : ''}`}
                                onClick={async () => {
                                  const r = await updateMerchantStatusAdmin(m.id, s, profile?.id);
                                  if (r.success) { toast.success(`تم تغيير الحالة إلى: ${statusLabels[s]}`); loadMerchants(); }
                                  else toast.error(r.error ?? 'خطأ');
                                }}>
                                {statusLabels[s]}
                              </Button>
                            ))}
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 mr-auto text-primary border-primary/30"
                            onClick={() => navigate(`/admin/merchants/${m.id}`)}>
                            <ChevronRight className="w-3 h-3" /> تفاصيل
                          </Button>
                        </div>
                        {/* Phase 7: لوحة الدعوة — Additive */}
                        <AdminInvitePanel merchantId={m.id} adminId={profile?.id} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              Phase 6: أعضاء التجار — مراقبة شاملة
          ════════════════════════════════════ */}
          {activeTab === 'member_monitor' && (
            <div className="page-enter">
              <AdminMembersMonitor />
            </div>
          )}

          {/* ════════════════════════════════════════════════
              باقات Vodafone RED — PHASE 1-5 إدارة ديناميكية
              ════════════════════════════════════════════════ */}
          {activeTab === 'red_packages' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Package} title="باقات Vodafone RED"
                description="إنشاء وتعديل وإدارة جميع باقات RED ديناميكياً — بدون تعديل الكود"
                count={redPackages.length}
                action={
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={loadRedPackages} className="gap-1.5 h-8">
                      <RefreshCw className="w-3.5 h-3.5" /> تحديث
                    </Button>
                    <Button size="sm" className="gap-1.5 h-8" onClick={() => {
                      setRedPkgIsNew(true);
                      setRedPkgEdit({
                        name: '', description: '', data_gb: 20, minutes: 1500,
                        base_price: 100, discounted_price: null, status: 'available',
                        sort_order: redPackages.length + 1, is_visible: true,
                        subscription_enabled: true, whatsapp_link: '', terms: [],
                        features: [], requirements: [], subscription_method: '',
                        image_url: '', color_primary: '#E60000', color_secondary: '#B30000',
                        badge_label: '',
                      });
                    }}>
                      <Plus className="w-3.5 h-3.5" /> باقة جديدة
                    </Button>
                  </div>
                }
              />

              {redPkgsLoading ? <Spinner /> : redPackages.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  لا توجد باقات — اضغط "باقة جديدة" لإضافة أول باقة
                </div>
              ) : (
                <div className="space-y-3">
                  {redPackages.map(pkg => {
                    const { pct, currentPrice, originalPrice } = calcPackageDiscount(pkg);
                    const statusColors: Record<string, string> = {
                      available: 'text-green-400 bg-green-400/10 border-green-400/30',
                      featured:  'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
                      coming_soon:'text-purple-400 bg-purple-400/10 border-purple-400/30',
                      disabled:  'text-muted-foreground bg-muted border-border',
                    };
                    const statusLabels: Record<string, string> = {
                      available: 'متاحة', featured: 'مميزة', coming_soon: 'قريباً', disabled: 'معطّلة',
                    };
                    return (
                      <div key={pkg.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: 'rgba(230,0,0,0.15)', border: '1.5px solid rgba(230,0,0,0.35)' }}>
                              <span className="text-xs font-black" style={{ color: '#E60000' }}>VF</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm truncate">{pkg.name}</p>
                              {pkg.badge_label && (
                                <span className="text-[10px] text-muted-foreground">{pkg.badge_label}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusColors[pkg.status] ?? ''}`}>
                              {statusLabels[pkg.status] ?? pkg.status}
                            </span>
                            <button
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={async () => {
                                await adminUpdateRedPackage(pkg.id, { is_visible: !pkg.is_visible });
                                loadRedPackages();
                              }}>
                              {pkg.is_visible
                                ? <ToggleOn  className="w-5 h-5 text-green-400" />
                                : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
                            </button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => { setRedPkgIsNew(false); setRedPkgEdit({ ...pkg }); }}>
                              <Pencil className="w-3 h-3" /> تعديل
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => setRedPkgDeleteTarget(pkg)}>
                              <Trash2 className="w-3 h-3" /> حذف
                            </Button>
                          </div>
                        </div>
                        {/* تفاصيل */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          {[
                            { label: 'الإنترنت',   value: `${pkg.data_gb} GB` },
                            { label: 'الدقائق',    value: `${pkg.minutes}` },
                            { label: 'السعر',      value: `${currentPrice} جنيه` },
                            { label: 'الخصم',      value: pct > 0 ? `${pct}% (${originalPrice}→${currentPrice})` : 'لا يوجد' },
                          ].map(({ label, value }) => (
                            <div key={label} className="bg-muted/30 rounded-lg px-2.5 py-1.5">
                              <p className="text-[10px] text-muted-foreground">{label}</p>
                              <p className="font-semibold truncate">{value}</p>
                            </div>
                          ))}
                        </div>
                        {pkg.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">{pkg.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── حوار تعديل / إنشاء باقة ── */}
              <Dialog open={!!redPkgEdit} onOpenChange={v => { if (!v && !redPkgSaving) setRedPkgEdit(null); }}>
                <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border overflow-y-auto max-h-[90dvh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      {redPkgIsNew ? 'إضافة باقة جديدة' : 'تعديل الباقة'}
                    </DialogTitle>
                  </DialogHeader>
                  {redPkgEdit && (
                    <div className="space-y-5 mt-2">

                      {/* ── القسم 1: المعلومات الأساسية ── */}
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">المعلومات الأساسية</p>
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">اسم الباقة *</Label>
                              <Input value={redPkgEdit.name ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, name: e.target.value } : p)} placeholder="مثال: RED 20" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">اسم الشبكة</Label>
                              <Input value={redPkgEdit.network_name ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, network_name: e.target.value } : p)} placeholder="مثال: Vodafone" />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">وسام البادج</Label>
                              <Input value={redPkgEdit.badge_label ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, badge_label: e.target.value } : p)} placeholder="مثال: الأكثر طلباً" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">أيقونة الباقة</Label>
                              <Input value={redPkgEdit.icon ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, icon: e.target.value } : p)} placeholder="wifi / phone / star" />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">الوصف المختصر</Label>
                            <Input value={redPkgEdit.short_description ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, short_description: e.target.value } : p)} placeholder="وصف قصير يظهر على الكارت" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">الوصف الكامل</Label>
                            <Textarea rows={2} value={redPkgEdit.full_description ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, full_description: e.target.value } : p)} placeholder="وصف تفصيلي كامل يظهر في صفحة التفاصيل" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">الوصف (عام)</Label>
                            <Textarea rows={2} value={redPkgEdit.description ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, description: e.target.value } : p)} placeholder="وصف عام للباقة" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">رابط صورة الباقة</Label>
                            <Input value={redPkgEdit.image_url ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, image_url: e.target.value } : p)} placeholder="https://..." />
                          </div>
                        </div>
                      </div>

                      {/* ── القسم 2: البيانات الرقمية ── */}
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">البيانات الرقمية</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">الإنترنت (GB)</Label>
                            <Input type="number" min="0" value={redPkgEdit.data_gb ?? 0} onChange={e => setRedPkgEdit(p => p ? { ...p, data_gb: +e.target.value } : p)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">الدقائق</Label>
                            <Input type="number" min="0" value={redPkgEdit.minutes ?? 0} onChange={e => setRedPkgEdit(p => p ? { ...p, minutes: +e.target.value } : p)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">السعر الأساسي</Label>
                            <Input type="number" min="0" step="0.01" value={redPkgEdit.base_price ?? 0} onChange={e => setRedPkgEdit(p => p ? { ...p, base_price: +e.target.value } : p)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">السعر بعد الخصم</Label>
                            <Input type="number" min="0" step="0.01" placeholder="فارغ = بدون خصم"
                              value={redPkgEdit.discounted_price ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, discounted_price: e.target.value === '' ? null : +e.target.value } : p)} />
                          </div>
                        </div>
                        {(redPkgEdit.base_price ?? 0) > 0 && (redPkgEdit.discounted_price ?? 0) > 0 && (
                          <div className="rounded-xl px-3 py-2 text-xs flex flex-wrap gap-4 mt-2"
                            style={{ background: 'rgba(0,200,150,0.08)', border: '1px solid rgba(0,200,150,0.20)' }}>
                            {(() => {
                              const orig = redPkgEdit.base_price ?? 0;
                              const disc = redPkgEdit.discounted_price ?? orig;
                              const pct  = orig > 0 ? Math.round(((orig - disc) / orig) * 100) : 0;
                              return <>
                                <span className="text-muted-foreground">السعر الحالي: <strong className="text-foreground">{disc} جنيه</strong></span>
                                <span className="text-muted-foreground">الخصم: <strong style={{ color: '#00C896' }}>{pct}%</strong></span>
                                <span className="text-muted-foreground">التوفير: <strong style={{ color: '#00C896' }}>{orig - disc} جنيه</strong></span>
                              </>;
                            })()}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div className="space-y-1">
                            <Label className="text-xs">مدة الباقة</Label>
                            <Input value={redPkgEdit.duration ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, duration: e.target.value } : p)} placeholder="مثال: شهر / 30 يوم" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">نوع التجديد</Label>
                            <Input value={redPkgEdit.renewal_type ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, renewal_type: e.target.value } : p)} placeholder="مثال: تجديد تلقائي" />
                          </div>
                        </div>
                      </div>

                      {/* ── القسم 3: الإعدادات ── */}
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">الإعدادات والترتيب</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">الحالة</Label>
                            <Select value={redPkgEdit.status ?? 'available'} onValueChange={v => setRedPkgEdit(p => p ? { ...p, status: v as RedPackage['status'] } : p)}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="available">متاحة</SelectItem>
                                <SelectItem value="featured">مميزة</SelectItem>
                                <SelectItem value="coming_soon">قريباً</SelectItem>
                                <SelectItem value="disabled">معطّلة</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">ترتيب الظهور</Label>
                            <Input type="number" min="0" value={redPkgEdit.sort_order ?? 0} onChange={e => setRedPkgEdit(p => p ? { ...p, sort_order: +e.target.value } : p)} />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mt-3">
                          <button className="flex items-center gap-2" onClick={() => setRedPkgEdit(p => p ? { ...p, is_visible: !p.is_visible } : p)}>
                            {redPkgEdit.is_visible ? <ToggleOn className="w-5 h-5 text-green-400" /> : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
                            <span className="text-xs">{redPkgEdit.is_visible ? 'ظاهرة' : 'مخفية'}</span>
                          </button>
                          <button className="flex items-center gap-2" onClick={() => setRedPkgEdit(p => p ? { ...p, subscription_enabled: !p.subscription_enabled } : p)}>
                            {redPkgEdit.subscription_enabled ? <ToggleOn className="w-5 h-5 text-primary" /> : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
                            <span className="text-xs">{redPkgEdit.subscription_enabled ? 'الاشتراك مفعّل' : 'الاشتراك معطّل'}</span>
                          </button>
                        </div>
                      </div>

                      {/* ── القسم 4: الألوان ── */}
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">الألوان</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { label: 'لون الكارت',    key: 'card_color',      def: '#E60000' },
                            { label: 'لون الخلفية',   key: 'bg_color',        def: '#1a0000' },
                            { label: 'لون الأزرار',   key: 'btn_color',       def: '#E60000' },
                            { label: 'لون النصوص',    key: 'text_color',      def: '#ffffff' },
                            { label: 'لون رئيسي',     key: 'color_primary',   def: '#E60000' },
                            { label: 'لون ثانوي',     key: 'color_secondary', def: '#B30000' },
                          ].map(({ label, key, def }) => (
                            <div key={key} className="space-y-1">
                              <Label className="text-[10px]">{label}</Label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={(redPkgEdit as Record<string,string>)[key] ?? def}
                                  onChange={e => setRedPkgEdit(p => p ? { ...p, [key]: e.target.value } : p)}
                                  className="w-8 h-8 rounded cursor-pointer border border-border p-0.5 bg-transparent"
                                />
                                <Input
                                  className="h-8 text-xs font-mono flex-1"
                                  value={(redPkgEdit as Record<string,string>)[key] ?? def}
                                  onChange={e => setRedPkgEdit(p => p ? { ...p, [key]: e.target.value } : p)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── القسم 5: واتساب ── */}
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">إعدادات واتساب</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">رقم واتساب</Label>
                            <Input value={redPkgEdit.whatsapp_number ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, whatsapp_number: e.target.value } : p)} placeholder="مثال: 201012345678" dir="ltr" />
                            <p className="text-[9px] text-muted-foreground">بدون + — يُستخدم لبناء رابط wa.me تلقائياً</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">رابط واتساب مخصص (اختياري)</Label>
                            <Input value={redPkgEdit.whatsapp_link ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, whatsapp_link: e.target.value } : p)} placeholder="https://wa.me/..." dir="ltr" />
                          </div>
                        </div>
                        <div className="space-y-1 mt-3">
                          <Label className="text-xs">رسالة قبل الاشتراك</Label>
                          <Textarea rows={2} value={redPkgEdit.pre_subscription_msg ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, pre_subscription_msg: e.target.value } : p)} placeholder="تنبيه يظهر للمستخدم قبل إرسال الطلب" />
                        </div>
                        <div className="space-y-1 mt-3">
                          <Label className="text-xs">رسالة بعد الاشتراك</Label>
                          <Textarea rows={2} value={redPkgEdit.post_subscription_msg ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, post_subscription_msg: e.target.value } : p)} placeholder="رسالة نجاح تظهر بعد الإرسال" />
                        </div>
                      </div>

                      {/* ── القسم 6: المحتوى ── */}
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">المحتوى والشروط</p>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs">المميزات (سطر لكل ميزة)</Label>
                            <Textarea rows={3} value={(redPkgEdit.features ?? []).join('\n')}
                              onChange={e => setRedPkgEdit(p => p ? { ...p, features: e.target.value.split('\n').filter(Boolean) } : p)}
                              placeholder="20 جيجا عالي السرعة&#10;1500 دقيقة&#10;..." />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">المتطلبات (سطر لكل متطلب)</Label>
                            <Textarea rows={2} value={(redPkgEdit.requirements ?? []).join('\n')}
                              onChange={e => setRedPkgEdit(p => p ? { ...p, requirements: e.target.value.split('\n').filter(Boolean) } : p)}
                              placeholder="خط فردي مسجل باسمك&#10;..." />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">شروط الاشتراك (سطر لكل شرط)</Label>
                            <Textarea rows={3} value={(redPkgEdit.terms ?? []).join('\n')}
                              onChange={e => setRedPkgEdit(p => p ? { ...p, terms: e.target.value.split('\n').filter(Boolean) } : p)}
                              placeholder="الخط يكون أفراد&#10;يكون مسجل باسمك&#10;..." />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">طريقة الاشتراك</Label>
                            <Textarea rows={2} value={redPkgEdit.subscription_method ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, subscription_method: e.target.value } : p)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">تعليمات الاشتراك التفصيلية</Label>
                            <Textarea rows={3} value={redPkgEdit.subscription_instructions ?? ''} onChange={e => setRedPkgEdit(p => p ? { ...p, subscription_instructions: e.target.value } : p)} placeholder="خطوات تفصيلية لعملية الاشتراك" />
                          </div>
                        </div>
                      </div>

                      {/* ── القسم 7: إظهار/إخفاء العناصر ── */}
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">إظهار / إخفاء العناصر</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {([
                            { key: 'gb',           label: 'الجيجا' },
                            { key: 'minutes',      label: 'الدقائق' },
                            { key: 'duration',     label: 'مدة الباقة' },
                            { key: 'renewal',      label: 'نوع التجديد' },
                            { key: 'features',     label: 'المميزات' },
                            { key: 'requirements', label: 'المتطلبات' },
                            { key: 'terms',        label: 'الشروط' },
                            { key: 'instructions', label: 'التعليمات' },
                            { key: 'pre_msg',      label: 'رسالة قبل' },
                            { key: 'post_msg',     label: 'رسالة بعد' },
                          ] as { key: keyof NonNullable<typeof redPkgEdit['show_fields']>; label: string }[]).map(({ key, label }) => {
                            const sf  = redPkgEdit.show_fields ?? {};
                            const val = (sf as Record<string, boolean>)[key] !== false;
                            return (
                              <button key={key}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors text-left"
                                style={{ background: val ? 'rgba(0,200,150,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${val ? 'rgba(0,200,150,0.25)' : 'rgba(255,255,255,0.08)'}` }}
                                onClick={() => setRedPkgEdit(p => {
                                  if (!p) return p;
                                  const cur = { ...(p.show_fields ?? {}) } as Record<string, boolean>;
                                  cur[key as string] = !val;
                                  return { ...p, show_fields: cur as unknown as RedPackage['show_fields'] };
                                })}>
                                {val ? <ToggleOn className="w-4 h-4 shrink-0 text-green-400" /> : <ToggleOff className="w-4 h-4 shrink-0 text-muted-foreground" />}
                                <span className="text-[11px]">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  )}
                  <DialogFooter className="mt-4 gap-2">
                    <Button className="flex-1 h-10 gap-1.5" onClick={handleSaveRedPackage} disabled={redPkgSaving}>
                      {redPkgSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {redPkgIsNew ? 'إنشاء الباقة' : 'حفظ التعديلات'}
                    </Button>
                    <Button variant="outline" className="h-10" onClick={() => setRedPkgEdit(null)} disabled={redPkgSaving}>
                      <XIcon className="w-4 h-4" /> إلغاء
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* ── حوار حذف الباقة ── */}
              <AlertDialog open={!!redPkgDeleteTarget} onOpenChange={v => { if (!v) setRedPkgDeleteTarget(null); }}>
                <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>حذف الباقة</AlertDialogTitle>
                    <AlertDialogDescription>
                      هل أنت متأكد من حذف باقة <strong>{redPkgDeleteTarget?.name}</strong>؟ لا يمكن التراجع.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        if (!redPkgDeleteTarget) return;
                        await adminDeleteRedPackage(redPkgDeleteTarget.id);
                        toast.success('تم حذف الباقة');
                        setRedPkgDeleteTarget(null);
                        loadRedPackages();
                      }}>
                      حذف
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              العروض والبانرات — PHASE 8-14 نظام العروض الذكي
              ════════════════════════════════════════════════ */}
          {activeTab === 'promotions' && (
            <div className="space-y-5 page-enter">
              <SectionHeader icon={Tag} title="العروض والبانرات"
                description="إنشاء وإدارة العروض التي تظهر في البانر الرئيسي — تحكم كامل في التكرار والإغلاق"
                count={promotions.length}
                action={
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={loadPromotions} className="gap-1.5 h-8">
                      <RefreshCw className="w-3.5 h-3.5" /> تحديث
                    </Button>
                    <Button size="sm" className="gap-1.5 h-8" onClick={() => {
                      setPromoIsNew(true);
                      setPromoEdit({
                        title: '', description: '', image_url: '',
                        color_primary: '#E60000', color_secondary: '#B30000',
                        icon: 'zap', sort_order: promotions.length + 1, priority: 0,
                        start_date: null, end_date: null,
                        cta_label: 'اكتشف الآن', internal_route: '', external_url: '',
                        status: 'active', display_frequency: 'always',
                        dismiss_behavior: 'permanent', dismiss_hours: 24,
                        send_push: false, is_active: true, show_on_home: true,
                      });
                    }}>
                      <Plus className="w-3.5 h-3.5" /> عرض جديد
                    </Button>
                  </div>
                }
              />

              {promoLoading ? <Spinner /> : promotions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  لا توجد عروض — اضغط "عرض جديد" لإنشاء أول عرض
                </div>
              ) : (
                <div className="space-y-3">
                  {promotions.map(promo => {
                    const statusColors: Record<string, string> = {
                      active:    'text-green-400 bg-green-400/10 border-green-400/30',
                      scheduled: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
                      ended:     'text-muted-foreground bg-muted border-border',
                      draft:     'text-blue-400 bg-blue-400/10 border-blue-400/30',
                    };
                    const statusLabels: Record<string, string> = {
                      active: 'نشط', scheduled: 'مجدول', ended: 'منتهي', draft: 'مسودة',
                    };
                    const freqLabels: Record<string, string> = {
                      always: 'دائماً', once: 'مرة واحدة', daily: 'يومياً', weekly: 'أسبوعياً', monthly: 'شهرياً',
                    };
                    return (
                      <div key={promo.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: `${promo.color_primary}20`, border: `1.5px solid ${promo.color_primary}40` }}>
                              <Tag className="w-4 h-4" style={{ color: promo.color_primary }} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm truncate">{promo.title}</p>
                              {promo.description && <p className="text-[10px] text-muted-foreground truncate">{promo.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusColors[promo.status] ?? ''}`}>
                              {statusLabels[promo.status] ?? promo.status}
                            </span>
                            <button
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={async () => {
                                await adminUpdatePromotion(promo.id, { is_active: !promo.is_active });
                                loadPromotions();
                              }}>
                              {promo.is_active
                                ? <ToggleOn  className="w-5 h-5 text-green-400" />
                                : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
                            </button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => { setPromoIsNew(false); setPromoEdit({ ...promo }); }}>
                              <Pencil className="w-3 h-3" /> تعديل
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => setPromoDeleteTarget(promo)}>
                              <Trash2 className="w-3 h-3" /> حذف
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          {[
                            { label: 'الظهور',   value: freqLabels[promo.display_frequency] ?? promo.display_frequency },
                            { label: 'الأولوية', value: String(promo.priority) },
                            { label: 'الرابط',   value: promo.internal_route || promo.external_url || '—' },
                            { label: 'Push',     value: promo.send_push ? (promo.push_sent ? 'أُرسل ✓' : 'سيُرسل') : 'لا' },
                          ].map(({ label, value }) => (
                            <div key={label} className="bg-muted/30 rounded-lg px-2.5 py-1.5">
                              <p className="text-[10px] text-muted-foreground">{label}</p>
                              <p className="font-semibold truncate">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── حوار تعديل / إنشاء عرض ── */}
              <Dialog open={!!promoEdit} onOpenChange={v => { if (!v && !promoSaving) setPromoEdit(null); }}>
                <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border overflow-y-auto max-h-[90dvh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-primary" />
                      {promoIsNew ? 'إنشاء عرض جديد' : 'تعديل العرض'}
                    </DialogTitle>
                  </DialogHeader>
                  {promoEdit && (
                    <div className="space-y-4 mt-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">العنوان *</Label>
                          <Input value={promoEdit.title ?? ''} onChange={e => setPromoEdit(p => p ? { ...p, title: e.target.value } : p)} placeholder="عنوان العرض" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">نص زر الدعوة</Label>
                          <Input value={promoEdit.cta_label ?? ''} onChange={e => setPromoEdit(p => p ? { ...p, cta_label: e.target.value } : p)} placeholder="اكتشف الآن" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">الوصف</Label>
                        <Textarea value={promoEdit.description ?? ''} onChange={e => setPromoEdit(p => p ? { ...p, description: e.target.value } : p)} rows={2} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">رابط داخلي (مسار الصفحة)</Label>
                          <Select value={promoEdit.internal_route || '__none__'} onValueChange={v => setPromoEdit(p => p ? { ...p, internal_route: v === '__none__' ? '' : v } : p)}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="اختر صفحة..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— لا يوجد رابط داخلي —</SelectItem>
                              <SelectItem value="/home">الصفحة الرئيسية</SelectItem>
                              <SelectItem value="/networks">قسم الشبكات</SelectItem>
                              <SelectItem value="/networks/vodafone">Vodafone RED</SelectItem>
                              <SelectItem value="/networks/orange">Orange</SelectItem>
                              <SelectItem value="/networks/etisalat">Etisalat</SelectItem>
                              <SelectItem value="/networks/we">WE</SelectItem>
                              <SelectItem value="/networks/esim">eSIM</SelectItem>
                              <SelectItem value="/recharge">الشحن</SelectItem>
                              <SelectItem value="/favorites">المفضلة</SelectItem>
                              <SelectItem value="/operations">العمليات</SelectItem>
                              <SelectItem value="/statistics">الإحصائيات</SelectItem>
                              <SelectItem value="/notifications">الإشعارات</SelectItem>
                              <SelectItem value="/settings">الإعدادات</SelectItem>
                              <SelectItem value="/subscription-history">تاريخ الاشتراكات</SelectItem>
                              <SelectItem value="/balance-charge">شحن الرصيد</SelectItem>
                              <SelectItem value="/updates">التحديثات</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">رابط خارجي</Label>
                          <Input value={promoEdit.external_url ?? ''} onChange={e => setPromoEdit(p => p ? { ...p, external_url: e.target.value } : p)} placeholder="https://..." />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">الحالة</Label>
                          <Select value={promoEdit.status ?? 'active'} onValueChange={v => setPromoEdit(p => p ? { ...p, status: v as Promotion['status'] } : p)}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">نشط</SelectItem>
                              <SelectItem value="scheduled">مجدول</SelectItem>
                              <SelectItem value="draft">مسودة</SelectItem>
                              <SelectItem value="ended">منتهي</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">تكرار الظهور</Label>
                          <Select value={promoEdit.display_frequency ?? 'always'} onValueChange={v => setPromoEdit(p => p ? { ...p, display_frequency: v as Promotion['display_frequency'] } : p)}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="always">دائماً</SelectItem>
                              <SelectItem value="once">مرة واحدة فقط</SelectItem>
                              <SelectItem value="daily">مرة يومياً</SelectItem>
                              <SelectItem value="weekly">مرة أسبوعياً</SelectItem>
                              <SelectItem value="monthly">مرة شهرياً</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">سلوك زر X</Label>
                          <Select value={promoEdit.dismiss_behavior ?? 'permanent'} onValueChange={v => setPromoEdit(p => p ? { ...p, dismiss_behavior: v as Promotion['dismiss_behavior'] } : p)}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="permanent">إخفاء نهائي</SelectItem>
                              <SelectItem value="till_tomorrow">إخفاء حتى الغد</SelectItem>
                              <SelectItem value="hours">إخفاء لعدد ساعات</SelectItem>
                              <SelectItem value="always_show">إعادة الظهور دائماً</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {promoEdit.dismiss_behavior === 'hours' && (
                        <div className="space-y-1">
                          <Label className="text-xs">عدد ساعات الإخفاء</Label>
                          <Input type="number" min="1" value={promoEdit.dismiss_hours ?? 24} onChange={e => setPromoEdit(p => p ? { ...p, dismiss_hours: +e.target.value } : p)} />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">الأولوية (عدد كبير = يظهر أولاً)</Label>
                          <Input type="number" value={promoEdit.priority ?? 0} onChange={e => setPromoEdit(p => p ? { ...p, priority: +e.target.value } : p)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">الترتيب</Label>
                          <Input type="number" value={promoEdit.sort_order ?? 0} onChange={e => setPromoEdit(p => p ? { ...p, sort_order: +e.target.value } : p)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">تاريخ البداية</Label>
                          <Input type="datetime-local" value={promoEdit.start_date ? promoEdit.start_date.slice(0, 16) : ''} onChange={e => setPromoEdit(p => p ? { ...p, start_date: e.target.value || null } : p)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">تاريخ النهاية</Label>
                          <Input type="datetime-local" value={promoEdit.end_date ? promoEdit.end_date.slice(0, 16) : ''} onChange={e => setPromoEdit(p => p ? { ...p, end_date: e.target.value || null } : p)} />
                        </div>
                      </div>
                      <div className="flex items-center gap-6 flex-wrap">
                        <button className="flex items-center gap-2 text-sm" onClick={() => setPromoEdit(p => p ? { ...p, is_active: !p.is_active } : p)}>
                          {promoEdit.is_active ? <ToggleOn className="w-5 h-5 text-green-400" /> : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
                          <span className="text-xs">{promoEdit.is_active ? 'نشط' : 'معطّل'}</span>
                        </button>
                        <button className="flex items-center gap-2 text-sm" onClick={() => setPromoEdit(p => p ? { ...p, show_on_home: !p.show_on_home } : p)}>
                          {promoEdit.show_on_home ? <ToggleOn className="w-5 h-5 text-primary" /> : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
                          <span className="text-xs">{promoEdit.show_on_home ? 'يظهر في الرئيسية' : 'مخفي من الرئيسية'}</span>
                        </button>
                        {promoIsNew && (
                          <button className="flex items-center gap-2 text-sm" onClick={() => setPromoEdit(p => p ? { ...p, send_push: !p.send_push } : p)}>
                            {promoEdit.send_push ? <ToggleOn className="w-5 h-5 text-yellow-400" /> : <ToggleOff className="w-5 h-5 text-muted-foreground" />}
                            <span className="text-xs">{promoEdit.send_push ? 'إرسال إشعار Push' : 'بدون إشعار'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <DialogFooter className="mt-4 gap-2">
                    <Button className="flex-1 h-10 gap-1.5" onClick={handleSavePromo} disabled={promoSaving}>
                      {promoSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {promoIsNew ? 'إنشاء العرض' : 'حفظ التعديلات'}
                    </Button>
                    <Button variant="outline" className="h-10" onClick={() => setPromoEdit(null)} disabled={promoSaving}>
                      <XIcon className="w-4 h-4" /> إلغاء
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* ── حوار حذف العرض ── */}
              <AlertDialog open={!!promoDeleteTarget} onOpenChange={v => { if (!v) setPromoDeleteTarget(null); }}>
                <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>حذف العرض</AlertDialogTitle>
                    <AlertDialogDescription>
                      هل أنت متأكد من حذف عرض <strong>{promoDeleteTarget?.title}</strong>؟
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        if (!promoDeleteTarget) return;
                        await adminDeletePromotion(promoDeleteTarget.id);
                        toast.success('تم حذف العرض');
                        setPromoDeleteTarget(null);
                        loadPromotions();
                      }}>
                      حذف
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

        </main>
      </div>

      {/* ════════════════════════════════════
          User Detail Dialog — Full Rebuild v2
      ════════════════════════════════════ */}
      <Dialog open={userDetailOpen} onOpenChange={setUserDetailOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-card border-border overflow-y-auto max-h-[90dvh] p-0">
          {/* رأس ثابت */}
          <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pt-4 pb-3">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-sm font-black flex items-center gap-2">
                <UserCog className="w-4 h-4 text-primary" />
                تفاصيل المستخدم
              </DialogTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs border-border gap-1"
                onClick={async () => { if (!selectedUser) return; setUserDetailLoading(true); setSelectedUser(await getUserDetail(selectedUser.profile.id)); setUserDetailLoading(false); }}>
                <RefreshCw className="w-3 h-3" /> تحديث
              </Button>
            </div>
          </div>

          {userDetailLoading || !selectedUser ? (
            <div className="flex justify-center items-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <div className="px-4 pb-4 space-y-4 mt-4">

              {/* ═══ رأس البطاقة: اسم + حالة + أزرار النسخ ═══ */}
              <div className="flex items-start gap-3 p-4 bg-muted/20 rounded-xl border border-border">
                <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-lg font-black text-primary">
                    {(selectedUser.profile.username ?? 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate">{selectedUser.profile.full_name || selectedUser.profile.username || 'مجهول'}</p>
                  {selectedUser.profile.username && (
                    <p className="text-xs text-muted-foreground">@{selectedUser.profile.username}</p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{selectedUser.profile.email}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <Badge variant="outline" className={`text-xs ${selectedUser.profile.is_active ? 'text-success border-success/40' : 'text-destructive border-destructive/40'}`}>
                    {selectedUser.profile.is_active ? '● نشط' : '✕ محظور'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{selectedUser.profile.role}</span>
                </div>
              </div>

              {/* ═══ معلومات الحساب — كلها من DB ═══ */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-muted/20">
                  <span className="text-xs font-bold">معلومات الحساب</span>
                </div>
                <div className="divide-y divide-border/30">
                  {[
                    { label: 'User ID',          value: selectedUser.profile.id,                             copyable: true },
                    { label: 'اسم المستخدم',     value: selectedUser.profile.username ?? '—',               copyable: true },
                    { label: 'البريد الإلكتروني', value: selectedUser.profile.email ?? '—',                copyable: true },
                    { label: 'رقم الهاتف',        value: selectedUser.profile.phone ?? '—',                copyable: !!selectedUser.profile.phone },
                    { label: 'الاسم الكامل',      value: selectedUser.profile.full_name ?? '—',             copyable: false },
                    { label: 'تاريخ التسجيل',     value: formatEgyptDateTime(selectedUser.profile.created_at), copyable: false },
                    { label: 'آخر تسجيل دخول',   value: (selectedUser.profile as { auth_last_sign_in?: string | null }).auth_last_sign_in
                        ? formatEgyptDateTime((selectedUser.profile as { auth_last_sign_in?: string | null }).auth_last_sign_in!)
                        : '—', copyable: false },
                    { label: 'الدور',             value: selectedUser.profile.role,                         copyable: false },
                    { label: 'الحالة',            value: selectedUser.profile.is_active ? 'نشط' : 'محظور', copyable: false },
                  ].map(({ label, value, copyable }) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2 gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-mono font-semibold truncate max-w-[160px] md:max-w-[220px]">{value}</span>
                        {copyable && value !== '—' && (
                          <button className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            onClick={() => { navigator.clipboard.writeText(value); toast.success(`تم نسخ ${label}`); }}>
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ═══ حالة الاشتراك — كاملة من DB ═══ */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
                  <span className="text-xs font-bold">الاشتراك</span>
                  {selectedUser.subscription && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      selectedUser.subscription.status === 'active'    ? 'bg-success/15 text-success border-success/30' :
                      selectedUser.subscription.status === 'suspended' ? 'bg-warning/15 text-warning border-warning/30' :
                                                                          'bg-destructive/15 text-destructive border-destructive/30'
                    }`}>
                      {selectedUser.subscription.status === 'active' ? '● نشط'
                       : selectedUser.subscription.status === 'suspended' ? '⏸ معلق'
                       : selectedUser.subscription.status === 'cancelled' ? '✕ ملغي'
                       : '✕ منتهي'}
                    </span>
                  )}
                </div>
                {selectedUser.subscription ? (
                  <div className="divide-y divide-border/30">
                    {(() => {
                      const sub = selectedUser.subscription;
                      const daysRem = sub.expires_at ? calcDaysRemaining(sub.expires_at) : null;
                      const opsLimit = sub.ops_limit ?? null;
                      const opsUsed  = sub.ops_count ?? 0;
                      const opsRem   = opsLimit != null ? Math.max(0, opsLimit - opsUsed) : null;
                      return [
                        { label: 'كود الاشتراك',    value: selectedUser.license_code ?? '—',  copyable: !!selectedUser.license_code },
                        { label: 'تاريخ التفعيل',   value: sub.activated_at ? formatEgyptDate(sub.activated_at) : '—', copyable: false },
                        { label: 'تاريخ الانتهاء',  value: sub.expires_at ? formatEgyptDate(sub.expires_at) : '—', copyable: false },
                        { label: 'الأيام المتبقية', value: daysRem != null ? `${daysRem} يوم` : '—', copyable: false },
                        { label: 'العمليات المستخدمة', value: String(opsUsed), copyable: false },
                        { label: 'الحد الأقصى للعمليات', value: opsLimit != null ? String(opsLimit) : 'غير محدود', copyable: false },
                        { label: 'العمليات المتبقية', value: opsRem != null ? String(opsRem) : 'غير محدود', copyable: false },
                        { label: 'فترة السماح', value: sub.in_grace_period ? `نعم (حتى ${sub.grace_ends_at ? formatEgyptDate(sub.grace_ends_at) : '—'})` : 'لا', copyable: false },
                      ].map(({ label, value, copyable }) => (
                        <div key={label} className="flex items-center justify-between px-3 py-2 gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-xs font-semibold truncate ${label === 'الأيام المتبقية' && daysRem != null && daysRem < 3 ? 'text-destructive' : ''}`}>{value}</span>
                            {copyable && value !== '—' && (
                              <button className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                onClick={() => { navigator.clipboard.writeText(value); toast.success(`تم نسخ ${label}`); }}>
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">لا يوجد اشتراك</div>
                )}
              </div>

              {/* ═══ الإحصائيات ═══ */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-muted/20">
                  <span className="text-xs font-bold">الإحصائيات</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border/30">
                  {[
                    { label: 'إجمالي العمليات', val: selectedUser.ops_count,    cls: 'text-primary' },
                    { label: 'عمليات ناجحة',    val: selectedUser.total_cards,  cls: 'text-success' },
                    { label: 'إجمالي المبالغ',  val: `${selectedUser.total_amount.toFixed(0)}ج`, cls: 'text-warning' },
                  ].map(({ label, val, cls }) => (
                    <div key={label} className="p-3 text-center">
                      <p className={`text-base font-black ${cls}`}>{val}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 text-balance">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/30 divide-y divide-border/30">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">أكثر رقم استخداماً</span>
                    <span className="text-xs font-mono font-semibold">{selectedUser.top_phone ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">أكثر منتج استخداماً</span>
                    <span className="text-xs font-semibold">{selectedUser.top_product ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">أرقام مختلفة</span>
                    <span className="text-xs font-semibold">{selectedUser.phone_numbers.length}</span>
                  </div>
                </div>
              </div>

              {/* ═══ نظام تشخيص الحساب ═══ */}
              <UserDiagnosticsSection user={selectedUser} />

              {/* ═══ جميع إجراءات الإدارة المدمجة ═══ */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-muted/20">
                  <span className="text-xs font-bold">إجراءات الإدارة</span>
                </div>
                <div className="p-3 space-y-3">
                  {/* مجموعة: الاشتراك */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">إدارة الاشتراك</span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" className="h-9 text-xs border-success/40 text-success hover:bg-success/10 gap-1.5"
                        onClick={() => execUserAction(
                          () => renewUserSubscription(selectedUser.profile.id, 30, profile?.id),
                          'تم تجديد الاشتراك بـ 30 يوم', false)}>
                        <RefreshCw className="w-3.5 h-3.5" /> تجديد 30 يوم
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-xs border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                        onClick={() => {
                          if (!selectedUser) return;
                          const entry: LinkedUserEntry = {
                            profile: selectedUser.profile,
                            subscription: selectedUser.subscription ?? null,
                            license_key: null,
                            license_code: selectedUser.license_code ?? null,
                            ops_count: selectedUser.ops_count,
                            is_banned: !selectedUser.profile.is_active,
                          };
                          setSubEditorTarget(entry);
                          setSubEditorDays('30');
                          setSubEditorOpen(true);
                        }}>
                        <Pencil className="w-3.5 h-3.5" /> تعديل الاشتراك
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-xs border-warning/40 text-warning hover:bg-warning/10 gap-1.5"
                        disabled={selectedUser.subscription?.status === 'suspended'}
                        onClick={() => execUserAction(
                          () => suspendUserSubscription(selectedUser.profile.id, true, profile?.id),
                          'تم تعليق الاشتراك', false)}>
                        <UserMinus className="w-3.5 h-3.5" /> تعليق الاشتراك
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-xs border-success/40 text-success hover:bg-success/10 gap-1.5"
                        disabled={selectedUser.subscription?.status !== 'suspended'}
                        onClick={() => execUserAction(
                          () => suspendUserSubscription(selectedUser.profile.id, false, profile?.id),
                          'تم رفع التعليق عن الاشتراك', false)}>
                        <CheckCircle className="w-3.5 h-3.5" /> رفع التعليق
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5"
                        onClick={() => execUserAction(
                          () => cancelUserSubscription(selectedUser.profile.id, profile?.id),
                          'تم إلغاء الاشتراك', false)}>
                        <XIcon className="w-3.5 h-3.5" /> إلغاء الاشتراك
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-xs border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                        onClick={() => execUserAction(
                          () => reactivateUserSubscription(selectedUser.profile.id),
                          'تمت إعادة التفعيل', false)}>
                        <ToggleOn className="w-3.5 h-3.5" /> إعادة تفعيل
                      </Button>
                    </div>
                  </div>

                  {/* مجموعة: الكود */}
                  <div className="space-y-1.5 pt-1 border-t border-border/30">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">إدارة الكود</span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" className="h-9 text-xs border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                        onClick={() => {
                          if (!selectedUser) return;
                          const entry: LinkedUserEntry = {
                            profile: selectedUser.profile,
                            subscription: selectedUser.subscription ?? null,
                            license_key: null,
                            license_code: selectedUser.license_code ?? null,
                            ops_count: selectedUser.ops_count,
                            is_banned: !selectedUser.profile.is_active,
                          };
                          setChangeCodeTarget(entry);
                          setChangeCodeKeyId('');
                          setChangeCodeOpen(true);
                        }}>
                        <Key className="w-3.5 h-3.5" /> تغيير الكود
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-xs border-warning/40 text-warning hover:bg-warning/10 gap-1.5"
                        onClick={() => execUserAction(
                          () => unlinkUserFromCode(selectedUser.profile.id, profile?.id),
                          'تم إزالة الربط مع الكود', false)}>
                        <LinkIcon className="w-3.5 h-3.5" /> إزالة الربط
                      </Button>
                    </div>
                  </div>

                  {/* مجموعة: العمليات */}
                  <div className="space-y-1.5 pt-1 border-t border-border/30">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">العمليات</span>
                    <Button size="sm" variant="outline" className="w-full h-9 text-xs border-success/40 text-success hover:bg-success/10 gap-1.5"
                      onClick={() => {
                        setAdjustOpsTarget({ userId: selectedUser.profile.id, username: selectedUser.profile.username ?? '' });
                        setAdjustOpsDelta(''); setAdjustOpsReason('');
                        setAdjustOpsOpen(true);
                      }}>
                      <PlusCircle className="w-3.5 h-3.5" /> تعديل عدد العمليات
                    </Button>
                  </div>

                  {/* مجموعة: المستخدم */}
                  <div className="space-y-1.5 pt-1 border-t border-border/30">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">إدارة المستخدم</span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" className="h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5"
                        disabled={!selectedUser.profile.is_active}
                        onClick={async () => {
                          const r = await banUser(selectedUser.profile.id, true, profile?.id);
                          if (!r.success) { toast.error(r.error ?? 'فشل الحظر'); return; }
                          toast.success('تم حظر المستخدم');
                          setSelectedUser(await getUserDetail(selectedUser.profile.id));
                        }}>
                        <Ban className="w-3.5 h-3.5" /> حظر
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-xs border-success/40 text-success hover:bg-success/10 gap-1.5"
                        disabled={selectedUser.profile.is_active}
                        onClick={async () => {
                          const r = await banUser(selectedUser.profile.id, false, profile?.id);
                          if (!r.success) { toast.error(r.error ?? 'فشل رفع الحظر'); return; }
                          toast.success('تم رفع الحظر');
                          setSelectedUser(await getUserDetail(selectedUser.profile.id));
                        }}>
                        <CheckCircle className="w-3.5 h-3.5" /> رفع الحظر
                      </Button>
                      {profile?.role === 'super_admin' && (
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs font-normal text-muted-foreground">تغيير الدور</Label>
                          <Select defaultValue={selectedUser.profile.role}
                            onValueChange={async (v) => {
                              await updateUserRole(selectedUser.profile.id, v);
                              if (profile) await logAdminAction({ adminId: profile.id, action: 'change_role', targetUserId: selectedUser.profile.id, details: { new_role: v } });
                              toast.success('تم تحديث الدور');
                            }}>
                            <SelectTrigger className="bg-background border-border h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">مستخدم</SelectItem>
                              <SelectItem value="admin">مسؤول</SelectItem>
                              <SelectItem value="super_admin">مدير عام</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* مجموعة: حذف نهائي */}
                  {profile?.role === 'super_admin' && (
                    <div className="pt-1 border-t border-destructive/20">
                      <Button size="sm" variant="outline" className="w-full h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5"
                        onClick={() => {
                          setDeleteUserTarget({ id: selectedUser.profile.id, name: selectedUser.profile.username ?? selectedUser.profile.email ?? '' });
                          setUserDetailOpen(false);
                        }}>
                        <UserX className="w-3.5 h-3.5" /> حذف المستخدم نهائياً
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ آخر العمليات ═══ */}
              {selectedUser.recent_ops.length > 0 && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-muted/20">
                    <span className="text-xs font-bold">آخر العمليات</span>
                  </div>
                  <div className="divide-y divide-border/30">
                    {selectedUser.recent_ops.slice(0, 10).map(op => {
                      const opRaw = op as Operation & { api_response?: string; duration_ms?: number };
                      return (
                        <div key={op.id} className="flex items-center gap-2 px-3 py-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${op.status === 'success' ? 'bg-success' : op.status === 'failed' ? 'bg-destructive' : 'bg-warning'}`} />
                          <span className="text-[11px] font-mono flex-1 min-w-0 truncate">{op.phone_number}</span>
                          <span className="text-[11px] text-muted-foreground truncate hidden md:block">{op.card_type}</span>
                          {op.amount != null && <span className="text-[11px] font-bold text-primary shrink-0">{op.amount}ج</span>}
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{formatEgyptDate(op.performed_at)}</span>
                          <button className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-primary/10 text-primary border border-primary/20"
                            onClick={() => setAdminOpDetail({ op: opRaw })}>تفاصيل</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ═══ آخر الأنشطة ═══ */}
              {selectedUser.activity.length > 0 && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-muted/20">
                    <span className="text-xs font-bold">آخر الأنشطة</span>
                  </div>
                  <div className="divide-y divide-border/30">
                    {selectedUser.activity.slice(0, 8).map(a => (
                      <div key={a.id} className="flex items-start gap-2 px-3 py-2 min-w-0">
                        <Activity className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold truncate">{a.title}</p>
                          {a.description && <p className="text-[10px] text-muted-foreground line-clamp-1">{a.description}</p>}
                        </div>
                        <p className="text-[10px] text-muted-foreground tabular-nums shrink-0">{formatEgyptDate(a.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ═══ الإشعارات ═══ */}
              {selectedUser.notifications.length > 0 && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
                    <span className="text-xs font-bold">الإشعارات ({selectedUser.notifications.length})</span>
                    <button className="text-[10px] text-destructive hover:text-destructive/80 font-semibold flex items-center gap-1 disabled:opacity-40"
                      disabled={deletingAllNotifs}
                      onClick={async () => {
                        if (!window.confirm('حذف كل إشعارات هذا المستخدم نهائياً؟')) return;
                        setDeletingAllNotifs(true);
                        await deleteAllUserNotifications(selectedUser.profile.id);
                        setDeletingAllNotifs(false);
                        setSelectedUser(prev => prev ? { ...prev, notifications: [] } : prev);
                        toast.success('تم حذف كل الإشعارات');
                      }}>
                      <Trash2 className="w-3 h-3" /> حذف الكل
                    </button>
                  </div>
                  <div className="divide-y divide-border/30">
                    {selectedUser.notifications.slice(0, showAllNotifs ? undefined : 5).map(n => (
                      <div key={n.id} className="flex items-start gap-2 px-3 py-2 group min-w-0">
                        <Bell className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold truncate">{n.title}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1">{n.body}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground tabular-nums shrink-0">{formatEgyptDate(n.created_at)}</p>
                        <button className="opacity-0 group-hover:opacity-100 shrink-0 text-destructive/60 hover:text-destructive transition-opacity disabled:opacity-30"
                          disabled={deletingNotifId === n.id}
                          onClick={async () => {
                            setDeletingNotifId(n.id);
                            await deleteNotification(n.id);
                            setDeletingNotifId(null);
                            setSelectedUser(prev => prev ? { ...prev, notifications: prev.notifications.filter(x => x.id !== n.id) } : prev);
                          }}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {selectedUser.notifications.length > 5 && (
                    <button className="w-full text-[11px] text-primary/70 hover:text-primary py-2 flex items-center justify-center gap-1 border-t border-border/30"
                      onClick={() => setShowAllNotifs(v => !v)}>
                      {showAllNotifs ? <><ChevronUp className="w-3 h-3" /> عرض أقل</> : <><ChevronDown className="w-3 h-3" /> عرض الكل ({selectedUser.notifications.length})</>}
                    </button>
                  )}
                </div>
              )}

            </div>
          )}

          {/* تذييل ثابت */}
          <div className="sticky bottom-0 bg-card border-t border-border px-4 py-3">
            <Button variant="outline" className="w-full border-border h-9 text-sm" onClick={() => setUserDetailOpen(false)}>إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════ Dialog: تعديل عمليات المستخدم ════ */}
      <Dialog open={adjustOpsOpen} onOpenChange={setAdjustOpsOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle>تعديل العمليات — {adjustOpsTarget?.username}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">القيمة (موجبة للإضافة، سالبة للخصم)</Label>
              <Input type="number" className="bg-background border-border h-10" placeholder="مثال: 10 أو -5"
                value={adjustOpsDelta} onChange={e => setAdjustOpsDelta(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">السبب (اختياري)</Label>
              <Input className="bg-background border-border h-10" placeholder="سبب التعديل..."
                value={adjustOpsReason} onChange={e => setAdjustOpsReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setAdjustOpsOpen(false)}>إلغاء</Button>
            <Button disabled={adjustOpsSaving || !adjustOpsDelta}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={async () => {
                if (!adjustOpsTarget || !adjustOpsDelta || !user) return;
                setAdjustOpsSaving(true);
                const delta = parseInt(adjustOpsDelta, 10);
                const r = await adminAdjustOps(adjustOpsTarget.userId, delta, user.id, adjustOpsReason || undefined);
                if (r.success) {
                  toast.success(`تم التعديل — الرصيد الجديد: ${r.newCount} عملية`);
                  setAdjustOpsOpen(false);
                } else {
                  toast.error(`فشل التعديل: ${r.error}`);
                }
                setAdjustOpsSaving(false);
              }}>
              {adjustOpsSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <UserCog className="w-4 h-4 ml-1" />}
              تطبيق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          Code Detail Dialog
      ════════════════════════════════════ */}
      <Dialog open={codeDetailOpen} onOpenChange={setCodeDetailOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl bg-card border-border overflow-y-auto max-h-[90dvh]">
          <DialogHeader><DialogTitle>تفاصيل الكود</DialogTitle></DialogHeader>
          {codeDetailLoading || !codeDetail ? <Spinner /> : (
            <div className="space-y-5">
              {/* الكود الرئيسي */}
              <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-mono text-base font-black tracking-widest">{codeDetail.key.code}</p>
                  <button onClick={() => { navigator.clipboard.writeText(codeDetail.key.code); toast.success('تم النسخ'); }}>
                    <Copy className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>

                {/* status + type badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <CodeStatusBadge k={codeDetail.key} />
                  <CodeTypeBadge type={codeDetail.key.code_type ?? 'paid'} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'المدة',            val: `${codeDetail.key.custom_duration_days ?? codeDetail.key.duration_days} يوم` },
                    { label: 'تاريخ الإنشاء',    val: formatEgyptDate(codeDetail.key.created_at) },
                    { label: 'تاريخ التفعيل',    val: codeDetail.key.used_at ? formatEgyptDate(codeDetail.key.used_at) : '—' },
                    { label: 'وضع الانتهاء',     val: codeDetail.key.expiration_mode ?? '—' },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                      <span className="text-xs font-semibold">{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── إحصائيات المستخدمين الكاملة ── */}
              {(() => {
                const maxUsers    = codeDetail.key.max_users ?? 0;
                const curUsers    = codeDetail.total_users_count;
                const activeUsers = codeDetail.active_users_count;
                const remUsers    = maxUsers > 0 ? Math.max(0, maxUsers - curUsers) : null;
                const userPct     = maxUsers > 0 ? Math.min(100, Math.round((curUsers / maxUsers) * 100)) : 0;

                const opsPerUser  = codeDetail.key.operations_per_user ?? codeDetail.key.max_ops_per_user ?? null;
                const totalOps    = codeDetail.key.total_operations ?? (maxUsers > 0 && opsPerUser != null ? maxUsers * opsPerUser : null);
                const usedOps     = codeDetail.ops_used_total;
                const remOps      = totalOps != null ? Math.max(0, totalOps - usedOps) : null;
                const opsPct      = totalOps != null && totalOps > 0 ? Math.min(100, Math.round((usedOps / totalOps) * 100)) : 0;

                return (
                  <div className="space-y-3">
                    {/* بطاقة المستخدمين */}
                    <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                      <h4 className="text-xs font-bold flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-primary" /> إحصائيات المستخدمين
                      </h4>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: 'المسموح',    val: maxUsers > 0 ? maxUsers : '♾️', cls: 'text-foreground' },
                          { label: 'الحاليون',   val: curUsers,   cls: 'text-warning' },
                          { label: 'المتبقي',    val: remUsers != null ? remUsers : '♾️', cls: remUsers === 0 ? 'text-destructive' : 'text-success' },
                        ].map(({ label, val, cls }) => (
                          <div key={label} className="bg-muted/30 rounded-lg p-2.5">
                            <p className={`text-lg font-black tabular-nums ${cls}`}>{val}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
                          </div>
                        ))}
                      </div>
                      {maxUsers > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>نسبة الامتلاء</span>
                            <span className={`font-bold ${userPct >= 90 ? 'text-destructive' : userPct >= 60 ? 'text-warning' : 'text-success'}`}>{userPct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${userPct >= 90 ? 'bg-destructive' : userPct >= 60 ? 'bg-warning' : 'bg-success'}`}
                              style={{ width: `${userPct}%` }} />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: `نشطون الآن: ${activeUsers}`, cls: 'bg-success/10 text-success' },
                          { label: `مرات التفعيل: ${codeDetail.key.activation_limit_per_user ?? codeDetail.key.uses_per_user ?? 1}`, cls: 'bg-primary/10 text-primary' },
                        ].map(({ label, cls }) => (
                          <span key={label} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{label}</span>
                        ))}
                      </div>
                    </div>

                    {/* بطاقة العمليات */}
                    <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                      <h4 className="text-xs font-bold flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-warning" /> إحصائيات العمليات
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'عمليات/مستخدم',    val: opsPerUser != null ? opsPerUser.toLocaleString() : '♾️' },
                          { label: 'الإجمالي الكلي',    val: totalOps   != null ? totalOps.toLocaleString()  : '♾️' },
                          { label: 'المستخدمة',         val: usedOps.toLocaleString(), cls: 'text-warning' },
                          { label: 'المتبقية',          val: remOps     != null ? remOps.toLocaleString()    : '♾️', cls: remOps === 0 ? 'text-destructive' : 'text-success' },
                        ].map(({ label, val, cls }) => (
                          <div key={label} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-muted/30">
                            <span className="text-[10px] text-muted-foreground">{label}</span>
                            <span className={`text-xs font-black tabular-nums ${cls ?? 'text-foreground'}`}>{val}</span>
                          </div>
                        ))}
                      </div>
                      {totalOps != null && totalOps > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>نسبة الاستهلاك</span>
                            <span className={`font-bold ${opsPct >= 90 ? 'text-destructive' : opsPct >= 60 ? 'text-warning' : 'text-success'}`}>{opsPct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${opsPct >= 90 ? 'bg-destructive' : opsPct >= 60 ? 'bg-warning' : 'bg-success'}`}
                              style={{ width: `${opsPct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {codeDetail.key.notes && <p className="text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg">{codeDetail.key.notes}</p>}

              {/* ── المستخدمون المرتبطون + إجراءاتهم ── */}
              {codeDetail.trial_users.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold">👥 المستخدمون المرتبطون ({codeDetail.trial_users.length})</h4>
                  <div className="space-y-2">
                    {codeDetail.trial_users.map(tu => {
                      const maxOps = codeDetail.key.max_ops_per_user ?? null; // null = unlimited ♾️
                      const opsPct = maxOps !== null && maxOps > 0 ? Math.min(100, Math.round((tu.ops_used / maxOps) * 100)) : 0;
                      const isActive = tu.subscription_status === 'active';
                      return (
                        <div key={tu.user_id} className="px-3 py-2.5 bg-muted/20 rounded-xl border border-border/30 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-semibold truncate">
                                  {tu.profile?.username ?? tu.profile?.email ?? tu.user_id.slice(0, 8) + '...'}
                                </p>
                                {/* PHASE 14: زر فتح صفحة المستخدم */}
                                {tu.profile?.id && (
                                  <button
                                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                    title="فتح صفحة المستخدم"
                                    onClick={() => navigate(`/admin/users/${tu.profile!.id}`)}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {/* PHASE 1: بيانات المستخدم */}
                              {tu.profile?.email && (
                                <p className="text-[10px] text-muted-foreground truncate">{tu.profile.email}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground">
                                تفعيل: {formatEgyptDate(tu.activated_at)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* PHASE 12: badge بالحالة الحقيقية */}
                              {(() => {
                                const st = tu.subscription_status ?? 'expired';
                                const stMap = CODE_STATUS_MAP[st] ?? CODE_STATUS_MAP.expired;
                                return (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${stMap.cls}`}>
                                    {stMap.label}
                                  </span>
                                );
                              })()}
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${maxOps !== null && tu.ops_used >= maxOps ? 'text-destructive bg-destructive/10' : 'text-success bg-success/10'}`}>
                                {tu.ops_used}/{maxOps ?? '♾️'}
                              </span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                            <div className={`h-full rounded-full ${opsPct >= 100 ? 'bg-destructive' : opsPct >= 60 ? 'bg-warning' : 'bg-success'}`}
                              style={{ width: `${opsPct}%` }} />
                          </div>
                          {/* أزرار إجراءات المستخدم — مشروطة بحالة الاشتراك */}
                          {tu.profile?.id && (() => {
                            const subStatus = tu.subscription_status;
                            const isSubActive    = subStatus === 'active';
                            const isSubSuspended = subStatus === 'suspended';
                            const isSubCancelled = subStatus === 'cancelled' || subStatus === 'expired' || !subStatus;
                            return (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {/* ── نشط: تجديد + إلغاء + تعليق + إزالة ── */}
                                {isSubActive && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 text-[10px] border-success/30 text-success hover:bg-success/10 gap-1 px-2"
                                    onClick={async () => {
                                      const r = await renewUserSubscription(tu.profile!.id, 30);
                                      r.success ? toast.success('تم تجديد الاشتراك ✅') : toast.error(r.error ?? 'خطأ');
                                      if (r.success) openCodeDetail(codeDetail.key.id);
                                    }}>
                                    <RotateCcw className="w-3 h-3" /> تجديد
                                  </Button>
                                )}
                                {isSubActive && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 text-[10px] border-destructive/30 text-destructive hover:bg-destructive/10 gap-1 px-2"
                                    onClick={async () => {
                                      const r = await cancelUserSubscription(tu.profile!.id);
                                      r.success ? toast.success('تم إلغاء الاشتراك') : toast.error(r.error ?? 'خطأ');
                                      if (r.success) openCodeDetail(codeDetail.key.id);
                                    }}>
                                    <XCircle className="w-3 h-3" /> إلغاء
                                  </Button>
                                )}
                                {isSubActive && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 text-[10px] border-warning/30 text-warning hover:bg-warning/10 gap-1 px-2"
                                    onClick={async () => {
                                      const r = await suspendUserSubscription(tu.profile!.id, true);
                                      r.success ? toast.success('تم تعليق الاشتراك ⏸') : toast.error(r.error ?? 'خطأ');
                                      if (r.success) openCodeDetail(codeDetail.key.id);
                                    }}>
                                    <UserMinus className="w-3 h-3" /> تعليق
                                  </Button>
                                )}
                                {/* ── معلق: رفع التعليق + إلغاء + إزالة ── */}
                                {isSubSuspended && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 text-[10px] border-success/30 text-success hover:bg-success/10 gap-1 px-2"
                                    onClick={async () => {
                                      const r = await suspendUserSubscription(tu.profile!.id, false);
                                      r.success ? toast.success('تم رفع التعليق ✅') : toast.error(r.error ?? 'خطأ');
                                      if (r.success) openCodeDetail(codeDetail.key.id);
                                    }}>
                                    <PlayCircle className="w-3 h-3" /> رفع التعليق
                                  </Button>
                                )}
                                {isSubSuspended && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 text-[10px] border-destructive/30 text-destructive hover:bg-destructive/10 gap-1 px-2"
                                    onClick={async () => {
                                      const r = await cancelUserSubscription(tu.profile!.id);
                                      r.success ? toast.success('تم إلغاء الاشتراك') : toast.error(r.error ?? 'خطأ');
                                      if (r.success) openCodeDetail(codeDetail.key.id);
                                    }}>
                                    <XCircle className="w-3 h-3" /> إلغاء
                                  </Button>
                                )}
                                {/* ── ملغي/منتهي: تفعيل مجدداً + إزالة فقط ── */}
                                {isSubCancelled && (
                                  <Button size="sm" variant="outline"
                                    className="h-7 text-[10px] border-primary/30 text-primary hover:bg-primary/10 gap-1 px-2"
                                    onClick={async () => {
                                      const r = await reactivateUserSubscription(tu.profile!.id);
                                      r.success ? toast.success('تم إعادة التفعيل ✅') : toast.error(r.error ?? 'خطأ');
                                      if (r.success) openCodeDetail(codeDetail.key.id);
                                    }}>
                                    <PlayCircle className="w-3 h-3" /> تفعيل مجدداً
                                  </Button>
                                )}
                                {/* ── إزالة نهائية — دائماً متاحة ── */}
                                <Button size="sm" variant="outline"
                                  className="h-7 text-[10px] border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive gap-1 px-2"
                                  onClick={async () => {
                                    const r = await removeUserFromCode(tu.profile!.id);
                                    r.success ? toast.success('تم إزالة المستخدم من الكود ✅') : toast.error(r.error ?? 'خطأ');
                                    if (r.success) openCodeDetail(codeDetail.key.id);
                                  }}>
                                  <Trash2 className="w-3 h-3" /> إزالة نهائية
                                </Button>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* سجل الأحداث */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold">📋 سجل الأحداث</h4>
                {codeDetail.logs.length === 0
                  ? <p className="text-xs text-muted-foreground">لا توجد أحداث مسجلة</p>
                  : (
                    <div className="space-y-1.5">
                      {codeDetail.logs.map(log => {
                        const meta = CODE_ACTION_MAP[log.action] ?? { label: log.action, color: 'bg-primary' };
                        return (
                          <div key={log.id} className="flex items-start gap-2.5 px-3 py-2 bg-muted/20 rounded-lg">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${meta.color}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold">{meta.label}</p>
                                <p className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                                  {formatEgyptDateTime(log.created_at)}
                                </p>
                              </div>
                              {log.details && <p className="text-[10px] text-muted-foreground mt-0.5">{log.details}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                }
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setCodeDetailOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          New Key Dialog
      ════════════════════════════════════ */}
      <Dialog open={newKeyDialog} onOpenChange={setNewKeyDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء كود تفعيل جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">

            {/* نوع الكود */}
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">نوع الكود</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['paid', 'trial', 'gift'] as const).map(t => (
                  <button key={t} onClick={() => {
                    setNewKeyType(t);
                    setGeneratedCode(generateCode(t === 'trial' ? 'NADER' : t === 'gift' ? 'GIFT' : 'NAFK'));
                    setNewKeyExpirationMode(t === 'trial' ? 'BY_USAGE' : 'BY_DATE');
                  }}
                    className={`p-3 rounded-xl border text-sm font-semibold transition-all ${
                      newKeyType === t ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-muted/20 border-border text-muted-foreground hover:border-primary/30'
                    }`}>
                    {t === 'paid' ? '💳 مدفوع' : t === 'trial' ? '🧪 تجريبي' : '🎁 هدية'}
                  </button>
                ))}
              </div>
            </div>

            {/* الكود المولّد */}
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">الكود المُولَّد تلقائياً</Label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center px-3 py-2 rounded-lg bg-muted/30 border border-border font-mono text-sm font-bold tracking-wider text-primary min-w-0 truncate">
                  {generatedCode || '—'}
                </div>
                <Button variant="outline" size="icon" className="border-border h-10 w-10 shrink-0"
                  onClick={() => setGeneratedCode(generateCode(newKeyType === 'trial' ? 'NADER' : newKeyType === 'gift' ? 'GIFT' : 'NAFK'))}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">اضغط 🔄 لتوليد كود مختلف</p>
            </div>

            {/* المدة */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-normal text-muted-foreground">
                  {newKeyType === 'paid' ? 'مدة الاشتراك' : newKeyType === 'gift' ? 'مدة الهدية' : 'مدة التجربة'}
                </Label>
                <button
                  onClick={() => setNewKeyUseCustom(v => !v)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-all ${newKeyUseCustom ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/30'}`}>
                  {newKeyUseCustom ? 'مخصص ✓' : 'مدة مخصصة'}
                </button>
              </div>
              {newKeyUseCustom ? (
                <div className="flex items-center gap-2">
                  <Input type="number" min="1" max="3650" className="bg-background border-border h-9 text-sm flex-1"
                    placeholder="أدخل عدد الأيام" value={newKeyCustomDays}
                    onChange={e => setNewKeyCustomDays(e.target.value)} />
                  <span className="text-sm text-muted-foreground shrink-0">يوم</span>
                </div>
              ) : (
                <Select value={newKeyDays} onValueChange={setNewKeyDays}>
                  <SelectTrigger className="bg-card border-border h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['7','15','30','60','90','180','365'].map(d => (
                      <SelectItem key={d} value={d}>{d} يوم</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* وضع الانتهاء */}
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">وضع الانتهاء</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { val: 'BY_DATE',  label: 'بالتاريخ', icon: '📅' },
                  { val: 'BY_USAGE', label: 'بالحصة',   icon: '🔢' },
                  { val: 'EARLIEST', label: 'الأقرب',   icon: '⚡' },
                ] as const).map(m => (
                  <button key={m.val} onClick={() => setNewKeyExpirationMode(m.val)}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold transition-all ${
                      newKeyExpirationMode === m.val ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-muted/20 border-border text-muted-foreground hover:border-primary/30'
                    }`}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {newKeyExpirationMode === 'BY_DATE' ? 'ينتهي في تاريخ الانتهاء المحدد' :
                 newKeyExpirationMode === 'BY_USAGE' ? 'ينتهي عند نفاد الحصة' :
                 'ينتهي عند الأقرب: التاريخ أو نفاد الحصة'}
              </p>
            </div>

            {/* تاريخ انتهاء الكود */}
            {(newKeyExpirationMode === 'BY_DATE' || newKeyExpirationMode === 'EARLIEST') && (
              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-muted-foreground">تاريخ انتهاء الكود (اختياري)</Label>
                <Input type="date" className="bg-background border-border h-9 text-sm"
                  value={newKeyExpiryDate} onChange={e => setNewKeyExpiryDate(e.target.value)} />
                <p className="text-[10px] text-muted-foreground">الكود لن يُقبل بعد هذا التاريخ</p>
              </div>
            )}

            {/* حقول جميع الأنواع — max_users + activation_limit + ops_per_user */}
            <div className="space-y-3 p-3 bg-primary/5 border border-primary/15 rounded-xl">
              <p className="text-[11px] font-bold text-primary">إعدادات الحصص</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">عدد المستخدمين المسموح (max_users)</Label>
                  <Input type="number" min="1" max="100000" className="bg-background border-border h-9 text-sm"
                    placeholder="مثال: 100"
                    value={newKeyMaxUsers} onChange={e => setNewKeyMaxUsers(e.target.value)} />
                  <p className="text-[10px] text-muted-foreground">0 = غير محدود</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">مرات التفعيل للمستخدم الواحد</Label>
                  <Input type="number" min="1" max="100" className="bg-background border-border h-9 text-sm"
                    placeholder="مثال: 1"
                    value={newKeyActivationLimit} onChange={e => setNewKeyActivationLimit(e.target.value)} />
                  <p className="text-[10px] text-muted-foreground">1 = مرة واحدة فقط</p>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">عدد العمليات لكل مستخدم (operations_per_user)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="1" max="999999" className="bg-background border-border h-9 text-sm flex-1"
                      placeholder="مثال: 20 — اتركه فارغاً للـ ♾️"
                      value={newKeyOpsPerUser} onChange={e => setNewKeyOpsPerUser(e.target.value)} />
                    <button
                      type="button"
                      onClick={() => setNewKeyOpsPerUser('')}
                      className={`h-9 px-3 rounded-md text-sm font-bold border transition-colors shrink-0 ${newKeyOpsPerUser === '' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'}`}
                      title="غير محدود"
                    >♾️</button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">اضغط ♾️ أو اتركه فارغاً = غير محدود</p>
                </div>
              </div>
            </div>

            {/* ملخص مباشر LIVE SUMMARY */}
            {(() => {
              const mu  = parseInt(newKeyMaxUsers)       || 0;
              const opu = parseInt(newKeyOpsPerUser)     || 0;
              const al  = parseInt(newKeyActivationLimit)|| 1;
              const total = mu > 0 && opu > 0 ? mu * opu : null;
              return (
                <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2">
                  <p className="text-[11px] font-bold text-muted-foreground">ملخص مباشر</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'عدد المستخدمين',     val: mu  > 0 ? mu.toLocaleString()  : '♾️' },
                      { label: 'مرات التفعيل',        val: al.toString() },
                      { label: 'عمليات/مستخدم',       val: opu > 0 ? opu.toLocaleString() : '♾️' },
                      { label: 'إجمالي العمليات',     val: total != null ? total.toLocaleString() : '♾️', highlight: true },
                    ].map(({ label, val, highlight }) => (
                      <div key={label} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${highlight ? 'bg-primary/10 border border-primary/20' : 'bg-muted/40'}`}>
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                        <span className={`text-xs font-black tabular-nums ${highlight ? 'text-primary' : 'text-foreground'}`}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ملاحظات */}
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">ملاحظات (اختياري)</Label>
              <Textarea className="bg-background border-border resize-none text-sm" rows={2}
                placeholder="ملاحظة..." value={newKeyNotes} onChange={e => setNewKeyNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-border" onClick={() => setNewKeyDialog(false)}>إلغاء</Button>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleCreateKey} disabled={keyCreating}>
              {keyCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 ml-1" />إنشاء</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          PHASE 1: Delete Key Confirm — Cascade
      ════════════════════════════════════ */}
      <AlertDialog open={!!deleteKeyId} onOpenChange={v => { if (!v) { setDeleteKeyId(null); setDeletePreview(null); } }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> حذف الكود نهائياً
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-right">
              <div className="p-3 rounded-xl bg-destructive/8 border border-destructive/20 space-y-2 mt-2">
                <p className="text-sm font-bold text-foreground">تحذير — لا يمكن التراجع</p>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2"><XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>سيتم حذف الكود نهائياً من قاعدة البيانات</span></li>
                  <li className="flex items-start gap-2"><XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>سيتم إلغاء <strong>جميع الاشتراكات</strong> المرتبطة بهذا الكود</span></li>
                  <li className="flex items-start gap-2"><XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>سيتم إزالة الكود من سجلات المستخدمين</span></li>
                  <li className="flex items-start gap-2"><XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>سيتم تسجيل العملية في سجل المراجعة</span></li>
                </ul>
              </div>
              {deletePreview && (
                <div className="p-3 rounded-xl bg-muted/30 border border-border text-sm">
                  <p>الكود: <strong className="font-mono">{deletePreview.code}</strong></p>
                  <p className="text-destructive font-semibold">المستخدمون المتأثرون: {deletePreview.affectedUsers}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="border-border" onClick={() => { setDeleteKeyId(null); setDeletePreview(null); }}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
              onClick={handleDeleteKey}
              disabled={deletingKey}
            >
              {deletingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              تأكيد الحذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════════════════════════════════
          PHASE 10+11: User Actions Dialog — Rebuilt
      ════════════════════════════════════ */}
      <Dialog open={userActionsOpen} onOpenChange={setUserActionsOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-black">
              <Shield className="w-4 h-4 text-primary" /> إجراءات المستخدم
            </DialogTitle>
          </DialogHeader>
          {userActionsTarget && (
            <div className="space-y-3 pb-1">

              {/* ── بطاقة هوية المستخدم مع أزرار نسخ ── */}
              <div className="rounded-xl bg-muted/20 border border-border overflow-hidden">
                <div className="px-3 pt-3 pb-2 flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-black text-primary">
                      {(userActionsTarget.profile.username ?? 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black truncate">{userActionsTarget.profile.full_name || userActionsTarget.profile.username || '—'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{userActionsTarget.profile.email}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <Badge variant="outline" className={`text-[10px] ${userActionsTarget.profile.is_active ? 'text-success border-success/40' : 'text-destructive border-destructive/40'}`}>
                      {userActionsTarget.profile.is_active ? '● نشط' : '✕ محظور'}
                    </Badge>
                    {userActionsTarget.subscription && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                        userActionsTarget.subscription.status === 'active' ? 'bg-success/15 text-success border-success/30' :
                        userActionsTarget.subscription.status === 'suspended' ? 'bg-warning/15 text-warning border-warning/30' :
                        'bg-destructive/15 text-destructive border-destructive/30'
                      }`}>
                        {userActionsTarget.subscription.status === 'active' ? 'مشترك' : userActionsTarget.subscription.status === 'suspended' ? 'معلق' : 'منتهي'}
                      </span>
                    )}
                  </div>
                </div>
                {/* معرّفات قابلة للنسخ */}
                <div className="border-t border-border/30 divide-y divide-border/30">
                  {([
                    { label: 'User ID',           value: userActionsTarget.profile.id,                    mono: true  },
                    { label: 'اسم المستخدم',      value: userActionsTarget.profile.username ?? null,      mono: false },
                    { label: 'البريد',             value: userActionsTarget.profile.email ?? null,         mono: false },
                    { label: 'رقم الهاتف',         value: userActionsTarget.profile.phone ?? null,        mono: true  },
                    { label: 'كود الاشتراك',       value: userActionsTarget.license_code ?? null,         mono: true  },
                  ] as { label: string; value: string | null; mono: boolean }[])
                    .filter(r => r.value)
                    .map(row => (
                      <div key={row.label} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="text-[10px] text-muted-foreground shrink-0 w-20">{row.label}</span>
                        <span className={`text-[10px] ${row.mono ? 'font-mono' : 'font-semibold'} flex-1 min-w-0 truncate`}>{row.value}</span>
                        <button className="shrink-0 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => { navigator.clipboard.writeText(row.value!); toast.success(`تم نسخ ${row.label}`); }}>
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>

              {/* ── أزرار الإجراءات ── */}
              {userActionsLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-2">
                  {/* مجموعة: الاشتراك */}
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">الاشتراك</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="h-9 text-xs border-success/30 text-success hover:bg-success/10 gap-1.5"
                      onClick={() => execUserAction(() => renewUserSubscription(userActionsTarget.profile.id, 30, profile?.id), 'تم تجديد الاشتراك 30 يوم')}>
                      <RotateCcw className="w-3.5 h-3.5" /> تجديد 30 يوم
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
                      onClick={() => { setUserActionsOpen(false); setSubEditorTarget(userActionsTarget); setSubEditorDays('30'); setSubEditorOpen(true); }}>
                      <CalendarDays className="w-3.5 h-3.5" /> تمديد مخصص
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs border-warning/30 text-warning hover:bg-warning/10 gap-1.5"
                      disabled={userActionsTarget.subscription?.status === 'suspended'}
                      onClick={() => execUserAction(() => suspendUserSubscription(userActionsTarget.profile.id, true, profile?.id), 'تم تعليق الاشتراك')}>
                      <UserMinus className="w-3.5 h-3.5" /> تعليق
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs border-success/30 text-success hover:bg-success/10 gap-1.5"
                      disabled={userActionsTarget.subscription?.status !== 'suspended'}
                      onClick={() => execUserAction(() => suspendUserSubscription(userActionsTarget.profile.id, false, profile?.id), 'تم رفع التعليق')}>
                      <CheckCircle className="w-3.5 h-3.5" /> رفع التعليق
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5"
                      onClick={() => execUserAction(() => cancelUserSubscription(userActionsTarget.profile.id, profile?.id), 'تم إلغاء الاشتراك')}>
                      <XCircle className="w-3.5 h-3.5" /> إلغاء الاشتراك
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
                      onClick={() => execUserAction(() => reactivateUserSubscription(userActionsTarget.profile.id), 'تمت إعادة التفعيل')}>
                      <ToggleOn className="w-3.5 h-3.5" /> إعادة تفعيل
                    </Button>
                  </div>

                  {/* مجموعة: الكود */}
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5 pt-1">الكود</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="h-9 text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
                      onClick={async () => {
                        const keys = await getAllLicenseKeysUnpaged();
                        setAllKeysForChange(keys);
                        setChangeCodeTarget(userActionsTarget);
                        setChangeCodeKeyId('');
                        setUserActionsOpen(false);
                        setChangeCodeOpen(true);
                      }}>
                      <Key className="w-3.5 h-3.5" /> تغيير الكود
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs border-warning/30 text-warning hover:bg-warning/10 gap-1.5"
                      onClick={() => execUserAction(() => unlinkUserFromCode(userActionsTarget.profile.id, profile?.id), 'تم حذف الربط مع الكود')}>
                      <LinkIcon className="w-3.5 h-3.5" /> حذف الربط
                    </Button>
                  </div>

                  {/* مجموعة: المستخدم */}
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5 pt-1">المستخدم</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="h-9 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5"
                      disabled={!userActionsTarget.profile.is_active}
                      onClick={() => execUserAction(() => banUser(userActionsTarget.profile.id, true, profile?.id), 'تم حظر المستخدم')}>
                      <Ban className="w-3.5 h-3.5" /> حظر
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs border-success/30 text-success hover:bg-success/10 gap-1.5"
                      disabled={userActionsTarget.profile.is_active}
                      onClick={() => execUserAction(() => banUser(userActionsTarget.profile.id, false, profile?.id), 'تم رفع الحظر')}>
                      <CheckCircle className="w-3.5 h-3.5" /> رفع الحظر
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs border-success/30 text-success hover:bg-success/10 gap-1.5 col-span-2"
                      onClick={() => {
                        setAdjustOpsTarget({ userId: userActionsTarget.profile.id, username: userActionsTarget.profile.username ?? '' });
                        setAdjustOpsDelta(''); setAdjustOpsReason('');
                        setUserActionsOpen(false);
                        setAdjustOpsOpen(true);
                      }}>
                      <PlusCircle className="w-3.5 h-3.5" /> تعديل العمليات
                    </Button>
                  </div>

                  {/* حذف نهائي — super_admin فقط */}
                  <div className="pt-1 border-t border-destructive/20">
                    <Button size="sm" variant="outline" className="w-full h-9 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5 font-bold"
                      onClick={() => {
                        setDeleteUserTarget({ id: userActionsTarget.profile.id, name: userActionsTarget.profile.username ?? userActionsTarget.profile.email ?? 'المستخدم' });
                        setUserActionsOpen(false);
                      }}>
                      <UserX className="w-3.5 h-3.5" /> حذف المستخدم نهائياً
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          حذف المستخدم نهائياً — Delete User Complete
      ════════════════════════════════════ */}
      <AlertDialog open={!!deleteUserTarget} onOpenChange={v => { if (!v && !deleteUserLoading) setDeleteUserTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> حذف المستخدم نهائياً
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-right">
              <div className="p-3 rounded-xl bg-destructive/8 border border-destructive/20 space-y-2 mt-2">
                <p className="text-sm font-bold text-foreground">تحذير — لا يمكن التراجع إطلاقاً</p>
                <p className="text-sm text-muted-foreground">سيتم حذف: <strong className="text-foreground">{deleteUserTarget?.name}</strong></p>
                <ul className="text-sm text-muted-foreground space-y-1.5 mt-2">
                  <li className="flex items-start gap-2"><XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>الحساب من المصادقة (Auth)</span></li>
                  <li className="flex items-start gap-2"><XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>الملف الشخصي وبيانات قاعدة البيانات</span></li>
                  <li className="flex items-start gap-2"><XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>الجلسات والرموز المميزة (Sessions & Tokens)</span></li>
                  <li className="flex items-start gap-2"><XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>الإشعارات وسجل الأنشطة والسجلات</span></li>
                  <li className="flex items-start gap-2"><XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>الاشتراكات وجميع البيانات المرتبطة</span></li>
                </ul>
                <p className="text-xs text-destructive font-bold mt-2">إذا كان المستخدم داخل التطبيق سيتم تسجيل خروجه فوراً.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 flex-row-reverse">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 gap-1.5"
              onClick={handleDeleteUserComplete}
              disabled={deleteUserLoading}>
              {deleteUserLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
              تأكيد الحذف النهائي
            </AlertDialogAction>
            <AlertDialogCancel className="h-10" disabled={deleteUserLoading}>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PHASE 11: Subscription Editor */}
      <Dialog open={subEditorOpen} onOpenChange={setSubEditorOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" /> تعديل مدة الاشتراك
            </DialogTitle>
          </DialogHeader>
          {subEditorTarget && (
            <div className="space-y-4 pb-2">
              <p className="text-sm text-muted-foreground">
                المستخدم: <strong>{subEditorTarget.profile.username ?? subEditorTarget.profile.email}</strong>
              </p>
              <div className="space-y-2">
                <Label className="text-sm font-normal text-muted-foreground">إضافة أيام من الآن</Label>
                <div className="grid grid-cols-5 gap-2">
                  {['7','10','30','60','90'].map(d => (
                    <button key={d} onClick={() => setSubEditorDays(d)}
                      className={`py-2 rounded-lg text-sm font-bold border transition-colors ${subEditorDays === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-foreground hover:border-primary/40'}`}>
                      {d}
                    </button>
                  ))}
                </div>
                <Input type="number" min="1" className="bg-background border-border h-10 text-sm"
                  placeholder="أو أدخل عدداً مخصصاً..." value={subEditorDays} onChange={e => setSubEditorDays(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-border" onClick={() => setSubEditorOpen(false)}>إلغاء</Button>
                <Button className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleSubEditorSave} disabled={subEditorSaving}>
                  {subEditorSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تحديث'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PHASE 10: Change Code Dialog */}
      <Dialog open={changeCodeOpen} onOpenChange={setChangeCodeOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-4 h-4 text-warning" /> تغيير الكود
            </DialogTitle>
          </DialogHeader>
          {changeCodeTarget && (
            <div className="space-y-4 pb-2">
              <p className="text-sm text-muted-foreground">المستخدم: <strong>{changeCodeTarget.profile.username ?? changeCodeTarget.profile.email}</strong></p>
              <div className="space-y-2">
                <Label className="text-sm font-normal text-muted-foreground">الكود الجديد</Label>
                <select className="w-full h-10 rounded-lg border border-border bg-background text-sm px-3 text-foreground"
                  value={changeCodeKeyId} onChange={e => setChangeCodeKeyId(e.target.value)}>
                  <option value="">اختر كود...</option>
                  {allKeysForChange.filter(k => k.status === 'active').map(k => (
                    <option key={k.id} value={k.id}>{k.code} ({k.code_type ?? 'paid'} — {k.custom_duration_days ?? k.duration_days}d)</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-border" onClick={() => setChangeCodeOpen(false)}>إلغاء</Button>
                <Button className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleChangeCode} disabled={changeCodeSaving || !changeCodeKeyId}>
                  {changeCodeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تغيير'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          Schedule Notification Dialog
      ════════════════════════════════════ */}
      <Dialog open={scheduleDialog} onOpenChange={setScheduleDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle>جدولة إشعار</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-muted-foreground">الهدف</Label>
                <Select value={schedTargetType} onValueChange={v => setSchedTargetType(v as 'all' | 'specific')}>
                  <SelectTrigger className="bg-card border-border h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الجميع</SelectItem>
                    <SelectItem value="specific">مستخدم محدد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-muted-foreground">الأولوية</Label>
                <Select value={schedPriority} onValueChange={setSchedPriority}>
                  <SelectTrigger className="bg-card border-border h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">عادي</SelectItem>
                    <SelectItem value="important">مهم</SelectItem>
                    <SelectItem value="urgent">عاجل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {schedTargetType === 'specific' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-normal text-muted-foreground">المستخدم</Label>
                <Select value={schedTargetUserId} onValueChange={setSchedTargetUserId}>
                  <SelectTrigger className="bg-card border-border h-9 text-sm"><SelectValue placeholder="اختر مستخدم..." /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    {(usersResult?.data ?? []).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.username ?? p.email ?? p.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">العنوان</Label>
              <Input className="bg-background border-border" value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="عنوان الإشعار" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">المحتوى</Label>
              <Textarea className="bg-background border-border resize-none text-sm" rows={2}
                value={schedBody} onChange={e => setSchedBody(e.target.value)} placeholder="محتوى الإشعار..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-normal text-muted-foreground">وقت الإرسال</Label>
              <Input type="datetime-local" className="bg-background border-border" value={schedAt} onChange={e => setSchedAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-border" onClick={() => setScheduleDialog(false)}>إلغاء</Button>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleScheduleNotif} disabled={schedSaving}>
              {schedSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 ml-1" />جدولة</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════
          Delivery Tracking Dialog
      ════════════════════════════════════ */}
      <Dialog open={deliveryDialog} onOpenChange={setDeliveryDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle>تفاصيل التسليم</DialogTitle></DialogHeader>
          {deliveryLoading ? <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div> : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {deliveryData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات تسليم</p>
              ) : deliveryData.map(d => (
                <div key={d.user_id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{d.profiles?.username ?? d.profiles?.email ?? d.user_id.slice(0, 8) + '...'}</p>
                    <p className="text-[10px] text-muted-foreground">{formatEgyptDateTime(d.delivered_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${d.push_sent ? 'border-success/40 text-success' : 'border-muted-foreground/30 text-muted-foreground'}`}>
                      {d.push_sent ? 'Push ✓' : 'Push ✗'}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${d.opened_at ? 'border-primary/40 text-primary' : 'border-muted-foreground/30 text-muted-foreground'}`}>
                      {d.opened_at ? 'فُتح' : 'لم يُفتح'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-border" onClick={() => setDeliveryDialog(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════ Dialog: تفاصيل العملية — للإدارة فقط ════ */}
      <Dialog open={!!adminOpDetail} onOpenChange={v => { if (!v) setAdminOpDetail(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm font-black flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(0,229,255,0.1)', color: '#00E5FF' }}>ADMIN</span>
              تفاصيل العملية
            </DialogTitle>
          </DialogHeader>
          {adminOpDetail && (() => {
            const op = adminOpDetail.op;
            const infoRows: { label: string; value: string | number | null | undefined }[] = [
              { label: 'رقم العملية',  value: op.operation_number != null ? `#${op.operation_number}` : '—' },
              { label: 'رقم الهاتف',   value: op.phone_number },
              { label: 'المنتج',        value: op.card_type },
              { label: 'المبلغ',        value: op.amount != null ? `${op.amount} ج` : '—' },
              { label: 'الحالة',        value: op.status },
              { label: 'التاريخ',       value: formatEgyptDateTime(op.performed_at) },
              { label: 'مدة التنفيذ',  value: op.duration_ms != null ? `${op.duration_ms} ms` : '—' },
            ];
            return (
              <div className="space-y-4 mt-2">
                <div className="rounded-lg border overflow-hidden divide-y divide-border/40">
                  {infoRows.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <span className="text-muted-foreground w-24 shrink-0">{r.label}</span>
                      <span className="font-mono font-semibold flex-1 min-w-0 break-all">{String(r.value ?? '—')}</span>
                    </div>
                  ))}
                </div>
                {op.api_response && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">API Response</p>
                    <pre className="text-[10px] font-mono bg-muted/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-border/30 max-h-40">
                      {op.api_response}
                    </pre>
                  </div>
                )}
                {op.error_message && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-destructive tracking-widest uppercase">Error Message (Raw)</p>
                    <pre className="text-[10px] font-mono bg-destructive/5 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-destructive/20 max-h-40 text-destructive/80">
                      {op.error_message}
                    </pre>
                  </div>
                )}
                <Button variant="outline" className="w-full border-border" onClick={() => setAdminOpDetail(null)}>إغلاق</Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

    </div>
  );
}
