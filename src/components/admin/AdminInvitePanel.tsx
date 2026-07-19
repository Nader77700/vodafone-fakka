// لوحة الدعوة في تفاصيل التاجر — Admin View (Phase 7)
// تُضاف داخل بطاقة التاجر في تبويب التجار بالأدمن — Additive Only
import { useState, useEffect, useCallback } from 'react';
import {
  getMerchantInvite,
  regenerateInviteToken,
  setInviteTokenStatus,
  buildInviteLink,
} from '@/lib/api';
import type { MerchantInvite, InviteTokenStatus } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Copy, RefreshCw, CheckCircle, XCircle,
  Users, Eye, Link2, Loader2, CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<InviteTokenStatus, string> = {
  active:   'bg-success/10 text-success border-success/20',
  disabled: 'bg-warning/10 text-warning border-warning/20',
  expired:  'bg-muted text-muted-foreground border-border',
};
const STATUS_LABEL: Record<InviteTokenStatus, string> = {
  active: 'نشط', disabled: 'معطّل', expired: 'منتهي',
};

interface Props {
  merchantId: string;
  adminId?:   string;
}

export default function AdminInvitePanel({ merchantId, adminId }: Props) {
  const [invite,  setInvite]  = useState<MerchantInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [copied,  setCopied]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { invite: inv } = await getMerchantInvite(merchantId);
    if (inv) setInvite(inv);
    setLoading(false);
  }, [merchantId]);

  useEffect(() => { load(); }, [load]);

  const handleCopy = async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(buildInviteLink(invite.token));
    setCopied(true);
    toast.success('تم نسخ رابط الدعوة');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegenerate = async () => {
    if (!invite) return;
    if (!confirm('إعادة التوليد ستُبطل الرابط الحالي للتاجر. تأكيد؟')) return;
    setBusy(true);
    const res = await regenerateInviteToken(merchantId, adminId);
    if (res.success) { toast.success('تم توليد رابط دعوة جديد'); await load(); }
    else toast.error(res.error ?? 'خطأ');
    setBusy(false);
  };

  const handleToggle = async () => {
    if (!invite) return;
    const next: InviteTokenStatus = invite.status === 'active' ? 'disabled' : 'active';
    setBusy(true);
    const res = await setInviteTokenStatus(merchantId, next, adminId);
    if (res.success) { toast.success(next === 'active' ? 'تم تفعيل الرابط' : 'تم تعطيل الرابط'); await load(); }
    else toast.error(res.error ?? 'خطأ');
    setBusy(false);
  };

  if (loading) return (
    <div className="space-y-2 py-2">
      {[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-muted rounded-lg animate-pulse" />)}
    </div>
  );

  if (!invite) return null;

  const link = buildInviteLink(invite.token);

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3" dir="rtl">
      <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">رابط الدعوة — Phase 7</p>

      {/* الإحصائيات */}
      <div className="flex items-center gap-4 flex-wrap">
        <Badge variant="outline" className={cn('text-xs border', STATUS_STYLE[invite.status])}>
          {STATUS_LABEL[invite.status]}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span>{invite.join_count} انضم</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="w-3.5 h-3.5" />
          <span>{invite.view_count} مشاهدة</span>
        </div>
        {invite.last_joined_at && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="w-3.5 h-3.5" />
            <span>آخر انضمام: {format(new Date(invite.last_joined_at), 'dd/MM/yyyy', { locale: ar })}</span>
          </div>
        )}
      </div>

      {/* الرابط */}
      <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2 min-w-0">
        <Link2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <p className="text-[10px] font-mono text-muted-foreground truncate flex-1 min-w-0 select-all">{link}</p>
      </div>

      {/* أزرار */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCopy} disabled={busy}>
          {copied ? <CheckCircle className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          {copied ? 'منسوخ' : 'نسخ'}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleRegenerate} disabled={busy}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          تجديد
        </Button>
        <Button
          size="sm" variant="outline"
          className={cn('h-7 text-xs gap-1', invite.status === 'active'
            ? 'text-warning border-warning/30'
            : 'text-success border-success/30')}
          onClick={handleToggle} disabled={busy}
        >
          {invite.status === 'active'
            ? <><XCircle className="w-3 h-3" /> تعطيل</>
            : <><CheckCircle className="w-3 h-3" /> تفعيل</>}
        </Button>
      </div>
    </div>
  );
}
