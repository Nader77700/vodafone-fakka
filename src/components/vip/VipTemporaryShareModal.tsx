import React, { useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Share2,
  Flame,
  Copy,
  Check,
  Clock,
  Eye,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createVipTemporaryLink,
  listVipTemporaryLinks,
  burnVipTemporaryLink,
  type VipTemporaryLink,
} from '@/lib/vipTemporaryLinkService';

interface VipTemporaryShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VipTemporaryShareModal({ open, onOpenChange }: VipTemporaryShareModalProps) {
  const [links, setLinks] = useState<VipTemporaryLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [burningToken, setBurningToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Form states
  const [durationHours, setDurationHours] = useState<string>('24');
  const [title, setTitle] = useState<string>('رابط مؤقت لقسم اتصالات VIP');
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null);

  const loadLinks = async () => {
    setLoading(true);
    try {
      const data = await listVipTemporaryLinks();
      setLinks(data);
    } catch {
      toast.error('تعذر جلب الروابط المؤقتة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadLinks();
    }
  }, [open]);

  const handleCreate = async () => {
    setCreating(true);
    setNewShareUrl(null);
    try {
      const hoursNum = durationHours === 'unlimited' ? null : parseInt(durationHours, 10);
      const res = await createVipTemporaryLink({
        hours: hoursNum,
        title: title.trim() || 'رابط مؤقت لقسم اتصالات VIP',
        access_mode: 'view_and_operate',
      });

      if (res.success && res.shareUrl) {
        setNewShareUrl(res.shareUrl);
        toast.success('تم توليد الرابط المؤقت بنجاح!');
        loadLinks();
      } else {
        toast.error(res.error || 'تعذر توليد الرابط');
      }
    } catch (err: any) {
      toast.error(err.message || 'خطأ أثناء الإنشاء');
    } finally {
      setCreating(false);
    }
  };

  const handleBurn = async (token: string) => {
    const confirmBurn = window.confirm(
      '⚠️ هل أنت متأكد من رغبتك في حرق هذا الرابط الآن؟\n\nبمجرد الحرق، سيتوقف الرابط فوراً ولن يتمكن أي شخص من استخدامه إطلاقاً!'
    );
    if (!confirmBurn) return;

    setBurningToken(token);
    try {
      const res = await burnVipTemporaryLink(token, 'تم الحرق يدوياً بواسطة المالك');
      if (res.success) {
        toast.success('🔥 تم حرق الرابط بنجاح وإلغاؤه فوراً!');
        if (newShareUrl && newShareUrl.includes(token)) {
          setNewShareUrl(null);
        }
        loadLinks();
      } else {
        toast.error(res.message || 'تعذر حرق الرابط');
      }
    } catch (err: any) {
      toast.error(err.message || 'خطأ في الحرق');
    } finally {
      setBurningToken(null);
    }
  };

