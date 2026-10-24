import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Mail,
  User,
  Phone,
  AlertCircle,
  Activity,
  Edit2,
  Lock,
  Search,
  Eye,
  KeyRound,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getDelegatedVipUsers,
  saveDelegatedUser,
  toggleDelegatedUserStatus,
  deleteDelegatedUser,
  getVipOwnerAnalytics,
  searchRegisteredAppUsers,
  type DelegatedUser,
  type VipOwnerAnalytics,
  type RegisteredAppUser,
} from '@/services/vipDelegationService';
import { VipUserAuditModal } from './VipUserAuditModal';

const AVAILABLE_PACKAGE_OPTIONS = [50000, 100000, 200000, 300000, 500000];
const CONCURRENT_SESSION_OPTIONS = ['1', '2', '3', '5', '10'];
const DAILY_ACTIVATION_OPTIONS = ['5', '10', '20', '50'];

export const VipDelegationManagerTab: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<DelegatedUser[]>([]);
  const [analytics, setAnalytics] = useState<VipOwnerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // User Audit Modal
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditUserId, setAuditUserId] = useState('');
  const [auditUserEmail, setAuditUserEmail] = useState('');

  // Registered Users Search (For new delegation)
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredAppUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedRegisteredUser, setSelectedRegisteredUser] = useState<RegisteredAppUser | null>(null);

  // Form states
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [dailyActivationsLimit, setDailyActivationsLimit] = useState('10');
  const [customActivationsInput, setCustomActivationsInput] = useState('');
  const [allowedPackages, setAllowedPackages] = useState<number[]>([50000, 200000]);
  const [allowCustomAmount, setAllowCustomAmount] = useState(false);
  const [maxConcurrentSessions, setMaxConcurrentSessions] = useState('1');
  const [customConcurrentInput, setCustomConcurrentInput] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState('60');
  const [userRole, setUserRole] = useState<'delegated_user' | 'vip_operator'>('delegated_user');
  const [notes, setNotes] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, analyticsData] = await Promise.all([
        getDelegatedVipUsers(),
        getVipOwnerAnalytics(),
      ]);
      setUsers(usersData);
      setAnalytics(analyticsData);
    } catch (err) {
      console.error(err);
      toast.error('تعذر جلب بيانات لوحة تحكم المالك');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Search registered users for the modal
  useEffect(() => {
    if (!modalOpen || editingUserId) return;
    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const results = await searchRegisteredAppUsers(searchUserQuery);
        setRegisteredUsers(results);
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setSearchingUsers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [modalOpen, searchUserQuery, editingUserId]);

  const openAddModal = () => {
    setEditingUserId(null);
    setSelectedRegisteredUser(null);
    setSearchUserQuery('');
    setUserEmail('');
    setUserId('');
    setUserName('');
    setDailyActivationsLimit('10');
    setCustomActivationsInput('');
    setAllowedPackages([50000, 200000]);
    setAllowCustomAmount(false);
    setMaxConcurrentSessions('1');
    setCustomConcurrentInput('');
    setCooldownSeconds('60');
    setUserRole('delegated_user');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (u: DelegatedUser) => {
    setEditingUserId(u.user_id);
    setSelectedRegisteredUser(null);
    setUserEmail(u.user_email || '');
    setUserId(u.user_id);
    setUserName(u.user_name || '');
    const cycles = String(u.max_daily_cycles ?? 10);
    if (DAILY_ACTIVATION_OPTIONS.includes(cycles)) {
      setDailyActivationsLimit(cycles);
      setCustomActivationsInput('');
    } else {
      setDailyActivationsLimit('custom');
      setCustomActivationsInput(cycles);
    }

    setAllowedPackages(u.allowed_packages?.length ? u.allowed_packages : [50000, 200000]);
    setAllowCustomAmount(Boolean(u.allow_custom_amount));

    const sess = String(u.max_concurrent_sessions ?? 1);
    if (CONCURRENT_SESSION_OPTIONS.includes(sess)) {
      setMaxConcurrentSessions(sess);
      setCustomConcurrentInput('');
    } else {
      setMaxConcurrentSessions('custom');
      setCustomConcurrentInput(sess);
    }

    setCooldownSeconds(String(u.cooldown_seconds ?? u.min_cooldown_seconds ?? 60));
    setUserRole((u.user_role as any) === 'vip_operator' ? 'vip_operator' : 'delegated_user');
    setNotes(u.notes || '');
    setModalOpen(true);
  };

  const openUserAudit = (u: DelegatedUser) => {
    navigate(`/admin/vip-user-audit/${u.user_id}`);
  };

  const handleSelectRegisteredUser = (regUser: RegisteredAppUser) => {
    setSelectedRegisteredUser(regUser);
    setUserId(regUser.id);
    setUserEmail(regUser.email);
    setUserName(regUser.full_name || regUser.username || regUser.email.split('@')[0]);
  };

  const togglePackage = (pkg: number) => {
    setAllowedPackages((prev) =>
      prev.includes(pkg) ? prev.filter((p) => p !== pkg) : [...prev, pkg].sort((a, b) => a - b)
    );
  };

  const handleToggleStatus = async (user: DelegatedUser) => {
    const nextState = !user.is_active;
    try {
      const success = await toggleDelegatedUserStatus(user.user_id, nextState);
      if (success) {
        toast.success(nextState ? 'تم إظهار وتفعيل القسم للمستخدم' : 'تم حجب وتعطيل القسم عن المستخدم');
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
    if (!window.confirm('هل أنت متأكد من حذف تفويض هذا المستخدم وحجب القسم عنه نهائياً؟')) return;
    try {
      const success = await deleteDelegatedUser(targetUserId);
      if (success) {
        toast.success('تم حذف التفويض وإخفاء القسم');
        setUsers((prev) => prev.filter((u) => u.user_id !== targetUserId));
      } else {
        toast.error('تعذر الحذف');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail.trim()) {
      toast.error('يرجى اختيار أو إدخال البريد الإلكتروني للمستخدم');
      return;
    }
    if (allowedPackages.length === 0 && !allowCustomAmount) {
      toast.error('يرجى اختيار حزمة واحدة على الأقل أو تفعيل خيار الإدخال اليدوي');
      return;
    }

    const resolvedActivations =
      dailyActivationsLimit === 'custom'
        ? parseInt(customActivationsInput, 10) || 10
        : parseInt(dailyActivationsLimit, 10) || 10;

    const resolvedSessions =
      maxConcurrentSessions === 'custom'
        ? parseInt(customConcurrentInput, 10) || 1
        : parseInt(maxConcurrentSessions, 10) || 1;

    setSaving(true);
    try {
      let resolvedUserId = editingUserId || userId.trim();
      if (!resolvedUserId) {
        resolvedUserId = crypto.randomUUID();
      }

      const res = await saveDelegatedUser({
        user_id: resolvedUserId,
        user_email: userEmail.trim(),
        user_name: userName.trim() || userEmail.split('@')[0],
        is_active: true,
        max_daily_cycles: resolvedActivations,
        max_daily_mixes: 500000,
        allowed_packages: allowedPackages,
        allow_custom_amount: allowCustomAmount,
        max_concurrent_sessions: resolvedSessions,
        cooldown_seconds: parseInt(cooldownSeconds, 10) || 60,
        user_role: userRole,
        notes: notes.trim(),
      });

      if (res.success) {
        toast.success(editingUserId ? 'تم تحديث صلاحيات المستخدم بنجاح!' : 'تم تفويض المستخدم وإظهار القسم له بنجاح!');
        setModalOpen(false);
        loadData();
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
    <div className="space-y-3" dir="rtl">
      {/* ── لوحة الإحصائيات المضغوطة للمالك ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">
        <Card className="border border-border bg-card p-2 sm:p-2.5 rounded-lg shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] sm:text-[11px] font-medium">إجمالي العمليات</span>
            <Activity className="w-3 h-3 text-primary" />
          </div>
          <div className="text-base sm:text-lg font-bold text-foreground mt-0.5 font-mono">
            {analytics?.total_ops ?? 0}
          </div>
          <span className="text-[9px] text-muted-foreground block">منذ تدشين النظام</span>
        </Card>

        <Card className="border border-border bg-card p-2 sm:p-2.5 rounded-lg shadow-sm">
          <div className="flex items-center justify-between text-emerald-500">
            <span className="text-[10px] sm:text-[11px] font-medium">العمليات الناجحة</span>
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          </div>
          <div className="text-base sm:text-lg font-bold text-emerald-500 mt-0.5 font-mono">
            {analytics?.success_ops ?? 0}
          </div>
          <span className="text-[9px] text-muted-foreground block">
            {analytics?.total_ops ? Math.round(((analytics.success_ops || 0) / analytics.total_ops) * 100) : 100}% نسبة النجاح
          </span>
        </Card>

        <Card className="border border-border bg-card p-2 sm:p-2.5 rounded-lg shadow-sm">
          <div className="flex items-center justify-between text-rose-500">
            <span className="text-[10px] sm:text-[11px] font-medium">العمليات المتعثرة</span>
            <XCircle className="w-3 h-3 text-rose-500" />
          </div>
          <div className="text-base sm:text-lg font-bold text-rose-500 mt-0.5 font-mono">
            {analytics?.failed_ops ?? 0}
          </div>
          <span className="text-[9px] text-muted-foreground block">لا تُخصم من العداد</span>
        </Card>

        <Card className="border border-border bg-card p-2 sm:p-2.5 rounded-lg shadow-sm">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-[10px] sm:text-[11px] font-medium">المستخدمون المفوضون</span>
            <Users className="w-3 h-3 text-amber-500" />
          </div>
          <div className="text-base sm:text-lg font-bold text-amber-500 mt-0.5 font-mono">
            {users.filter((u) => u.is_active).length}
          </div>
          <span className="text-[9px] text-muted-foreground block">متاح لهم الوصول</span>
        </Card>
      </div>

      {/* ── بطاقة تحليل أسباب الفشل والتعثر ── */}
      {analytics?.failure_reasons && analytics.failure_reasons.length > 0 && (
        <div className="p-2 sm:p-2.5 rounded-lg bg-card border border-border flex flex-wrap items-center gap-1.5 text-xs">
          <div className="flex items-center gap-1 text-[11px] font-bold text-amber-500 shrink-0">
            <AlertCircle className="w-3 h-3" />
            <span>أسباب التعثر:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {analytics.failure_reasons.map((r, i) => (
              <Badge
                key={i}
                variant="outline"
                className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[9px] py-0 px-1.5 flex items-center gap-1"
              >
                <span>{r.reason}</span>
                <span className="font-mono bg-rose-500/20 px-0.5 rounded text-[8px]">({r.count})</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── شريط الإدارة والتحكم في المستخدمين ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-card border border-border shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-foreground truncate">
              المستخدمون المفوضون وصلاحيات التفعيل
            </h2>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground line-clamp-1">
              القسم مخفي عن الجميع؛ قم بتفويض حساب مسجل وتحديد عدد التفعيلات والجلسات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="h-8 text-xs px-2.5 flex-1 sm:flex-none">
            <RefreshCw className={`w-3.5 h-3.5 ml-1 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>

          <Button size="sm" onClick={openAddModal} className="h-8 text-xs px-3 bg-primary text-primary-foreground font-semibold hover:bg-primary/90 flex-1 sm:flex-none">
            <UserPlus className="w-3.5 h-3.5 ml-1" />
            تفويض مستخدم مسجل
          </Button>
        </div>
      </div>

      {/* ── جدول وقوائم المستخدمين المصرح لهم ── */}
      <Card className="border border-border bg-card overflow-hidden shadow-xs">
        <CardHeader className="py-2.5 px-3.5 border-b border-border/60 bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-foreground">
              <Users className="w-4 h-4 text-primary" />
              <span>قائمة المستخدمين المفوضين ({users.length})</span>
            </CardTitle>
            <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
              Zero-Trust Verified
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-primary" />
              جاري تحميل المستخدمين وبيانات الصلاحيات...
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground space-y-1.5">
              <Lock className="w-7 h-7 mx-auto text-muted-foreground/40" />
              <p className="font-semibold text-foreground text-sm">القسم مخفي تماماً عن جميع المستخدمين.</p>
              <p className="text-xs">انقر على &ldquo;تفويض مستخدم مسجل&rdquo; لاختيار حساب مسجل ومنحه الصلاحيات.</p>
            </div>
          ) : (
            <>
              {/* ── طريقة عرض بطاقات الهواتف الذكية (Mobile View < md) ── */}
              <div className="md:hidden divide-y divide-border/60">
                {users.map((u) => {
                  const pkgs = u.allowed_packages?.length ? u.allowed_packages : [50000, 200000];
                  return (
                    <div key={u.id} className="p-3.5 space-y-3 hover:bg-muted/10 transition-colors">
                      {/* رأس البطاقة: المستخدم والحالة ومفتاح التشغيل */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 font-bold text-sm shrink-0">
                            {(u.user_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-foreground truncate">
                              {u.user_name || 'مستخدم مسجل'}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate" dir="ltr">
                              {u.user_email}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/25 text-[9px] px-1 py-0">
                                {u.user_role === 'vip_operator' ? 'مشغل باقات متقدم' : 'مستخدم مفوض VIP'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant="outline"
                            className={
                              u.is_active
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] py-0.5 px-2'
                                : 'bg-muted text-muted-foreground border-border text-[10px] py-0.5 px-2'
                            }
                          >
                            {u.is_active ? 'مفعل' : 'معطل'}
                          </Badge>
                          <Switch
                            checked={u.is_active}
                            onCheckedChange={() => handleToggleStatus(u)}
                            title={u.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                          />
                        </div>
                      </div>

                      {/* شبكة الإحصائيات المصغرة للهاتف */}
                      <div className="grid grid-cols-2 gap-1.5 bg-muted/20 p-2.5 rounded-lg border border-border/50 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-[10px]">التفعيلات اليوم:</span>
                          <span className="font-mono font-bold text-foreground">
                            {u.cycle_count_today ?? 0} / {u.max_daily_cycles ?? 10}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-[10px]">الفاصل الزمني:</span>
                          <span className="font-mono text-amber-400 font-bold">
                            {u.cooldown_seconds ?? u.min_cooldown_seconds ?? 60}ث
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-[10px]">الجلسات:</span>
                          <span className="font-mono font-bold text-foreground">
                            {u.max_concurrent_sessions ?? 1}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-[10px]">إدخال يدوي:</span>
                          <span className="font-medium text-foreground">
                            {u.allow_custom_amount ? 'مسموح' : 'غير متاح'}
                          </span>
                        </div>
                      </div>

                      {/* الخانات المصرح بها */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-medium">الخانات المصرحة:</span>
                        {pkgs.map((p) => (
                          <span
                            key={p}
                            className="bg-primary/10 text-primary border border-primary/20 text-[9px] font-mono px-1.5 py-0.5 rounded font-bold"
                          >
                            {p >= 1000 ? `${p / 1000}k` : p}
                          </span>
                        ))}
                      </div>

                      {/* أزرار الإجراءات واضحة وواسعة */}
                      <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openUserAudit(u)}
                          className="flex-1 h-8 text-xs gap-1.5 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-bold"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>سجل وتدقيق شامل</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(u)}
                          className="h-8 px-3 text-xs gap-1 border-border hover:bg-muted"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(u.user_id)}
                          className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                          title="حذف التفويض"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── طريقة عرض الجدول للشاشات الكبيرة (Desktop View >= md) ── */}
              <div className="hidden md:block w-full overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/10 text-muted-foreground text-[10px]">
                      <th className="py-2 pr-3 font-semibold">المستخدم</th>
                      <th className="py-2 font-semibold">الحالة</th>
                      <th className="py-2 font-semibold">التفعيلات اليوم</th>
                      <th className="py-2 font-semibold">الخانات المصرح بها</th>
                      <th className="py-2 font-semibold">إدخال يدوي</th>
                      <th className="py-2 font-semibold">الجلسات</th>
                      <th className="py-2 font-semibold">الفاصل</th>
                      <th className="py-2 pl-3 text-left font-semibold">إجراءات وتدقيق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {users.map((u) => {
                      const pkgs = u.allowed_packages?.length ? u.allowed_packages : [50000, 200000];
                      return (
                        <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2 pr-3">
                            <div className="font-semibold text-foreground text-[11px] leading-tight">
                              {u.user_name || 'مستخدم'}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono" dir="ltr">
                              {u.user_email}
                            </div>
                            <div className="mt-0.5">
                              <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/25 text-[9px] px-1 py-0">
                                {u.user_role === 'vip_operator' ? 'مشغل باقات متقدم' : 'مستخدم مفوض VIP'}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-2">
                            <Badge
                              variant="outline"
                              className={
                                u.is_active
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] py-0 px-1.5'
                                  : 'bg-muted text-muted-foreground border-border text-[10px] py-0 px-1.5'
                              }
                            >
                              {u.is_active ? 'مفعل' : 'معطل'}
                            </Badge>
                          </td>
                          <td className="py-2 font-mono text-[11px] font-semibold text-foreground">
                            {u.cycle_count_today ?? 0}
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {' '}/ {u.max_daily_cycles ?? 10}
                            </span>
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1 max-w-[150px]">
                              {pkgs.map((p) => (
                                <span
                                  key={p}
                                  className="bg-primary/10 text-primary border border-primary/20 text-[9px] font-mono px-1.5 py-0.5 rounded font-bold"
                                >
                                  {p >= 1000 ? `${p / 1000}k` : p}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2">
                            {u.allow_custom_amount ? (
                              <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[9px] px-1.5 py-0.5">مسموح</Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">لا</span>
                            )}
                          </td>
                          <td className="py-2 font-mono text-foreground font-semibold text-[11px]">
                            {u.max_concurrent_sessions ?? 1}
                          </td>
                          <td className="py-2 font-mono text-amber-400 text-[11px]">
                            {u.cooldown_seconds ?? u.min_cooldown_seconds ?? 60}ث
                          </td>
                          <td className="py-2 pl-3 text-left">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* زر المراجعة والتدقيق الشامل */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openUserAudit(u)}
                                className="h-7 px-2 text-[10px] gap-1 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                                title="عرض السجل الكامل والجلسات وكلمات المرور"
                              >
                                <Eye className="w-3 h-3" />
                                <span>تدقيق شامل</span>
                              </Button>

                              <Switch
                                checked={u.is_active}
                                onCheckedChange={() => handleToggleStatus(u)}
                                title={u.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                              />

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditModal(u)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title="تعديل الصلاحيات"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(u.user_id)}
                                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                title="حذف التفويض"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── نموذج إضافة / تعديل الصلاحيات المتجاوب المريح ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="fixed inset-0 left-0 top-0 translate-x-0 translate-y-0 w-full h-[100dvh] max-w-none max-h-none sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-full sm:max-w-xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl rounded-none p-3.5 sm:p-5 flex flex-col overflow-hidden bg-card border-border shadow-2xl" dir="rtl">
          <DialogHeader className="pb-2.5 border-b border-border space-y-0 shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-foreground">
                <Sliders className="w-4 h-4 text-primary" />
                <span>{editingUserId ? 'تعديل صلاحيات وتفعيلات المستخدم' : 'تفويض واختيار مستخدم مسجل بالمنظومة'}</span>
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setModalOpen(false)}
                className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground sm:hidden"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto space-y-3 pt-2 text-xs pr-0.5">
            {/* اختيار المستخدم المسجل عند الإضافة */}
            {!editingUserId ? (
              <div className="space-y-1.5 p-2 rounded-lg bg-background border border-border">
                <label className="text-[11px] font-bold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Search className="w-3 h-3 text-primary" />
                    البحث في المستخدمين المسجلين في التطبيق *
                  </span>
                  {selectedRegisteredUser && (
                    <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30">
                      تم اختيار المستخدم
                    </Badge>
                  )}
                </label>

                <div className="relative">
                  <Input
                    value={searchUserQuery}
                    onChange={(e) => setSearchUserQuery(e.target.value)}
                    placeholder="ابحث بالاسم، البريد الإلكتروني، أو رقم الهاتف..."
                    className="h-7 text-xs pr-7 bg-card font-sans"
                  />
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-2" />
                </div>

                {/* قائمة نتائج البحث السريعة */}
                {searchingUsers ? (
                  <div className="text-[10px] text-muted-foreground p-2 text-center">
                    <RefreshCw className="w-3 h-3 animate-spin inline-block ml-1" />
                    جاري البحث في قاعدة البيانات...
                  </div>
                ) : registeredUsers.length > 0 ? (
                  <div className="max-h-32 overflow-y-auto divide-y divide-border/30 rounded border border-border/60 bg-card">
                    {registeredUsers.map((reg) => {
                      const isSelected = selectedRegisteredUser?.id === reg.id;
                      return (
                        <div
                          key={reg.id}
                          onClick={() => handleSelectRegisteredUser(reg)}
                          className={`p-1.5 flex items-center justify-between text-[10px] cursor-pointer hover:bg-primary/10 transition-colors ${
                            isSelected ? 'bg-primary/15 font-semibold text-primary' : 'text-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <User className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="font-medium text-foreground">{reg.full_name || reg.username || 'مستخدم'}</span>
                            <span className="text-muted-foreground font-mono truncate" dir="ltr">{reg.email}</span>
                            {reg.phone && <span className="text-amber-500 font-mono text-[9px] shrink-0">{reg.phone}</span>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {reg.is_already_delegated && (
                              <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-amber-500/30 text-amber-500">
                                مفوض مسبقاً
                              </Badge>
                            )}
                            {isSelected && <Check className="w-3 h-3 text-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : searchUserQuery.trim() ? (
                  <div className="text-[10px] text-muted-foreground p-1 text-center">
                    لم يتم العثور على مستخدم مطابق.
                  </div>
                ) : null}

                {/* البريد والاسم المحدد */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <div>
                    <label className="text-[9px] text-muted-foreground">البريد المختار:</label>
                    <Input
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="user@example.com"
                      required
                      dir="ltr"
                      className="h-7 text-xs font-mono bg-card"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">اللقب / الاسم:</label>
                    <Input
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="اسم العميل"
                      className="h-7 text-xs bg-card"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-2 rounded bg-muted/40 border border-border flex items-center justify-between text-xs font-mono">
                <span className="text-muted-foreground">المستخدم:</span>
                <span className="font-bold text-foreground">{userEmail}</span>
              </div>
            )}

            {/* ── تحديد رتبة ونوع الحساب في المنظومة ── */}
            <div className="space-y-1.5 p-2 rounded-lg bg-primary/5 border border-primary/20">
              <label className="text-[11px] font-bold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  <span>رتبة الحساب ونوع الصلاحية في السيرفر:</span>
                </span>
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] px-1.5 py-0 font-bold">
                  {userRole === 'delegated_user' ? 'مستخدم مفوض (VIP User)' : 'مشغل باقات متقدم (VIP Operator)'}
                </Badge>
              </label>
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <div
                  onClick={() => setUserRole('delegated_user')}
                  className={`p-2 rounded-lg border text-right cursor-pointer transition-all ${
                    userRole === 'delegated_user'
                      ? 'border-sky-500 bg-sky-500/10 text-foreground font-bold shadow-sm'
                      : 'border-border bg-card/60 text-muted-foreground hover:bg-card'
                  }`}
                >
                  <div className="text-[11px] flex items-center gap-1 font-bold">
                    <User className="w-3 h-3 text-sky-400" />
                    <span>مستخدم مفوض (VIP)</span>
                  </div>
                  <p className="text-[9.5px] text-muted-foreground mt-0.5 font-normal">
                    صلاحية إنشاء وإدارة جلساته الخاصة وتنفيذ دورات الميكسات وفق الباقات المحددة
                  </p>
                </div>
                <div
                  onClick={() => setUserRole('vip_operator')}
                  className={`p-2 rounded-lg border text-right cursor-pointer transition-all ${
                    userRole === 'vip_operator'
                      ? 'border-emerald-500 bg-emerald-500/10 text-foreground font-bold shadow-sm'
                      : 'border-border bg-card/60 text-muted-foreground hover:bg-card'
                  }`}
                >
                  <div className="text-[11px] flex items-center gap-1 font-bold">
                    <Activity className="w-3 h-3 text-emerald-400" />
                    <span>مشغل متقدم (Operator)</span>
                  </div>
                  <p className="text-[9.5px] text-muted-foreground mt-0.5 font-normal">
                    صلاحية أتمتة متقدمة ومراقبة شاملة لكافة الدورات وجدولة العمليات
                  </p>
                </div>
              </div>
            </div>

            {/* ── عدد التفعيلات اليومية المسموحة (بديل سقف الميكسات) ── */}
            <div className="space-y-1 p-2 rounded-lg bg-background border border-border">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-foreground">
                  عدد التفعيلات اليومية المسموحة (الجلسات الناجحة):
                </label>
                <span className="text-[9px] text-muted-foreground">
                  تُحسب التفعيلة عند بدء واكتمال الجلسة بنجاح فقط
                </span>
              </div>

              <div className="flex items-center gap-1">
                {DAILY_ACTIVATION_OPTIONS.map((act) => (
                  <Button
                    key={act}
                    type="button"
                    size="sm"
                    variant={dailyActivationsLimit === act ? 'default' : 'outline'}
                    onClick={() => {
                      setDailyActivationsLimit(act);
                      setCustomActivationsInput('');
                    }}
                    className="flex-1 h-6 text-xs font-mono"
                  >
                    {act}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant={dailyActivationsLimit === 'custom' ? 'default' : 'outline'}
                  onClick={() => setDailyActivationsLimit('custom')}
                  className="h-6 text-xs px-2"
                >
                  مخصص
                </Button>
              </div>

              {dailyActivationsLimit === 'custom' && (
                <div className="pt-1">
                  <Input
                    type="number"
                    value={customActivationsInput}
                    onChange={(e) => setCustomActivationsInput(e.target.value)}
                    placeholder="أدخل عدد التفعيلات (مثلاً: 100 أو 999)"
                    min={1}
                    className="h-7 text-xs font-mono"
                  />
                </div>
              )}
            </div>

            {/* ── اختيار الخانات المتاحة للمستخدم ── */}
            <div className="space-y-1 p-2 rounded-lg bg-background border border-border">
              <label className="text-[11px] font-bold text-foreground flex items-center justify-between">
                <span>الخانات المسموحة للمستخدم:</span>
                <span className="text-[9px] text-muted-foreground font-normal">حدد ما يظهر في واجهته</span>
              </label>
              <div className="grid grid-cols-5 gap-1">
                {AVAILABLE_PACKAGE_OPTIONS.map((pkg) => {
                  const isChecked = allowedPackages.includes(pkg);
                  return (
                    <Button
                      key={pkg}
                      type="button"
                      size="sm"
                      variant={isChecked ? 'default' : 'outline'}
                      onClick={() => togglePackage(pkg)}
                      className="h-6 text-[10px] font-mono px-0.5"
                    >
                      {pkg / 1000}k
                    </Button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-border/40 mt-1">
                <span className="text-[10px] text-muted-foreground">السماح بالإدخال اليدوي للميكسات:</span>
                <Switch
                  checked={allowCustomAmount}
                  onCheckedChange={setAllowCustomAmount}
                />
              </div>
            </div>

            {/* ── عدد الجلسات المتزامنة والفاصل الزمني ── */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 p-2 rounded-lg bg-background border border-border">
                <label className="text-[10px] font-bold text-foreground">الجلسات المتزامنة</label>
                <div className="flex flex-wrap gap-1">
                  {CONCURRENT_SESSION_OPTIONS.map((num) => (
                    <Button
                      key={num}
                      type="button"
                      size="sm"
                      variant={maxConcurrentSessions === num ? 'default' : 'outline'}
                      onClick={() => {
                        setMaxConcurrentSessions(num);
                        setCustomConcurrentInput('');
                      }}
                      className="h-6 w-6 p-0 text-xs font-mono"
                    >
                      {num}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant={maxConcurrentSessions === 'custom' ? 'default' : 'outline'}
                    onClick={() => setMaxConcurrentSessions('custom')}
                    className="h-6 text-[10px] px-1.5"
                  >
                    رقم
                  </Button>
                </div>
                {maxConcurrentSessions === 'custom' && (
                  <Input
                    type="number"
                    value={customConcurrentInput}
                    onChange={(e) => setCustomConcurrentInput(e.target.value)}
                    placeholder="عدد الجلسات (مثلاً: 15)"
                    min={1}
                    max={50}
                    className="h-6 text-[11px] font-mono mt-1"
                  />
                )}
              </div>

              <div className="space-y-1 p-2 rounded-lg bg-background border border-border">
                <label className="text-[10px] font-bold text-foreground">الفاصل الزمني (ثوانٍ)</label>
                <div className="flex gap-1">
                  {['30', '50', '60'].map((sec) => (
                    <Button
                      key={sec}
                      type="button"
                      size="sm"
                      variant={cooldownSeconds === sec ? 'default' : 'outline'}
                      onClick={() => setCooldownSeconds(sec)}
                      className="flex-1 h-6 text-xs font-mono"
                    >
                      {sec}ث
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">ملاحظات سرية للمالك</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات حول العميل..."
                className="h-7 text-xs"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="h-7 text-xs px-3"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="h-7 text-xs px-3 bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin ml-1" />
                    جاري الحفظ...
                  </>
                ) : (
                  editingUserId ? 'حفظ الصلاحيات' : 'تفعيل وإظهار القسم للمستخدم'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── مودال التدقيق والمراجعة الشاملة للمستخدم ── */}
      <VipUserAuditModal
        open={auditModalOpen}
        onOpenChange={setAuditModalOpen}
        userId={auditUserId}
        userEmail={auditUserEmail}
      />
    </div>
  );
};
