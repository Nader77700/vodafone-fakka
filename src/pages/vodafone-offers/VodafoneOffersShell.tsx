/**
 * VodafoneOffersShell — تخطيط مشترك لصفحات عروض فودافون
 * يحافظ على نفس Header والـ Bottom Navigation
 */

import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface VodafoneOffersShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function VodafoneOffersShell({ title, subtitle, children }: VodafoneOffersShellProps) {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const L = !isDark;

  return (
    <div
      className="min-h-screen pb-28 flex flex-col"
      dir="rtl"
      style={{ background: L ? '#f5f7fa' : 'linear-gradient(180deg,#080d14 0%,#0a0a12 100%)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{
          background: L ? 'rgba(255,255,255,0.96)' : 'rgba(8,13,20,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${L ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
        }}
      >
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={() => navigate('/vodafone-offers')}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all shrink-0"
            style={{
              border: `1px solid ${L ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`,
              background: L ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
            }}
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4" style={{ color: L ? '#1a1a2e' : '#ffffff' }} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black leading-tight truncate"
              style={{ color: L ? '#1a1a2e' : '#ffffff' }}>{title}</h1>
            {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto w-full flex-1">
        {children}
      </div>
    </div>
  );
}
