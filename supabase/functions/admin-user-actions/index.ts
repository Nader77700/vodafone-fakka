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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authorization header مطلوب' }, 401);

    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !caller) return json({ error: 'توكن غير صالح' }, 401);

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single();
    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role ?? '')) {
      return json({ error: 'يجب أن تكون أدمن لتنفيذ هذا الإجراء' }, 403);
    }

    const body = await req.json() as {
      action: string; userId?: string; value?: unknown;
      userIds?: string[]; title?: string; message?: string;
    };
    const { action, userId, value, userIds, title, message } = body;

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
          await supabaseAdmin.from('activity_log').insert({
            user_id: userId, event_type: 'admin_sign_out_all',
            title: 'تسجيل خروج من جميع الأجهزة',
            description: `بواسطة الأدمن ${caller.id}`,
          }).catch(() => {});
          return json({ success: true, message: 'تم تسجيل الخروج من جميع الأجهزة' });
        }

        case 'reset_tokens': {
          const { error } = await supabaseAdmin.from('fcm_tokens')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          if (error) return json({ error: `فشل إعادة التعيين: ${error.message}` }, 500);
          await supabaseAdmin.from('activity_log').insert({
            user_id: userId, event_type: 'admin_reset_device',
            title: 'إعادة تعيين بيانات الجهاز',
            description: `بواسطة الأدمن ${caller.id}`,
          }).catch(() => {});
          return json({ success: true, message: 'تم إعادة تعيين بيانات الجهاز' });
        }

        case 'set_ops_limit': {
          const newLimit = Number(value);
          if (isNaN(newLimit) || newLimit < 0) return json({ error: 'قيمة غير صالحة' }, 400);
          const { error } = await supabaseAdmin.from('subscriptions')
            .update({ ops_limit: newLimit, ops_remaining: newLimit, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          if (error) return json({ error: `فشل التعديل: ${error.message}` }, 500);
          await supabaseAdmin.from('activity_log').insert({
            user_id: userId, event_type: 'admin_set_ops_limit',
            title: 'تعديل الحد اليومي للعمليات',
            description: `تم تعيين الحد إلى ${newLimit} بواسطة الأدمن ${caller.id}`,
          }).catch(() => {});
          return json({ success: true, message: `تم تعيين الحد إلى ${newLimit} عملية` });
        }

        // ══ حذف الحساب نهائياً — مُحسَّن ══════════════════════════════
        case 'delete_account': {
          const errors: string[] = [];

          // 1) حذف جميع الجداول المرتبطة بـ user_id (بالترتيب الآمن)
          const relatedTables = [
            'notification_seen',   // FK → auth.users ON DELETE CASCADE
            'notification_deliveries', // FK → auth.users ON DELETE CASCADE
            'notifications',       // FK → profiles ON DELETE CASCADE
            'activity_log',        // FK → profiles ON DELETE CASCADE
            'system_logs',         // قد لا تحتوي FK — نحذف للتنظيف
            'favorites',           // FK → profiles
            'operations',          // FK → profiles
            'fcm_tokens',          // FK → profiles
            'gift_claims',         // FK → auth.users ON DELETE CASCADE
            'trial_usage',         // FK → profiles ON DELETE SET NULL (آمن)
            'code_logs',           // FK → auth.users ON DELETE SET NULL
            'device_gift_activations', // FK → auth.users ON DELETE SET NULL
          ];

          for (const table of relatedTables) {
            const { error: tErr } = await supabaseAdmin
              .from(table).delete().eq('user_id', userId);
            if (tErr && !tErr.message.includes('does not exist')) {
              console.warn(`⚠️ [delete] ${table}: ${tErr.message}`);
              errors.push(`${table}: ${tErr.message}`);
            }
          }

          // 2) تحرير license_keys المرتبطة بهذا المستخدم
          const { error: lkErr } = await supabaseAdmin.from('license_keys')
            .update({ used_by: null, status: 'active', updated_at: new Date().toISOString() })
            .eq('used_by', userId);
          if (lkErr) errors.push(`license_keys: ${lkErr.message}`);

          // 3) حذف subscriptions بعد تحرير license_keys
          const { error: subErr } = await supabaseAdmin.from('subscriptions')
            .delete().eq('user_id', userId);
          if (subErr) {
            console.error(`❌ [delete] subscriptions: ${subErr.message}`);
            return json({ error: `فشل حذف الاشتراكات: ${subErr.message}` }, 500);
          }

          // 4) حذف من merchants إن كان تاجراً
          await supabaseAdmin.from('merchants').delete().eq('owner_id', userId).catch(() => {});

          // 5) حذف الـ profile
          const { error: profErr } = await supabaseAdmin
            .from('profiles').delete().eq('id', userId);
          if (profErr) {
            console.error(`❌ [delete] profile: ${profErr.message}`);
            return json({ error: `فشل حذف الملف الشخصي: ${profErr.message}` }, 500);
          }

          // 6) حذف من Auth
          const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
          if (authDelErr) {
            if (!authDelErr.message.includes('not found') && !authDelErr.message.includes('User not found')) {
              console.error(`❌ [delete] auth: ${authDelErr.message}`);
              return json({ error: `فشل حذف المستخدم من Auth: ${authDelErr.message}` }, 500);
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

    return json({ error: `إجراء غير معروف: ${action}` }, 400);

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
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
    // ── تهيئة العميل بـ service role (صلاحيات كاملة) ──────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── التحقق من هوية المتصل (أدمن فعلي) ────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authorization header مطلوب' }, 401);

    // استخرج المستخدم من الـ JWT المُرسَل
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !caller) return json({ error: 'توكن غير صالح' }, 401);

    // تحقق من دور الأدمن
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single();
    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role ?? '')) {
      return json({ error: 'يجب أن تكون أدمن لتنفيذ هذا الإجراء' }, 403);
    }

    // ── قراءة الطلب ────────────────────────────────────────────────────
    const { action, userId, value } = await req.json() as {
      action: string; userId: string; value?: unknown;
    };

    if (!action || !userId) return json({ error: 'action و userId مطلوبان' }, 400);
    if (userId === caller.id) return json({ error: 'لا يمكن تنفيذ هذا الإجراء على حسابك الخاص' }, 400);

    // ── تحقق من وجود المستخدم ──────────────────────────────────────────
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles').select('id, username, email').eq('id', userId).single();
    if (!targetProfile) return json({ error: 'المستخدم غير موجود' }, 404);

    // ── تنفيذ الإجراء ──────────────────────────────────────────────────
    switch (action) {

      // ══ تسجيل خروج من جميع الأجهزة ══════════════════════════════════
      case 'sign_out_all': {
        const { error } = await supabaseAdmin.auth.admin.signOut(userId, 'global');
        if (error) return json({ error: `فشل تسجيل الخروج: ${error.message}` }, 500);

        // تعطيل FCM tokens أيضاً لمنع الإشعارات
        await supabaseAdmin.from('fcm_tokens')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId);

        // تسجيل في activity_log
        await supabaseAdmin.from('activity_log').insert({
          user_id: userId,
          event_type: 'admin_sign_out_all',
          title: 'تسجيل خروج من جميع الأجهزة',
          description: `بواسطة الأدمن ${caller.id}`,
        }).catch(() => {});

        return json({ success: true, message: 'تم تسجيل الخروج من جميع الأجهزة' });
      }

      // ══ إعادة تعيين بيانات الجهاز (FCM tokens) ═══════════════════════
      case 'reset_tokens': {
        const { error } = await supabaseAdmin.from('fcm_tokens')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (error) return json({ error: `فشل إعادة التعيين: ${error.message}` }, 500);

        await supabaseAdmin.from('activity_log').insert({
          user_id: userId,
          event_type: 'admin_reset_device',
          title: 'إعادة تعيين بيانات الجهاز',
          description: `بواسطة الأدمن ${caller.id}`,
        }).catch(() => {});

        return json({ success: true, message: 'تم إعادة تعيين بيانات الجهاز' });
      }

      // ══ تعديل الحد اليومي للعمليات ════════════════════════════════════
      case 'set_ops_limit': {
        const newLimit = Number(value);
        if (isNaN(newLimit) || newLimit < 0) return json({ error: 'قيمة غير صالحة' }, 400);

        const { error } = await supabaseAdmin.from('subscriptions')
          .update({
            ops_limit: newLimit,
            ops_remaining: newLimit,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        if (error) return json({ error: `فشل التعديل: ${error.message}` }, 500);

        await supabaseAdmin.from('activity_log').insert({
          user_id: userId,
          event_type: 'admin_set_ops_limit',
          title: 'تعديل الحد اليومي للعمليات',
          description: `تم تعيين الحد إلى ${newLimit} بواسطة الأدمن ${caller.id}`,
        }).catch(() => {});

        return json({ success: true, message: `تم تعيين الحد إلى ${newLimit} عملية` });
      }

      // ══ حذف الحساب نهائياً ════════════════════════════════════════════
      case 'delete_account': {
        // حذف البيانات المرتبطة بالترتيب الصحيح
        const tables = [
          'notification_seen', 'notifications', 'activity_log',
          'favorites', 'operations', 'subscriptions', 'fcm_tokens',
        ];
        for (const table of tables) {
          await supabaseAdmin.from(table).delete().eq('user_id', userId).catch(() => {});
        }
        // إلغاء license key المستخدمة
        await supabaseAdmin.from('license_keys').update({ used_by: null }).eq('used_by', userId);
        // حذف الـ profile
        await supabaseAdmin.from('profiles').delete().eq('id', userId);
        // حذف من Auth (يُلغي كل الجلسات فوراً)
        const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteErr) return json({ error: `خطأ في حذف المستخدم: ${deleteErr.message}` }, 500);

        return json({ success: true, message: 'تم حذف الحساب نهائياً' });
      }

      default:
        return json({ error: `إجراء غير معروف: ${action}` }, 400);
    }

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
