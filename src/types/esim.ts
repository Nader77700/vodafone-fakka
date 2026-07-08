// ─── أنواع نظام eSIM ─────────────────────────────────────────────────────────

export interface ESimOffer {
  id: string;
  title: string;
  description: string;
  image: string | null;
  price: number;
  old_price: number | null;
  discount: number | null;
  data_size: string;
  duration: string;
  status: string;
  warranty: boolean;
  speed: string;
  country: string;
  features: string[];
  supported_networks: string[];
  whatsapp_enabled: boolean;
  order_index: number;
  is_featured: boolean;
  hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface ESimSettings {
  id: string;
  enabled: boolean;
  section_status: 'active' | 'hidden' | 'maintenance' | 'coming_soon';
  section_title: string;
  section_description: string;
  maintenance_message: string;
  coming_soon_message: string;
  empty_message: string;
  whatsapp_number: string;
  show_prices: boolean;
  show_discounts: boolean;
  created_at: string;
  updated_at: string;
}
