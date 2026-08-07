// صفحة الإحالات — نظام الإحالات المرحلة الأولى + المرحلة الثانية (مكافآت)
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Share2, Copy, Check, Users, Clock, XCircle, CheckCircle, Gift, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getOrCreateReferralCode,
  getReferralStats,
  getReferralRecords,
  getReferralSettings,
  type ReferralStats,
  type ReferralRecord,
  type ReferralSettings,
} from '@/lib/api';
import ReferralBalanceCard from '@/components/referral/ReferralBalanceCard';
import ReferralTasksSection from '@/components/referral/ReferralTasksSection';
import ReferralRewardsLog, { type ReferralRewardsLogHandle } from '@/components/referral/ReferralRewardsLog';

const APP_BASE_URL = window.location.origin;

const STATUS_MAP: Record<string, { label: string; icon: React.FC<{ className?: string }>; cls: string }> = {
  accepted: { label: 'مقبولة',  icon: CheckCircle, cls: 'text-success bg-success/10 border-success/20' },
  pending:  { label: 'معلقة',   icon: Clock,       cls: 'text-warning bg-warning/10 border-warning/20' },
  rejected: { label: 'مرفوضة', icon: XCircle,     cls: 'text-destructive bg-destructive/10 border-destructive/20' },
};

export default function ReferralPage() {
  const { profile } = useAuth();

  const [code,     setCode]     = useState<string | null>(null);
  const [stats,    setStats]    = useState<ReferralStats>({ code: null, accepted: 0, pending: 0, rejected: 0, total: 0 });
  const [records,  setRecords]  = useState<(ReferralRecord & { referred_username?: string })[]>([]);
  const [settings, setSettings] = useState<ReferralSettings>({ system_enabled: true, accepting_referrals: true, counting_paused: false });
  const [loading,  setLoading]  = useState(true);

  const [codeCopied, setCodeCopied]   = useState(false);
  const [linkCopied, setLinkCopied]   = useState(false);

  // مرجع لإعادة تحميل سجل المكافآت بعد المطالبة/التحويل
  const rewardsLogRef = useRef<ReferralRewardsLogHandle | null>(null);
  const loadBalance = useCallback(() => {
    rewardsLogRef.current?.reload();
  }, []);

  const referralLink = code ? `${APP_BASE_URL}/ref/${code}` : '';

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const [fetchedCode, fetchedStats, fetchedRecords, fetchedSettings] = await Promise.all([
      getOrCreateReferralCode(profile.id),
      getReferralStats(profile.id),
      getReferralRecords(profile.id),
      getReferralSettings(),
    ]);
    setCode(fetchedCode);
    setStats(fetchedStats);
    setRecords(fetchedRecords);
    setSettings(fetchedSettings);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCodeCopied(true);
    toast.success('تم نسخ كود الإحالة');
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setLinkCopied(true);
    toast.success('تم نسخ رابط الإحالة');
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const shareLink = async () => {
    if (!referralLink) return;
    const text = `🎯 انضم إلى Vodafone Fakka Premium باستخدام كود الدعوة الخاص بي:\n\n🔑 الكود: ${code}\n🔗 الرابط: ${referralLink}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'دعوة للانضمام', text, url: referralLink }); return; }
      catch { /* أُغلق */ }
    }
    await copyLink();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!settings.system_enabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <Gift className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-center">نظام الإحالات غير متاح حالياً</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* ── العنوان ── */}
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary shrink-0" />
          الإحالات
        </h1>
        <p className="text-sm text-muted-foreground">ادعُ أصدقاءك وتابع دعواتك من هنا</p>
      </div>

      {/* ── كود ورابط الدعوة ── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">كود ورابط دعوتك</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* كود الدعوة */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">كود الدعوة</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-muted/60 rounded-lg px-4 py-3 border border-border">
                <span className="font-mono font-bold text-lg tracking-[0.25em] text-foreground select-all">
                  {code ?? '...'}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={copyCode}
              >
                {codeCopied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">{codeCopied ? 'تم النسخ' : 'نسخ'}</span>
              </Button>
            </div>
          </div>

          {/* رابط الدعوة */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">رابط الدعوة</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-muted/60 rounded-lg px-3 py-2.5 border border-border overflow-hidden">
                <span className="text-xs text-muted-foreground truncate block" dir="ltr">
                  {referralLink}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={copyLink}
              >
                {linkCopied ? <Check className="w-3.5 h-3.5 text-success" /> : <Link2 className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">{linkCopied ? 'تم النسخ' : 'نسخ'}</span>
              </Button>
              <Button
                size="sm"
                className="shrink-0 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={shareLink}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">مشاركة</span>
              </Button>
            </div>
          </div>

          {!settings.accepting_referrals && (
            <p className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
              ⚠️ استقبال الدعوات متوقف مؤقتاً
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── إحصائيات الدعوات ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'مقبولة',   value: stats.accepted, icon: CheckCircle, cls: 'text-success' },
          { label: 'معلقة',    value: stats.pending,  icon: Clock,       cls: 'text-warning' },
          { label: 'مرفوضة',  value: stats.rejected, icon: XCircle,     cls: 'text-destructive' },
          { label: 'الإجمالي', value: stats.total,    icon: Users,       cls: 'text-primary' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className="border-border bg-card">
            <CardContent className="p-4 flex flex-col items-center gap-1.5">
              <Icon className={`w-5 h-5 ${cls}`} />
              <span className="text-2xl font-bold text-foreground">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── قائمة الدعوات ── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            الأشخاص الذين دعوتهم
            {records.length > 0 && (
              <Badge variant="secondary" className="text-xs mr-auto">{records.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
              <Users className="w-10 h-10 opacity-30" />
              <p className="text-sm">لا توجد دعوات بعد — شارك كودك وابدأ!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {records.map(r => {
                const s = STATUS_MAP[r.status] ?? STATUS_MAP.pending;
                const Icon = s.icon;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">
                        {(r.referred_username ?? '?')[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {r.referred_username ?? r.referred_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.referred_at).toLocaleDateString('ar-EG')}
                      </p>
                    </div>
                    <Badge className={`text-xs border shrink-0 ${s.cls}`}>
                      <Icon className="w-3 h-3 ml-1" />
                      {s.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══ المرحلة الثانية: مكافآت الإحالات ══ */}
      <ReferralBalanceCard onTransferred={loadBalance} />
      <ReferralTasksSection onClaimed={loadBalance} />
      <ReferralRewardsLog ref={rewardsLogRef} />
    </div>
  );
}
