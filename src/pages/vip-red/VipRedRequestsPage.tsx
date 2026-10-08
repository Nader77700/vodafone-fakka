import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  User,
  Crown,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Search,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Layers,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { VipRedLineClaim, VipRedLine } from '@/types/vipRed';
import {
  getPendingLineClaims,
  reviewLineClaim,
  getMonitoredLines,
} from '@/lib/vipRedService';

export default function VipRedRequestsPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
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
  const { theme } = useTheme();
  const L = theme === 'light';

  // Theme styling
  const pageBg = L ? '#f8fafc' : '#090a0f';
  const cardBg = L ? '#ffffff' : '#11131a';
  const cardBdr = L ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)';
  const innerBg = L ? '#f1f5f9' : 'rgba(255, 255, 255, 0.04)';
  const textC = L ? '#0f172a' : '#f8fafc';
  const mutC = L ? '#64748b' : '#94a3b8';

  const [activeTab, setActiveTab] = useState<'pending' | 'passwords' | 'history'>('pending');
  const [claims, setClaims] = useState<VipRedLineClaim[]>([]);
  const [lines, setLines] = useState<VipRedLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Rejection modal
  const [rejectingClaim, setRejectingClaim] = useState<VipRedLineClaim | null>(null);
  const [rejectionReason, setRejectionReason] = useState('هذا الرقم غير خاص بك');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Passwords reveal toggle
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
      setIsRefreshing(false);
    }, 1800);

    try {
      const [claimsData, linesData] = await Promise.all([
        getPendingLineClaims().catch(() => []),
        getMonitoredLines(user?.id || '', true).catch(() => []),
      ]);
      setClaims(claimsData || []);
      setLines(linesData || []);
    } catch (err) {
      console.warn(err);
    } finally {
      clearTimeout(safetyTimer);
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    toast.success('تم تحديث البيانات');
  };

  // Approve claim
  const handleApprove = async (claim: VipRedLineClaim) => {
    if (!user) return;
    setIsSubmittingReview(true);
    try {
      const res = await reviewLineClaim(claim.id, true, user.id);
      if (res.success) {
        toast.success(`تمت الموافقة على ربط الرقم ${claim.phone_number} بحساب "${claim.requester_name}" بنجاح!`);
        await loadData();
      } else {
        toast.error(res.error || 'تعذر اعتماد الطلب');
      }
    } catch {
      toast.error('حدث خطأ أثناء اعتماد الطلب');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Reject claim
  const handleConfirmReject = async () => {
    if (!rejectingClaim || !user) return;
    setIsSubmittingReview(true);
    try {
      const res = await reviewLineClaim(rejectingClaim.id, false, user.id, rejectionReason);
      if (res.success) {
        toast.info(`تم رفض طلب ربط الرقم ${rejectingClaim.phone_number}`);
        setRejectingClaim(null);
        setRejectionReason('هذا الرقم غير خاص بك');
        await loadData();
      } else {
        toast.error(res.error || 'تعذر رفض الطلب');
      }
    } catch {
      toast.error('حدث خطأ أثناء رفض الطلب');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label} إلى الحافظة!`);
  };

  const togglePasswordReveal = (id: string) => {
    setRevealedPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered lists
  const pendingClaims = useMemo(() => claims.filter(c => c.status === 'pending'), [claims]);
  const historyClaims = useMemo(() => claims.filter(c => c.status !== 'pending'), [claims]);
  const linesWithAnaPassword = useMemo(
    () => lines.filter(l => Boolean(l.ana_vodafone_password)),
    [lines]
  );

  // If not admin, block with friendly return
  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center" style={{ background: pageBg, direction: 'rtl' }}>
        <div className="max-w-md w-full p-6 rounded-2xl border text-center space-y-3" style={{ background: cardBg, borderColor: cardBdr }}>
          <ShieldCheck className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-black" style={{ color: textC }}>لوحة خاصة بإدارة المالك</h2>
          <p className="text-xs" style={{ color: mutC }}>هذه الصفحة مخصصة للمسؤول لمراجعة طلبات اعتماد الأرقام وكلمات السر.</p>
          <button
            onClick={() => navigate('/vip-red')}
            className="h-9 px-4 rounded-xl bg-[#E60000] text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة لمركز ريد VIP</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 transition-colors duration-200" style={{ background: pageBg, color: textC, direction: 'rtl' }}>
      {/* ── شريط الرأس ── */}
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
              title="رجوع لمركز ريد"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#E60000] shrink-0" />
                <h1 className="text-sm sm:text-base font-black truncate">
                  إدارة طلبات الربط وكلمات السر — ريد VIP
                </h1>
              </div>
              <p className="text-[10px] sm:text-[11px] truncate" style={{ color: mutC }}>
                مراجعة واعتماد طلبات ربط الأرقام الواردة من التجار والمستخدمين وكلمات سر أنا فودافون
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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
          </div>
        </div>
      </header>

      {/* ── المحتوى الرئيسي ── */}
      <main className="max-w-4xl mx-auto p-2 sm:p-3 space-y-2 sm:space-y-2.5 pb-32">
        {/* شريط التبويبات الثلاثة (Compact Horizontal Tabs) */}
        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-xl border shadow-xs" style={{ background: cardBg, borderColor: cardBdr }}>
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 ${
              activeTab === 'pending'
                ? 'bg-[#E60000] text-white shadow-xs'
                : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            style={{ color: activeTab === 'pending' ? '#ffffff' : textC }}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>طلبات معلقة ({pendingClaims.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('passwords')}
            className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 ${
              activeTab === 'passwords'
                ? 'bg-[#E60000] text-white shadow-xs'
                : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            style={{ color: activeTab === 'passwords' ? '#ffffff' : textC }}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>كلمات سر أنا فودافون ({linesWithAnaPassword.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 ${
              activeTab === 'history'
                ? 'bg-[#E60000] text-white shadow-xs'
                : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            style={{ color: activeTab === 'history' ? '#ffffff' : textC }}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>السجل السابق ({historyClaims.length})</span>
          </button>
        </div>

        {/* ── التبويب الأول: طلبات معلقة ── */}
        {activeTab === 'pending' && (
          <div className="space-y-2.5">
            {isLoading ? (
              <div className="p-8 rounded-2xl border text-center space-y-2" style={{ background: cardBg, borderColor: cardBdr }}>
                <RefreshCw className="w-6 h-6 animate-spin text-[#E60000] mx-auto" />
                <p className="text-xs font-bold" style={{ color: mutC }}>جاري تحميل الطلبات...</p>
              </div>
            ) : pendingClaims.length === 0 ? (
              <div className="p-8 rounded-2xl border text-center space-y-2" style={{ background: cardBg, borderColor: cardBdr }}>
                <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto" />
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  لا توجد طلبات ربط معلقة حالياً
                </h3>
                <p className="text-xs" style={{ color: mutC }}>
                  تمت مراجعة جميع طلبات ربط الأرقام المقدمة من المستخدمين والتجار.
                </p>
              </div>
            ) : (
              pendingClaims.map(claim => (
                <div
                  key={claim.id}
                  className="p-3 sm:p-4 rounded-2xl border space-y-3 transition-all shadow-xs"
                  style={{ background: cardBg, borderColor: cardBdr }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-black tracking-wider" dir="ltr" style={{ color: textC }}>
                          {claim.phone_number}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            claim.requester_role === 'merchant'
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                              : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                          }`}
                        >
                          {claim.requester_role === 'merchant' ? '👑 تاجر' : '👤 مستخدم'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: mutC }}>
                        <span className="font-bold text-foreground">
                          المقدم: {claim.requester_name}
                        </span>
                        <span>•</span>
                        <a
                          href={`https://wa.me/20${claim.requester_whatsapp.replace(/^0+/, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 hover:underline"
                          dir="ltr"
                        >
                          <Phone className="w-3 h-3 text-emerald-500" />
                          {claim.requester_whatsapp}
                        </a>
                        <span>•</span>
                        <span className="text-[11px]">
                          {new Date(claim.created_at).toLocaleString('ar-EG')}
                        </span>
                      </div>
                    </div>

                    {/* أزرار اتخاذ القرار (قبول / رفض) */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => handleApprove(claim)}
                        disabled={isSubmittingReview}
                        className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>موافقة واعتماد</span>
                      </button>

                      <button
                        onClick={() => {
                          setRejectingClaim(claim);
                          setRejectionReason('هذا الرقم غير خاص بك');
                        }}
                        disabled={isSubmittingReview}
                        className="h-8 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>رفض مع سبب</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── التبويب الثاني: كلمات سر أنا فودافون المستلمة ── */}
        {activeTab === 'passwords' && (
          <div className="space-y-2.5">
            {linesWithAnaPassword.length === 0 ? (
              <div className="p-8 rounded-2xl border text-center space-y-2" style={{ background: cardBg, borderColor: cardBdr }}>
                <KeyRound className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  لا توجد كلمات سر مرسلة حتى الآن
                </h3>
                <p className="text-xs" style={{ color: mutC }}>
                  عند تحويل أي خط لنظام ريد، سيطلب التطبيق من العميل أو التاجر إدخال كلمة سر أنا فودافون الجديدة وستظهر لك هنا مباشرة.
                </p>
              </div>
            ) : (
              linesWithAnaPassword.map(line => {
                const isRevealed = Boolean(revealedPasswords[line.id]);
                return (
                  <div
                    key={line.id}
                    className="p-3 sm:p-4 rounded-2xl border space-y-2 transition-all shadow-xs"
                    style={{ background: cardBg, borderColor: cardBdr }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-black tracking-wider" dir="ltr" style={{ color: textC }}>
                            {line.phone_number}
                          </span>
                          {line.customer_name && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-muted text-foreground">
                              👤 {line.customer_name}
                            </span>
                          )}
                          {line.merchant && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600">
                              👑 {line.merchant.name}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px]" style={{ color: mutC }}>
                          تاريخ استلام الباسورد:{' '}
                          {line.ana_vodafone_password_updated_at
                            ? new Date(line.ana_vodafone_password_updated_at).toLocaleString('ar-EG')
                            : 'غير محدد'}
                        </p>
                      </div>

                      {/* عرض كلمة المرور ونسخها */}
                      <div className="flex items-center gap-2 shrink-0 bg-muted/40 p-1.5 rounded-xl border" style={{ borderColor: cardBdr }}>
                        <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="font-mono text-sm font-black tracking-wider px-2" dir="ltr">
                          {isRevealed ? line.ana_vodafone_password : '••••••••'}
                        </span>

                        <button
                          onClick={() => togglePasswordReveal(line.id)}
                          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition"
                          title={isRevealed ? 'إخفاء' : 'عرض'}
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                        </button>

                        <button
                          onClick={() => copyToClipboard(line.ana_vodafone_password || '', 'كلمة السر')}
                          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition"
                          title="نسخ كلمة السر"
                        >
                          <Copy className="w-3.5 h-3.5 text-blue-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── التبويب الثالث: سجل الطلبات السابقة ── */}
        {activeTab === 'history' && (
          <div className="space-y-2.5">
            {historyClaims.length === 0 ? (
              <div className="p-8 rounded-2xl border text-center space-y-2" style={{ background: cardBg, borderColor: cardBdr }}>
                <Layers className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <h3 className="text-sm font-black" style={{ color: textC }}>
                  لا توجد طلبات سابقة في السجل
                </h3>
              </div>
            ) : (
              historyClaims.map(claim => (
                <div
                  key={claim.id}
                  className="p-3 rounded-xl border space-y-1.5 transition-all shadow-xs"
                  style={{ background: cardBg, borderColor: cardBdr }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-black" dir="ltr">
                        {claim.phone_number}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground">
                        ({claim.requester_name})
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        claim.status === 'approved'
                          ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-600 border border-rose-500/30'
                      }`}
                    >
                      {claim.status === 'approved' ? '✅ تم الاعتماد' : '❌ تم الرفض'}
                    </span>
                  </div>

                  {claim.status === 'rejected' && claim.rejection_reason && (
                    <p className="text-xs text-rose-600 dark:text-rose-400">
                      سبب الرفض: {claim.rejection_reason}
                    </p>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    تمت المراجعة في: {claim.reviewed_at ? new Date(claim.reviewed_at).toLocaleString('ar-EG') : '—'}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* ── نافذة تأكيد الرفض مع كتابة السبب ── */}
      {rejectingClaim && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="w-full max-w-md p-4 sm:p-5 rounded-2xl border space-y-3 shadow-2xl animate-in fade-in zoom-in-95"
            style={{ background: cardBg, borderColor: cardBdr }}
          >
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm sm:text-base font-black">
                رفض طلب ربط الرقم {rejectingClaim.phone_number}
              </h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              يرجى كتابة سبب الرفض ليظهر للمستخدم/التاجر «{rejectingClaim.requester_name}» في إشعار واضح:
            </p>

            <div className="space-y-1.5">
              <input
                type="text"
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="اكتب سبب الرفض هنا..."
                className="w-full h-10 px-3 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['هذا الرقم غير خاص بك', 'الرقم مسجل باسم تاجر آخر', 'يرجى مراجعة الإدارة أولاً'].map(
                  preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectionReason(preset)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted hover:bg-muted/80 text-foreground transition"
                    >
                      {preset}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: cardBdr }}>
              <button
                type="button"
                onClick={() => setRejectingClaim(null)}
                className="h-8 px-3 rounded-xl border text-xs font-bold transition"
                style={{ background: innerBg, borderColor: cardBdr, color: textC }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isSubmittingReview || !rejectionReason.trim()}
                className="h-8 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs transition active:scale-95 disabled:opacity-50"
              >
                {isSubmittingReview ? 'جاري الرفض...' : 'تأكيد الرفض'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
