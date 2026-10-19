import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RotateCcw,
  RefreshCw,
  Clock,
  Layers,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Cpu,
  Info,
  TrendingUp,
} from 'lucide-react';
import type { VipCycleRecord, VipSession } from '@/types/vip';
import { getVipCycleHistory } from '@/lib/vipApi';

interface Props {
  session: VipSession;
  initialCycles?: VipCycleRecord[];
  onRefresh: () => void;
}

export function VipCycleHistoryTab({ session, initialCycles = [], onRefresh }: Props) {
  const [cycles, setCycles] = useState<VipCycleRecord[]>(initialCycles);
  const [loading, setLoading] = useState(false);

  const loadCycles = async () => {
    setLoading(true);
    try {
      const data = await getVipCycleHistory(session.id, 50);
      setCycles(data);
    } catch (err) {
      console.error('[VipCycleHistory] Failed to load cycles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCycles && initialCycles.length > 0) {
      setCycles(initialCycles);
    } else {
      loadCycles();
    }
  }, [session.id, initialCycles]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-xs">مكتملة بنجاح</Badge>;
      case 'stopped_at_target':
        return <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">تم بلوغ الهدف</Badge>;
      case 'running':
        return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-xs animate-pulse">قيد التنفيذ</Badge>;
      case 'failed':
        return <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs">فشلت الدورة</Badge>;
      case 'pending_integration':
      default:
        return <Badge className="bg-sky-500/15 text-sky-500 border-sky-500/30 text-xs">بانتظار التكامل</Badge>;
    }
  };

  const renderBalance = (val: number | null | undefined) => {
    if (val === null || val === undefined) {
      return <span className="text-muted-foreground text-xs font-mono">-</span>;
    }
    return (
      <span className="font-semibold text-foreground font-mono">
        {val.toLocaleString('ar-EG')} <span className="text-[10px] text-muted-foreground font-normal">ميكس</span>
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                سجل تقدم الدورات التفصيلي (Cycle-by-Cycle History)
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-500">
                {session.session_name}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              تتبع دقيق دورة بدورة يوضح كميات التحويلات، تغييرات الأنظمة، والرصيد المحقق باتجاه الهدف
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadCycles}
          disabled={loading}
          className="h-8 text-xs gap-1.5 shrink-0 border-border self-end sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          تحديث الدورات
        </Button>
      </div>

      {/* Cycle Statistics Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-card border border-border/80 flex flex-col justify-between">
          <span className="text-muted-foreground text-[11px]">إجمالي الدورات المسجلة</span>
          <span className="text-lg font-bold text-foreground mt-1">
            {cycles.length} <span className="text-xs font-normal text-muted-foreground">دورة</span>
          </span>
        </div>

        <div className="p-3 rounded-xl bg-card border border-border/80 flex flex-col justify-between">
          <span className="text-muted-foreground text-[11px]">الدورة الحالية النشطة</span>
          <span className="text-lg font-bold text-amber-500 mt-1">
            #{session.current_cycle || 0}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-card border border-border/80 flex flex-col justify-between">
          <span className="text-muted-foreground text-[11px]">الرصيد المستهدف للجلسة</span>
          <span className="text-lg font-bold text-primary mt-1">
            {session.target_mix_balance?.toLocaleString('ar-EG') || '50,000'}{' '}
            <span className="text-xs font-normal text-muted-foreground">ميكس</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-card border border-border/80 flex flex-col justify-between">
          <span className="text-muted-foreground text-[10px]">حالة المحرك وفترة الانتظار</span>
          <span className="text-xs font-semibold text-foreground mt-1 flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${session.worker_status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-primary'}`}></span>
            {session.worker_status || 'idle'} ({session.cycle_delay_seconds || 20}ث)
          </span>
        </div>
      </div>

      {/* Cycles List or Empty State */}
      <Card className="border border-border/80 bg-card">
        <CardHeader className="p-4 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                قائمة الدورات التفصيلية للجلسة
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                تعرض كل دورة كافة تفاصيل البداية والنهاية والتحويل بين الأونر والفرد
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {cycles.length} دورة
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {cycles.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 border border-border flex items-center justify-center mx-auto text-muted-foreground">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">لا توجد دورات مسجلة لهذه الجلسة بعد</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  يتم تسجيل الدورات تلقائياً بمجرد إطلاق وتفعيل دورات الأتمتة المجدولة أو تنفيذ دورة تجديد وتحويل ميكسات.
                </p>
              </div>
              <div className="pt-2">
                <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">
                  حالة المرحلة: بانتظار اكتمال ربط محرك التشغيل الخلفي
                </Badge>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {cycles.map((c) => (
                <div key={c.id} className="p-4 hover:bg-muted/20 transition-colors space-y-3 text-xs">
                  {/* Top Bar of Cycle */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">دورة #{c.cycle_number}</span>
                      {getStatusBadge(c.cycle_status)}
                      {c.increased_owner_balance && (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                          + زيادة رصيد الأونر
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(c.started_at).toLocaleString('ar-EG')}
                      </span>
                      {c.duration_seconds !== null && (
                        <span>المدة: {c.duration_seconds} ثانية</span>
                      )}
                    </div>
                  </div>

                  {/* Deep Fields Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 p-3 rounded-xl bg-muted/30 border border-border/50 text-[11px]">
                    <div>
                      <span className="text-muted-foreground block">رصيد الأونر عند البداية:</span>
                      <div className="mt-0.5">{renderBalance(c.owner_balance_start)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">رصيد الأونر بعد التجديد:</span>
                      <div className="mt-0.5">{renderBalance(c.owner_balance_post_renewal)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">المحول من الأونر للفرد:</span>
                      <div className="mt-0.5 text-amber-500 font-semibold font-mono">
                        {c.amount_transferred_owner_to_indiv ? `${c.amount_transferred_owner_to_indiv.toLocaleString('ar-EG')} ميكس` : '-'}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">المحول من الفرد للأونر:</span>
                      <div className="mt-0.5 text-emerald-500 font-semibold font-mono">
                        {c.amount_transferred_indiv_to_owner ? `${c.amount_transferred_indiv_to_owner.toLocaleString('ar-EG')} ميكس` : '-'}
                      </div>
                    </div>
                  </div>

                  {/* Migration & Target Progress */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] px-1">
                    <div className="flex items-center justify-between py-1 border-b sm:border-b-0 border-border/40">
                      <span className="text-muted-foreground">ترحيل النظام:</span>
                      <span className="font-medium text-foreground">
                        {c.system_pre_migration || 'غير محدد'} ← {c.system_post_migration || 'غير محدد'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b sm:border-b-0 border-border/40">
                      <span className="text-muted-foreground">الرصيد النهائي المحقق:</span>
                      <div>{renderBalance(c.final_verified_owner_balance)}</div>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span className="text-muted-foreground">المتبقي للهدف:</span>
                      <span className="font-semibold text-primary font-mono">
                        {c.difference_to_target !== null
                          ? `${c.difference_to_target.toLocaleString('ar-EG')} ميكس`
                          : 'بانتظار الحساب'}
                      </span>
                    </div>
                  </div>

                  {/* Failure Step / Error Note if any */}
                  {c.failure_step && (
                    <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] space-y-0.5">
                      <span className="font-semibold block">خطوة التعثر: {c.failure_step}</span>
                      {c.safe_error_summary && <p>{c.safe_error_summary}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
