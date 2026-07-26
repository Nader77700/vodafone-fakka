import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, ShieldCheck } from 'lucide-react';
import { useWalletPins } from '@/hooks/useWalletPins';
import { PinManagerDialog } from './PinManagerDialog';

interface PinInputBlockProps {
  pin: string;
  setPin: (pin: string) => void;
  submitting: boolean;
}

export function PinInputBlock({ pin, setPin, submitting }: PinInputBlockProps) {
  const { savedPins, defaultPin } = useWalletPins();
  const [useSaved, setUseSaved] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  
  useEffect(() => {
    if (savedPins.length > 0 && defaultPin) {
      setUseSaved(true);
      setPin(defaultPin);
    } else {
      setUseSaved(false);
    }
  }, [savedPins, defaultPin]);

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
        <Label className="text-sm font-medium text-white">الرقم السري للمحفظة</Label>
        {savedPins.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-full px-2"
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
            className="rounded border-white/20 bg-white/5 accent-[#E60000] w-4 h-4"
            checked={useSaved}
            onChange={(e) => handleUseSavedChange(e.target.checked)} 
            disabled={submitting}
          />
          <span className="text-xs text-white/90 font-medium">استخدام الرقم السري المحفوظ سابقاً</span>
        </label>
      )}

      <div className="relative rounded-xl overflow-hidden border h-12"
        style={{ borderColor: useSaved ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.12)', background: useSaved ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.04)' }}>
        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10" style={{ color: useSaved ? '#4ade80' : 'rgba(255,255,255,0.35)' }} />
        <Input type="password" inputMode="numeric"
          className={`border-0 focus-visible:ring-0 pr-9 text-right h-full text-base bg-transparent placeholder:text-white/25 ${useSaved ? 'text-green-400 font-bold' : 'text-white'}`}
          placeholder={useSaved ? "سيتم استخدام الرقم المحفوظ" : "أدخل الرقم السري"} 
          value={useSaved ? '••••••' : pin}
          onChange={e => {
            if (!useSaved) setPin(e.target.value);
          }} 
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
              className="rounded border-white/20 bg-white/5 accent-[#E60000] w-4 h-4"
              onChange={(e) => handleSaveNewChange(e.target.checked)} 
              disabled={submitting}
            />
            <span className="text-xs text-white/70">حفظ الرقم السري بعد نجاح العملية لتسهيل القادم</span>
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
