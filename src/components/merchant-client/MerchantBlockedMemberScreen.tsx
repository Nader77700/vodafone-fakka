// شاشة حظر/إيقاف العضو — تظهر عند حظر أو تعليق العضو من قِبل التاجر
// بدون loading لا نهائي — شاشة واضحة فورية
import { useMerchantClient } from '@/contexts/MerchantClientContext';
import { ShieldOff, PauseCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';

interface Props {
  status: 'blocked' | 'suspended' | 'disabled';
}

const STATUS_CFG = {
  blocked: {
    icon:    ShieldOff,
    iconBg:  'bg-destructive/10',
    iconCls: 'text-destructive',
    badge:   'محظور',
    badgeCls:'bg-destructive/10 text-destructive border-destructive/20',
    title:   'تم حظر حسابك',
    body:    'تم حظر حسابك بواسطة التاجر. يرجى التواصل مع التاجر الخاص بك لمزيد من المعلومات.',
  },
  suspended: {
    icon:    PauseCircle,
    iconBg:  'bg-warning/10',
    iconCls: 'text-warning',
    badge:   'موقوف مؤقتاً',
    badgeCls:'bg-warning/10 text-warning border-warning/20',
    title:   'تم إيقاف حسابك مؤقتاً',
    body:    'تم إيقاف حسابك مؤقتاً بواسطة التاجر. يرجى التواصل مع التاجر الخاص بك.',
  },
  disabled: {
    icon:    ShieldOff,
    iconBg:  'bg-muted',
    iconCls: 'text-muted-foreground',
    badge:   'معطّل',
    badgeCls:'bg-muted text-muted-foreground border-border',
    title:   'تم تعطيل حسابك',
    body:    'تم تعطيل حسابك. يرجى التواصل مع التاجر الخاص بك.',
  },
} as const;

export default function MerchantBlockedMemberScreen({ status }: Props) {
  const { data } = useMerchantClient();
  const cfg = STATUS_CFG[status];
  const Icon = cfg.icon;
  const brandColor = data?.merchant?.brand_color ?? '#E60000';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.info('تم تسجيل الخروج');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6" dir="rtl">
      {/* خلفية ضوئية */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-[120px] opacity-8 bg-destructive" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center gap-5 max-w-sm w-full">
        {/* Badge */}
        <span className={`text-[11px] font-black px-3 py-1 rounded-full border ${cfg.badgeCls}`}>
          {cfg.badge}
        </span>

        {/* Icon */}
        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center border-2 ${cfg.iconBg}`}
          style={{ borderColor: `${brandColor}25` }}>
          <Icon className={`w-9 h-9 ${cfg.iconCls}`} />
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h1 className="text-xl font-black text-foreground text-balance">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed text-pretty">{cfg.body}</p>
        </div>

        {/* بطاقة التاجر */}
        {data?.merchant?.name && (
          <div
            className="w-full rounded-2xl p-4 border flex items-center gap-3 text-right"
            style={{ background: `${brandColor}0a`, borderColor: `${brandColor}20` }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${brandColor}15` }}>
              <span className="text-xs font-black" style={{ color: brandColor }}>
                {data.merchant.name.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground">التاجر المرتبط بحسابك</p>
              <p className="text-sm font-black truncate" style={{ color: brandColor }}>
                {data.merchant.name}
              </p>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          className="w-full gap-2 text-muted-foreground hover:text-destructive mt-2"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </Button>

        <p className="text-[10px] text-muted-foreground/50">Vodafone Fakka Premium</p>
      </div>
    </div>
  );
}