  const copyToClipboard = (url: string, token: string) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success('تم نسخ الرابط المؤقت للحافظة!');
    setTimeout(() => setCopiedToken(null), 2500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl bg-slate-950 border-amber-500/30 text-white max-h-[90dvh] overflow-y-auto">
        <DialogHeader className="space-y-2 border-b border-white/10 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Share2 className="w-5 h-5" />
              </div>
              <DialogTitle className="text-lg font-bold text-amber-400">
                مشاركة القسم عبر رابط مؤقت مستقل
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadLinks}
              disabled={loading}
              className="text-slate-400 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            يمكنك إنشاء رابط خارجي مؤقت يفتح فقط قسم أتمتة اتصالات VIP بمفرده بدون الحاجة للدخول لكامل التطبيق، مع إمكانية حرق الرابط وتعطيله فوراً في أي وقت.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Create Box */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-emerald-400" />
                توليد رابط مؤقت جديد
              </span>
              <Badge variant="outline" className="text-[11px] border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
                مستقل وآمن
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">عنوان الرابط (اختياري)</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: رابط مؤقت لفحص الجلسة"
                  className="bg-slate-950 border-slate-700 text-sm text-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">مدة صلاحية الرابط</Label>
                <Select value={durationHours} onValueChange={setDurationHours}>
                  <SelectTrigger className="bg-slate-950 border-slate-700 text-sm text-white">
                    <SelectValue placeholder="اختر المدة" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="1">ساعة واحدة (1h)</SelectItem>
                    <SelectItem value="6">6 ساعات</SelectItem>
                    <SelectItem value="24">24 ساعة (يوم كامل)</SelectItem>
                    <SelectItem value="72">3 أيام</SelectItem>
                    <SelectItem value="unlimited">مفتوح (حرق يدوي فقط)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleCreate}
              disabled={creating}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold"
            >
              {creating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin ml-2" />
                  جاري توليد الرابط...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 ml-2" />
                  إنشاء الرابط المؤقت الآن
                </>
              )}
            </Button>

            {/* Generated Box */}
            {newShareUrl && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    تم إنشاء الرابط بنجاح!
                  </span>
                  <span className="text-[11px] text-slate-400">جاهز للإرسال</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={newShareUrl}
                    className="bg-slate-950/90 border-emerald-500/40 text-xs font-mono text-emerald-300 select-all"
                  />
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(newShareUrl, 'new')}
                    className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {copiedToken === 'new' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(newShareUrl, '_blank')}
                    className="shrink-0 border-slate-700 hover:bg-slate-800 text-slate-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Active Links List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                سجل الروابط المؤقتة وخاصية الحرق
              </span>
              <span className="text-xs text-slate-400">({links.length} رابط)</span>
            </div>

            {loading ? (
              <div className="p-6 text-center text-sm text-slate-400">جاري تحميل الروابط...</div>
            ) : links.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-900/50 border border-slate-800/80 text-xs text-slate-500">
                لا توجد روابط مؤقتة تم إنشاؤها بعد.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {links.map((link) => {
                  const origin = typeof window !== 'undefined' ? window.location.origin : '';
                  const url = `${origin}/vip-share/${link.token}`;
                  const isBurned = !link.is_active || !!link.burned_at;
                  const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
                  const isDead = isBurned || isExpired;

                  return (
                    <div
                      key={link.id}
                      className={`p-3 rounded-xl border transition-all ${
                        isDead
                          ? 'bg-slate-950/60 border-slate-800/60 opacity-60'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white truncate max-w-[200px]">
                              {link.title}
                            </span>
                            {isBurned ? (
                              <Badge variant="destructive" className="text-[10px] bg-red-950 border-red-500/40 text-red-400">
                                🔥 تم الحرق
                              </Badge>
                            ) : isExpired ? (
                              <Badge variant="secondary" className="text-[10px] bg-slate-800 text-slate-400">
                                ⌛ منتهي الصلاحية
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
                                🟢 نشط ويعمل
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3 text-slate-500" />
                              {link.view_count} زيارة
                            </span>
                            <span>•</span>
                            <span>
                              {link.expires_at
                                ? `ينتهي: ${new Date(link.expires_at).toLocaleString('ar-EG', {
                                    month: 'numeric',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}`
                                : 'صلاحية مفتوحة'}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isDead && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyToClipboard(url, link.token)}
                                className="h-8 px-2 text-slate-300 hover:text-white hover:bg-slate-800"
                                title="نسخ الرابط"
                              >
                                {copiedToken === link.token ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => window.open(url, '_blank')}
                                className="h-8 px-2 text-slate-300 hover:text-white hover:bg-slate-800"
                                title="فتح الرابط"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>

                              <Button
                                size="sm"
                                onClick={() => handleBurn(link.token)}
                                disabled={burningToken === link.token}
                                className="h-8 px-2.5 bg-red-950/80 hover:bg-red-900 border border-red-500/50 text-red-300 hover:text-red-100 font-bold text-xs"
                                title="حرق الرابط فوراً"
                              >
                                <Flame className="w-3.5 h-3.5 ml-1 text-red-400" />
                                {burningToken === link.token ? 'جاري الحرق...' : 'حرق الآن'}
                              </Button>
                            </>
                          )}
                          {isDead && (
                            <span className="text-[11px] text-slate-500 italic">معطل نهائياً</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
