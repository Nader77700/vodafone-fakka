import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { KeyRound, Mail, Phone, Loader2, Save, ShieldCheck } from 'lucide-react';
import { updateVipSessionCredentials } from '@/services/vipDelegationService';

interface VipSessionEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionName?: string;
  currentDial?: string;
  currentOwnerEmail?: string;
  currentChildEmail?: string;
  onSuccess?: () => void;
}

export function VipSessionEditModal({
  open,
  onOpenChange,
  sessionId,
  sessionName,
  currentDial = '',
  currentOwnerEmail = '',
  currentChildEmail = '',
  onSuccess,
}: VipSessionEditModalProps) {
  const [dialNumber, setDialNumber] = useState(currentDial);
  const [ownerEmail, setOwnerEmail] = useState(currentOwnerEmail);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [childEmail, setChildEmail] = useState(currentChildEmail);
  const [childPassword, setChildPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      toast.error('لم يتم تحديد معرف الجلسة');
      return;
    }

    setSaving(true);
    try {
      const res = await updateVipSessionCredentials({
        sessionId,
        dialNumber: dialNumber.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPassword: ownerPassword.trim(),
        childEmail: childEmail.trim(),
        childPassword: childPassword.trim(),
      });

      if (res.success) {
        toast.success(res.message || 'تم تحديث بيانات الجلسة بنجاح');
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.message || 'تعذر تحديث بيانات الجلسة');
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء حفظ التعديلات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-1.5rem)] md:max-w-md p-3.5 sm:p-4 bg-card border-border shadow-2xl">
        <DialogHeader className="pb-2 border-b border-border text-right space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-foreground">
                تعديل بيانات الجلسة (الأونر والفرد)
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground">
                تحديث البريد أو كلمة المرور مباشرة دون الحاجة لإنشاء جلسة جديدة
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3 pt-1">
          {sessionName && (
            <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded-md border border-border flex items-center justify-between">
              <span>الجلسة الحالية:</span>
              <span className="font-mono font-semibold text-foreground">{sessionName}</span>
            </div>
          )}

          {/* رقم الخط */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3 text-primary" />
              رقم خط الأونر / الحساب
            </Label>
            <Input
              value={dialNumber}
              onChange={(e) => setDialNumber(e.target.value)}
              placeholder="مثال: 01100000000"
              className="h-8 text-xs font-mono bg-background"
              dir="ltr"
            />
          </div>

          {/* بيانات الأونر */}
          <div className="p-2.5 rounded-lg bg-background border border-border space-y-2">
            <div className="text-[11px] font-bold text-amber-500 flex items-center gap-1">
              <span>👑 بيانات حساب الأونر (Owner)</span>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Mail className="w-2.5 h-2.5" />
                البريد الإلكتروني للأونر
              </Label>
              <Input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@example.com"
                className="h-7 text-xs font-mono bg-card"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                <KeyRound className="w-2.5 h-2.5" />
                كلمة المرور الجديدة للأونر (اتركها فارغة إن لم ترغب بتغييرها)
              </Label>
              <Input
                type="text"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                placeholder="اتركها فارغة للإبقاء على الحالية"
                className="h-7 text-xs font-mono bg-card"
                dir="ltr"
              />
            </div>
          </div>

          {/* بيانات الفرد */}
          <div className="p-2.5 rounded-lg bg-background border border-border space-y-2">
            <div className="text-[11px] font-bold text-primary flex items-center gap-1">
              <span>👤 بيانات حساب الفرد (Child)</span>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Mail className="w-2.5 h-2.5" />
                البريد الإلكتروني للفرد
              </Label>
              <Input
                type="email"
                value={childEmail}
                onChange={(e) => setChildEmail(e.target.value)}
                placeholder="child@example.com"
                className="h-7 text-xs font-mono bg-card"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                <KeyRound className="w-2.5 h-2.5" />
                كلمة المرور الجديدة للفرد (اتركها فارغة إن لم ترغب بتغييرها)
              </Label>
              <Input
                type="text"
                value={childPassword}
                onChange={(e) => setChildPassword(e.target.value)}
                placeholder="اتركها فارغة للإبقاء على الحالية"
                className="h-7 text-xs font-mono bg-card"
                dir="ltr"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="h-7 text-xs px-3"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="h-7 text-xs px-3 gap-1 bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  حفظ التعديلات فوراً
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
