import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown,
  Phone,
  RotateCcw,
  Plus,
  Layers,
  Copy,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Bell,
  Sparkles,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useIsLight } from '@/contexts/ThemeContext';
import {
  getVipRedConfig,
  canUserAccessVipRed,
  getMonitoredLines,
  addMonitoredLines,
  extractPhoneNumbers,
  deleteMonitoredLine,
  checkSingleMonitoredLine,
  batchCheckMonitoredLines,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from '@/lib/vipRedService';
import { classifyLineSystem, type VipRedLine, type VipRedConfig } from '@/types/vipRed';
import VipRedLineDetailsModal from '@/components/line-info/VipRedLineDetailsModal';

export default function VipRedCenterPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const L = useIsLight();

  const [config, setConfig] = useState<VipRedConfig | null>(null);
  const [lines, setLines] = useState<VipRedLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'monitoring' | 'converted' | 'ineligible'>('monitoring');

  // Input states
  const [singlePhone, setSinglePhone] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Bulk modal state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  // Line checking states
  const [checkingLineId, setCheckingLineId] = useState<string | null>(null);
  const [isBatchChecking, setIsBatchChecking] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; phone: string } | null>(null);

  // Details modal
  const [selectedLineForDetails, setSelectedLineForDetails] = useState<VipRedLine | null>(null);

  // Browser notification permission state
  const [hasNotifPermission, setHasNotifPermission] = useState<boolean>(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  // Permission check
  const hasAccess = useMemo(() => {
    return canUserAccessVipRed(user, profile, config);
  }, [user, profile, config]);

  // Load initial data
  const loadData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    try {
      const cfg = await getVipRedConfig();
      setConfig(cfg);
      const data = await getMonitoredLines(user.id);
      setLines(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذر تحميل بيانات خطوط ريد VIP';
      console.error('Error loading VIP Red data:', err);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Request browser notification
  const handleEnableNotifications = async () => {
    const granted = await requestBrowserNotificationPermission();
    setHasNotifPermission(granted);
    if (granted) {
      toast.success('تم تفعيل إشعارات المتصفح بنجاح! سيصلك تنبيه فوري لحظة تحويل أي رقم.');
    } else {
      toast.error('تم رفض إذن الإشعارات من المتصفح');
    }
  };

  // Add single phone
  const handleAddSingle = async () => {
    if (!user) return;
    const cleanPhone = singlePhone.trim().replace(/\D/g, '');
    if (!cleanPhone || !/^01[0125]\d{8}$/.test(cleanPhone)) {
      toast.error('يرجى إدخال رقم فودافون صحيح مكون من 11 رقماً (01xxxxxxxxx)');
      return;
    }

    setIsAdding(true);
    try {
      toast.loading(`جاري تسجيل وفحص الرقم ${cleanPhone}...`, { id: 'add-single' });
      const result = await addMonitoredLines([cleanPhone], user.id);
      if (result.errors.length > 0 && result.added === 0) {
        toast.error(result.errors[0], { id: 'add-single' });
        return;
      }

      setSinglePhone('');
      toast.success(`تمت إضافة الرقم ${cleanPhone} بنجاح`, { id: 'add-single' });

      // Refresh list and auto-check the added line
      const refreshed = await getMonitoredLines(user.id);
      setLines(refreshed);
      const newlyAdded = refreshed.find(l => l.phone_number === cleanPhone);
      if (newlyAdded) {
        const checkRes = await checkSingleMonitoredLine(newlyAdded, user.id);
        if (checkRes.success && checkRes.line) {
          setLines(prev => prev.map(l => (l.id === checkRes.line!.id ? checkRes.line! : l)));
          if (checkRes.line.system_status === 'converted') {
            setActiveTab('converted');
          } else if (checkRes.line.system_status === 'ineligible') {
            setActiveTab('ineligible');
          } else {
            setActiveTab('monitoring');
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل إضافة الرقم';
      console.error(err);
      toast.error(message, { id: 'add-single' });
    } finally {
      setIsAdding(false);
    }
  };

  // Add bulk phones
  const handleAddBulk = async () => {
    if (!user) return;
    const validNumbers = extractPhoneNumbers(bulkText);

    if (validNumbers.length === 0) {
      toast.error('لم يتم العثور على أرقام فودافون صحيحة في النص المدخل');
      return;
    }

    setIsBulkAdding(true);
    try {
      toast.loading(`جاري تسجيل ${validNumbers.length} رقم وفحصها تلقائياً...`, { id: 'add-bulk' });
      const res = await addMonitoredLines(validNumbers, user.id);
      if (res.added > 0) {
        toast.success(`تمت إضافة ${res.added} رقم بنجاح!`, { id: 'add-bulk' });
        setShowBulkModal(false);
        setBulkText('');
        await loadData();
      } else {
        toast.error(res.errors[0] || 'تعذر إضافة الأرقام', { id: 'add-bulk' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل إضافة الأرقام المجمعة';
      console.error(err);
      toast.error(message, { id: 'add-bulk' });
    } finally {
      setIsBulkAdding(false);
    }
  };

  // Single line recheck
  const handleRecheckSingle = async (line: VipRedLine) => {
    if (!user) return;
    setCheckingLineId(line.id);
    try {
      const res = await checkSingleMonitoredLine(line, user.id);
      if (res.success && res.line) {
        setLines(prev => prev.map(l => (l.id === res.line!.id ? res.line! : l)));
        if (res.line.system_status === 'converted') {
          toast.success(`🎉 تهانينا! تحول الرقم ${res.line.phone_number} إلى نظام ريد بنجاح!`);
        } else {
          toast.info(`حالة الرقم ${res.line.phone_number}: ${res.line.current_system || 'قيد المتابعة'}`);
        }
      } else {
        toast.error(res.error || 'فشل فحص الرقم');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل فحص الرقم';
      toast.error(message);
    } finally {
      setCheckingLineId(null);
    }
  };

  // Batch recheck all monitoring lines
  const handleBatchCheckAll = async () => {
    if (!user) return;
    const monitoringList = lines.filter(l => l.system_status === 'monitoring');
    if (monitoringList.length === 0) {
      toast.info('لا توجد أرقام قيد المراقبة لفحصها');
      return;
    }

    setIsBatchChecking(true);
    setBatchProgress({ current: 0, total: monitoringList.length, phone: '' });

    try {
      const res = await batchCheckMonitoredLines(
        monitoringList,
        user.id,
        (current: number, total: number, phone: string) => {
          setBatchProgress({ current, total, phone });
        }
      );

      const refreshed = await getMonitoredLines(user.id);
      setLines(refreshed);

      if (res.convertedNow > 0) {
        toast.success(`🎉 تم اكتمال الفحص! تم تحويل ${res.convertedNow} أرقام إلى نظام ريد!`);
      } else {
        toast.success(`تم فحص جميع الأرقام (${res.checked}) بنجاح`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء الفحص الجماعي';
      console.error(err);
      toast.error(message);
    } finally {
      setIsBatchChecking(false);
      setBatchProgress(null);
    }
  };

  // Delete line
  const handleDeleteLine = async (lineId: string, phone: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف الرقم ${phone} من قائمة المراقبة؟`)) {
      return;
    }

    try {
      const success = await deleteMonitoredLine(lineId);
      if (success) {
        setLines(prev => prev.filter(l => l.id !== lineId));
        toast.success(`تم حذف الرقم ${phone} من المراقبة`);
      } else {
        toast.error('تعذر حذف الرقم');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذر حذف الرقم';
      toast.error(message);
    }
  };

  // Categorized lines
  const monitoringLines = useMemo(() => lines.filter(l => l.system_status === 'monitoring'), [lines]);
  const convertedLines = useMemo(() => lines.filter(l => l.system_status === 'converted'), [lines]);
  const ineligibleLines = useMemo(() => lines.filter(l => l.system_status === 'ineligible'), [lines]);

  const displayedLines = useMemo(() => {
    switch (activeTab) {
      case 'converted':
        return convertedLines;
      case 'ineligible':
        return ineligibleLines;
      case 'monitoring':
      default:
        return monitoringLines;
    }
  }, [activeTab, convertedLines, ineligibleLines, monitoringLines]);

  // Design Tokens
  const pageBg = L ? '#f8fafc' : '#0B0B14';
  const cardBg = L ? '#ffffff' : '#12121f';
  const innerBg = L ? '#f1f5f9' : 'rgba(255,255,255,0.04)';
  const cardBdr = L ? '#e2e8f0' : 'rgba(255,255,255,0.08)';
  const textC = L ? '#0f172a' : '#f8fafc';
  const mutC = L ? '#64748b' : '#94a3b8';

  // Permission Guard
  if (!isLoading && !hasAccess) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center" style={{ background: pageBg }}>
        <div
          className="max-w-md w-full p-6 rounded-2xl border text-center space-y-4 shadow-xl"
          style={{ background: cardBg, borderColor: cardBdr }}
        >
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20">
            <ShieldAlert className="w-7 h-7 text-rose-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-black" style={{ color: textC }}>
              قسم مخصص لعملاء VIP والتجار
            </h2>
            <p className="text-xs leading-relaxed" style={{ color: mutC }}>
              هذا القسم يتطلب صلاحية مسبقة من إدارة التطبيق لمراقبة وتحويل خطوط فودافون ريد تلقائياً.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => navigate('/')}
              className="h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all active:scale-95"
              style={{ background: innerBg, borderColor: cardBdr, color: textC }}
            >
              <ArrowRight className="w-4 h-4" />
              العودة للشاشة الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 transition-colors duration-300" style={{ background: pageBg }}>
      {/* ── رأس الصفحة (Header) ── */}
      <header
        className="sticky top-0 z-30 px-4 py-3 border-b backdrop-blur-md transition-colors"
        style={{
          background: L ? 'rgba(255, 255, 255, 0.85)' : 'rgba(11, 11, 20, 0.85)',
          borderColor: cardBdr,
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => navigate('/')}
              className="w-8 h-8 rounded-lg border flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              title="العودة للرئيسية"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-gradient-to-tr from-[#E60000] to-rose-500 flex items-center justify-center text-white shadow-sm shrink-0">
                  <Crown className="w-3.5 h-3.5" />
                </span>
                <h1 className="text-sm font-black truncate" style={{ color: textC }}>
                  إدارة باقات ريد VIP
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  Red Manager
                </span>
              </div>
              <p className="text-[10px] truncate" style={{ color: mutC }}>
                تتبع وتحويل أرقام 14 قرش لنظام Enterprise member control
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all active:scale-95"
              style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── المحتوى الرئيسي ── */}
      <main className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
        {/* تنبيه إشعارات المتصفح إن لم تكن مفعلة */}
        {!hasNotifPermission && (
          <div
            className="p-2.5 rounded-xl border flex items-center justify-between gap-2.5 text-xs"
            style={{
              background: L ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.12)',
              borderColor: L ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.4)',
              color: L ? '#92400e' : '#fbbf24',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-3.5 h-3.5 shrink-0 text-amber-500 animate-bounce" />
              <span className="text-[11px] truncate font-medium">
                فعّل إشعارات المتصفح لتصلك رنة وتنبيه لحظي عند تحويل أي رقم لنظام ريد!
              </span>
            </div>
            <button
              onClick={handleEnableNotifications}
              className="px-2.5 py-1 rounded-lg font-bold text-[11px] shrink-0 transition-all active:scale-95 text-white shadow-sm"
              style={{ background: '#f59e0b' }}
            >
              تفعيل
            </button>
          </div>
        )}

        {/* ── كارت الإدخال والإضافة المدمج (Ultra-compact Add Bar) ── */}
        <div
          className="p-3 rounded-2xl border space-y-2.5 shadow-sm"
          style={{ background: cardBg, borderColor: cardBdr }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: textC }}>
              <Plus className="w-3.5 h-3.5 text-[#E60000]" />
              إضافة أرقام للمراقبة المستمرة
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/5 dark:bg-white/5" style={{ color: mutC }}>
              إجمالي الأرقام: {lines.length}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: mutC }} />
              <input
                type="tel"
                inputMode="numeric"
                value={singlePhone}
                onChange={e => setSinglePhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSingle()}
                placeholder="أدخل رقم فودافون (01xxxxxxxxx)"
                maxLength={11}
                disabled={isAdding}
                className="w-full h-10 rounded-xl pr-9 pl-3 text-xs font-medium outline-none transition-all"
                style={{
                  background: innerBg,
                  border: `1px solid ${cardBdr}`,
                  color: textC,
                  direction: 'ltr',
                }}
                dir="ltr"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleAddSingle}
                disabled={isAdding || !singlePhone.trim()}
                className="h-10 px-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 text-white shadow-sm"
                style={{ background: '#E60000' }}
              >
                <Zap className="w-3.5 h-3.5" />
                {isAdding ? 'جاري الفحص...' : 'إضافة وفحص'}
              </button>

              <button
                onClick={() => setShowBulkModal(true)}
                className="h-10 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all active:scale-95"
                style={{
                  background: innerBg,
                  borderColor: cardBdr,
                  color: textC,
                }}
                title="إضافة أرقام متعددة دفعة واحدة"
              >
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span className="hidden sm:inline">إضافة مجمعة</span>
                <span className="sm:hidden">مجمعة</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── شريط التبويبات المدمج السريع (Stat Pills) ── */}
        <div className="grid grid-cols-3 gap-2">
          {/* تبويب قيد المراقبة */}
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`p-2.5 rounded-xl border text-right transition-all flex flex-col justify-between ${
              activeTab === 'monitoring' ? 'ring-2 ring-blue-500/50 shadow-sm' : ''
            }`}
            style={{
              background: activeTab === 'monitoring' ? (L ? '#eff6ff' : 'rgba(59, 130, 246, 0.14)') : cardBg,
              borderColor: activeTab === 'monitoring' ? '#3b82f6' : cardBdr,
            }}
          >
            <div className="flex items-center justify-between">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-mono text-sm font-black text-blue-500">{monitoringLines.length}</span>
            </div>
            <div className="mt-1">
              <p className="text-[11px] font-bold" style={{ color: textC }}>قيد المراقبة</p>
              <p className="text-[9px]" style={{ color: mutC }}>14 قرش ريح بالك</p>
            </div>
          </button>

          {/* تبويب تم التحويل */}
          <button
            onClick={() => setActiveTab('converted')}
            className={`p-2.5 rounded-xl border text-right transition-all flex flex-col justify-between ${
              activeTab === 'converted' ? 'ring-2 ring-emerald-500/50 shadow-sm' : ''
            }`}
            style={{
              background: activeTab === 'converted' ? (L ? '#f0fdf4' : 'rgba(16, 185, 129, 0.14)') : cardBg,
              borderColor: activeTab === 'converted' ? '#10b981' : cardBdr,
            }}
          >
            <div className="flex items-center justify-between">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-mono text-sm font-black text-emerald-500">{convertedLines.length}</span>
            </div>
            <div className="mt-1">
              <p className="text-[11px] font-bold" style={{ color: textC }}>تم التحويل</p>
              <p className="text-[9px]" style={{ color: mutC }}>جاهز للتفعيل</p>
            </div>
          </button>

          {/* تبويب غير مؤهل */}
          <button
            onClick={() => setActiveTab('ineligible')}
            className={`p-2.5 rounded-xl border text-right transition-all flex flex-col justify-between ${
              activeTab === 'ineligible' ? 'ring-2 ring-rose-500/50 shadow-sm' : ''
            }`}
            style={{
              background: activeTab === 'ineligible' ? (L ? '#fef2f2' : 'rgba(239, 68, 68, 0.14)') : cardBg,
              borderColor: activeTab === 'ineligible' ? '#ef4444' : cardBdr,
            }}
          >
            <div className="flex items-center justify-between">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              <span className="font-mono text-sm font-black text-rose-500">{ineligibleLines.length}</span>
            </div>
            <div className="mt-1">
              <p className="text-[11px] font-bold" style={{ color: textC }}>غير مؤهل</p>
              <p className="text-[9px]" style={{ color: mutC }}>يلزم 14 قرش أولاً</p>
            </div>
          </button>
        </div>

        {/* ── شريط التحكم التلقائي والفحص الجماعي (Compact Control Bar) ── */}
        <div
          className="p-2.5 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-2.5"
          style={{ background: cardBg, borderColor: cardBdr }}
        >
          <div className="text-right w-full sm:w-auto">
            <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: textC }}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              دورية الفحص التلقائي بالسيرفر: كل {config?.check_interval_hours || 4} ساعات
            </p>
            <p className="text-[10px]" style={{ color: mutC }}>
              يتم استعلام السيرفر ومطابقة الأنظمة وإرسال إشعارات فورية عند التحويل
            </p>
          </div>

          <button
            onClick={handleBatchCheckAll}
            disabled={isBatchChecking || monitoringLines.length === 0}
            className="w-full sm:w-auto h-8 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 border transition-all active:scale-95 disabled:opacity-50 shrink-0"
            style={{
              background: innerBg,
              borderColor: cardBdr,
              color: textC,
            }}
          >
            <RotateCcw className={`w-3.5 h-3.5 text-[#E60000] ${isBatchChecking ? 'animate-spin' : ''}`} />
            {isBatchChecking
              ? `جاري فحص (${batchProgress?.current}/${batchProgress?.total})...`
              : 'فحص جميع الأرقام الآن'}
          </button>
        </div>

        {/* مؤشر الفحص المجمع إن كان نشطاً */}
        {isBatchChecking && batchProgress && (
          <div className="p-2.5 rounded-xl border space-y-1.5" style={{ background: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.25)' }}>
            <div className="flex justify-between text-xs font-bold text-blue-500">
              <span>جاري فحص الخط: <span dir="ltr">{batchProgress.phone}</span></span>
              <span>{batchProgress.current} من {batchProgress.total}</span>
            </div>
            <div className="w-full bg-blue-500/20 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* ── قائمة الأرقام المضغوطة (Ultra-compact Cards) ── */}
        <div className="space-y-2">
          {displayedLines.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border" style={{ background: cardBg, borderColor: cardBdr }}>
              <Phone className="w-8 h-8 mx-auto mb-2 opacity-25" style={{ color: mutC }} />
              <p className="text-xs font-bold" style={{ color: textC }}>
                {activeTab === 'monitoring' && 'لا توجد أرقام قيد المراقبة حالياً'}
                {activeTab === 'converted' && 'لم يتم تحويل أي أرقام حتى الآن'}
                {activeTab === 'ineligible' && 'لا توجد أرقام غير مؤهلة'}
              </p>
              <p className="text-[11px] mt-1" style={{ color: mutC }}>
                أدخل أرقام الهواتف بالأعلى للمراقبة ومتابعة تحويلها إلى نظام ريد.
              </p>
            </div>
          ) : (
            displayedLines.map(line => {
              const classification = classifyLineSystem(line.current_system);
              const isLineChecking = checkingLineId === line.id;
              const intervalHours = config?.check_interval_hours || 4;

              // Calculate countdown
              let countdownLabel = '';
              if (classification.status === 'monitoring') {
                if (!line.last_checked_at) {
                  countdownLabel = 'بانتظار أول فحص';
                } else {
                  const lastTime = new Date(line.last_checked_at).getTime();
                  const nextTime = lastTime + intervalHours * 3600 * 1000;
                  const diffMs = nextTime - Date.now();
                  if (diffMs <= 0) {
                    countdownLabel = 'مستحق الفحص الآن';
                  } else {
                    const hrs = Math.floor(diffMs / (3600 * 1000));
                    const mins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
                    countdownLabel = hrs > 0 ? `القادم بعد ${hrs} س و ${mins} د` : `القادم بعد ${mins} د`;
                  }
                }
              }

              return (
                <div
                  key={line.id}
                  className="p-2.5 sm:p-3 rounded-xl border transition-all space-y-2 shadow-sm"
                  style={{
                    background: cardBg,
                    borderColor:
                      classification.status === 'converted'
                        ? (L ? '#10b981' : 'rgba(16, 185, 129, 0.45)')
                        : classification.status === 'ineligible'
                        ? (L ? '#fca5a5' : 'rgba(239, 68, 68, 0.3)')
                        : cardBdr,
                  }}
                >
                  {/* شريط تم التحويل البارز الفخم */}
                  {classification.status === 'converted' && (
                    <div
                      className="p-2 rounded-lg border flex items-center justify-between gap-2 text-xs font-bold"
                      style={{
                        background: L ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.18)',
                        borderColor: L ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.5)',
                        color: L ? '#065f46' : '#34d399',
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="truncate">🎉 نظام مؤهل — تم التحويل بنجاح لنظام ريد (Enterprise member control)</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500 text-white font-black shrink-0">
                        جاهز للتفعيل
                      </span>
                    </div>
                  )}

                  {/* الصف المدمج للبيانات والأزرار */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    {/* رقم الهاتف والشارات */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm font-black tracking-wider" style={{ color: textC }} dir="ltr">
                          {line.phone_number}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(line.phone_number);
                            toast.success(`تم نسخ الرقم ${line.phone_number}`);
                          }}
                          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition-colors"
                          title="نسخ الرقم"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        {/* شارة اسم النظام */}
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border truncate"
                          style={{
                            background: classification.badgeBg,
                            color: classification.badgeText,
                            borderColor: classification.badgeBorder,
                          }}
                        >
                          {classification.label}
                        </span>

                        {/* شارة المراقبة الحية والعد التنازلي */}
                        {classification.status === 'monitoring' && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                            style={{
                              background: L ? '#fef3c7' : 'rgba(245, 158, 11, 0.15)',
                              color: L ? '#92400e' : '#fbbf24',
                              borderColor: L ? '#fde68a' : 'rgba(245, 158, 11, 0.35)',
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                            <span>تحت المراقبة ({countdownLabel})</span>
                          </span>
                        )}
                      </div>

                      {/* إحصائيات سريعة للرقم */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px]" style={{ color: mutC }}>
                        <span>
                          آخر فحص: {line.last_checked_at ? new Date(line.last_checked_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'لم يُفحص'}
                        </span>
                        <span>•</span>
                        <span>فحص {line.check_count || 0} مرات</span>
                        {line.last_line_info?.balance && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-500 font-bold">الرصيد: {line.last_line_info.balance}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* أزرار الإجراءات للرقم */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                      <button
                        onClick={() => setSelectedLineForDetails(line)}
                        className="h-7 px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95"
                        style={{
                          background: innerBg,
                          borderColor: cardBdr,
                          color: textC,
                        }}
                        title="تفاصيل الخط والباقات"
                      >
                        <Eye className="w-3 h-3 text-blue-500" />
                        تفاصيل
                      </button>

                      <button
                        onClick={() => handleRecheckSingle(line)}
                        disabled={isLineChecking || isBatchChecking}
                        className="h-7 px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
                        style={{
                          background: innerBg,
                          borderColor: cardBdr,
                          color: textC,
                        }}
                        title="إعادة فحص هذا الرقم فوراً"
                      >
                        <RotateCcw className={`w-3 h-3 text-[#E60000] ${isLineChecking ? 'animate-spin' : ''}`} />
                        {isLineChecking ? 'جاري...' : 'فحص'}
                      </button>

                      <button
                        onClick={() => handleDeleteLine(line.id, line.phone_number)}
                        className="h-7 w-7 rounded-lg border flex items-center justify-center transition-all hover:bg-rose-500/10 active:scale-95"
                        style={{
                          borderColor: cardBdr,
                          color: mutC,
                        }}
                        title="حذف الرقم من المراقبة"
                      >
                        <Trash2 className="w-3 h-3 hover:text-rose-500" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* ── مودال الإضافة المجمعة (Bulk Modal) ── */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-2xl border p-4 space-y-3 shadow-2xl"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#E60000]" />
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  إضافة أرقام متعددة للمراقبة دفعة واحدة
                </h3>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] leading-relaxed" style={{ color: mutC }}>
              الصق قائمة الأرقام هنا (مفصولة بأسطر أو مسافات أو فواصل). سيتم تنقية أرقام فودافون الصحيحة فقط وفحص نظام كل رقم فورياً.
            </p>

            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              rows={6}
              placeholder="01012345678&#10;01098765432&#10;01055555555"
              className="w-full rounded-xl p-3 text-xs font-mono outline-none transition-all"
              style={{
                background: innerBg,
                border: `1px solid ${cardBdr}`,
                color: textC,
                direction: 'ltr',
              }}
              dir="ltr"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowBulkModal(false)}
                className="h-9 px-3.5 rounded-xl border font-bold text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                إلغاء
              </button>
              <button
                onClick={handleAddBulk}
                disabled={isBulkAdding || !bulkText.trim()}
                className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 text-white disabled:opacity-50 shadow-sm"
                style={{ background: '#E60000' }}
              >
                <Plus className="w-4 h-4" />
                {isBulkAdding ? 'جاري الإضافة والفحص...' : 'إضافة وبدء الفحص'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال تفاصيل الخط الشاملة ── */}
      <VipRedLineDetailsModal
        line={selectedLineForDetails}
        isOpen={Boolean(selectedLineForDetails)}
        onClose={() => setSelectedLineForDetails(null)}
        onRecheck={async (line: VipRedLine) => {
          await handleRecheckSingle(line);
          const updated = lines.find(l => l.id === line.id) || null;
          setSelectedLineForDetails(updated);
        }}
        isRechecking={checkingLineId === selectedLineForDetails?.id}
        L={L}
      />
    </div>
  );
}
