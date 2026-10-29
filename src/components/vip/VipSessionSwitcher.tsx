import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Mail,
  Eye,
  EyeOff,
  Zap,
  Timer,
  Bot,
  Users,
  Sparkles,
  Loader2,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  RotateCcw,
  Crown,
  CheckCircle2,
  ArrowRightLeft,
  Radio,
  Flame,
  Edit2,
  Lock,
} from 'lucide-react';
import type { VipSession } from '@/types/vip';
import { vipRunnerService } from '@/lib/vipRunnerService';
import { Progress } from '@/components/ui/progress';
import { VipSessionEditModal } from './VipSessionEditModal';
import {
  createVipSession,
  archiveVipSession,
  unarchiveVipSession,
  listArchivedVipSessions,
  hardDeleteVipSession,
  hardDeleteAllArchivedVipSessions,
  deleteAllVipSessions,
  getVipDefaultChildCredentials,
  executeVipCheckStatus,
} from '@/lib/vipApi';
import { VipDefaultChildModal } from '@/components/vip/VipDefaultChildModal';
import { VipDelegatedSessionsModal } from './VipDelegatedSessionsModal';

interface Props {
  sessions: VipSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onSessionsChanged: () => void;
  disabled?: boolean;
  isDelegatedUser?: boolean;
  vipAccess?: any;
}

