// صفحة الإشعارات — مركز الإشعارات الكامل مع بحث وفلتر
import AppFooter from '@/components/common/AppFooter';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  getUserNotifications, markNotificationRead, markAllNotificationsRead,
  softDeleteNotification, softDeleteAllNotifications,
} from '@/lib/api';
import { supabase } from '@/db/supabase';
import type { Notification, NotificationType } from '@/types/types';
import {
  Bell, RefreshCw, Info, Settings, CreditCard, CheckCheck, Trash2,
  Megaphone, Shield, Wrench, Tag, Zap, Download, CheckCircle2, MessageSquare, Mail,
  Search, X, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
<<<<<<< HEAD
import { formatEgyptDateTime } from '@/lib/egyptTime';
=======
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
import { toast } from 'sonner';

const TYPE_CONFIG: Record<NotificationType, { icon: React.FC<{ className?: string }>; cls: string; label: string }> = {
  subscription_renewal:   { icon: RefreshCw,     cls: 'text-warning bg-warning/10 border-warning/20',    label: 'تجديد' },
  subscription_expiry:    { icon: RefreshCw,     cls: 'text-destructive bg-destructive/10 border-destructive/20', label: 'انتهاء' },
  subscription_activated: { icon: CheckCircle2,  cls: 'text-success bg-success/10 border-success/20',    label: 'تفعيل' },
  subscription_failed:    { icon: Zap,           cls: 'text-destructive bg-destructive/10 border-destructive/20', label: 'فشل' },
  update_available:       { icon: Download,      cls: 'text-info bg-info/10 border-info/20',             label: 'تحديث' },
  update_downloaded:      { icon: Download,      cls: 'text-info bg-info/10 border-info/20',             label: 'تحديث' },
  update_installed:       { icon: CheckCircle2,  cls: 'text-success bg-success/10 border-success/20',    label: 'تثبيت' },
  update_critical:        { icon: Zap,           cls: 'text-destructive bg-destructive/10 border-destructive/20', label: 'عاجل' },
  system:                 { icon: Settings,      cls: 'text-info bg-info/10 border-info/20',             label: 'نظام' },
  operation:              { icon: CreditCard,    cls: 'text-primary bg-primary/10 border-primary/20',   label: 'عملية' },
  info:                   { icon: Info,          cls: 'text-success bg-success/10 border-success/20',   label: 'معلومة' },
  message:                { icon: MessageSquare, cls: 'text-primary bg-primary/10 border-primary/20',   label: 'رسالة' },
  security:               { icon: Shield,        cls: 'text-destructive bg-destructive/10 border-destructive/20', label: 'أمان' },
  maintenance:            { icon: Wrench,        cls: 'text-warning bg-warning/10 border-warning/20',   label: 'صيانة' },
  announcement:           { icon: Megaphone,     cls: 'text-info bg-info/10 border-info/20',            label: 'إعلان' },
  offer:                  { icon: Tag,           cls: 'text-success bg-success/10 border-success/20',   label: 'عرض' },
};

const PRIORITY_CONFIG = {
  normal:    { label: '',       cls: '' },
  important: { label: 'مهم',   cls: 'border-warning/40 text-warning bg-warning/10' },
  urgent:    { label: 'عاجل',  cls: 'border-destructive/40 text-destructive bg-destructive/10' },
};

const TYPE_FILTER_OPTIONS = [
  { value: 'all',                    label: 'الكل' },
  { value: 'subscription_renewal',   label: 'تجديد' },
  { value: 'subscription_expiry',    label: 'انتهاء' },
  { value: 'subscription_activated', label: 'تفعيل' },
  { value: 'update_available',       label: 'تحديث' },
  { value: 'offer',                  label: 'عروض' },
  { value: 'system',                 label: 'نظام' },
  { value: 'announcement',           label: 'إعلانات' },
  { value: 'security',               label: 'أمان' },
  { value: 'info',                   label: 'معلومات' },
  { value: 'operation',              label: 'عمليات' },
];

type FilterTab = 'all' | 'unread' | 'read';

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} س`;
<<<<<<< HEAD
  return formatEgyptDateTime(d);
=======
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
}

export default function NotificationsPage() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // تمرير تاريخ إنشاء المستخدم لفلترة الإشعارات القديمة — يمنع ظهور إشعارات قبل تسجيل المستخدم
    const data = await getUserNotifications(user.id, profile?.created_at ?? undefined);
    setNotifications(data);
    setLoading(false);
  }, [user, profile?.created_at]);

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel(`notifications-page-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, payload => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, payload => {
        const updated = payload.new as Notification;
        if (updated.deleted_at) {
          setNotifications(prev => prev.filter(n => n.id !== updated.id));
        } else {
          setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAll = async () => {
    if (!user) return;
    await markAllNotificationsRead(user.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success('تم تحديد الكل كمقروء');
  };

  const handleDelete = async (id: string) => {
    await softDeleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleDeleteAll = async () => {
    if (!user) return;
    await softDeleteAllNotifications(user.id);
    setNotifications([]);
    toast.success('تم حذف جميع الإشعارات');
  };

  const handleOpen = (notif: Notification) => {
    if (!notif.is_read) handleMarkRead(notif.id);
    if (notif.action_url) navigate(notif.action_url);
  };

  const displayed = notifications.filter(n => {
    if (activeTab === 'unread' && n.is_read) return false;
    if (activeTab === 'read'   && !n.is_read) return false;
    if (typeFilter !== 'all'   && n.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    }
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const hasActiveFilter = typeFilter !== 'all' || search.trim().length > 0;

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all',    label: 'الكل' },
    { id: 'unread', label: 'غير مقروءة' },
    { id: 'read',   label: 'مقروءة' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bell className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-xl font-black truncate">الإشعارات</h1>
          {unreadCount > 0 && (
            <span className="min-w-[20px] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={() => setShowFilters(v => !v)} title="فلترة">
            <Filter className={cn('w-4 h-4', showFilters && 'text-primary')} />
          </Button>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-primary gap-1 px-2" onClick={handleMarkAll}>
              <CheckCheck className="w-3.5 h-3.5" /> <span className="hidden md:inline">تحديد الكل مقروء</span>
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive gap-1 px-2" onClick={handleDeleteAll}>
              <Trash2 className="w-3.5 h-3.5" /> <span className="hidden md:inline">حذف الكل</span>
            </Button>
          )}
        </div>
      </div>

      {/* Search + Filter panel */}
      {showFilters && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث في الإشعارات..."
              className="bg-background border-border pr-9 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          {/* Type chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 whitespace-nowrap">
            {TYPE_FILTER_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setTypeFilter(opt.value)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0',
                  typeFilter === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                )}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active filter badge */}
      {hasActiveFilter && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{displayed.length} نتيجة</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-muted-foreground gap-1"
            onClick={() => { setSearch(''); setTypeFilter('all'); }}>
            <X className="w-3 h-3" /> مسح الفلتر
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl">
        {TABS.map(tab => {
          const count = tab.id === 'unread' ? unreadCount : tab.id === 'read' ? notifications.length - unreadCount : notifications.length;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
                  activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Mail className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold">
            {hasActiveFilter ? 'لا نتائج تطابق البحث' :
             activeTab === 'unread' ? 'لا توجد إشعارات غير مقروءة' :
             activeTab === 'read'   ? 'لا توجد إشعارات مقروءة' :
             'لا توجد إشعارات'}
          </p>
          <p className="text-xs text-muted-foreground">ستظهر هنا التنبيهات والرسائل</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(notif => {
            const config = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.info;
            const Icon = config.icon;
            const prio = PRIORITY_CONFIG[notif.priority ?? 'normal'];
            const hasLink = !!notif.action_url;
            return (
              <div
                key={notif.id}
                className={cn(
                  'card-premium p-3.5 flex gap-3 transition-all',
                  !notif.is_read && 'border-primary/20 bg-primary/5'
                )}
              >
                {/* Icon */}
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border', config.cls)}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm font-semibold text-pretty leading-snug', !notif.is_read && 'text-foreground')}>
                      {notif.title}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      {!notif.is_read && <div className="w-2 h-2 rounded-full bg-primary" />}
                      <span className="text-[10px] text-muted-foreground tabular-nums">{formatTime(notif.created_at)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-pretty leading-relaxed">
                    {/* تفاصيل التحديث للأدمن فقط — المستخدم العادي يرى رسالة عامة */}
                    {(notif.type === 'update_available' || notif.type === 'update_downloaded' || notif.title?.includes('تحديث'))
                      ? (isAdmin ? notif.body : 'يتوفر إصدار جديد من التطبيق — اضغط لتحميله')
                      : notif.body}
                  </p>
                  {/* Tags row */}
                  <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', config.cls)}>{config.label}</span>
                    {prio.label && <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', prio.cls)}>{prio.label}</span>}
                    {hasLink && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium text-primary border-primary/30 bg-primary/5">
                        🔗 {notif.action_url}
                      </span>
                    )}
                  </div>
                  {/* Open link button */}
                  {hasLink && (
                    <button
                      onClick={() => handleOpen(notif)}
                      className="mt-1.5 text-[11px] font-semibold text-primary hover:underline"
                    >
                      فتح ←
                    </button>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 shrink-0">
                  {!notif.is_read && (
                    <button
                      onClick={() => handleMarkRead(notif.id)}
                      className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                      title="تحديد كمقروء"
                    >
                      <CheckCheck className="w-3.5 h-3.5 text-primary" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(notif.id)}
                    className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                    title="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <AppFooter />
    </div>
  );
}
