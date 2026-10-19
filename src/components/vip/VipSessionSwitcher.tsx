import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import type { VipSession } from '@/types/vip';
import {
  createVipSession,
  deleteVipSession,
  getVipDefaultChildCredentials,
  executeVipCheckStatus,
} from '@/lib/vipApi';
import { VipDefaultChildModal } from '@/components/vip/VipDefaultChildModal';

interface Props {
  sessions: VipSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onSessionsChanged: () => void;
  disabled?: boolean;
}

export function VipSessionSwitcher({
  sessions,
  activeSessionId,
  onSelectSession,
  onSessionsChanged,
  disabled = false,
}: Props) {
  const [openAddModal, setOpenAddModal] = useState(false);
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openDefaultChildModal, setOpenDefaultChildModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New session form states matching EtisalatBot script
  const [sessionName, setSessionName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [individualEmail, setIndividualEmail] = useState('');
  const [individualPassword, setIndividualPassword] = useState('');
  const [targetPreset, setTargetPreset] = useState('50000');
  const [customTarget, setCustomTarget] = useState('');
  const [cycleDelaySeconds, setCycleDelaySeconds] = useState(20);
  const [description, setDescription] = useState('');

  // Password visibility toggles
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [showIndivPassword, setShowIndivPassword] = useState(false);
  const [isChildPreFilled, setIsChildPreFilled] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  // Auto-fill child credentials from saved defaults when opening add modal
  useEffect(() => {
    if (openAddModal) {
      getVipDefaultChildCredentials()
        .then((res) => {
          if (res && res.child_email) {
            setIndividualEmail(res.child_email);
            if (res.child_password) setIndividualPassword(res.child_password);
            setIsChildPreFilled(true);
          }
        })
        .catch(() => {});
    }
  }, [openAddModal]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ownerEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني لحساب الأونر (Owner).');
      return;
    }
    if (!ownerPassword.trim()) {
      toast.error('يرجى إدخال كلمة مرور حساب الأونر (Owner).');
      return;
    }
    if (!individualEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني لحساب الفرد (Child).');
      return;
    }
    if (!individualPassword.trim()) {
      toast.error('يرجى إدخال كلمة مرور حساب الفرد (Child).');
      return;
    }

    let finalTarget = 50000;
    if (targetPreset === 'custom') {
      const parsed = parseInt(customTarget, 10);
      if (isNaN(parsed) || parsed <= 0) {
        toast.error('يرجى إدخال قيمة عددية موجبة للرصيد المستهدف.');
        return;
      }
      finalTarget = parsed;
    } else {
      finalTarget = parseInt(targetPreset, 10) || 50000;
    }

    const delay = Math.max(0, Number(cycleDelaySeconds) || 20);

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
        setTargetPreset('50000');
        setCustomTarget('');
        setCycleDelaySeconds(20);
        setDescription('');

        onSessionsChanged();
        onSelectSession(res.session.id);

        // Immediate background verification & status fetch for the new session
        executeVipCheckStatus(res.session.id)
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

  const handleDeleteActiveSession = async () => {
    if (!activeSession) return;
    if (sessions.length <= 1) {
      toast.error('لا يمكن حذف الجلسة الوحيدة المتبقية في النظام.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await deleteVipSession(activeSession.id);
      if (res.success) {
        toast.success('تمت أرشفة الجلسة بنجاح.');
        setOpenDeleteModal(false);
        const remaining = sessions.filter((s) => s.id !== activeSession.id);
        if (remaining.length > 0) {
          onSelectSession(remaining[0].id);
        }
        onSessionsChanged();
      }
    } catch (err: any) {
      toast.error('فشل حذف الجلسة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="w-full bg-card/85 border border-border/80 rounded-2xl p-3 sm:p-3.5 shadow-sm backdrop-blur-sm" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Active Session Info & Dropdown */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <Bot className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium">جلسة اتصالات VIP:</span>
                <Select
                  value={activeSessionId}
                  onValueChange={onSelectSession}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 text-xs font-bold border-amber-500/40 bg-background/80 w-auto min-w-[190px] max-w-[270px] gap-2">
                    <SelectValue placeholder="اختر الجلسة" />
                  </SelectTrigger>
                  <SelectContent align="start" className="max-h-72">
                    {sessions.map((sess) => (
                      <SelectItem key={sess.id} value={sess.id} className="text-xs">
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span className="font-semibold truncate">{sess.session_name}</span>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 shrink-0 font-mono"
                          >
                            {sess.owner_account_identifier || sess.owner_email || 'جلسة جديدة'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0.5">
                  {sessions.length} جلسة مسجلة
                </Badge>
              </div>

              {/* Subline detail */}
              {activeSession && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 truncate">
                  <span>الأونر: <strong className="text-foreground font-mono" dir="ltr">{activeSession.owner_account_identifier || 'يُستخرج بعد الفحص'}</strong></span>
                  <span>•</span>
                  <span>الفرد: <strong className="text-foreground font-mono" dir="ltr">{activeSession.individual_account_identifier || 'غير مضاف'}</strong></span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                    الهدف: <strong className="text-foreground">{activeSession.target_mix_balance?.toLocaleString('ar-EG')}</strong> ميكس
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Timer className="w-3 h-3 text-sky-500 shrink-0" />
                    الفاصل: <strong className="text-foreground font-mono">{activeSession.cycle_delay_seconds ?? 20}ث</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons: Add Session, Default Child, & Archive Session */}
          <div className="flex items-center gap-1.5 shrink-0 self-end md:self-auto flex-wrap">
            {/* 1. Default Child Credentials Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenDefaultChildModal(true)}
              disabled={disabled}
              className="h-8 text-xs gap-1 border-blue-500/30 text-blue-500 hover:bg-blue-500/10 font-medium px-2.5"
              title="حفظ بيانات الفرد الافتراضية"
            >
              <Users className="w-3.5 h-3.5" />
              <span>بيانات الفرد الافتراضية</span>
            </Button>

            {/* 2. Archive Session Button (if more than 1 session) */}
            {sessions.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenDeleteModal(true)}
                disabled={disabled}
                className="h-8 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10 px-2.5"
                title="أرشفة هذه الجلسة"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">أرشفة الجلسة</span>
              </Button>
            )}

            {/* 3. Add New Session Button */}
            <Button
              size="sm"
              onClick={() => setOpenAddModal(true)}
              disabled={disabled}
              className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-3 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة جلسة جديدة</span>
            </Button>
          </div>
        </div>
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

          <form onSubmit={handleCreateSession} className="space-y-3 py-1 text-xs">
            {/* Session Name */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                اسم الجلسة <span className="text-muted-foreground text-[10px] font-normal">(اختياري)</span>
              </Label>
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="مثال: جلسة حكاية ميكس الرئيسية"
                className="text-xs h-8"
              />
            </div>

            {/* Owner Credentials */}
            <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  بيانات حساب الأونر الرئيسي (Owner Account)
                </span>
                <span className="text-[10px] text-muted-foreground">المستلم للميكسات</span>
              </div>

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
                <Label className="text-xs font-semibold">هدف الميكسات</Label>
                <Select value={targetPreset} onValueChange={setTargetPreset}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="اختر هدف الميكسات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50000">50,000 ميكس (الافتراضي)</SelectItem>
                    <SelectItem value="100000">100,000 ميكس</SelectItem>
                    <SelectItem value="150000">150,000 ميكس</SelectItem>
                    <SelectItem value="200000">200,000 ميكس</SelectItem>
                    <SelectItem value="custom">قيمة مخصصة يدوياً...</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {targetPreset === 'custom' ? (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">القيمة المخصصة</Label>
                  <Input
                    type="number"
                    min="1000"
                    step="1000"
                    value={customTarget}
                    onChange={(e) => setCustomTarget(e.target.value)}
                    placeholder="مثال: 75000"
                    className="text-xs h-8 font-mono"
                    dir="ltr"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">مدة الانتظار (ثواني)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={cycleDelaySeconds}
                    onChange={(e) => setCycleDelaySeconds(parseInt(e.target.value, 10) || 20)}
                    className="text-xs h-8 font-mono"
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

      {/* ── Modal: Delete / Archive Session ── */}
      <Dialog open={openDeleteModal} onOpenChange={setOpenDeleteModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md p-5" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-destructive flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              تأكيد أرشفة الجلسة «{activeSession?.session_name}»
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              هل أنت متأكد من رغبتك في أرشفة هذه الجلسة؟ لن يتم حذف سجل العمليات السابقة ولكن سيتم إخفاء الجلسة من القائمة النشطة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenDeleteModal(false)}
              disabled={submitting}
              className="text-xs"
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteActiveSession}
              disabled={submitting}
              className="text-xs font-bold"
            >
              {submitting ? 'جاري الأرشفة...' : 'أرشفة الجلسة الآن'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
