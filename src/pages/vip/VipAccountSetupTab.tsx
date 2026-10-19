import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  UserCheck,
  Users,
  ShieldCheck,
  Lock,
  Save,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { VipSession } from '@/types/vip';
import { updateVipSession, saveVipSessionCredentials } from '@/lib/vipApi';

interface Props {
  session: VipSession;
  onRefresh: () => void;
}

export function VipAccountSetupTab({ session, onRefresh }: Props) {
  const [sessionName, setSessionName] = useState(session.session_name || '');
  const [ownerIdentifier, setOwnerIdentifier] = useState(session.owner_account_identifier || '');
  const [individualIdentifier, setIndividualIdentifier] = useState(session.individual_account_identifier || '');
  const [description, setDescription] = useState(session.session_description || '');

  // Credentials states
  const [ownerEmail, setOwnerEmail] = useState(session.owner_email || '');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);

  const [individualEmail, setIndividualEmail] = useState(session.individual_email || '');
  const [individualPassword, setIndividualPassword] = useState('');
  const [showIndividualPassword, setShowIndividualPassword] = useState(false);

  const [cycleDelay, setCycleDelay] = useState<number>(session.cycle_delay_seconds || 20);

  const [savingMeta, setSavingMeta] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);

  useEffect(() => {
    setSessionName(session.session_name || '');
    setOwnerIdentifier(session.owner_account_identifier || '');
    setIndividualIdentifier(session.individual_account_identifier || '');
    setDescription(session.session_description || '');
    setOwnerEmail(session.owner_email || '');
    setIndividualEmail(session.individual_email || '');
    setCycleDelay(session.cycle_delay_seconds || 20);
  }, [session]);

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) {
      toast.error('يرجى تحديد اسم للجلسة.');
      return;
    }

    setSavingMeta(true);
    try {
      const res = await updateVipSession({
        session_id: session.id,
        session_name: sessionName.trim(),
        owner_identifier: ownerIdentifier.trim(),
        individual_identifier: individualIdentifier.trim(),
        description: description.trim() || undefined,
      });

      if (res.success) {
        toast.success(`تم حفظ بيانات الجلسة «${sessionName}» بنجاح.`);
        onRefresh();
      }
    } catch (err: any) {
      toast.error('فشل حفظ البيانات: ' + (err?.message || 'خطأ غير متوقع'));
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCreds(true);
    try {
      const res = await saveVipSessionCredentials(session.id, {
        owner_email: ownerEmail.trim() || undefined,
        owner_password: ownerPassword.trim() || undefined,
        individual_email: individualEmail.trim() || undefined,
        individual_password: individualPassword.trim() || undefined,
        cycle_delay_seconds: cycleDelay,
      });

      if (res.success) {
        toast.success(res.message || 'تم حفظ بيانات تسجيل الدخول بالخادم بأمان.');
        setOwnerPassword('');
        setIndividualPassword('');
        onRefresh();
      }
    } catch (err: any) {
      toast.error('فشل حفظ بيانات الدخول: ' + (err?.message || 'خطأ غير متوقع'));
    } finally {
      setSavingCreds(false);
    }
  };

  return (
    <div className="space-y-2.5 max-w-4xl" dir="rtl">
      {/* ── Header Badge ── */}
      <div className="p-2.5 sm:p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-foreground">
                إعداد حسابات وبيانات الجلسة: {session.session_name}
              </span>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0">
                مشفر ومحمي
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              عزل تام لكل جلسة بحساباتها وأرقامها وكلمات المرور الخاصة بها في الخادم
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* ── Session Identifiers Card ── */}
        <Card className="border border-border/70 bg-card">
          <CardHeader className="p-3 pb-2 border-b border-border/60">
            <CardTitle className="text-xs font-bold flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-primary" />
              أرقام وهوية الخطوط في الجلسة
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              تحديد أرقام الهاتف أو المعرفات الخاصة بخط الأونر وخط الفرد
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            <form onSubmit={handleSaveMeta} className="space-y-2.5 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">اسم الجلسة:</Label>
                <Input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="مثال: الجلسة الرئيسية #1"
                  className="h-8 text-xs border-border/70"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">رقم أو معرف حساب الأونر:</Label>
                <Input
                  value={ownerIdentifier}
                  onChange={(e) => setOwnerIdentifier(e.target.value)}
                  placeholder="مثال: 010xxxxxxxx"
                  className="h-8 text-xs font-mono border-border/70"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">رقم أو معرف حساب الفرد (FAF Child):</Label>
                <Input
                  value={individualIdentifier}
                  onChange={(e) => setIndividualIdentifier(e.target.value)}
                  placeholder="مثال: 010yyyyyyyy"
                  className="h-8 text-xs font-mono border-border/70"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">ملاحظات الجلسة (اختياري):</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف مختصر للغرض من الجلسة..."
                  rows={2}
                  className="text-xs border-border/70 resize-none min-h-[50px]"
                />
              </div>

              <div className="pt-1 flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingMeta}
                  className="h-7 text-xs px-3 bg-primary text-primary-foreground gap-1 font-bold"
                >
                  <Save className="w-3 h-3" />
                  <span>حفظ أرقام الجلسة</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Secure Automation Credentials Card ── */}
        <Card className="border border-border/70 bg-card">
          <CardHeader className="p-3 pb-2 border-b border-border/60">
            <CardTitle className="text-xs font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                بيانات تسجيل دخول المشغل الآلي
              </span>
              <div className="flex items-center gap-1">
                {session.has_owner_password && (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[9px] px-1 py-0">
                    كلمة الأونر محفوظة
                  </Badge>
                )}
                {session.has_individual_password && (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[9px] px-1 py-0">
                    كلمة الفرد محفوظة
                  </Badge>
                )}
              </div>
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              تُحفظ مشفرة في الخادم وتُستخدم فقط بواسطة العامل الخلفي EtisalatBot دون كشفها
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            <form onSubmit={handleSaveCredentials} className="space-y-2.5 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">إيميل / حساب الأونر:</Label>
                <Input
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner_account@example.com"
                  className="h-8 text-xs font-mono border-border/70"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex items-center justify-between">
                  <span>كلمة سر الأونر:</span>
                  {session.has_owner_password && (
                    <span className="text-[10px] text-emerald-500">مخزنة بالفعل (اتركها فارغة للإبقاء)</span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type={showOwnerPassword ? 'text' : 'password'}
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder={session.has_owner_password ? '•••••••• (تغيير كلمة السر)' : 'أدخل كلمة السر'}
                    className="h-8 text-xs font-mono border-border/70 pl-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showOwnerPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">إيميل / حساب الفرد:</Label>
                <Input
                  value={individualEmail}
                  onChange={(e) => setIndividualEmail(e.target.value)}
                  placeholder="child_account@example.com"
                  className="h-8 text-xs font-mono border-border/70"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex items-center justify-between">
                  <span>كلمة سر الفرد:</span>
                  {session.has_individual_password && (
                    <span className="text-[10px] text-emerald-500">مخزنة بالفعل (اتركها فارغة للإبقاء)</span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type={showIndividualPassword ? 'text' : 'password'}
                    value={individualPassword}
                    onChange={(e) => setIndividualPassword(e.target.value)}
                    placeholder={session.has_individual_password ? '•••••••• (تغيير كلمة السر)' : 'أدخل كلمة السر'}
                    className="h-8 text-xs font-mono border-border/70 pl-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowIndividualPassword(!showIndividualPassword)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showIndividualPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingCreds}
                  className="h-7 text-xs px-3 bg-amber-600 hover:bg-amber-700 text-white gap-1 font-bold"
                >
                  <Lock className="w-3 h-3" />
                  <span>تحديث بيانات الدخول المشفرة</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
