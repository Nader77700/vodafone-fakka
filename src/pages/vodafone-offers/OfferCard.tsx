import { Loader2, Tag, Zap, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VodafoneOffer } from './types';

interface OfferCardProps {
  offer: VodafoneOffer;
  onSubscribe: (offer: VodafoneOffer) => void;
  loadingId: string | null;
}

export default function OfferCard({ offer, onSubscribe, loadingId }: OfferCardProps) {
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
          <Zap className="w-4 h-4 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-black text-white truncate">{offer.name}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {offer.price && (
              <span className="text-[11px] font-bold text-white/60">
                {offer.price} جنيه
              </span>
            )}
            {offer.code && (
              <span className="text-[10px] font-bold text-white/40 font-mospace">{offer.code}</span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2.5">
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
      </div>

      {/* Actions */}
      <div className="px-4 pb-3.5">
        <Button
          size="sm"
          onClick={() => onSubscribe(offer)}
          disabled={isLoading}
          className="w-full h-10 rounded-xl text-[13px] font-black bg-primary hover:bg-primary/90 text-white"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin ml-1.5" /> : <Banknote className="w-4 h-4 ml-1.5" />}
          {isLoading ? 'جاري التجهيز...' : 'اشتراك'}
        </Button>
      </div>
    </div>
  );
}
