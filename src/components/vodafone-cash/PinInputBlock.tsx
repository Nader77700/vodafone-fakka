import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, ShieldCheck, KeyRound, Pencil, Eye, EyeOff } from 'lucide-react';
import { useWalletPins } from '@/hooks/useWalletPins';
import { PinManagerDialog } from './PinManagerDialog';
import { useIsLight } from '@/contexts/ThemeContext';

interface PinInputBlockProps {
  pin: string;
  setPin: (pin: string) => void;
  submitting: boolean;
}

/**
 * PinInputBlock — نظام إدخال الرقم السري مع Password Box
 *
 * الحالات:
 * A) لا يوجد PIN محفوظ → حقل إدخال عادي + checkbox "حفظ بعد نجاح العملية"
 * B) يوجد PIN محفوظ → يظهر Password Box أسفل الحقل
 *    - checkbox "استخدام المحفوظ" → يغلق حقل الإدخال ويستخدم الـ PIN من الـ Box
 *    - لتغيير الـ PIN في الـ Box → يجب كتابة الـ PIN الموجود أولاً (زر تعديل)
 */
export function PinInputBlock({ pin, setPin, submitting }: PinInputBlockProps) {
  const { savedPins, defaultPin, savePin, removePin } = useWalletPins();
  const L = useIsLight();

  // هل يستخدم الـ PIN المحفوظ
  const [useSaved, setUseSaved] = useState(false);
  // هل يريد حفظ PIN جديد بعد نجاح العملية
  const [shouldSaveNew, setShouldSaveNew] = useState(false);
  // نافذة إدارة الأرقام المحفوظة
  const [managerOpen, setManagerOpen] = useState(false);
  // وضع تغيير الـ PIN المحفوظ (يطلب الـ PIN الحالي أولاً)
  const [editMode, setEditMode] = useState(false);
  const [editCurrentInput, setEditCurrentInput] = useState('');
  const [editCurrentError, setEditCurrentError] = useState(false);
  const [editNewPin, setEditNewPin] = useState('');
  const [editStep, setEditStep] = useState<'verify' | 'new'>('verify');
  // إظهار/إخفاء الـ PIN في الـ Box
  const [showBoxPin, setShowBoxPin] = useState(false);

  // عند فتح الـ dialog أو تحميل savedPins → إذا في محفوظ نشغّل useSaved
  useEffect(() => {
    if (savedPins.length > 0 && defaultPin && !useSaved) {
      setUseSaved(true);
      setPin(defaultPin);
    }
  }, [defaultPin]); // eslint-disable-line react-hooks/exhaustive-deps

  // مزامنة vcc_pending_save_pin
  useEffect(() => {
    if (shouldSaveNew && pin.length >= 4) {
      localStorage.setItem('vcc_pending_save_pin', pin);
    } else {
      localStorage.removeItem('vcc_pending_save_pin');
    }
  }, [pin, shouldSaveNew]);

  const hasSaved = savedPins.length > 0 && !!defaultPin;

  // ── Toggle استخدام المحفوظ ────────────────────────────────────────────
  const handleUseSavedChange = (checked: boolean) => {
    setUseSaved(checked);
    if (checked && defaultPin) {
      setPin(defaultPin);
    } else {
      setPin('');
    }
  };

  // ── بدء وضع تعديل الـ PIN المحفوظ ────────────────────────────────────
  const startEdit = () => {
    setEditMode(true);
    setEditStep('verify');
    setEditCurrentInput('');
    setEditCurrentError(false);
    setEditNewPin('');
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditCurrentInput('');
    setEditCurrentError(false);
    setEditNewPin('');
    setEditStep('verify');
  };

  const handleVerifyStep = () => {
    if (editCurrentInput === defaultPin) {
      setEditCurrentError(false);
      setEditStep('new');
    } else {
      setEditCurrentError(true);
    }
  };

  const handleSaveNewPinInBox = () => {
    if (editNewPin.length < 4) return;
    // احذف القديم واحفظ الجديد
    if (defaultPin) removePin(defaultPin);
    savePin(editNewPin);
    cancelEdit();
    // استخدم الجديد فوراً إن كان useSaved مفعّل
    if (useSaved) setPin(editNewPin);
  };

  // ── ألوان مشتركة ──────────────────────────────────────────────────────
  const inputBorder = (active: boolean) =>
    active ? 'rgba(34,197,94,0.35)' : L ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)';
  const inputBg = (active: boolean) =>
    active ? (L ? 'rgba(34,197,94,0.05)' : 'rgba(34,197,94,0.06)') : L ? '#ffffff' : 'rgba(255,255,255,0.04)';
  const labelColor = L ? 'rgba(0,0,0,0.75)' : '#ffffff';
  const mutedColor = L ? 'rgba(26,26,46,0.55)' : 'rgba(255,255,255,0.55)';
  const textColor  = L ? '#1a1a2e' : '#ffffff';
  const boxBg      = L ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';
  const boxBorder  = L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';

  return (
    <div className="space-y-2.5">

      {/* ── العنوان + زر إدارة ── */}
      <div className="flex justify-between items-center">
        <Label className="text-sm font-medium" style={{ color: labelColor }}>
          الرقم السري للمحفظة
        </Label>
        {hasSaved && (
          <button
            type="button"
            onClick={() => setManagerOpen(true)}
            className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
            style={{
              background: L ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`,
              color: mutedColor,
            }}
          >
            إدارة المحفوظ
          </button>
        )}
      </div>

      {/* ── Checkbox استخدام المحفوظ (يظهر فقط إذا في PIN محفوظ) ── */}
      {hasSaved && (
        <label className="flex items-center gap-2 cursor-pointer w-max">
          <input
            type="checkbox"
            className="rounded accent-[#E60000] w-4 h-4"
            checked={useSaved}
            onChange={e => handleUseSavedChange(e.target.checked)}
            disabled={submitting}
          />
          <span className="text-xs font-medium" style={{ color: L ? 'rgba(26,26,46,0.85)' : 'rgba(255,255,255,0.85)' }}>
            استخدام الرقم السري المحفوظ
          </span>
        </label>
      )}

      {/* ── حقل الإدخال (يُقفل إذا useSaved) ── */}
      <div
        className="relative rounded-xl overflow-hidden border h-12"
        style={{ borderColor: inputBorder(useSaved), background: inputBg(useSaved) }}
      >
        <Lock
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10"
          style={{ color: useSaved ? '#4ade80' : L ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.30)' }}
        />
        <Input
          type="password"
          inputMode="numeric"
          className="border-0 focus-visible:ring-0 pr-9 pl-10 text-right h-full text-base bg-transparent placeholder:opacity-40"
          style={{ color: useSaved ? '#22c55e' : textColor }}
          placeholder={useSaved ? 'سيتم استخدام الرقم المحفوظ ✓' : 'أدخل الرقم السري'}
          value={useSaved ? '' : pin}
          onChange={e => { if (!useSaved) setPin(e.target.value); }}
          disabled={submitting || useSaved}
        />
        {useSaved && (
          <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
        )}
      </div>

      {/* ══ Password Box (يظهر فقط إذا في PIN محفوظ) ══════════════════════ */}
      {hasSaved && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: boxBg, borderColor: boxBorder }}
        >
          {!editMode ? (
            /* عرض الـ PIN المحفوظ */
            <div className="flex items-center justify-between px-3 py-2.5 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <KeyRound className="w-4 h-4 shrink-0" style={{ color: '#E60000', opacity: 0.7 }} />
                <span className="text-xs font-medium shrink-0" style={{ color: mutedColor }}>
                  الرقم السري المحفوظ
                </span>
                <span
                  className="font-mono text-sm tracking-[0.25em] truncate"
                  style={{ color: textColor, direction: 'ltr' }}
                >
                  {showBoxPin ? defaultPin : '•'.repeat(defaultPin?.length ?? 6)}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* إظهار / إخفاء */}
                <button
                  type="button"
                  onClick={() => setShowBoxPin(v => !v)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                  style={{ background: L ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)' }}
                  title={showBoxPin ? 'إخفاء' : 'إظهار'}
                >
                  {showBoxPin
                    ? <EyeOff className="w-3.5 h-3.5" style={{ color: mutedColor }} />
                    : <Eye    className="w-3.5 h-3.5" style={{ color: mutedColor }} />
                  }
                </button>
                {/* تعديل */}
                <button
                  type="button"
                  onClick={startEdit}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                  style={{ background: L ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)' }}
                  title="تغيير الرقم السري"
                >
                  <Pencil className="w-3.5 h-3.5" style={{ color: mutedColor }} />
                </button>
              </div>
            </div>
          ) : editStep === 'verify' ? (
            /* الخطوة 1: التحقق من الـ PIN الحالي */
            <div className="p-3 space-y-2.5">
              <p className="text-xs font-medium" style={{ color: mutedColor }}>
                أدخل الرقم السري الحالي للمتابعة
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="الرقم الحالي"
                  value={editCurrentInput}
                  onChange={e => { setEditCurrentInput(e.target.value); setEditCurrentError(false); }}
                  className="flex-1 h-9 text-center text-base tracking-widest border"
                  style={{
                    background: L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
                    borderColor: editCurrentError ? 'rgba(220,38,38,0.5)' : boxBorder,
                    color: textColor,
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 px-3 bg-[#E60000] hover:bg-[#CC0000] text-white text-xs"
                  onClick={handleVerifyStep}
                >
                  تحقق
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2 text-xs"
                  style={{ color: mutedColor }}
                  onClick={cancelEdit}
                >
                  إلغاء
                </Button>
              </div>
              {editCurrentError && (
                <p className="text-[11px] text-red-400">الرقم السري غير صحيح</p>
              )}
            </div>
          ) : (
            /* الخطوة 2: إدخال الـ PIN الجديد */
            <div className="p-3 space-y-2.5">
              <p className="text-xs font-medium" style={{ color: mutedColor }}>
                أدخل الرقم السري الجديد
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="رقم جديد (4-6 أرقام)"
                  value={editNewPin}
                  onChange={e => setEditNewPin(e.target.value)}
                  className="flex-1 h-9 text-center text-base tracking-widest border"
                  style={{
                    background: L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
                    borderColor: boxBorder,
                    color: textColor,
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 px-3 bg-green-600 hover:bg-green-700 text-white text-xs"
                  onClick={handleSaveNewPinInBox}
                  disabled={editNewPin.length < 4}
                >
                  حفظ
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2 text-xs"
                  style={{ color: mutedColor }}
                  onClick={cancelEdit}
                >
                  إلغاء
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Checkbox حفظ بعد نجاح (يظهر فقط إذا لا يوجد محفوظ + المستخدم كتب رقم) ── */}
      {!hasSaved && !useSaved && pin.length > 0 && (
        <label className="flex items-center gap-2 cursor-pointer w-max">
          <input
            type="checkbox"
            className="rounded accent-[#E60000] w-4 h-4"
            checked={shouldSaveNew}
            onChange={e => setShouldSaveNew(e.target.checked)}
            disabled={submitting}
          />
          <span className="text-xs" style={{ color: mutedColor }}>
            حفظ الرقم السري بعد نجاح العملية لتسهيل القادم
          </span>
        </label>
      )}

      {/* ── تحذير قفل الحساب ── */}
      <p className="text-[11px] flex items-center gap-1" style={{ color: 'rgba(251,146,60,0.7)' }}>
        <span>⚠️</span>
        <span>رقم سري Vodafone Cash المكوّن من 6 أرقام — بعد 3 محاولات خاطئة يُقفل الحساب</span>
      </p>

      <PinManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}
