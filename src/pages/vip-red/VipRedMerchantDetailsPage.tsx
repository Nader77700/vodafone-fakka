import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Crown,
  Search,
  Phone,
  UserCheck,
  UserX,
  Layers,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Copy,
  Trash2,
  ArrowLeftRight,
  Edit2,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useIsLight } from '@/contexts/ThemeContext';
import {
  getMerchantDetails,
  getMerchants,
  checkSingleMonitoredLine,
  deleteMonitoredLine,
  updateLineMerchantAndActivation,
  transferLineToMerchant,
  getLinkedMerchantForUser,
} from '@/lib/vipRedService';
import { runActivationRemindersCheck, calculateMerchantActivationStats } from '@/lib/vipRedActivationReminders';
import { supabase } from '@/db/supabase';
import VipRedLineDetailsModal from '@/components/line-info/VipRedLineDetailsModal';
import {
  type VipRedLine,
  type VipRedMerchant,
  type VipRedActivationDay,
  type VipRedMerchantStats,
  VALID_ACTIVATION_DAYS,
  classifyLineSystem,
} from '@/types/vipRed';

type TabKey = 'all' | 'day7' | 'day11' | 'day25' | 'unset';

export default function VipRedMerchantDetailsPage() {
  const { id: merchantId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const L = useIsLight();

  const [merchant, setMerchant] = useState<VipRedMerchant | null>(null);
  const [lines, setLines] = useState<VipRedLine[]>([]);
  const [stats, setStats] = useState<VipRedMerchantStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // صلاحيات المستخدم
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [ownMerchantId, setOwnMerchantId] = useState<string | null>(null);

  // تبويب مواعيد التفعيل المحدد
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchPhone, setSearchPhone] = useState('');

  // فحص خط يدوي
  const [checkingLineId, setCheckingLineId] = useState<string | null>(null);

  // مودال تفاصيل الخط
  const [selectedLineForDetails, setSelectedLineForDetails] = useState<VipRedLine | null>(null);

  // مودال تعديل موعد التفعيل للخط
  const [editingDayLine, setEditingDayLine] = useState<VipRedLine | null>(null);
  const [selectedNewDay, setSelectedNewDay] = useState<VipRedActivationDay | null>(null);
  const [isSavingDay, setIsSavingDay] = useState(false);

  // مودال نقل الخط لتاجر آخر
  const [transferringLine, setTransferringLine] = useState<VipRedLine | null>(null);
  const [allOtherMerchants, setAllOtherMerchants] = useState<VipRedMerchant[]>([]);
  const [targetMerchantId, setTargetMerchantId] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  // مودال تأكيد الحذف
  const [deletingLine, setDeletingLine] = useState<VipRedLine | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ألوان التصميم
  const bg = L ? '#f8fafc' : '#0a0a0f';
  const cardBg = L ? '#ffffff' : '#111318';
  const cardBdr = L ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
  const innerBg = L ? '#f1f5f9' : 'rgba(255, 255, 255, 0.04)';
  const textC = L ? '#0f172a' : '#f8fafc';
  const mutC = L ? '#64748b' : '#94a3b8';

  const loadData = useCallback(async () => {
    if (!merchantId) return;

    try {
      const adminRole = user?.role === 'admin' || (user as { is_admin?: boolean })?.is_admin === true;
      setIsAdminUser(Boolean(adminRole));

      // فحص هل المستخدم تاجر
      if (user?.id) {
        const linked = await getLinkedMerchantForUser(user.id);
        if (linked) {
          setOwnMerchantId(linked.id);
          // إذا لم يكن آدمن، والـ ID المطلوب لا يطابق تاجره -> رفض
          if (!adminRole && linked.id !== merchantId) {
            setIsForbidden(true);
            setErrorMessage('عذراً، حسابك مرتبط بتاجر آخر ولا تملك صلاحية الاطلاع على بيانات هذا التاجر.');
            setIsLoading(false);
            return;
          }
        }
      }

      const res = await getMerchantDetails(merchantId, user?.id, user?.role);

      if (!res.success) {
        if (res.isForbidden) {
          setIsForbidden(true);
          setErrorMessage(res.error || 'غير مصرح لك بالوصول لبيانات هذا التاجر');
        } else {
          setErrorMessage(res.error || 'تعذر تحميل بيانات التاجر');
        }
        setIsLoading(false);
        return;
      }

      setMerchant(res.merchant || null);
      setLines(res.lines || []);
      setStats(res.stats || null);
      setIsForbidden(false);

      // جلب قائمة التجار الآخرين لدعم النقل (للآدمن فقط)
      if (adminRole) {
        getMerchants().then(allM => {
          setAllOtherMerchants(allM.filter(m => m.id !== merchantId));
        }).catch(console.warn);
      }
    } catch (err) {
      console.error('[VipRedMerchantDetails] load error:', err);
      setErrorMessage('حدث خطأ غير متوقع أثناء تحميل بيانات التاجر');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [merchantId, user]);

  useEffect(() => {
    let isMounted = true;
    if (merchantId) {
      loadData();
    }

    if (user?.id) {
      runActivationRemindersCheck(user.id).catch(console.warn);
    }

    return () => {
      isMounted = false;
    };
  }, [merchantId, user?.id, loadData]);

  // اشتراك Realtime لمراقبة أي تحديث يطرأ على أرقام هذا التاجر
  useEffect(() => {
    if (!merchantId) return;

    let isMounted = true;
    const channel = supabase
      .channel(`vip_red_merchant_${merchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vip_red_monitored_lines',
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          if (!isMounted) return;
          if (payload.eventType === 'INSERT') {
            const newLine = payload.new as VipRedLine;
            setLines(prev => {
              if (prev.some(l => l.id === newLine.id)) return prev;
              const next = [newLine, ...prev];
              setStats(calculateMerchantActivationStats(next));
              return next;
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as VipRedLine;
            setLines(prev => {
              const next = prev.map(l => (l.id === updated.id ? updated : l));
              setStats(calculateMerchantActivationStats(next));
              return next;
            });
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id: string }).id;
            setLines(prev => {
              const next = prev.filter(l => l.id !== oldId);
              setStats(calculateMerchantActivationStats(next));
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [merchantId]);

  // تصفية الأرقام بحسب التبويب ورقم الهاتف
  const filteredLines = useMemo(() => {
    let result = [...lines];

    // فلترة التبويب
    if (activeTab === 'day7') {
      result = result.filter(l => l.activation_day === 7);
    } else if (activeTab === 'day11') {
      result = result.filter(l => l.activation_day === 11);
    } else if (activeTab === 'day25') {
      result = result.filter(l => l.activation_day === 25);
    } else if (activeTab === 'unset') {
      result = result.filter(l => !l.activation_day);
    }

    // فلترة البحث برقم الهاتف
    if (searchPhone.trim()) {
      const q = searchPhone.trim();
      result = result.filter(l => l.phone_number.includes(q));
    }

    return result;
  }, [lines, activeTab, searchPhone]);

  // نسخ رقم الهاتف
  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    toast.success(`تم نسخ الرقم ${phone}`);
  };

  // فحص يدوي لخط
  const handleSingleCheck = async (line: VipRedLine) => {
    if (!user) return;
    setCheckingLineId(line.id);
    try {
      const res = await checkSingleMonitoredLine(line, user.id);
      if (res.success && res.line) {
        setLines(prev => prev.map(l => (l.id === line.id ? res.line! : l)));
        toast.success(`تم فحص الرقم ${line.phone_number}`);
      } else {
        toast.error(res.error || 'تعذر استعلام نظام الخط');
      }
    } catch {
      toast.error('حدث خطأ أثناء فحص الخط');
    } finally {
      setCheckingLineId(null);
    }
  };

  // تعديل موعد التفعيل (7، 11، 25 أو إلغاء)
  const handleSaveActivationDay = async () => {
    if (!editingDayLine || !merchant) return;
    setIsSavingDay(true);
    try {
      const res = await updateLineMerchantAndActivation(editingDayLine.id, merchant.id, selectedNewDay);
      if (!res.success || !res.line) {
        toast.error(res.error || 'تعذر تعديل موعد التفعيل');
        return;
      }

      toast.success(
        selectedNewDay
          ? `تم ضبط موعد التفعيل للرقم ليوم ${selectedNewDay}`
          : 'تم إزالة موعد التفعيل من الرقم'
      );

      // تحديث فوري للحالة
      setLines(prev => prev.map(l => (l.id === editingDayLine.id ? res.line! : l)));
      setEditingDayLine(null);
      await loadData();
    } catch {
      toast.error('حدث خطأ أثناء حفظ موعد التفعيل');
    } finally {
      setIsSavingDay(false);
    }
  };

  // نقل الخط لتاجر آخر (مع الحفاظ الكامل على Phone ID وسجل الفحص)
  const handleTransferLine = async () => {
    if (!transferringLine || !targetMerchantId) return;
    setIsTransferring(true);
    try {
      const res = await transferLineToMerchant(transferringLine.id, targetMerchantId);
      if (!res.success || !res.line) {
        toast.error(res.error || 'تعذر نقل الخط للتاجر المحدد');
        return;
      }

      const targetM = allOtherMerchants.find(m => m.id === targetMerchantId);
      toast.success(
        `تم نقل الرقم ${transferringLine.phone_number} بنجاح إلى التاجر "${targetM?.name || 'الجديد'}"!`
      );

      // إزالة الخط من قائمة هذا التاجر فورياً
      setLines(prev => prev.filter(l => l.id !== transferringLine.id));
      setTransferringLine(null);
      setTargetMerchantId('');
      await loadData();
    } catch {
      toast.error('حدث خطأ أثناء نقل الرقم للتاجر');
    } finally {
      setIsTransferring(false);
    }
  };

  // حذف خط من المراقبة
  const handleDeleteLine = async () => {
    if (!deletingLine) return;
    setIsDeleting(true);
    try {
      const ok = await deleteMonitoredLine(deletingLine.id);
      if (!ok) {
        toast.error('تعذر حذف الرقم');
        return;
      }

      toast.success(`تم حذف الرقم ${deletingLine.phone_number} من المراقبة`);
      setLines(prev => prev.filter(l => l.id !== deletingLine.id));
      setDeletingLine(null);
      await loadData();
    } catch {
      toast.error('حدث خطأ أثناء حذف الرقم');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── في حال رفض الصلاحية للتاجر للوصول لتاجر آخر ──
  if (isForbidden) {
    return (
      <div
        className="min-h-screen p-4 flex items-center justify-center font-sans"
        style={{ background: bg, color: textC, direction: 'rtl' }}
      >
        <div
          className="max-w-md w-full p-6 rounded-2xl border text-center space-y-4 shadow-xl"
          style={{ background: cardBg, borderColor: cardBdr }}
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-black text-rose-600 dark:text-rose-400">
              غير مصرح بالوصول (403 Forbidden)
            </h2>
            <p className="text-xs" style={{ color: mutC }}>
              {errorMessage || 'لا تملك صلاحية الاطلاع على بيانات هذا التاجر.'}
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            {ownMerchantId ? (
              <button
                onClick={() => navigate(`/vip-red/merchants/${ownMerchantId}`)}
                className="w-full h-10 rounded-xl font-bold text-xs text-white"
                style={{ background: '#E60000' }}
              >
                الانتقال لصفحة أرقامي الخاصة
              </button>
            ) : (
              <button
                onClick={() => navigate('/vip-red')}
                className="w-full h-10 rounded-xl font-bold text-xs text-white"
                style={{ background: '#E60000' }}
              >
                العودة للرئيسية
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-32 font-sans transition-colors duration-200 select-none"
      style={{ background: bg, color: textC, direction: 'rtl' }}
    >
      {/* ── شريط الرأس الرئيسي ── */}
      <header
        className="sticky top-[57px] lg:top-0 z-30 border-b backdrop-blur-md px-2 sm:px-3 py-1.5 transition-colors"
        style={{
          background: L ? 'rgba(255, 255, 255, 0.92)' : 'rgba(17, 19, 24, 0.92)',
          borderColor: cardBdr,
        }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => (isAdminUser ? navigate('/vip-red/merchants') : navigate('/vip-red'))}
              className="p-1.5 rounded-lg border flex items-center justify-center transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 shrink-0"
              style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              title={isAdminUser ? 'العودة لقائمة التجار' : 'العودة للمركز'}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                <h1 className="text-sm sm:text-base font-black truncate">
                  {merchant ? `التاجر: ${merchant.name}` : 'تفاصيل التاجر'}
                </h1>
              </div>
              <p className="text-[10px] sm:text-[11px] truncate" style={{ color: mutC }}>
                {merchant?.phone ? `رقم التواصل: ${merchant.phone}` : 'متابعة الخطوط وتوزيع مواعيد التفعيل'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => navigate('/vip-red/renewals')}
              className="h-8 px-2.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
              title="سداد واشتراكات خطوط ريد"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">التجديد القادم</span>
            </button>

            <button
              onClick={() => {
                setIsRefreshing(true);
                loadData();
              }}
              disabled={isRefreshing}
              className="h-8 px-2.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>

            {isAdminUser && (
              <button
                onClick={() => navigate('/vip-red')}
                className="h-8 px-2.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                title="إضافة أرقام جديدة لهذا التاجر عبر مركز المراقبة"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">مركز المراقبة</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── المحتوى الرئيسي ── */}
      <main className="max-w-4xl mx-auto px-2 sm:px-3 py-2 sm:py-3 space-y-2 sm:space-y-2.5 pb-32">
        {/* بطاقة معلومات التاجر العلوية */}
        {merchant && (
          <div
            className="p-2.5 sm:p-3 rounded-xl border space-y-2 shadow-xs"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black" style={{ color: textC }}>
                    {merchant.name}
                  </h2>
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{
                      background: merchant.user_id
                        ? L ? '#ecfdf5' : 'rgba(16, 185, 129, 0.12)'
                        : innerBg,
                      borderColor: merchant.user_id
                        ? L ? '#a7f3d0' : 'rgba(16, 185, 129, 0.3)'
                        : cardBdr,
                      color: merchant.user_id
                        ? L ? '#047857' : '#34d399'
                        : mutC,
                    }}
                  >
                    {merchant.user_id ? (
                      <>
                        <UserCheck className="w-3 h-3 text-emerald-500" />
                        <span>حساب مستخدم مرتبط</span>
                      </>
                    ) : (
                      <>
                        <UserX className="w-3 h-3" />
                        <span>تاجر مستقل (إدارة عبر الآدمن)</span>
                      </>
                    )}
                  </span>
                </div>

                {merchant.notes && (
                  <p className="text-xs" style={{ color: mutC }}>
                    ملاحظات: {merchant.notes}
                  </p>
                )}
              </div>

              {merchant.phone && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono shrink-0 self-start sm:self-auto"
                  style={{ background: innerBg, borderColor: cardBdr }}
                  dir="ltr"
                >
                  <Phone className="w-3.5 h-3.5 text-blue-500" />
                  <span>{merchant.phone}</span>
                </div>
              )}
            </div>

            {/* شريط الإحصائيات الشامل وتوزيع الأيام 7، 11، 25 */}
            {stats && (
              <div className="pt-2 border-t space-y-2" style={{ borderColor: cardBdr }}>
                {/* الصف الأول: الإجماليات */}
                <div className="grid grid-cols-3 gap-2">
                  <div
                    className="p-1.5 sm:p-2 rounded-xl border text-center shadow-xs"
                    style={{ background: innerBg, borderColor: cardBdr }}
                  >
                    <span className="block text-[10px]" style={{ color: mutC }}>إجمالي الأرقام</span>
                    <span className="font-mono text-base font-black">{stats.totalLines}</span>
                  </div>

                  <div
                    className="p-1.5 sm:p-2 rounded-xl border text-center shadow-xs"
                    style={{ background: innerBg, borderColor: cardBdr }}
                  >
                    <span className="block text-[10px] text-emerald-500">تم التحويل لريد</span>
                    <span className="font-mono text-base font-black text-emerald-500">{stats.convertedLines}</span>
                  </div>

                  <div
                    className="p-1.5 sm:p-2 rounded-xl border text-center shadow-xs"
                    style={{ background: innerBg, borderColor: cardBdr }}
                  >
                    <span className="block text-[10px] text-amber-500">تحت المراقبة</span>
                    <span className="font-mono text-base font-black text-amber-500">{stats.monitoringLines}</span>
                  </div>
                </div>

                {/* الصف الثاني: عدادات مواعيد التفعيل (7، 11، 25) وأقرب موعد */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div
                    onClick={() => setActiveTab('day7')}
                    className="p-2 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-between"
                    style={{
                      background: activeTab === 'day7' ? (L ? '#eff6ff' : 'rgba(59, 130, 246, 0.15)') : innerBg,
                      borderColor: activeTab === 'day7' ? '#3b82f6' : cardBdr,
                    }}
                  >
                    <span className="text-xs font-bold text-blue-500">تفعيل يوم 7</span>
                    <span className="font-mono text-xs font-black">{stats.countDay7}</span>
                  </div>

                  <div
                    onClick={() => setActiveTab('day11')}
                    className="p-2 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-between"
                    style={{
                      background: activeTab === 'day11' ? (L ? '#faf5ff' : 'rgba(168, 85, 247, 0.15)') : innerBg,
                      borderColor: activeTab === 'day11' ? '#a855f7' : cardBdr,
                    }}
                  >
                    <span className="text-xs font-bold text-purple-500">تفعيل يوم 11</span>
                    <span className="font-mono text-xs font-black">{stats.countDay11}</span>
                  </div>

                  <div
                    onClick={() => setActiveTab('day25')}
                    className="p-2 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-between"
                    style={{
                      background: activeTab === 'day25' ? (L ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)') : innerBg,
                      borderColor: activeTab === 'day25' ? '#f97316' : cardBdr,
                    }}
                  >
                    <span className="text-xs font-bold text-orange-500">تفعيل يوم 25</span>
                    <span className="font-mono text-xs font-black">{stats.countDay25}</span>
                  </div>

                  <div
                    className="p-2 rounded-xl border flex items-center justify-between col-span-2 sm:col-span-1"
                    style={{ background: innerBg, borderColor: cardBdr }}
                  >
                    <div className="flex items-center gap-1 text-[11px] text-amber-500 font-bold truncate">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>أقرب تفعيل</span>
                    </div>
                    <span className="text-[11px] font-black font-mono truncate">
                      {stats.nextActivationDay ? `يوم ${stats.nextActivationDay}` : 'غير محدد'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── أزرار التبويبات الفعالة (3 تابات للمواعيد + إجمالي) ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-bold">
          <button
            onClick={() => setActiveTab('all')}
            className="px-3 py-1.5 rounded-xl border shrink-0 transition-all active:scale-95 flex items-center gap-1.5"
            style={{
              background: activeTab === 'all' ? '#E60000' : cardBg,
              borderColor: activeTab === 'all' ? '#E60000' : cardBdr,
              color: activeTab === 'all' ? '#ffffff' : textC,
            }}
          >
            <span>جميع أرقام التاجر</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10 dark:bg-white/10">
              {lines.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('day7')}
            className="px-3 py-1.5 rounded-xl border shrink-0 transition-all active:scale-95 flex items-center gap-1.5"
            style={{
              background: activeTab === 'day7' ? '#3b82f6' : cardBg,
              borderColor: activeTab === 'day7' ? '#3b82f6' : cardBdr,
              color: activeTab === 'day7' ? '#ffffff' : textC,
            }}
          >
            <span>تفعيل يوم 7</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10 dark:bg-white/10">
              {lines.filter(l => l.activation_day === 7).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('day11')}
            className="px-3 py-1.5 rounded-xl border shrink-0 transition-all active:scale-95 flex items-center gap-1.5"
            style={{
              background: activeTab === 'day11' ? '#a855f7' : cardBg,
              borderColor: activeTab === 'day11' ? '#a855f7' : cardBdr,
              color: activeTab === 'day11' ? '#ffffff' : textC,
            }}
          >
            <span>تفعيل يوم 11</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10 dark:bg-white/10">
              {lines.filter(l => l.activation_day === 11).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('day25')}
            className="px-3 py-1.5 rounded-xl border shrink-0 transition-all active:scale-95 flex items-center gap-1.5"
            style={{
              background: activeTab === 'day25' ? '#f97316' : cardBg,
              borderColor: activeTab === 'day25' ? '#f97316' : cardBdr,
              color: activeTab === 'day25' ? '#ffffff' : textC,
            }}
          >
            <span>تفعيل يوم 25</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10 dark:bg-white/10">
              {lines.filter(l => l.activation_day === 25).length}
            </span>
          </button>

          {lines.some(l => !l.activation_day) && (
            <button
              onClick={() => setActiveTab('unset')}
              className="px-3 py-1.5 rounded-xl border shrink-0 transition-all active:scale-95 flex items-center gap-1.5"
              style={{
                background: activeTab === 'unset' ? '#64748b' : cardBg,
                borderColor: activeTab === 'unset' ? '#64748b' : cardBdr,
                color: activeTab === 'unset' ? '#ffffff' : textC,
              }}
            >
              <span>بدون موعد</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10 dark:bg-white/10">
                {lines.filter(l => !l.activation_day).length}
              </span>
            </button>
          )}
        </div>

        {/* ── شريط بحث الأرقام ── */}
        <div
          className="p-2 sm:p-2.5 rounded-xl border flex items-center gap-2"
          style={{ background: cardBg, borderColor: cardBdr }}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: mutC }} />
          <input
            type="tel"
            value={searchPhone}
            onChange={e => setSearchPhone(e.target.value)}
            placeholder="ابحث برقم الهاتف داخل هذا التاجر..."
            className="w-full bg-transparent text-xs font-mono outline-none"
            style={{ color: textC }}
            dir="ltr"
          />
          {searchPhone && (
            <button
              onClick={() => setSearchPhone('')}
              className="text-xs px-2 py-0.5 rounded border"
              style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
            >
              مسح
            </button>
          )}
        </div>

        {/* ── قائمة كروت الأرقام ── */}
        {isLoading ? (
          <div
            className="p-8 rounded-xl border text-center space-y-2"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#E60000]" />
            <p className="text-xs font-bold" style={{ color: mutC }}>
              جاري تحميل أرقام التاجر...
            </p>
          </div>
        ) : filteredLines.length === 0 ? (
          <div
            className="p-8 rounded-xl border text-center space-y-2"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <Layers className="w-10 h-10 mx-auto text-muted-foreground/30" />
            <h3 className="text-sm font-black" style={{ color: textC }}>
              لا توجد أرقام في هذا التبويب
            </h3>
            <p className="text-xs" style={{ color: mutC }}>
              {searchPhone
                ? 'لا توجد أرقام مطابقة لبحثك'
                : 'يمكن للمسؤول إضافة أرقام جديدة أو نقل أرقام لهذا التاجر وضبط موعد تفعيلها'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredLines.map(line => {
              const cls = classifyLineSystem(line.current_system);
              const isChecking = checkingLineId === line.id;
              const hasConverted = line.system_status === 'converted';

              return (
                <div
                  key={line.id}
                  className="p-3 sm:p-3.5 rounded-xl border space-y-2.5 transition-all"
                  style={{
                    background: cardBg,
                    borderColor: hasConverted ? 'rgba(16, 185, 129, 0.4)' : cardBdr,
                  }}
                >
                  {/* رأس كارت الخط: الرقم والشارات */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm sm:text-base font-black tracking-wider" dir="ltr">
                        {line.phone_number}
                      </span>
                      {line.customer_name && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-muted text-foreground">
                          👤 {line.customer_name}
                        </span>
                      )}
                      <button
                        onClick={() => handleCopyPhone(line.phone_number)}
                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition-colors"
                        title="نسخ الرقم"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {/* شارة موعد التفعيل */}
                      {line.activation_day && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{
                            background:
                              line.activation_day === 7
                                ? (L ? '#eff6ff' : 'rgba(59, 130, 246, 0.15)')
                                : line.activation_day === 11
                                ? (L ? '#faf5ff' : 'rgba(168, 85, 247, 0.15)')
                                : (L ? '#fff7ed' : 'rgba(249, 115, 22, 0.15)'),
                            borderColor:
                              line.activation_day === 7
                                ? '#3b82f6'
                                : line.activation_day === 11
                                ? '#a855f7'
                                : '#f97316',
                            color:
                              line.activation_day === 7
                                ? '#3b82f6'
                                : line.activation_day === 11
                                ? '#a855f7'
                                : '#f97316',
                          }}
                        >
                          تفعيل يوم {line.activation_day}
                        </span>
                      )}
                    </div>

                    {/* شارة حالة النظام */}
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full border truncate"
                      style={{
                        background: cls.badgeBg,
                        borderColor: cls.badgeBorder,
                        color: cls.badgeText,
                      }}
                    >
                      {cls.label}
                    </span>
                  </div>

                  {/* تفاصيل الفحص السريعة */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]" style={{ color: mutC }}>
                    <div>
                      <span>عدد الفحوصات: </span>
                      <span className="font-mono font-bold" style={{ color: textC }}>
                        {line.check_count}
                      </span>
                    </div>

                    <div>
                      <span>آخر فحص: </span>
                      <span className="font-mono" style={{ color: textC }}>
                        {line.last_checked_at
                          ? new Date(line.last_checked_at).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'لم يفحص'}
                      </span>
                    </div>

                    <div className="col-span-2 sm:col-span-2 truncate">
                      <span>الرصيد: </span>
                      <span className="font-mono font-bold" style={{ color: textC }}>
                        {line.last_line_info?.balance !== undefined && line.last_line_info?.balance !== null
                          ? `${line.last_line_info.balance} ج.م`
                          : 'غير متوفر'}
                      </span>
                    </div>
                  </div>

                  {/* شريط الأزرار والإجراءات */}
                  <div className="flex items-center justify-between gap-1.5 pt-2 border-t" style={{ borderColor: cardBdr }}>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedLineForDetails(line)}
                        className="h-7 px-2.5 rounded-lg border font-bold text-[11px] flex items-center gap-1 transition-all active:scale-95"
                        style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                      >
                        <ExternalLink className="w-3 h-3 text-blue-500" />
                        <span>تفاصيل الباقات</span>
                      </button>

                      <button
                        onClick={() => handleSingleCheck(line)}
                        disabled={isChecking}
                        className="h-7 px-2.5 rounded-lg border font-bold text-[11px] flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
                        style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                      >
                        <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin text-[#E60000]' : ''}`} />
                        <span>{isChecking ? 'جاري الفحص...' : 'فحص الآن'}</span>
                      </button>
                    </div>

                    {/* إجراءات خاصة بالمسؤول فقط (Admin Only) */}
                    {isAdminUser && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingDayLine(line);
                            setSelectedNewDay(line.activation_day || null);
                          }}
                          className="h-7 px-2 rounded-lg border font-bold text-[11px] flex items-center gap-1 transition-all active:scale-95 text-purple-600 dark:text-purple-400"
                          style={{ background: innerBg, borderColor: cardBdr }}
                          title="تعديل موعد التفعيل (7، 11، 25)"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span className="hidden sm:inline">موعد التفعيل</span>
                        </button>

                        <button
                          onClick={() => {
                            setTransferringLine(line);
                            setTargetMerchantId('');
                          }}
                          className="h-7 px-2 rounded-lg border font-bold text-[11px] flex items-center gap-1 transition-all active:scale-95 text-amber-600 dark:text-amber-400"
                          style={{ background: innerBg, borderColor: cardBdr }}
                          title="نقل الرقم لتاجر آخر مع الحفاظ على سجل المراقبة كاملاً"
                        >
                          <ArrowLeftRight className="w-3 h-3" />
                          <span className="hidden sm:inline">نقل لتاجر</span>
                        </button>

                        <button
                          onClick={() => setDeletingLine(line)}
                          className="h-7 w-7 rounded-lg border flex items-center justify-center transition-all active:scale-95 text-rose-500 hover:bg-rose-500/10"
                          style={{ borderColor: cardBdr }}
                          title="حذف الرقم"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── مودال تفاصيل الخط الشاملة ── */}
      <VipRedLineDetailsModal
        line={selectedLineForDetails}
        isOpen={Boolean(selectedLineForDetails)}
        onClose={() => setSelectedLineForDetails(null)}
        onRecheck={async (line: VipRedLine) => {
          await handleSingleCheck(line);
          const updated = lines.find(l => l.id === line.id) || null;
          setSelectedLineForDetails(updated);
        }}
        isRechecking={checkingLineId === selectedLineForDetails?.id}
        L={L}
      />

      {/* ── مودال تعديل موعد التفعيل ── */}
      {editingDayLine && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="w-full max-w-sm rounded-2xl border p-5 space-y-4 shadow-2xl"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  تعديل موعد التفعيل للرقم
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingDayLine(null)}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
              >
                ✕
              </button>
            </div>

            <p className="text-xs font-mono font-bold" style={{ color: textC }} dir="ltr">
              {editingDayLine.phone_number}
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold block" style={{ color: textC }}>
                اختر موعد التفعيل (ينتقل الرقم تلقائياً للتبويب المقابل):
              </label>
              <div className="grid grid-cols-3 gap-2">
                {VALID_ACTIVATION_DAYS.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedNewDay(day)}
                    className="h-10 rounded-xl border font-bold text-xs flex flex-col items-center justify-center transition-all"
                    style={{
                      background: selectedNewDay === day ? '#a855f7' : innerBg,
                      borderColor: selectedNewDay === day ? '#a855f7' : cardBdr,
                      color: selectedNewDay === day ? '#ffffff' : textC,
                    }}
                  >
                    <span>يوم {day}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSelectedNewDay(null)}
                className="w-full text-center text-[11px] text-rose-500 underline pt-1"
              >
                إلغاء موعد التفعيل (بدون موعد)
              </button>
            </div>

            <p className="text-[10px]" style={{ color: mutC }}>
              ملاحظة: تعديل موعد التفعيل ينقل الرقم فورياً في التبويب دون أي تأثير على جدول الفحص الدوري التلقائي (Auto Scan).
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: cardBdr }}>
              <button
                type="button"
                onClick={() => setEditingDayLine(null)}
                className="h-9 px-3.5 rounded-xl border font-bold text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveActivationDay}
                disabled={isSavingDay}
                className="h-9 px-4 rounded-xl font-bold text-xs text-white shadow-sm"
                style={{ background: '#a855f7' }}
              >
                {isSavingDay ? 'جاري الحفظ...' : 'حفظ التعديل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال نقل الرقم لتاجر آخر ── */}
      {transferringLine && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="w-full max-w-sm rounded-2xl border p-5 space-y-4 shadow-2xl"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  نقل الرقم لتاجر آخر
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTransferringLine(null)}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
              >
                ✕
              </button>
            </div>

            <div className="p-2.5 rounded-xl border text-xs space-y-1" style={{ background: innerBg, borderColor: cardBdr }}>
              <div className="flex items-center justify-between">
                <span style={{ color: mutC }}>الرقم المنقول:</span>
                <span className="font-mono font-bold" dir="ltr">{transferringLine.phone_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: mutC }}>التاجر الحالي:</span>
                <span className="font-bold">{merchant?.name}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold block" style={{ color: textC }}>
                اختر التاجر المستهدف:
              </label>
              <select
                value={targetMerchantId}
                onChange={e => setTargetMerchantId(e.target.value)}
                className="w-full h-10 rounded-xl px-3 outline-none border text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                <option value="">-- اضغط لاختيار التاجر المستهدف --</option>
                {allOtherMerchants.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.phone ? `(${m.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-2.5 rounded-xl border text-[11px] space-y-1 text-emerald-600 dark:text-emerald-400" style={{ background: innerBg, borderColor: cardBdr }}>
              <div className="flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>حماية كاملة للبيانات:</span>
              </div>
              <p className="text-[10px] opacity-90 leading-relaxed">
                يتم تحديث المرجع فقط مع الحفاظ التام على Phone ID وسجل الفحص وحالة المراقبة دون إنشاء أي سجل مكرر.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: cardBdr }}>
              <button
                type="button"
                onClick={() => setTransferringLine(null)}
                className="h-9 px-3.5 rounded-xl border font-bold text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleTransferLine}
                disabled={isTransferring || !targetMerchantId}
                className="h-9 px-4 rounded-xl font-bold text-xs text-white shadow-sm disabled:opacity-50"
                style={{ background: '#f59e0b' }}
              >
                {isTransferring ? 'جاري النقل...' : 'تأكيد نقل الخط'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال تأكيد حذف الخط ── */}
      {deletingLine && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="w-full max-w-sm rounded-2xl border p-5 space-y-4 shadow-2xl"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-black" style={{ color: textC }}>
                تأكيد حذف الرقم
              </h3>
            </div>

            <p className="text-xs" style={{ color: textC }}>
              هل أنت متأكد من حذف الرقم <span className="font-mono font-bold" dir="ltr">{deletingLine.phone_number}</span> من قائمة المراقبة للتاجر "{merchant?.name}"؟
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: cardBdr }}>
              <button
                type="button"
                onClick={() => setDeletingLine(null)}
                className="h-9 px-3.5 rounded-xl border font-bold text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteLine}
                disabled={isDeleting}
                className="h-9 px-4 rounded-xl font-bold text-xs text-white shadow-sm"
                style={{ background: '#e11d48' }}
              >
                {isDeleting ? 'جاري الحذف...' : 'نعم، حذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
