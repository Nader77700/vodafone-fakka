import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // التحقق من هوية المتصل — يجب أن يكون أدمن
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // تحقق من دور الأدمن
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'غير مصرح — يجب أن تكون أدمن' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // الحصول على userId المراد حذفه
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId مطلوب' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // منع حذف النفس
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: 'لا يمكنك حذف حسابك الخاص' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // حذف البيانات المرتبطة بالترتيب الصحيح
    const tables = [
      'notification_seen',
      'notifications',
      'activity_log',
      'favorites',
      'operations',
      'subscriptions',
    ];

    for (const table of tables) {
      await supabaseAdmin.from(table).delete().eq('user_id', userId);
    }

    // حذف license keys المرتبطة
    await supabaseAdmin.from('license_keys').update({ used_by: null }).eq('used_by', userId);

    // حذف profile
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    // حذف من Auth — هذا يلغي جميع الجلسات فوراً
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      return new Response(JSON.stringify({ error: `خطأ في حذف المستخدم من Auth: ${deleteAuthError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // تسجيل في النظام
    await supabaseAdmin.from('activity_log').insert({
      user_id: caller.id,
      event_type: 'admin_delete_user',
      title: 'حذف مستخدم نهائياً',
      description: `تم حذف المستخدم ${userId} بواسطة الأدمن ${caller.id}`,
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, userId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
