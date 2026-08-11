import { useState, useEffect, useCallback } from 'react';
import {
  anaVodafoneLogin,
  getAnaVodafoneSession,
  anaVodafoneLogout,
  type AnaVodafoneSession,
} from '@/lib/api';

export function useAnaVodafoneSession() {
  const [session, setSession] = useState<AnaVodafoneSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const loadSession = useCallback(async () => {
    setLoading(true);
    const s = await getAnaVodafoneSession();
    setSession(s);
    setLoading(false);
    return s;
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  async function login(phone: string, password: string) {
    setLoginLoading(true);
    setLoginError(null);
    const result = await anaVodafoneLogin(phone, password);
    setLoginLoading(false);
    if (!result.success) {
      setLoginError(result.error ?? 'فشل تسجيل الدخول');
      return false;
    }
    setLoginSuccess(true);
    setTimeout(async () => {
      setLoginSuccess(false);
      await loadSession();
    }, 1200);
    return true;
  }

  async function logout() {
    setLogoutLoading(true);
    await anaVodafoneLogout();
    setSession(null);
    setLogoutLoading(false);
  }

  return {
    session,
    loading,
    loginLoading,
    loginError,
    loginSuccess,
    logoutLoading,
    login,
    logout,
    refresh: loadSession,
    clearLoginError: () => setLoginError(null),
  };
}
