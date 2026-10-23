import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Clock,
  Trash2,
  RefreshCw,
  Sliders,
  CheckCircle2,
  XCircle,
  Hash,
  Mail,
  User,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getDelegatedVipUsers,
  saveDelegatedUser,
  toggleDelegatedUserStatus,
  deleteDelegatedUser,
  type DelegatedUser,
} from '@/services/vipDelegationService';
import { supabase } from '@/db/supabase';

export const VipDelegationManagerTab: React.FC = () => {
  const [users, setUsers] = useState<DelegatedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [maxCycles, setMaxCycles] = useState('10');
  const [cooldownSeconds, setCooldownSeconds] = useState('60');
  const [notes, setNotes] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getDelegatedVipUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
      toast.error('تعذر جلب قائمة المستخدمين المفوضين');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggle = async (user: DelegatedUser) => {
    const nextState = !user.is_active;
    try {
      const success = await toggleDelegatedUserStatus(user.user_id, nextState);
      if (success) {
        toast.success(nextState ? 'تم تفعيل القسم للمستخدم' : 'تم تعطيل القسم للمستخدم');
        setUsers((prev) =>
          prev.map((u) => (u.user_id === user.user_id ? { ...u, is_active: nextState } : u))
        );
      } else {
        toast.error('فشل تحديث الحالة');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء تعديل الحالة');
    }
  };

  const handleDelete = async (targetUserId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف تفويض هذا المستخدم بالكامل؟')) return;
    try {
      const success = await deleteDelegatedUser(targetUserId);
      if (success) {
        toast.success('تم حذف التفويض');
        setUsers((prev) => prev.filter((u) => u.user_id !== targetUserId));
      } else {
        toast.error('تعذر الحذف');
      }
    } catch (err) {
      toast.error('حدث خطأ');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني للمستخدم');
      return;
    }

    setSaving(true);
    try {
      // البحث عن معرف المستخدم إذا لم يتم توفيره يدوياً
      let resolvedUserId = userId.trim();
      if (!resolvedUserId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username')
          .ilike('email', userEmail.trim())
          .maybeSingle();

        if (profile) {
          resolvedUserId = profile.id;
          if (!userName) setUserName(profile.username || '');
        } else {
          // جلب من auth أو توليد UUID
          resolvedUserId = crypto.randomUUID();
        }
      }

      const res = await saveDelegatedUser({
        user_id: resolvedUserId,
        user_email: userEmail.trim(),
        user_name: userName.trim() || userEmail.split('@')[0],
        is_active: true,
        max_daily_cycles: parseInt(maxCycles, 10) || 10,
        min_cooldown_seconds: parseInt(cooldownSeconds, 10) || 60,
        notes: notes.trim(),
      });

      if (res.success) {
        toast.success('تم حفظ وتفويض المستخدم بنجاح!');
        setModalOpen(false);
        // Reset form
        setUserEmail('');
        setUserId('');
        setUserName('');
        setMaxCycles('10');
        setCooldownSeconds('60');
        setNotes('');
        loadUsers();
      } else {
        toast.error('فشل الحفظ: ' + res.error);
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* البطاقة العلوية وشرح النظام */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">إدارة وتفويض مستخدمي قسم VIP</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              تحكم خادمي كامل: القسم مخفي افتراضياً ويظهر فقط لمن تمنحه الصلاحية مع تخصيص الحدود وفواصل الثواني
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-2 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>

          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary text-primary-foreground font-semibold">
                <UserPlus className="w-4 h-4 ml-2" />
                تفويض مستخدم جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  <span>تفويض مستخدم للوصول لقسم اتصالات VIP</span>
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSaveUser} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-primary" />
                    <span>البريد الإلكتروني للمستخدم *</span>
                  </label>
                  <Input
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                    dir="ltr"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>اسم المستخدم أو اللقب</span>
                    </label>
                    <Input
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="مثال: أحمد محمود"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-amber-500" />
                      <span>الحد اليومي للدورات (Cycle Limit)</span>
                    </label>
                    <Input
                      type="number"
                      value={maxCycles}
                      onChange={(e) => setMaxCycles(e.target.value)}
                      placeholder="10"
                      min={1}
                      max={1000}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-500" />
                    <span>الفاصل الزمني الإجباري بين الدورات (بالثواني) *</span>
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {['20', '30', '60', '120'].map((sec) => (
                      <Button
                        key={sec}
                        type="button"
                        size="sm"
                        variant={cooldownSeconds === sec ? 'default' : 'outline'}
                        onClick={() => setCooldownSeconds(sec)}
                        className="text-xs font-mono"
                      >
                        {sec} ثانية
                      </Button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(e.target.value)}
                    placeholder="أدخل عدد الثواني (مثال 60)"
                    min={5}
                    max={3600}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    هذا الفاصل محكوم خادمياً ولا يمكن للمستخدم تجاوزه أو التلاعب به.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">ملاحظات للمالك</label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="ملاحظات سرية حول المستخدم أو الاتفاق..."
                  />
                </div>

                <Button type="submit" disabled={saving} className="w-full mt-4 font-semibold">
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 ml-2 animate-spin" />
                      جاري الحفظ بالسيرفر...
                    </>
                  ) : (
                    'حفظ وتفعيل الصلاحية فوراً'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* جدول المستخدمين المفوضين */}
      <Card className="border border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>المستخدمون المصرح لهم حالياً ({users.length})</span>
          </CardTitle>
          <CardDescription className="text-xs">
            كل مستخدم مفعل هنا يظهر له قسم اتصالات VIP مع التقيد بالحدود والفاصل الزمني المحدد له
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-primary" />
              جاري تحميل بيانات التفويض...
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
              <Users className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p>لا يوجد مستخدمون مفوضون حالياً.</p>
              <p className="text-xs">انقر على &ldquo;تفويض مستخدم جديد&rdquo; لمنح مستخدم محدد صلاحية الوصول للقسم.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-3 pr-2 font-medium">المستخدم</th>
                    <th className="pb-3 font-medium">الحالة</th>
                    <th className="pb-3 font-medium">الحد اليومي</th>
                    <th className="pb-3 font-medium">الفاصل الزمني</th>
                    <th className="pb-3 font-medium">استهلاك اليوم</th>
                    <th className="pb-3 font-medium">آخر دورة</th>
                    <th className="pb-3 pl-2 text-left font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-2">
                        <div className="font-semibold text-foreground">{u.user_name || 'مستخدم'}</div>
                        <div className="text-xs text-muted-foreground font-mono" dir="ltr">
                          {u.user_email}
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge
                          variant="outline"
                          className={
                            u.is_active
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs'
                              : 'bg-muted text-muted-foreground border-border text-xs'
                          }
                        >
                          {u.is_active ? 'مفعل' : 'معطل'}
                        </Badge>
                      </td>
                      <td className="py-3 font-semibold text-foreground">{u.max_daily_cycles} دورة</td>
                      <td className="py-3 font-mono text-xs text-amber-400">{u.min_cooldown_seconds} ثانية</td>
                      <td className="py-3 font-semibold text-primary">{u.cycle_count_today} دورة</td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {u.last_cycle_at ? new Date(u.last_cycle_at).toLocaleTimeString('ar-EG') : 'لا يوجد بعد'}
                      </td>
                      <td className="py-3 pl-2 text-left">
                        <div className="flex items-center justify-end gap-3">
                          <Switch
                            checked={u.is_active}
                            onCheckedChange={() => handleToggle(u)}
                            aria-label="تفعيل أو تعطيل المستخدم"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(u.user_id)}
                            className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                            title="حذف التفويض"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
