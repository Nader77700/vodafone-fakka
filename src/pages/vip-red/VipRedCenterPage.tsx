import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Sparkles,
  RefreshCw,
  Zap,
  WifiOff,
  Calendar,
  Edit3,
  UserCheck,
  X,
  Search,
  Check,
  ChevronLeft,
  Cpu,
  Server,
  Package,
  Sliders,
  Settings,
  Power,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Play,
  BatteryCharging,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
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
  runAutoScanDueLines,
  triggerServerAutoScan,
  getMerchants,
  createMerchant,
  getRegisteredAppUsers,
  updateLineMerchantAndActivation,
  getVipRedProfile,
  saveVipRedProfile,
  getPendingLineClaims,
  saveAndApplyVipRedInterval,
  updateVipRedConfig,
} from '@/lib/vipRedService';
import {
  classifyLineSystem,
  type VipRedLine,
  type VipRedConfig,
  type VipRedMerchant,
  type VipRedActivationDay,
  type VipRedPackageTier,
  VIP_RED_PACKAGES,
  type DuplicateLineDetected,
  type VipRedProfile,
  type VipRedRoleType,
  VALID_ACTIVATION_DAYS,
} from '@/types/vipRed';
import VipRedLineDetailsModal from '@/components/line-info/VipRedLineDetailsModal';
import VipRedUserPortal from './VipRedUserPortal';

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

  // Merchant and Activation Day states
  const [merchants, setMerchants] = useState<VipRedMerchant[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('');
  const [selectedActivationDay, setSelectedActivationDay] = useState<VipRedActivationDay | null>(null);
  const [selectedPackageTier, setSelectedPackageTier] = useState<VipRedPackageTier>('100gb');
  const [bulkMerchantId, setBulkMerchantId] = useState<string>('');
  const [bulkActivationDay, setBulkActivationDay] = useState<VipRedActivationDay | null>(null);
  const [bulkPackageTier, setBulkPackageTier] = useState<VipRedPackageTier>('100gb');

  // Quick Create Merchant modal
  const [showCreateMerchantModal, setShowCreateMerchantModal] = useState(false);
  const [newMerchantName, setNewMerchantName] = useState('');
  const [newMerchantPhone, setNewMerchantPhone] = useState('');
  const [newMerchantUserId, setNewMerchantUserId] = useState('');
  const [newMerchantNotes, setNewMerchantNotes] = useState('');
  const [isCreatingMerchant, setIsCreatingMerchant] = useState(false);
  const [appUsers, setAppUsers] = useState<{ id: string; email: string; name?: string }[]>([]);

  // جلب قائمة مستخدمي التطبيق فقط عند فتح نافذة إنشاء تاجر جديد لتسريع فتح الصفحة
  useEffect(() => {
    if (showCreateMerchantModal && appUsers.length === 0) {
      getRegisteredAppUsers().then(users => setAppUsers(users || [])).catch(() => {});
    }
  }, [showCreateMerchantModal, appUsers.length]);
  const [duplicateAlert, setDuplicateAlert] = useState<DuplicateLineDetected | null>(null);

  // Edit Line Linking Modal
  const [editingLineForLinking, setEditingLineForLinking] = useState<VipRedLine | null>(null);
  const [editMerchantId, setEditMerchantId] = useState<string>('');
  const [editActivationDay, setEditActivationDay] = useState<VipRedActivationDay | null>(null);
  const [isSavingLink, setIsSavingLink] = useState(false);

  // Permission check — فحص شامل ومباشر لصلاحية المالك/الأدمن
  const isAdmin = useMemo(() => {
    return Boolean(
      profile?.role === 'admin' ||
      profile?.role === 'super_admin' ||
      (profile as any)?.is_admin === true ||
      user?.role === 'admin' ||
      (user as any)?.is_admin === true ||
      user?.user_metadata?.role === 'admin' ||
      user?.user_metadata?.role === 'super_admin' ||
      user?.email === 'nader77@miaoda.com'
    );
  }, [user, profile]);

  // Onboarding & User Profile states
  const [vipProfile, setVipProfile] = useState<VipRedProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [onboardingRole, setOnboardingRole] = useState<VipRedRoleType>('user');
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingWhatsapp, setOnboardingWhatsapp] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [pendingClaimsCount, setPendingClaimsCount] = useState(0);

  const hasAccess = useMemo(() => {
    if (isAdmin) return true;
    return canUserAccessVipRed(user, profile, config);
  }, [user, profile, config, isAdmin]);

  // ── الاسترجاع الفوري من الذاكرة المؤقتة لمنع أي تأخير في فتح الصفحة ──
  useEffect(() => {
    try {
      const cachedLines = sessionStorage.getItem(`vf_vip_red_lines_${user?.id || 'admin'}`);
      if (cachedLines) {
        const parsed = JSON.parse(cachedLines);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLines(parsed);
          setIsLoading(false);
        }
      }
      const cachedMerchants = sessionStorage.getItem('vf_vip_red_merchants');
      if (cachedMerchants) {
        const parsedM = JSON.parse(cachedMerchants);
        if (Array.isArray(parsedM)) setMerchants(parsedM);
      }
    } catch {}
  }, [user?.id]);

  // Load initial data in high-speed parallel mode with timeout protection
  const loadData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      setIsLoadingProfile(false);
      return;
    }

    // صمام أمان زمني لمنع تعليق شاشة التحميل أكثر من 1.8 ثانية إطلاقاً حتى مع ضعف الإنترنت
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
      setIsLoadingProfile(false);
    }, 1800);

    try {
      // إطلاق كافة الاستعلامات بالتوازي فوراً
      const tasks: [
        Promise<VipRedConfig | null>,
        Promise<VipRedLine[]>,
        Promise<VipRedMerchant[]>,
        Promise<any>
      ] = [
        getVipRedConfig().catch(() => null),
        getMonitoredLines(user.id, isAdmin).catch(() => []),
        getMerchants().catch(() => []),
        isAdmin ? getPendingLineClaims().catch(() => []) : getVipRedProfile(user.id).catch(() => null),
      ];

      const [cfg, linesData, merchantsData, roleData] = await Promise.all(tasks);

      if (cfg) setConfig(cfg);
      setLines(linesData || []);
      setMerchants(merchantsData || []);

      // حفظ الذاكرة المؤقتة للجلسة لتسريع الفتح القادم
      try {
        sessionStorage.setItem(`vf_vip_red_lines_${user.id || 'admin'}`, JSON.stringify(linesData || []));
        sessionStorage.setItem('vf_vip_red_merchants', JSON.stringify(merchantsData || []));
      } catch {}

      if (!isAdmin && roleData) {
        setVipProfile(roleData);
        setOnboardingName(roleData.full_name || '');
        setOnboardingWhatsapp(roleData.whatsapp_phone || '');
        setOnboardingRole(roleData.role_type || 'user');
      } else if (isAdmin && Array.isArray(roleData)) {
        setPendingClaimsCount(roleData.filter((c: any) => c.status === 'pending').length);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذر تحميل بيانات خطوط وتجار ريد VIP';
      console.warn('Warning loading VIP Red data:', message);
    } finally {
      clearTimeout(safetyTimer);
      setIsLoading(false);
      setIsLoadingProfile(false);
    }
  }, [user, isAdmin]);

  const [nowTime, setNowTime] = useState<number>(Date.now());
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showBatteryGuideModal, setShowBatteryGuideModal] = useState<boolean>(false);
  const autoScanLockRef = useRef<boolean>(false);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 1. ساعة حية لتحديث العداد التنازلي كل ثانية
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. مراقبة حالة الإنترنت
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 3. محرك تحديث حالة الأرقام المستحقة عند تنشيط التطبيق أو عودة النت بهدوء
  const triggerDueAutoScans = useCallback(async () => {
    if (!user || !isOnline || autoScanLockRef.current) return;
    
    // فحص ما إذا كان هناك أرقام مستحقة
    const hasDue = lines.some(l => {
      if (l.system_status !== 'monitoring' && l.system_status !== 'ineligible') return false;
      if (!l.next_check_at) return true;
      return new Date(l.next_check_at).getTime() <= Date.now();
    });

    if (!hasDue) return;

    autoScanLockRef.current = true;
    try {
      // استعلام أحدث حالة من السيرفر بدون وميض أو تكرار
      const freshLines = await getMonitoredLines(user.id, isAdmin);
      if (freshLines && freshLines.length > 0) {
        setLines(freshLines);
      }
    } catch (err) {
      console.warn('[VipRed] Refresh due lines error:', err);
    } finally {
      autoScanLockRef.current = false;
    }
  }, [user, isOnline, lines, isAdmin]);

  // فحص هادئ عند عودة الإنترنت أو فتح التطبيق مجدداً
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerDueAutoScans();
      }
    };
    const handleOnlineResume = () => {
      triggerDueAutoScans();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnlineResume);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnlineResume);
    };
  }, [triggerDueAutoScans]);

  // 4. اشتراك Realtime لحظي في قاعدة البيانات لأي تحديثات خارجية
  useEffect(() => {
    if (!user) return;
    const filter = isAdmin ? undefined : `user_id=eq.${user.id}`;
    const channel = supabase
      .channel('vip_red_lines_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vip_red_monitored_lines',
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newLine = payload.new as VipRedLine;
            setLines(prev => {
              if (prev.some(l => l.id === newLine.id)) return prev;
              return [newLine, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as VipRedLine;
            setLines(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id: string }).id;
            setLines(prev => prev.filter(l => l.id !== oldId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin]);

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
      const result = await addMonitoredLines([
        {
          phone: cleanPhone,
          merchantId: selectedMerchantId || null,
          activationDay: selectedActivationDay || null,
          packageTier: selectedPackageTier,
        }
      ], user.id);

      // 1. كشف الرقم المكرر وعرض التنبيه الواضح
      if (result.duplicates && result.duplicates.length > 0) {
        setDuplicateAlert(result.duplicates[0]);
        toast.warning('هذا الرقم مسجل بالفعل في نظام المراقبة من قبل', { id: 'add-single' });
        return;
      }

      if (result.errors.length > 0 && result.added === 0) {
        toast.error(result.errors[0], { id: 'add-single' });
        return;
      }

      setSinglePhone('');
      toast.success(`تمت إضافة الرقم ${cleanPhone} بنجاح`, { id: 'add-single' });

      // Refresh list and auto-check the added line with prominent UI feedback
      const refreshed = await getMonitoredLines(user.id, isAdmin);
      setLines(refreshed);
      const newlyAdded = refreshed.find(l => l.phone_number === cleanPhone);
      if (newlyAdded) {
        setCheckingLineId(newlyAdded.id);
        try {
          const checkRes = await checkSingleMonitoredLine(newlyAdded, user.id);
          if (checkRes.success && checkRes.line) {
            setLines(prev => prev.map(l => (l.id === checkRes.line!.id ? checkRes.line! : l)));
            if (checkRes.line.system_status === 'converted') {
              setActiveTab('converted');
              toast.success(`🎉 مبروك! تحول الرقم ${cleanPhone} إلى فودافون ريد بنجاح!`, { id: 'add-single' });
            } else if (checkRes.line.system_status === 'ineligible') {
              setActiveTab('ineligible');
              toast.warning(`الرقم ${cleanPhone} غير مؤهل حالياً (نظامه: ${checkRes.line.current_system || 'غير معروف'})`, { id: 'add-single' });
            } else {
              setActiveTab('monitoring');
              toast.info(`الرقم ${cleanPhone} قيد المراقبة المستمرة (14 قرش ريح بالك)`, { id: 'add-single' });
            }
          }
        } finally {
          setCheckingLineId(null);
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
      const inputs = validNumbers.map(phone => ({
        phone,
        merchantId: bulkMerchantId || null,
        activationDay: bulkActivationDay || null,
        packageTier: bulkPackageTier,
      }));

      const res = await addMonitoredLines(inputs, user.id);

      if (res.duplicates && res.duplicates.length > 0) {
        if (res.added === 0 && res.duplicates.length === 1) {
          setDuplicateAlert(res.duplicates[0]);
        } else {
          toast.warning(`تم تخطي ${res.duplicates.length} أرقام مسجلة مسبقاً لمنع التكرار`);
        }
      }

      if (res.added > 0) {
        toast.success(`تمت إضافة ${res.added} رقم بنجاح!`, { id: 'add-bulk' });
        setShowBulkModal(false);
        setBulkText('');
        await loadData();
      } else if (!res.duplicates || res.duplicates.length === 0) {
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

  // إنشاء تاجر جديد سريعاً
  const handleCreateMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newMerchantName.trim()) {
      toast.error('يرجى إدخال اسم التاجر');
      return;
    }

    setIsCreatingMerchant(true);
    try {
      const res = await createMerchant(
        {
          name: newMerchantName.trim(),
          phone: newMerchantPhone.trim() || undefined,
          user_id: newMerchantUserId || null,
          notes: newMerchantNotes.trim() || undefined,
        },
        user.id
      );

      if (!res.success || !res.merchant) {
        toast.error(res.error || 'تعذر إنشاء التاجر');
        return;
      }

      toast.success(`تم إنشاء التاجر "${res.merchant.name}" بنجاح!`);
      const updatedMerchants = await getMerchants();
      setMerchants(updatedMerchants);
      // التحديد التلقائي للتاجر المنشأ
      setSelectedMerchantId(res.merchant.id);
      if (showBulkModal) {
        setBulkMerchantId(res.merchant.id);
      }
      setShowCreateMerchantModal(false);
      setNewMerchantName('');
      setNewMerchantPhone('');
      setNewMerchantUserId('');
      setNewMerchantNotes('');
    } catch {
      toast.error('حدث خطأ أثناء إنشاء التاجر');
    } finally {
      setIsCreatingMerchant(false);
    }
  };

  // حفظ تعديل التاجر وموعد التفعيل لرقم مسجل مسبقاً
  const handleSaveLineLink = async () => {
    if (!editingLineForLinking) return;
    setIsSavingLink(true);
    try {
      const res = await updateLineMerchantAndActivation(
        editingLineForLinking.id,
        editMerchantId || null,
        editActivationDay || null
      );

      if (!res.success || !res.line) {
        toast.error(res.error || 'فشل تحديث بيانات الربط');
        return;
      }

      toast.success('تم تحديث بيانات التاجر وموعد التفعيل بنجاح');
      setLines(prev => prev.map(l => l.id === res.line!.id ? res.line! : l));
      setEditingLineForLinking(null);
    } catch {
      toast.error('تعذر حفظ بيانات الربط');
    } finally {
      setIsSavingLink(false);
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

  // حالة فحص الخادم السحابي اليدوي
  const [isTriggeringServerScan, setIsTriggeringServerScan] = useState(false);
  const [showIntervalModal, setShowIntervalModal] = useState(false);
  const [customHours, setCustomHours] = useState('2');
  const [customMinutes, setCustomMinutes] = useState('0');
  const [isSavingInterval, setIsSavingInterval] = useState(false);
  const [resetCycleOnSave, setResetCycleOnSave] = useState(false);
  const [isTogglingGlobalScan, setIsTogglingGlobalScan] = useState(false);

  const handleTriggerServerScan = async () => {
    setIsTriggeringServerScan(true);
    try {
      const res = await triggerServerAutoScan();
      if (res.success) {
        toast.success(res.message || 'تم تشغيل دورة الفحص بالسيرفر بنجاح!');
        // تحديث البيانات بعد الفحص
        await loadData();
      } else {
        toast.error(`تعذر تشغيل الفحص بالسيرفر: ${res.message}`);
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء تشغيل فحص الخادم');
    } finally {
      setIsTriggeringServerScan(false);
    }
  };

  // Categorized lines
  const monitoringLines = useMemo(() => lines.filter(l => l.system_status === 'monitoring'), [lines]);
  
  // الخطوط المحولة مرتبة بالأحدث تحويلاً أولاً مع دعم تاريخ التحويل
  const convertedLines = useMemo(() => {
    return lines
      .filter(l => l.system_status === 'converted')
      .sort((a, b) => {
        const timeA = a.converted_at ? new Date(a.converted_at).getTime() : (a.updated_at ? new Date(a.updated_at).getTime() : 0);
        const timeB = b.converted_at ? new Date(b.converted_at).getTime() : (b.updated_at ? new Date(b.updated_at).getTime() : 0);
        return timeB - timeA; // الأحدث تحويلاً في المقدمة
      });
  }, [lines]);

  // فلاتر تبويب الأرقام المحولة
  const [convertedSearch, setConvertedSearch] = useState('');
  const [convertedDayFilter, setConvertedDayFilter] = useState<'all' | '7' | '11' | '25'>('all');
  const [convertedMerchantFilter, setConvertedMerchantFilter] = useState<string>('all');

  const filteredConvertedLines = useMemo(() => {
    return convertedLines.filter(line => {
      if (convertedDayFilter !== 'all' && String(line.activation_day) !== convertedDayFilter) {
        return false;
      }
      if (convertedMerchantFilter !== 'all') {
        if (convertedMerchantFilter === 'unassigned') {
          if (line.merchant_id) return false;
        } else if (line.merchant_id !== convertedMerchantFilter) {
          return false;
        }
      }
      if (convertedSearch.trim()) {
        const q = convertedSearch.trim().toLowerCase();
        const matchPhone = line.phone_number.includes(q);
        const matchCustomer = line.customer_name?.toLowerCase().includes(q);
        const matchMerchant = line.merchant?.name?.toLowerCase().includes(q);
        if (!matchPhone && !matchCustomer && !matchMerchant) return false;
      }
      return true;
    });
  }, [convertedLines, convertedDayFilter, convertedMerchantFilter, convertedSearch]);

  const ineligibleLines = useMemo(() => lines.filter(l => l.system_status === 'ineligible'), [lines]);

  const displayedLines = useMemo(() => {
    switch (activeTab) {
      case 'converted':
        return filteredConvertedLines;
      case 'ineligible':
        return ineligibleLines;
      case 'monitoring':
      default:
        return monitoringLines;
    }
  }, [activeTab, filteredConvertedLines, ineligibleLines, monitoringLines]);

  // Design Tokens
  const pageBg = L ? '#f8fafc' : '#0B0B14';
  const cardBg = L ? '#ffffff' : '#12121f';
  const innerBg = L ? '#f1f5f9' : 'rgba(255,255,255,0.04)';
  const cardBdr = L ? '#e2e8f0' : 'rgba(255,255,255,0.08)';
  const textC = L ? '#0f172a' : '#f8fafc';
  const mutC = L ? '#64748b' : '#94a3b8';

  // Loading State
  if (isLoading && lines.length === 0 && !config) {
    return (
      <div className="min-h-screen p-4 flex flex-col items-center justify-center" style={{ background: pageBg, direction: 'rtl' }}>
        <div className="flex flex-col items-center gap-3.5 p-6 rounded-3xl border shadow-xl max-w-xs w-full text-center" style={{ background: cardBg, borderColor: cardBdr }}>
          <div className="w-9 h-9 rounded-full border-3 border-[#E60000] border-t-transparent animate-spin" />
          <div className="space-y-1">
            <h3 className="text-sm font-black" style={{ color: textC }}>قسم فودافون ريد بيزنس VIP</h3>
            <p className="text-xs" style={{ color: mutC }}>جاري فتح القسم وتحميل البيانات بأعلى سرعة...</p>
          </div>
          <div className="flex items-center gap-2 pt-1 w-full">
            <button
              type="button"
              onClick={() => setIsLoading(false)}
              className="flex-1 py-1.5 px-3 rounded-xl text-xs font-bold bg-red-600/10 text-red-600 hover:bg-red-600/20 transition-all border border-red-600/20"
            >
              دخول مباشر
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="py-1.5 px-3 rounded-xl text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-all border"
              style={{ color: mutC, borderColor: cardBdr }}
            >
              الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── في حال كان المستخدم ليس مديراً (مستخدم عادي أو تاجر) ──
  if (!user) return null;
  if (!isAdmin) {
    // 1. إذا لم يكن لديه ملف تعريفي بعد، نعرض شاشة التسجيل الإلزامية
    if (!vipProfile) {
      return (
        <div className="min-h-screen p-4 flex items-center justify-center" style={{ background: pageBg, direction: 'rtl' }}>
          <div
            className="max-w-md w-full p-5 sm:p-6 rounded-3xl border shadow-2xl space-y-4"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: cardBdr }}>
              <div className="w-12 h-12 rounded-2xl bg-[#E60000]/15 text-[#E60000] flex items-center justify-center shrink-0 border border-[#E60000]/30 shadow-xs">
                <Crown className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black" style={{ color: textC }}>
                  التسجيل في قسم ريد بيزنس VIP
                </h2>
                <p className="text-xs" style={{ color: mutC }}>
                  يرجى تحديد نوع حسابك واستكمال بيانات التواصل مع الإدارة:
                </p>
              </div>
            </div>

            {/* تحديد نوع الحساب (تاجر أم مستخدم) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold block" style={{ color: textC }}>
                هل أنت مستخدم أم تاجر؟
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOnboardingRole('merchant')}
                  className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                    onboardingRole === 'merchant'
                      ? 'bg-amber-500/15 border-amber-500/50 shadow-xs'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                  style={{
                    background: onboardingRole === 'merchant' ? undefined : innerBg,
                    borderColor: onboardingRole === 'merchant' ? undefined : cardBdr,
                  }}
                >
                  <Crown className={`w-5 h-5 mb-2 ${onboardingRole === 'merchant' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <div>
                    <h4 className="text-xs font-black" style={{ color: onboardingRole === 'merchant' ? '#d97706' : textC }}>
                      أنا تاجر VIP
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      أدير مجموعة خطوط لعملائي
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOnboardingRole('user')}
                  className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                    onboardingRole === 'user'
                      ? 'bg-blue-500/15 border-blue-500/50 shadow-xs'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                  style={{
                    background: onboardingRole === 'user' ? undefined : innerBg,
                    borderColor: onboardingRole === 'user' ? undefined : cardBdr,
                  }}
                >
                  <UserCheck className={`w-5 h-5 mb-2 ${onboardingRole === 'user' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                  <div>
                    <h4 className="text-xs font-black" style={{ color: onboardingRole === 'user' ? '#2563eb' : textC }}>
                      أنا مستخدم VIP
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      أتابع خطوطي الشخصية
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* حقل الاسم واللقب */}
            <div className="space-y-1">
              <label className="text-xs font-bold block" style={{ color: textC }}>
                {onboardingRole === 'merchant' ? 'اسم التاجر واللقب *' : 'اسم المستخدم واللقب *'}
              </label>
              <input
                type="text"
                placeholder={onboardingRole === 'merchant' ? 'مثال: أحمد عبد الله (تاجر)' : 'مثال: محمد علي'}
                value={onboardingName}
                onChange={e => setOnboardingName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#E60000]"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              />
            </div>

            {/* حقل رقم الواتساب */}
            <div className="space-y-1">
              <label className="text-xs font-bold block" style={{ color: textC }}>
                رقم هاتف عليه واتساب للتواصل مع الإدارة *
              </label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                <input
                  type="tel"
                  placeholder="01012345678"
                  value={onboardingWhatsapp}
                  onChange={e => setOnboardingWhatsapp(e.target.value)}
                  className="w-full h-10 pr-9 pl-3 rounded-xl border text-xs font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[#E60000]"
                  style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                  dir="ltr"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                سيتم استخدام هذا الرقم لإرسال إشعارات التجديد والفواتير وموافقة الإدارة على أرقامك.
              </p>
            </div>

            {/* أزرار الإجراءات */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t" style={{ borderColor: cardBdr }}>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="h-10 px-3 rounded-xl border text-xs font-bold transition flex items-center gap-1.5"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>الرئيسية</span>
              </button>

              <button
                type="button"
                disabled={isSavingProfile || !onboardingName.trim() || onboardingWhatsapp.trim().length < 10}
                onClick={async () => {
                  if (!user) return;
                  setIsSavingProfile(true);
                  try {
                    const res = await saveVipRedProfile({
                      userId: user.id,
                      roleType: onboardingRole,
                      fullName: onboardingName,
                      whatsappPhone: onboardingWhatsapp,
                    });
                    if (res.success && res.profile) {
                      toast.success('تم تسجيل ملفك التعريفي بنجاح! مرحباً بك.');
                      setVipProfile(res.profile);
                      await loadData();
                    } else {
                      toast.error(res.error || 'تعذر حفظ البيانات');
                    }
                  } catch {
                    toast.error('حدث خطأ أثناء حفظ الملف');
                  } finally {
                    setIsSavingProfile(false);
                  }
                }}
                className="h-10 px-5 rounded-xl bg-[#E60000] hover:bg-[#c50000] text-white text-xs font-black shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isSavingProfile ? 'جاري الحفظ...' : 'حفظ ومتابعة الدخول'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 2. إذا كان المستخدم لديه ملف تعريفي، نعرض له بوابته المستقلة
    return (
      <div className="min-h-screen pb-16 transition-colors duration-200" style={{ background: pageBg, direction: 'rtl' }}>
        <header
          className="sticky top-14 lg:top-0 z-20 px-3 sm:px-4 py-2.5 border-b backdrop-blur-md transition-colors"
          style={{
            background: L ? 'rgba(255, 255, 255, 0.95)' : 'rgba(11, 11, 20, 0.95)',
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
                    بوابة فودافون ريد VIP
                  </h1>
                </div>
                <p className="text-[10px] truncate" style={{ color: mutC }}>
                  متابعة أرقامك المعتمدة، الفحص اليدوي، إرسال باسورد أنا فودافون، والفاتورة الشهرية
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto p-3 sm:p-4">
          <VipRedUserPortal
            user={user}
            profile={vipProfile}
            onRefreshProfile={loadData}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 transition-colors duration-300" style={{ background: pageBg }}>
      {/* ── رأس الصفحة (Header) للمالك (Admin) ── */}
      {/* ── شريط الرأس المثبت المضغوط للغاية بدون أي تداخل (Ultra-Compact Sticky Header) ── */}
      <header
        className="sticky top-14 lg:top-0 z-20 px-2 sm:px-3 py-1.5 border-b backdrop-blur-md shadow-xs transition-colors"
        style={{
          background: L ? 'rgba(255, 255, 255, 0.95)' : 'rgba(11, 11, 20, 0.95)',
          borderColor: cardBdr,
        }}
      >
        <div className="max-w-3xl mx-auto space-y-1.5">
          {/* السطر الأول: زر الرجوع + اسم القسم والشارة + زر التحديث */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                onClick={() => navigate('/')}
                className="w-7 h-7 rounded-lg border flex items-center justify-center transition-all active:scale-95 shrink-0"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                title="العودة للرئيسية"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-5 h-5 rounded-md bg-[#E60000] flex items-center justify-center text-white shrink-0">
                  <Crown className="w-3 h-3" />
                </span>
                <h1 className="text-xs sm:text-sm font-black truncate" style={{ color: textC }}>
                  فودافون ريد VIP
                </h1>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#E60000]/15 text-[#E60000] border border-[#E60000]/30 shrink-0">
                  Business
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowBatteryGuideModal(true)}
                className="h-6.5 px-2 rounded-md border text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
                title="إرشادات إشعارات الخلفية وصلاحيات البطارية"
              >
                <BatteryCharging className="w-3 h-3 text-emerald-500" />
                <span className="hidden sm:inline">إشعارات الخلفية</span>
                <span className="sm:hidden">الخلفية</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const currentHours = config?.check_interval_hours || 2;
                  const wholeHrs = Math.floor(currentHours);
                  const remMins = Math.round((currentHours - wholeHrs) * 60);
                  setCustomHours(String(wholeHrs));
                  setCustomMinutes(String(remMins));
                  setShowIntervalModal(true);
                }}
                className="h-6.5 px-2 rounded-md border text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 text-[#E60000] bg-[#E60000]/10 border-[#E60000]/30 hover:bg-[#E60000]/20"
                title="لوحة تحكم وإعدادات قسم ريد VIP ودورية الفحص"
              >
                <Sliders className="w-3 h-3 text-[#E60000]" />
                <span>لوحة التحكم</span>
              </button>

              <button
                onClick={loadData}
                disabled={isLoading}
                className="h-6.5 px-2 rounded-md border text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 shrink-0"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                title="تحديث البيانات"
              >
                <RefreshCw className={`w-3 h-3 text-blue-500 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">تحديث</span>
              </button>
            </div>
          </div>

          {/* السطر الثاني: أزرار التبويبات الثلاثة المثبتة بحجم مضغوط ومتناسق بدون أي تراكب */}
          <div className="grid grid-cols-3 gap-1 pt-0.5">
            <button
              onClick={() => navigate('/vip-red/renewals')}
              className="h-6.5 px-1 rounded-md border text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
              title="التجديد القادم وسداد خطوط ريد (7، 11، 25)"
            >
              <Calendar className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="truncate">التجديد ({convertedLines.length})</span>
            </button>

            <button
              onClick={() => navigate('/vip-red/merchants')}
              className="h-6.5 px-1 rounded-md border text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30"
              title="إدارة التجار ومواعيد التفعيل (7، 11، 25)"
            >
              <Crown className="w-3 h-3 shrink-0" />
              <span className="truncate">التجار ({merchants.length})</span>
            </button>

            <button
              onClick={() => navigate('/vip-red/requests')}
              className={`h-6.5 px-1 rounded-md border text-[10px] sm:text-[11px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 ${
                pendingClaimsCount > 0
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40 animate-pulse'
                  : 'bg-muted/30 text-muted-foreground border-transparent'
              }`}
              title="طلبات ربط الأرقام الجديدة"
            >
              <ShieldAlert className="w-3 h-3 text-rose-500 shrink-0" />
              <span className="truncate">الطلبات ({pendingClaimsCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── المحتوى الرئيسي ── */}
      <main className="max-w-3xl mx-auto p-2 sm:p-2.5 space-y-1.5 sm:space-y-2 pb-32">
        {/* ── كارت الإدخال والإضافة المدمج (Ultra-compact Add Bar) ── */}
        <div
          className="p-2 sm:p-2.5 rounded-xl border space-y-1.5 shadow-xs"
          style={{ background: cardBg, borderColor: cardBdr }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-black flex items-center gap-1.5" style={{ color: textC }}>
              <Plus className="w-3.5 h-3.5 text-[#E60000]" />
              إضافة أرقام للمراقبة المستمرة
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 font-bold" style={{ color: mutC }}>
              الإجمالي: {lines.length} خط
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-1.5">
            <div className="flex-1 relative">
              <Phone className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: mutC }} />
              <input
                type="tel"
                inputMode="numeric"
                value={singlePhone}
                onChange={e => setSinglePhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSingle()}
                placeholder="أدخل رقم فودافون (01xxxxxxxxx)"
                maxLength={11}
                disabled={isAdding}
                className="w-full h-8 rounded-lg pr-8 pl-2.5 text-xs font-bold outline-none transition-all"
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
                className="h-8 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 text-white shadow-xs"
                style={{ background: '#E60000' }}
              >
                <Zap className="w-3 h-3" />
                {isAdding ? 'جاري الفحص...' : 'إضافة وفحص'}
              </button>

              <button
                onClick={() => setShowBulkModal(true)}
                className="h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95"
                style={{
                  background: innerBg,
                  borderColor: cardBdr,
                  color: textC,
                }}
                title="إضافة أرقام متعددة دفعة واحدة"
              >
                <Layers className="w-3 h-3 text-blue-500" />
                <span className="hidden sm:inline">إضافة مجمعة</span>
                <span className="sm:hidden">مجمعة</span>
              </button>
            </div>
          </div>

          {/* خيارات التاجر وموعد التفعيل للإضافة */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5 pt-1.5 border-t" style={{ borderColor: cardBdr }}>
            {/* اختيار التاجر */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Crown className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="text-[10px] font-bold shrink-0" style={{ color: mutC }}>التاجر:</span>
              <select
                value={selectedMerchantId}
                onChange={e => setSelectedMerchantId(e.target.value)}
                className="flex-1 h-7 px-2 rounded-md text-[11px] font-bold outline-none border transition-all cursor-pointer truncate max-w-[180px]"
                style={{
                  background: innerBg,
                  borderColor: cardBdr,
                  color: textC,
                }}
              >
                <option value="">بدون تاجر (اختياري)</option>
                {merchants.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.phone ? `(${m.phone})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowCreateMerchantModal(true)}
                className="h-7 px-1.5 rounded-md border text-[10px] font-bold flex items-center gap-1 shrink-0 transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 text-amber-600 dark:text-amber-400"
                style={{ background: innerBg, borderColor: cardBdr }}
                title="إضافة تاجر جديد"
              >
                <Plus className="w-3 h-3 text-[#E60000]" />
                <span className="hidden sm:inline">تاجر جديد</span>
              </button>
            </div>

            {/* موعد التفعيل */}
            <div className="flex items-center gap-1 shrink-0">
              <Calendar className="w-3 h-3 text-purple-500 shrink-0" />
              <span className="text-[10px] font-bold shrink-0" style={{ color: mutC }}>موعد التفعيل:</span>
              <div className="flex items-center gap-1">
                {VALID_ACTIVATION_DAYS.map(day => {
                  const isSelected = selectedActivationDay === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedActivationDay(isSelected ? null : day)}
                      className="h-7 px-2 rounded-md border text-[10px] font-black transition-all active:scale-95"
                      style={{
                        background: isSelected
                          ? (L ? '#7e22ce' : '#9333ea')
                          : innerBg,
                        color: isSelected ? '#ffffff' : textC,
                        borderColor: isSelected
                          ? (L ? '#6b21a8' : '#a855f7')
                          : cardBdr,
                      }}
                    >
                      يوم {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* سطر اختيار باقة الخط والجيجات (100 جيجا / 150 جيجا / 200 جيجا) المطلوب صراحة */}
          <div className="flex items-center justify-between gap-1 pt-1.5 border-t text-[10px]" style={{ borderColor: cardBdr }}>
            <div className="flex items-center gap-1 shrink-0">
              <Package className="w-3 h-3 text-[#E60000] shrink-0" />
              <span className="font-bold" style={{ color: mutC }}>باقة الخط:</span>
            </div>
            <div className="flex items-center gap-1">
              {(['100gb', '150gb', '200gb'] as const).map(tier => {
                const pkg = VIP_RED_PACKAGES[tier];
                const isSelected = selectedPackageTier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setSelectedPackageTier(tier)}
                    className="h-6.5 px-2 rounded-md border text-[10px] font-bold transition-all active:scale-95 flex items-center gap-1"
                    style={{
                      background: isSelected ? '#E60000' : innerBg,
                      color: isSelected ? '#ffffff' : textC,
                      borderColor: isSelected ? '#E60000' : cardBdr,
                    }}
                    title={`${pkg.gigabytes} جيجا + ${pkg.minutes.toLocaleString()} دقيقة بسعر ${pkg.price} ج.م`}
                  >
                    <span>{pkg.gigabytes} جيجا</span>
                    <span className="opacity-75 text-[9px]">({pkg.price}ج)</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>



        {/* ── شريط التبويبات المدمج السريع (Stat Pills) ── */}
        <div className="grid grid-cols-3 gap-1.5">
          {/* تبويب قيد المراقبة */}
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`p-1.5 sm:p-2 rounded-xl border text-right transition-all flex flex-col justify-between ${
              activeTab === 'monitoring' ? 'ring-2 ring-blue-500/50 shadow-xs' : ''
            }`}
            style={{
              background: activeTab === 'monitoring' ? (L ? '#eff6ff' : 'rgba(59, 130, 246, 0.14)') : cardBg,
              borderColor: activeTab === 'monitoring' ? '#3b82f6' : cardBdr,
            }}
          >
            <div className="flex items-center justify-between">
              <Clock className="w-3 h-3 text-blue-500" />
              <span className="font-mono text-xs sm:text-sm font-black text-blue-500">{monitoringLines.length}</span>
            </div>
            <div className="mt-0.5">
              <p className="text-[10px] sm:text-[11px] font-black" style={{ color: textC }}>قيد المراقبة</p>
              <p className="text-[8px] sm:text-[9px]" style={{ color: mutC }}>14 قرش ريح بالك</p>
            </div>
          </button>

          {/* تبويب تم التحويل */}
          <button
            onClick={() => setActiveTab('converted')}
            className={`p-1.5 sm:p-2 rounded-xl border text-right transition-all flex flex-col justify-between ${
              activeTab === 'converted' ? 'ring-2 ring-emerald-500/50 shadow-xs' : ''
            }`}
            style={{
              background: activeTab === 'converted' ? (L ? '#f0fdf4' : 'rgba(16, 185, 129, 0.14)') : cardBg,
              borderColor: activeTab === 'converted' ? '#10b981' : cardBdr,
            }}
          >
            <div className="flex items-center justify-between">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span className="font-mono text-xs sm:text-sm font-black text-emerald-500">{convertedLines.length}</span>
            </div>
            <div className="mt-0.5">
              <p className="text-[10px] sm:text-[11px] font-black" style={{ color: textC }}>تم التحويل</p>
              <p className="text-[8px] sm:text-[9px]" style={{ color: mutC }}>جاهز للتفعيل</p>
            </div>
          </button>

          {/* تبويب غير مؤهل */}
          <button
            onClick={() => setActiveTab('ineligible')}
            className={`p-1.5 sm:p-2 rounded-xl border text-right transition-all flex flex-col justify-between ${
              activeTab === 'ineligible' ? 'ring-2 ring-rose-500/50 shadow-xs' : ''
            }`}
            style={{
              background: activeTab === 'ineligible' ? (L ? '#fef2f2' : 'rgba(239, 68, 68, 0.14)') : cardBg,
              borderColor: activeTab === 'ineligible' ? '#ef4444' : cardBdr,
            }}
          >
            <div className="flex items-center justify-between">
              <AlertTriangle className="w-3 h-3 text-rose-500" />
              <span className="font-mono text-xs sm:text-sm font-black text-rose-500">{ineligibleLines.length}</span>
            </div>
            <div className="mt-0.5">
              <p className="text-[10px] sm:text-[11px] font-black" style={{ color: textC }}>غير مؤهل</p>
              <p className="text-[8px] sm:text-[9px]" style={{ color: mutC }}>يلزم 14 قرش أولاً</p>
            </div>
          </button>
        </div>

        {/* ── شريط التحكم التلقائي والفحص الجماعي فائق الانكماش مع إمكانية التحديد اليدوي ── */}
        <div
          className="p-1.5 rounded-lg border flex flex-col sm:flex-row items-center justify-between gap-1 shadow-xs"
          style={{ background: cardBg, borderColor: cardBdr }}
        >
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-bold truncate" style={{ color: textC }}>
                  دورية الفحص: {config?.check_interval_hours ? (
                    config.check_interval_hours >= 1 
                      ? `كل ${config.check_interval_hours} س` 
                      : `كل ${Math.round(config.check_interval_hours * 60)} د`
                  ) : 'كل 2 ساعة'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const currentHours = config?.check_interval_hours || 2;
                    const wholeHrs = Math.floor(currentHours);
                    const remMins = Math.round((currentHours - wholeHrs) * 60);
                    setCustomHours(String(wholeHrs));
                    setCustomMinutes(String(remMins));
                    setShowIntervalModal(true);
                  }}
                  className="px-1.5 py-0.2 rounded text-[9px] font-bold text-blue-600 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition shrink-0 flex items-center gap-0.5"
                  title="لوحة تحكم وتعديل دورية الفحص يدوياً بالساعات والدقائق"
                >
                  <Sliders className="w-2.5 h-2.5" />
                  <span>لوحة التحكم</span>
                </button>
              </div>
            </div>

            <button
              onClick={handleBatchCheckAll}
              disabled={isBatchChecking || monitoringLines.length === 0}
              className="h-6.5 px-2 rounded-md font-bold text-[10px] sm:text-[11px] flex items-center justify-center gap-1 border transition-all active:scale-95 disabled:opacity-50 shrink-0"
              style={{
                background: innerBg,
                borderColor: cardBdr,
                color: textC,
              }}
            >
              <RotateCcw className={`w-3 h-3 text-[#E60000] ${isBatchChecking ? 'animate-spin' : ''}`} />
              <span className="truncate">
                {isBatchChecking ? `(${batchProgress?.current}/${batchProgress?.total})` : 'فحص الكل الآن'}
              </span>
            </button>
          </div>
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

        {/* شريط البحث والفلترة الخاص بتبويب تم التحويل */}
        {activeTab === 'converted' && (
          <div
            className="p-3 rounded-2xl border space-y-2.5 shadow-xs"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="relative w-full sm:flex-1">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={convertedSearch}
                  onChange={(e) => setConvertedSearch(e.target.value)}
                  placeholder="ابحث برقم الهاتف أو اسم العميل أو التاجر..."
                  className="w-full h-8 pr-8 pl-3 rounded-lg border text-xs bg-transparent"
                  style={{ borderColor: cardBdr, color: textC }}
                />
              </div>

              {/* أزرار دورة التجديد 7 / 11 / 25 */}
              <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto pb-0.5">
                <span className="text-[10px] font-bold shrink-0" style={{ color: mutC }}>الموعد:</span>
                {(['all', '7', '11', '25'] as const).map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setConvertedDayFilter(day)}
                    className={`h-7 px-2.5 rounded-md border text-[11px] font-bold transition shrink-0 ${
                      convertedDayFilter === day
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'hover:bg-muted border-border'
                    }`}
                  >
                    {day === 'all' ? 'الكل' : `يوم ${day}`}
                  </button>
                ))}
              </div>

              {/* قائمة اختيار التاجر */}
              <select
                value={convertedMerchantFilter}
                onChange={(e) => setConvertedMerchantFilter(e.target.value)}
                className="h-7 px-2 rounded-md border text-[11px] font-bold bg-transparent shrink-0"
                style={{ borderColor: cardBdr, color: textC }}
              >
                <option value="all">جميع التجار والخطوط</option>
                <option value="unassigned">أرقام مستقلة (بدون تاجر)</option>
                {merchants.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1.5 border-t" style={{ borderColor: cardBdr }}>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>مرتبة بالأحدث تحويلاً أولاً ({filteredConvertedLines.length} خط جاهز للتفعيل)</span>
              </span>
              {convertedSearch && (
                <button
                  type="button"
                  onClick={() => setConvertedSearch('')}
                  className="text-xs text-rose-500 hover:underline font-bold"
                >
                  مسح البحث
                </button>
              )}
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
              const intervalHours = config?.check_interval_hours ? Number(config.check_interval_hours) : 0.5;

              // Calculate countdown with real-time accuracy and offline awareness
              let countdownLabel = '';
              const targetTime = line.next_check_at
                ? new Date(line.next_check_at).getTime()
                : (line.last_checked_at ? new Date(line.last_checked_at).getTime() + intervalHours * 3600 * 1000 : nowTime);
              const diffMs = targetTime - nowTime;

              if (isLineChecking) {
                countdownLabel = 'جاري الفحص الآن...';
              } else if (classification.status === 'monitoring') {
                if (!line.last_checked_at) {
                  countdownLabel = 'بانتظار الفحص الأولي';
                } else if (diffMs <= 0) {
                  if (!isOnline) {
                    countdownLabel = 'بانتظار الإنترنت';
                  } else {
                    countdownLabel = 'مستحق الفحص (سيرفر)';
                  }
                } else {
                  const hrs = Math.floor(diffMs / 3600000);
                  const mins = Math.floor((diffMs % 3600000) / 60000);
                  const secs = Math.floor((diffMs % 60000) / 1000);
                  if (hrs > 0) {
                    countdownLabel = `القادم بعد ${hrs} س و ${mins} د`;
                  } else if (mins > 0) {
                    countdownLabel = `القادم بعد ${mins} د و ${secs} ث`;
                  } else {
                    countdownLabel = `القادم بعد ${secs} ث`;
                  }
                }
              } else if (classification.status === 'ineligible' && line.next_check_at) {
                if (diffMs <= 0) {
                  countdownLabel = 'مستحق إعادة الفحص';
                } else {
                  const mins = Math.floor(diffMs / 60000);
                  countdownLabel = `إعادة الفحص بعد ${mins} د`;
                }
              }

              return (
                <div
                  key={line.id}
                  className={`p-1.5 rounded-lg border transition-all shadow-xs relative overflow-hidden ${
                    isLineChecking ? 'ring-2 ring-amber-500/60 animate-pulse border-amber-500' : ''
                  }`}
                  style={{
                    background: isLineChecking ? (L ? '#fffbeb' : 'rgba(245, 158, 11, 0.08)') : cardBg,
                    borderColor: isLineChecking
                      ? '#f59e0b'
                      : classification.status === 'converted'
                      ? (L ? '#10b981' : 'rgba(16, 185, 129, 0.45)')
                      : classification.status === 'ineligible'
                      ? (L ? '#fca5a5' : 'rgba(239, 68, 68, 0.3)')
                      : cardBdr,
                  }}
                >
                  {/* شريط حالة الفحص النشط الصريح */}
                  {isLineChecking && (
                    <div className="flex items-center justify-between px-2 py-1 mb-1.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                        <span>جاري فحص نظام الرقم والتحقق مع فودافون الآن...</span>
                      </span>
                      <span className="text-[9px] opacity-80">لحظات</span>
                    </div>
                  )}

                  {/* الشريط المدمج السطر 1: الرقم + الشارة + الباقة + زر النسخ */}
                  <div className="flex items-center justify-between gap-1 pb-1 border-b border-border/40">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs sm:text-sm font-black tracking-wide" style={{ color: textC }} dir="ltr">
                        {line.phone_number}
                      </span>
                      {line.customer_name && (
                        <span className="text-[10px] font-bold px-1 py-0.2 rounded bg-muted text-foreground truncate max-w-[80px]">
                          {line.customer_name}
                        </span>
                      )}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(line.phone_number);
                          toast.success(`تم نسخ الرقم ${line.phone_number}`);
                        }}
                        className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition"
                        title="نسخ الرقم"
                      >
                        <Copy className="w-3 h-3" />
                      </button>

                      {/* شارة باقة الجيجات المختارة */}
                      {line.package_tier && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 shrink-0">
                          {line.package_tier}G
                        </span>
                      )}

                      {/* شارة نظام الخط: نظام الخط الفعلي (ريد / 14 قرش / فليكس / غير مؤهل / جديد) دون تكرار عبارات الفحص */}
                      {classification.status === 'converted' ? (
                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                          ريد
                        </span>
                      ) : !line.last_checked_at ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-muted/40 text-muted-foreground border border-muted shrink-0">
                          جديد
                        </span>
                      ) : classification.status === 'monitoring' ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                          {classification.shortSystemName || '14 قرش'}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                          غير مؤهل
                        </span>
                      )}
                    </div>

                    {/* شارة حالة الخط المضغوطة */}
                    <div className="flex items-center gap-1 shrink-0">
                      {classification.status === 'converted' ? (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.2 rounded-full bg-emerald-500 text-white shadow-xs">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>تم التحويل</span>
                        </span>
                      ) : classification.status === 'monitoring' ? (
                        <span
                          className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full border"
                          style={{
                            background: L ? '#fef3c7' : 'rgba(245, 158, 11, 0.15)',
                            color: L ? '#92400e' : '#fbbf24',
                            borderColor: L ? '#fde68a' : 'rgba(245, 158, 11, 0.35)',
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                          <span className="truncate max-w-[90px]">{countdownLabel}</span>
                        </span>
                      ) : (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.2 rounded-full border truncate"
                          style={{
                            background: classification.badgeBg,
                            color: classification.badgeText,
                            borderColor: classification.badgeBorder,
                          }}
                        >
                          {classification.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* السطر 2: بيانات التاجر والموعد والرصيد والإجراءات فائقة الانكماش */}
                  <div className="flex items-center justify-between gap-1 pt-1 text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0 truncate" style={{ color: mutC }}>
                      {/* موعد التفعيل */}
                      <span className="px-1 py-0.2 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-bold shrink-0">
                        {line.activation_day ? `يوم ${line.activation_day}` : 'بدون موعد'}
                      </span>

                      {/* التاجر */}
                      <span className="truncate max-w-[100px] text-[10px]" title={line.merchant?.name || 'بدون تاجر'}>
                        {line.merchant ? line.merchant.name : 'بدون تاجر'}
                      </span>

                      {/* الرصيد */}
                      {line.last_line_info?.balance && (
                        <span className="text-emerald-500 font-bold shrink-0">
                          {line.last_line_info.balance}
                        </span>
                      )}

                      {/* عدد مرات الفحص */}
                      <span className="text-[9px] shrink-0 text-muted-foreground">
                        ({line.check_count || 0}x)
                      </span>
                    </div>

                    {/* أزرار الإجراءات المدمجة بارتفاع h-6 */}
                    <div className="flex items-center gap-1 shrink-0">
                      {classification.status === 'converted' && (
                        <button
                          onClick={() => navigate('/vip-red/renewals')}
                          className="h-5.5 px-1.5 rounded text-[9px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-0.5 active:scale-95 transition"
                          title="جدول التجديد والسداد"
                        >
                          <span>سداد</span>
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedLineForDetails(line)}
                        className="h-5.5 px-1.5 rounded border text-[9px] font-bold flex items-center gap-0.5 transition active:scale-95"
                        style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                        title="تفاصيل الخط"
                      >
                        <Eye className="w-2.5 h-2.5 text-blue-500" />
                        <span>تفاصيل</span>
                      </button>

                      <button
                        onClick={() => handleRecheckSingle(line)}
                        disabled={isLineChecking || isBatchChecking}
                        className="h-5.5 px-1.5 rounded border text-[9px] font-bold flex items-center gap-0.5 transition active:scale-95 disabled:opacity-50"
                        style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                        title="فحص الرقم"
                      >
                        <RotateCcw className={`w-2.5 h-2.5 text-[#E60000] ${isLineChecking ? 'animate-spin' : ''}`} />
                        <span>{isLineChecking ? 'جاري...' : 'فحص'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setEditingLineForLinking(line);
                          setEditMerchantId(line.merchant_id || '');
                          setEditActivationDay(line.activation_day || null);
                        }}
                        className="w-5.5 h-5.5 rounded border flex items-center justify-center transition hover:bg-blue-500/10 active:scale-95"
                        style={{ borderColor: cardBdr, color: mutC }}
                        title="تعديل التاجر والموعد"
                      >
                        <Edit3 className="w-2.5 h-2.5 text-blue-500" />
                      </button>

                      <button
                        onClick={() => handleDeleteLine(line.id, line.phone_number)}
                        className="w-5.5 h-5.5 rounded border flex items-center justify-center transition hover:bg-rose-500/10 active:scale-95"
                        style={{ borderColor: cardBdr, color: mutC }}
                        title="حذف الرقم"
                      >
                        <Trash2 className="w-2.5 h-2.5 text-rose-500" />
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

            {/* ربط التاجر وموعد التفعيل في الإضافة المجمعة */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl border" style={{ background: innerBg, borderColor: cardBdr }}>
              <div>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: textC }}>
                  التاجر المرتبط بالدفعة (اختياري):
                </label>
                <div className="flex items-center gap-1">
                  <select
                    value={bulkMerchantId}
                    onChange={e => setBulkMerchantId(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg text-xs outline-none border truncate"
                    style={{ background: cardBg, borderColor: cardBdr, color: textC }}
                  >
                    <option value="">بدون تاجر</option>
                    {merchants.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowCreateMerchantModal(true)}
                    className="h-8 px-2 rounded-lg border text-xs font-bold shrink-0"
                    style={{ background: cardBg, borderColor: cardBdr, color: textC }}
                    title="تاجر جديد"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: textC }}>
                  موعد التفعيل للدفعة:
                </label>
                <div className="flex items-center gap-1">
                  {VALID_ACTIVATION_DAYS.map(day => {
                    const isSelected = bulkActivationDay === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setBulkActivationDay(isSelected ? null : day)}
                        className="flex-1 h-8 rounded-lg border text-xs font-bold transition-all active:scale-95"
                        style={{
                          background: isSelected ? (L ? '#7e22ce' : '#9333ea') : cardBg,
                          color: isSelected ? '#ffffff' : textC,
                          borderColor: isSelected ? '#a855f7' : cardBdr,
                        }}
                      >
                        يوم {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

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
          const refreshed = await getMonitoredLines(user?.id);
          const updated = refreshed.find(l => l.id === line.id) || null;
          setSelectedLineForDetails(updated);
        }}
        isRechecking={checkingLineId === selectedLineForDetails?.id}
        L={L}
      />

      {/* ── نافذة تنبيه الرقم المسجل مسبقاً (منع التكرار الصارم) ── */}
      {duplicateAlert && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="w-full max-w-md rounded-2xl border p-5 space-y-4 shadow-2xl"
            style={{ background: cardBg, borderColor: 'rgba(239, 68, 68, 0.4)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-500">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-black">هذا الرقم مسجل بالفعل في نظام المراقبة</h3>
              </div>
              <button
                onClick={() => setDuplicateAlert(null)}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl border space-y-2 text-xs" style={{ background: innerBg, borderColor: cardBdr }}>
              <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
                <span style={{ color: mutC }}>رقم الهاتف:</span>
                <span className="font-mono font-bold text-sm text-[#E60000]" dir="ltr">
                  {duplicateAlert.phone}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
                <span style={{ color: mutC }}>التاجر المرتبط:</span>
                <span className="font-bold" style={{ color: textC }}>
                  {duplicateAlert.line.merchant?.name || 'غير محدد'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
                <span style={{ color: mutC }}>موعد التفعيل:</span>
                <span className="font-bold" style={{ color: textC }}>
                  {duplicateAlert.line.activation_day ? `يوم ${duplicateAlert.line.activation_day}` : 'غير محدد'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: cardBdr }}>
                <span style={{ color: mutC }}>الحالة الحالية:</span>
                <span className="font-bold">
                  {classifyLineSystem(duplicateAlert.line.current_system).label}
                </span>
              </div>
              <div className="flex items-center justify-between py-1" style={{ borderColor: cardBdr }}>
                <span style={{ color: mutC }}>عدد مرات الفحص:</span>
                <span className="font-bold" style={{ color: textC }}>
                  {duplicateAlert.line.check_count || 0} مرة
                </span>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-amber-500 font-medium bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
              ⚠️ تم الحفاظ على كافة بيانات المراقبة القديمة وسجل الفحص كما هي، ومُنعت إعادة إضافته لمنع التكرار وتفادي الازدواجية.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setDuplicateAlert(null)}
                className="h-9 px-4 rounded-xl border font-bold text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                إغلاق
              </button>
              <button
                onClick={() => {
                  const targetLine = duplicateAlert.line;
                  setDuplicateAlert(null);
                  setSelectedLineForDetails(targetLine);
                }}
                className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 text-white shadow-sm"
                style={{ background: '#E60000' }}
              >
                <Eye className="w-3.5 h-3.5" />
                عرض تفاصيل الخط
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال إنشاء تاجر جديد ── */}
      {showCreateMerchantModal && (
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
                onClick={() => setShowCreateMerchantModal(false)}
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
                  value={newMerchantName}
                  onChange={e => setNewMerchantName(e.target.value)}
                  placeholder="مثال: أحمد عبد الله أو سنتر الأمل"
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
                  value={newMerchantPhone}
                  onChange={e => setNewMerchantPhone(e.target.value)}
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
                  value={newMerchantUserId}
                  onChange={e => setNewMerchantUserId(e.target.value)}
                  className="w-full h-9 rounded-xl px-2 outline-none border text-xs"
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
                  يمكنك ترك التاجر كسجل مستقل دون إنشاء حساب تسجيل دخول له.
                </p>
              </div>

              <div>
                <label className="font-bold block mb-1" style={{ color: textC }}>
                  ملاحظات (اختياري)
                </label>
                <input
                  type="text"
                  value={newMerchantNotes}
                  onChange={e => setNewMerchantNotes(e.target.value)}
                  placeholder="أي تفاصيل أو ملاحظات عن التاجر"
                  className="w-full h-9 rounded-xl px-3 outline-none border text-xs"
                  style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: cardBdr }}>
              <button
                type="button"
                onClick={() => setShowCreateMerchantModal(false)}
                className="h-9 px-3.5 rounded-xl border font-bold text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isCreatingMerchant || !newMerchantName.trim()}
                className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 text-white disabled:opacity-50 shadow-sm"
                style={{ background: '#E60000' }}
              >
                <Plus className="w-3.5 h-3.5" />
                {isCreatingMerchant ? 'جاري الإنشاء...' : 'إنشاء وحفظ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── مودال تعديل بيانات ربط الخط (التاجر وموعد التفعيل) ── */}
      {editingLineForLinking && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="w-full max-w-md rounded-2xl border p-5 space-y-4 shadow-2xl"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#E60000]" />
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  تعديل بيانات الربط للرقم <span dir="ltr" className="font-mono text-[#E60000]">{editingLineForLinking.phone_number}</span>
                </h3>
              </div>
              <button
                onClick={() => setEditingLineForLinking(null)}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1" style={{ color: textC }}>
                  التاجر المرتبط
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={editMerchantId}
                    onChange={e => setEditMerchantId(e.target.value)}
                    className="flex-1 h-9 px-2 rounded-xl border outline-none text-xs"
                    style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                  >
                    <option value="">بدون تاجر (إلغاء التعيين)</option>
                    {merchants.map(m => (
                      <option key={m.id} value={m.id}>{m.name} {m.phone ? `(${m.phone})` : ''}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowCreateMerchantModal(true)}
                    className="h-9 px-2.5 rounded-xl border text-xs font-bold"
                    style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                  >
                    + تاجر جديد
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1" style={{ color: textC }}>
                  موعد التفعيل المعتمد
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditActivationDay(null)}
                    className="flex-1 h-8 rounded-lg border text-xs font-bold transition-all"
                    style={{
                      background: editActivationDay === null ? innerBg : 'transparent',
                      borderColor: editActivationDay === null ? textC : cardBdr,
                      color: editActivationDay === null ? textC : mutC,
                    }}
                  >
                    بدون تحديد
                  </button>
                  {VALID_ACTIVATION_DAYS.map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setEditActivationDay(day)}
                      className="flex-1 h-8 rounded-lg border text-xs font-bold transition-all active:scale-95"
                      style={{
                        background: editActivationDay === day ? (L ? '#7e22ce' : '#9333ea') : innerBg,
                        color: editActivationDay === day ? '#ffffff' : textC,
                        borderColor: editActivationDay === day ? '#a855f7' : cardBdr,
                      }}
                    >
                      يوم {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: cardBdr }}>
              <button
                onClick={() => setEditingLineForLinking(null)}
                className="h-9 px-4 rounded-xl border font-bold text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveLineLink}
                disabled={isSavingLink}
                className="h-9 px-4 rounded-xl font-bold text-xs flex items-center gap-1 text-white disabled:opacity-50"
                style={{ background: '#E60000' }}
              >
                <Check className="w-3.5 h-3.5" />
                {isSavingLink ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── لوحة تحكم وإعدادات قسم فودافون ريد VIP الشاملة ── */}
      {showIntervalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 overflow-y-auto">
          <div
            className="w-full max-w-md rounded-2xl border p-4 space-y-3.5 shadow-2xl my-auto"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            {/* عنوان اللوحة */}
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: cardBdr }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#E60000] text-white flex items-center justify-center shadow-xs">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black" style={{ color: textC }}>
                    لوحة تحكم وإعدادات فودافون ريد VIP
                  </h3>
                  <p className="text-[10px]" style={{ color: mutC }}>
                    التحكم المباشر في دورة الفحص الزمني، خيارات الأرقام والجدولة بالسيرفر
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIntervalModal(false)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* إحصائيات سريعة للأرقام */}
            <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl border bg-background/40" style={{ borderColor: cardBdr }}>
              <div className="text-center">
                <p className="text-[9px] font-bold" style={{ color: mutC }}>قيد المراقبة</p>
                <p className="text-xs font-black text-amber-500">{monitoringLines.length}</p>
              </div>
              <div className="text-center border-x" style={{ borderColor: cardBdr }}>
                <p className="text-[9px] font-bold" style={{ color: mutC }}>تم التحويل (ريد)</p>
                <p className="text-xs font-black text-emerald-500">{convertedLines.length}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-bold" style={{ color: mutC }}>غير مؤهل</p>
                <p className="text-xs font-black text-rose-500">{ineligibleLines.length}</p>
              </div>
            </div>

            {/* مفتاح الفحص التلقائي بالسيرفر */}
            <div className="p-2.5 rounded-xl border flex items-center justify-between gap-2" style={{ background: innerBg, borderColor: cardBdr }}>
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <p className="text-xs font-black truncate" style={{ color: textC }}>
                    الفحص التلقائي بالخلفية على السيرفر
                  </p>
                </div>
                <p className="text-[10px]" style={{ color: mutC }}>
                  تشغيل الفحص بانتظام في الخلفية حتى عند إغلاق التطبيق
                </p>
              </div>
              <button
                type="button"
                disabled={isTogglingGlobalScan}
                onClick={async () => {
                  if (!config) return;
                  const newStatus = !config.is_enabled_globally;
                  setIsTogglingGlobalScan(true);
                  try {
                    const res = await updateVipRedConfig({ is_enabled_globally: newStatus });
                    if (res.success) {
                      setConfig(prev => prev ? { ...prev, is_enabled_globally: newStatus } : prev);
                      toast.success(newStatus ? 'تم تفعيل الفحص التلقائي بالسيرفر' : 'تم تعطيل الفحص التلقائي بالسيرفر');
                    } else {
                      toast.error('تعذر تغيير حالة الفحص: ' + res.error);
                    }
                  } catch (err: any) {
                    toast.error('خطأ: ' + err.message);
                  } finally {
                    setIsTogglingGlobalScan(false);
                  }
                }}
                className="shrink-0 transition active:scale-95"
              >
                {config?.is_enabled_globally ? (
                  <ToggleRight className="w-7 h-7 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-7 h-7 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* ضبط دورة الفحص الزمني مع إدخال حر للساعات والدقائق */}
            <div className="p-3 rounded-xl border space-y-2.5" style={{ background: innerBg, borderColor: cardBdr }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#E60000]" />
                  <h4 className="text-xs font-black" style={{ color: textC }}>
                    دورية وزمن الدورة لكل فحص
                  </h4>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[#E60000]/15 text-[#E60000] border border-[#E60000]/30">
                  الحالية: {config?.check_interval_hours ? (
                    config.check_interval_hours >= 1 
                      ? `${config.check_interval_hours} س` 
                      : `${Math.round(config.check_interval_hours * 60)} د`
                  ) : '2 س'}
                </span>
              </div>

              <p className="text-[10px]" style={{ color: mutC }}>
                يمكنك كتابة أي عدد ساعات أو دقائق بحرية تامة دون قيود، وسيتم تطبيق الدورية فوراً على جميع الأرقام:
              </p>

              {/* أزرار اختيار سريع */}
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
                {[
                  { label: '15 د', h: 0, m: 15 },
                  { label: '30 د', h: 0, m: 30 },
                  { label: '1 س', h: 1, m: 0 },
                  { label: '2 س', h: 2, m: 0 },
                  { label: '4 س', h: 4, m: 0 },
                  { label: '6 س', h: 6, m: 0 },
                  { label: '12 س', h: 12, m: 0 },
                  { label: '24 س', h: 24, m: 0 },
                ].map((p, idx) => {
                  const isSel = customHours === String(p.h) && customMinutes === String(p.m);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setCustomHours(String(p.h));
                        setCustomMinutes(String(p.m));
                      }}
                      className={`py-1 px-0.5 rounded text-[10px] font-bold border transition text-center ${
                        isSel
                          ? 'bg-[#E60000] text-white border-[#E60000] shadow-xs'
                          : 'hover:bg-black/5 dark:hover:bg-white/5 border-border'
                      }`}
                      style={{ color: isSel ? '#ffffff' : textC }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* حقول الإدخال اليدوي المفتوح للساعات والدقائق */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2 rounded-lg border bg-background/50" style={{ borderColor: cardBdr }}>
                  <label className="text-[10px] font-bold block mb-1" style={{ color: textC }}>
                    عدد الساعات (اكتب أي عدد):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="720"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    className="w-full h-7.5 px-2 rounded-md border text-xs font-mono font-bold text-center"
                    style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                    placeholder="مثال: 2"
                  />
                </div>

                <div className="p-2 rounded-lg border bg-background/50" style={{ borderColor: cardBdr }}>
                  <label className="text-[10px] font-bold block mb-1" style={{ color: textC }}>
                    عدد الدقائق الإضافية:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    className="w-full h-7.5 px-2 rounded-md border text-xs font-mono font-bold text-center"
                    style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                    placeholder="مثال: 0 أو 30"
                  />
                </div>
              </div>

              {/* خيار تصفير مواعيد الفحص وبدء دورة جديدة الآن فوراً */}
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-background/40 border border-border/50 text-[10px] font-bold" style={{ color: textC }}>
                <input
                  type="checkbox"
                  checked={resetCycleOnSave}
                  onChange={(e) => setResetCycleOnSave(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-[#E60000] focus:ring-[#E60000]"
                />
                <span>تصفير مواعيد الفحص لتبدأ دورة جديدة الآن فوراً لجميع الأرقام قيد المراقبة</span>
              </label>

              {/* زر الحفظ والتطبيق الفوري على الأرقام */}
              <button
                type="button"
                disabled={isSavingInterval}
                onClick={async () => {
                  const h = parseInt(customHours || '0', 10);
                  const m = parseInt(customMinutes || '0', 10);
                  if (h === 0 && m === 0) {
                    toast.error('يرجى تحديد مدة دورة الفحص (على الأقل دقيقة واحدة)');
                    return;
                  }
                  const totalHours = Math.max(0.02, Number((h + (m / 60)).toFixed(3)));
                  setIsSavingInterval(true);
                  try {
                    const res = await saveAndApplyVipRedInterval(totalHours, {
                      resetAllToNow: resetCycleOnSave,
                    });
                    if (res.success) {
                      toast.success(`تم حفظ دورية الفحص (كل ${h > 0 ? `${h} س ` : ''}${m > 0 ? `${m} د` : ''}) وتطبيقها فوراً على ${res.updatedCount} خط قيد المراقبة!`);
                      setShowIntervalModal(false);
                      await loadData();
                    } else {
                      toast.error('فشل تطبيق الدورية: ' + (res.error || 'خطأ'));
                    }
                  } catch (err: any) {
                    toast.error('تعذر حفظ وتطبيق الدورية: ' + (err?.message || 'خطأ'));
                  } finally {
                    setIsSavingInterval(false);
                  }
                }}
                className="w-full h-8.5 rounded-xl bg-[#E60000] text-white text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm hover:bg-[#cc0000]"
              >
                {isSavingInterval ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري حفظ وتطبيق الدورية على كافة الأرقام...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>حفظ الدورية وتطبيقها فوراً على كافة الأرقام</span>
                  </>
                )}
              </button>
            </div>

            {/* أوامر التحكم المباشرة والسريعة */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowIntervalModal(false);
                    handleBatchCheckAll();
                  }}
                  disabled={isBatchChecking || monitoringLines.length === 0}
                  className="flex-1 h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 disabled:opacity-50"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>فحص فوري شامل لكافة الأرقام الآن</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowIntervalModal(false);
                    navigate('/admin/vip-red');
                  }}
                  className="h-8 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition active:scale-95"
                  style={{ borderColor: cardBdr, color: textC, background: innerBg }}
                  title="الانتقال إلى لوحة إدارة الصلاحيات المتقدمة"
                >
                  <Settings className="w-3 h-3" />
                  <span className="hidden sm:inline">إدارة الصلاحيات</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال إرشادات استمرار الإشعارات بالخلفية وضبط البطارية ── */}
      {showBatteryGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="w-full max-w-md rounded-2xl border p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: cardBdr }}>
              <div className="flex items-center gap-2">
                <BatteryCharging className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  دليل استلام الإشعارات أثناء إغلاق التطبيق
                </h3>
              </div>
              <button
                onClick={() => setShowBatteryGuideModal(false)}
                className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs"
                style={{ background: innerBg, borderColor: cardBdr, color: mutC }}
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs leading-relaxed">
              ⚡ <strong>الفحص السحابي يعمل دائماً على السيرفر كل دقيقتين</strong> حتى لو كان هاتفك مغلقاً تماماً! لضمان ظهور صوت وإشعار الستارة فوراً على هاتفك عند تحويل أي خط، يُرجى التأكد من الخطوات التالية:
            </div>

            <div className="space-y-3 text-xs" style={{ color: textC }}>
              <div className="p-3 rounded-xl border space-y-1" style={{ background: innerBg, borderColor: cardBdr }}>
                <p className="font-bold text-[#E60000] flex items-center gap-1.5">
                  <span>1.</span> إشعارات التطبيق والستارة (Notifications)
                </p>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  افتح إعدادات الهاتف ← التطبيقات ← Vodafone Fakka ← الإشعارات ← تأكد من تفعيل جميع فئات الإشعارات، وخاصة <strong>"إشعارات فودافون ريد والتنبيهات الهامة"</strong>، والسماح بالنوافذ المنبثقة (Pop-up/Heads-up).
                </p>
              </div>

              <div className="p-3 rounded-xl border space-y-1" style={{ background: innerBg, borderColor: cardBdr }}>
                <p className="font-bold text-amber-500 flex items-center gap-1.5">
                  <span>2.</span> توفير البطارية (Battery Saver)
                </p>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  في معلومات التطبيق ← البطارية ← اختر <strong>"غير مقيد" (Unrestricted / لا توجد قيود)</strong>، حتى لا يقوم نظام أندرويد بقتل خدمة استقبال الإشعارات في الخلفية.
                </p>
              </div>

              <div className="p-3 rounded-xl border space-y-1" style={{ background: innerBg, borderColor: cardBdr }}>
                <p className="font-bold text-blue-500 flex items-center gap-1.5">
                  <span>3.</span> التشغيل التلقائي (Auto-start) - لهواتف شاومي وأوبو وريلمي وفيفو
                </p>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  إذا كان هاتفك Xiaomi / Redmi / Poco / Oppo / Realme: ادخل إلى إعدادات التطبيق وفعل خيار <strong>"التشغيل التلقائي" (Autostart)</strong> للسماح باستلام التنبيهات حتى عند إغلاق التطبيق من شاشة التطبيقات الحديثة.
                </p>
              </div>

              <div className="p-3 rounded-xl border space-y-1" style={{ background: innerBg, borderColor: cardBdr }}>
                <p className="font-bold text-purple-500 flex items-center gap-1.5">
                  <span>4.</span> بيانات الخلفية (Background Data)
                </p>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  تأكد من تفعيل "استخدام بيانات الخلفية" (Background Data) حتى يتمكن الهاتف من مزامنة إشعارات التحويل عبر الإنترنت طوال اليوم.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowBatteryGuideModal(false)}
              className="w-full h-9 rounded-xl bg-[#E60000] text-white text-xs font-bold transition active:scale-95"
            >
              فهمت ذلك، تم ضبط الإعدادات
            </button>
          </div>
        </div>
      )}

    </div>

  );
}
