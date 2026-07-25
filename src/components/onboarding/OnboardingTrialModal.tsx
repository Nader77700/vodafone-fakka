// مودال Onboarding خطوة بخطوة لتعريف المستخدم الجديد بالتجربة المجانية
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Gift, Copy, Key, Zap, Star, X, ChevronLeft } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    icon: <Star className="w-10 h-10 text-yellow-400" />,
    title: 'مرحباً بك في فودافون فكة! 🎉',
    desc: 'حسابك جاهز! هتلاقي هدية ترحيبية بتجربة مجانية — عشان تشوف القوة بنفسك قبل ما تشترك.',
    hint: 'استمر لتعرف كيف تفعّل هديتك',
  },
  {
    icon: <Gift className="w-10 h-10 text-primary" />,
    title: 'اضغط على صندوق الهدية',
    desc: 'في الصفحة الرئيسية هتلاقي صندوق هدية 🎁 — اضغط عليه لفتح كود التجربة المجانية.',
    hint: 'صندوق الهدية موجود في وسط الشاشة الرئيسية',
  },
  {
    icon: <Copy className="w-10 h-10 text-blue-400" />,
    title: 'انسخ الكود',
    desc: 'بعد ما تفتح الهدية هيظهر لك كود — اضغط "نسخ" عشان تحتفظ بيه.',
    hint: 'الكود صالح لمدة محدودة فاستخدمه بسرعة',
  },
  {
    icon: <Key className="w-10 h-10 text-green-400" />,
    title: 'فعّل الكود دلوقتي',
    desc: 'روح لصفحة "تفعيل الكود"، الصق الكود واضغط تفعيل — وهتبدأ تجربتك المجانية فوراً!',
    hint: 'هتنتقل تلقائياً لصفحة التفعيل',
  },
];

export default function OnboardingTrialModal({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onClose();
      navigate('/activate');
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] md:max-w-sm p-0 overflow-hidden border border-border"
        style={{ background: 'hsl(var(--background))', direction: 'rtl' }}
      >
        {/* زر الإغلاق */}
        <button
          onClick={handleSkip}
          className="absolute top-3 left-3 z-10 p-1.5 rounded-full hover:bg-muted/60 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* المحتوى */}
        <div className="px-6 pt-10 pb-6 flex flex-col items-center text-center gap-4">
          {/* الأيقونة */}
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
            {current.icon}
          </div>

          {/* العنوان */}
          <h2 className="text-lg font-bold text-foreground leading-snug">{current.title}</h2>

          {/* الوصف */}
          <p className="text-sm text-muted-foreground leading-relaxed">{current.desc}</p>

          {/* تلميح */}
          <p className="text-xs text-primary/70 bg-primary/8 rounded-lg px-3 py-2 w-full">
            💡 {current.hint}
          </p>

          {/* مؤشر الخطوات */}
          <div className="flex gap-1.5 mt-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* الأزرار */}
        <div className="px-6 pb-6 flex gap-3">
          {!isLast && (
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-muted-foreground"
              onClick={handleSkip}
            >
              تخطي
            </Button>
          )}
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            onClick={handleNext}
          >
            {isLast ? (
              <><Zap className="w-4 h-4 ml-2" />فعّل التجربة</>
            ) : (
              <><ChevronLeft className="w-4 h-4 ml-1" />التالي</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
