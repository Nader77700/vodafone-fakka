import { useNavigate } from 'react-router-dom';
import { ShieldAlert, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LegacyFlexSubRequiredPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-3 px-4 h-16">
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={() => navigate(-1)}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-black text-foreground">تفعيل النظام</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-info/10 border-2 border-info/20 flex items-center justify-center relative">
          <ShieldAlert className="w-12 h-12 text-info" />
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-destructive flex items-center justify-center border-4 border-background">
            <LockIcon className="w-4 h-4 text-white" />
          </div>
        </div>

        <div className="space-y-2 max-w-[280px]">
          <h2 className="text-2xl font-black text-foreground">عذراً، الخدمة مقفلة</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            أنظمة فليكس القديمة متاحة حصرياً للمشتركين النشطين في خدمات تطبيق Vodafone Fakka Premium.
          </p>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-4 w-full text-right space-y-3">
          <h3 className="text-sm font-bold text-foreground mb-1">مميزات الاشتراك:</h3>
          {[
            'إمكانية التفعيل والتحويل بين الأنظمة',
            'دعم كامل وسريع لجميع الأنظمة',
            'لا يوجد حدود على عدد المرات'
          ].map((feature, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
              <span className="text-xs text-muted-foreground">{feature}</span>
            </div>
          ))}
        </div>

        <div className="w-full space-y-3 pt-4">
          <Button className="w-full h-12 text-base font-bold rounded-xl" onClick={() => navigate('/activate')}>
            تفعيل اشتراك الآن
          </Button>
          <Button variant="outline" className="w-full h-12 text-sm font-bold rounded-xl" onClick={() => navigate(-1)}>
            العودة للأنظمة
          </Button>
        </div>
      </div>
    </div>
  );
}

function LockIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}