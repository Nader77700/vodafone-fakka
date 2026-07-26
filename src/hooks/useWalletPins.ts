import { useState, useEffect } from 'react';

export function useWalletPins() {
  const [savedPins, setSavedPins] = useState<string[]>([]);
  const [defaultPin, setDefaultPin] = useState<string | null>(null);

  useEffect(() => {
    try {
      const pins = JSON.parse(localStorage.getItem('vcc_saved_pins') || '[]');
      const def = localStorage.getItem('vcc_default_pin') || null;
      if (Array.isArray(pins)) {
        setSavedPins(pins);
      }
      setDefaultPin(def);
    } catch (e) {
      setSavedPins([]);
    }
  }, []);

  const savePin = (pin: string) => {
    const newPins = Array.from(new Set([...savedPins, pin]));
    localStorage.setItem('vcc_saved_pins', JSON.stringify(newPins));
    setSavedPins(newPins);
    if (!defaultPin) {
      localStorage.setItem('vcc_default_pin', pin);
      setDefaultPin(pin);
    }
  };

  const removePin = (pin: string) => {
    const newPins = savedPins.filter(p => p !== pin);
    localStorage.setItem('vcc_saved_pins', JSON.stringify(newPins));
    setSavedPins(newPins);
    if (defaultPin === pin) {
      const newDef = newPins.length > 0 ? newPins[0] : null;
      if (newDef) localStorage.setItem('vcc_default_pin', newDef);
      else localStorage.removeItem('vcc_default_pin');
      setDefaultPin(newDef);
    }
  };

  const setAsDefault = (pin: string) => {
    if (savedPins.includes(pin)) {
      localStorage.setItem('vcc_default_pin', pin);
      setDefaultPin(pin);
    }
  };

  return { savedPins, defaultPin, savePin, removePin, setAsDefault };
}
