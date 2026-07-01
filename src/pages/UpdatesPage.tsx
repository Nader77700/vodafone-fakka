// صفحة التحديثات — APK + سجل الإصدارات + فصل ملاحظات المستخدم عن الإدارة
import { useState, useEffect } from 'react';
import { Download, RefreshCw, CheckCircle2, Sparkles, Info, Calendar, Hash, ChevronDown, ChevronUp, Share2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/db/supabase';
import { useUpdateChecker } from '@/hooks/useUpdateChecker';
import { useAuth } from '@/contexts/AuthContext';
import { BUILD_INFO } from '@/lib/buildInfo';
import { toast } from 'sonner';

interface AppVersion {
  id: string;
  version: string;
  version_code: number;
  apk_url: string;
  release_notes?: string;
  is_latest: boolean;
  update_type?: string;
  created_at: string;
}

// الكلمات التقنية — مخصصة للأدمن فقط
const ADMIN_KEYWORDS = [
  'CDN','Assets','Fallback','Internal','APIs','Database','API','Storage',
  'Cache','Routing','Triggers','SSOT','Migration','Edge Function','Supabase',
  'RLS','SQL','Schema','bucket','realtime','Realtime','حزمة','ملف','مسار',
  'مصدر','قاعدة البيانات','edge','function','build.gradle','versionCode',
  'manifest','APK hash','apk_hash','bundle','CDN','s3','cloudflare',
  'رابط خارجي','رابط CDN',
];

/** يفلتر الملاحظات حسب نوع المستخدم */
function parseNotes(raw: string | undefined, isAdmin: boolean): string {
  if (!raw) return '';
  const lines = raw.split(/[\n·•]/).map(l => l.trim()).filter(Boolean);
  if (isAdmin) return lines.join('\n');
  const userLines = lines.filter(line => {
    const lower = line.toLowerCase();
    return !ADMIN_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  });
  // إذا لم يتبق شيء بعد الفلتر، أعد رسالة عامة
  return userLines.length > 0
    ? userLines.join('\n')
    : 'تحسين الأداء والاستقرار العام';
}

const CURRENT_VERSION = `v${BUILD_INFO.appVersion}`;

export default function UpdatesPage() {
  const { hasUpdate, latestVersion, installedVersion, installedCode } = useUpdateChecker();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const [allVersions,    setAllVersions]    = useState<AppVersion[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [current,        setCurrent]        = useState<AppVersion | null>(null);
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [copied,         setCopied]         = useState(false);

  const displayVersion = installedVersion ? `v${installedVersion}` : CURRENT_VERSION;

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const { data } = await supabase
        .from('app_versions').select('*').eq('is_latest', true).maybeSingle();
      if (data) setCurrent(data as AppVersion);
      const latest = data as AppVersion | null;
      if (!latest || latest.version_code <= installedCode) {
        toast.success('✅ أنت على أحدث إصدار');
      } else if (latest.update_type === 'web') {
        // web update = مطبّق تلقائياً بالفعل
        toast.success(`⚡ v${latest.version} مطبّق تلقائياً — لا تحتاج تحديث`);
      } else {
        toast.info(`🆕 تحديث APK جديد: v${latest.version} — اضغط تنزيل`);
      }
    } finally { setCheckingUpdate(false); }
  };

  useEffect(() => {
    const load = async () => {
      setLoadingHistory(true);
      const [{ data: latest }, { data: history }] = await Promise.all([
        supabase.from('app_versions').select('*').eq('is_latest', true).maybeSingle(),
        supabase.from('app_versions').select('*').order('version_code', { ascending: false }).limit(10),
      ]);
      if (latest) setCurrent(latest as AppVersion);
      if (history) setAllVersions(history as AppVersion[]);
      setLoadingHistory(false);
    };
    load();
  }, []);

  const activeVersion = current ?? latestVersion;

  // ─── مشاركة رابط APK (للأدمن فقط) ────────────────────────────────────────
  const shareApkUrl = async () => {
    const url = activeVersion?.apk_url;
    const ver = activeVersion?.version ?? 'آخر إصدار';
    if (!url) return;
    const shareText = `📱 تحديث Vodafone Fakka Premium\n🚀 الإصدار v${ver}\n⬇️ تحميل APK:\n${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Vodafone Fakka v${ver}`, text: shareText, url });
        return;
      } catch { /* المستخدم أغلق قائمة المشاركة */ }
    }
    // Fallback: نسخ الرابط
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('✅ تم نسخ رابط APK');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('تعذّر النسخ');
    }
  };

  // تحديث web = مطبّق تلقائياً بدون APK — نعرض بطاقة "تم التحديث تلقائياً"
  const isWebUpdate = activeVersion?.update_type === 'web'
    && activeVersion.version_code > installedCode;

  // تحديث APK = يحتاج تنزيل ملف جديد
  const showUpdate = !isWebUpdate && (hasUpdate || (
    activeVersion &&
    activeVersion.version_code > installedCode &&
    activeVersion.update_type !== 'web'
  ));

  return (
    <div className="flex flex-col min-h-full pb-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <h1 className="text-lg font-bold">تحديثات التطبيق</h1>
          {/* عرض إصدار الويب (BUILD_INFO) الفعلي الجاري + إصدار APK المثبَّت */}
          {installedVersion && installedVersion !== BUILD_INFO.appVersion ? (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground">
                APK <span className="font-mono text-foreground/70">v{installedVersion}</span>
              </span>
              <span className="text-[10px] text-muted-foreground/50">·</span>
              <span className="text-xs text-primary/80 font-medium">
                ويب <span className="font-mono">v{BUILD_INFO.appVersion}</span> ⚡
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">APK · إصدار {displayVersion}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* زر مشاركة رابط APK — للجميع */}
          {activeVersion?.apk_url && (
            <Button
              variant="ghost" size="icon"
              className="w-9 h-9 text-muted-foreground hover:text-primary hover:bg-primary/10"
              onClick={shareApkUrl}
              title={`مشاركة رابط APK v${activeVersion.version}`}
            >
              {copied
                ? <Check className="w-4 h-4 text-success" />
                : <Share2 className="w-4 h-4" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={checkForUpdates} disabled={checkingUpdate} title="فحص التحديثات">
            <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="px-4 space-y-4">

        {/* ✅ بطاقة: تحديث ويب تلقائي — مطبّق بدون APK */}
        {isWebUpdate && activeVersion && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0">⚡</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-primary">تحديث v{activeVersion.version} مطبّق تلقائياً</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  تحديث ويب فوري — لا تحتاج تنزيل APK جديد
                </p>
              </div>
              <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full shrink-0">
                v{activeVersion.version}
              </span>
            </div>
            <div className="rounded-xl bg-muted/30 px-3 py-2 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                التطبيق يحمّل آخر تحديث تلقائياً عند كل فتح. إصدار APK المثبَّت{' '}
                <span className="font-mono text-foreground/70">v{installedVersion}</span>{' '}
                يشغّل كود الويب{' '}
                <span className="font-mono text-primary">v{activeVersion.version}</span> بالفعل.
              </p>
            </div>
            {/* ملاحظات الإصدار للأدمن */}
            {isAdmin && activeVersion.release_notes && (
              <div className="space-y-1 pt-1">
                {parseNotes(activeVersion.release_notes, true)
                  .split('\n').filter(Boolean)
                  .map((line, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground leading-relaxed flex gap-1.5">
                      <span className="text-primary/60 shrink-0">•</span>
                      {line.replace(/^[•·\-\d]+[.)]\s*/, '')}
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* 🆕 بطاقة: تحديث APK متاح — يحتاج تنزيل */}
        {showUpdate && activeVersion && (
          <div className="rounded-2xl p-4 space-y-3 border border-yellow-500/30"
            style={{ background: 'linear-gradient(135deg, #1a110015, #1a0d0015)' }}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-yellow-500">تحديث جديد متاح!</p>
                <p className="text-xs text-muted-foreground">
                  الإصدار {activeVersion.version} · {new Date(activeVersion.created_at).toLocaleDateString('ar-EG')}
                </p>
              </div>
              <span className="text-xs font-bold text-yellow-500 bg-yellow-500/20 px-2 py-0.5 rounded-full shrink-0">
                {activeVersion.version}
              </span>
            </div>

            {/* ملاحظات الإصدار — للأدمن فقط */}
            {isAdmin && activeVersion.release_notes && (
              <div className="space-y-1">
                {parseNotes(activeVersion.release_notes, true)
                  .split('\n').filter(Boolean)
                  .map((line, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground leading-relaxed flex gap-1.5">
                      <span className="text-yellow-500/60 shrink-0">•</span>
                      {line.replace(/^[•·\-\d]+[.)]\s*/, '')}
                    </p>
                  ))}
              </div>
            )}

            <a
              href={activeVersion.apk_url}
              download={activeVersion.apk_url.split('/').pop() || `VodafoneFakka-${activeVersion.version}.apk`}
              className="flex items-center justify-center gap-2 w-full h-11 font-bold text-sm rounded-xl text-black"
              style={{ background: '#eab308', boxShadow: '0 0 16px #eab30850' }}>
              <Download className="w-4 h-4" /> تنزيل APK v{activeVersion.version}
            </a>
          </div>
        )}

        {/* ✅ حالة محدّث — لا يوجد تحديث على الإطلاق */}
        {!showUpdate && !isWebUpdate && activeVersion && (
          <div className="rounded-2xl border border-success/20 bg-success/5 p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-success">أنت على أحدث إصدار</p>
              <p className="text-xs text-muted-foreground">{displayVersion} · لا يوجد تحديث حالياً</p>
            </div>
          </div>
        )}

        {/* تنزيل APK الحالي */}
        {activeVersion && (
          <div className="card-premium p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#22c55e22' }}>
                <span className="text-xl">📱</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">تطبيق Vodafone Fakka</p>
                {/* عرض إصدار APK الفعلي (من App.getInfo) لا BUILD_INFO */}
                <p className="text-[11px] text-muted-foreground">
                  APK v{installedVersion ?? activeVersion.version} · code {installedCode ?? activeVersion.version_code}
                </p>
              </div>
            </div>

            <a
              href={activeVersion.apk_url}
              download={activeVersion.apk_url.split('/').pop() || `VodafoneFakka-v${installedVersion ?? activeVersion.version}.apk`}
              className="flex items-center justify-center gap-2 w-full h-11 font-bold text-sm rounded-xl text-background"
              style={{ background: '#22c55e', boxShadow: '0 0 16px #22c55e40' }}>
              <Download className="w-4 h-4" />
              {/* إذا كان web update: "إعادة تثبيت APK" لا "تحديث" */}
              {isWebUpdate
                ? `إعادة تثبيت APK v${installedVersion ?? activeVersion.version}`
                : `تحميل APK v${installedVersion ?? activeVersion.version}`}
            </a>

            <div className="rounded-xl bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1 leading-relaxed">
              <p className="font-bold text-foreground/80">📋 خطوات التثبيت:</p>
              <p>1️⃣ اضغط تحميل ↑</p>
              <p>2️⃣ افتح الملف من "التنزيلات"</p>
              <p>3️⃣ لو ظهرت رسالة → اذهب للإعدادات → شغّل "مصادر غير معروفة"</p>
              <p>4️⃣ ارجع واضغط تثبيت</p>
              <p>5️⃣ افتح التطبيق وسجّل دخول</p>
            </div>
          </div>
        )}

        {/* سجل الإصدارات — للأدمن فقط، المستخدمون العاديون لا يرون الإصدارات القديمة */}
        {isAdmin && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" /> سجل الإصدارات
          </p>
          {loadingHistory ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : allVersions.map(v => {
            const userNotes = parseNotes(v.release_notes, isAdmin);
            const isExpanded = expandedId === v.id;
            const noteLines = userNotes.split('\n').filter(Boolean);
            return (
              <div key={v.id} className={`card-premium p-3.5 space-y-1.5 ${v.is_latest ? 'border-primary/30' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold font-mono">{v.version}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">code {v.version_code}</span>
                  {v.is_latest && (
                    <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">أحدث</span>
                  )}
                  {v.update_type && v.update_type !== 'apk' && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{v.update_type}</span>
                  )}
                  <span className="mr-auto text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(v.created_at).toLocaleDateString('ar-EG')}
                  </span>
                </div>

                {noteLines.length > 0 && (
                  <>
                    <div className={`space-y-0.5 overflow-hidden transition-all ${isExpanded ? '' : 'max-h-10'}`}>
                      {noteLines.map((line, i) => (
                        <p key={i} className="text-[11px] text-muted-foreground leading-relaxed flex gap-1.5">
                          <span className="text-primary/40 shrink-0">•</span>
                          {line.replace(/^[•·\-\d]+[.)]\s*/, '')}
                        </p>
                      ))}
                    </div>
                    {noteLines.length > 2 && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : v.id)}
                        className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
                      >
                        {isExpanded ? <><ChevronUp className="w-3 h-3" />أقل</> : <><ChevronDown className="w-3 h-3" />المزيد</>}
                      </button>
                    )}
                  </>
                )}

                {v.apk_url && (
                  <a
                    href={v.apk_url}
                    download={v.apk_url.split('/').pop() || `VodafoneFakka-${v.version}.apk`}
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary/70 hover:text-primary transition-colors mt-1"
                  >
                    <Download className="w-3 h-3" /> تحميل {v.version}
                  </a>
                )}
              </div>
            );
          })}
        </div>
        )}

        {/* معلومات البناء */}
        <div className="card-premium p-4 text-center space-y-1">
          <p className="text-sm font-semibold gradient-text">Vodafone Fakka Premium</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {displayVersion} · Powered By <span className="text-primary font-semibold">Nader Akram</span>
            </p>
            {!showUpdate && (
              <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded-full font-medium">
                ✓ أحدث إصدار
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Nader Akram · جميع الحقوق محفوظة</p>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-info/20 bg-info/5 p-3">
          <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            التطبيق يعمل مباشرةً على متصفح الموبايل أيضاً. APK يوفر تجربة أفضل مع الإشعارات.
          </p>
        </div>

      </div>
    </div>
  );
}
