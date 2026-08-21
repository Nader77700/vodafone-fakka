/**
 * VodafoneOffersShell — تخطيط مشترك لصفحات عروض فودافون
 * يحافظ على نفس Header والـ Bottom Navigation
 */

import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface VodafoneOffersShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function VodafoneOffersShell({ title, subtitle, children }: VodafoneOffersShellProps) {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen pb-28 flex flex-col"
      dir="rtl"
      style={{ background: 'linear-gradient(180deg,#080d14 0%,#0a0a12 100%)' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-30 px-4 pt-safe-top"
        style={{ background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={() => navigate('/vodafone-offers')}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all shrink-0"
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black text-white leading-tight truncate">{title}</h1>
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
