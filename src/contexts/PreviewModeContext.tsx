/**
 * PreviewModeContext — إدارة حالة وضع المعاينة بشكل عام
 * - يقرأ access_mode من البروفايل
 * - يوفر دخول/خروج من Preview Mode
 */

import { createContext, useContext, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import type { AccessMode } from '@/types/types';

interface PreviewModeContextValue {
  accessMode: AccessMode;
  isPreview: boolean;
  enterPreview: () => Promise<boolean>;
  exitPreview: () => Promise<void>;
}

const PreviewModeContext = createContext<PreviewModeContextValue | null>(null);

export function PreviewModeProvider({ children }: { children: React.ReactNode }) {
  const { profile, refreshProfile } = useAuth();

  const accessMode = profile?.access_mode ?? 'subscribed';
  const isPreview = accessMode === 'preview';

  const enterPreview = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return false;
    const { error } = await supabase.rpc('enter_preview_mode', { p_user_id: user.id });
    if (error) {
      // eslint-disable-next-line no-console
      console.error('enter_preview_mode failed:', error);
      return false;
    }
    await refreshProfile();
    return true;
  }, [refreshProfile]);

  const exitPreview = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;
    await supabase.rpc('convert_preview_to_subscribed', { p_user_id: user.id });
    await refreshProfile();
  }, [refreshProfile]);

  const value = useMemo(
    () => ({ accessMode, isPreview, enterPreview, exitPreview }),
    [accessMode, isPreview, enterPreview, exitPreview]
  );

  return <PreviewModeContext.Provider value={value}>{children}</PreviewModeContext.Provider>;
}

export function usePreviewMode(): PreviewModeContextValue {
  const ctx = useContext(PreviewModeContext);
  if (!ctx) throw new Error('usePreviewMode must be used within PreviewModeProvider');
  return ctx;
}
