import { supabase } from '@/db/supabase';
import type { Profile } from '@/types/types';

export async function getProfile(userId: string): Promise<{ data: Profile | null; error: unknown | null }> {
  try {
    const { data, error } = await supabase.rpc('get_own_profile', { uid: userId });
    if (error) {
      console.error('[getProfile] RPC error:', error);
      return { data: null, error };
    }
    const profile = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
    return { data: profile as Profile | null, error: null };
  } catch (e) {
    console.error('[getProfile] unexpected error:', e);
    return { data: null, error: e };
  }
}

export async function updateProfile(userId: string, updates: Partial<Pick<Profile, 'username' | 'full_name' | 'phone' | 'avatar_url'>>) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  return { error };
}

export async function registerDeviceFingerprint(userId: string, deviceFp: string): Promise<void> {
  if (!deviceFp || !userId) return;
  const { error } = await supabase
    .from('profiles')
    .update({ device_fp: deviceFp })
    .eq('id', userId);
  if (error) console.error('[registerDeviceFingerprint] Error:', error);
}
