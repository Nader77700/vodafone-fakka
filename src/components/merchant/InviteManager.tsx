// مكوّن رابط الدعوة للتاجر — عرض الحالة + مشاركة واتساب
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/db/supabase';
import { getMerchantInvite } from '@/lib/api';
import type { MerchantInvite } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Copy, CheckCircle, Lock,
  Users, Eye, CalendarClock, AlertTriangle, Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';

type InviteTokenStatus = 'active' | 'disabled' | 'expired';

type ExtendedInvite = MerchantInvite & {
  locked_by_owner?: boolean;
  invite_link?: string;
  invite_code?: string;
  merchant_name?: string;
  apk_url?: string;
  apk_version?: string;
  recent_joins?: { username?: string; phone?: string; joined_at: string }[];
};

function buildWhatsAppMessage(invite: ExtendedInvite): string {
  const code    = invite.invite_code ?? invite.token ?? '';
  const name    = invite.merchant_name ?? '';
  const apkUrl  = invite.apk_url ?? '';
  const version = invite.apk_version ? ` (v${invite.apk_version})` : '';

  const lines = [
    '🎉 *دعوة للانضمام إلى Vodafone Fakka Premium*',
    '',
    name ? `التاجر: *${name}*` : '',
    '━━━━━━━━━━━━━━━━━━',
    `🔑 كود الدعوة: *${code}*`,
    '━━━━━━━━━━━━━━━━━━',
    apkUrl ? `📱 تحميل التطبيق${version}:` : '',
    apkUrl ?? '',
    '',
    '✅ أدخل الكود عند التسجيل وسيتم ربطك تلقائياً',
  ].filter(l => l !== null && !(l === '' && !name));

  return lines.join('\n');
}

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
  const [invite,  setInvite]  = useState<ExtendedInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState(false);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { invite: inv } = await getMerchantInvite(merchantId);
    if (inv) setInvite(inv as ExtendedInvite);
    setLoading(false);
  }, [merchantId]);

  useEffect(() => {
    load();
    realtimeRef.current = supabase
      .channel(`invite_mgr_${merchantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'merchant_invites',
        filter: `merchant_id=eq.${merchantId}`,
      }, () => load())
      .subscribe();
    return () => { realtimeRef.current?.unsubscribe(); };
  }, [load, merchantId]);

  // نسخ كود الدعوة
  const handleCopyCode = async () => {
    const code = invite?.invite_code ?? invite?.token ?? '';
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('تم نسخ كود الدعوة!');
    setTimeout(() => setCopied(false), 2500);
  };

  // فتح واتساب برسالة جاهزة
  const handleWhatsApp = () => {
    if (!invite) return;
    const msg = buildWhatsAppMessage(invite);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // نسخ رسالة الدعوة كاملة
  const handleCopyMessage = async () => {
    if (!invite) return;
    const msg = buildWhatsAppMessage(invite);
    await navigator.clipboard.writeText(msg);
    toast.success('تم نسخ رسالة الدعوة كاملة!');
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

  const status   = (invite.status ?? 'disabled') as InviteTokenStatus;
  const isActive = status === 'active' && !invite.locked_by_owner;
  const code     = invite.invite_code ?? invite.token ?? '';

  return (
    <div className="space-y-4" dir="rtl">

      {/* ─── تنبيه: مقفل من الإدارة ─── */}
      {invite.locked_by_owner && (
        <div className="flex items-start gap-3 bg-destructive/8 border border-destructive/20 rounded-2xl p-4">
          <Lock className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-destructive">رابط الدعوة مقفل من الإدارة</p>
            <p className="text-xs text-muted-foreground mt-0.5">تم تعطيل رابط الدعوة بواسطة المالك. تواصل مع الإدارة.</p>
          </div>
        </div>
      )}

      {/* ─── الحالة والإحصائيات ─── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 md:col-span-1 bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">حالة الرابط</p>
          <Badge variant="outline" className={cn('w-fit text-xs font-semibold border', STATUS_STYLE[status])}>
            {invite.locked_by_owner ? 'معطّل بواسطة الإدارة' : STATUS_LABEL[status]}
          </Badge>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-1">
          <Users className="w-4 h-4 text-primary" />
          <p className="text-xl font-black">{invite.join_count ?? 0}</p>
          <p className="text-[10px] text-muted-foreground">انضموا</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-1">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <p className="text-xl font-black">{invite.view_count ?? 0}</p>
          <p className="text-[10px] text-muted-foreground">مشاهدة</p>
        </div>
      </div>

      {/* ─── كود الدعوة ─── */}
      <div className={cn(
        'border rounded-2xl p-4 space-y-3',
        isActive ? 'bg-primary/5 border-primary/20' : 'bg-muted/20 border-border/50 opacity-75'
      )}>
        <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">كود الدعوة</p>
        <p className={cn(
          'text-2xl font-black font-mono tracking-widest select-all',
          isActive ? 'text-primary' : 'text-muted-foreground/50'
        )}>
          {code || '—'}
        </p>

        {isActive && (
          <div className="flex flex-wrap gap-2">
            {/* نسخ الكود */}
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleCopyCode}>
              {copied
                ? <><CheckCircle className="w-3.5 h-3.5 text-success" />تم النسخ</>
                : <><Copy className="w-3.5 h-3.5" />نسخ الكود</>}
            </Button>

            {/* مشاركة واتساب */}
            <Button
              size="sm"
              className="gap-1.5 h-8 text-xs bg-[#25D366] hover:bg-[#1da851] text-white border-0"
              onClick={handleWhatsApp}
            >
              <Share2 className="w-3.5 h-3.5" />
              مشاركة واتساب
            </Button>

            {/* نسخ الرسالة كاملة */}
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleCopyMessage}>
              <Copy className="w-3.5 h-3.5" />
              نسخ الرسالة
            </Button>
          </div>
        )}

        {!isActive && (
          <p className="text-[11px] text-muted-foreground">
            الدعوة {invite.locked_by_owner ? 'مقفلة من الإدارة' : 'غير نشطة'} — لا يمكن استخدامها حالياً
          </p>
        )}
      </div>

      {/* ─── معاينة رسالة واتساب ─── */}
      {isActive && invite.apk_url && (
        <div className="border border-border/50 rounded-2xl p-4 bg-muted/20 space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">معاينة رسالة الدعوة</p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
            {buildWhatsAppMessage(invite)}
          </pre>
        </div>
      )}

      {/* ─── ملاحظة ─── */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-xl px-3 py-2 border border-border/50">
        <Lock className="w-3 h-3 shrink-0" />
        <span>إدارة الدعوة (تفعيل / تعطيل / إعادة توليد) من لوحة الإدارة حصراً</span>
      </div>

      {/* ─── آخر انضمام ─── */}
      {invite.last_joined_at && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
          <span>آخر انضمام: {format(new Date(invite.last_joined_at), 'dd MMM yyyy، hh:mm a', { locale: ar })}</span>
        </div>
      )}

      {/* ─── آخر 5 منضمّين ─── */}
      {invite.recent_joins && invite.recent_joins.length > 0 && (
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
