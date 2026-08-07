// كارت رصيد الإحالات + نافذة التحويل
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Wallet, ArrowRightLeft, Loader2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { rwGetBalance, rwTransferBalance, type ReferralBalance } from '@/lib/api';

interface Props {
  onTransferred?: () => void;
}

function fmt(n: number) { return n.toLocaleString('ar-EG'); }
function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ReferralBalanceCard({ onTransferred }: Props) {
  const { user }    = useAuth();
  const [bal, setBal]           = useState<ReferralBalance | null>(null);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const b = await rwGetBalance(user.id);
    setBal(b);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleTransfer = async () => {
    if (!user?.id || !bal) return;
    setConfirming(true);
    const res = await rwTransferBalance(user.id);
    if (res.success) {
      toast.success(`✅ تم تحويل ${fmt(res.transferred!)} عملية — صالحة حتى ${fmtDate(res.valid_until!)}`);
      setOpen(false);
      await load();
      onTransferred?.();
    } else {
      const msgs: Record<string, string> = {
        below_minimum:        `الحد الأدنى للتحويل ${bal.min_transfer} عملية`,
        insufficient_balance: 'الرصيد غير كافٍ',
        transfers_disabled:   'التحويلات متوقفة مؤقتاً',
        system_disabled:      'النظام متوقف مؤقتاً',
        no_balance:           'لا يوجد رصيد',
      };
      toast.error(msgs[res.reason ?? ''] ?? 'فشل التحويل');
    }
    setConfirming(false);
  };

  if (loading || !bal) return (
    <Card className="border-border">
      <CardContent className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );

  const canTransfer = bal.available >= bal.min_transfer && bal.transfers_enabled;

  return (
    <>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              رصيد الإحالات
            </CardTitle>
            <Button
              size="sm"
              variant={canTransfer ? 'default' : 'outline'}
              disabled={!canTransfer}
              className={`h-8 text-xs gap-1.5 ${canTransfer ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
              onClick={() => setOpen(true)}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              تحويل
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
              <p className="text-xl font-bold text-foreground font-mono">{fmt(bal.total_earned)}</p>
              <p className="text-xs text-muted-foreground">إجمالي المكتسبة</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
              <p className="text-xl font-bold text-foreground font-mono">{fmt(bal.total_used)}</p>
              <p className="text-xs text-muted-foreground">إجمالي المستخدمة</p>
            </div>
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 space-y-0.5">
              <p className="text-xl font-bold text-primary font-mono">{fmt(bal.available)}</p>
              <p className="text-xs text-muted-foreground">المتبقي</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>
              <span className="text-foreground/60">آخر مطالبة: </span>
              <span>{fmtDate(bal.last_claim_at)}</span>
            </div>
            <div>
              <span className="text-foreground/60">آخر تحويل: </span>
              <span>{fmtDate(bal.last_transfer_at)}</span>
            </div>
          </div>
          {!bal.transfers_enabled && (
            <p className="text-xs text-muted-foreground text-center mt-2">التحويلات متوقفة مؤقتاً</p>
          )}
          {bal.transfers_enabled && bal.available < bal.min_transfer && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              تحتاج {bal.min_transfer - bal.available} عملية إضافية لتفعيل التحويل
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── نافذة التحويل ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              تحويل رصيد الإحالات
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="rounded-lg border border-border divide-y divide-border text-sm">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-muted-foreground">الرصيد الحالي</span>
                <span className="font-mono font-bold text-foreground">{fmt(bal.available)} عملية</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-muted-foreground">عمليات التحويل</span>
                <span className="font-mono font-bold text-primary">{fmt(bal.available)} عملية</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-muted-foreground">الحد الأدنى</span>
                <span className="font-mono">{bal.min_transfer} عملية</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-muted-foreground">صلاحية العمليات</span>
                <span className="font-mono">{bal.transfer_validity_days} يوم</span>
              </div>
            </div>
            <div className="flex gap-2 bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              <span>
                بعد التحويل تُخصم العمليات من رصيد الإحالات وتُسجَّل بصلاحية {bal.transfer_validity_days} يوم.
                لن يتم دمجها مع اشتراكك الحالي في هذه المرحلة.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 flex-row-reverse">
            <Button
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              disabled={confirming || !canTransfer}
              onClick={handleTransfer}
            >
              {confirming
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />جارٍ التحويل...</>
                : 'تأكيد التحويل'
              }
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={confirming}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
