import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';

interface CardFeedbackModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  operationId: string;
  cardType: string;
  operationDate: string;
  userName?: string;
}

export function CardFeedbackModal({
  isOpen,
  onOpenChange,
  operationId,
  cardType,
  operationDate,
  userName
}: CardFeedbackModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actualUnits, setActualUnits] = useState('');
  const [actualPrice, setActualPrice] = useState('');
  const [actualValidity, setActualValidity] = useState('');
  
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setActualUnits('');
    setActualPrice('');
    setActualValidity('');
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('الرجاء اختيار صورة صالحة');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
      return;
    }

    setScreenshot(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setScreenshotPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const clearScreenshot = () => {
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadScreenshot = async (file: File): Promise<string | null> => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Not authenticated');

      let uploadData: Blob = file;
      let fileExt = file.name ? file.name.split('.').pop() : 'jpg';

      // تجنب مشكلة تلف كائن File في الـ WebView عند إعادة المحاولة
      if (screenshotPreview) {
        try {
          const res = await fetch(screenshotPreview);
          uploadData = await res.blob();
        } catch (e) {
          console.warn('Failed to convert preview to blob, using original file', e);
        }
      }

      // تنظيف اسم الملف ليكون أحرف إنجليزية فقط
      const safeExt = fileExt?.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${safeExt}`;

      const { data, error } = await supabase.storage
        .from('feedbacks')
        .upload(fileName, uploadData, { 
          upsert: false,
          contentType: file.type || 'image/jpeg'
        });

      if (error) {
        console.error('Supabase upload error:', error);
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from('feedbacks')
        .getPublicUrl(data.path);

      return publicUrlData.publicUrl;
    } catch (err: any) {
      console.error('Error uploading screenshot:', err);
      // عرض الخطأ الفعلي للمستخدم للمساعدة في التشخيص
      toast.error('فشل الرفع: ' + (err.message || 'يرجى المحاولة مرة أخرى'));
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!actualUnits && !actualPrice && !actualValidity && !screenshot) {
      toast.error('الرجاء إدخال بيانات تعديل واحدة على الأقل أو إرفاق صورة');
      return;
    }

    setIsSubmitting(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('يجب تسجيل الدخول');

      let screenshotUrl = null;
      if (screenshot) {
        screenshotUrl = await uploadScreenshot(screenshot);
        if (!screenshotUrl) {
          setIsSubmitting(false);
          return;
        }
      }

      const { error } = await supabase.from('card_feedbacks').insert({
        user_id: user.id,
        user_name: userName || 'مستخدم',
        operation_id: operationId,
        card_type: cardType,
        operation_date: operationDate,
        actual_units: actualUnits ? Number(actualUnits) : null,
        actual_price: actualPrice ? Number(actualPrice) : null,
        actual_validity_days: actualValidity ? Number(actualValidity) : null,
        screenshot_url: screenshotUrl
      });

      if (error) throw error;

      toast.success('تم إرسال اقتراحك بنجاح، شكراً لك!');
      handleOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء الإرسال');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] w-[95vw] max-w-[95vw] rounded-2xl mx-auto border-border/50 bg-background/95 backdrop-blur-xl">
        <DialogHeader className="text-right rtl">
          <DialogTitle className="text-xl text-primary font-bold">تقييم واقتراح تعديل</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed pt-2">
            هل هناك اختلاف في الكارت الذي تم شحنه؟ يمكنك اقتراح تعديل على بيانات الكارت وسنقوم بمراجعتها.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 rtl pt-4">
          <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 mb-2 flex items-start gap-2">
            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-bold text-foreground">نوع الكارت:</span> {cardType}
              <br />
              <span className="font-bold text-foreground">الرقم المرجعي:</span> {operationId.slice(0, 8).toUpperCase()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-bold">الوحدات الفعلية</Label>
              <Input
                type="number"
                placeholder="مثال: 450"
                value={actualUnits}
                onChange={(e) => setActualUnits(e.target.value)}
                className="h-11 bg-card/50 text-left border-border/50 focus-visible:ring-primary/30"
                dir="ltr"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-bold">السعر المخصوم (ج)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="مثال: 10.5"
                value={actualPrice}
                onChange={(e) => setActualPrice(e.target.value)}
                className="h-11 bg-card/50 text-left border-border/50 focus-visible:ring-primary/30"
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground font-bold">الصلاحية الفعلية (أيام)</Label>
            <Input
              type="number"
              placeholder="مثال: 7"
              value={actualValidity}
              onChange={(e) => setActualValidity(e.target.value)}
              className="h-11 bg-card/50 text-left border-border/50 focus-visible:ring-primary/30"
              dir="ltr"
            />
          </div>

          <div className="space-y-2 pt-2">
            <Label className="text-xs text-muted-foreground font-bold">سكرين شوت من محفظتك (اختياري)</Label>
            
            {screenshotPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-border/50 h-32 bg-black/20">
                <img src={screenshotPreview} alt="Screenshot" className="w-full h-full object-contain" />
                <button
                  type="button"
                  onClick={clearScreenshot}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white backdrop-blur-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/50 rounded-xl h-20 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-card/50 hover:border-primary/50 transition-colors"
              >
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">اضغط لرفع صورة (اختياري)</span>
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="flex-1 rounded-xl h-11 border-border/50"
              disabled={isSubmitting}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              className="flex-1 rounded-xl h-11 bg-primary hover:bg-primary/90 text-white font-bold shadow-lg shadow-primary/20"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                'إرسال الاقتراح'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}