import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, CheckCircle2, Trash2, ShieldAlert, Eye } from 'lucide-react';
import { useWalletPins } from '@/hooks/useWalletPins';

export function PinManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { savedPins, defaultPin, removePin, setAsDefault } = useWalletPins();
  const [authenticatedWith, setAuthenticatedWith] = useState<string | null>(null);
  const [authInput, setAuthInput] = useState('');
  const [authError, setAuthError] = useState(false);

  const [targetReveal, setTargetReveal] = useState<string | null>(null);
  const [revealInput, setRevealInput] = useState('');
  const [revealError, setRevealError] = useState(false);

  const handleAuth = () => {
    if (savedPins.includes(authInput)) {
      setAuthenticatedWith(authInput);
      setAuthError(false);
      setAuthInput('');
    } else {
      setAuthError(true);
    }
  };

  const handleReveal = () => {
    if (targetReveal === revealInput) {
      setAuthenticatedWith(revealInput);
      setTargetReveal(null);
      setRevealInput('');
      setRevealError(false);
    } else {
      setRevealError(true);
    }
  };

  React.useEffect(() => {
    if (!open) {
      setAuthenticatedWith(null);
      setAuthInput('');
      setAuthError(false);
      setTargetReveal(null);
      setRevealInput('');
      setRevealError(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] w-[92vw] md:max-w-[400px] p-0 border-0" style={{ background: '#0a0000', border: '1px solid rgba(230,0,0,0.25)', borderRadius: 20 }} dir="rtl">
        <DialogHeader className="p-4 border-b border-white/10">
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#E60000]" />
            إدارة الأرقام السرية للمحفظة
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {!authenticatedWith && savedPins.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <p className="text-xs leading-relaxed">
                  لأسباب أمنية، يرجى إدخال أي من الأرقام السرية المحفوظة للوصول إلى لوحة الإدارة.
                </p>
              </div>
              <div className="space-y-2">
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="أدخل الرقم السري للتحقق"
                  value={authInput}
                  onChange={(e) => setAuthInput(e.target.value)}
                  className="bg-white/5 border-white/10 text-white text-center tracking-widest text-lg"
                  maxLength={6}
                />
                {authError && <p className="text-xs text-red-400">الرقم السري غير صحيح أو غير محفوظ.</p>}
                <Button className="w-full bg-[#E60000] hover:bg-[#CC0000] text-white" onClick={handleAuth}>
                  تحقق ودخول
                </Button>
              </div>
            </div>
          ) : savedPins.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <Lock className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>لا توجد أرقام سرية محفوظة حالياً.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {targetReveal ? (
                <div className="space-y-3 p-4 rounded-xl border border-white/10 bg-white/5">
                  <p className="text-xs text-white/70">أدخل الرقم السري لهذا الحساب لإظهاره وإدارته:</p>
                  <Input
                    type="password"
                    inputMode="numeric"
                    placeholder="الرقم السري"
                    value={revealInput}
                    onChange={(e) => setRevealInput(e.target.value)}
                    className="bg-black/50 border-white/10 text-white text-center tracking-widest"
                    maxLength={6}
                  />
                  {revealError && <p className="text-xs text-red-400">الرقم غير متطابق.</p>}
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-[#E60000] hover:bg-[#CC0000]" onClick={handleReveal}>تحقق</Button>
                    <Button type="button" className="flex-1 bg-white/10 text-white hover:bg-white/20" onClick={() => { setTargetReveal(null); setRevealInput(''); setRevealError(false); }}>إلغاء</Button>
                  </div>
                </div>
              ) : (
                savedPins.map((p, idx) => {
                  const isRevealed = p === authenticatedWith;
                  const isDefault = p === defaultPin;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5">
                      <div>
                        <div className="text-lg font-mono tracking-[0.3em] text-white">
                          {isRevealed ? p : '••••••'}
                        </div>
                        {isDefault && <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded flex w-max items-center gap-1 mt-1"><CheckCircle2 className="w-3 h-3" /> الافتراضي</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isRevealed && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10" onClick={() => setTargetReveal(p)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {isRevealed && !isDefault && (
                          <Button size="sm" variant="ghost" className="h-8 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-400/10" onClick={() => setAsDefault(p)}>
                            تعيين كافتراضي
                          </Button>
                        )}
                        {isRevealed && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => { removePin(p); if (p === authenticatedWith) setAuthenticatedWith(null); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
