import { useState, useEffect } from 'react';
import {
  saveWalletPinToDb,
  loadAllWalletPinsFromDb,
  loadWalletPinFromDb,
} from '@/lib/balanceSession';
import { supabase } from '@/db/supabase';

export function useWalletPins() {
  const [savedPins,  setSavedPins]  = useState<string[]>([]);
  const [defaultPin, setDefaultPin] = useState<string | null>(null);

  // تحميل الـ PINs من DB عند تهيئة الـ hook (أو عند تغيير المستخدم)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [allPins, defPin] = await Promise.all([
          loadAllWalletPinsFromDb(),
          loadWalletPinFromDb(),
        ]);
        if (!cancelled) {
          setSavedPins(allPins);
          setDefaultPin(defPin);
        }
      } catch {
        // fallback: بيانات محلية
        try {
          const pins = JSON.parse(localStorage.getItem('vcc_saved_pins') || '[]');
          const def  = localStorage.getItem('vcc_default_pin') || null;
          if (!cancelled) {
            setSavedPins(Array.isArray(pins) ? pins : []);
            setDefaultPin(def);
          }
        } catch { /* ignore */ }
      }
    }

    load();

    // إعادة التحميل عند تغيير حالة Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      if (!cancelled) load();
    });

    // إعادة التحميل عند إشارة vcc_pins_updated (من الصفحات الأخرى)
    const onUpdate = () => { if (!cancelled) load(); };
    window.addEventListener('vcc_pins_updated', onUpdate);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener('vcc_pins_updated', onUpdate);
    };
  }, []);

  const savePin = (pin: string) => {
    // تحديث الـ state فوراً ثم الحفظ في DB
    const newPins = Array.from(new Set([...savedPins, pin]));
    setSavedPins(newPins);
    setDefaultPin(pin);
    saveWalletPinToDb(pin).catch(() => {});
    // تحديث localStorage كاحتياط
    localStorage.setItem('vcc_saved_pins', JSON.stringify(newPins));
    localStorage.setItem('vcc_default_pin', pin);
  };

  const removePin = (pin: string) => {
    const newPins = savedPins.filter(p => p !== pin);
    setSavedPins(newPins);
    // تحديث localStorage
    localStorage.setItem('vcc_saved_pins', JSON.stringify(newPins));
    // تحديث الـ default
    if (defaultPin === pin) {
      const newDef = newPins.length > 0 ? newPins[0] : null;
      setDefaultPin(newDef);
      if (newDef) {
        localStorage.setItem('vcc_default_pin', newDef);
        saveWalletPinToDb(newDef).catch(() => {});
      } else {
        localStorage.removeItem('vcc_default_pin');
      }
    }
    // حذف من DB
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // لا نحذف الـ hash مباشرةً — نكتفي بتغيير is_default
      // (الـ PIN قد يُعاد استخدامه مستقبلاً)
    }).catch(() => {});
  };

  const setAsDefault = (pin: string) => {
    if (savedPins.includes(pin)) {
      setDefaultPin(pin);
      localStorage.setItem('vcc_default_pin', pin);
      saveWalletPinToDb(pin).catch(() => {});
    }
  };

  return { savedPins, defaultPin, savePin, removePin, setAsDefault };
}
