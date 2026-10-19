import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  Repeat,
  SendHorizontal,
  ArrowLeftRight,
  Download,
  Sliders,
  Loader2,
} from 'lucide-react';

interface Props {
  onCheckStatus: () => void;
  onRenewBundle: () => void;
  onTransferToChild: () => void;
  onChangePlan: () => void;
  onReturnChildMixes: () => void;
  loadingAction: string | null;
}

export function VipManualActionsBar({
  onCheckStatus,
  onRenewBundle,
  onTransferToChild,
  onChangePlan,
  onReturnChildMixes,
  loadingAction,
}: Props) {
  const isAnyLoading = loadingAction !== null;

  return (
    <Card className="border border-border/80 bg-card/90 shadow-sm" dir="rtl">
      <CardHeader className="p-3 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-xs font-bold text-foreground">
              التحكم اليدوي المباشر لوظائف السكريبت (Manual Triggers)
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">
              تنفيذ أي خطوة منفردة مباشرة عبر واجهات Etisalat MAB API مع التوثيق في الطرفية
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {/* Action 1: Check Status */}
          <Button
            variant="outline"
            size="sm"
            onClick={onCheckStatus}
            disabled={isAnyLoading}
            className="h-10 text-xs px-2 flex flex-col items-center justify-center border-border hover:bg-muted"
          >
            {loadingAction === 'check_status' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
            )}
            <span className="text-[10px] font-bold mt-0.5">فحص شامل للحالة</span>
          </Button>

          {/* Action 2: Renew Bundle */}
          <Button
            variant="outline"
            size="sm"
            onClick={onRenewBundle}
            disabled={isAnyLoading}
            className="h-10 text-xs px-2 flex flex-col items-center justify-center border-border hover:bg-muted"
          >
            {loadingAction === 'renew_bundle' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
            ) : (
              <Repeat className="w-3.5 h-3.5 text-amber-500" />
            )}
            <span className="text-[10px] font-bold mt-0.5">تجديد الباقة (270/180)</span>
          </Button>

          {/* Action 3: Transfer to Child */}
          <Button
            variant="outline"
            size="sm"
            onClick={onTransferToChild}
            disabled={isAnyLoading}
            className="h-10 text-xs px-2 flex flex-col items-center justify-center border-border hover:bg-muted"
          >
            {loadingAction === 'transfer_to_child' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
            ) : (
              <SendHorizontal className="w-3.5 h-3.5 text-blue-500" />
            )}
            <span className="text-[10px] font-bold mt-0.5">تحويل ميكسات للفرد</span>
          </Button>

          {/* Action 4: Change Plan */}
          <Button
            variant="outline"
            size="sm"
            onClick={onChangePlan}
            disabled={isAnyLoading}
            className="h-10 text-xs px-2 flex flex-col items-center justify-center border-border hover:bg-muted"
          >
            {loadingAction === 'change_plan' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
            ) : (
              <ArrowLeftRight className="w-3.5 h-3.5 text-purple-500" />
            )}
            <span className="text-[10px] font-bold mt-0.5">ترحيل النظام (7 ⟵⟶ 6)</span>
          </Button>

          {/* Action 5: Return Child Mixes */}
          <Button
            variant="outline"
            size="sm"
            onClick={onReturnChildMixes}
            disabled={isAnyLoading}
            className="col-span-2 sm:col-span-1 h-10 text-xs px-2 flex flex-col items-center justify-center border-border hover:bg-muted"
          >
            {loadingAction === 'return_child_mixes' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
            ) : (
              <Download className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span className="text-[10px] font-bold mt-0.5">استرجاع ميكسات الفرد</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
