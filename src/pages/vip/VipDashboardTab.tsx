import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  UserCheck,
  Users,
  Cpu,
  Layers,
  Zap,
  RefreshCw,
  Clock,
  ShieldCheck,
  TrendingUp,
  Target,
  ArrowRight,
  Flame,
  Activity,
  Play,
  RotateCcw,
} from 'lucide-react';
import type { VipDashboardData, VipSession } from '@/types/vip';

interface Props {
  data: VipDashboardData;
  activeSession: VipSession;
  onRefresh: () => void;
  refreshing: boolean;
  onNavigateTab: (tab: string) => void;
}

export function VipDashboardTab({
  data,
  activeSession,
  onRefresh,
  refreshing,
  onNavigateTab,
}: Props) {
  const { supported_systems } = data;
  const session = activeSession;

  // Format balances: Never fabricate numbers; null means waiting for data connection
  const renderBalance = (val: number | null | undefined) => {
    if (val === null || val === undefined) {
      return (
        <span className="text-[10px] text-amber-500 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20 inline-flex items-center gap-1">
          <Clock className="w-2.5 h-2.5 shrink-0" />
          بانتظار الربط
        </span>
      );
    }
    return (
      <span className="text-sm font-bold text-foreground font-mono">
        {val.toLocaleString('ar-EG')} <span className="text-[10px] font-normal text-muted-foreground">ميكس</span>
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
      case 'linked_and_verified':
        return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] px-1 py-0">تم التحقق</Badge>;
      case 'pending_verification':
        return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px] px-1 py-0">قيد التحقق</Badge>;
      case 'not_connected':
      default:
        return <Badge variant="outline" className="text-muted-foreground border-border text-[10px] px-1 py-0">غير متصل</Badge>;
    }
  };

  const ownerSystem = supported_systems.find((s) => s.id === session.owner_current_plan);
  const isAutoEligible = ownerSystem ? ownerSystem.is_auto_eligible : false;

  const targetBalance = session.target_mix_balance || 50000;
  const currentOwnerBalance = session.owner_mix_balance;
  const hasKnownBalance = currentOwnerBalance !== null && currentOwnerBalance !== undefined;
  const progressPercent = hasKnownBalance
    ? Math.min(100, Math.round((currentOwnerBalance / targetBalance) * 100))
    : 0;

  return (
    <div className="space-y-2.5 max-w-5xl" dir="rtl">
      {/* ── Compact Header Banner ── */}
      <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-foreground truncate">
                جلسة «{session.session_name}»
              </span>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0">
                VIP Active
              </Badge>
              {session.automation_enabled && (
                <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] px-1.5 py-0 animate-pulse">
                  الأتمتة نشطة
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {session.owner_account_identifier || 'الأونر لم يُحدد'} ⟵ {session.individual_account_identifier || 'الفرد لم يُحدد'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={() => onNavigateTab('automation')}
            className="h-7 text-xs px-2.5 bg-primary text-primary-foreground gap-1 font-bold"
          >
            <Zap className="w-3 h-3" />
            <span className="hidden sm:inline">التحكم بالأتمتة</span>
          </Button>
        </div>
      </div>

      {/* ── Dense 4-Metric Grid (Matching Vodafone Red Density) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Metric 1: Owner */}
        <div className="p-2.5 rounded-xl border border-border/70 bg-card">
          <div className="flex items-center justify-between text-muted-foreground text-[10px]">
            <span className="flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-primary" />
              حساب الأونر
            </span>
            {getStatusBadge(session.owner_account_status)}
          </div>
          <div className="mt-1">
            {renderBalance(session.owner_mix_balance)}
          </div>
          <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
            {session.owner_account_identifier || 'لم يسجل رقم'}
          </span>
        </div>

        {/* Metric 2: Individual */}
        <div className="p-2.5 rounded-xl border border-border/70 bg-card">
          <div className="flex items-center justify-between text-muted-foreground text-[10px]">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-blue-500" />
              حساب الفرد
            </span>
            {getStatusBadge(session.individual_account_status)}
          </div>
          <div className="mt-1">
            {renderBalance(session.individual_mix_balance)}
          </div>
          <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
            {session.individual_account_identifier || 'لم يسجل رقم'}
          </span>
        </div>

        {/* Metric 3: Current Plan */}
        <div className="p-2.5 rounded-xl border border-border/70 bg-card">
          <div className="flex items-center justify-between text-muted-foreground text-[10px]">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-amber-500" />
              النظام الحالي
            </span>
            {isAutoEligible ? (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[9px] px-1 py-0">مؤهل</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[9px] px-1 py-0">Hekaya 6/7</Badge>
            )}
          </div>
          <div className="text-xs font-bold text-foreground font-mono mt-1 truncate">
            {session.owner_current_plan || 'Hekaya 7/6'}
          </div>
          <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
            تجديد 270 / 180 ج
          </span>
        </div>

        {/* Metric 4: Target & Delay */}
        <div className="p-2.5 rounded-xl border border-border/70 bg-card">
          <div className="flex items-center justify-between text-muted-foreground text-[10px]">
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3 text-emerald-500" />
              الهدف والانتظار
            </span>
            <span className="text-[10px] font-mono text-primary font-bold">
              {progressPercent}%
            </span>
          </div>
          <div className="text-xs font-bold text-foreground font-mono mt-1">
            {targetBalance.toLocaleString('ar-EG')} ميكس
          </div>
          <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
            انتظار: {session.cycle_delay_seconds || 20} ثانية
          </span>
        </div>
      </div>

      {/* ── Realtime Automation Progress & Execution Bar ── */}
      <Card className="border border-border/70 bg-card p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold flex items-center gap-1.5 text-foreground">
              <Activity className="w-3.5 h-3.5 text-primary" />
              تقدم الهدف لدورات الأتمتة (دورة #{session.current_cycle || 0})
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {hasKnownBalance ? `${currentOwnerBalance?.toLocaleString('ar-EG')} / ${targetBalance.toLocaleString('ar-EG')} ميكس` : `الهدف: ${targetBalance.toLocaleString('ar-EG')} ميكس`}
            </span>
          </div>

          <Progress value={progressPercent} className="h-1.5 bg-muted" />

          <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>المشغل: <strong className="text-foreground">{session.worker_status || 'idle'}</strong></span>
              <span>•</span>
              <span>زمن الاستراحة: <strong className="text-foreground">{session.cycle_delay_seconds || 20}ث</strong></span>
              <span>•</span>
              <span>فحص النظام: <strong className="text-foreground">كل 2ث</strong></span>
            </div>
            <Button
              variant="link"
              size="sm"
              onClick={() => onNavigateTab('cycles')}
              className="text-[11px] h-auto p-0 text-primary gap-1"
            >
              عرض سجل الدورات
              <ArrowRight className="w-3 h-3 rotate-180" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
