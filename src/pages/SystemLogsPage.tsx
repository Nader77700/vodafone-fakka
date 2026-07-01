// صفحة سجلات النظام الشاملة
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getSystemLogs } from '@/lib/api';
import type { SystemLog } from '@/types/types';
import { toast } from 'sonner';
import {
  Shield, RefreshCw, ChevronLeft, ChevronRight,
  AlertTriangle, Info, XCircle, CheckCircle, Zap, User, Key, Gift, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
<<<<<<< HEAD
import { formatEgyptDateTime } from '@/lib/egyptTime';
=======
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)

const LOG_LEVEL_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  info:    { label: 'معلومات', icon: Info,          cls: 'bg-primary/10 text-primary border-primary/20' },
  warning: { label: 'تحذير',   icon: AlertTriangle,  cls: 'bg-warning/10 text-warning border-warning/20' },
  error:   { label: 'خطأ',     icon: XCircle,        cls: 'bg-destructive/10 text-destructive border-destructive/20' },
  success: { label: 'نجاح',    icon: CheckCircle,    cls: 'bg-success/10 text-success border-success/20' },
};

const ACTION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  activation:    Key,
  subscription:  Zap,
  recharge:      Zap,
  gift:          Gift,
  admin:         Shield,
  session:       User,
  operation:     Zap,
  system:        Info,
};

function getActionIcon(action: string) {
  for (const key of Object.keys(ACTION_ICON)) {
    if (action.toLowerCase().includes(key)) return ACTION_ICON[key];
  }
  return Info;
}

const PAGE_SIZE = 30;

export default function SystemLogsPage() {
  const { profile } = useAuth();
  const navigate     = useNavigate();

  const [logs, setLogs]           = useState<SystemLog[]>([]);
  const [loading, setLoading]     = useState(false);
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);
  const [search, setSearch]       = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [draftSearch, setDraftSearch] = useState('');

  const isAdmin = profile?.role === 'admin';

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const result = await getSystemLogs({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        level: levelFilter !== 'all' ? levelFilter : undefined,
      });
      setLogs(Array.isArray(result.data) ? result.data : []);
      setTotal(result.count ?? 0);
    } catch {
      toast.error('خطأ في تحميل السجلات');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, search, levelFilter]);

  useEffect(() => {
    if (!isAdmin) { navigate('/home'); return; }
    load();
  }, [isAdmin, load, navigate]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearch = () => {
    setSearch(draftSearch);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/admin')}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold truncate">سجلات النظام</h1>
            <p className="text-[10px] text-muted-foreground">{total.toLocaleString()} سجل</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* فلاتر */}
        <div className="flex gap-2 px-4 pb-3">
          <div className="flex-1 flex gap-1.5">
            <Input
              className="h-8 text-xs bg-background border-border"
              placeholder="بحث في السجلات..."
              value={draftSearch}
              onChange={e => setDraftSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={handleSearch}>
              <Search className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Select value={levelFilter} onValueChange={v => { setLevelFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 text-xs w-28 bg-background border-border">
              <SelectValue placeholder="المستوى" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="info">معلومات</SelectItem>
              <SelectItem value="warning">تحذير</SelectItem>
              <SelectItem value="error">خطأ</SelectItem>
              <SelectItem value="success">نجاح</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* القائمة */}
      <div className="px-4 py-3 space-y-2">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
          ))
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Info className="w-10 h-10 opacity-30" />
            <p className="text-sm">لا توجد سجلات</p>
          </div>
        ) : (
          logs.map(log => {
            const lvl = LOG_LEVEL_CONFIG[log.level ?? 'info'] ?? LOG_LEVEL_CONFIG.info;
            const LevelIcon = lvl.icon;
            const ActionIcon = getActionIcon(log.action ?? '');
            return (
              <div key={log.id} className="p-3 rounded-xl border border-border bg-card space-y-1.5">
                <div className="flex items-start gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${lvl.cls}`}>
                    <LevelIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold truncate">{log.action ?? '—'}</span>
                      <Badge variant="outline" className={`text-[9px] py-0 px-1.5 h-4 border ${lvl.cls}`}>
                        {lvl.label}
                      </Badge>
                    </div>
                    {log.message && (
                      <p className="text-[11px] text-muted-foreground leading-snug text-pretty">{log.message}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {log.user_id && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <User className="w-2.5 h-2.5" />
                          {log.user_id.slice(0, 8)}…
                        </span>
                      )}
                      {log.action && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <ActionIcon className="w-2.5 h-2.5" />
                          {log.action}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
<<<<<<< HEAD
                    {formatEgyptDateTime(log.created_at)}
=======
                    {new Date(log.created_at).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
>>>>>>> 5aac87b (Initial miaoda project setup with React TypeScript Vite template)
                  </span>
                </div>
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">عرض التفاصيل</summary>
                    <pre className="text-[10px] bg-muted/30 rounded p-2 mt-1 overflow-x-auto text-muted-foreground leading-relaxed">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-4">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">{page} / {totalPages}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
