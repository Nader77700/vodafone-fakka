export type OfferCategory = 'flex' | 'internet' | 'other';

export interface VodafoneOffer {
  id: string;
  offerId: string;
  name: string;
  description: string;
  price: string;
  category: OfferCategory;
  tags?: string[];
}

export interface OfferActionState {
  loadingId: string | null;
  error: string | null;
  success: string | null;
}
