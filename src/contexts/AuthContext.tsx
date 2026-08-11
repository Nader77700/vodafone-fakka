// سياق المصادقة — AuthContext
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/db/supabase';
import { getProfile } from '@/lib/api';
import type { Profile } from '@/types/types';
import { toast } from 'sonner';
import { useInviteAutoLink } from '@/hooks/useInviteAutoLink';
import { getDeviceId } from '@/lib/deviceId';
import { getStableDeviceIdentity } from '@/lib/deviceFingerprint';

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
    try {
      if (user && profile?.device_id === getDeviceId()) {
        await supabase.from('profiles').update({ device_id: null }).eq('id', user.id);
      }
      await supabase.auth.signOut();
    } catch { /* تجاهل */ }
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
        // منع ظهور رسالة الخطأ إذا كان في صفحة اللوجن أو لو كان profile = null لأننا في مرحلة جلب البيانات
        if (!window.location.hash.includes('/login') && !window.location.pathname.includes('/login')) {
            console.error('[AuthContext] all retries failed — keeping session safe:', lastError);
            setProfile(null);
        }
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

    // ── Single Session Check — لا يوجد استثناء لأي دور (حتى الإدارة) لسد الثغرات ──
    const skipRoles: string[] = []; // تم إزالة 'admin', 'super_admin' بناءً على طلب المالك
    if (!skipRoles.includes(profileData.role)) {
      const currentIdentity = getStableDeviceIdentity();
      const currentDeviceId = getDeviceId();
      const storedDeviceId = profileData.device_id;
      const storedDeviceFp = (profileData as any).device_fp;

      const isSamePhysical = storedDeviceFp && storedDeviceFp === currentIdentity.device_fp;
      const isSameDeviceId = storedDeviceId === currentDeviceId;

      // أول تسجيل دخول أو نفس الجهاز الفعلي ولكن UUID مختلف — سجّل device_id و device_fp الجديد
      if (!storedDeviceId || (!isSameDeviceId && isSamePhysical)) {
        import('@capacitor/device').then(({ Device }) => {
          Device.getInfo().then(info => {
            supabase.from('profiles')
              .update({ 
                device_id: currentDeviceId, 
                device_fp: currentIdentity.device_fp,
                active_device_model: info.model 
              })
              .eq('id', u.id)
              .then(() => {}, () => {});
          }).catch(() => {
            supabase.from('profiles')
              .update({ device_id: currentDeviceId, device_fp: currentIdentity.device_fp })
              .eq('id', u.id)
              .then(() => {}, () => {});
          });
        }).catch(() => {
            supabase.from('profiles')
              .update({ device_id: currentDeviceId, device_fp: currentIdentity.device_fp })
              .eq('id', u.id)
              .then(() => {}, () => {});
        });
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
    const currentIdentity = getStableDeviceIdentity();
    await supabase.from('profiles')
      .update({ device_id: currentDeviceId, device_fp: currentIdentity.device_fp })
      .eq('id', user.id);
    setSessionConflict(false);
    toast.success('تم تفعيل الجلسة على هذا الجهاز');
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  const signOut = async () => {
    try {
      // تسجيل الخروج من الجدول الجديد
      const { device_fp, device_id } = getStableDeviceIdentity();
      try {
        await supabase.rpc('mark_device_logged_out', { p_device_fp: device_fp || null, p_device_id: device_id || null });
      } catch(e) {}

      // السماح بتفريغ المعرّف فقط إذا كان الجهاز الحالي هو الجهاز النشط
      if (user && profile?.device_id === getDeviceId()) {
        await supabase.from('profiles').update({ device_id: null }).eq('id', user.id);
      }
      await supabase.auth.signOut();
    } catch (e) {
      console.error('[AuthContext] signOut error:', e);
    } finally {
      setUser(null);
      setProfile(null);
      setSessionConflict(false);
    }
  };

  const initialSessionLoaded = useRef(false);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          loadProfile(session.user).finally(() => {
            setLoading(false);
            initialSessionLoaded.current = true;
          });
        } else {
          setLoading(false);
          initialSessionLoaded.current = true;
        }
      })
      .catch((e) => {
        console.error('[AuthContext] getSession error — safe fallback:', e);
        setUser(null);
        setProfile(null);
        setLoading(false);
        initialSessionLoaded.current = true;
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (session?.user) {
        if (event === 'TOKEN_REFRESHED') {
          // TOKEN_REFRESHED: الجلسة صالحة — لا نُعيد جلب البروفايل لأن ذلك يُعيد render
          // كامل ويُفقد Focus على أي Input يكتب فيه المستخدم حالياً
          return;
        }
        if (event === 'SIGNED_IN') {
          // SIGNED_IN الأولي: يأتي بعد getSession مباشرة — getSession قد بدأ بالفعل loadProfile
          // لا نستدعيه مرة ثانية إلا لو هذا login جديد حقيقي (بعد signOut)
          if (!initialSessionLoaded.current) return; // لا تزال getSession تعمل — تجنّب التكرار
          loadProfile(session.user);
          return;
        }
        // USER_UPDATED أو أي حدث آخر → نحدّث البروفايل
        loadProfile(session.user);
      } else {
        setProfile(null);
        setLoading(false);
      }

      // كشف حذف الحساب عبر JWT_DELETED أو انتهاء الجلسة الإجباري
      if (event === 'SIGNED_OUT' && !session) {
        setProfile(null);
        try {
          localStorage.removeItem('__vfp_native_id');
          localStorage.removeItem('pending_ops_queue');
          localStorage.removeItem('vf_auth_data');
          // لا نحذف __vfp_dfp أو __vfp_hwfp لضمان بقاء الحظر الفعلي
        } catch { /* تجاهل */ }
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // إضافة مراقبة لحظية لاكتشاف تغيير الجهاز (تحديث device_id من جهاز آخر)
  useEffect(() => {
    if (!user) return;
    const currentDeviceId = getDeviceId();
    // اسم فريد لكل اشتراك لتجنب "cannot add callbacks after subscribe()"
    const channelName = `profile-device-watch-${user.id}-${Date.now()}`;

    const profileSub = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          const newDeviceId = (payload.new as { device_id?: string }).device_id;
          // إذا تم تحديث معرف الجهاز ولم يعد يطابق جهازنا الحالي
          if (newDeviceId && newDeviceId !== currentDeviceId) {
            console.warn('[AuthContext] Device conflict detected via realtime! Signing out...');
            doSignOut('تم تسجيل الدخول من جهاز آخر. تم إنهاء الجلسة لحماية حسابك.');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileSub);
    };
  }, [user]);

  const contextValue = React.useMemo(() => ({
    user, profile, loading, sessionConflict, signOut, refreshProfile, claimSession
  }), [user, profile, loading, sessionConflict, signOut, refreshProfile, claimSession]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
