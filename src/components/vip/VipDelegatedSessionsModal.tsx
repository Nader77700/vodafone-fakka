import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  Search,
  Activity,
  Flame,
  CheckCircle2,
  PauseCircle,
  Crown,
  Zap,
  RotateCcw,
  ExternalLink,
  Archive,
  Clock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { VipSession } from '@/types/vip';
import { vipRunnerService } from '@/lib/vipRunnerService';
import { archiveVipSession } from '@/lib/vipApi';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: VipSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onSessionsChanged: () => void;
}

export const VipDelegatedSessionsModal: React.FC<Props> = ({
  open,
  onOpenChange,
  sessions,
  activeSessionId,
  onSelectSession,
  onSessionsChanged,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'completed' | 'paused'>('all');
  const [archivingId, setArchivingId] = useState<string | null>(null);

  // Filter only delegated user sessions
  const delegatedSessions = useMemo(() => {
    return sessions.filter((s) => s.is_delegated_session);
  }, [sessions]);

  // Statistics calculation
  const stats = useMemo(() => {
    let running = 0;
    let completed = 0;
    let paused = 0;

    delegatedSessions.forEach((sess) => {
      const runnerState = vipRunnerService.getState(sess.id);
      const isRunning = runnerState.isRunning;
      const target = sess.target_mix_balance || 50000;
      const balance = Math.max(runnerState.latestOwnerMix || 0, sess.owner_mix_balance || 0);

      if (isRunning) {
        running++;
      } else if (balance >= target && target > 0) {
        completed++;
      } else {
        paused++;
      }
    });

    return {
      total: delegatedSessions.length,
      running,
      completed,
      paused,
    };
  }, [delegatedSessions]);

  // Filtered list
  const filteredSessions = useMemo(() => {
    return delegatedSessions.filter((sess) => {
      const runnerState = vipRunnerService.getState(sess.id);
      const isRunning = runnerState.isRunning;
      const target = sess.target_mix_balance || 50000;
      const balance = Math.max(runnerState.latestOwnerMix || 0, sess.owner_mix_balance || 0);
      const isCompleted = balance >= target && target > 0;

      // Status filter
      if (statusFilter === 'running' && !isRunning) return false;
      if (statusFilter === 'completed' && !isCompleted) return false;
      if (statusFilter === 'paused' && (isRunning || isCompleted)) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const nameMatch = sess.session_name?.toLowerCase().includes(q);
        const userMatch =
          sess.creator_user_name?.toLowerCase().includes(q) ||
          sess.creator_user_email?.toLowerCase().includes(q);
        const ownerMatch =
          sess.owner_account_identifier?.includes(q) ||
          sess.owner_email?.toLowerCase().includes(q);
        const childMatch =
          sess.individual_account_identifier?.includes(q) ||
          sess.individual_email?.toLowerCase().includes(q);

        return nameMatch || userMatch || ownerMatch || childMatch;
      }

      return true;
    });
  }, [delegatedSessions, statusFilter, search]);

  const handleArchive = async (sess: VipSession) => {
    if (!confirm(`هل أنت متأكد من أرشفة جلسة «${sess.session_name}» الخاصة بالمستخدم ${sess.creator_user_name || sess.creator_user_email}؟`)) {
      return;
    }

    setArchivingId(sess.id);
    try {
      const res = await archiveVipSession(sess.id);
      if (res.success) {
        toast.success(`تم أرشفة جلسة «${sess.session_name}» بنجاح.`);
        onSessionsChanged();
      }
    } catch (err: any) {
      toast.error('فشل الأرشفة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setArchivingId(null);
    }
  };

  const handleSelectAndClose = (sessionId: string) => {
    onSelectSession(sessionId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] md:max-w-4xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6"
        dir="rtl"
      >
        <DialogHeader className="text-right border-b border-border/60 pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-black text-foreground flex items-center gap-2">
                  <span>مركز مراقبة وإشراف جلسات المستخدمين</span>
                  <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 text-xs font-mono">
                    {stats.total} جلسة
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  لوحة مراقبة شاملة للمالك لعرض ومتابعة كافة جلسات المستخدمين المفوضين وحالتها الحية
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">
          <div
            onClick={() => setStatusFilter('all')}
            className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
              statusFilter === 'all'
                ? 'bg-primary/10 border-primary ring-1 ring-primary/30'
                : 'bg-card border-border/70 hover:border-primary/40'
            }`}
          >
            <span className="text-[11px] text-muted-foreground block font-medium">إجمالي الجلسات</span>
            <span className="text-xl font-black text-foreground mt-0.5 block">{stats.total}</span>
          </div>

          <div
            onClick={() => setStatusFilter('running')}
            className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
              statusFilter === 'running'
                ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500/30'
                : 'bg-card border-border/70 hover:border-emerald-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-emerald-400 block font-medium">شغالة بالخلفية ⚡</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <span className="text-xl font-black text-emerald-400 mt-0.5 block">{stats.running}</span>
          </div>

          <div
            onClick={() => setStatusFilter('completed')}
            className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
              statusFilter === 'completed'
                ? 'bg-blue-500/15 border-blue-500 ring-1 ring-blue-500/30'
                : 'bg-card border-border/70 hover:border-blue-500/40'
            }`}
          >
            <span className="text-[11px] text-blue-400 block font-medium">مكتملة الهدف ✓</span>
            <span className="text-xl font-black text-blue-400 mt-0.5 block">{stats.completed}</span>
          </div>

          <div
            onClick={() => setStatusFilter('paused')}
            className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
              statusFilter === 'paused'
                ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500/30'
                : 'bg-card border-border/70 hover:border-amber-500/40'
            }`}
          >
            <span className="text-[11px] text-amber-400 block font-medium">متوقفة / جاهزة</span>
            <span className="text-xl font-black text-amber-400 mt-0.5 block">{stats.paused}</span>
          </div>
        </div>

        {/* ── Search Bar ── */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم المستخدم أو البريد أو اسم الجلسة أو رقم الخط..."
            className="text-xs h-9 pr-9"
          />
        </div>

        {/* ── Delegated Sessions List ── */}
        <div className="space-y-3">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-dashed border-border/80 bg-card/40 space-y-2">
              <Users className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-bold text-foreground">لا توجد جلسات مستخدمين مطابقة</p>
              <p className="text-xs text-muted-foreground">
                {delegatedSessions.length === 0
                  ? 'لم يقم أي مستخدم مفوض بإنشاء جلسة حتى الآن. الجلسات التي ينشئها المستخدمون ستظهر هنا للمراقبة والتحكم.'
                  : 'جرّب تغيير معيار البحث أو فلتر الحالة.'}
              </p>
            </div>
          ) : (
            filteredSessions.map((sess) => {
              const runnerState = vipRunnerService.getState(sess.id);
              const isRunning = runnerState.isRunning;
              const target = sess.target_mix_balance || 50000;
              const currentMix = Math.max(runnerState.latestOwnerMix || 0, sess.owner_mix_balance || 0);
              const progressPct = Math.min(100, Math.round((currentMix / target) * 100));
              const isCompleted = currentMix >= target && target > 0;
              const isSelected = sess.id === activeSessionId;

              return (
                <div
                  key={sess.id}
                  className={`rounded-xl border p-3.5 transition-all text-right ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border/80 bg-card hover:border-primary/50'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-border/50">
                    {/* User & Session Name */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/30 text-[11px] font-bold px-2 py-0.5">
                          المستخدم: {sess.creator_user_name || sess.creator_user_email || 'مستخدم مفوض'}
                        </Badge>
                        <span className="text-xs font-black text-foreground">{sess.session_name}</span>
                        {isSelected && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                            المعروضة بالرئيسية
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-3">
                        <span>معرف الجلسة: {sess.id}</span>
                        {sess.creator_user_email && (
                          <span className="text-zinc-400 font-sans">({sess.creator_user_email})</span>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isRunning ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-2 py-0.5 font-bold flex items-center gap-1.5 animate-pulse">
                          <Flame className="w-3.5 h-3.5 text-emerald-400" />
                          <span>شغالة الآن ⚡</span>
                        </Badge>
                      ) : isCompleted ? (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs px-2 py-0.5 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                          <span>مكتملة الهدف</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground px-2 py-0.5">
                          <PauseCircle className="w-3.5 h-3.5 ml-1 text-muted-foreground" />
                          <span>متوقفة</span>
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-2.5 text-xs">
                    {/* Owner Line */}
                    <div className="bg-muted/30 p-2 rounded-lg border border-border/40">
                      <span className="text-[10px] text-muted-foreground block">خط الأونر:</span>
                      <span className="font-mono font-bold text-foreground text-xs" dir="ltr">
                        {sess.owner_account_identifier || sess.owner_email || 'قيد الاستخراج'}
                      </span>
                    </div>

                    {/* Child Line */}
                    <div className="bg-muted/30 p-2 rounded-lg border border-border/40">
                      <span className="text-[10px] text-muted-foreground block">خط الفرد التابع:</span>
                      <span className="font-mono font-bold text-foreground text-xs" dir="ltr">
                        {sess.individual_account_identifier || sess.individual_email || 'غير مضاف'}
                      </span>
                    </div>

                    {/* Progress & Target */}
                    <div className="bg-muted/30 p-2 rounded-lg border border-border/40 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">الرصيد المحقق:</span>
                        <span className="font-mono font-bold text-foreground">
                          {currentMix.toLocaleString('ar-EG')} / {target.toLocaleString('ar-EG')}
                        </span>
                      </div>
                      <Progress value={progressPct} className="h-1.5" />
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40 flex-wrap">
                    <div className="text-[11px] text-muted-foreground">
                      كولداون: {sess.cycle_delay_seconds || 20} ثانية • الباقة:{' '}
                      {(sess.target_mix_balance || 50000).toLocaleString('ar-EG')} ميكس
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleArchive(sess)}
                        disabled={archivingId === sess.id}
                        className="h-7 text-xs text-amber-500 border-amber-500/30 hover:bg-amber-500/10 px-2"
                      >
                        <Archive className="w-3 h-3 ml-1" />
                        <span>أرشفة</span>
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleSelectAndClose(sess.id)}
                        className="h-7 text-xs font-bold gap-1 bg-primary text-primary-foreground hover:bg-primary/90 px-3"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>التحكم في الجلسة بالرئيسية</span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
