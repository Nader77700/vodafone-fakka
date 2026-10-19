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
  Layers,
  Plus,
  Check,
  ChevronDown,
  Smartphone,
  ShieldCheck,
  Zap,
  Trash2,
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

  // New session form
  const [sessionName, setSessionName] = useState('');
  const [ownerIdentifier, setOwnerIdentifier] = useState('');
  const [individualIdentifier, setIndividualIdentifier] = useState('');
  const [targetBalance, setTargetBalance] = useState('50000');
  const [description, setDescription] = useState('');

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) {
      toast.error('يرجى كتابة اسم للجلسة الجديدة.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createVipSession({
        session_name: sessionName.trim(),
        owner_identifier: ownerIdentifier.trim() || undefined,
        individual_identifier: individualIdentifier.trim() || undefined,
        target_balance: Number(targetBalance) || 50000,
        description: description.trim() || undefined,
      });

      if (res.success && res.session) {
        toast.success(`تم إنشاء الجلسة «${res.session.session_name}» بنجاح.`);
        setOpenAddModal(false);
        setSessionName('');
        setOwnerIdentifier('');
        setIndividualIdentifier('');
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
            <Layers className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">الجلسة النشطة:</span>
              <Select
                value={activeSessionId}
                onValueChange={onSelectSession}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs font-bold border-amber-500/40 bg-background/80 w-auto min-w-[180px] max-w-[260px] gap-2">
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
                          {sess.owner_account_identifier || 'غير مضبوط'}
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
                  <Smartphone className="w-3 h-3 text-primary shrink-0" />
                  الأونر: <strong className="text-foreground font-mono dir-ltr">{activeSession.owner_account_identifier || 'غير مربوط'}</strong>
                </span>
                <span>•</span>
                <span>
                  الفرد: <strong className="text-foreground font-mono dir-ltr">{activeSession.individual_account_identifier || 'غير مربوط'}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                  الهدف: <strong className="text-foreground">{activeSession.target_mix_balance?.toLocaleString('ar-EG')}</strong> ميكس
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
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              إضافة جلسة VIP جديدة ومستقلة
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              يتم إنشاء جلسة معزولة تماماً في قاعدة البيانات برقم تعريفي وسجلات وأهداف مستقلة دون التأثير على الجلسات الحالية.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSession} className="space-y-3.5 py-1 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">اسم الجلسة <span className="text-destructive">*</span></Label>
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="مثال: جلسة خطوط العمل 2 أو حساب فودافون الرئيسي"
                className="text-xs h-9"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                اسم مميز يسهل عليك تمييز حسابات هذه الجلسة في القائمة.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">رقم / معرّف الأونر (Owner)</Label>
                <Input
                  value={ownerIdentifier}
                  onChange={(e) => setOwnerIdentifier(e.target.value)}
                  placeholder="010xxxxxxxx"
                  className="text-xs h-9 font-mono dir-ltr"
                />
                <p className="text-[10px] text-muted-foreground">رقم الهاتف الأساسي المستلم للميكسات</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">رقم / معرّف الفرد (Individual)</Label>
                <Input
                  value={individualIdentifier}
                  onChange={(e) => setIndividualIdentifier(e.target.value)}
                  placeholder="010yyyyyyyy"
                  className="text-xs h-9 font-mono dir-ltr"
                />
                <p className="text-[10px] text-muted-foreground">الخط الفردي المربوط بالأونر</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">الرصيد المستهدف المبدئي (ميكس)</Label>
              <Select value={targetBalance} onValueChange={setTargetBalance}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="اختر الرصيد المستهدف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50000">50,000 ميكس (الافتراضي)</SelectItem>
                  <SelectItem value="100000">100,000 ميكس</SelectItem>
                  <SelectItem value="150000">150,000 ميكس</SelectItem>
                  <SelectItem value="200000">200,000 ميكس</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">ملاحظات / وصف اختياري</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="أية ملاحظات إدارية عن هذه الجلسة..."
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/20 text-[11px] text-muted-foreground leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-primary inline ml-1 shrink-0" />
              <strong>تنبيه الأمان:</strong> لا يتم تخزين كلمات المرور كنصوص صريحة. جميع العمليات تسجل بحالة أولية «معلقة بانتظار التكامل» لحماية البيانات.
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
                className="text-xs h-8 bg-primary text-primary-foreground font-semibold"
              >
                {submitting ? 'جاري الإنشاء...' : 'إنشاء الجلسة'}
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
              ستبقى سجلات العمليات السابقة محفوظة في الأرشيف الآمن لأغراض التدقيق.
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
              type="button"
              variant="destructive"
              size="sm"
              disabled={submitting}
              onClick={handleDeleteActiveSession}
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
