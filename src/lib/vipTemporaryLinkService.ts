import { supabase } from '@/db/supabase';

export interface VipTemporaryLink {
  id: string;
  token: string;
  title: string;
  created_by?: string;
  is_active: boolean;
  burned_at?: string | null;
  burn_reason?: string | null;
  expires_at?: string | null;
  view_count: number;
  last_accessed_at?: string | null;
  access_mode: string;
  created_at: string;
}

export interface LinkAccessVerification {
  valid: boolean;
  status: 'active' | 'burned' | 'expired' | 'not_found';
  message: string;
  title?: string;
  access_mode?: string;
  expires_at?: string | null;
  burned_at?: string | null;
  burn_reason?: string | null;
  view_count?: number;
}

/**
 * Generate a cryptographically secure random token
 */
function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 16; i++) array[i] = Math.floor(Math.random() * 256);
  }
  let str = 'vtp_';
  for (let i = 0; i < 16; i++) {
    str += chars[array[i] % chars.length];
  }
  return str;
}

/**
 * Create a new temporary shareable link with optional duration in hours
 */
export async function createVipTemporaryLink(options?: {
  hours?: number | null; // null or undefined means no time expiry (manual burn only)
  title?: string;
  access_mode?: 'view_and_operate' | 'view_only';
}): Promise<{ success: boolean; link?: VipTemporaryLink; shareUrl?: string; error?: string }> {
  try {
    const token = generateToken();
    let expiresAt: string | null = null;

    if (options?.hours && options.hours > 0) {
      const expDate = new Date(Date.now() + options.hours * 3600 * 1000);
      expiresAt = expDate.toISOString();
    }

    const { data: userAuth } = await supabase.auth.getUser();
    const userId = userAuth?.user?.id || null;

    const { data, error } = await supabase
      .from('vip_temporary_links')
      .insert({
        token,
        title: options?.title || 'رابط مؤقت لقسم اتصالات VIP',
        created_by: userId,
        is_active: true,
        expires_at: expiresAt,
        access_mode: options?.access_mode || 'view_and_operate',
      })
      .select()
      .single();

    if (error) throw error;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${origin}/vip-share/${token}`;

    return {
      success: true,
      link: data as VipTemporaryLink,
      shareUrl,
    };
  } catch (err: any) {
    console.error('[vipTemporaryLinkService] create error:', err);
    return {
      success: false,
      error: err?.message || 'تعذر إنشاء الرابط المؤقت',
    };
  }
}

/**
 * Fetch all temporary links (active and burned)
 */
export async function listVipTemporaryLinks(): Promise<VipTemporaryLink[]> {
  try {
    const { data, error } = await supabase
      .from('vip_temporary_links')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;
    return (data || []) as VipTemporaryLink[];
  } catch (err) {
    console.error('[vipTemporaryLinkService] list error:', err);
    return [];
  }
}

/**
 * Burn / revoke a link immediately so nobody can use it
 */
export async function burnVipTemporaryLink(
  token: string,
  reason = 'تم الحرق يدوياً بواسطة المالك'
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc('burn_vip_temporary_link', {
      link_token: token,
      reason,
    });

    if (error) throw error;
    return data || { success: true, message: 'تم حرق الرابط بنجاح' };
  } catch (err: any) {
    console.error('[vipTemporaryLinkService] burn error:', err);
    return {
      success: false,
      message: err?.message || 'تعذر حرق الرابط',
    };
  }
}

/**
 * Verify and log access to a temporary link
 */
export async function verifyVipTemporaryLink(token: string): Promise<LinkAccessVerification> {
  try {
    const { data, error } = await supabase.rpc('access_vip_temporary_link', {
      link_token: token,
    });

    if (error) throw error;
    return data as LinkAccessVerification;
  } catch (err: any) {
    console.error('[vipTemporaryLinkService] verify error:', err);
    return {
      valid: false,
      status: 'not_found',
      message: 'تعذر التحقق من صلاحية الرابط المؤقت',
    };
  }
}
