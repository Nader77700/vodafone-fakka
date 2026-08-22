import { Loader2, PackageX, AlertCircle, CheckCircle2 } from 'lucide-react';
import VodafoneOffersShell from './VodafoneOffersShell';
import OfferCard from './OfferCard';
import VodafoneLoginGate from './VodafoneLoginGate';
import { useVodafoneOffers, useSubscribeOffer } from './useVodafoneOffers';
import { useTheme } from '@/contexts/ThemeContext';

export default function OtherOffersPage() {
  const { offers, loading, error, reload } = useVodafoneOffers('other');
  const { subscribe, loadingId, error: actionError, success, clearError, clearSuccess } = useSubscribeOffer();
  const { isDark } = useTheme();
  const L = !isDark;

  return (
    <VodafoneOffersShell title="عروض أخرى" subtitle="عروض متنوعة من فودافون">
      <VodafoneLoginGate onLogin={reload}>
        <div className="space-y-4">
        {actionError && (
          <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f87171' }} />
            <p className="text-[12px] font-medium" style={{ color: '#fca5a5' }}>{actionError}</p>
            <button onClick={clearError} className="text-[10px] mr-auto" style={{ color: L ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.50)' }}>إغلاق</button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />
            <p className="text-[12px] font-bold" style={{ color: '#86efac' }}>{success}</p>
            <button onClick={clearSuccess} className="text-[10px] mr-auto" style={{ color: L ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.50)' }}>إغلاق</button>
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-[18px]"
            style={{ background: L ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: `1px solid ${L ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}` }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: L ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.40)' }} />
            <p className="text-[12px] text-muted-foreground">جاري تحميل العروض...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-12 px-5 rounded-[18px]"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="text-sm font-black text-foreground">فشل تحميل العروض</p>
            <p className="text-[12px] text-muted-foreground">{error}</p>
            <button onClick={reload}
              className="px-5 py-2.5 rounded-xl text-[12px] font-black text-primary-foreground bg-primary hover:bg-primary/90">
              إعادة المحاولة
            </button>
          </div>
        ) : offers.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-14 rounded-[18px]"
            style={{ background: L ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: `1px solid ${L ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}` }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)', border: `1px solid ${L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'}` }}>
              <PackageX className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-black text-muted-foreground mb-1">لا توجد عروض أخرى متاحة</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">لا توجد عروض متنوعة متاحة حالياً</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} onSubscribe={subscribe} loadingId={loadingId} />
            ))}
          </div>
        )}
      </div>
      </VodafoneLoginGate>
    </VodafoneOffersShell>
  );
}
