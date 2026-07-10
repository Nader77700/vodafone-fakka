// ─── eSIM API Functions ────────────────────────────────────────────────────
import { supabase } from '@/db/supabase';
import type { ESimOffer, ESimSettings } from '@/types/esim';

// ── Settings ─────────────────────────────────────────────────────────────────
export async function getESimSettings(): Promise<ESimSettings | null> {
  const { data } = await supabase
    .from('esim_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  return data as ESimSettings | null;
}

export async function updateESimSettings(patch: Partial<ESimSettings>): Promise<boolean> {
  const { data: existing } = await supabase.from('esim_settings').select('id').limit(1).maybeSingle();
  if (!existing) return false;
  const { error } = await supabase
    .from('esim_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', existing.id);
  return !error;
}

// ── Offers ────────────────────────────────────────────────────────────────────
export async function getESimOffers(adminMode = false): Promise<ESimOffer[]> {
  let q = supabase.from('esim_offers').select('*').order('order_index', { ascending: true });
  if (!adminMode) q = q.eq('hidden', false);
  const { data } = await q;
  return (data ?? []) as ESimOffer[];
}

export async function getESimOffer(id: string): Promise<ESimOffer | null> {
  const { data } = await supabase.from('esim_offers').select('*').eq('id', id).maybeSingle();
  return data as ESimOffer | null;
}

export async function createESimOffer(offer: Omit<ESimOffer, 'id' | 'created_at' | 'updated_at'>): Promise<ESimOffer | null> {
  const { data, error } = await supabase.from('esim_offers').insert(offer).select().maybeSingle();
  if (error) { console.error('createESimOffer:', error.message); return null; }
  return data as ESimOffer;
}

export async function updateESimOffer(id: string, patch: Partial<ESimOffer>): Promise<boolean> {
  const { error } = await supabase
    .from('esim_offers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function deleteESimOffer(id: string): Promise<boolean> {
  const { error } = await supabase.from('esim_offers').delete().eq('id', id);
  return !error;
}

export async function reorderESimOffers(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, idx) =>
      supabase.from('esim_offers').update({ order_index: idx, updated_at: new Date().toISOString() }).eq('id', id)
    )
  );
}

export async function duplicateESimOffer(offer: ESimOffer): Promise<ESimOffer | null> {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = offer;
  return createESimOffer({ ...rest, title: `${offer.title} (نسخة)`, order_index: offer.order_index + 1 });
}
