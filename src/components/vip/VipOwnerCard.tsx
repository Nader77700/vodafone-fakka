import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown, Phone, Sparkles, RefreshCw, Layers } from 'lucide-react';
import type { VipSession } from '@/types/vip';

interface Props {
  session: VipSession;
  onQuickCheck: () => void;
  checking: boolean;
}

export function VipOwnerCard({ session, onQuickCheck, checking }: Props) {
  const isSeven = session.owner_current_plan?.includes('7') || session.owner_current_plan?.includes('270');
  const isSix = session.owner_current_plan?.includes('6') || session.owner_current_plan?.includes('180');

  const formatBalance = (val: number | null | undefined) => {
    if (val === null || val === undefined) {
      return <span className="text-muted-foreground text-xs font-normal">بانتظار الفحص</span>;
    }
    return (
      <span className="font-mono font-bold text-foreground">
        {val.toLocaleString('ar-EG')} <span className="text-xs font-normal text-muted-foreground">ميكس</span>
      </span>
    );
  };

  return (
    <Card className="border border-border/80 bg-card/90 shadow-sm relative overflow-hidden" dir="rtl">
      <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
      
      <CardHeader className="p-3 pb-2 border-b border-border/50 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Crown className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-xs font-bold text-foreground">بيانات خط الأونر (Owner Line)</CardTitle>
            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
              {session.owner_email || 'البريد غير متوفر'}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onQuickCheck}
          disabled={checking}
          className="h-7 text-xs px-2 gap-1 border-border"
        >
          <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">فحص الأونر</span>
        </Button>
      </CardHeader>

      <CardContent className="p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          {/* Phone Number */}
          <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
            <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
              <Phone className="w-3 h-3 text-primary" />
              رقم خط الأونر
            </span>
            <span className="font-mono text-xs font-bold text-foreground mt-0.5 block truncate">
              {session.owner_account_identifier || 'يُستخرج آلياً بعد الدخول'}
            </span>
          </div>

          {/* Current Plan */}
          <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
            <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
              <Layers className="w-3 h-3 text-amber-500" />
              النظام الحالي
            </span>
            <div className="mt-0.5 flex items-center gap-1">
              {isSeven ? (
                <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] px-1 py-0">
                  Parent 7 (270ج)
                </Badge>
              ) : isSix ? (
                <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px] px-1 py-0">
                  Parent 6 (180ج)
                </Badge>
              ) : (
                <span className="text-xs font-mono font-bold text-muted-foreground truncate">
                  {session.owner_current_plan || 'غير محدد'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Current Mix Balance */}
        <div className="p-2.5 rounded-lg bg-gradient-to-l from-amber-500/10 via-background to-background border border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center text-amber-500">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">رصيد ميكسات الأونر المتبقية</span>
              <div className="text-sm">{formatBalance(session.owner_mix_balance)}</div>
            </div>
          </div>

          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500">
            {(session.owner_account_status as string) === 'connected' || session.owner_account_status === 'verified'
              ? 'متصل بالخادم'
              : 'جاهز للاتصال'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
