// مكوّن إدارة رابط الدعوة للتاجر — Phase 7
// يعرض الرابط، الإحصائيات، أزرار النسخ / التجديد / التعطيل، آخر الانضمامات
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/db/supabase';
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
  Copy, RefreshCw, Link2, CheckCircle, XCircle,
  Users, Eye, CalendarClock, Loader2, AlertTriangle,
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
  active:   'نشط',
  disabled: 'معطّل',
  expired:  'منتهي',
};

export default function InviteManager({ merchantId }: { merchantId: string }) {
  const [invite,    setInvite]    = useState<MerchantInvite | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState(false);
  const [copied,    setCopied]    = useState(false);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { invite: inv } = await getMerchantInvite(merchantId);
    if (inv) setInvite(inv);
    setLoading(false);
  }, [merchantId]);

  useEffect(() => {
    load();

    // Realtime: أي تغيير على merchant_invites لهذا التاجر
    realtimeRef.current = supabase
      .channel(`invite_mgr_${merchantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'merchant_invites',
        filter: `merchant_id=eq.${merchantId}`,
      }, () => load())
      .subscribe();

    return () => { realtimeRef.current?.unsubscribe(); };
  }, [load, merchantId]);

  const handleCopy = async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(buildInviteLink(invite.token));
    setCopied(true);
    toast.success('تم نسخ الرابط!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegenerate = async () => {
    if (!invite) return;
    if (!confirm('إعادة التوليد ستُبطل الرابط الحالي. تأكيد؟')) return;
    setBusy(true);
    const res = await regenerateInviteToken(merchantId);
    if (res.success) {
      toast.success('تم توليد رابط دعوة جديد!');
      await load();
    } else {
      toast.error(res.error ?? 'خطأ في التوليد');
    }
    setBusy(false);
  };

  const handleToggle = async () => {
    if (!invite) return;
    const next: InviteTokenStatus = invite.status === 'active' ? 'disabled' : 'active';
    setBusy(true);
    const res = await setInviteTokenStatus(merchantId, next);
    if (res.success) {
      toast.success(next === 'active' ? 'تم تفعيل الرابط' : 'تم تعطيل الرابط');
      await load();
    } else {
      toast.error(res.error ?? 'خطأ');
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="py-10 text-center space-y-2">
        <AlertTriangle className="w-8 h-8 text-warning mx-auto" />
        <p className="text-sm text-muted-foreground">تعذّر تحميل بيانات الدعوة.</p>
        <Button variant="outline" size="sm" onClick={load}>إعادة المحاولة</Button>
      </div>
    );
  }

  const link = buildInviteLink(invite.token);

  return (
    <div className="space-y-4" dir="rtl">
      {/* ─── الحالة والإحصائيات ─── */}
      <div className="grid grid-cols-3 gap-3">
        {/* الحالة */}
        <div className="col-span-3 md:col-span-1 bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">حالة الرابط</p>
          <Badge variant="outline" className={cn('w-fit text-xs font-semibold border', STATUS_STYLE[invite.status])}>
            {STATUS_LABEL[invite.status]}
          </Badge>
        </div>
        {/* مرات الانضمام */}
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-1">
          <Users className="w-4 h-4 text-primary" />
          <p className="text-xl font-black">{invite.join_count}</p>
          <p className="text-[10px] text-muted-foreground">انضموا</p>
        </div>
        {/* مرات المشاهدة */}
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-1">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <p className="text-xl font-black">{invite.view_count}</p>
          <p className="text-[10px] text-muted-foreground">مشاهدة</p>
        </div>
      </div>

      {/* ─── الرابط ─── */}
      <div className="bg-muted/40 border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs font-mono text-muted-foreground truncate flex-1 min-w-0 select-all">{link}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleCopy} disabled={busy}>
            {copied ? <CheckCircle className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'تم النسخ' : 'نسخ الرابط'}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleRegenerate} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            توليد جديد
          </Button>
          <Button
            size="sm" variant="outline"
            className={cn('gap-1.5 h-8 text-xs', invite.status === 'active'
              ? 'text-warning border-warning/30 hover:bg-warning/5'
              : 'text-success border-success/30 hover:bg-success/5')}
            onClick={handleToggle} disabled={busy}
          >
            {invite.status === 'active'
              ? <><XCircle className="w-3.5 h-3.5" /> تعطيل</>
              : <><CheckCircle className="w-3.5 h-3.5" /> تفعيل</>}
          </Button>
        </div>
      </div>

      {/* ─── آخر انضمام ─── */}
      {invite.last_joined_at && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
          <span>
            آخر انضمام: {format(new Date(invite.last_joined_at), 'dd MMM yyyy، hh:mm a', { locale: ar })}
          </span>
        </div>
      )}

      {/* ─── آخر 5 منضمّين ─── */}
      {invite.recent_joins?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase px-1">آخر المنضمّين</p>
          <div className="space-y-1.5">
            {invite.recent_joins.map((j, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 bg-card border border-border rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{j.username ?? '—'}</p>
                  <p className="text-[10px] text-muted-foreground">{j.phone ?? ''}</p>
                </div>
                <p className="text-[10px] text-muted-foreground shrink-0">
                  {format(new Date(j.joined_at), 'dd MMM', { locale: ar })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
