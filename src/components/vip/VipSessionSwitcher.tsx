import React, { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
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
  Info,
  ShieldCheck,
  CheckCircle2,
  Bot,
} from 'lucide-react';
import type { VipSession } from '@/types/vip';
import { createVipSession, deleteVipSession } from '@/lib/vipApi';

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

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

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
        setIndividualEmail('');
        setIndividualPassword('');
        setTargetPreset('50000');
        setCustomTarget('');
        setCycleDelaySeconds(20);
        setDescription('');
        onSessionsChanged();
        onSelectSession(res.session.id);
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
    <div className="w-full bg-card/70 border border-border/80 rounded-2xl p-3 sm:p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Active Session Info & Dropdown */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <Bot className="w-5 h-5" />
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
                <span className="flex items-center gap-1">
                  خط الأونر: <strong className="text-foreground font-mono dir-ltr">{activeSession.owner_account_identifier || 'يظهر بعد أول دخول'}</strong>
                </span>
                <span>•</span>
                <span>
                  خط الفرد: <strong className="text-foreground font-mono dir-ltr">{activeSession.individual_account_identifier || 'يظهر بعد التحقق'}</strong>
                </span>
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

        {/* Action Buttons: Add Session & Archive Session */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
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

          <Button
            size="sm"
            onClick={() => setOpenAddModal(true)}
            disabled={disabled}
            className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-3"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة جلسة جديدة</span>
          </Button>
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
              تُنشئ جلسة أتمتة جديدة معزولة بالكامل بحسابات الاعتماد الخاصة بمحرك EtisalatBot وأهداف ميكسات مخصصة.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSession} className="space-y-3.5 py-1 text-xs">
            {/* 1. Optional Session Name */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                اسم الجلسة <span className="text-muted-foreground text-[10px] font-normal">(اختياري - سيتم التوليد تلقائياً إذا تُرك فارغاً)</span>
              </Label>
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="مثال: جلسة حكاية ميكس الرئيسية"
                className="text-xs h-8"
              />
            </div>

            {/* 2. Owner Credentials */}
            <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  بيانات حساب الأونر الرئيسي (Owner Account)
                </span>
                <span className="text-[10px] text-muted-foreground">مستلم الميكسات</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">البريد الإلكتروني للأونر <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="owner@example.com"
                    className="text-xs h-8 font-mono dir-ltr"
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
                      className="text-xs h-8 font-mono dir-ltr pl-8"
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

            {/* 3. Child Credentials */}
            <div className="p-2.5 rounded-xl bg-sky-500/5 border border-sky-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-500 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  بيانات حساب الفرد التابع (FAF Child Account)
                </span>
                <span className="text-[10px] text-muted-foreground">الخط الفردي المربوط</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">البريد الإلكتروني للفرد <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={individualEmail}
                    onChange={(e) => setIndividualEmail(e.target.value)}
                    placeholder="child@example.com"
                    className="text-xs h-8 font-mono dir-ltr"
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
                      className="text-xs h-8 font-mono dir-ltr pl-8"
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

            {/* 4. Target Mix Selector & Custom Option */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">هدف الميكسات (Target Mixes)</Label>
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
                  <Label className="text-xs font-semibold">القيمة المخصصة (عدد صحيح موجب)</Label>
                  <Input
                    type="number"
                    min="1000"
                    step="1000"
                    value={customTarget}
                    onChange={(e) => setCustomTarget(e.target.value)}
                    placeholder="مثال: 75000"
                    className="text-xs h-8 font-mono dir-ltr"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">مدة الانتظار بين الدورات (بالثواني)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="300"
                      value={cycleDelaySeconds}
                      onChange={(e) => setCycleDelaySeconds(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="text-xs h-8 font-mono dir-ltr pr-8"
                    />
                    <Timer className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              )}
            </div>

            {targetPreset === 'custom' && (
              <div className="space-y-1">
                <Label className="text-xs font-semibold">مدة الانتظار بين الدورات (بالثواني)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="300"
                    value={cycleDelaySeconds}
                    onChange={(e) => setCycleDelaySeconds(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="text-xs h-8 font-mono dir-ltr pr-8"
                  />
                  <Timer className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            {/* Automatic line discovery note */}
            <div className="p-2 rounded-xl bg-background border border-border flex items-start gap-2 text-[11px] text-muted-foreground">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <strong className="text-foreground block">استخراج أرقام الخطوط آلياً:</strong>
                لا يتطلب النموذج إدخال أرقام الهواتف؛ سيقوم محرك EtisalatBot باستخراج رقم خط الأونر ورقم الفرد تلقائياً وعرضهما في لوحة الجلسة بمجرد نجاح أول تسجيل دخول بالبريد وكلمة المرور.
              </div>
            </div>

            {/* 5. Optional Admin Notes */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">ملاحظات / وصف اختياري</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="أية ملاحظات إدارية خاصة بهذه الجلسة..."
                rows={1}
                className="text-xs resize-none"
              />
            </div>

            <div className="p-2 rounded-xl bg-primary/5 border border-primary/20 text-[11px] text-muted-foreground leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-primary inline ml-1 shrink-0" />
              <strong>تأمين بيانات الاعتماد:</strong> تشفير كامل لبيانات الدخول وتطبيق عزل تام للجلسات دون أي خلط في الاستعلامات أو حالات التشغيل.
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpenAddModal(false)}
                className="text-xs h-8 border-border"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="text-xs h-8 bg-primary text-primary-foreground font-semibold gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {submitting ? 'جاري إنشاء الجلسة...' : 'إنشاء جلسة اتصالات VIP'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Archive Session Confirmation ── */}
      <Dialog open={openDeleteModal} onOpenChange={setOpenDeleteModal}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              تأكيد أرشفة الجلسة
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              هل أنت متأكد من رغبتك في أرشفة الجلسة «{activeSession?.session_name}»؟
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
            <p className="font-semibold">سيتم إيقاف ظهور هذه الجلسة في القائمة النشطة.</p>
            <p className="text-[11px] text-muted-foreground">
              ستبقى سجلات الدورات والعمليات السابقة محفوظة في الأرشيف الآمن لأغراض التدقيق.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpenDeleteModal(false)}
              className="text-xs h-8 border-border"
            >
              تراجع
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteActiveSession}
              disabled={submitting}
              className="text-xs h-8 font-semibold"
            >
              {submitting ? 'جاري الأرشفة...' : 'تأكيد الأرشفة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
