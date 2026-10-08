import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown,
  Search,
  Phone,
  UserCheck,
  UserX,
  Layers,
  ArrowRight,
  Plus,
  RefreshCw,
  Sparkles,
  Calendar,
  ChevronLeft,
  Clock,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useIsLight } from '@/contexts/ThemeContext';
import {
  getMerchantsWithStats,
  createMerchant,
  getRegisteredAppUsers,
  getMonitoredLines,
} from '@/lib/vipRedService';
import { runActivationRemindersCheck } from '@/lib/vipRedActivationReminders';
import type { VipRedMerchantWithStats, VipRedLine } from '@/types/vipRed';

export default function VipRedMerchantsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const L = useIsLight();

  const [merchants, setMerchants] = useState<VipRedMerchantWithStats[]>([]);
  const [allMonitoredLines, setAllMonitoredLines] = useState<VipRedLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // إنشاء تاجر جديد
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [appUsers, setAppUsers] = useState<{ id: string; email: string; name?: string }[]>([]);

  // ألوان التصميم المنسجمة مع الواجهة
  const bg = L ? '#f8fafc' : '#0a0a0f';
  const cardBg = L ? '#ffffff' : '#111318';
  const cardBdr = L ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
  const innerBg = L ? '#f1f5f9' : 'rgba(255, 255, 255, 0.04)';
  const textC = L ? '#0f172a' : '#f8fafc';
  const mutC = L ? '#64748b' : '#94a3b8';

  const loadData = async () => {
    try {
      const [merchData, linesData] = await Promise.all([
        getMerchantsWithStats(),
        getMonitoredLines(user?.id || '', true),
      ]);
      setMerchants(merchData);
      setAllMonitoredLines(linesData);
    } catch (err) {
      console.error('[VipRedMerchants] loadData error:', err);
      toast.error('حدث خطأ أثناء تحميل بيانات التجار');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getMerchantsWithStats(),
      getMonitoredLines(user?.id || '', true),
    ])
      .then(([merchData, linesData]) => {
        if (isMounted) {
          setMerchants(merchData);
          setAllMonitoredLines(linesData);
          setIsLoading(false);
          setIsRefreshing(false);
        }
      })
      .catch(err => {
        console.error('[VipRedMerchants] loadData error:', err);
        if (isMounted) {
          toast.error('حدث خطأ أثناء تحميل بيانات التجار');
          setIsLoading(false);
          setIsRefreshing(false);
        }
      });

    getRegisteredAppUsers()
      .then(users => {
        if (isMounted) setAppUsers(users);
      })
      .catch(console.warn);

    // تشغيل فحص تذكيرات مواعيد التفعيل الخلفية بهدوء
    if (user?.id) {
      runActivationRemindersCheck(user.id).catch(console.warn);
    }

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
  };

  // فلترة التجار بالاسم ورقم التواصل
  const filteredMerchants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return merchants;
    return merchants.filter(m => {
      const matchName = m.name?.toLowerCase().includes(q);
      const matchPhone = m.phone?.includes(q);
      return matchName || matchPhone;
    });
  }, [merchants, searchQuery]);

  // إحصائيات عامة لجميع خطوط النظام والتجار
  const totalStats = useMemo(() => {
    const totalLines = allMonitoredLines.length || merchants.reduce((acc, m) => acc + m.stats.totalLines, 0);
    const totalConverted = allMonitoredLines.filter(l => l.system_status === 'converted').length || merchants.reduce((acc, m) => acc + m.stats.convertedLines, 0);
    const totalMonitoring = allMonitoredLines.filter(l => l.system_status === 'monitoring').length || merchants.reduce((acc, m) => acc + m.stats.monitoringLines, 0);
    const unassignedLines = allMonitoredLines.filter(l => !l.merchant_id);
    return {
      totalLines,
      totalConverted,
      totalMonitoring,
      unassignedCount: unassignedLines.length,
      unassignedConverted: unassignedLines.filter(l => l.system_status === 'converted').length,
      unassignedMonitoring: unassignedLines.filter(l => l.system_status === 'monitoring').length,
    };
  }, [allMonitoredLines, merchants]);

  const handleCreateMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newName.trim()) {
      toast.error('يرجى إدخال اسم التاجر');
      return;
    }

    setIsCreating(true);
    try {
      const res = await createMerchant(
        {
          name: newName.trim(),
          phone: newPhone.trim() || undefined,
          user_id: newUserId || null,
          notes: newNotes.trim() || undefined,
        },
        user.id
      );

      if (!res.success || !res.merchant) {
        toast.error(res.error || 'تعذر إنشاء التاجر');
        return;
      }

      toast.success(`تم إنشاء التاجر "${res.merchant.name}" بنجاح!`);
      setShowCreateModal(false);
      setNewName('');
      setNewPhone('');
      setNewUserId('');
      setNewNotes('');
      await loadData();
    } catch {
      toast.error('حدث خطأ أثناء إنشاء التاجر');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="min-h-screen pb-32 font-sans transition-colors duration-200 select-none"
      style={{ background: bg, color: textC, direction: 'rtl' }}
    >
      {/* ── شريط الرأس الرئيسي ── */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md px-2 sm:px-3 py-1.5 transition-colors"
        style={{
          background: L ? 'rgba(255, 255, 255, 0.92)' : 'rgba(17, 19, 24, 0.92)',
          borderColor: cardBdr,
        }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate('/vip-red')}
              className="p-1.5 rounded-lg border flex items-center justify-center transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 shrink-0"
              style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              title="رجوع لمركز المراقبة"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                <h1 className="text-sm sm:text-base font-black truncate">
                  إدارة التجار — فودافون ريد VIP
                </h1>
              </div>
              <p className="text-[10px] sm:text-[11px] truncate" style={{ color: mutC }}>
                استعراض ومتابعة أرقام كل تاجر وتوزيع مواعيد التفعيل (7، 11، 25)
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
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 px-2.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="h-8 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 text-white shadow-sm transition-all active:scale-95"
              style={{ background: '#E60000' }}
            >
              <Plus className="w-4 h-4" />
              <span>تاجر جديد</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── المحتوى الرئيسي ── */}
      <main className="max-w-4xl mx-auto px-2 sm:px-3 py-2 sm:py-3 space-y-2 sm:space-y-2.5 pb-32">
        {/* شريط الإحصائيات العامة المدمج */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
          <div
            className="p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between shadow-xs"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between text-amber-500">
              <Crown className="w-4 h-4" />
              <span className="font-mono text-base font-black">{merchants.length}</span>
            </div>
            <span className="text-[11px] font-bold mt-1" style={{ color: mutC }}>
              إجمالي التجار
            </span>
          </div>

          <div
            className="p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between shadow-xs"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between text-blue-500">
              <Layers className="w-4 h-4" />
              <span className="font-mono text-base font-black">{totalStats.totalLines}</span>
            </div>
            <span className="text-[11px] font-bold mt-1" style={{ color: mutC }}>
              إجمالي الأرقام
            </span>
          </div>

          <div
            className="p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between shadow-xs"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between text-emerald-500">
              <Sparkles className="w-4 h-4" />
              <span className="font-mono text-base font-black">{totalStats.totalConverted}</span>
            </div>
            <span className="text-[11px] font-bold mt-1" style={{ color: mutC }}>
              تم التحويل لريد
            </span>
          </div>

          <div
            className="p-2 sm:p-2.5 rounded-xl border flex flex-col justify-between shadow-xs"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between text-amber-500">
              <Clock className="w-4 h-4" />
              <span className="font-mono text-base font-black">{totalStats.totalMonitoring}</span>
            </div>
            <span className="text-[11px] font-bold mt-1" style={{ color: mutC }}>
              تحت المراقبة
            </span>
          </div>
        </div>

        {/* ── شريط البحث ── */}
        <div
          className="p-2 sm:p-2.5 rounded-xl border flex items-center gap-2"
          style={{ background: cardBg, borderColor: cardBdr }}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: mutC }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم التاجر أو رقم التواصل..."
            className="w-full bg-transparent text-xs font-medium outline-none"
            style={{ color: textC }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs px-2 py-0.5 rounded border"
              style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
            >
              مسح
            </button>
          )}
        </div>

        {/* ── قائمة كروت التجار ── */}
        {isLoading ? (
          <div
            className="p-8 rounded-xl border text-center space-y-2"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#E60000]" />
            <p className="text-xs font-bold" style={{ color: mutC }}>
              جاري تحميل قائمة التجار وإحصائيات الخطوط...
            </p>
          </div>
        ) : filteredMerchants.length === 0 ? (
          <div
            className="p-8 rounded-xl border text-center space-y-3"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <Crown className="w-10 h-10 mx-auto text-muted-foreground/30" />
            <div className="space-y-1">
              <h3 className="text-sm font-black" style={{ color: textC }}>
                {searchQuery ? 'لا توجد نتائج مطابقة للبحث' : 'لم يتم تسجيل أي تاجر حتى الآن'}
              </h3>
              <p className="text-xs" style={{ color: mutC }}>
                {searchQuery
                  ? 'جرب البحث باسم آخر أو تأكد من صحة رقم الهاتف'
                  : 'ابدأ بإنشاء تاجر جديد لربط أرقام فودافون ريد به وتنظيم مواعيد التفعيل'}
              </p>
            </div>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="h-9 px-4 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 text-white shadow-sm"
                style={{ background: '#E60000' }}
              >
                <Plus className="w-4 h-4" />
                إنشاء أول تاجر
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {/* بطاقة الأرقام المستقلة المباشرة بالنظام */}
            {totalStats.unassignedCount > 0 && (
              <div
                className="p-3.5 sm:p-4 rounded-2xl border flex flex-col justify-between transition hover:shadow-md border-purple-500/30 bg-purple-500/[0.03]"
                style={{ borderColor: cardBdr }}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-black truncate" style={{ color: textC }}>
                            أرقام مستقلة (بدون تاجر)
                          </h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            مباشرة
                          </span>
                        </div>
                        <p className="text-[11px] truncate" style={{ color: mutC }}>
                          أرقام مسجلة بالنظام ومتابعة دون إسنادها لتاجر
                        </p>
                      </div>
                    </div>

                    <span className="font-mono text-sm font-black px-2 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
                      {totalStats.unassignedCount} خط
                    </span>
                  </div>

                  {/* إحصائيات الأرقام المستقلة */}
                  <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl text-center" style={{ background: innerBg }}>
                    <div>
                      <span className="text-[10px] block" style={{ color: mutC }}>الإجمالي</span>
                      <span className="font-mono text-xs font-black" style={{ color: textC }}>
                        {totalStats.unassignedCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] block text-emerald-600 dark:text-emerald-400 font-bold">تم التحويل</span>
                      <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {totalStats.unassignedConverted}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] block text-amber-600 dark:text-amber-400 font-bold">تحت المراقبة</span>
                      <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                        {totalStats.unassignedMonitoring}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 mt-2 border-t" style={{ borderColor: cardBdr }}>
                  <span className="text-[10px]" style={{ color: mutC }}>
                    متابعة فورية ومباشرة
                  </span>
                  <button
                    onClick={() => navigate('/vip-red')}
                    className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 shrink-0"
                  >
                    <span>عرض الأرقام بالمركز</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {filteredMerchants.map(m => {
              const isLinked = Boolean(m.user_id);
              const { stats } = m;

              return (
                <div
                  key={m.id}
                  onClick={() => navigate(`/vip-red/merchants/${m.id}`)}
                  className="p-2 sm:p-2.5 rounded-xl border cursor-pointer transition-all hover:shadow-md active:scale-[0.99] space-y-1.5 group"
                  style={{ background: cardBg, borderColor: cardBdr }}
                >
                  {/* الرأس: اسم التاجر وحالة الحساب */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                        <h2 className="text-sm font-black truncate group-hover:text-[#E60000] transition-colors">
                          {m.name}
                        </h2>
                      </div>
                      {m.phone && (
                        <div className="flex items-center gap-1 text-[11px] font-mono" style={{ color: mutC }} dir="ltr">
                          <Phone className="w-3 h-3 shrink-0" />
                          <span>{m.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* شارة حالة ربط الحساب */}
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0"
                      style={{
                        background: isLinked ? (L ? '#ecfdf5' : 'rgba(16, 185, 129, 0.12)') : innerBg,
                        borderColor: isLinked ? (L ? '#a7f3d0' : 'rgba(16, 185, 129, 0.3)') : cardBdr,
                        color: isLinked ? (L ? '#047857' : '#34d399') : mutC,
                      }}
                    >
                      {isLinked ? (
                        <>
                          <UserCheck className="w-3 h-3 text-emerald-500" />
                          <span>حساب مرتبط</span>
                        </>
                      ) : (
                        <>
                          <UserX className="w-3 h-3" />
                          <span>تاجر مستقل</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* إحصائيات الأرقام المدمجة */}
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="p-1.5 rounded-lg border" style={{ background: innerBg, borderColor: cardBdr }}>
                      <span className="block text-[10px]" style={{ color: mutC }}>الأرقام</span>
                      <span className="font-mono text-xs font-black">{stats.totalLines}</span>
                    </div>

                    <div className="p-1.5 rounded-lg border" style={{ background: innerBg, borderColor: cardBdr }}>
                      <span className="block text-[10px] text-emerald-500">تم التحويل</span>
                      <span className="font-mono text-xs font-black text-emerald-500">{stats.convertedLines}</span>
                    </div>

                    <div className="p-1.5 rounded-lg border" style={{ background: innerBg, borderColor: cardBdr }}>
                      <span className="block text-[10px] text-amber-500">المراقبة</span>
                      <span className="font-mono text-xs font-black text-amber-500">{stats.monitoringLines}</span>
                    </div>
                  </div>

                  {/* أقرب موعد تفعيل وزر التفاصيل */}
                  <div className="flex items-center justify-between pt-1 border-t text-[11px]" style={{ borderColor: cardBdr }}>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                      {stats.nextActivationDay ? (
                        <span className="font-bold text-purple-600 dark:text-purple-400">
                          أقرب تفعيل: يوم {stats.nextActivationDay}
                          {stats.daysUntilNextActivation !== null && (
                            <span className="text-[10px] font-normal mr-1 opacity-80">
                              (بعد {stats.daysUntilNextActivation} يوم)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: mutC }}>بدون موعد تفعيل محدد</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 font-bold text-[#E60000] text-xs">
                      <span>عرض الأرقام</span>
                      <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── مودال إنشاء تاجر جديد ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <form
            onSubmit={handleCreateMerchant}
            className="w-full max-w-md rounded-2xl border p-5 space-y-3.5 shadow-2xl"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  إنشاء تاجر جديد
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="font-bold block mb-1" style={{ color: textC }}>
                  اسم التاجر <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="مثال: سنتر الأمل أو أحمد فودافون"
                  className="w-full h-9 rounded-xl px-3 outline-none border text-xs"
                  style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                />
              </div>

              <div>
                <label className="font-bold block mb-1" style={{ color: textC }}>
                  رقم التواصل (اختياري)
                </label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="010xxxxxxxx"
                  className="w-full h-9 rounded-xl px-3 outline-none border text-xs font-mono"
                  style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="font-bold block mb-1" style={{ color: textC }}>
                  ربط بحساب مستخدم مسجل بالتطبيق (اختياري)
                </label>
                <select
                  value={newUserId}
                  onChange={e => setNewUserId(e.target.value)}
                  className="w-full h-9 rounded-xl px-2 outline-none border text-xs truncate"
                  style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                >
                  <option value="">تاجر مستقل بدون حساب تسجيل دخول</option>
                  {appUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name ? `${u.name} (${u.email})` : u.email}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] mt-1" style={{ color: mutC }}>
                  إذا اخترت مستخدماً، فسيتمكن من الدخول واستعراض أرقامه فقط دون رؤية تجار آخرين.
                </p>
              </div>

              <div>
                <label className="font-bold block mb-1" style={{ color: textC }}>
                  ملاحظات (اختياري)
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="أي ملاحظات أو بيانات إضافية"
                  className="w-full h-9 rounded-xl px-3 outline-none border text-xs"
                  style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: cardBdr }}>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="h-9 px-3.5 rounded-xl border font-bold text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isCreating || !newName.trim()}
                className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 text-white disabled:opacity-50 shadow-sm"
                style={{ background: '#E60000' }}
              >
                <Plus className="w-3.5 h-3.5" />
                {isCreating ? 'جاري الإنشاء...' : 'إنشاء وحفظ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
