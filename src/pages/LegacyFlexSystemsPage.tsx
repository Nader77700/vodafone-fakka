import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronRight, Search, Zap, X, Eye, EyeOff, AlertCircle, Phone, Lock, Loader2, CheckCircle2, XCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LegacyFlexSystem } from '@/types/legacyFlex';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getUserSubscription } from '@/lib/api';
import { FlexMigrationService } from '@/services/flex-migration/FlexMigrationService';
import { ActivationProgressStep } from '@/services/flex-migration/models/FlexModels';

export default function LegacyFlexSystemsPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const [subActive, setSubActive] = useState(false);
  
  const [systems, setSystems] = useState<LegacyFlexSystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<LegacyFlexSystem | null>(null);

  useEffect(() => {
    async function loadData() {
      if (user?.id) {
        const sub = await getUserSubscription(user.id);
        const isActive = !!(sub?.status === 'active' && (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now()));
        setSubActive(isActive);
      }

      try {
        const { data, error } = await supabase
          .from('legacy_flex_systems')
          .select('*')
          .order('priority', { ascending: true });
          
        if (!error && data) {
          // Map to LegacyFlexSystem
          const mapped = data.map(row => ({
            id: row.id,
            systemId: row.system_id,
            bundleId: row.bundle_id,
            productId: row.product_id,
            name: row.name,
            description: row.description || '',
            price: row.price,
            flexCount: row.flex_count,
            priority: row.priority,
            status: row.status as any,
            systemType: row.system_type,
            color: row.color,
            messages: {}
          }));
          setSystems(mapped);
        }
      } catch (err) {
        console.error('Failed to load systems', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [user?.id]);

  // Filter systems
  const displayedSystems = useMemo(() => {
    return systems.filter(sys => {
      // Hide disabled/hidden unless admin? The requirement says admin can hide/show. We will respect status.
      if (sys.status === 'hidden' && !isAdmin) return false;
      if (searchQuery && !sys.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }).sort((a, b) => a.priority - b.priority);
  }, [systems, searchQuery, isAdmin]);

  return (
    <div className="min-h-screen bg-background pb-20 selection:bg-primary/30" dir="rtl">
      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/50 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0 rounded-full bg-white/5 hover:bg-white/10" onClick={() => navigate(-1)}>
              <ChevronRight className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-black text-foreground drop-shadow-md">
                أنظمة فليكس القديمة
              </h1>
              <p className="text-[10px] text-primary flex items-center gap-1 font-bold tracking-widest">
                VODAFONE CLASSIC
              </p>
            </div>
          </div>
        </div>
        
        {/* ── SEARCH ── */}
        <div className="px-4 pb-4 pt-1">
          <div className={`relative flex items-center transition-all duration-300 ${isSearching ? 'ring-2 ring-primary/50 rounded-2xl shadow-[0_0_20px_rgba(230,0,0,0.15)]' : ''}`}>
            <Search className={`absolute right-3 w-4 h-4 transition-colors ${isSearching ? 'text-primary' : 'text-muted-foreground'}`} />
            <Input 
              placeholder="ابحث عن نظام فليكس..." 
              value={searchQuery}
              onFocus={() => setIsSearching(true)}
              onBlur={() => setIsSearching(false)}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-12 pr-10 pl-10 bg-white/5 border-white/10 focus-visible:ring-0 rounded-2xl text-sm placeholder:text-muted-foreground/50 shadow-inner"
            />
            {searchQuery && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute left-1.5 h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery('')}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── CARDS LIST (Mobile Responsive Grid) ── */}
      <div className="p-3 space-y-4">
        {displayedSystems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 animate-in fade-in duration-500">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-lg">
              <Search className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground mb-1 drop-shadow">لم نتمكن من العثور على أنظمة</p>
              <p className="text-xs text-muted-foreground">جرب البحث بكلمات أخرى.</p>
            </div>
            <Button variant="outline" className="rounded-xl border-white/10 hover:bg-white/5" onClick={() => setSearchQuery('')}>
              عرض كل الأنظمة
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {displayedSystems.map((system, idx) => (
              <div 
                key={system.id} 
                className="animate-in fade-in zoom-in-95 duration-500 fill-mode-both"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <CompactLegacyCard system={system} onConvert={() => setSelectedSystem(system)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ACTIVATION DIALOG ── */}
      <ActivationDialog 
        system={selectedSystem} 
        isOpen={!!selectedSystem} 
        onClose={() => setSelectedSystem(null)} 
        subActive={subActive}
        isAdmin={isAdmin}
      />
    </div>
  );
}

// ── COMPACT SYSTEM CARD (PREMIUM MOBILE RESPONSIVE) ──
function CompactLegacyCard({ system, onConvert }: { system: LegacyFlexSystem; onConvert: () => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="group relative bg-[#0D0D0D] border border-white/10 rounded-[20px] p-3 flex flex-col gap-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:border-primary/50 hover:shadow-[0_8px_30px_rgba(230,0,0,0.15)] active:scale-95"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background Glow */}
      <div className={`absolute -top-10 -right-10 w-24 h-24 bg-primary/20 blur-[30px] rounded-full transition-opacity duration-500 ${isHovered ? 'opacity-100' : 'opacity-30'}`} />

      {/* 1. Header: Name & Status */}
      <div className="relative z-10 flex justify-between items-start gap-1">
        <h3 className="text-sm font-black text-white drop-shadow-md truncate">{system.name}</h3>
        {system.status === 'active' && (
          <span className="shrink-0 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse" />
        )}
      </div>

      {/* 2. Flex Count */}
      <div className="relative z-10 flex items-center gap-1.5 mt-1">
        <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center shrink-0 border border-primary/20">
          <Zap className="w-3.5 h-3.5 text-primary drop-shadow-[0_0_5px_rgba(230,0,0,0.8)]" />
        </div>
        <div>
          <p className="text-lg font-black text-white leading-none tracking-tight">{system.flexCount.toLocaleString()}</p>
          <p className="text-[9px] text-white/40 font-bold -mt-0.5">فليكس</p>
        </div>
      </div>

      {/* 3. Price */}
      <div className="relative z-10 bg-white/5 rounded-lg p-1.5 border border-white/5 flex justify-between items-center mt-auto">
        <span className="text-[10px] text-white/50 font-bold">السعر</span>
        <div className="text-right">
          <span className="text-sm font-black text-white">{system.price}</span>
          <span className="text-[9px] text-primary ml-0.5 font-bold">ج.م</span>
        </div>
      </div>

      {/* 4. Action Button */}
      <Button
        onClick={onConvert}
        className="relative z-10 w-full h-9 mt-1 rounded-xl font-black text-xs bg-primary/90 hover:bg-primary text-white shadow-[0_4px_15px_rgba(230,0,0,0.3)] transition-all overflow-hidden"
      >
        <span className="relative z-10">تفعيل النظام</span>
        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
      </Button>
    </div>
  );
}

// ── PREMIUM CENTER DIALOG ──
function ActivationDialog({ 
  system, isOpen, onClose, subActive, isAdmin 
}: { 
  system: LegacyFlexSystem | null, isOpen: boolean, onClose: () => void, subActive: boolean, isAdmin: boolean 
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [msisdn, setMsisdn] = useState('');
  const [password, setPassword] = useState('');
  
  const [isChecking, setIsChecking] = useState(false);
  const [eligibilityResult, setEligibilityResult] = useState<{ isEligible: boolean; needsACP: boolean; message: string; token?: string } | null>(null);

  const [isActivating, setIsActivating] = useState(false);
  const [progressStep, setProgressStep] = useState<string | ActivationProgressStep | null>(null);
  
  const [result, setResult] = useState<{ success: boolean; message: string; executionTime?: number; details?: string } | null>(null);

  const { user } = useAuth();

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setProgressStep(null);
      setIsActivating(false);
      setIsChecking(false);
      setEligibilityResult(null);
    }
  }, [isOpen]);

  const handleCheckEligibility = async () => {
    if (!system) return;

    if (!subActive) {
      setResult({
        success: false,
        message: 'لا يمكنك تنفيذ هذه العملية.',
        details: 'اشتراكك منتهي. يرجى تجديد الاشتراك للتمكن من التفعيل.'
      });
      return;
    }

    if (!msisdn) {
      setResult({ success: false, message: 'يرجى إدخال رقم الهاتف' });
      return;
    }

    setIsChecking(true);
    setResult(null);
    
    const service = new FlexMigrationService();
    const bundleModel = {
      bundleId: system.bundleId,
      systemId: system.systemId,
      productId: system.productId,
      name: system.name,
      price: system.price,
      flexCount: Number(system.flexCount) || 0,
      isActive: system.status === 'active'
    };

    const elig = await service.checkEligibility(bundleModel, msisdn, password, (step) => setProgressStep(step as string));
    
    setEligibilityResult(elig);
    setIsChecking(false);
    setProgressStep(null);

    if (!elig.isEligible) {
       setResult({
         success: false,
         message: 'غير مؤهل للتفعيل',
         details: elig.message
       });
    }
  };

  const handleActivate = async () => {
    if (!system) return;
    if (!eligibilityResult?.isEligible) return;

    setIsActivating(true);
    setResult(null);

    const service = new FlexMigrationService();

    try {
      const bundleModel = {
        bundleId: system.bundleId,
        systemId: system.systemId,
        productId: system.productId,
        name: system.name,
        price: system.price,
        flexCount: Number(system.flexCount) || 0,
        isActive: system.status === 'active'
      };

      const res = await service.activateSystem(
        bundleModel, 
        msisdn, 
        password,
        (step: ActivationProgressStep) => setProgressStep(step),
        eligibilityResult.token
      );

      // Log into DB
      await supabase.from('legacy_flex_operations').insert({
        user_id: user?.id,
        system_id: system.id,
        msisdn: msisdn,
        status: res.isSuccessful ? 'SUCCESS' : 'FAILED',
        error_reason: res.isSuccessful ? null : res.response.errorCode,
        execution_time_ms: res.executionTimeMs
      });

      setResult({
        success: res.isSuccessful,
        message: res.isSuccessful ? `تم تفعيل ${system.name} بنجاح.` : 'فشل التفعيل',
        details: res.response.message,
        executionTime: res.executionTimeMs
      });

    } catch (err: any) {
      setResult({
        success: false,
        message: 'حدث خطأ غير متوقع',
        details: err?.message || 'يرجى المحاولة لاحقاً.'
      });
    } finally {
      setIsActivating(false);
    }
  };

  const getStepText = (step: string | ActivationProgressStep) => {
    const steps: Record<string, string> = {
      login: 'تسجيل الدخول...',
      verifying: 'التحقق من الحساب...',
      reading_systems: 'قراءة الأنظمة المتاحة...',
      matching_system: 'مطابقة النظام المطلوب...',
      sending_request: 'إرسال طلب التفعيل...',
      waiting_response: 'في انتظار رد الخادم...',
      analyzing_result: 'تحليل النتيجة...',
      completed: 'اكتملت العملية.'
    };
    return steps[step as string] || step;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isActivating && onClose()}>
      <DialogContent 
        className="w-[90vw] max-w-sm rounded-[32px] p-0 border border-white/10 bg-[#0F0F0F]/95 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden gap-0" 
        dir="rtl"
        onInteractOutside={(e) => {
          if (isActivating) e.preventDefault();
        }}
      >
        {/* Glow */}
        <div className="absolute top-0 right-0 w-full h-32 bg-primary/10 blur-[50px] rounded-full pointer-events-none" />

        <DialogHeader className="p-6 pb-4 text-right relative z-10">
          <DialogTitle className="text-xl font-black text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            تفعيل {system?.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-white/50 font-medium">
            سيتم استهلاك {system?.price} ج.م للحصول على {system?.flexCount.toLocaleString()} فليكس.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-0 space-y-4 relative z-10">
          {!result && !isActivating && !isChecking && !eligibilityResult?.isEligible && (
            <>
              {/* Inputs */}
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-white/70 ml-1">رقم الهاتف</label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <Input 
                      type="tel" 
                      value={msisdn}
                      onChange={e => setMsisdn(e.target.value)}
                      placeholder="010XXXXXXXX" 
                      className="h-11 pr-9 rounded-xl bg-black/40 border-white/10 text-left text-white focus-visible:ring-primary/30" 
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-white/70 ml-1">كلمة مرور Ana Vodafone</label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <Input 
                      type={showPassword ? 'text' : 'password'} 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="h-11 pr-9 pl-10 rounded-xl bg-black/40 border-white/10 text-left text-white focus-visible:ring-primary/30" 
                      dir="ltr"
                    />
                    <Button 
                      type="button"
                      variant="ghost" 
                      size="icon" 
                      className="absolute left-1 top-1/2 -translate-y-1/2 w-9 h-9 text-white/40 hover:text-white hover:bg-white/5 rounded-lg"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Alerts Section (Premium Box) */}
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
                <h4 className="text-[11px] font-black text-primary flex items-center gap-1.5 mb-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  تعليمات التفعيل:
                </h4>
                <ul className="space-y-1.5">
                  {[
                    'أدخل بيانات Ana Vodafone الخاصة بالخط.',
                    'تأكد من صحة البيانات.',
                    'سيتم عرض نتيجة التنفيذ فور انتهاء العملية.',
                    'في حالة الفشل سيتم عرض السبب الحقيقي.'
                  ].map((note, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[10px] text-white/60 font-medium leading-relaxed">
                      <div className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-2">
                <Button 
                  variant="ghost" 
                  className="flex-1 h-11 rounded-xl font-bold text-xs bg-transparent border border-white/10 text-white hover:bg-white/5"
                  onClick={onClose}
                >
                  إلغاء
                </Button>
                <Button 
                  className="flex-1 h-11 rounded-xl font-black text-xs bg-primary hover:bg-primary/90 text-white shadow-[0_4px_15px_rgba(230,0,0,0.4)]"
                  onClick={handleCheckEligibility}
                  disabled={!msisdn}
                >
                  التحقق من الخط
                </Button>
              </div>
            </>
          )}

          {!result && !isActivating && !isChecking && eligibilityResult?.isEligible && (
            <div className="space-y-4">
              <div className={`border rounded-2xl p-4 space-y-2 ${eligibilityResult.needsACP ? 'bg-warning/5 border-warning/20' : 'bg-success/5 border-success/20'}`}>
                <h4 className={`text-[11px] font-black flex items-center gap-1.5 mb-1.5 ${eligibilityResult.needsACP ? 'text-warning' : 'text-success'}`}>
                  <AlertCircle className="w-3.5 h-3.5" />
                  نتيجة الفحص:
                </h4>
                <p className="text-xs text-white/80 leading-relaxed font-medium">
                  {eligibilityResult.message}
                </p>
              </div>

              <div className="pt-2 flex gap-2">
                <Button 
                  variant="ghost" 
                  className="flex-1 h-11 rounded-xl font-bold text-xs bg-transparent border border-white/10 text-white hover:bg-white/5"
                  onClick={() => setEligibilityResult(null)}
                >
                  تعديل البيانات
                </Button>
                <Button 
                  className="flex-1 h-11 rounded-xl font-black text-xs bg-primary hover:bg-primary/90 text-white shadow-[0_4px_15px_rgba(230,0,0,0.4)]"
                  onClick={handleActivate}
                >
                  تأكيد التفعيل
                </Button>
              </div>
            </div>
          )}

          {(isActivating || isChecking) && !result && (
            <div className="py-8 flex flex-col items-center justify-center space-y-6">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
                <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin" />
                <Zap className="w-6 h-6 text-primary animate-pulse" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-sm font-black text-white">جاري التنفيذ...</h3>
                <p className="text-xs text-white/50">{progressStep ? getStepText(progressStep) : 'يرجى الانتظار'}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="py-4 flex flex-col items-center justify-center space-y-4 text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${result.success ? 'bg-green-500/20 text-green-500 shadow-green-500/20' : 'bg-destructive/20 text-destructive shadow-destructive/20'}`}>
                {result.success ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
              </div>
              
              <div className="space-y-1">
                <h3 className={`text-base font-black ${result.success ? 'text-green-500' : 'text-destructive'}`}>
                  {result.message}
                </h3>
                {result.details && (
                  <p className="text-xs text-white/60 leading-relaxed max-w-[250px] mx-auto">
                    {result.details}
                  </p>
                )}
                {result.executionTime && (
                  <p className="text-[10px] text-white/40 mt-2 font-mono">
                    زمن التنفيذ: {(result.executionTime / 1000).toFixed(1)}s
                  </p>
                )}
              </div>

              <Button 
                variant="ghost" 
                className="w-full h-11 mt-4 rounded-xl font-bold text-xs bg-white/5 border border-white/10 text-white hover:bg-white/10"
                onClick={onClose}
              >
                إغلاق
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}