export function VipSessionSwitcher({
  sessions,
  activeSessionId,
  onSelectSession,
  onSessionsChanged,
  disabled = false,
  isDelegatedUser = false,
  vipAccess = null,
}: Props) {
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openArchiveModal, setOpenArchiveModal] = useState(false);
  const [openArchiveListModal, setOpenArchiveListModal] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<VipSession[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [openDeleteAllModal, setOpenDeleteAllModal] = useState(false);
  const [archiveScope, setArchiveScope] = useState<'owner_only' | 'completed_only' | 'all'>('owner_only');
  const [openDefaultChildModal, setOpenDefaultChildModal] = useState(false);
  const [openEditCredsModal, setOpenEditCredsModal] = useState(false);
  const [openDelegatedModal, setOpenDelegatedModal] = useState(false);
  const [hideDelegatedSessions, setHideDelegatedSessions] = useState(() => {
    try {
      return localStorage.getItem('vip_hide_delegated_sessions') === 'true';
    } catch {
      return false;
    }
  });
  const [editSessionTarget, setEditSessionTarget] = useState<VipSession | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // New session form states matching EtisalatBot script
  const [sessionName, setSessionName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [individualEmail, setIndividualEmail] = useState('');
  const [individualPassword, setIndividualPassword] = useState('');
  const [targetPreset, setTargetPreset] = useState('100000');
  const [customTarget, setCustomTarget] = useState('');
  const [cycleDelaySeconds, setCycleDelaySeconds] = useState(20);
  const [description, setDescription] = useState('');

  // Password visibility toggles
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [showIndivPassword, setShowIndivPassword] = useState(false);
  const [isChildPreFilled, setIsChildPreFilled] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  // Count delegated user sessions
  const delegatedSessionsCount = useMemo(() => {
    return sessions.filter((s) => s.is_delegated_session).length;
  }, [sessions]);

  const ownerSessionsCount = useMemo(() => {
    return sessions.filter((s) => !s.is_delegated_session).length;
  }, [sessions]);

  const activeRunningSessionsCount = useMemo(() => {
    return sessions.filter((s) => {
      const rs = vipRunnerService.getState(s.id);
      return rs.isRunning;
    }).length;
  }, [sessions]);

  const completedSessionsCount = useMemo(() => {
    return sessions.filter((s) => {
      const ownerMix = s.owner_mix_balance || 0;
      const targetMix = s.target_mix_balance || 50000;
      return ownerMix >= targetMix || s.operation_state === 'completed';
    }).length;
  }, [sessions]);

  const inProgressSessionsCount = Math.max(0, sessions.length - completedSessionsCount);

  // Determine sessions visible to current viewer
  const visibleSessions = useMemo(() => {
    if (!isDelegatedUser && hideDelegatedSessions && delegatedSessionsCount > 0) {
      const filtered = sessions.filter((s) => !s.is_delegated_session);
      return filtered.length > 0 ? filtered : sessions;
    }
    return sessions;
  }, [sessions, isDelegatedUser, hideDelegatedSessions, delegatedSessionsCount]);

  // Restrict packages and cooldown if user is delegated
  const allowedPkgs: number[] = useMemo(() => {
    if (!isDelegatedUser) return [50000, 100000, 150000, 200000];
    if (vipAccess?.allowed_packages && Array.isArray(vipAccess.allowed_packages) && vipAccess.allowed_packages.length > 0) {
      return vipAccess.allowed_packages;
    }
    return [50000];
  }, [isDelegatedUser, vipAccess?.allowed_packages]);

  // Listen to runner service across all sessions so cards update their live balances and running badges in real time
  const [, setRunnerTick] = useState(0);
  useEffect(() => {
    const unsubs = sessions.map((s) =>
      vipRunnerService.subscribe(s.id, () => {
        setRunnerTick((prev) => prev + 1);
      })
    );
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [sessions]);

  // Auto-fill child credentials from saved defaults when opening add modal
  useEffect(() => {
    if (openAddModal) {
      if (isDelegatedUser) {
        setTargetPreset(String(allowedPkgs[0] || 50000));
        setCycleDelaySeconds(vipAccess?.cooldown_seconds || 30);
      }
      getVipDefaultChildCredentials()
        .then((res) => {
          if (res && res.child_email) {
            setIndividualEmail(res.child_email);
            if (res.child_password) setIndividualPassword(res.child_password);
            setIsChildPreFilled(true);
          } else {
            setIsChildPreFilled(false);
          }
        })
        .catch(() => {});
    }
  }, [openAddModal, isDelegatedUser, allowedPkgs, vipAccess?.cooldown_seconds]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ownerEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني لحساب الأونر');
      return;
    }
    if (!ownerPassword.trim()) {
      toast.error('يرجى إدخال كلمة مرور حساب الأونر');
      return;
    }
    if (!individualEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني لحساب الفرد');
      return;
    }
    if (!individualPassword.trim()) {
      toast.error('يرجى إدخال كلمة مرور حساب الفرد');
      return;
    }

    let finalTarget = 50000;
    if (targetPreset === 'custom' && !isDelegatedUser) {
      const parsed = parseInt(customTarget, 10);
      if (isNaN(parsed) || parsed <= 0) {
        toast.error('يرجى إدخال رقم صحيح وموجب لهدف الميكسات');
        return;
      }
      finalTarget = parsed;
    } else {
      finalTarget = parseInt(targetPreset, 10);
    }

    // Zero-Trust client validation
    if (isDelegatedUser) {
      if (!allowedPkgs.includes(finalTarget)) {
        toast.error(`باقة ${finalTarget.toLocaleString('ar-EG')} ميكس غير مسموحة لحسابك. الباقات المصرح بها: ${allowedPkgs.map((p) => p.toLocaleString('ar-EG')).join('، ')} ميكس`);
        return;
      }
    }

    const minDelay = isDelegatedUser ? (vipAccess?.cooldown_seconds || 30) : 0;
    const delay = isDelegatedUser ? minDelay : (cycleDelaySeconds < 0 ? 20 : cycleDelaySeconds);

    setSubmitting(true);
    try {
      const res = await createVipSession({
        session_name: sessionName.trim() || undefined,
        owner_email: ownerEmail.trim(),
        owner_password: ownerPassword.trim(),
        individual_email: individualEmail.trim(),
        individual_password: individualPassword.trim(),
        target_balance: finalTarget,
        cycle_delay_seconds: delay,
        description: description.trim() || undefined,
      });

      if (res.success && res.session) {
        toast.success(`تم إنشاء جلسة اتصالات VIP «${res.session.session_name}» بنجاح.`);
        setOpenAddModal(false);
        // Reset form
        setSessionName('');
        setOwnerEmail('');
        setOwnerPassword('');
        setTargetPreset('100000');
        setCustomTarget('');
        setCycleDelaySeconds(20);
        setDescription('');

        onSessionsChanged();
        onSelectSession(res.session.id);

        // Immediate background verification & status fetch for the new session with explicit credentials
        executeVipCheckStatus(res.session.id, {
          owner_email: ownerEmail.trim(),
          owner_password: ownerPassword.trim(),
          individual_email: individualEmail.trim(),
          individual_password: individualPassword.trim(),
        })
          .then(() => {
            onSessionsChanged();
          })
          .catch(() => {});
      }
    } catch (err: any) {
      console.error('[VipSessionSwitcher] Create failed:', err);
      toast.error('فشل إنشاء الجلسة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setSubmitting(false);
    }
  };

  const loadArchivedSessions = async () => {
    setLoadingArchived(true);
    try {
      const list = await listArchivedVipSessions();
      setArchivedSessions(list);
    } catch (err: any) {
      toast.error('فشل تحميل قائمة الجلسات المؤرشفة: ' + (err?.message || 'خطأ'));
    } finally {
      setLoadingArchived(false);
    }
  };

  const handleArchiveActiveSession = async () => {
    if (!activeSession) return;

    setSubmitting(true);
    try {
      const res = await archiveVipSession(activeSession.id);
      if (res.success) {
        toast.success('تمت أرشفة الجلسة بنجاح. يمكنك استرجاعها في أي وقت من سجل الأرشيف.');
        setOpenArchiveModal(false);
        const remaining = sessions.filter((s) => s.id !== activeSession.id);
        if (remaining.length > 0) {
          onSelectSession(remaining[0].id);
        } else {
          onSelectSession('');
        }
        onSessionsChanged();
      }
    } catch (err: any) {
      toast.error('فشل أرشفة الجلسة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnarchiveSession = async (sessionId: string) => {
    setSubmitting(true);
    try {
      const res = await unarchiveVipSession(sessionId);
      if (res.success) {
        toast.success('تم استرجاع الجلسة من الأرشيف بنجاح وإعادتها للقائمة النشطة.');
        await loadArchivedSessions();
        onSessionsChanged();
        onSelectSession(sessionId);
      }
    } catch (err: any) {
      toast.error('فشل استرجاع الجلسة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleHardDeleteSession = async (sessionId: string) => {
    if (!confirm('تحذير: هل أنت متأكد من الحذف النهائي؟ سيتم مسح بيانات الجلسة وسجل دوراتها نهائياً من قاعدة البيانات.')) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await hardDeleteVipSession(sessionId);
      if (res.success) {
        toast.success('تم الحذف النهائي للجلسة بنجاح.');
        if (activeSessionId === sessionId) {
          onSelectSession('');
        }
        await loadArchivedSessions();
        onSessionsChanged();
      }
    } catch (err: any) {
      toast.error('فشل الحذف النهائي: ' + (err?.message || 'خطأ'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleHardDeleteAllArchived = async () => {
    if (archivedSessions.length === 0) return;
    if (!confirm(`تحذير نهائي: هل أنت متأكد من حذف كافة الجلسات المؤرشفة (${archivedSessions.length} جلسة) نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await hardDeleteAllArchivedVipSessions();
      if (res.success) {
        toast.success(res.message || 'تم حذف كافة الجلسات المؤرشفة نهائياً');
        await loadArchivedSessions();
        onSessionsChanged();
      }
    } catch (err: any) {
      toast.error('فشل حذف الجلسات المؤرشفة: ' + (err?.message || 'خطأ'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAllSessions = async () => {
    setSubmitting(true);
    try {
      const res = await deleteAllVipSessions(archiveScope);
      if (res.success) {
        toast.success(res.message || 'تمت أرشفة الجلسات المحددة بنجاح.');
        setOpenDeleteAllModal(false);
        onSelectSession('');
        onSessionsChanged();
      }
    } catch (err: any) {
      toast.error('فشل أرشفة كافة الجلسات: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setSubmitting(false);
    }
  };

  const runningSessionsCount = sessions.filter((s) => vipRunnerService.isRunning(s.id)).length;

  return (
    <>
      <div className="w-full bg-card/90 border border-border/90 rounded-2xl p-3 sm:p-4 shadow-lg backdrop-blur-md space-y-3.5" dir="rtl">
        {/* ── Top Station Header Bar ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 via-primary/20 to-transparent border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-sm shrink-0">
              <Crown className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-extrabold text-foreground tracking-tight flex items-center gap-1.5">
                  <span>محطة إدارة الجلسات المتعددة</span>
                  <span className="text-xs font-mono text-primary font-bold">(Multi-Session Terminal)</span>
                </h2>
                <Badge className="bg-primary/15 text-primary border-primary/25 text-[11px] px-2 py-0.5 font-bold">
                  {visibleSessions.length} جلسة {(!isDelegatedUser && hideDelegatedSessions && delegatedSessionsCount > 0) ? `(أونر فقط • ${delegatedSessionsCount} مخفية)` : 'مسجلة'}
                </Badge>
                {runningSessionsCount > 0 && (
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[11px] px-2 py-0.5 font-bold flex items-center gap-1 animate-pulse">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>{runningSessionsCount} شغالة بالخلفية</span>
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                عزل كامل 100% بين الحسابات، الأرصدة، وسجلات السيرفر مع بصمة شبكية وأجهزة مصرية مستقلة لكل جلسة
              </p>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0 self-end md:self-auto flex-wrap">
            {/* Owner: Delegated Sessions Monitor Modal Button - Always visible for owner */}
            {!isDelegatedUser && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenDelegatedModal(true)}
                disabled={disabled}
                className="h-8 text-xs gap-1.5 border-sky-500/40 text-sky-400 hover:bg-sky-500/10 font-bold px-2.5"
                title="مراقبة ومتابعة جلسات المستخدمين المفوضين"
              >
                <Users className="w-3.5 h-3.5 text-sky-400" />
                <span>مراقبة المستخدمين</span>
                <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 text-[9px] px-1 py-0 font-mono">
                  {delegatedSessionsCount}
                </Badge>
              </Button>
            )}

            {/* Owner: Toggle Show / Hide Delegated Sessions - Always visible for owner */}
            {!isDelegatedUser && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = !hideDelegatedSessions;
                  setHideDelegatedSessions(next);
                  try {
                    localStorage.setItem('vip_hide_delegated_sessions', String(next));
                  } catch {}
                  // If current active session was delegated and we are hiding them, auto-switch to first owner session
                  if (next && activeSession?.is_delegated_session) {
                    const firstOwner = sessions.find((s) => !s.is_delegated_session);
                    if (firstOwner) onSelectSession(firstOwner.id);
                  }
                }}
                disabled={disabled}
                className={`h-8 text-xs gap-1.5 px-2.5 font-medium transition-all ${
                  hideDelegatedSessions
                    ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
                    : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                }`}
                title={hideDelegatedSessions ? 'إظهار جلسات المستخدمين في القائمة' : 'إخفاء جلسات المستخدمين من القائمة'}
              >
                {hideDelegatedSessions ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span>إظهار جلسات المستخدمين ({delegatedSessionsCount})</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                    <span>إخفاء جلسات المستخدمين</span>
                  </>
                )}
              </Button>
            )}

            {/* 1. Default Child Credentials Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenDefaultChildModal(true)}
              disabled={disabled}
              className="h-8 text-xs gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 font-semibold px-2.5"
              title="بيانات الفرد الافتراضية"
            >
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>بيانات الفرد</span>
            </Button>

            {/* 2. Archive Active Session Button */}
            {activeSession && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenArchiveModal(true)}
                disabled={disabled}
                className="h-8 text-xs gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 px-2.5 font-semibold"
                title="أرشفة هذه الجلسة"
              >
                <Archive className="w-3.5 h-3.5 text-amber-400" />
                <span>أرشفة</span>
              </Button>
            )}

            {/* 2.5 Direct Delete Active Session Button */}
            {activeSession && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleHardDeleteSession(activeSession.id)}
                disabled={disabled || submitting}
                className="h-8 text-xs gap-1.5 border-rose-500/40 text-rose-400 hover:bg-rose-500/15 hover:text-rose-300 px-2.5 font-semibold"
                title="حذف هذه الجلسة وسجلاتها نهائياً"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>حذف الجلسة</span>
              </Button>
            )}

            {/* 3. View Archived Sessions */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpenArchiveListModal(true);
                loadArchivedSessions();
              }}
              disabled={disabled}
              className="h-8 text-xs gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-2.5 font-medium"
              title="عرض الأرشيف"
            >
              <ArchiveRestore className="w-3.5 h-3.5 text-zinc-400" />
              <span>الأرشيف</span>
            </Button>

            {/* 4. Delete/Archive All (Owner Only) */}
            {!isDelegatedUser && sessions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenDeleteAllModal(true)}
                disabled={disabled}
                className="h-8 text-xs gap-1 border-destructive/40 text-destructive/90 hover:bg-destructive/15 px-2"
                title="أرشفة كافة الجلسات"
              >
                <span>أرشفة الكل</span>
              </Button>
            )}

            {/* 5. Add New Session Button */}
            <Button
              size="sm"
              onClick={() => setOpenAddModal(true)}
              disabled={disabled}
              className="h-8 text-xs gap-1.5 bg-gradient-to-r from-primary to-red-600 hover:from-primary/90 hover:to-red-700 text-primary-foreground font-extrabold px-3.5 shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة جلسة جديدة</span>
            </Button>
          </div>
        </div>

        {/* ── Interactive Session Cards Grid / Carousel ── */}
        {sessions.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
              <span className="font-semibold text-foreground/90 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span>اختر الجلسة للتحكم بها (انقر على بطاقة الجلسة):</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground hidden sm:inline">أو عبر القائمة:</span>
                <Select
                  value={activeSessionId || sessions[0]?.id}
                  onValueChange={onSelectSession}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-7 text-xs font-bold border-border/80 bg-background/80 w-auto min-w-[150px] max-w-[200px] gap-1.5 py-0 px-2">
                    <SelectValue placeholder="اختر الجلسة" />
                  </SelectTrigger>
                  <SelectContent align="end" className="max-h-72">
                    {visibleSessions.map((sess) => (
                      <SelectItem key={sess.id} value={sess.id} className="text-xs">
                        <div className="flex items-center justify-between gap-3 w-full">
                          <div className="flex items-center gap-1.5 truncate">
                            {!isDelegatedUser && (
                              sess.is_delegated_session ? (
                                <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 text-[9px] px-1 py-0 font-normal">
                                  مستخدم: {sess.creator_user_name || 'مفوض'}
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px] px-1 py-0 font-normal">
                                  👑 المالك
                                </Badge>
                              )
                            )}
                            <span className="font-semibold truncate">{sess.session_name}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {sess.owner_account_identifier || sess.owner_email || 'جديدة'}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {visibleSessions.map((sess, idx) => {
                const isSelected = sess.id === activeSessionId;
                const runnerState = vipRunnerService.getState(sess.id);
                const isRunning = runnerState.isRunning;
                const ownerId = sess.owner_account_identifier || sess.owner_email || 'يُستخرج بالفحص';
                const childId = sess.individual_account_identifier || sess.individual_email || 'غير مضاف';
                const liveOwnerMix = (runnerState.latestOwnerMix !== undefined && runnerState.latestOwnerMix !== null)
                  ? runnerState.latestOwnerMix
                  : (sess.owner_mix_balance || 0);
                const liveChildMix = runnerState.latestChildMix || 0;
                // Zero-loss visual shield: always show the peak protected balance during active cycles
                const ownerMix = Math.max(liveOwnerMix, (sess.owner_mix_balance || 0));
                const isParked = runnerState.currentStep === 'parking' || runnerState.currentStep === 'migrating' || runnerState.currentStep === 'waiting_server';
                const targetMix = sess.target_mix_balance || 50000;
                const progressPct = Math.min(100, Math.round((ownerMix / targetMix) * 100));
                const isCompleted = progressPct >= 100 || sess.operation_state === 'completed' || (ownerMix >= targetMix && targetMix > 0);
                const isPaused = sess.operation_state === 'paused';

                return (
                  <div
                    key={sess.id}
                    onClick={() => {
                      if (!isSelected && !disabled) {
                        onSelectSession(sess.id);
                      }
                    }}
                    className={`relative rounded-xl p-3 border transition-all text-right select-none ${
                      isRunning
                        ? 'border-emerald-500/70 ring-2 ring-emerald-500/50 bg-gradient-to-br from-emerald-950/20 via-card to-card shadow-lg shadow-emerald-500/10 cursor-pointer'
                        : isSelected
                        ? (sess.is_delegated_session && !isDelegatedUser)
                          ? 'border-sky-500 ring-2 ring-sky-500/40 bg-gradient-to-br from-sky-950/25 via-card to-card shadow-lg shadow-sky-500/15 cursor-default'
                          : 'border-primary ring-2 ring-primary/40 bg-gradient-to-br from-primary/10 via-card to-card shadow-lg shadow-primary/10 cursor-default'
                        : (sess.is_delegated_session && !isDelegatedUser)
                          ? 'border-sky-500/35 bg-card/60 hover:bg-card hover:border-sky-400 hover:shadow-md cursor-pointer'
                          : 'border-amber-500/30 bg-card/50 hover:bg-card hover:border-amber-500/60 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    {/* Header: Session Name + Status Badges */}
                    <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-border/40">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          isRunning
                            ? 'bg-emerald-500 text-emerald-950 font-bold'
                            : isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <span className="text-[11px] font-bold font-mono">#{idx + 1}</span>
                        </div>
                        <span className="text-xs font-bold truncate text-foreground">
                          {sess.session_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditSessionTarget(sess);
                            setOpenEditCredsModal(true);
                          }}
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-amber-500"
                          title="تعديل بيانات الجلسة (البريد وكلمة المرور)"
                        >
                          <Edit2 className="w-2.5 h-2.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHardDeleteSession(sess.id);
                          }}
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-rose-400"
                          title="حذف الجلسة نهائياً"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </Button>
                        {isRunning ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10.5px] px-2 py-0.5 flex items-center gap-1 font-bold animate-pulse shadow-sm shadow-emerald-500/20">
                            <Flame className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
                            <span>⚡ قيد التشغيل والتحويل</span>
                          </Badge>
                        ) : isCompleted ? (
                          <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/35 text-[10px] px-1.5 py-0.5 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>مكتملة 100%</span>
                          </Badge>
                        ) : isPaused ? (
                          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] px-1.5 py-0.5 font-bold">
                            <span>⏸️ متوقفة مؤقتاً</span>
                          </Badge>
                        ) : isSelected ? (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0 font-bold">
                            نشطة الآن
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground px-1.5 py-0.5">
                            جاهزة للبدء
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Live Running Notification Banner on Card */}
                    {isRunning && (
                      <div className="mb-2 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-[10.5px]">
                        <span className="text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                          <Flame className="w-3 h-3 text-emerald-400" />
                          <span>جلسة الفرد شغالة: نقل ومزامنة مستمرة</span>
                        </span>
                        <span className="text-[9.5px] text-emerald-300/80 font-mono">Running</span>
                      </div>
                    )}

                    {/* Owner vs Delegated User Identification Banner */}
                    {!isDelegatedUser && (
                      sess.is_delegated_session ? (
                        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-between text-[11px]">
                          <span className="text-sky-400 font-bold flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            <span>جلسة مستخدم مفوض:</span>
                          </span>
                          <span className="text-foreground font-mono font-bold truncate max-w-[160px]" dir="ltr">
                            {sess.creator_user_name || sess.creator_user_email || 'مستخدم مسجل'}
                          </span>
                        </div>
                      ) : (
                        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-[11px]">
                          <span className="text-amber-400 font-bold flex items-center gap-1.5">
                            <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>جلسة المالك (الحساب الرئيسي)</span>
                          </span>
                          <span className="text-amber-300/90 font-medium text-[10.5px]">
                            المالك: Nader Akram
                          </span>
                        </div>
                      )
                    )}

                    {/* Body: Owner, Child, Balance */}
                    <div className="space-y-1.5 text-xs">
                      {/* Owner Row */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                          <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>الأونر:</span>
                        </span>
                        <span className="font-mono font-bold text-foreground truncate max-w-[140px]" dir="ltr">
                          {ownerId}
                        </span>
                      </div>

                      {/* Child Row */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                          <Users className="w-3 h-3 text-sky-400 shrink-0" />
                          <span>الفرد:</span>
                        </span>
                        <span className="font-mono text-xs text-muted-foreground truncate max-w-[140px]" dir="ltr">
                          {childId}
                        </span>
                      </div>

                      {/* Mix Balance */}
                      <div className="flex items-center justify-between gap-1 pt-0.5">
                        <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>رصيد الميكسات:</span>
                        </span>
                        <div className="flex items-center gap-1">
                          {isParked && liveChildMix > 0 && (
                            <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1 py-0.2 rounded font-bold">
                              مركونة بأمان
                            </span>
                          )}
                          <span className="font-extrabold text-foreground font-mono">
                            {ownerMix.toLocaleString('ar-EG')} <span className="text-[10px] text-muted-foreground">ميكس</span>
                          </span>
                        </div>
                      </div>

                      {/* Mini Target Progress */}
                      <div className="pt-1 space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>الهدف: {targetMix.toLocaleString('ar-EG')}</span>
                          <span className="font-mono font-semibold text-primary">{progressPct}%</span>
                        </div>
                        <Progress value={progressPct} className="h-1 bg-muted" />
                      </div>
                    </div>

                    {/* Footer Action */}
                    <div className="mt-2.5 pt-1.5 border-t border-border/30 flex items-center justify-between text-[11px]">
                      {isSelected ? (
                        <span className="text-primary font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                          <span>الجلسة المعروضة حالياً</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground group-hover:text-foreground flex items-center gap-1">
                          <ArrowRightLeft className="w-3 h-3 text-primary" />
                          <span className="text-primary/90 font-semibold">انقر للتبديل لهذه الجلسة</span>
                        </span>
                      )}

                      <span className="text-[10px] text-muted-foreground font-mono">
                        فاصل {sess.cycle_delay_seconds ?? 20}ث
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-dashed border-border/80 text-center space-y-2">
            <Bot className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-xs text-muted-foreground">لا توجد جلسات مسجلة حالياً. اضغط على «إضافة جلسة جديدة» للبدء.</p>
          </div>
        )}
      </div>

      {/* ── Modal: Add New Session ── */}
      <Dialog open={openAddModal} onOpenChange={setOpenAddModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl max-h-[90dvh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              إضافة جلسة اتصالات VIP جديدة
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              أدخل بريد وباسورد الأونر؛ وتمت تعبئة بيانات الفرد تلقائياً من الإعدادات الافتراضية المحفوظة لتسريع الإضافة.
            </DialogDescription>
          </DialogHeader>

          {/* Unified Proven Blueprint Alert */}
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>يتم تطبيق القالب المعياري الموحد تلقائياً (نفس البصمة والإعدادات المجربة في 64 دورة مستقرة بنجاح تام).</span>
          </div>

          <form onSubmit={handleCreateSession} className="space-y-3.5 py-1">
            {/* Session Name */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">اسم الجلسة (اختياري)</Label>
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="مثال: جلسة حكاية ميكسات #1"
                className="text-xs h-8"
              />
            </div>

            {/* Owner Credentials */}
            <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
              <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                بيانات حساب الأونر (Owner Account)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">البريد الإلكتروني للأونر <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="owner@example.com"
                    className="text-xs h-8 font-mono"
                    dir="ltr"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">كلمة مرور الأونر <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      type={showOwnerPassword ? 'text' : 'password'}
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      placeholder="••••••••"
                      className="text-xs h-8 font-mono pl-8"
                      dir="ltr"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showOwnerPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Child Credentials with Auto-filled notification */}
            <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  بيانات حساب الفرد التابع (Child Account)
                </span>
                {isChildPreFilled && (
                  <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[9px] px-1.5 py-0 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    مُعبأ تلقائياً من الإعدادات
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">البريد الإلكتروني للفرد <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={individualEmail}
                    onChange={(e) => setIndividualEmail(e.target.value)}
                    placeholder="child@example.com"
                    className="text-xs h-8 font-mono"
                    dir="ltr"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">كلمة مرور الفرد <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      type={showIndivPassword ? 'text' : 'password'}
                      value={individualPassword}
                      onChange={(e) => setIndividualPassword(e.target.value)}
                      placeholder="••••••••"
                      className="text-xs h-8 font-mono pl-8"
                      dir="ltr"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowIndivPassword(!showIndivPassword)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showIndivPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Target & Delay */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">هدف الميكسات</Label>
                  {isDelegatedUser && (
                    <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/30 gap-1 px-1.5 py-0">
                      <Lock className="w-2.5 h-2.5" />
                      مقيد بالصلاحيات
                    </Badge>
                  )}
                </div>
                <Select value={targetPreset} onValueChange={setTargetPreset}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="اختر هدف الميكسات" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedPkgs.map((pkg) => (
                      <SelectItem key={pkg} value={String(pkg)}>
                        {pkg.toLocaleString('ar-EG')} ميكس {pkg === 50000 ? '(الافتراضي)' : ''}
                      </SelectItem>
                    ))}
                    {!isDelegatedUser && (
                      <SelectItem value="custom">قيمة مخصصة يدوياً...</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {targetPreset === 'custom' && !isDelegatedUser ? (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">الهدف المخصص (ميكس)</Label>
                  <Input
                    type="number"
                    value={customTarget}
                    onChange={(e) => setCustomTarget(e.target.value)}
                    placeholder="مثال: 75000"
                    className="text-xs h-8 font-mono"
                    dir="ltr"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">مدة الانتظار (ثواني)</Label>
                    {isDelegatedUser && (
                      <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                        <Lock className="w-2.5 h-2.5" />
                        مفروض خادمياً
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="5"
                    value={isDelegatedUser ? (vipAccess?.cooldown_seconds || 30) : cycleDelaySeconds}
                    disabled={isDelegatedUser}
                    onChange={(e) => setCycleDelaySeconds(parseInt(e.target.value, 10) || 20)}
                    className="text-xs h-8 font-mono disabled:opacity-80 disabled:bg-muted/50"
                    dir="ltr"
                  />
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpenAddModal(false)}
                disabled={submitting}
                className="text-xs"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="text-xs font-bold gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري إنشاء الجلسة وفحصها...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>إنشاء الجلسة فوراً</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Manage Default Child Credentials ── */}
      <VipDefaultChildModal
        open={openDefaultChildModal}
        onOpenChange={setOpenDefaultChildModal}
        onSaved={(creds) => {
          setIndividualEmail(creds.child_email);
          if (creds.child_password) setIndividualPassword(creds.child_password);
          setIsChildPreFilled(true);
        }}
      />

      {/* ── Modal: Safe Archive Session ── */}
      <Dialog open={openArchiveModal} onOpenChange={setOpenArchiveModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md p-5" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-amber-500 flex items-center gap-2">
              <Archive className="w-4 h-4" />
              أرشفة الجلسة «{activeSession?.session_name}»
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              سيتم إيقاف الأتمتة وإخفاء الجلسة من الواجهة النشطة ونقلها إلى سجل الأرشيف.
              <br />
              <strong className="text-zinc-200">لن تفقد أي بيانات:</strong> تبقى بيانات الأونر والفرد وسجل الدورات محفوظة بأمان، ويمكنك استرجاع الجلسة بضغطة واحدة من زر «الأرشيف» في أي وقت.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenArchiveModal(false)}
              disabled={submitting}
              className="text-xs"
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleArchiveActiveSession}
              disabled={submitting}
              className="text-xs font-bold gap-1.5 bg-amber-500 hover:bg-amber-600 text-zinc-950"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري الأرشفة...</span>
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" />
                  <span>تأكيد أرشفة الجلسة</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Archived Sessions List & Restore ── */}
      <Dialog open={openArchiveListModal} onOpenChange={setOpenArchiveListModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[85dvh] overflow-y-auto p-5" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-zinc-100">
              <ArchiveRestore className="w-5 h-5 text-amber-400" />
              سجل الجلسات المؤرشفة
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              يمكنك استرجاع أي جلسة سابقة إلى الواجهة النشطة دون الحاجة لإعادة كتابة بيانات الاعتماد.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2">
            {loadingArchived ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-xs">جاري تحميل الأرشيف...</span>
              </div>
            ) : archivedSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground space-y-1">
                <Archive className="w-8 h-8 opacity-30 mx-auto text-zinc-400" />
                <p className="text-xs font-medium">لا توجد جلسات مؤرشفة حالياً.</p>
                <p className="text-[10px] text-zinc-500">الجلسات التي تقوم بأرشفتها ستظهر هنا للاسترجاع.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                  <span className="text-xs text-zinc-400 font-medium">
                    إجمالي الجلسات المؤرشفة: {archivedSessions.length}
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleHardDeleteAllArchived}
                    disabled={submitting}
                    className="h-7 text-xs gap-1.5 bg-rose-600/90 hover:bg-rose-600 text-white font-bold px-3"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>مسح كافة المؤرشفات نهائياً</span>
                  </Button>
                </div>
                {archivedSessions.map((arch) => (
                <div
                  key={arch.id}
                  className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/80 flex items-center justify-between gap-2 flex-wrap"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-200 truncate">{arch.session_name}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-zinc-700 text-zinc-400">
                        مؤرشفة
                      </Badge>
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">
                      الأونر: {arch.owner_account_identifier || 'غير مسجل'} • الهدف: {arch.target_mix_balance?.toLocaleString('en-US')}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUnarchiveSession(arch.id)}
                      disabled={submitting}
                      className="h-7 text-xs gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 font-bold px-2.5"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>استرجاع</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleHardDeleteSession(arch.id)}
                      disabled={submitting}
                      className="h-7 text-xs text-rose-400 hover:bg-rose-500/10 px-2"
                      title="حذف نهائي من قاعدة البيانات"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenArchiveListModal(false)}
              className="text-xs"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Smart Multi-Option Archive Sessions ── */}
      <Dialog open={openDeleteAllModal} onOpenChange={setOpenDeleteAllModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg bg-card/95 backdrop-blur-xl border-border" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Archive className="w-5 h-5 text-amber-500" />
              <span>خيارات أرشفة جلسات اتصالات VIP ({sessions.length})</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              اختر نطاق الأرشفة المناسب. يمكنك أرشفة جلسات المالك فقط، أو أرشفة الجلسات المكتملة 100% فقط، أو أرشفة شاملة لكافة الجلسات.
            </DialogDescription>
          </DialogHeader>

          {/* Running or In-Progress Warning Alert */}
          {(activeRunningSessionsCount > 0 || inProgressSessionsCount > 0) && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>تنبيه وعي النظام بشأن الجلسات النشطة:</span>
              </div>
              <p className="text-[11.5px] leading-relaxed text-amber-200/90">
                {activeRunningSessionsCount > 0 && (
                  <span className="font-bold block">
                    ⚡ توجد ({activeRunningSessionsCount}) جلسة قيد التشغيل ونقل الميكسات حالياً بالسيرفر!
                  </span>
                )}
                {inProgressSessionsCount > 0 && (
                  <span className="block">
                    • توجد ({inProgressSessionsCount}) جلسة لم تكتمل بنسبة 100% بعد.
                  </span>
                )}
                للحفاظ على دورات العمل الجارية، نوصي باختيار «أرشفة الجلسات المكتملة فقط» أو «أرشفة جلسات المالك فقط».
              </p>
            </div>
          )}

          {/* Scope Options Selector */}
          <div className="space-y-2 py-1">
            {/* Option 1: Owner Only */}
            <div
              onClick={() => setArchiveScope('owner_only')}
              className={`p-3 rounded-xl border transition-all cursor-pointer text-right flex items-start gap-2.5 ${
                archiveScope === 'owner_only'
                  ? 'border-amber-500/70 bg-amber-500/10 ring-1 ring-amber-500/50 shadow-sm'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                archiveScope === 'owner_only' ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground'
              }`}>
                {archiveScope === 'owner_only' && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span>أرشفة جلسات المالك فقط (الموصى به)</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                    {ownerSessionsCount} جلسة
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  يتم نقل جلسات المالك للأرشيف مع بقاء جلسات المستخدمين المفوضين ({delegatedSessionsCount}) نشطة وظاهرة للمستخدمين بدون مساس.
                </p>
              </div>
            </div>

            {/* Option 2: Completed Only */}
            <div
              onClick={() => setArchiveScope('completed_only')}
              className={`p-3 rounded-xl border transition-all cursor-pointer text-right flex items-start gap-2.5 ${
                archiveScope === 'completed_only'
                  ? 'border-emerald-500/70 bg-emerald-500/10 ring-1 ring-emerald-500/50 shadow-sm'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                archiveScope === 'completed_only' ? 'border-emerald-500 bg-emerald-500' : 'border-muted-foreground'
              }`}>
                {archiveScope === 'completed_only' && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>أرشفة الجلسات المكتملة فقط (100%)</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                    {completedSessionsCount} جلسة
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  أرشفة الجلسات التي بلغت الهدف المحدد بالكامل، مع الإبقاء على الجلسات الجارية أو التي لم تكتمل بعد في القائمة النشطة.
                </p>
              </div>
            </div>

            {/* Option 3: All Sessions */}
            <div
              onClick={() => setArchiveScope('all')}
              className={`p-3 rounded-xl border transition-all cursor-pointer text-right flex items-start gap-2.5 ${
                archiveScope === 'all'
                  ? 'border-rose-500/70 bg-rose-500/10 ring-1 ring-rose-500/50 shadow-sm'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                archiveScope === 'all' ? 'border-rose-500 bg-rose-500' : 'border-muted-foreground'
              }`}>
                {archiveScope === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-rose-300 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>أرشفة شاملة لكافة الجلسات</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/30">
                    {sessions.length} جلسة
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  أرشفة جميع الجلسات المسجلة وإيقاف كافة الأتمتة المفتوحة بالسيرفر وتفريغ القائمة.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenDeleteAllModal(false)}
              disabled={submitting}
              className="text-xs"
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleDeleteAllSessions}
              disabled={submitting}
              className={`text-xs font-bold text-white ${
                archiveScope === 'owner_only'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : archiveScope === 'completed_only'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-destructive hover:bg-destructive/90'
              }`}
            >
              {submitting ? 'جاري تنفيذ الأرشفة...' : 'تأكيد الأرشفة المحددة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Delegated Sessions Monitor ── */}
      <VipDelegatedSessionsModal
        open={openDelegatedModal}
        onOpenChange={setOpenDelegatedModal}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={onSelectSession}
        onSessionsChanged={onSessionsChanged}
      />

      {/* ── Modal: Edit Session Credentials ── */}
      {editSessionTarget && (
        <VipSessionEditModal
          open={openEditCredsModal}
          onOpenChange={setOpenEditCredsModal}
          sessionId={editSessionTarget.id}
          sessionName={editSessionTarget.session_name}
          currentDial={editSessionTarget.owner_account_identifier || ''}
          currentOwnerEmail={editSessionTarget.owner_email || ''}
          currentChildEmail={editSessionTarget.individual_email || ''}
          onSuccess={() => {
            onSessionsChanged();
          }}
        />
      )}
    </>
  );
}
