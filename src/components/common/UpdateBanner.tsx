import { useNavigate } from 'react-router-dom';
import { Download, X, Sparkles, AlertTriangle, Zap } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useUpdateChecker } from '@/hooks/useUpdateChecker';
import { Browser } from '@capacitor/browser';

export default function UpdateBanner() {
  const { showBanner, latestVersion, apkExists, dismiss, installedVersion } = useUpdateChecker();
  const navigate = useNavigate();

  const handleDownload = () => {
    if (!latestVersion) return;
    const downloadUrl = window.location.href.split('#')[0] + '#/download';
    Browser.open({ url: downloadUrl });
  };

  if (!showBanner || !latestVersion) return null;

  return (
    <div className="fixed bottom-0 sm:bottom-6 left-0 sm:left-1/2 sm:-translate-x-1/2 w-full sm:w-[95%] sm:max-w-md bg-card/95 backdrop-blur-2xl border-t sm:border border-border/50 shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.3)] z-[9999] sm:rounded-3xl overflow-hidden p-4 sm:p-5 flex flex-col gap-4 animate-in slide-in-from-bottom-full duration-500 fade-in fade-out">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30">
            <Download className="w-6 h-6" />
          </div>
          {latestVersion.is_latest && (
            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive flex items-center justify-center shadow-md animate-pulse">
              <Zap className="w-3 h-3 text-destructive-foreground" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-base flex items-center gap-1.5 text-foreground">
              تحديث جديد متاح <Sparkles className="w-4 h-4 text-yellow-500" />
            </h3>
            <button onClick={dismiss} className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors active:scale-95 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground/90 mt-1 flex items-center gap-2">
            <span>النسخة v{latestVersion.version}</span>
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium tracking-widest">
              الحالية: {installedVersion ?? '؟'}
            </span>
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={handleDownload} className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-primary/20">
          <Download className="w-4 h-4" />
          تحديث الآن
        </button>
        <button onClick={() => navigate('/updates')} className="h-11 px-4 bg-muted hover:bg-muted/80 text-foreground font-semibold text-sm rounded-xl transition-all active:scale-[0.98] shrink-0 border border-border/50">
          التفاصيل
        </button>
      </div>
    </div>
  );
}
