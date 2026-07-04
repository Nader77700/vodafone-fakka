// صفحة الشحن — تحوّلت إلى redirect تلقائي لصفحة الشبكات
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppFooter from '@/components/common/AppFooter';

export default function RechargePage() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate('/networks', { replace: true }), 1500);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 space-y-5 page-enter" dir="rtl">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(230,0,0,0.15)', border: '1.5px solid rgba(230,0,0,0.30)' }}>
        <Radio className="w-8 h-8" style={{ color: '#E60000' }} />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-lg font-black text-balance">جاري التحويل...</h2>
        <p className="text-sm text-muted-foreground text-pretty max-w-[260px]">
          يتم تحويلك إلى صفحة الشبكات.
        </p>
      </div>
      <Button className="gap-2 h-11 font-semibold" style={{ background: 'linear-gradient(90deg,#E60000,#B30000)' }}
        onClick={() => navigate('/networks', { replace: true })}>
        <ArrowLeft className="w-4 h-4" />
        الذهاب للشبكات
      </Button>
      <AppFooter />
    </div>
  );
}
