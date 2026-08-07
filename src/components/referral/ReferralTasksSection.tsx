// قسم المهام — نظام مكافآت الإحالات
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Clock, Trophy, Loader2, Lock, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { rwGetTasksWithProgress, rwClaimReward, type ReferralTaskProgress } from '@/lib/api';

interface Props {
  onClaimed?: () => void;
}

export default function ReferralTasksSection({ onClaimed }: Props) {
  const { user } = useAuth();
  const [tasks, setTasks]             = useState<ReferralTaskProgress[]>([]);
  const [progress, setProgress]       = useState(0);
  const [claimsEnabled, setClaimsEnabled] = useState(true);
  const [systemEnabled, setSystemEnabled] = useState(true);
  const [loading, setLoading]         = useState(true);
  const [claiming, setClaiming]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const res = await rwGetTasksWithProgress(user.id);
    setSystemEnabled(res.enabled);
    setTasks(res.tasks);
    setProgress(res.current_progress);
    setClaimsEnabled(res.claims_enabled);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleClaim = async (task: ReferralTaskProgress) => {
    if (!user?.id) return;
    setClaiming(task.id);
    const res = await rwClaimReward(user.id, task.id);
    if (res.success) {
      toast.success(`🎉 تم المطالبة بـ ${res.reward_value} عملية بنجاح!`);
      await load();
      onClaimed?.();
    } else {
      const msgs: Record<string, string> = {
        already_claimed:      'سبق المطالبة بهذه المهمة',
        claims_disabled:      'المطالبات متوقفة مؤقتاً',
        task_inactive:        'المهمة غير نشطة',
        task_expired:         'انتهت صلاحية المهمة',
        insufficient_referrals: `تحتاج ${task.required_referrals} دعوات مقبولة`,
        daily_limit_reached:  'وصلت الحد اليومي للمطالبات',
        system_disabled:      'النظام متوقف مؤقتاً',
      };
      toast.error(msgs[res.reason ?? ''] ?? 'فشلت المطالبة — حاول مجدداً');
    }
    setClaiming(null);
  };

  if (loading) return (
    <Card className="border-border">
      <CardContent className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">جارٍ تحميل المهام...</span>
      </CardContent>
    </Card>
  );

  if (!systemEnabled) return (
    <Card className="border-border">
      <CardContent className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
        <Lock className="w-8 h-8" />
        <p className="text-sm font-medium">نظام المهام متوقف مؤقتاً</p>
      </CardContent>
    </Card>
  );

  if (tasks.length === 0) return (
    <Card className="border-border">
      <CardContent className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
        <Trophy className="w-8 h-8" />
        <p className="text-sm font-medium">لا توجد مهام نشطة حالياً</p>
      </CardContent>
    </Card>
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          مهام الإحالة
          <Badge variant="secondary" className="font-mono text-xs">{progress} دعوة مقبولة</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map(task => {
          const pct = Math.min(100, Math.round((progress / task.required_referrals) * 100));
          const done = task.is_completed;
          const claimed = task.claim_status === 'claimed';
          const canClaim = done && task.claim_status === 'unclaimed' && claimsEnabled;

          return (
            <div
              key={task.id}
              className={`rounded-lg border p-3.5 transition-colors ${
                claimed ? 'border-success/30 bg-success/5' :
                done    ? 'border-primary/30 bg-primary/5' :
                          'border-border bg-card'
              }`}
            >
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="shrink-0 mt-0.5">
                    {claimed
                      ? <CheckCircle2 className="w-4 h-4 text-success" />
                      : done
                      ? <Star className="w-4 h-4 text-primary animate-pulse" />
                      : <Circle className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{progress} / {task.required_referrals} دعوة</span>
                      <span className="text-primary font-medium">+{task.reward_value} عملية</span>
                      {task.ends_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(task.ends_at).toLocaleDateString('ar-EG')}
                        </span>
                      )}
                    </div>
                    {!claimed && (
                      <Progress value={pct} className="h-1.5 mt-1.5" />
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {claimed ? (
                    <Badge variant="outline" className="text-success border-success/40 text-xs whitespace-nowrap">
                      ✓ تم المطالبة
                    </Badge>
                  ) : canClaim ? (
                    <Button
                      size="sm"
                      className="h-8 text-xs px-3 bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
                      disabled={claiming === task.id}
                      onClick={() => handleClaim(task)}
                    >
                      {claiming === task.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : 'مطالبة بالمكافأة'
                      }
                    </Button>
                  ) : !done ? (
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">
                      {pct}%
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">
                      {task.claim_status === 'rejected' ? 'مرفوضة' : 'معلقة'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
