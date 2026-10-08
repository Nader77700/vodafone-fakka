import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown,
  User,
  Phone,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  KeyRound,
  FileText,
  Layers,
  Sparkles,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Lock,
  Printer,
  Download,
  ChevronDown,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import type {
  VipRedLine,
  VipRedProfile,
  VipRedActivationDay,
  VipRedPackageTier,
} from '@/types/vipRed';
import {
  VIP_RED_PACKAGES,
  VALID_ACTIVATION_DAYS,
  classifyLineSystem,
} from '@/types/vipRed';
import {
  searchServerLinesToClaim,
  submitLineClaim,
  submitAnaVodafonePassword,
  checkSingleMonitoredLine,
  calculateCycleInvoice,
} from '@/lib/vipRedService';

interface VipRedUserPortalProps {
  user: { id: string; email?: string };
  profile: VipRedProfile;
  onRefreshProfile?: () => void;
}

export default function VipRedUserPortal({
  user,
  profile,
}: VipRedUserPortalProps) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const L = theme === 'light';

  // Thème compact
  const pageBg = L ? '#f8fafc' : '#090a0f';
  const cardBg = L ? '#ffffff' : '#11131a';
  const cardBdr = L ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
  const innerBg = L ? '#f1f5f9' : 'rgba(255, 255, 255, 0.04)';
  const textC = L ? '#0f172a' : '#f8fafc';
  const mutC = L ? '#64748b' : '#94a3b8';

  // Navigation tab
  const [activeMainTab, setActiveMainTab] = useState<'lines' | 'search' | 'invoice'>('lines');

  // Lines State
  const [lines, setLines] = useState<VipRedLine[]>([]);
  const [isLoadingLines, setIsLoadingLines] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters for Lines Tab
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | 'all'>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [searchInLines, setSearchInLines] = useState('');

  // Line Check state
  const [checkingLineId, setCheckingLineId] = useState<string | null>(null);

  // Ana Vodafone Password modal/input
  const [passwordInputOpenForLine, setPasswordInputOpenForLine] = useState<string | null>(null);
  const [newAnaPassword, setNewAnaPassword] = useState('');
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  // Search server numbers to claim
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<VipRedLine & { canClaim: boolean; claimMessage: string }>>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [claimingLineId, setClaimingLineId] = useState<string | null>(null);

  // Invoice cycle tab
  const [invoiceCycle, setInvoiceCycle] = useState<VipRedActivationDay | 'all'>('all');

  // Load user's approved/claimed lines
  const loadUserLines = useCallback(async () => {
    const safetyTimer = setTimeout(() => {
      setIsLoadingLines(false);
      setIsRefreshing(false);
    }, 1800);

    try {
      // جلب الخطوط المعتمدة لحساب هذا المستخدم أو التاجر المرتبط به
      const { data, error } = await supabase
        .from('vip_red_monitored_lines')
        .select('*, merchant:vip_red_merchants(*)')
        .or(`claimed_by_user_id.eq.${user.id},user_id.eq.${user.id}`)
        .order('activation_day', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error fetching user lines:', error);
      } else {
        setLines((data || []) as VipRedLine[]);
      }
    } catch (err) {
      console.warn(err);
    } finally {
      clearTimeout(safetyTimer);
      setIsLoadingLines(false);
      setIsRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadUserLines();
  }, [loadUserLines]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadUserLines();
    toast.success('تم تحديث بيانات خطوطك بنجاح');
  };

  // Perform manual check on a line
  const handleCheckLine = async (line: VipRedLine) => {
    setCheckingLineId(line.id);
    try {
      const res = await checkSingleMonitoredLine(line, user.id);
      if (res.success && res.line) {
        setLines(prev => prev.map(l => (l.id === line.id ? res.line! : l)));
        const cls = classifyLineSystem(res.line.current_system);
        if (cls.status === 'converted') {
          toast.success(`🎉 تهانينا! تحول الرقم ${line.phone_number} لنظام ريد بنجاح!`);
        } else {
          toast.info(`النظام الحالي: ${res.line.current_system || 'غير معروف'} (${cls.label})`);
        }
      } else {
        toast.error(res.error || 'تعذر فحص الرقم حالياً');
      }
    } catch {
      toast.error('حدث خطأ أثناء فحص الرقم');
    } finally {
      setCheckingLineId(null);
    }
  };

  // Submit Ana Vodafone Password
  const handleSubmitPassword = async (lineId: string) => {
    if (!newAnaPassword.trim()) {
      toast.error('يرجى إدخال كلمة سر أنا فودافون الجديدة أولاً');
      return;
    }
    setIsSubmittingPassword(true);
    try {
      const res = await submitAnaVodafonePassword(lineId, newAnaPassword, profile.full_name);
      if (res.success) {
        toast.success('تم إرسال كلمة سر أنا فودافون الجديدة للمالك بنجاح!');
        setLines(prev =>
          prev.map(l =>
            l.id === lineId
              ? {
                  ...l,
                  ana_vodafone_password: newAnaPassword,
                  ana_vodafone_password_updated_at: new Date().toISOString(),
                }
              : l
          )
        );
        setPasswordInputOpenForLine(null);
        setNewAnaPassword('');
      } else {
        toast.error(res.error || 'تعذر إرسال كلمة السر');
      }
    } catch {
      toast.error('حدث خطأ أثناء حفظ كلمة السر');
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  // Search Server Lines
  const handleSearchServer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      toast.error('يرجى كتابة رقم الهاتف للبحث');
      return;
    }
    setIsSearchingServer(true);
    setHasSearched(true);
    try {
      const res = await searchServerLinesToClaim(searchQuery, user.id);
      if (res.success) {
        setSearchResults(res.lines);
      } else {
        toast.error(res.error || 'تعذر البحث عن الأرقام');
      }
    } catch {
      toast.error('حدث خطأ أثناء البحث');
    } finally {
      setIsSearchingServer(false);
    }
  };

  // Submit Claim for a line
  const handleClaimLine = async (line: VipRedLine) => {
    setClaimingLineId(line.id);
    try {
      const res = await submitLineClaim(line.id, user.id, profile);
      if (res.success) {
        toast.success(`تم إرسال طلب اعتماد الرقم ${line.phone_number} للمالك بنجاح! سيتم إشعارك فور المراجعة.`);
        // Update local search results
        setSearchResults(prev =>
          prev.map(item =>
            item.id === line.id
              ? {
                  ...item,
                  claimed_by_user_id: user.id,
                  claim_status: 'pending',
                  canClaim: false,
                  claimMessage: 'طلبك قيد المراجعة لدى المالك',
                }
              : item
          )
        );
        // Refresh approved lines
        await loadUserLines();
      } else {
        toast.error(res.error || 'تعذر تقديم طلب الإضافة');
      }
    } catch {
      toast.error('حدث خطأ أثناء إرسال الطلب');
    } finally {
      setClaimingLineId(null);
    }
  };

  // Filtered Lines
  const filteredLines = useMemo(() => {
    return lines.filter(l => {
      // Day filter
      if (selectedDayFilter !== 'all' && l.activation_day !== selectedDayFilter) {
        return false;
      }
      // Status filter
      if (selectedStatusFilter !== 'all') {
        const cls = classifyLineSystem(l.current_system);
        if (cls.status !== selectedStatusFilter) return false;
      }
      // Search
      if (searchInLines.trim()) {
        const q = searchInLines.trim();
        const matchesPhone = l.phone_number.includes(q);
        const matchesName = l.customer_name?.toLowerCase().includes(q.toLowerCase());
        if (!matchesPhone && !matchesName) return false;
      }
      return true;
    });
  }, [lines, selectedDayFilter, selectedStatusFilter, searchInLines]);

  // Invoice calculations
  const invoiceData = useMemo(() => {
    return calculateCycleInvoice(lines, invoiceCycle);
  }, [lines, invoiceCycle]);

  const convertedCount = lines.filter(l => l.system_status === 'converted').length;
  const monitoringCount = lines.filter(l => l.system_status === 'monitoring').length;

  return (
    <div className="space-y-2 sm:space-y-2.5 pb-24" dir="rtl">
      {/* ── بطاقة الملف التعريفي العلوية المدمجة ── */}
      <div
        className="p-2.5 sm:p-3 rounded-xl border shadow-xs"
        style={{ background: cardBg, borderColor: cardBdr }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                profile.role_type === 'merchant'
                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                  : 'bg-rose-500/15 text-[#E60000] border border-rose-500/30'
              }`}
            >
              {profile.role_type === 'merchant' ? (
                <Crown className="w-6 h-6" />
              ) : (
                <User className="w-6 h-6" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black truncate" style={{ color: textC }}>
                  {profile.full_name}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    profile.role_type === 'merchant'
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                  }`}
                >
                  {profile.role_type === 'merchant' ? '👑 تاجر VIP' : '👤 مستخدم VIP'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: mutC }}>
                <span className="flex items-center gap-1 font-mono text-[11px]" dir="ltr">
                  <Phone className="w-3 h-3 text-emerald-500" />
                  {profile.whatsapp_phone}
                </span>
                <span>•</span>
                <span>الأرقام المعتمدة: {lines.length}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── التبويبات الرئيسية الثلاثة (أرقامي، بحث واعتماد، الفاتورة) ── */}
      <div className="grid grid-cols-3 gap-1 p-0.5 rounded-xl border shadow-xs" style={{ background: cardBg, borderColor: cardBdr }}>
        <button
          onClick={() => setActiveMainTab('lines')}
          className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 ${
            activeMainTab === 'lines'
              ? 'bg-[#E60000] text-white shadow-xs'
              : 'hover:bg-black/5 dark:hover:bg-white/5'
          }`}
          style={{ color: activeMainTab === 'lines' ? '#ffffff' : textC }}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>أرقامي ({lines.length})</span>
        </button>

        <button
          onClick={() => setActiveMainTab('search')}
          className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 ${
            activeMainTab === 'search'
              ? 'bg-[#E60000] text-white shadow-xs'
              : 'hover:bg-black/5 dark:hover:bg-white/5'
          }`}
          style={{ color: activeMainTab === 'search' ? '#ffffff' : textC }}
        >
          <Search className="w-3.5 h-3.5" />
          <span>بحث وطلب أرقام</span>
        </button>

        <button
          onClick={() => setActiveMainTab('invoice')}
          className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 ${
            activeMainTab === 'invoice'
              ? 'bg-[#E60000] text-white shadow-xs'
              : 'hover:bg-black/5 dark:hover:bg-white/5'
          }`}
          style={{ color: activeMainTab === 'invoice' ? '#ffffff' : textC }}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>الفاتورة التفصيلية</span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── التبويب الأول: أرقامي المعتمدة ── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'lines' && (
        <div className="space-y-3">
          {/* شريط الإحصائيات السريع والتنبيهات */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div
              className="p-2.5 rounded-xl border flex items-center justify-between"
              style={{ background: cardBg, borderColor: cardBdr }}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <div>
                  <p className="text-[10px]" style={{ color: mutC }}>قيد المراقبة (14 قرش)</p>
                  <p className="text-sm font-black text-blue-500">{monitoringCount}</p>
                </div>
              </div>
            </div>

            <div
              className="p-2.5 rounded-xl border flex items-center justify-between"
              style={{ background: cardBg, borderColor: cardBdr }}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <div>
                  <p className="text-[10px]" style={{ color: mutC }}>تم التحويل لريد</p>
                  <p className="text-sm font-black text-emerald-500">{convertedCount}</p>
                </div>
              </div>
            </div>

            <div
              className="col-span-2 sm:col-span-1 p-2.5 rounded-xl border flex items-center justify-between cursor-pointer hover:border-emerald-500/40 transition"
              onClick={() => setActiveMainTab('invoice')}
              style={{ background: cardBg, borderColor: cardBdr }}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <div>
                  <p className="text-[10px]" style={{ color: mutC }}>إجمالي الفاتورة</p>
                  <p className="text-sm font-black text-amber-600 dark:text-amber-400">
                    {invoiceData.totalAmount.toLocaleString()} ج.م
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* فلاتر مواعيد التفعيل (7، 11، 25) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-[11px] font-bold shrink-0" style={{ color: mutC }}>
                موعد التفعيل:
              </span>
              <button
                onClick={() => setSelectedDayFilter('all')}
                className={`h-7 px-2.5 rounded-lg border text-xs font-bold transition-all ${
                  selectedDayFilter === 'all'
                    ? 'bg-[#E60000] text-white border-transparent'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                style={{
                  background: selectedDayFilter === 'all' ? '#E60000' : innerBg,
                  borderColor: selectedDayFilter === 'all' ? 'transparent' : cardBdr,
                  color: selectedDayFilter === 'all' ? '#ffffff' : textC,
                }}
              >
                الكل ({lines.length})
              </button>
              {VALID_ACTIVATION_DAYS.map(day => {
                const count = lines.filter(l => l.activation_day === day).length;
                const isSelected = selectedDayFilter === day;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDayFilter(day)}
                    className={`h-7 px-2.5 rounded-lg border text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-purple-600 text-white border-transparent'
                        : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                    style={{
                      background: isSelected ? '#7e22ce' : innerBg,
                      borderColor: isSelected ? 'transparent' : cardBdr,
                      color: isSelected ? '#ffffff' : textC,
                    }}
                  >
                    يوم {day} ({count})
                  </button>
                );
              })}
            </div>

            {/* مربع البحث السريع في أرقامي */}
            <div className="relative w-full sm:w-48">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="بحث برقم أو اسم..."
                value={searchInLines}
                onChange={e => setSearchInLines(e.target.value)}
                className="w-full h-8 pr-8 pl-2.5 rounded-xl border text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#E60000]"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              />
            </div>
          </div>

          {/* قائمة كروت الخطوط */}
          {isLoadingLines ? (
            <div className="p-8 rounded-2xl border text-center space-y-2" style={{ background: cardBg, borderColor: cardBdr }}>
              <RefreshCw className="w-6 h-6 animate-spin text-[#E60000] mx-auto" />
              <p className="text-xs font-bold" style={{ color: mutC }}>جاري تحميل أرقامك المعتمدة...</p>
            </div>
          ) : filteredLines.length === 0 ? (
            <div className="p-8 rounded-2xl border text-center space-y-3" style={{ background: cardBg, borderColor: cardBdr }}>
              <Layers className="w-10 h-10 text-muted-foreground/30 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  لا توجد أرقام معتمدة في هذا التبويب
                </h3>
                <p className="text-xs max-w-sm mx-auto" style={{ color: mutC }}>
                  {lines.length === 0
                    ? 'حسابك جديد ولا يحتوي على أرقام معتمدة حالياً. يمكنك استخدام زر "بحث وطلب أرقام" للبحث عن أرقامك على السيرفر وطلب اعتمادها من المالك.'
                    : 'لا توجد أرقام مطابقة للتصفية الحالية.'}
                </p>
              </div>
              {lines.length === 0 && (
                <button
                  onClick={() => setActiveMainTab('search')}
                  className="px-4 py-2 bg-[#E60000] text-white rounded-xl text-xs font-black shadow-sm transition active:scale-95 inline-flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>البحث عن أرقامي وطلب اعتمادها الآن</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredLines.map(line => {
                const cls = classifyLineSystem(line.current_system);
                const isChecking = checkingLineId === line.id;
                const hasConverted = cls.status === 'converted';
                const pkg = VIP_RED_PACKAGES[line.package_tier || '100gb'] || VIP_RED_PACKAGES['100gb'];
                const isInputOpen = passwordInputOpenForLine === line.id;

                return (
                  <div
                    key={line.id}
                    className="p-2 sm:p-2.5 rounded-xl border space-y-1.5 transition-all shadow-xs"
                    style={{
                      background: cardBg,
                      borderColor: hasConverted ? 'rgba(16, 185, 129, 0.45)' : cardBdr,
                    }}
                  >
                    {/* رأس الكارت: رقم الهاتف، اسم العميل، الشارات */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-black tracking-wider" dir="ltr" style={{ color: textC }}>
                            {line.phone_number}
                          </span>
                          {line.customer_name && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-muted text-foreground">
                              👤 {line.customer_name}
                            </span>
                          )}
                          {line.activation_day && (
                            <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                              يوم {line.activation_day}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: mutC }}>
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                            style={{
                              background: cls.badgeBg,
                              color: cls.badgeText,
                              borderColor: cls.badgeBorder,
                            }}
                          >
                            {cls.label}
                          </span>

                          <span className="text-[11px] font-medium">
                            الباقة: <strong className="text-foreground">{pkg.shortName}</strong> ({pkg.price} ج.م)
                          </span>

                          {line.payment_status && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                line.payment_status === 'paid'
                                  ? 'bg-emerald-500/15 text-emerald-600'
                                  : 'bg-amber-500/15 text-amber-600'
                              }`}
                            >
                              {line.payment_status === 'paid' ? '✅ مسدد' : '⏳ بانتظار السداد'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* زر الفحص اليدوي فقط للمستخدم */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => handleCheckLine(line)}
                          disabled={isChecking}
                          className="h-8 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                          style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                          title="فحص حالة الخط يدوياً الآن"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isChecking ? 'animate-spin' : ''}`} />
                          <span>{isChecking ? 'جاري الفحص...' : 'فحص يدوي'}</span>
                        </button>
                      </div>
                    </div>

                    {/* ── شريط تحويل الخط إلى ريد وطلب كلمة سر أنا فودافون ── */}
                    {hasConverted && (
                      <div
                        className="p-2.5 rounded-xl border space-y-2"
                        style={{
                          background: L ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.14)',
                          borderColor: L ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.45)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 truncate">
                              🎉 تم التحويل بنجاح لنظام ريد (Enterprise member control)
                            </span>
                          </div>

                          <button
                            onClick={() => setPasswordInputOpenForLine(isInputOpen ? null : line.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white transition shrink-0 flex items-center gap-1"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>
                              {line.ana_vodafone_password
                                ? 'تعديل كلمة سر أنا فودافون'
                                : 'إرسال كلمة سر أنا فودافون الجديدة'}
                            </span>
                          </button>
                        </div>

                        {line.ana_vodafone_password && !isInputOpen && (
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1 font-medium">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>
                              تم إرسال كلمة السر الجديدة للإدارة بنجاح
                              {line.ana_vodafone_password_updated_at &&
                                ` (${new Date(line.ana_vodafone_password_updated_at).toLocaleDateString('ar-EG')})`}
                            </span>
                          </div>
                        )}

                        {/* فورم إدخال الباسورد الجديد */}
                        {isInputOpen && (
                          <div className="pt-2 border-t border-emerald-500/20 space-y-2">
                            <p className="text-[11px] font-bold text-foreground">
                              يلزم عمل باسورد جديد لتطبيق أنا فودافون وإرساله للمالك لإتمام التفعيل وإدارة الخط:
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="اكتب كلمة سر أنا فودافون الجديدة هنا..."
                                value={newAnaPassword}
                                onChange={e => setNewAnaPassword(e.target.value)}
                                className="flex-1 h-8 px-3 rounded-lg border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                style={{ background: cardBg, borderColor: cardBdr, color: textC }}
                              />
                              <button
                                onClick={() => handleSubmitPassword(line.id)}
                                disabled={isSubmittingPassword}
                                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-1 disabled:opacity-50"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>{isSubmittingPassword ? 'جاري الإرسال...' : 'إرسال للمالك'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── التبويب الثاني: البحث عن أرقام على السيرفر وطلب اعتمادها ── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'search' && (
        <div className="space-y-3 sm:space-y-4">
          <div
            className="p-3.5 sm:p-4 rounded-2xl border space-y-3 shadow-xs"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-black flex items-center gap-1.5" style={{ color: textC }}>
                <Search className="w-4 h-4 text-[#E60000]" />
                البحث عن أرقامك على السيرفر وطلب إضافتها واعتمادها
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: mutC }}>
                اكتب رقم الهاتف كاملاً أو جزءاً منه للبحث في قاعدة بيانات السيرفر، ثم اضغط على زر
                «طلب إضافة إلى حسابي». سيتم إرسال الطلب فوراً إلى إدارة القسم للمراجعة والاعتماد.
              </p>
            </div>

            <form onSubmit={handleSearchServer} className="flex gap-2">
              <div className="flex-1 relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: mutC }} />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="أدخل رقم فودافون (مثال: 01012345678)"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-10 pr-9 pl-3 rounded-xl border text-xs sm:text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[#E60000]"
                  style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                />
              </div>

              <button
                type="submit"
                disabled={isSearchingServer}
                className="h-10 px-4 rounded-xl font-black text-xs text-white shadow-xs transition-all active:scale-95 flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                style={{ background: '#E60000' }}
              >
                <Search className={`w-3.5 h-3.5 ${isSearchingServer ? 'animate-spin' : ''}`} />
                <span>{isSearchingServer ? 'جاري البحث...' : 'بحث'}</span>
              </button>
            </form>
          </div>

          {/* نتائج البحث */}
          {hasSearched && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold" style={{ color: textC }}>
                  نتائج البحث ({searchResults.length})
                </span>
                <span className="text-[11px]" style={{ color: mutC }}>
                  قاعدة بيانات أرقام السيرفر
                </span>
              </div>

              {searchResults.length === 0 ? (
                <div
                  className="p-8 rounded-2xl border text-center space-y-2"
                  style={{ background: cardBg, borderColor: cardBdr }}
                >
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                  <h4 className="text-xs sm:text-sm font-black" style={{ color: textC }}>
                    لم يتم العثور على أرقام مطابقة على السيرفر
                  </h4>
                  <p className="text-xs" style={{ color: mutC }}>
                    تأكد من كتابة الرقم بشكل صحيح، أو تواصل مع إدارة القسم لإضافة أرقامك إلى السيرفر.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map(result => {
                    const cls = classifyLineSystem(result.current_system);
                    const isClaiming = claimingLineId === result.id;

                    return (
                      <div
                        key={result.id}
                        className="p-3 sm:p-3.5 rounded-xl border space-y-2 transition-all shadow-xs"
                        style={{ background: cardBg, borderColor: cardBdr }}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm sm:text-base font-black tracking-wider" dir="ltr" style={{ color: textC }}>
                                {result.phone_number}
                              </span>
                              {result.activation_day && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-500">
                                  تفعيل يوم {result.activation_day}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                                style={{
                                  background: cls.badgeBg,
                                  color: cls.badgeText,
                                  borderColor: cls.badgeBorder,
                                }}
                              >
                                {cls.label}
                              </span>

                              <span className="text-[11px]" style={{ color: mutC }}>
                                {result.claimMessage}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0 self-end sm:self-center">
                            {result.canClaim ? (
                              <button
                                onClick={() => handleClaimLine(result)}
                                disabled={isClaiming}
                                className="h-8 px-3 rounded-xl bg-[#E60000] hover:bg-[#c50000] text-white text-xs font-black shadow-xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>{isClaiming ? 'جاري إرسال الطلب...' : 'طلب إضافة إلى حسابي'}</span>
                              </button>
                            ) : result.claim_status === 'pending' && result.claimed_by_user_id === user.id ? (
                              <span className="h-8 px-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>طلبك قيد مراجعة المالك</span>
                              </span>
                            ) : result.claim_status === 'approved' && result.claimed_by_user_id === user.id ? (
                              <span className="h-8 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>معتمد في حسابك</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── التبويب الثالث: الفاتورة التفصيلية والتجديد ── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'invoice' && (
        <div className="space-y-3 sm:space-y-4">
          {/* كروت تسعيرة باقات ريد الرسمية الثلاثة */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-black flex items-center gap-1" style={{ color: textC }}>
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              تسعيرة باقات فودافون ريد بيزنس المعتمدة
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div
                className="p-3 rounded-xl border space-y-1 transition-all"
                style={{ background: cardBg, borderColor: cardBdr }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#E60000]">باقة 100 جيجا</span>
                  <span className="text-sm font-black font-mono text-emerald-600">450 ج.م</span>
                </div>
                <p className="text-[10px]" style={{ color: mutC }}>
                  100 جيجابايت + 6,000 دقيقة لجميع الشبكات
                </p>
              </div>

              <div
                className="p-3 rounded-xl border space-y-1 transition-all"
                style={{ background: cardBg, borderColor: cardBdr }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-500">باقة 150 جيجا</span>
                  <span className="text-sm font-black font-mono text-emerald-600">550 ج.م</span>
                </div>
                <p className="text-[10px]" style={{ color: mutC }}>
                  150 جيجابايت + 8,500 دقيقة لجميع الشبكات
                </p>
              </div>

              <div
                className="p-3 rounded-xl border space-y-1 transition-all"
                style={{ background: cardBg, borderColor: cardBdr }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-purple-500">باقة 200 جيجا</span>
                  <span className="text-sm font-black font-mono text-emerald-600">700 ج.م</span>
                </div>
                <p className="text-[10px]" style={{ color: mutC }}>
                  200 جيجابايت + 10,200 دقيقة لجميع الشبكات
                </p>
              </div>
            </div>
          </div>

          {/* تبويبات دورة التجديد (يوم 7، يوم 11، يوم 25، الكل) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setInvoiceCycle('all')}
                className={`h-7 px-3 rounded-lg border text-xs font-bold transition-all ${
                  invoiceCycle === 'all'
                    ? 'bg-[#E60000] text-white border-transparent'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                style={{
                  background: invoiceCycle === 'all' ? '#E60000' : innerBg,
                  borderColor: invoiceCycle === 'all' ? 'transparent' : cardBdr,
                  color: invoiceCycle === 'all' ? '#ffffff' : textC,
                }}
              >
                إجمالي الفاتورة الشهرية
              </button>
              {VALID_ACTIVATION_DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => setInvoiceCycle(day)}
                  className={`h-7 px-2.5 rounded-lg border text-xs font-bold transition-all ${
                    invoiceCycle === day
                      ? 'bg-purple-600 text-white border-transparent'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                  style={{
                    background: invoiceCycle === day ? '#7e22ce' : innerBg,
                    borderColor: invoiceCycle === day ? 'transparent' : cardBdr,
                    color: invoiceCycle === day ? '#ffffff' : textC,
                  }}
                >
                  تجديد يوم {day}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => {
                  try {
                    const cycleTitle = invoiceCycle === 'all' ? 'جميع مواعيد التجديد' : `تجديد يوم ${invoiceCycle}`;
                    const nowStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
                    const rowsHtml = invoiceData.lines.map((line, idx) => {
                      const isPaid = line.paymentStatus === 'paid';
                      return `
                        <tr style="border-bottom: 1px solid #e2e8f0; text-align: right;">
                          <td style="padding: 10px; font-weight: bold; text-align: center;">${idx + 1}</td>
                          <td style="padding: 10px; font-family: monospace; font-size: 14px; font-weight: bold; direction: ltr; text-align: left;">${line.phoneNumber}</td>
                          <td style="padding: 10px;">${line.customerName || '—'}</td>
                          <td style="padding: 10px; font-weight: bold;">${line.packagePrice || 450} ج.م</td>
                          <td style="padding: 10px; text-align: center;">
                            <span style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; background: ${isPaid ? '#dcfce7' : '#fee2e2'}; color: ${isPaid ? '#15803d' : '#b91c1c'};">
                              ${isPaid ? 'تم السداد ✓' : 'غير مسدد ✕'}
                            </span>
                          </td>
                        </tr>
                      `;
                    }).join('');

                    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فاتورة فودافون ريد - ${cycleTitle}</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;padding:20px;color:#0f172a}.card{max-width:850px;margin:auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden}.header{background:#E60000;color:#fff;padding:20px;display:flex;justify-content:space-between;align-items:center}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px;background:#f8fafc;border-bottom:1px solid #e2e8f0}.box{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center}.val{font-size:18px;font-weight:bold;font-family:monospace}table{width:100%;border-collapse:collapse}th{background:#f1f5f9;padding:10px;font-size:12px;text-align:right}@media print{body{padding:0}.no-p{display:none!important}}</style></head><body><div class="no-p" style="max-width:850px;margin:0 auto 12px auto;"><button onclick="window.print()" style="padding:8px 16px;background:#E60000;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">🖨️ حفظ كملف PDF / طباعة</button></div><div class="card"><div class="header"><div><h2 style="margin:0;">👑 فودافون ريد VIP</h2><p style="margin:4px 0 0;font-size:13px;">فاتورة ${cycleTitle} (${invoiceData.totalLines} خط)</p></div><div>${nowStr}</div></div><div class="stats"><div class="box"><div>الإجمالي</div><div class="val">${invoiceData.totalAmount.toLocaleString()} ج.م</div></div><div class="box" style="background:#f0fdf4;"><div>تم تحصيله</div><div class="val" style="color:#16a34a;">${invoiceData.paidAmount.toLocaleString()} ج.م</div></div><div class="box" style="background:#fef2f2;"><div>متبقي</div><div class="val" style="color:#dc2626;">${invoiceData.unpaidAmount.toLocaleString()} ج.م</div></div></div><div style="padding:16px;"><table border="0"><thead><tr><th style="text-align:center;">#</th><th>رقم الهاتف</th><th>الاسم</th><th>التجديد</th><th>الباقة</th><th style="text-align:center;">السداد</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div></body></html>`;

                    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `فاتورة_ريد_${invoiceCycle === 'all' ? 'الكل' : 'يوم_' + invoiceCycle}_${new Date().toISOString().slice(0, 10)}.html`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success('تم تنزيل ملف الفاتورة بنجاح!');
                  } catch (e) {
                    toast.error('تعذر تنزيل الفاتورة');
                  }
                }}
                className="h-7 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 shrink-0 transition active:scale-95 bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                title="تنزيل ملف الفاتورة للحفظ بدون طابعة"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تنزيل الفاتورة</span>
              </button>

              <button
                onClick={() => window.print()}
                className="h-7 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 shrink-0 transition active:scale-95"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                title="طباعة الفاتورة أو حفظها كـ PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">طباعة / PDF</span>
              </button>
            </div>
          </div>

          {/* بطاقة ملخص الفاتورة */}
          <div
            className="p-4 rounded-2xl border space-y-3 shadow-xs"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: cardBdr }}>
              <div>
                <h4 className="text-sm font-black" style={{ color: textC }}>
                  فاتورة {invoiceCycle === 'all' ? 'جميع مواعيد التجديد' : `تجديد يوم ${invoiceCycle}`}
                </h4>
                <p className="text-[11px]" style={{ color: mutC }}>
                  عدد الخطوط المدرجة: {invoiceData.totalLines} خط
                </p>
              </div>

              <div className="text-left">
                <span className="text-[11px] block" style={{ color: mutC }}>المبلغ الإجمالي</span>
                <span className="text-lg font-black text-emerald-600 font-mono">
                  {invoiceData.totalAmount.toLocaleString()} ج.م
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">المسدد بالفعل:</span>
                <span className="font-mono font-black text-emerald-600">
                  {invoiceData.paidAmount.toLocaleString()} ج.م
                </span>
              </div>
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                <span className="text-amber-700 dark:text-amber-400 font-bold">بانتظار السداد:</span>
                <span className="font-mono font-black text-amber-600">
                  {invoiceData.unpaidAmount.toLocaleString()} ج.م
                </span>
              </div>
            </div>

            {/* جدول تفاصيل الأرقام والباقات في الفاتورة */}
            {invoiceData.lines.length === 0 ? (
              <p className="text-xs text-center py-4 text-muted-foreground">
                لا توجد أرقام مسجلة في هذه الدورة
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: cardBdr }}>
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="border-b bg-muted/40 font-bold" style={{ borderColor: cardBdr }}>
                      <th className="p-2">رقم الهاتف</th>
                      <th className="p-2">الاسم</th>
                      <th className="p-2">الباقة</th>
                      <th className="p-2">القيمة</th>
                      <th className="p-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: cardBdr }}>
                    {invoiceData.lines.map(item => {
                      const pkgDef = VIP_RED_PACKAGES[item.packageTier] || VIP_RED_PACKAGES['100gb'];
                      return (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="p-2 font-mono font-bold" dir="ltr">
                            {item.phoneNumber}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {item.customerName || '—'}
                          </td>
                          <td className="p-2 font-medium">
                            {pkgDef.shortName}
                          </td>
                          <td className="p-2 font-mono font-bold text-emerald-600">
                            {item.packagePrice} ج.م
                          </td>
                          <td className="p-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                item.paymentStatus === 'paid'
                                  ? 'bg-emerald-500/15 text-emerald-600'
                                  : 'bg-amber-500/15 text-amber-600'
                              }`}
                            >
                              {item.paymentStatus === 'paid' ? 'مسدد' : 'غير مسدد'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
