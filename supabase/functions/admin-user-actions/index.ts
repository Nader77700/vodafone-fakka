/**
 * admin-user-actions — Edge Function لإجراءات الأدمن على المستخدمين
 * ─────────────────────────────────────────────────────────────────────
 * تعمل بـ service role key لتجنب أخطاء JWT عند استخدام جلسة الأدمن
 *
 * الإجراءات المدعومة:
 *   sign_out_all          — تسجيل خروج من جميع الأجهزة
 *   reset_tokens          — إلغاء تفعيل جميع FCM tokens للمستخدم
 *   set_ops_limit         — تعديل الحد اليومي للعمليات
 *   delete_account        — حذف الحساب نهائياً بالترتيب الصحيح
 *   repair_orphan_accounts— إصلاح حسابات profiles موجودة في DB بدون auth record
 *   notify_affected_users — إرسال إشعار لقائمة مستخدمين متضررين
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-build, x-app-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action || req.headers.get('x-action');

    // ── مسار فحص الحظر (مفتوح للجميع ولا يتطلب صلاحيات) ──────────────────────────
    if (action === 'check_device_ban') {
      const { device_fp, device_id, hardware_hash } = body as Record<string, string | undefined>;
      const appBuild = req.headers.get('x-app-build');
      const secureToken = req.headers.get('x-app-secure-token');
      const appPackage = req.headers.get('x-app-package');
      const buildNum = appBuild ? parseInt(appBuild, 10) : 0;

      // HACKER DETECTION
      const isSpoofingVersion = buildNum >= 353 && 
        secureToken !== 'vfp_secure_356_kill_switch' && 
        secureToken !== 'vfp_secure_355_kill_switch' && 
        secureToken !== 'vfp_secure_354_omega' && 
        secureToken !== 'vfp_secure_339_xyz_9988';
      const isWrongPackage = appPackage && appPackage !== 'com.naderakram.vodafonefakka';

      if (isSpoofingVersion || isWrongPackage) {
        // Auto-ban this hacker's device permanently
        if (device_fp || device_id || hardware_hash) {
          await supabaseAdmin.from('device_bans').insert({
            device_fp: device_fp || null,
            device_id: device_id || null,
            hardware_hash: hardware_hash || null,
            ban_reason: 'نظام الحماية التلقائي: محاولة استخدام نسخة مقرصنة ومزيفة',
            ban_type: 'both',
            is_permanent: true,
            is_active: true,
            banned_by_name: 'Auto-Security-System'
          });
        }
        return json({ banned: true, reason: 'تم حظر جهازك نهائياً لمحاولة استخدام نسخة مقرصنة.' });
      }

      // 0. Hard ban old versions immediately before anything else (Legitimate old users)
      if (!isNaN(buildNum) && buildNum < 353) {
        return json({ banned: true, reason: 'إصدار التطبيق قديم. يرجى التحديث إلى النسخة 354 الأحدث.' });
      }

      // 1. Check explicitly banned versions from DB
      if (appBuild) {
        const { data: vBan } = await supabaseAdmin.from('version_bans')
          .select('ban_reason')
          .eq('is_active', true)
          .or(`version_name.eq.${appBuild},version_name.ilike.%${appBuild}%`)
          .limit(1)
          .maybeSingle();
        
        if (vBan) {
          return json({ banned: true, reason: vBan.ban_reason || 'هذه النسخة محظورة أمنياً. قم بتنزيل النسخة الرسمية لتتمكن من الدخول.' });
        }
      }

      // 2. Check hardware device bans (Applied to ALL versions unconditionally)
      if (!device_fp && !device_id && !hardware_hash) return json({ banned: false });

      let query = supabaseAdmin.from('device_bans')
        .select('id, ban_reason, banned_at').eq('is_active', true);

      const orParts: string[] = [];
      if (device_fp)     orParts.push(`device_fp.eq.${device_fp}`);
      if (device_id)     orParts.push(`device_id.eq.${device_id}`);
      if (hardware_hash) orParts.push(`hardware_hash.eq.${hardware_hash}`);
      if (orParts.length > 1) query = query.or(orParts.join(','));
      else if (device_fp)     query = query.eq('device_fp', device_fp);
      else if (device_id)     query = query.eq('device_id', device_id);
      else                    query = query.eq('hardware_hash', hardware_hash!);

      const { data: banRows } = await query.limit(1);
      if (banRows?.length) {
        const b = banRows[0] as { ban_reason: string; banned_at: string };
        return json({ banned: true, reason: b.ban_reason, banned_at: b.banned_at });
      }
      return json({ banned: false });
    }

    // ── حماية باقي الإجراءات: تطلب توكن أدمن ───────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authorization header مطلوب' }, 401);

    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const { data: { user: caller }, error: authErr } = await supabaseUserClient.auth.getUser();
    if (authErr || !caller) return json({ error: `توكن غير صالح: ${authErr?.message || 'لا يوجد مستخدم'}` }, 401);

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single();
    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role ?? '')) {
      return json({ error: 'يجب أن تكون أدمن لتنفيذ هذا الإجراء' }, 403);
    }

    const payload = body as {
      action: string; userId?: string; value?: unknown;
      userIds?: string[]; title?: string; message?: string;
    };
    const { userId, value, userIds, title, message } = payload;

    if (!action) return json({ error: 'action مطلوب' }, 400);

    // ── الإجراءات التي تحتاج userId فقط ──────────────────────────────
    if (['sign_out_all', 'reset_tokens', 'set_ops_limit', 'delete_account'].includes(action)) {
      if (!userId) return json({ error: 'userId مطلوب' }, 400);
      if (userId === caller.id) return json({ error: 'لا يمكن تنفيذ هذا الإجراء على حسابك الخاص' }, 400);

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles').select('id, username, email').eq('id', userId).single();
      if (!targetProfile) return json({ error: 'المستخدم غير موجود في profiles' }, 404);

      switch (action) {

        case 'sign_out_all': {
          const { error } = await supabaseAdmin.auth.admin.signOut(userId, 'global');
          if (error) return json({ error: `فشل تسجيل الخروج: ${error.message}` }, 500);
          await supabaseAdmin.from('fcm_tokens')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          try { await supabaseAdmin.from('activity_log').insert({
            user_id: userId, event_type: 'admin_sign_out_all',
            title: 'تسجيل خروج من جميع الأجهزة',
            description: `بواسطة الأدمن ${caller.id}`,
          }); } catch {}
          return json({ success: true, message: 'تم تسجيل الخروج من جميع الأجهزة' });
        }

        case 'reset_tokens': {
          const { error } = await supabaseAdmin.from('fcm_tokens')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          if (error) return json({ error: `فشل إعادة التعيين: ${error.message}` }, 500);
          try { await supabaseAdmin.from('activity_log').insert({
            user_id: userId, event_type: 'admin_reset_device',
            title: 'إعادة تعيين بيانات الجهاز',
            description: `بواسطة الأدمن ${caller.id}`,
          }); } catch {}
          return json({ success: true, message: 'تم إعادة تعيين بيانات الجهاز' });
        }

        case 'set_ops_limit': {
          const newLimit = Number(value);
          if (isNaN(newLimit) || newLimit < 0) return json({ error: 'قيمة غير صالحة' }, 400);
          const { error } = await supabaseAdmin.from('subscriptions')
            .update({ ops_limit: newLimit, ops_remaining: newLimit, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          if (error) return json({ error: `فشل التعديل: ${error.message}` }, 500);
          try { await supabaseAdmin.from('activity_log').insert({
            user_id: userId, event_type: 'admin_set_ops_limit',
            title: 'تعديل الحد اليومي للعمليات',
            description: `تم تعيين الحد إلى ${newLimit} بواسطة الأدمن ${caller.id}`,
          }); } catch {}
          return json({ success: true, message: `تم تعيين الحد إلى ${newLimit} عملية` });
        }

        // ══ حذف الحساب نهائياً — مُحسَّن مع كل FK constraints ══════════
        case 'delete_account': {
          const errors: string[] = [];
          const now = new Date().toISOString();

          // ── الخطوة 1: nullify كل FK columns بـ NO ACTION قبل حذف profile ──
          await supabaseAdmin.from('license_keys')
            .update({ used_by: null, status: 'active', updated_at: now })
            .eq('used_by', userId)
            .then(({ error: e }) => e && errors.push(`lk.used_by: ${e.message}`));

          await supabaseAdmin.from('license_keys')
            .update({ created_by: null, updated_at: now })
            .eq('created_by', userId)
            .then(({ error: e }) => e && errors.push(`lk.created_by: ${e.message}`));

          await supabaseAdmin.from('merchant_member_ledger')
            .update({ created_by: null })
            .eq('created_by', userId)
            .then(({ error: e }) => e && errors.push(`mml.created_by: ${e.message}`));

          // ── الخطوة 2: حذف كل الجداول المرتبطة بـ user_id ────────────────
          const relatedTables = [
            'notification_seen', 'notification_deliveries',
            'notifications', 'merchant_notifications', 'scheduled_notifications',
            'activity_log', 'system_logs', 'admin_audit_logs', 'code_logs', 'invite_usage_logs',
            'subscription_history', 'subscription_operations',
            'merchant_member_ops', 'merchant_member_subscriptions',
            'merchant_members', 'merchant_member_ledger', 'merchant_wallets',
            'merchant_heartbeats', 'merchant_welcome_seen', 'merchant_member_welcomed',
            'device_registry', 'device_sessions', 'device_gift_activations', 'fcm_tokens',
            'favorites', 'operations', 'gift_claims', 'trial_usage',
            'phone_analytics', 'charge_throttles', 'promotion_views', 'welcome_gifts',
          ];

          for (const table of relatedTables) {
            const { error: tErr } = await supabaseAdmin
              .from(table).delete().eq('user_id', userId);
            if (tErr && !tErr.message.includes('does not exist') && !tErr.message.includes('relation')) {
              console.warn(`⚠️ [delete] ${table}: ${tErr.message}`);
              errors.push(`${table}: ${tErr.message}`);
            }
          }

          // ── الخطوة 3: حذف subscriptions بعد تحرير license_keys ──────────
          const { error: subErr } = await supabaseAdmin.from('subscriptions')
            .delete().eq('user_id', userId);
          if (subErr) {
            console.error(`❌ [delete] subscriptions: ${subErr.message}`);
            return json({ error: `فشل حذف الاشتراكات: ${subErr.message}` }, 500);
          }

          // ── الخطوة 4: حذف بيانات التاجر (المالك) ────────────────────────
          try { await supabaseAdmin.from('merchants').delete().eq('owner_id', userId); } catch {}

          // ── الخطوة 5: حذف الـ profile ────────────────────────────────────
          const { error: profErr } = await supabaseAdmin
            .from('profiles').delete().eq('id', userId);
          if (profErr) {
            console.error(`❌ [delete] profile: ${profErr.message}`);
            return json({ error: `فشل حذف الملف الشخصي: ${profErr.message}` }, 500);
          }

          // ── الخطوة 6: حذف من Auth ─────────────────────────────────────────
          const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
          if (authDelErr) {
            const msg = authDelErr.message ?? '';
            if (!msg.includes('not found') && !msg.includes('User not found')) {
              console.error(`❌ [delete] auth: ${msg}`);
              return json({ error: `فشل حذف المستخدم من Auth: ${msg}` }, 500);
            }
          }

          const warn = errors.length > 0 ? ` (تحذيرات: ${errors.join(' | ')})` : '';
          return json({ success: true, message: `تم حذف الحساب نهائياً${warn}` });
        }
      }
    }

    // ══ إصلاح الحسابات المفقودة (profiles بدون auth record) ══════════
    if (action === 'repair_orphan_accounts') {
      // جلب كل profiles
      const { data: allProfiles, error: profErr } = await supabaseAdmin
        .from('profiles')
        .select('id, username, email, phone, created_at')
        .order('created_at', { ascending: true });

      if (profErr) return json({ error: `فشل جلب profiles: ${profErr.message}` }, 500);

      const orphans: Array<{ id: string; username: string | null; email: string | null }> = [];
      const valid:   Array<{ id: string; username: string | null; email: string | null }> = [];

      // فحص كل profile للتأكد من وجوده في auth
      for (const p of (allProfiles ?? [])) {
        const { data: authUser, error: authErr2 } = await supabaseAdmin.auth.admin.getUserById(p.id);
        if (authErr2 || !authUser?.user) {
          orphans.push({ id: p.id, username: p.username, email: p.email });
        } else {
          valid.push({ id: p.id, username: p.username, email: p.email });
        }
      }

      return json({
        success: true,
        total_profiles: allProfiles?.length ?? 0,
        valid_accounts: valid.length,
        orphan_count:   orphans.length,
        orphans,
        message: orphans.length === 0
          ? '✅ كل الحسابات سليمة — لا يوجد حسابات مفقودة'
          : `⚠️ وُجد ${orphans.length} حساب في profiles بدون auth record`,
      });
    }

    // ══ إرسال إشعار لقائمة مستخدمين متضررين ════════════════════════
    if (action === 'notify_affected_users') {
      if (!userIds?.length) return json({ error: 'userIds مطلوب' }, 400);
      if (!title || !message) return json({ error: 'title و message مطلوبان' }, 400);

      const inserted: string[] = [];
      const failed:   string[] = [];

      for (const uid of userIds) {
        const { error: nErr } = await supabaseAdmin.from('notifications').insert({
          user_id:   uid,
          title,
          body:      message,
          type:      'info',
          priority:  'high',
          is_read:   false,
          is_global: false,
          created_at: new Date().toISOString(),
        });
        if (nErr) { failed.push(uid); }
        else       { inserted.push(uid); }
      }

      return json({
        success: true,
        sent:    inserted.length,
        failed:  failed.length,
        message: `تم إرسال الإشعار لـ ${inserted.length} مستخدم${failed.length > 0 ? ` · فشل ${failed.length}` : ''}`,
      });
    }

    // ══ حظر جهاز نهائياً ═══════════════════════════════════════════════
    if (action === 'ban_device') {
      const b = body as Record<string, unknown>;
      const { device_fp, device_id, hardware_hash, ban_reason, ban_type, notes,
              ip_address, device_model, platform, associated_user_ids, associated_usernames } = b;

      if (!device_fp && !device_id && !hardware_hash)
        return json({ error: 'يجب توفير device_fp أو device_id على الأقل' }, 400);

      const { data: callerProf } = await supabaseAdmin
        .from('profiles').select('username').eq('id', caller.id).single();

      const { data: banData, error: banErr } = await supabaseAdmin
        .from('device_bans').insert({
          device_fp:            device_fp ?? null,
          device_id:            device_id ?? null,
          hardware_hash:        hardware_hash ?? null,
          ban_reason:           ban_reason ?? 'تعدد الحسابات',
          ban_type:             ban_type ?? 'both',
          is_permanent:         true,
          is_active:            true,
          associated_user_ids:  associated_user_ids ?? [],
          associated_usernames: associated_usernames ?? [],
          banned_by:            caller.id,
          banned_by_name:       (callerProf as { username?: string } | null)?.username ?? caller.email,
          banned_at:            new Date().toISOString(),
          notes:                notes ?? null,
          ip_address:           ip_address ?? null,
          device_model:         device_model ?? null,
          platform:             platform ?? null,
        }).select('id').single();

      if (banErr) return json({ error: `فشل حظر الجهاز: ${banErr.message}` }, 500);

      try { await supabaseAdmin.from('admin_audit_logs').insert({
        action: 'ban_device', performed_by: caller.id,
        target_user_id: (associated_user_ids as string[] | null)?.[0] ?? null,
        details: { device_fp, device_id, ban_reason, ban_id: (banData as { id?: string } | null)?.id },
      }); } catch {}

      return json({ success: true, ban_id: (banData as { id?: string } | null)?.id, message: 'تم حظر الجهاز نهائياً' });
    }

    // ══ رفع حظر جهاز ════════════════════════════════════════════════════
    if (action === 'unban_device') {
      const { ban_id } = body as { ban_id?: string };
      if (!ban_id) return json({ error: 'ban_id مطلوب' }, 400);
      const { error: ubErr } = await supabaseAdmin.from('device_bans').update({
        is_active: false, unbanned_at: new Date().toISOString(),
        unbanned_by: caller.id, updated_at: new Date().toISOString(),
      }).eq('id', ban_id);
      if (ubErr) return json({ error: `فشل رفع الحظر: ${ubErr.message}` }, 500);
      try { await supabaseAdmin.from('admin_audit_logs').insert({
        action: 'unban_device', performed_by: caller.id, details: { ban_id },
      }); } catch {}
      return json({ success: true, message: 'تم رفع حظر الجهاز' });
    }

    // ══ جلب الأجهزة المكررة ══════════════════════════════════════════════
    if (action === 'get_duplicate_devices') {
      const { data: dupes, error: dupErr } = await supabaseAdmin.rpc('get_duplicate_device_groups');
      if (dupErr) return json({ error: `فشل جلب البيانات: ${dupErr.message}` }, 500);

      const { data: bans } = await supabaseAdmin
        .from('device_bans').select('id, device_fp, device_id, ban_reason, banned_at, banned_by_name')
        .eq('is_active', true);

      const bannedFps = new Set<string>((bans ?? []).map((b: Record<string,unknown>) => b.device_fp as string).filter(Boolean));
      const bannedIds = new Set<string>((bans ?? []).map((b: Record<string,unknown>) => b.device_id as string).filter(Boolean));

      const enriched = (dupes ?? []).map((d: Record<string,unknown>) => ({
        ...d,
        is_banned: bannedFps.has(d.device_fp as string) || bannedIds.has(d.device_id as string),
        ban_info: (bans ?? []).find((b: Record<string,unknown>) =>
          (b.device_fp && b.device_fp === d.device_fp) || (b.device_id && b.device_id === d.device_id)
        ) ?? null,
      }));

      return json({ success: true, data: enriched, total: enriched.length });
    }


    // ══ تسجيل جهاز في device_registry ════════════════════════════════
    if (action === 'register_device') {
      if (!userId) return json({ error: 'userId مطلوب' }, 400);
      const { device_fp, device_id, hardware_hash, ip_address, device_model, platform, app_version } =
        body as Record<string, string | undefined>;
      await supabaseAdmin.from('device_registry').upsert({
        user_id: userId, device_fp: device_fp ?? null, device_id: device_id ?? null,
        hardware_hash: hardware_hash ?? null, ip_address: ip_address ?? null,
        device_model: device_model ?? null, platform: platform ?? null,
        app_version: app_version ?? null, last_seen_at: new Date().toISOString(),
      }, { onConflict: 'user_id,device_fp', ignoreDuplicates: false });
      return json({ success: true });
    }

    // ══ جلب قائمة الحظر ══════════════════════════════════════════════
    if (action === 'get_device_bans') {
      const { data: bans, error: bErr } = await supabaseAdmin
        .from('device_bans').select('*').order('banned_at', { ascending: false }).limit(200);
      if (bErr) return json({ error: bErr.message }, 500);
      return json({ success: true, data: bans ?? [] });
    }

    // ══ تغيير كلمة المرور ══════════════════════════════════════════════
    if (action === 'change_password') {
      if (!userId) return json({ error: 'userId مطلوب' }, 400);
      if (userId === caller.id) return json({ error: 'لا يمكن تغيير كلمة مرور حسابك من هنا' }, 400);

      const newPassword = value as string;
      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
        return json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
      }

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles').select('id, username, email').eq('id', userId).single();
      if (!targetProfile) return json({ error: 'المستخدم غير موجود' }, 404);

      // تغيير كلمة المرور عبر Admin API
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword.trim(),
      });
      if (pwErr) return json({ error: `فشل تغيير كلمة المرور: ${pwErr.message}` }, 500);

      // تسجيل النشاط (fire-and-forget)
      try {
        await supabaseAdmin.from('activity_log').insert({
          user_id: userId,
          event_type: 'admin_change_password',
          title: 'تغيير كلمة المرور',
          description: `تم تغيير كلمة مرور المستخدم @${targetProfile.username ?? userId} بواسطة الأدمن`,
        });
      } catch { /* تجاهل أخطاء التسجيل */ }

      try {
        await supabaseAdmin.from('system_logs').insert({
          user_id: caller.id,
          level: 'warning',
          action: 'admin_change_user_password',
          message: `الأدمن غيّر كلمة مرور المستخدم @${targetProfile.username ?? userId}`,
          metadata: { target_user_id: userId, target_username: targetProfile.username },
        });
      } catch { /* تجاهل أخطاء التسجيل */ }

      return json({
        success: true,
        message: `تم تغيير كلمة مرور @${targetProfile.username ?? userId} بنجاح`,
        username: targetProfile.username ?? null,
      });
    }

    return json({ error: `إجراء غير معروف: ${action}` }, 400);

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
