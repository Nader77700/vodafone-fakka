// صفحة الإشعارات الكاملة لمستخدم — /admin/users/:id/notifications
// عرض paginated (20 لكل صفحة) + حذف فردي + حذف الكل
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, Trash2, RefreshCw, ChevronLeft,
  ChevronRight, Loader2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import AdminShell, { SectionCard } from '@/components/admin/AdminShell';
import {
  getAdminUserNotificationsPaginated,
  deleteNotification,
  deleteAllUserNotifications,
  getUserDetail,
} from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { Notification } from '@/types/types';

const PAGE_SIZE = 20;

function fmt(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy HH:mm', { locale: ar }); } catch { return d; }
}

export default function AdminUserNotificationsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal]                 = useState(0);
  const [page, setPage]                   = useState(1);
  const [loading, setLoading]             = useState(true);
  const [username, setUsername]           = useState<string>('');
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [deletingAll, setDeletingAll]     = useState(false);

  // جلب اسم المستخدم مرة واحدة
  useEffect(() => {
    if (!id) return;
    getUserDetail(id).then(d => setUsername(d.profile.username ?? d.profile.email ?? id)).catch(() => {});
  }, [id]);

  const load = useCallback(async (p = page) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, count } = await getAdminUserNotificationsPaginated(id, p, PAGE_SIZE);
      setNotifications(data);
      setTotal(count);
    } catch {
      toast.error('فشل تحميل الإشعارات');
    } finally {
      setLoading(false);
    }
  }, [id, page]);

  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (notifId: string) => {
    setDeletingId(notifId);
    const { error } = await deleteNotification(notifId);
    if (error) toast.error('فشل حذف الإشعار');
    else { toast.success('تم حذف الإشعار'); load(page); }
    setDeletingId(null);
  };

  const handleDeleteAll = async () => {
    if (!id) return;
    if (!window.confirm('هل أنت متأكد من حذف جميع إشعارات هذا المستخدم؟ لا يمكن التراجع.')) return;
    setDeletingAll(true);
    await deleteAllUserNotifications(id);
    toast.success('تم حذف جميع الإشعارات');
    setDeletingAll(false);
    setPage(1);
    load(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell
      title={`إشعارات: @${username}`}
      subtitle={`${total} إشعار إجمالاً`}
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/admin' },
        { label: 'المستخدمون',   href: '/admin' },
        { label: username || id || '...', href: `/admin/users/${id}` },
        { label: 'الإشعارات' },
      ]}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => load(page)} className="h-8 gap-1 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </Button>
          <Button size="sm" variant="outline"
            className="h-8 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={handleDeleteAll} disabled={deletingAll || total === 0}>
            {deletingAll
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جارٍ الحذف</>
              : <><Trash2  className="w-3.5 h-3.5" /> حذف الكل</>}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/users/${id}`)} className="h-8 gap-1 text-xs">
            <ChevronRight className="w-3.5 h-3.5" /> عودة لتفاصيل المستخدم
          </Button>
        </div>
      }
    >
      <SectionCard title={`الإشعارات — صفحة ${page} من ${totalPages}`} icon={Bell}>
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl bg-muted" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <BellOff className="w-10 h-10 opacity-40" />
            <p className="text-sm">لا توجد إشعارات</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {notifications.map(n => (
                <div key={n.id} className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border transition-colors',
                  n.is_read
                    ? 'border-border bg-muted/10 opacity-75'
                    : 'border-primary/20 bg-primary/5'
                )}>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold line-clamp-1">
                        {n.title || 'إشعار بدون عنوان'}
                      </p>
                      {!n.is_read && (
                        <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold shrink-0">
                          جديد
                        </span>
                      )}
                    </div>
                    {n.body && (
                      <p className="text-[10px] text-muted-foreground line-clamp-3">{n.body}</p>
                    )}
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-[10px] text-muted-foreground">{fmt(n.created_at)}</span>
                      {n.type && (
                        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                          {n.type}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost"
                    className="h-7 w-7 p-0 shrink-0 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(n.id)}
                    disabled={deletingId === n.id}>
                    {deletingId === n.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2  className="w-3 h-3" />}
                  </Button>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} من {total}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 w-8 p-0"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs font-semibold min-w-[60px] text-center">
                  {page} / {totalPages}
                </span>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </AdminShell>
  );
}
