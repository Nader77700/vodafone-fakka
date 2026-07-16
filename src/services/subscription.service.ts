import { supabase } from '@/db/supabase';
import type { Subscription, PaginatedResult } from '@/types/types';

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*, license_keys(code_type)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Subscription | null;
}

export async function validateAndSyncSubscription(userId: string): Promise<Subscription | null> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, expires_at, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (sub && sub.expires_at) {
    if (new Date(sub.expires_at) < new Date()) {
      await supabase.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id);
      return null;
    }
  }
  return getUserSubscription(userId);
}

export async function startGracePeriod(userId: string): Promise<void> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'expired')
    .order('expires_at', { ascending: false })
    .limit(1)
    .single();

  if (sub) {
    await supabase.from('subscriptions').update({
      in_grace_period: true,
      grace_period_start: new Date().toISOString()
    }).eq('id', sub.id);
  }
}

export async function checkGracePeriod(userId: string): Promise<{
  inGracePeriod: boolean;
  daysRemaining: number;
}> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('in_grace_period, grace_period_start')
    .eq('user_id', userId)
    .eq('status', 'expired')
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub || !sub.in_grace_period || !sub.grace_period_start) {
    return { inGracePeriod: false, daysRemaining: 0 };
  }

  const graceStart = new Date(sub.grace_period_start);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - graceStart.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const remaining = 3 - diffDays;

  return {
    inGracePeriod: remaining > 0,
    daysRemaining: remaining > 0 ? remaining : 0
  };
}
