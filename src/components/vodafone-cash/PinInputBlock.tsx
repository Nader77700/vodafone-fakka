import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, ShieldCheck } from 'lucide-react';
import { useWalletPins } from '@/hooks/useWalletPins';
import { PinManagerDialog } from './PinManagerDialog';
import { useIsLight } from '@/contexts/ThemeContext';

interface PinInputBlockProps {
  pin: string;
  setPin: (pin: string) => void;
  submitting: boolean;
}

export function PinInputBlock({ pin, setPin, submitting }: PinInputBlockProps) {
  const { savedPins, defaultPin } = useWalletPins();
  const L = useIsLight();
  const [useSaved, setUseSaved] = useState(false);
  const [shouldSaveNew, setShouldSaveNew] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  
  useEffect(() => {
    if (savedPins.length > 0 && defaultPin) {
      setUseSaved(true);
      setPin(defaultPin);
    } else {
      setUseSaved(false);
    }
  }, [savedPins, defaultPin]);

  useEffect(() => {
    if (shouldSaveNew && pin.length >= 4) {
      localStorage.setItem('vcc_pending_save_pin', pin);
    } else {
      localStorage.removeItem('vcc_pending_save_pin');
    }
  }, [pin, shouldSaveNew]);

  const handleUseSavedChange = (checked: boolean) => {
    setUseSaved(checked);
    if (checked && defaultPin) {
      setPin(defaultPin);
    } else {
      setPin('');
    }
  };

  const handleSaveNewChange = (checked: boolean) => {
    if (checked && pin.length >= 4) {
      localStorage.setItem('vcc_pending_save_pin', pin);
    } else {
      localStorage.removeItem('vcc_pending_save_pin');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <Label className="text-sm font-medium" style={{ color: L ? '#1a1a2e' : '#ffffff' }}>الرقم السري للمحفظة</Label>
        {savedPins.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] rounded-full px-2"
            style={{
              background: L ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`,
              color: L ? '#1a1a2e' : '#ffffff',
            }}
            onClick={() => setManagerOpen(true)}
          >
            إدارة المحفوظ
          </Button>
        )}
      </div>

      {savedPins.length > 0 && (
        <label className="flex items-center gap-2 cursor-pointer w-max mb-1">
          <input
            type="checkbox"
            className="rounded accent-[#E60000] w-4 h-4"
            style={{ borderColor: L ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.20)' }}
            checked={useSaved}
            onChange={(e) => handleUseSavedChange(e.target.checked)}
            disabled={submitting}
          />
          <span className="text-xs font-medium" style={{ color: L ? 'rgba(26,26,46,0.90)' : 'rgba(255,255,255,0.90)' }}>
            استخدام الرقم السري المحفوظ سابقاً
          </span>
        </label>
      )}

      <div className="relative rounded-xl overflow-hidden border h-12"
        style={{
          borderColor: useSaved ? 'rgba(34,197,94,0.3)' : L ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)',
          background:  useSaved ? 'rgba(34,197,94,0.05)' : L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
        }}>
        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10"
          style={{ color: useSaved ? '#4ade80' : L ? 'rgba(26,26,46,0.35)' : 'rgba(255,255,255,0.35)' }} />
        <Input type="password" inputMode="numeric"
          className={`border-0 focus-visible:ring-0 pr-9 text-right h-full text-base bg-transparent ${useSaved ? 'text-green-500 font-bold' : ''}`}
          style={{
            color: useSaved ? '#22c55e' : L ? '#1a1a2e' : '#ffffff',
          }}
          placeholder={useSaved ? 'سيتم استخدام الرقم المحفوظ' : 'أدخل الرقم السري'}
          value={useSaved ? '••••••' : pin}
          onChange={e => { if (!useSaved) setPin(e.target.value); }}
          disabled={submitting || useSaved}
        />
        {useSaved && (
          <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        {!useSaved && pin.length > 0 && (
          <label className="flex items-center gap-2 cursor-pointer w-max">
            <input
              type="checkbox"
              className="rounded accent-[#E60000] w-4 h-4"
              style={{ borderColor: L ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.20)' }}
              checked={shouldSaveNew}
              onChange={(e) => setShouldSaveNew(e.target.checked)}
              disabled={submitting}
            />
            <span className="text-xs" style={{ color: L ? 'rgba(26,26,46,0.70)' : 'rgba(255,255,255,0.70)' }}>
              حفظ الرقم السري بعد نجاح العملية لتسهيل القادم
            </span>
          </label>
        )}

        <p className="text-[11px] pr-1 flex items-center gap-1" style={{ color: 'rgba(251,146,60,0.7)' }}>
          <span>⚠️</span>
          <span>رقم سري Vodafone Cash المكوّن من 6 أرقام — بعد 3 محاولات خاطئة يُقفل الحساب</span>
        </p>
      </div>

      <PinManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}
