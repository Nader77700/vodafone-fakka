/**
 * PhoneSuggestionsInput
 * - يجلب أرقام receiver_number من vcc_recharges مرة واحدة (lazy)
 * - بعد 3 أرقام يعرض dropdown بالأرقام المطابقة
 * - تصميم بسيط، لا يطغى على واجهة الـ modal
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/db/supabase';
import { useIsLight } from '@/contexts/ThemeContext';

interface PhoneSuggestionsInputProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

const SUGGEST_AFTER = 3; // عدد الأرقام قبل ظهور الاقتراحات
const MAX_SUGGESTIONS = 6; // أقصى عدد اقتراحات يظهر

export function PhoneSuggestionsInput({ value, onChange, disabled }: PhoneSuggestionsInputProps) {
  const L = useIsLight();
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── جلب السجل مرة واحدة عند أول تفاعل ──────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    try {
      const { data } = await supabase
        .from('vcc_recharges')
        .select('receiver_number')
        .not('receiver_number', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (data) {
        // فريد + مرتب حسب الأكثر استخداماً (أول ظهور في DESC = الأحدث)
        const unique = Array.from(new Set(data.map(r => r.receiver_number as string).filter(Boolean)));
        setHistory(unique);
      }
    } catch (_) {
      // صمت — الاقتراحات اختيارية
    }
    setHistoryLoaded(true);
  }, [historyLoaded]);

  // ── تصفية الاقتراحات عند تغيير الإدخال ─────────────────────────────────
  useEffect(() => {
    const digits = value.replace(/\D/g, '');
    if (digits.length < SUGGEST_AFTER || history.length === 0) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const matched = history
      .filter(num => num.startsWith(digits))
      .slice(0, MAX_SUGGESTIONS);
    setSuggestions(matched);
    setShowDropdown(matched.length > 0);
    setHighlightIdx(-1);
  }, [value, history]);

  // ── إغلاق الـ dropdown عند الضغط خارجه ─────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
    onChange(val);
  };

  const handleFocus = () => {
    loadHistory();
    if (suggestions.length > 0) setShowDropdown(true);
  };

  const selectSuggestion = (num: string) => {
    onChange(num);
    setShowDropdown(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightIdx]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const borderColor = showDropdown
    ? 'rgba(230,0,0,0.45)'
    : L ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)';
  const bgColor = L ? '#ffffff' : 'rgba(255,255,255,0.04)';

  return (
    <div ref={wrapperRef} className="relative">
      {/* حقل الإدخال */}
      <div
        className="relative rounded-xl overflow-visible border h-12"
        style={{
          borderColor,
          background: bgColor,
          borderRadius: showDropdown ? '12px 12px 0 0' : '12px',
          transition: 'border-color 0.15s, border-radius 0.1s',
        }}
      >
        <Phone
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10"
          style={{ color: L ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}
        />
        <Input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          maxLength={11}
          className="border-0 focus-visible:ring-0 pr-9 text-right h-full text-base bg-transparent placeholder:opacity-40"
          style={{ color: L ? '#1a1a2e' : '#ffffff' }}
          placeholder="01xxxxxxxxx"
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          dir="ltr"
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {/* قائمة الاقتراحات */}
      {showDropdown && suggestions.length > 0 && (
        <div
          className="absolute left-0 right-0 z-50 overflow-hidden shadow-xl"
          style={{
            background: L ? '#ffffff' : '#1a1f2e',
            border: `1px solid ${L ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)'}`,
            borderTop: 'none',
            borderRadius: '0 0 12px 12px',
            boxShadow: L
              ? '0 8px 24px rgba(0,0,0,0.10)'
              : '0 8px 24px rgba(0,0,0,0.45)',
          }}
        >
          {suggestions.map((num, idx) => {
            const isHl = idx === highlightIdx;
            const matchLen = value.length;
            const matchPart = num.slice(0, matchLen);
            const restPart = num.slice(matchLen);
            return (
              <div
                key={num}
                onMouseDown={() => selectSuggestion(num)}
                onMouseEnter={() => setHighlightIdx(idx)}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                style={{
                  background: isHl
                    ? L ? 'rgba(230,0,0,0.06)' : 'rgba(230,0,0,0.12)'
                    : 'transparent',
                  borderBottom:
                    idx < suggestions.length - 1
                      ? `1px solid ${L ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'}`
                      : 'none',
                }}
              >
                <Phone
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: isHl ? '#E60000' : L ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.30)' }}
                />
                <span
                  className="text-sm font-mono tracking-wide"
                  dir="ltr"
                  style={{ color: L ? '#1a1a2e' : '#ffffff' }}
                >
                  {/* الجزء المطابق بلون أحمر + باقي الرقم */}
                  <span style={{ color: '#E60000', fontWeight: 700 }}>{matchPart}</span>
                  <span style={{ opacity: 0.75 }}>{restPart}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
