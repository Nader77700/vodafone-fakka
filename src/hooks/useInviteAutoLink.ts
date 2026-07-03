// هوك ربط الدعوة التلقائي — Phase 7
// يُستدعى مرة واحدة بعد نجاح تسجيل الدخول أو الإنشاء
// يقرأ pending_invite_token من localStorage ثم يربط المستخدم بالتاجر
import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  getPendingInviteToken,
  clearPendingInviteToken,
  linkUserToInviteToken,
} from '@/lib/api';

export function useInviteAutoLink() {
  const tryAutoLink = useCallback(async (userId: string) => {
    const pending = getPendingInviteToken();
    if (!pending) return;

    // لا تحاول أكثر من مرة (احذف فوراً لمنع التكرار)
    clearPendingInviteToken();

    const res = await linkUserToInviteToken(userId, pending.token);

    if (res.success && !res.duplicate) {
      toast.success(`تم ربط حسابك بـ ${pending.merchant_name} ✅`, { duration: 5000 });
    } else if (res.success && res.duplicate) {
      // مرتبط مسبقاً بنفس التاجر — بدون رسالة
    } else if (res.error === 'user_already_linked_to_other_merchant') {
      toast.warning('حسابك مرتبط بتاجر آخر بالفعل — لا يمكن تغيير الربط.', { duration: 6000 });
    }
    // الأخطاء الأخرى (invite_expired, merchant_inactive) — صمت تام لعدم إزعاج المستخدم
  }, []);

  return { tryAutoLink };
}
