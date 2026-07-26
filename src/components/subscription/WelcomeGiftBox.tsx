// صندوق الهدايا الترحيبي — يظهر في صفحة التفعيل
import { useState, useEffect, useCallback } from 'react';
import { Gift, Copy, Check, X, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getGiftBoxStatus, claimGiftCode, confirmGiftClaim,
  getMyGifts,
} from '@/lib/api';
import type { WelcomeGift, MyGiftEntry } from '@/lib/api';
import type { LicenseKey, CodeType } from '@/types/types';
import { toast } from 'sonner';

// ── Shake كل 4.5 ثانية ──
function useShakeCycle(intervalMs = 4500) {
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return shaking;
}

// ── ‌نوع الكود — لا يُستخدم في الكارت لكن نحتاجه في RevealModal ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _CodeTypeBadge({ type }: { type: CodeType }) {
  const map: Record<CodeType, { label: string; cls: string }> = {
    gift:  { label: 'هدية',    cls: 'bg-success/10 text-success border-success/20' },
    trial: { label: 'تجريبي', cls: 'bg-warning/10 text-warning border-warning/20' },
    paid:  { label: 'مدفوع',  cls: 'bg-primary/10 text-primary border-primary/20' },
  };
  const m = map[type] ?? map.gift;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${m.cls}`}>
      {m.label}
    </span>
  );
}

// ── P1 FIX: RevealModal — يظهر فقط الكود وزر الاستلام، بدون أي إحصائيات ──
interface RevealModalProps {
  open: boolean;
  code: string;
  gift: WelcomeGift;
  userId: string;
  onClose: () => void;
}

function RevealModal({ open, code, gift, userId, onClose }: RevealModalProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // تسجيل الاستلام + نسخ الكود — مرة واحدة فقط
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const el = document.createElement('textarea');
      el.value = code; document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    toast.success('تم نسخ الكود!');
    if (!confirmed && gift.license_key_id) {
      setConfirmed(true);
      await claimGiftCode(userId);
      await confirmGiftClaim(userId, gift.license_key_id);
    }
    setTimeout(() => setCopied(false), 2500);
  }, [code, confirmed, userId, gift.license_key_id]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex flex-col items-center gap-2 pt-1">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-success/20 border-2 border-primary/30 flex items-center justify-center text-4xl animate-bounce">
              🎁
            </div>
            <span className="text-xl font-black gradient-text">🎉 مبروك!</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pb-2">
          {/* P1: عرض مبسّط — بدون إحصائيات */}
          <p className="text-center text-sm text-muted-foreground">
            احصل على هديتك الترحيبية بنسخ الكود أدناه
          </p>

          {/* الكود */}
          <div className="flex items-center gap-2 p-4 rounded-xl bg-muted/50 border border-primary/20 font-mono">
            <span className="flex-1 text-base font-bold tracking-widest text-center select-all">{code}</span>
          </div>

          {!copied && (
            <p className="text-center text-xs text-warning bg-warning/8 border border-warning/20 rounded-lg px-3 py-2">
              ⚠️ انسخ الكود الآن — ستتمكن من استرجاعه من قسم هداياي لاحقاً
            </p>
          )}

          <Button
            className="w-full h-11 font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-2 glow-primary"
            onClick={handleCopy}
          >
            {copied
              ? <><Check className="w-4 h-4" />تم النسخ!</>
              : <><Copy className="w-4 h-4" />استلام الهدية</>}
          </Button>

          <Button variant="outline" className="w-full border-border h-10" onClick={onClose}>
            <X className="w-4 h-4 ml-1.5" />
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyGiftModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xs bg-card border-border text-center" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex flex-col items-center gap-3 pt-2">
            <div className="text-4xl">✨</div>
            <span className="text-base font-black">لا توجد عروض ترحيبية</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pb-2">
          <p className="text-sm text-muted-foreground text-pretty">
            لا توجد عروض ترحيبية متاحة حالياً. تابعنا لاحقاً للحصول على عروض جديدة.
          </p>
          <Button variant="outline" className="w-full border-border" onClick={onClose}>حسناً</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AlreadyClaimedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xs bg-card border-border text-center" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex flex-col items-center gap-3 pt-2">
            <div className="text-4xl">✔️</div>
            <span className="text-base font-black">استلمت هديتك مسبقاً</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pb-2">
          <p className="text-sm text-muted-foreground text-pretty">
            لقد استلمت الهدية الترحيبية مسبقاً. يمكن لكل مستخدم الاستلام مرة واحدة فقط.
          </p>
          <Button variant="outline" className="w-full border-border" onClick={onClose}>حسناً</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Props { userId: string; }

export default function WelcomeGiftBox({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [gift, setGift] = useState<WelcomeGift | null>(null);
  const [claiming, setClaiming] = useState(false);

  const [revealOpen, setRevealOpen] = useState(false);
  const [revealCode, setRevealCode] = useState('');
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [claimedOpen, setClaimedOpen] = useState(false);

  const shaking = useShakeCycle(4500);

  const loadStatus = useCallback(async () => {
    if (!userId) return;
    const s = await getGiftBoxStatus(userId);
    setAvailable(s.available);
    setAlreadyClaimed(s.alreadyClaimed);
    setGift(s.gift);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handlePress = useCallback(async () => {
    if (claiming) return;
    if (alreadyClaimed) { setClaimedOpen(true); return; }
    if (!available) { setEmptyOpen(true); return; }

    const key = gift?.license_key as LicenseKey | null;
    const code = key?.code ?? '';
    if (!code) { setEmptyOpen(true); return; }

    setRevealCode(code);
    setRevealOpen(true);
  }, [available, alreadyClaimed, claiming, gift]);

  if (loading) return null;
  if (!available && !alreadyClaimed) return null;

  return (
    <>
      {/* P1: بطاقة مبسّطة — بدون أي إحصائيات داخلية */}
      <button
        onClick={handlePress}
        disabled={claiming}
        className={[
          'relative w-full rounded-2xl border-2 overflow-hidden transition-all duration-200 focus:outline-none',
          'bg-gradient-to-br from-primary/10 via-card to-success/10',
          available
            ? 'border-primary/40 shadow-lg hover:shadow-xl hover:-translate-y-0.5 cursor-pointer'
            : 'border-muted/40 opacity-70 cursor-default',
          shaking && available ? 'animate-[wiggle_0.5s_ease-in-out]' : '',
        ].join(' ')}
        style={{
          boxShadow: available
            ? '0 0 20px hsl(var(--primary)/0.25), 0 4px 24px hsl(var(--primary)/0.12)'
            : undefined,
        }}
      >
        {/* بريق متحرك */}
        {available && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
            <div className="absolute inset-0 opacity-30" style={{
              background: 'linear-gradient(105deg, transparent 40%, hsl(var(--primary)/0.3) 50%, transparent 60%)',
              animation: 'shimmer 2.5s infinite',
            }} />
          </div>
        )}

        <div className="relative z-10 p-5 flex flex-col items-center gap-3 text-center">
          {/* أيقونة الهدية */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-success/20 border-2 border-primary/30 flex items-center justify-center text-4xl">
            {claiming
              ? <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              : alreadyClaimed ? '✔️' : '🎁'}
          </div>

          {available ? (
            <>
              <p className="text-base font-black text-foreground">🎁 مفاجأة لك</p>
              <p className="text-sm text-muted-foreground">احصل على هديتك الترحيبية</p>
              <div className="mt-1 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 glow-primary">
                <Gift className="w-4 h-4" />
                استلام الهدية
              </div>
            </>
          ) : alreadyClaimed ? (
            <>
              <p className="text-base font-black text-foreground">هديتك الترحيبية</p>
              <p className="text-sm text-muted-foreground">تم الاستلام مسبقاً ✔️</p>
            </>
          ) : null}
        </div>
      </button>

      {gift && (
        <RevealModal
          open={revealOpen}
          code={revealCode}
          gift={gift}
          userId={userId}
          onClose={() => setRevealOpen(false)}
        />
      )}
      <EmptyGiftModal open={emptyOpen} onClose={() => setEmptyOpen(false)} />
      <AlreadyClaimedModal open={claimedOpen} onClose={() => setClaimedOpen(false)} />
    </>
  );
}

// =====================================================
// PHASE 5: قسم هداياي — مدمج + قابل للطي للأكواد المستخدمة
// =====================================================
interface MyGiftsSectionProps { userId: string; }

export function MyGiftsSection({ userId }: MyGiftsSectionProps) {
  const [gifts, setGifts] = useState<MyGiftEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClaimed, setShowClaimed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getMyGifts(userId);
    setGifts(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleCopy = useCallback(async (entry: MyGiftEntry) => {
    const code = entry.code_snapshot;
    if (!code) return;
    try { await navigator.clipboard.writeText(code); }
    catch {
      const el = document.createElement('textarea');
      el.value = code; document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedId(entry.id);
    toast.success('تم نسخ الكود!');
    if (entry.status === 'pending') {
      await confirmGiftClaim(userId, entry.license_key_id);
      setGifts(prev => prev.map(g => g.id === entry.id ? { ...g, status: 'claimed' as const } : g));
    }
    setTimeout(() => setCopiedId(null), 2500);
  }, [userId]);

  if (loading) return null;
  if (gifts.length === 0) return null;

  const pending = gifts.filter(g => g.status !== 'claimed');
  const claimed = gifts.filter(g => g.status === 'claimed');

  const GiftRow = ({ entry }: { entry: MyGiftEntry }) => {
    const isClaimed = entry.status === 'claimed';
    const code = entry.code_snapshot;
    const days = entry.key?.custom_duration_days ?? entry.key?.duration_days ?? 0;
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
        isClaimed ? 'border-border/40 bg-muted/20' : 'border-primary/25 bg-primary/5'
      }`}>
        <span className="text-base shrink-0">{isClaimed ? '✅' : '🎁'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono font-bold tracking-wider truncate select-all">{code ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground">{new Date(entry.claimed_at).toLocaleDateString('en-GB')}{days > 0 ? ` · ${days} يوم` : ''}</p>
        </div>
        {code && (
          <button
            onClick={() => handleCopy(entry)}
            className="shrink-0 p-1.5 rounded-lg hover:bg-muted/60 transition-colors"
          >
            {copiedId === entry.id
              ? <Check className="w-3.5 h-3.5 text-success" />
              : <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Gift className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold">🎁 هداياي</span>
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">{gifts.length}</span>
        </div>
        <button onClick={load} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* قيد الانتظار — تظهر دائماً */}
      {pending.length > 0 && (
        <div className="p-2 space-y-1.5">
          {pending.map(e => <GiftRow key={e.id} entry={e} />)}
        </div>
      )}

      {/* المستخدمة — قابلة للطي */}
      {claimed.length > 0 && (
        <div className="border-t border-border/40">
          <button
            onClick={() => setShowClaimed(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
          >
            <span className="font-semibold flex items-center gap-1.5">
              <Check className="w-3 h-3 text-success" />
              الهدايا المستفادة ({claimed.length})
            </span>
            <span className="text-[10px]">{showClaimed ? '▲ إخفاء' : '▼ عرض'}</span>
          </button>
          {showClaimed && (
            <div className="p-2 pt-0 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
              {claimed.map(e => <GiftRow key={e.id} entry={e} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

