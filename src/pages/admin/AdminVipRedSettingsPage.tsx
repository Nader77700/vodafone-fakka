/**
 * AdminVipRedSettingsPage — لوحة تحكم إعدادات وصلاحيات مراقبة خطوط ريد VIP
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Crown, Shield, Users, Clock, CheckCircle2,
  AlertTriangle, Search, Save, ToggleLeft, ToggleRight,
  RefreshCw, Phone, BarChart2
} from 'lucide-react';
import { toast } from 'sonner';
import { useIsLight } from '@/contexts/ThemeContext';
import { supabase } from '@/db/supabase';
import {
  getVipRedConfig,
  updateVipRedConfig,
  saveAndApplyVipRedInterval,
} from '@/lib/vipRedService';
import type { VipRedConfig } from '@/types/vipRed';

interface UserProfile {
  id: string;
  username: string;
  phone: string;
  role: string;
  is_active: boolean;
}

export default function AdminVipRedSettingsPage() {
  const navigate = useNavigate();
  const L = useIsLight();

  const [config, setConfig] = useState<VipRedConfig | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customHours, setCustomHours] = useState('2');
  const [customMinutes, setCustomMinutes] = useState('0');
  const [isApplyingInterval, setIsApplyingInterval] = useState(false);
  const [resetCycleOnSave, setResetCycleOnSave] = useState(false);

  // إحصائيات عامة عن الأرقام في المنظومة
  const [stats, setStats] = useState({
    total: 0,
    monitoring: 0,
    converted: 0,
    ineligible: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. جلب الإعدادات
      const cfg = await getVipRedConfig();
      setConfig(cfg);
      if (cfg) {
        const hrs = cfg.check_interval_hours || 2;
        const wholeHrs = Math.floor(hrs);
        const remMins = Math.round((hrs - wholeHrs) * 60);
        setCustomHours(String(wholeHrs));
        setCustomMinutes(String(remMins));
      }

      // 2. جلب المستخدمين لتحديد الصلاحيات
      const { data: usersData, error: usersErr } = await supabase
        .from('profiles')
        .select('id, username, phone, role, is_active')
        .order('username', { ascending: true });

      if (!usersErr && usersData) {
        setUsers(usersData as UserProfile[]);
      }

      // 3. جلب إحصائيات الأرقام
      const { data: linesData } = await supabase
        .from('vip_red_monitored_lines')
        .select('system_status');

      if (linesData) {
        const total = linesData.length;
        const monitoring = linesData.filter(l => l.system_status === 'monitoring').length;
        const converted = linesData.filter(l => l.system_status === 'converted').length;
        const ineligible = linesData.filter(l => l.system_status === 'ineligible').length;
        setStats({ total, monitoring, converted, ineligible });
      }
    } catch (e) {
      console.error('[AdminVipRed] load error:', e);
      toast.error('تعذّر تحميل بيانات إعدادات VIP');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // حفظ التعديلات
  const handleSaveConfig = async (updatedConfig: VipRedConfig) => {
    setSaving(true);
    const res = await updateVipRedConfig({
      is_enabled_globally: updatedConfig.is_enabled_globally,
      allowed_user_ids: updatedConfig.allowed_user_ids,
      check_interval_hours: updatedConfig.check_interval_hours,
    });
    setSaving(false);

    if (res.success) {
      setConfig(updatedConfig);
      toast.success('تم حفظ إعدادات مراقبة خطوط ريد VIP بنجاح!');
    } else {
      toast.error(`فشل الحفظ: ${res.error || 'خطأ غير معروف'}`);
    }
  };

  // تبديل إذن مستخدم فردي
  const toggleUserPermission = (userId: string) => {
    if (!config) return;
    const currentList = config.allowed_user_ids || [];
    const exists = currentList.includes(userId);
    const updatedList = exists
      ? currentList.filter(id => id !== userId)
      : [...currentList, userId];

    const newCfg = { ...config, allowed_user_ids: updatedList };
    setConfig(newCfg);
    handleSaveConfig(newCfg);
  };

  const filteredUsers = users.filter(u => {
    const q = searchTerm.toLowerCase();
    return (
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  });

  const cardBg  = L ? '#ffffff' : 'rgba(255,255,255,0.04)';
  const cardBdr = L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.09)';
  const textC   = L ? '#1a1a2e' : '#ffffff';
  const mutC    = L ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const innerBg = L ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';

  return (
    <div className="min-h-screen pb-24" dir="rtl"
      style={{ background: L ? '#f5f7fa' : 'linear-gradient(180deg, #080d14 0%, #0a0a0f 100%)' }}>

      {/* Header */}
      <div className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{
          background: L ? 'rgba(255,255,255,0.96)' : 'rgba(8,13,20,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${cardBdr}`,
        }}>
        <div className="flex items-center gap-3 py-4 max-w-4xl mx-auto">
          <button onClick={() => navigate('/admin')}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors active:scale-95 border"
            style={{ borderColor: cardBdr, background: innerBg }}>
            <ArrowRight className="w-4 h-4" style={{ color: textC }} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black" style={{ color: textC }}>
                إعدادات مراقبة خطوط ريد VIP
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E60000]/15 text-[#E60000] border border-[#E60000]/25">
                Vodafone Red
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              التحكم في تشغيل الميزة، الصلاحيات الفردية، ودورية الفحص بالسيرفر
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="w-9 h-9 rounded-xl flex items-center justify-center border transition-all active:scale-95"
            style={{ borderColor: cardBdr, background: innerBg }}
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-4xl mx-auto">
        {/* إحصائيات سريعة */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3.5 rounded-2xl border" style={{ background: cardBg, borderColor: cardBdr }}>
            <div className="flex items-center justify-between text-muted-foreground">
              <Phone className="w-4 h-4" />
              <span className="text-xs font-bold">إجمالي الأرقام</span>
            </div>
            <p className="text-xl font-black mt-2 font-mono" style={{ color: textC }}>{stats.total}</p>
          </div>

          <div className="p-3.5 rounded-2xl border" style={{ background: cardBg, borderColor: cardBdr }}>
            <div className="flex items-center justify-between text-blue-500">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-bold">قيد المراقبة</span>
            </div>
            <p className="text-xl font-black mt-2 font-mono text-blue-500">{stats.monitoring}</p>
          </div>

          <div className="p-3.5 rounded-2xl border" style={{ background: cardBg, borderColor: cardBdr }}>
            <div className="flex items-center justify-between text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs font-bold">تم التحويل لريد</span>
            </div>
            <p className="text-xl font-black mt-2 font-mono text-emerald-500">{stats.converted}</p>
          </div>

          <div className="p-3.5 rounded-2xl border" style={{ background: cardBg, borderColor: cardBdr }}>
            <div className="flex items-center justify-between text-rose-500">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-bold">غير مؤهل</span>
            </div>
            <p className="text-xl font-black mt-2 font-mono text-rose-500">{stats.ineligible}</p>
          </div>
        </div>

        {/* ── بطاقة الإعدادات الرئيسية ── */}
        {config && (
          <div className="p-5 rounded-2xl border space-y-5" style={{ background: cardBg, borderColor: cardBdr }}>
            <div className="flex items-center gap-2.5 border-b pb-3" style={{ borderColor: cardBdr }}>
              <Crown className="w-5 h-5 text-amber-500" />
              <h2 className="text-sm font-black" style={{ color: textC }}>خيارات التشغيل والدورية</h2>
            </div>

            {/* الخيار 1: تفعيل عام لجميع المستخدمين */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border" style={{ background: innerBg, borderColor: cardBdr }}>
              <div className="space-y-0.5">
                <p className="text-xs font-black" style={{ color: textC }}>
                  تفعيل الميزة لجميع المستخدمين تلقائياً
                </p>
                <p className="text-[11px]" style={{ color: mutC }}>
                  عند التفعيل، سيتم فتح قسم VIP لجميع المستخدمين المسجلين في التطبيق
                </p>
              </div>

              <button
                onClick={() => {
                  const updated = { ...config, is_enabled_globally: !config.is_enabled_globally };
                  setConfig(updated);
                  handleSaveConfig(updated);
                }}
                disabled={saving}
                className="transition-transform active:scale-95"
              >
                {config.is_enabled_globally ? (
                  <ToggleRight className="w-8 h-8 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* الخيار 2: فترة الفحص التلقائي بالساعات مع إدخال حر وتطبيق فوري */}
            <div className="p-3.5 rounded-xl border space-y-3" style={{ background: innerBg, borderColor: cardBdr }}>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#E60000]" />
                    <p className="text-xs font-black" style={{ color: textC }}>
                      دورية وفترة الفحص التلقائي بالسيرفر
                    </p>
                  </div>
                  <p className="text-[11px]" style={{ color: mutC }}>
                    اكتب أي عدد ساعات أو دقائق بحرية تامة دون التقيد بخيارات ثابتة، وسيتم تطبيقها فوراً على جميع الأرقام
                  </p>
                </div>
                <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-[#E60000]/15 text-[#E60000] border border-[#E60000]/25 shrink-0">
                  {config.check_interval_hours >= 1
                    ? `كل ${config.check_interval_hours} ساعات`
                    : `كل ${Math.round(config.check_interval_hours * 60)} دقيقة`}
                </span>
              </div>

              {/* أزرار اختيار سريع */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold block" style={{ color: mutC }}>
                  اختيارات سريعة شائعة:
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {[
                    { label: '15 دقيقة', h: 0, m: 15 },
                    { label: '30 دقيقة', h: 0, m: 30 },
                    { label: '1 ساعة', h: 1, m: 0 },
                    { label: '2 ساعة', h: 2, m: 0 },
                    { label: '4 ساعات', h: 4, m: 0 },
                    { label: '6 ساعات', h: 6, m: 0 },
                    { label: '12 ساعة', h: 12, m: 0 },
                    { label: '24 ساعة', h: 24, m: 0 },
                  ].map((preset, idx) => {
                    const isSelected = customHours === String(preset.h) && customMinutes === String(preset.m);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCustomHours(String(preset.h));
                          setCustomMinutes(String(preset.m));
                        }}
                        className={`py-1.5 px-1 text-[11px] font-bold rounded-lg border transition-all text-center ${
                          isSelected
                            ? 'bg-[#E60000] text-white border-[#E60000] shadow-xs'
                            : 'hover:bg-black/5 dark:hover:bg-white/5 border-border'
                        }`}
                        style={{ color: isSelected ? '#ffffff' : textC }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* حقول الإدخال اليدوي الحر للساعات والدقائق */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded-lg border bg-background/50" style={{ borderColor: cardBdr }}>
                  <label className="text-[11px] font-bold block mb-1" style={{ color: textC }}>
                    عدد الساعات (اكتب أي عدد):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="720"
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    className="w-full h-8 px-3 rounded-md border text-sm font-mono font-bold text-center"
                    style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                    placeholder="مثال: 2"
                  />
                </div>

                <div className="p-2.5 rounded-lg border bg-background/50" style={{ borderColor: cardBdr }}>
                  <label className="text-[11px] font-bold block mb-1" style={{ color: textC }}>
                    عدد الدقائق الإضافية:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    className="w-full h-8 px-3 rounded-md border text-sm font-mono font-bold text-center"
                    style={{ background: innerBg, borderColor: cardBdr, color: textC }}
                    placeholder="مثال: 0 أو 30"
                  />
                </div>
              </div>

              {/* خيار تصفير الدورة لتبدأ الآن لجميع الأرقام */}
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-background/30 border border-border/50 text-[11px] font-bold" style={{ color: textC }}>
                <input
                  type="checkbox"
                  checked={resetCycleOnSave}
                  onChange={(e) => setResetCycleOnSave(e.target.checked)}
                  className="w-4 h-4 rounded text-[#E60000] focus:ring-[#E60000]"
                />
                <span>تصفير مواعيد الفحص وبدء دورة جديدة فوراً الآن لجميع الأرقام قيد المراقبة</span>
              </label>

              {/* زر الحفظ والتطبيق الفوري */}
              <button
                type="button"
                disabled={isApplyingInterval}
                onClick={async () => {
                  const h = parseInt(customHours || '0', 10);
                  const m = parseInt(customMinutes || '0', 10);
                  if (h === 0 && m === 0) {
                    toast.error('يرجى تحديد مدة دورة الفحص (على الأقل دقيقة واحدة)');
                    return;
                  }
                  const totalHours = Math.max(0.02, Number((h + (m / 60)).toFixed(3)));
                  setIsApplyingInterval(true);
                  try {
                    const res = await saveAndApplyVipRedInterval(totalHours, {
                      resetAllToNow: resetCycleOnSave,
                    });
                    if (res.success) {
                      toast.success(`تم حفظ الدورية (كل ${h > 0 ? `${h} س ` : ''}${m > 0 ? `${m} د` : ''}) وتطبيقها فوراً على ${res.updatedCount} خط قيد المراقبة!`);
                      setConfig(prev => prev ? { ...prev, check_interval_hours: totalHours } : prev);
                    } else {
                      toast.error('فشل تطبيق الدورية: ' + (res.error || 'خطأ'));
                    }
                  } catch (err: any) {
                    toast.error('حدث خطأ أثناء الحفظ والتطبيق: ' + (err?.message || 'خطأ'));
                  } finally {
                    setIsApplyingInterval(false);
                  }
                }}
                className="w-full h-9 rounded-xl bg-[#E60000] text-white font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-98 shadow-sm hover:bg-[#cc0000]"
              >
                {isApplyingInterval ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري حفظ وتطبيق الدورية على الأرقام...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>حفظ الدورية وتطبيقها فوراً على كافة الأرقام</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── إدارة صلاحيات المستخدمين المحددين ── */}
        <div className="p-5 rounded-2xl border space-y-4" style={{ background: cardBg, borderColor: cardBdr }}>
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: cardBdr }}>
            <div className="flex items-center gap-2.5">
              <Users className="w-5 h-5 text-blue-500" />
              <div>
                <h2 className="text-sm font-black" style={{ color: textC }}>صلاحيات المستخدمين المخصصين</h2>
                <p className="text-[11px]" style={{ color: mutC }}>
                  حدد المستخدمين المسموح لهم استخدام قسم VIP بشكل فردي
                </p>
              </div>
            </div>

            <span className="text-xs font-bold px-2.5 py-1 rounded-lg border" style={{ background: innerBg, borderColor: cardBdr, color: textC }}>
              المحددون: {config?.allowed_user_ids?.length || 0} مستخدم
            </span>
          </div>

          {/* شريط البحث عن مستخدم */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              className="w-full h-10 pr-9 pl-3 text-xs rounded-xl outline-none border transition-all"
              style={{ background: innerBg, borderColor: cardBdr, color: textC }}
            />
          </div>

          {/* قائمة المستخدمين */}
          <div className="divide-y max-h-96 overflow-y-auto rounded-xl border" style={{ borderColor: cardBdr }}>
            {filteredUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                لا يوجد مستخدمون يطابقون البحث
              </div>
            ) : (
              filteredUsers.map(u => {
                const isAdmin = u.role === 'admin' || u.role === 'super_admin';
                const isAllowed = isAdmin || (config?.allowed_user_ids || []).includes(u.id);

                return (
                  <div
                    key={u.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold truncate" style={{ color: textC }}>
                          {u.username || 'مستخدم بدون اسم'}
                        </span>
                        {isAdmin && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/25">
                            أدمن
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono" style={{ color: mutC }} dir="ltr">
                        {u.phone || 'بدون هاتف'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isAdmin ? (
                        <span className="text-[11px] font-bold text-muted-foreground px-2 py-1">
                          مفعل دائم للأدمن
                        </span>
                      ) : (
                        <button
                          onClick={() => toggleUserPermission(u.id)}
                          disabled={saving}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                            isAllowed
                              ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/50'
                          }`}
                        >
                          {isAllowed ? '✓ مفعل' : '+ تفعيل'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
