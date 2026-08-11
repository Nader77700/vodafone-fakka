import { useState } from 'react';
import { Loader2, Tag, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VodafoneOffer } from './types';

interface OfferCardProps {
  offer: VodafoneOffer;
  onSubscribe: (offer: VodafoneOffer) => void;
  loadingId: string | null;
}

export default function OfferCard({ offer, onSubscribe, loadingId }: OfferCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLoading = loadingId === offer.id;

  return (
    <div
      className="rounded-[20px] overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(230,0,0,0.15)', border: '1px solid rgba(230,0,0,0.25)' }}
        >
          <Zap className="w-4 h-4" style={{ color: '#ff6b6b' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-black text-white truncate">{offer.name}</h3>
          <p className="text-[10px] text-white/45 truncate">{offer.offerId}</p>
        </div>
        <div className="text-left shrink-0">
          <p className="text-sm font-black text-white">{offer.price}</p>
          <p className="text-[9px] text-white/40">جنيه</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        <p className="text-[12px] text-white/70 leading-relaxed">{offer.description}</p>

        {offer.tags && offer.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {offer.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {expanded && (
          <div className="pt-2 text-[11px] text-white/50 leading-relaxed">
            <p>
              تفاصيل إضافية عن العرض ستظهر هنا بعد ربط البيانات الفعلية في المرحلة التالية.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-3.5 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="h-9 px-3 rounded-xl text-[11px] font-bold text-white/60 border border-white/10 hover:bg-white/5"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
          {expanded ? 'أقل' : 'المزيد'}
        </Button>
        <Button
          size="sm"
          onClick={() => onSubscribe(offer)}
          disabled={isLoading}
          className="flex-1 h-9 rounded-xl text-[12px] font-black bg-primary hover:bg-primary/90 text-white"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1.5" /> : null}
          {isLoading ? 'جاري التجهيز...' : 'اشتراك'}
        </Button>
      </div>
    </div>
  );
}
