/**
 * VipRedMonitoringSection — قسم VIP لمراقبة تحويلات خطوط ريد
 * يظهر داخل صفحة معلومات الخط (Line Info)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Crown, Phone, Search, Plus, RotateCcw, CheckCircle2, Clock,
  AlertTriangle, Trash2, Eye, Shield, Bell,
  Sparkles, ChevronDown, ChevronUp, Layers, Check, Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  type VipRedLine,
  type VipRedConfig,
  classifyLineSystem,
} from '@/types/vipRed';
import {
  getVipRedConfig,
  canUserAccessVipRed,
  getMonitoredLines,
  extractPhoneNumbers,
  addMonitoredLines,
  deleteMonitoredLine,
  checkSingleMonitoredLine,
  batchCheckMonitoredLines,
  requestBrowserNotificationPermission,
} from '@/lib/vipRedService';
import VipRedLineDetailsModal from './VipRedLineDetailsModal';

interface Props {
  L: boolean;
}

export default function VipRedMonitoringSection({ L }: Props) {
  const { user, profile } = useAuth();

  const [config, setConfig] = useState<VipRedConfig | null>(null);
  const [lines, setLines] = useState<VipRedLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'monitoring' | 'converted' | 'ineligible'>('monitoring');

  // إضافة رقم
  const [singlePhone, setSinglePhone] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // الفحص الفردي والجماعي
  const [checkingLineId, setCheckingLineId] = useState<string | null>(null);
  const [isBatchChecking, setIsBatchChecking] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; phone: string } | null>(null);

  // مودال التفاصيل
  const [selectedLineForDetails, setSelectedLineForDetails] = useState<VipRedLine | null>(null);

  // طي وفتح القسم
  const [isExpanded, setIsExpanded] = useState(true);
  const [hasNotifPermission, setHasNotifPermission] = useState(false);

  // استعلام الصلاحيات والبيانات
  const loadData = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const cfg = await getVipRedConfig();
      setConfig(cfg);
      const isAllowed = canUserAccessVipRed(user, profile, cfg);
      if (isAllowed) {
        const userLines = await getMonitoredLines(user.id);
        setLines(userLines);
      }
    } catch (e) {
      console.error('[VipRed] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    loadData();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setHasNotifPermission(Notification.permission === 'granted');
    }
  }, [loadData]);

  const hasAccess = useMemo(() => {
    return canUserAccessVipRed(user, profile, config);
  }, [user, profile, config]);

  // إحصائيات الأرقام
  const monitoringLines = useMemo(() => lines.filter(l => l.system_status === 'monitoring'), [lines]);
  const convertedLines  = useMemo(() => lines.filter(l => l.system_status === 'converted'), [lines]);
  const ineligibleLines = useMemo(() => lines.filter(l => l.system_status === 'ineligible'), [lines]);

  // طلب إذن الإشعارات
  const handleEnableNotifications = async () => {
    const granted = await requestBrowserNotificationPermission();
    setHasNotifPermission(granted);
    if (granted) {
      toast.success('تم تفعيل إشعارات المتصفح بنجاح! سيصلك تنبيه فوري فور تحويل أي خط.');
    } else {
      toast.error('تم رفض إذن الإشعارات. يرجى تفعيله من إعدادات المتصفح.');
    }
  };

  // إضافة رقم فردي مع فحص فوري
  const handleAddSingle = async () => {
    if (!user) return;
    const phoneList = extractPhoneNumbers(singlePhone);
    if (phoneList.length === 0) {
      toast.error('يرجى إدخال رقم هاتف فودافون صحيح يبدأ بـ 01');
      return;
    }

    setIsAdding(true);
    const targetPhone = phoneList[0];
    const { added, errors } = await addMonitoredLines([targetPhone], user.id);

    if (errors.length > 0 && added === 0) {
      toast.error(errors[0]);
      setIsAdding(false);
      return;
    }

    toast.success(`تمت إضافة الرقم ${targetPhone} وجاري الفحص الفوري لنظامه...`);
    setSinglePhone('');

    // تحديث القائمة
    const updated = await getMonitoredLines(user.id);
    setLines(updated);

    // فحص فوري للرقم المضاف
    const newlyAdded = updated.find(l => l.phone_number === targetPhone);
    if (newlyAdded) {
      setCheckingLineId(newlyAdded.id);
      const res = await checkSingleMonitoredLine(newlyAdded, user.id);
      setCheckingLineId(null);

      if (res.success && res.line) {
        setLines(prev => prev.map(l => (l.id === res.line!.id ? res.line! : l)));
        const cls = classifyLineSystem(res.line.current_system);
        if (cls.status === 'converted') {
          toast.success(`🎉 مبروك! الرقم ${targetPhone} تحول بالفعل لنظام ريد!`);
          setActiveTab('converted');
        } else if (cls.status === 'monitoring') {
          toast.info(`الرقم ${targetPhone} في نظام 14 قرش ريح بالك وهو مؤهل وقيد المراقبة.`);
          setActiveTab('monitoring');
        } else {
          toast.warning(`الرقم ${targetPhone} نظامه الحالي (${res.line.current_system}) غير مؤهل للتحويل. يرجى تحويله إلى 14 قرش أولاً.`);
          setActiveTab('ineligible');
        }
      } else {
        toast.error(`فشل الفحص الأولي: ${res.error || 'خطأ غير متوقع'}`);
      }
    }

    setIsAdding(false);
  };

  // إضافة مجمعة لأرقام لا نهائية
  const handleAddBulk = async () => {
    if (!user) return;
    const phoneList = extractPhoneNumbers(bulkInput);
    if (phoneList.length === 0) {
      toast.error('لم يتم العثور على أي أرقام هواتف صالحة.');
      return;
    }

    setIsAdding(true);
    const { added, errors } = await addMonitoredLines(phoneList, user.id);
    setShowBulkModal(false);
    setBulkInput('');

    if (added > 0) {
      toast.success(`تمت إضافة ${added} رقم بنجاح إلى قائمة المراقبة!`);
    }
    if (errors.length > 0) {
      toast.warning(`تنبيه: ${errors.length} أرقام لم تُضف (مكررة مسبقاً أو غير صالحة)`);
    }

    // تحديث القائمة
    const updated = await getMonitoredLines(user.id);
    setLines(updated);
    setIsAdding(false);
  };

  // فحص فردي لرقم محدد
  const handleRecheckSingle = async (line: VipRedLine) => {
    if (!user) return;
    setCheckingLineId(line.id);
    const res = await checkSingleMonitoredLine(line, user.id);
    setCheckingLineId(null);

    if (res.success && res.line) {
      setLines(prev => prev.map(l => (l.id === res.line!.id ? res.line! : l)));
      if (selectedLineForDetails?.id === line.id) {
        setSelectedLineForDetails(res.line);
      }
      const cls = classifyLineSystem(res.line.current_system);
      if (cls.status === 'converted') {
        toast.success(`🎉 الرقم ${line.phone_number} تحول إلى نظام ريد (Enterprise member control)!`);
        setActiveTab('converted');
      } else {
        toast.info(`تم فحص الرقم: ${cls.label}`);
      }
    } else {
      toast.error(`فشل فحص ${line.phone_number}: ${res.error || 'حاول لاحقاً'}`);
    }
  };

  // فحص دفعة من الأرقام
  const handleBatchCheckAll = async () => {
    if (!user || isBatchChecking) return;
    const targetLines = activeTab === 'converted' ? lines : monitoringLines;
    if (targetLines.length === 0) {
      toast.info('لا توجد أرقام قيد المراقبة لفحصها حالياً.');
      return;
    }

    setIsBatchChecking(true);
    setBatchProgress({ current: 0, total: targetLines.length, phone: targetLines[0].phone_number });

    toast.info(`بدء فحص ${targetLines.length} أرقام بتوزيع أحمال آمن...`);

    const result = await batchCheckMonitoredLines(
      targetLines,
      user.id,
      (idx, tot, ph) => {
        setBatchProgress({ current: idx, total: tot, phone: ph });
      }
    );

    const refreshed = await getMonitoredLines(user.id);
    setLines(refreshed);
    setIsBatchChecking(false);
    setBatchProgress(null);

    if (result.convertedNow > 0) {
      toast.success(`🎉 مبروك! تم اكتشاف تحويل ${result.convertedNow} أرقام إلى نظام ريد بنجاح!`);
      setActiveTab('converted');
    } else {
      toast.success(`اكتمل الفحص: تم فحص ${result.checked} رقم بنجاح (${result.errors} أخطاء).`);
    }
  };

  // حذف رقم من المراقبة
  const handleDeleteLine = async (lineId: string, phone: string) => {
    if (!confirm(`هل أنت متأكد من حذف الرقم ${phone} من قائمة المراقبة؟`)) return;
    const ok = await deleteMonitoredLine(lineId);
    if (ok) {
      setLines(prev => prev.filter(l => l.id !== lineId));
      if (selectedLineForDetails?.id === lineId) {
        setSelectedLineForDetails(null);
      }
      toast.success(`تم حذف الرقم ${phone}`);
    } else {
      toast.error('تعذّر حذف الرقم');
    }
  };

  // الألوان والقوالب
  const cardBg    = L ? '#ffffff' : 'rgba(18, 22, 34, 0.95)';
  const cardBdr   = L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.09)';
  const innerBg   = L ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
  const textC     = L ? '#1a1a2e' : '#ffffff';
  const mutC      = L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';

  if (loading) return null;

  // في حال لم يكن للمستخدم صلاحية، نعرض إشعار إداري أنيق للأدمن فقط أو نوجه العميل
  if (!hasAccess) {
    return (
      <div
        className="rounded-2xl p-4 border transition-all mt-4"
        style={{
          background: L ? '#fef2f2' : 'rgba(230,0,0,0.04)',
          borderColor: L ? '#fecaca' : 'rgba(230,0,0,0.15)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-black" style={{ color: textC }}>
              قسم VIP لمراقبة تحويلات خطوط ريد (Vodafone Red)
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: mutC }}>
              هذه الميزة مخصصة لحسابات VIP والتجار وتتطلب إذناً من الإدارة للتفعيل.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const displayedLines =
    activeTab === 'monitoring' ? monitoringLines :
    activeTab === 'converted'  ? convertedLines :
    ineligibleLines;

  return (
    <div
      className="rounded-2xl overflow-hidden border transition-all mt-4"
      style={{
        background: cardBg,
        borderColor: 'rgba(230, 0, 0, 0.25)',
        boxShadow: L ? '0 4px 20px rgba(230,0,0,0.06)' : '0 4px 25px rgba(0,0,0,0.3)',
      }}
    >
      {/* ── الشريط العلوي لقسم VIP ── */}
      <div
        className="p-4 flex items-center justify-between border-b cursor-pointer select-none"
        style={{
          borderColor: cardBdr,
          background: L ? 'linear-gradient(90deg, rgba(230,0,0,0.06) 0%, rgba(255,255,255,0) 100%)' : 'linear-gradient(90deg, rgba(230,0,0,0.12) 0%, rgba(20,20,30,0) 100%)',
        }}
        onClick={() => setIsExpanded(p => !p)}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #E60000 0%, #990000 100%)',
              color: '#ffffff',
            }}
          >
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-tight" style={{ color: textC }}>
                قسم VIP لمراقبة تحويلات خطوط ريد
              </h2>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#E60000]/15 text-[#E60000] border border-[#E60000]/25">
                تجار VIP
              </span>
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: mutC }}>
              إضافة أرقام غير محدودة وتتبع التحويل إلى نظام Enterprise member control تلقائياً
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lines.length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg border hidden sm:inline-block" style={{ background: innerBg, borderColor: cardBdr, color: textC }}>
              {lines.length} خط مسجل
            </span>
          )}
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: mutC }}
            title={isExpanded ? 'طي القسم' : 'توسيع القسم'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* تنبيه إشعارات المتصفح */}
          {!hasNotifPermission && (
            <div
              className="p-3 rounded-xl border flex items-center justify-between gap-3 text-xs"
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                borderColor: 'rgba(245, 158, 11, 0.25)',
                color: L ? '#92400e' : '#fbbf24',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="w-4 h-4 shrink-0 text-amber-500" />
                <span className="truncate">
                  فعّل إشعارات المتصفح لكي يصلك إشعار فوري لحظة تحويل أي رقم لنظام ريد!
                </span>
              </div>
              <button
                onClick={handleEnableNotifications}
                className="px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 transition-all active:scale-95 text-white"
                style={{ background: '#f59e0b' }}
              >
                تفعيل الإشعارات
              </button>
            </div>
          )}

          {/* ── نموذج إضافة الأرقام (فردي + مجمع) ── */}
          <div className="space-y-2">
            <label className="text-xs font-bold block" style={{ color: textC }}>
              إضافة أرقام للمراقبة المستمرة
            </label>
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
                  className="w-full h-11 rounded-xl pr-9 pl-3 text-sm font-medium outline-none transition-all"
                  style={{
                    background: innerBg,
                    border: `1px solid ${cardBdr}`,
                    color: textC,
                    direction: 'ltr',
                  }}
                  dir="ltr"
                />
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleAddSingle}
                  disabled={isAdding || !singlePhone.trim()}
                  className="h-11 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 text-white shadow-sm"
                  style={{ background: '#E60000' }}
                >
                  <Plus className="w-4 h-4" />
                  إضافة وفحص فوري
                </button>

                <button
                  onClick={() => setShowBulkModal(true)}
                  disabled={isAdding}
                  className="h-11 px-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all active:scale-95"
                  style={{
                    background: innerBg,
                    borderColor: cardBdr,
                    color: textC,
                  }}
                >
                  <Layers className="w-4 h-4 text-amber-500" />
                  إضافة مجمعة
                </button>
              </div>
            </div>
          </div>

          {/* ── بطاقات الإحصائيات والأزرار العامة ── */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setActiveTab('monitoring')}
              className={`p-3 rounded-xl border text-right transition-all ${activeTab === 'monitoring' ? 'ring-2 ring-blue-500/50' : ''}`}
              style={{
                background: activeTab === 'monitoring' ? 'rgba(59, 130, 246, 0.12)' : innerBg,
                borderColor: activeTab === 'monitoring' ? '#3b82f6' : cardBdr,
              }}
            >
              <div className="flex items-center justify-between">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="font-mono text-base font-black text-blue-500">{monitoringLines.length}</span>
              </div>
              <p className="text-[11px] font-bold mt-1.5" style={{ color: textC }}>قيد المراقبة</p>
              <p className="text-[10px]" style={{ color: mutC }}>14 قرش ريح بالك</p>
            </button>

            <button
              onClick={() => setActiveTab('converted')}
              className={`p-3 rounded-xl border text-right transition-all ${activeTab === 'converted' ? 'ring-2 ring-emerald-500/50' : ''}`}
              style={{
                background: activeTab === 'converted' ? 'rgba(16, 185, 129, 0.12)' : innerBg,
                borderColor: activeTab === 'converted' ? '#10b981' : cardBdr,
              }}
            >
              <div className="flex items-center justify-between">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="font-mono text-base font-black text-emerald-500">{convertedLines.length}</span>
              </div>
              <p className="text-[11px] font-bold mt-1.5" style={{ color: textC }}>تم التحويل بنجاح</p>
              <p className="text-[10px]" style={{ color: mutC }}>جاهز للتفعيل الآن</p>
            </button>

            <button
              onClick={() => setActiveTab('ineligible')}
              className={`p-3 rounded-xl border text-right transition-all ${activeTab === 'ineligible' ? 'ring-2 ring-rose-500/50' : ''}`}
              style={{
                background: activeTab === 'ineligible' ? 'rgba(239, 68, 68, 0.12)' : innerBg,
                borderColor: activeTab === 'ineligible' ? '#ef4444' : cardBdr,
              }}
            >
              <div className="flex items-center justify-between">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span className="font-mono text-base font-black text-rose-500">{ineligibleLines.length}</span>
              </div>
              <p className="text-[11px] font-bold mt-1.5" style={{ color: textC }}>غير مؤهل</p>
              <p className="text-[10px]" style={{ color: mutC }}>يلزم 14 قرش أولاً</p>
            </button>
          </div>

          {/* ── شريط زر الفحص الجماعي والتقدم ── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl border" style={{ background: innerBg, borderColor: cardBdr }}>
            <div className="text-xs space-y-0.5 text-right w-full sm:w-auto">
              <p className="font-bold" style={{ color: textC }}>
                دورية الفحص التلقائي بالسيرفر: كل {config?.check_interval_hours ? (config.check_interval_hours >= 1 ? `${config.check_interval_hours} ساعات` : `${Math.round(config.check_interval_hours * 60)} دقيقة`) : '30 دقيقة'}
              </p>
              <p className="text-[11px]" style={{ color: mutC }}>
                يمكنك أيضاً فحص جميع الأرقام قيد المراقبة فورياً بضغطة زر
              </p>
            </div>

            <button
              onClick={handleBatchCheckAll}
              disabled={isBatchChecking || monitoringLines.length === 0}
              className="w-full sm:w-auto h-9 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: L ? '#ffffff' : 'rgba(255,255,255,0.08)',
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

          {/* شريط تقدم الفحص الجماعي إن وُجد */}
          {isBatchChecking && batchProgress && (
            <div className="p-3 rounded-xl border space-y-1.5" style={{ background: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.25)' }}>
              <div className="flex justify-between text-xs font-bold text-blue-500">
                <span>جاري فحص الخط: <span dir="ltr">{batchProgress.phone}</span></span>
                <span>{batchProgress.current} من {batchProgress.total}</span>
              </div>
              <div className="w-full bg-blue-500/20 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ── قائمة الأرقام بالتبويب الحالي ── */}
          <div className="space-y-2">
            {displayedLines.length === 0 ? (
              <div className="py-8 text-center rounded-xl border" style={{ background: innerBg, borderColor: cardBdr }}>
                <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: mutC }} />
                <p className="text-xs font-bold" style={{ color: textC }}>
                  {activeTab === 'monitoring' && 'لا توجد أرقام قيد المراقبة حالياً'}
                  {activeTab === 'converted' && 'لم يتم تحويل أي أرقام حتى الآن'}
                  {activeTab === 'ineligible' && 'لا توجد أرقام غير مؤهلة'}
                </p>
                <p className="text-[11px] mt-1" style={{ color: mutC }}>
                  أضف أرقاماً جديدة لبدء التتبع التلقائي وتحويلها إلى نظام ريد.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedLines.map((line) => {
                  const classification = classifyLineSystem(line.current_system);
                  const isLineChecking = checkingLineId === line.id;

                  return (
                    <div
                      key={line.id}
                      className="p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{
                        background: innerBg,
                        borderColor:
                          classification.status === 'converted' ? 'rgba(16, 185, 129, 0.35)' :
                          classification.status === 'ineligible' ? 'rgba(239, 68, 68, 0.25)' :
                          cardBdr,
                      }}
                    >
                      {/* معلومات الرقم */}
                      <div className="space-y-2 min-w-0 flex-1">
                        {/* بانر لافت ومميز عند نجاح التحويل ونظام مؤهل */}
                        {classification.status === 'converted' && (
                          <div
                            className="p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold"
                            style={{
                              background: L ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.18)',
                              borderColor: L ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.5)',
                              color: L ? '#065f46' : '#34d399',
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base">🎉</span>
                              <div>
                                <p className="leading-snug">
                                  نظام مؤهل — تم التحويل بنجاح لنظام ريد!
                                </p>
                                <p className="text-[10px] opacity-90 font-mono">
                                  Enterprise member control
                                </p>
                              </div>
                            </div>
                            <span
                              className="px-2.5 py-1 rounded-lg text-[10px] font-black text-white shrink-0 shadow-sm"
                              style={{ background: '#10b981' }}
                            >
                              جاهز للتفعيل الفوري
                            </span>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-black" style={{ color: textC }} dir="ltr">
                            {line.phone_number}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(line.phone_number);
                              toast.success(`تم نسخ الرقم ${line.phone_number}`);
                            }}
                            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground transition-colors"
                            title="نسخ الرقم"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* شارة الحالة الأصلية */}
                          <span
                            className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border truncate"
                            style={{
                              background: classification.badgeBg,
                              color: classification.badgeText,
                              borderColor: classification.badgeBorder,
                            }}
                          >
                            {classification.label}
                          </span>

                          {/* شارة المراقبة الحية والعد التنازلي للخطوط قيد المراقبة */}
                          {classification.status === 'monitoring' && (
                            <span
                              className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full border"
                              style={{
                                background: L ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.16)',
                                color: L ? '#b45309' : '#fbbf24',
                                borderColor: L ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.4)',
                              }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                              <span>تحت المراقبة والفحص الدوري</span>
                            </span>
                          )}
                        </div>

                        {/* تفاصيل التوقيتات، عدد الساعات، وموعد الفحص القادم */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: mutC }}>
                          <span>
                            آخر فحص: {line.last_checked_at ? new Date(line.last_checked_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'لم يُفحص'}
                          </span>
                          <span>•</span>
                          <span>فحص {line.check_count || 0} مرات</span>

                          {/* حساب توقيت الفحص القادم للخطوط قيد المراقبة */}
                          {classification.status === 'monitoring' && (() => {
                            const intervalHours = config?.check_interval_hours ? Number(config.check_interval_hours) : 0.5;
                            if (!line.last_checked_at) {
                              return (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-500 font-medium">دورية: كل {intervalHours >= 1 ? `${intervalHours} س` : `${Math.round(intervalHours * 60)} د`}</span>
                                </>
                              );
                            }
                            const lastTime = new Date(line.last_checked_at).getTime();
                            const nextTime = lastTime + intervalHours * 3600 * 1000;
                            const diffMs = nextTime - Date.now();
                            let remainingText = '';
                            if (diffMs <= 0) {
                              remainingText = 'مستحق الفحص الآن';
                            } else {
                              const hrs = Math.floor(diffMs / (3600 * 1000));
                              const mins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
                              if (hrs > 0) {
                                remainingText = `متبقي ${hrs} س و ${mins} د`;
                              } else {
                                remainingText = `متبقي ${mins} دقيقة`;
                              }
                            }

                            return (
                              <>
                                <span>•</span>
                                <span className="font-semibold" style={{ color: L ? '#b45309' : '#f59e0b' }}>
                                  دورية {intervalHours} س ({remainingText})
                                </span>
                              </>
                            );
                          })()}

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
                          className="h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all active:scale-95"
                          style={{
                            background: L ? '#ffffff' : 'rgba(255,255,255,0.06)',
                            borderColor: cardBdr,
                            color: textC,
                          }}
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-500" />
                          تفاصيل
                        </button>

                        <button
                          onClick={() => handleRecheckSingle(line)}
                          disabled={isLineChecking || isBatchChecking}
                          className="h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
                          style={{
                            background: L ? '#ffffff' : 'rgba(255,255,255,0.06)',
                            borderColor: cardBdr,
                            color: textC,
                          }}
                          title="إعادة فحص هذا الرقم فوراً"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 text-[#E60000] ${isLineChecking ? 'animate-spin' : ''}`} />
                          {isLineChecking ? 'جاري...' : 'فحص'}
                        </button>

                        <button
                          onClick={() => handleDeleteLine(line.id, line.phone_number)}
                          className="h-8 w-8 rounded-lg border flex items-center justify-center transition-all hover:bg-rose-500/10 active:scale-95"
                          style={{
                            borderColor: cardBdr,
                            color: mutC,
                          }}
                          title="حذف الرقم من المراقبة"
                        >
                          <Trash2 className="w-3.5 h-3.5 hover:text-rose-500" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── مودال الإضافة المجمعة ── */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" dir="rtl">
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col max-h-[90dvh]"
            style={{ background: cardBg, border: `1px solid ${cardBdr}`, boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)' }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: cardBdr }}>
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#E60000]" />
                <h3 className="text-sm font-black" style={{ color: textC }}>إضافة مجموعة أرقام لا نهائية دفعة واحدة</h3>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto text-xs">
              <p style={{ color: mutC }}>
                انسخ والصق قائمة الأرقام هنا (مفصولة بأسطر جديدة، مسافات، أو فواصل). سيقوم النظام باستخراج وتجهيز كل الأرقام الصحيحة تلقائياً.
              </p>
              <textarea
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                placeholder={'01012345678\n01098765432\n01055554444'}
                rows={8}
                dir="ltr"
                className="w-full p-3 rounded-xl font-mono text-sm outline-none transition-all resize-y"
                style={{
                  background: innerBg,
                  border: `1px solid ${cardBdr}`,
                  color: textC,
                }}
              />
              <div className="flex justify-between items-center text-[11px]" style={{ color: mutC }}>
                <span>الأرقام المستخرجة الصالحة: {extractPhoneNumbers(bulkInput).length} رقم</span>
                <span>تجاهل التكرارات تلقائياً</span>
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-end gap-2" style={{ borderColor: cardBdr }}>
              <button
                onClick={() => setShowBulkModal(false)}
                className="h-9 px-4 rounded-xl font-bold text-xs border"
                style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
              >
                إلغاء
              </button>
              <button
                onClick={handleAddBulk}
                disabled={isAdding || extractPhoneNumbers(bulkInput).length === 0}
                className="h-9 px-5 rounded-xl font-bold text-xs text-white disabled:opacity-50"
                style={{ background: '#E60000' }}
              >
                {isAdding ? 'جاري الإضافة...' : `إضافة (${extractPhoneNumbers(bulkInput).length}) رقم الآن`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال تفاصيل الخط ── */}
      <VipRedLineDetailsModal
        line={selectedLineForDetails}
        isOpen={Boolean(selectedLineForDetails)}
        onClose={() => setSelectedLineForDetails(null)}
        onRecheck={handleRecheckSingle}
        isRechecking={checkingLineId === selectedLineForDetails?.id}
        L={L}
      />
    </div>
  );
}
