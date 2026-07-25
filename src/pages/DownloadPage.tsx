import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Download, Smartphone, ShieldCheck, Zap, AlertCircle } from 'lucide-react';

export default function DownloadPage() {
  const [latestVersion, setLatestVersion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLatest();
  }, []);

  const fetchLatest = async () => {
    try {
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .eq('is_latest', true)
        .eq('status', 'active')
        .single();

      if (error) throw error;
      setLatestVersion(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!latestVersion?.apk_url) return;
    let url = latestVersion.apk_url;
    if (url.includes('supabase.co/storage')) {
      url += (url.includes('?') ? '&' : '?') + 'download=';
    }
    window.location.href = url;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground animate-pulse">جاري جلب معلومات التحديث...</p>
      </div>
    );
  }

  if (error || !latestVersion) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-16 h-16 text-destructive mb-4 mx-auto" />
        <h1 className="text-2xl font-bold mb-2">عذراً، لا يوجد تحديث متاح حالياً</h1>
        <p className="text-muted-foreground">الرابط غير صالح أو لا يوجد إصدار نشط للتحميل.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30">
      {/* Navbar بسيط */}
      <header className="h-16 border-b border-border/50 bg-card/50 backdrop-blur-xl flex items-center justify-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-xl font-black tracking-tight">Vodafone <span className="text-primary">Fakka</span></h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full">
        {/* أيقونة التطبيق */}
        <div className="relative mb-8 mt-4">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          <div className="w-32 h-32 rounded-3xl bg-card border border-border/50 flex items-center justify-center shadow-2xl relative z-10 overflow-hidden">
             <img src="/pwa-192x192.png" alt="App Icon" className="w-24 h-24 object-contain drop-shadow-md" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
             <Smartphone className="w-16 h-16 text-primary absolute -z-10 opacity-20" />
          </div>
        </div>

        <h2 className="text-3xl font-black text-center mb-2">تحديث التطبيق</h2>
        <p className="text-muted-foreground text-center mb-8">
          إصدار {latestVersion.version}
          {latestVersion.version_code && <span className="opacity-60 text-xs mr-2">(Build {latestVersion.version_code})</span>}
        </p>

        {/* مميزات التحديث */}
        <div className="w-full space-y-3 mb-8">
          <div className="flex items-center gap-3 bg-card border border-border/50 p-4 rounded-2xl">
            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-success" />
            </div>
            <div>
              <h3 className="font-bold text-sm">أمان وحماية</h3>
              <p className="text-xs text-muted-foreground">آخر التحديثات الأمنية وإصلاح الأخطاء</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 bg-card border border-border/50 p-4 rounded-2xl">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-sm">أداء أسرع</h3>
              <p className="text-xs text-muted-foreground">تحسينات شاملة في سرعة استجابة التطبيق</p>
            </div>
          </div>
        </div>

        {/* زر التنزيل */}
        <button
          onClick={handleDownload}
          className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-primary/25"
        >
          <Download className="w-6 h-6" />
          تنزيل التحديث الآن
        </button>

        {latestVersion.release_notes && (
          <div className="w-full mt-8 p-4 rounded-2xl bg-muted/50 border border-border/50">
            <h4 className="font-bold text-sm mb-2 text-foreground/80">ما الجديد في هذا الإصدار؟</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              {latestVersion.release_notes.split('\n').map((line: string, i: number) => (
                <p key={i} className="flex gap-2">
                  <span className="text-primary">•</span>
                  {line.replace(/^[•·\-\d]+[.)]\s*/, '')}
                </p>
              ))}
            </div>
          </div>
        )}
      </main>
      
      <footer className="py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Vodafone Fakka. جميع الحقوق محفوظة.
      </footer>
    </div>
  );
}