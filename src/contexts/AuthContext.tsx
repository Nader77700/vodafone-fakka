// سياق المصادقة — AuthContext
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/db/supabase';
import { getProfile } from '@/lib/api';
import type { Profile } from '@/types/types';
import { toast } from 'sonner';
import { useInviteAutoLink } from '@/hooks/useInviteAutoLink';
import { getDeviceId } from '@/lib/deviceId';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  sessionConflict: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  claimSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  sessionConflict: false,
  signOut: async () => {},
  refreshProfile: async () => {},
  claimSession: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionConflict, setSessionConflict] = useState(false);
  const { tryAutoLink } = useInviteAutoLink();

  const doSignOut = async (message?: string) => {
    try { await supabase.auth.signOut(); } catch { /* تجاهل */ }
    setUser(null);
    setProfile(null);
    if (message) toast.error(message, { duration: 8000 });
  };

  // ── Safe Profile Loader v2 — حماية كاملة ضد RLS errors وأخطاء الشبكة
  // القاعدة الذهبية: نسجّل الخروج فقط عند التأكد المطلق أن الحساب محذوف
  // (data = null && error = null) → حذف حقيقي مؤكد
  // (data = null && error ≠ null) → خطأ RLS أو شبكة → نبقي الجلسة
  const loadProfile = async (u: User) => {
    if (!navigator.onLine) {
      console.warn('[AuthContext] offline — keeping session without profile');
      setProfile(null);
      return;
    }

    // ── ثلاث محاولات مع backoff قبل أي قرار ────────────────────────────────
    let lastError: unknown = null;
    let profileData: Profile | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data, error } = await getProfile(u.id);

        // خطأ DB/RLS → احتفظ بالجلسة، لا تسجّل خروج أبداً
        if (error) {
          lastError = error;
          console.warn(`[AuthContext] getProfile attempt ${attempt} error — keeping session:`, error);
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }

        // نجح الطلب — data قد تكون null (حذف حقيقي) أو profile
        lastError = null;
        profileData = data;
        break;
      } catch (e) {
        lastError = e;
        console.warn(`[AuthContext] getProfile attempt ${attempt} exception:`, e);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    // إذا كانت كل المحاولات بها خطأ → ابقَ على الجلسة (قد يكون خطأ مؤقت)
    if (lastError !== null) {
      console.error('[AuthContext] all retries failed — keeping session safe:', lastError);
      setProfile(null);
      return;
    }

    // الحساب محذوف فعلاً (طلب نجح لكن لا يوجد بروفايل) — تأكد مرة أخرى أولاً
    if (!profileData) {
      if (!navigator.onLine) {
        console.warn('[AuthContext] offline after fetch — keeping session');
        setProfile(null);
        return;
      }
      // تأكيد أخير: إعادة المحاولة مرة واحدة بعد ثانية
      await new Promise(r => setTimeout(r, 1000));
      try {
        const { data: confirmData, error: confirmErr } = await getProfile(u.id);
        if (confirmErr) {
          console.error('[AuthContext] confirm check error — keeping session:', confirmErr);
          setProfile(null);
          return;
        }
        if (!confirmData) {
          // تأكيد مزدوج: الحساب محذوف فعلاً
          await doSignOut('تم حذف حسابك بواسطة الإدارة.');
          return;
        }
        profileData = confirmData;
      } catch (e) {
        console.error('[AuthContext] confirm check exception — keeping session:', e);
        setProfile(null);
        return;
      }
    }

    // المستخدم محظور — is_active = false
    if (profileData.is_active === false) {
      setProfile(null);
      await doSignOut('تم حظر حسابك بواسطة الإدارة.');
      return;
    }

    // ── Single Session Check — تجاهل للأدوار المميزة ──────────────────────
    const skipRoles = ['admin', 'super_admin'];
    if (!skipRoles.includes(profileData.role)) {
      const currentDeviceId = getDeviceId();
      const storedDeviceId = profileData.device_id;

      if (storedDeviceId && storedDeviceId !== currentDeviceId) {
        // تعارض: الحساب مفتوح على جهاز آخر
        setProfile(profileData);
        setSessionConflict(true);
        return;
      }

      // أول تسجيل دخول أو نفس الجهاز — سجّل device_id
      if (!storedDeviceId || storedDeviceId !== currentDeviceId) {
        supabase.from('profiles')
          .update({ device_id: currentDeviceId })
          .eq('id', u.id)
          .then(() => {}, () => {});
      }
    }

    setSessionConflict(false);
    setProfile(profileData);
    // Phase 7: ربط تلقائي بالتاجر إن كان هناك دعوة معلّقة
    tryAutoLink(u.id);
  };

  // المستخدم يختار "الاستمرار على هذا الجهاز" → حدّث device_id
  const claimSession = async () => {
    if (!user) return;
    const currentDeviceId = getDeviceId();
    await supabase.from('profiles')
      .update({ device_id: currentDeviceId })
      .eq('id', user.id);
    setSessionConflict(false);
    toast.success('تم تفعيل الجلسة على هذا الجهاز');
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('[AuthContext] signOut error:', e);
    } finally {
      setUser(null);
      setProfile(null);
      setSessionConflict(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          loadProfile(session.user).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error('[AuthContext] getSession error — safe fallback:', e);
        setUser(null);
        setProfile(null);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setProfile(null);
        setLoading(false);
      }

      // كشف حذف الحساب عبر JWT_DELETED أو انتهاء الجلسة الإجباري
      if (event === 'SIGNED_OUT' && !session) {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, sessionConflict, signOut, refreshProfile, claimSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
