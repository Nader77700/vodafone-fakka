import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Users, KeyRound, Loader2, Save, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  getVipDefaultChildCredentials,
  saveVipDefaultChildCredentials,
} from '@/lib/vipApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (credentials: { child_email: string; child_password?: string; child_dial?: string }) => void;
}

export function VipDefaultChildModal({ open, onOpenChange, onSaved }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dial, setDial] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadDefaults();
    }
  }, [open]);

  const loadDefaults = async () => {
    setLoading(true);
    try {
      const res = await getVipDefaultChildCredentials();
      if (res && res.child_email) {
        setEmail(res.child_email);
        setPassword(res.child_password || '');
        setDial(res.child_dial || '');
      }
    } catch (err: any) {
      console.error('[VipDefaultChildModal] loadDefaults error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!email.trim()) {
      toast.error('يرجى إدخال بريد الفرد الإلكتروني');
      return;
    }
    setSaving(true);
    try {
      await saveVipDefaultChildCredentials(email.trim(), password.trim(), dial.trim());
      toast.success('تم حفظ بيانات الفرد الافتراضية بنجاح!');
      if (onSaved) {
        onSaved({
          child_email: email.trim(),
          child_password: password.trim(),
          child_dial: dial.trim(),
        });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'تعذر حفظ البيانات الافتراضية');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md p-5" dir="rtl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                بيانات الفرد الافتراضية المحفوظة
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                تُحفظ هذه البيانات لتعبئتها تلقائياً عند فتح أو إضافة أي جلسة جديدة
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-6 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span>جاري جلب البيانات المحفوظة...</span>
          </div>
        ) : (
          <div className="space-y-3 py-2 text-xs">
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-muted-foreground leading-relaxed flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <span>
                عند حفظ بيانات الفرد هنا، لن تحتاج لكتابتها مجدداً في كل جلسة؛ ستكتفي فقط بإدخال بريد وباسورد الأونر وسيقوم النظام بتعبئة الفرد فوراً!
              </span>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">البريد الإلكتروني لحساب الفرد:</label>
              <Input
                placeholder="example_child@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="font-mono text-xs h-9"
                dir="ltr"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">كلمة مرور حساب الفرد:</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono text-xs h-9"
                dir="ltr"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground flex items-center justify-between">
                <span>رقم هاتف الفرد (اختياري):</span>
                <span className="text-[10px] text-muted-foreground font-normal">يُستخرج آلياً أيضاً</span>
              </label>
              <Input
                placeholder="011xxxxxxxx"
                value={dial}
                onChange={(e) => setDial(e.target.value)}
                className="font-mono text-xs h-9"
                dir="ltr"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="text-xs"
          >
            إلغاء
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || loading || !email.trim()}
            className="text-xs gap-1.5 font-bold"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جاري الحفظ...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>حفظ كبيانات افتراضية</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
