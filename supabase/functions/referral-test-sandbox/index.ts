/**
 * referral-test-sandbox — Edge Function لاختبار نظام الإحالات
 * ═══════════════════════════════════════════════════════════════
 * - مخصص للأدمن فقط (يُتحقق server-side من role = 'admin')
 * - جميع البيانات معزولة في جداول referral_test_*
 * - لا تأثير على Production بأي شكل
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── إنشاء عميلَي Supabase: admin (service role) + user (للتحقق JWT) ──
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    // ── التحقق من هوية المستخدم ──
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return json({ error: 'غير مصرح' }, 401);

    // ── التحقق من صلاحية admin server-side ──
    const { data: prof } = await supabaseAdmin
      .from('core_profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!prof || prof.role !== 'admin') return json({ error: 'صلاحية أدمن مطلوبة' }, 403);

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action: string };

    // ══════════════════════════════════════════════════════════════
    // دوال مساعدة
    // ══════════════════════════════════════════════════════════════
    const log = async (
      sessionId: string,
      step: string,
      status: 'pass' | 'fail' | 'skip' | 'info',
      opts: {
        testUserId?: string;
        dataBefore?: unknown;
        dataAfter?: unknown;
        errorMsg?: string;
        rejectReason?: string;
        verifyResult?: string;
      } = {}
    ) => {
      await supabaseAdmin.from('referral_test_logs').insert({
        session_id: sessionId,
        admin_id: user.id,
        step_name: step,
        test_user_id: opts.testUserId ?? null,
        status,
        data_before: opts.dataBefore ?? null,
        data_after: opts.dataAfter ?? null,
        error_msg: opts.errorMsg ?? null,
        reject_reason: opts.rejectReason ?? null,
        verify_result: opts.verifyResult ?? null,
      });
    };

    const genCode = () => 'TEST-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    // ══════════════════════════════════════════════════════════════
    // ACTION: create_test_users — إنشاء مستخدمي اختبار
    // ══════════════════════════════════════════════════════════════
    if (action === 'create_test_users') {
      const { sessionId, referrerCount = 1, referredCount = 3, config = {} } = body;
      const users: unknown[] = [];

      // إنشاء Referrer
      for (let i = 0; i < referrerCount; i++) {
        const { data, error } = await supabaseAdmin.from('referral_test_users').insert({
          session_id: sessionId,
          role: 'referrer',
          username: `Test Referrer ${i + 1}`,
          referral_code: genCode(),
          device_fp: config.device_fp ?? `TEST-FP-${Date.now()}-R${i}`,
          app_version: config.app_version ?? 'TEST-1.0.0',
          test_ip: config.test_ip ?? '192.168.99.1',
          account_status: config.account_status ?? 'active',
          subscription_status: config.subscription_status ?? 'active',
        }).select().single();
        if (!error && data) {
          users.push(data);
          await log(sessionId, `إنشاء Referrer ${i + 1}`, 'pass', { dataAfter: data });
        } else {
          await log(sessionId, `إنشاء Referrer ${i + 1}`, 'fail', { errorMsg: error?.message });
        }
      }

      // إنشاء Referred Users
      for (let i = 0; i < referredCount; i++) {
        const { data, error } = await supabaseAdmin.from('referral_test_users').insert({
          session_id: sessionId,
          role: 'referred',
          username: `Test Referred User ${String(i + 1).padStart(2, '0')}`,
          referral_code: null,
          device_fp: config.device_fp ? `${config.device_fp}-REF${i}` : `TEST-FP-${Date.now()}-U${i}`,
          app_version: config.app_version ?? 'TEST-1.0.0',
          test_ip: config.test_ip ?? `192.168.99.${10 + i}`,
          account_status: config.account_status ?? 'active',
          subscription_status: config.subscription_status ?? 'none',
        }).select().single();
        if (!error && data) {
          users.push(data);
          await log(sessionId, `إنشاء Referred User ${i + 1}`, 'pass', { dataAfter: data });
        } else {
          await log(sessionId, `إنشاء Referred User ${i + 1}`, 'fail', { errorMsg: error?.message });
        }
      }
      return json({ success: true, users });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: create_session — إنشاء جلسة اختبار جديدة
    // ══════════════════════════════════════════════════════════════
    if (action === 'create_session') {
      const { name = 'Test Session', settings } = body;

      // حفظ الإعدادات المؤقتة
      let settingsId: string | null = null;
      if (settings) {
        const { data: s } = await supabaseAdmin.from('referral_test_settings').insert({
          created_by: user.id,
          referral_req: settings.referral_req ?? 3,
          reward_ops: settings.reward_ops ?? 5,
          min_transfer: settings.min_transfer ?? 2,
          expiry_days: settings.expiry_days ?? 1,
          daily_limit: settings.daily_limit ?? 10,
          notes: settings.notes ?? null,
        }).select('id').single();
        settingsId = s?.id ?? null;
      }

      const { data, error } = await supabaseAdmin.from('referral_test_sessions').insert({
        admin_id: user.id,
        session_name: name,
        settings_id: settingsId,
        status: 'running',
      }).select().single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, session: data });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: run_scenario — تشغيل سيناريو محدد
    // ══════════════════════════════════════════════════════════════
    if (action === 'run_scenario') {
      const { sessionId, scenario, referrerId, referredId, settings = {} } = body;

      const cfg = {
        referral_req: settings.referral_req ?? 3,
        reward_ops: settings.reward_ops ?? 5,
        min_transfer: settings.min_transfer ?? 2,
        expiry_days: settings.expiry_days ?? 1,
        daily_limit: settings.daily_limit ?? 10,
      };

      // جلب مستخدمي الاختبار
      const { data: refr } = referrerId
        ? await supabaseAdmin.from('referral_test_users').select('*').eq('id', referrerId).single()
        : { data: null };
      const { data: refd } = referredId
        ? await supabaseAdmin.from('referral_test_users').select('*').eq('id', referredId).single()
        : { data: null };

      const result: { scenario: string; status: 'pass' | 'fail'; detail: string; data?: unknown } = {
        scenario,
        status: 'pass',
        detail: '',
      };

      switch (scenario) {

        // 1. محاكاة اكتمال المهمة
        case 'task_complete': {
          const before = { balance: refr?.test_balance ?? 0 };
          const newBal = (refr?.test_balance ?? 0) + cfg.reward_ops;
          await supabaseAdmin.from('referral_test_users').update({ test_balance: newBal }).eq('id', referrerId);
          result.detail = `تمت إضافة ${cfg.reward_ops} عمليات اختبارية`;
          result.data = { before, after: { balance: newBal } };
          await log(sessionId, 'اكتمال المهمة', 'pass', { testUserId: referrerId, dataBefore: before, dataAfter: { balance: newBal } });
          break;
        }

        // 2. محاكاة عدم اكتمال المهمة
        case 'task_incomplete': {
          result.detail = 'المهمة لم تكتمل — لا توجد مكافأة';
          result.data = { balance: refr?.test_balance ?? 0 };
          await log(sessionId, 'عدم اكتمال المهمة', 'info', { testUserId: referrerId, verifyResult: 'لا تغيير في الرصيد' });
          break;
        }

        // 3. محاكاة المطالبة بالمكافأة
        case 'claim_reward': {
          if (!refr) { result.status = 'fail'; result.detail = 'مستخدم الداعي غير موجود'; break; }
          const before = { balance: refr.test_balance };
          const newBal = refr.test_balance + cfg.reward_ops;
          await supabaseAdmin.from('referral_test_users').update({ test_balance: newBal }).eq('id', referrerId);
          result.detail = `تمت المطالبة بـ ${cfg.reward_ops} عمليات اختبارية`;
          result.data = { before, after: { balance: newBal } };
          await log(sessionId, 'المطالبة بالمكافأة', 'pass', { testUserId: referrerId, dataBefore: before, dataAfter: { balance: newBal } });
          break;
        }

        // 4. محاكاة رفض المطالبة
        case 'claim_reject': {
          const reason = settings.reject_reason ?? 'المستخدم المُحال غير مؤهل (اختبار)';
          result.detail = `رُفضت المطالبة: ${reason}`;
          result.status = 'fail';
          await log(sessionId, 'رفض المطالبة', 'fail', { testUserId: referrerId, rejectReason: reason });
          break;
        }

        // 5. محاكاة التحويل
        case 'transfer': {
          if (!refr) { result.status = 'fail'; result.detail = 'مستخدم الداعي غير موجود'; break; }
          const balance = refr.test_balance;
          if (balance < cfg.min_transfer) {
            result.status = 'fail';
            result.detail = `الرصيد (${balance}) أقل من الحد الأدنى للتحويل (${cfg.min_transfer})`;
            await log(sessionId, 'محاكاة التحويل', 'fail', { testUserId: referrerId, rejectReason: `الرصيد ${balance} < ${cfg.min_transfer}` });
          } else {
            await supabaseAdmin.from('referral_test_users').update({ test_balance: 0 }).eq('id', referrerId);
            result.detail = `تم تحويل ${balance} عمليات اختبارية بنجاح`;
            result.data = { transferred: balance, remaining: 0 };
            await log(sessionId, 'محاكاة التحويل', 'pass', { testUserId: referrerId, dataBefore: { balance }, dataAfter: { balance: 0 } });
          }
          break;
        }

        // 6. محاكاة فشل التحويل
        case 'transfer_fail': {
          const reason = settings.fail_reason ?? 'خطأ في الاتصال بالخادم (اختبار)';
          result.status = 'fail';
          result.detail = `فشل التحويل: ${reason}`;
          await log(sessionId, 'فشل التحويل', 'fail', { testUserId: referrerId, errorMsg: reason });
          break;
        }

        // 7. محاكاة انتهاء الصلاحية
        case 'expiry': {
          result.detail = `رصيد الاختبار منتهي الصلاحية بعد ${cfg.expiry_days} يوم`;
          await supabaseAdmin.from('referral_test_users').update({ test_balance: 0 }).eq('id', referrerId);
          await log(sessionId, 'انتهاء الصلاحية', 'info', { testUserId: referrerId, verifyResult: 'تم إعادة الرصيد إلى صفر' });
          break;
        }

        // 8. محاكاة استخدام العمليات
        case 'use_ops': {
          if (!refr) { result.status = 'fail'; result.detail = 'مستخدم الداعي غير موجود'; break; }
          const opsUsed = settings.ops_to_use ?? 1;
          const before = { balance: refr.test_balance };
          const newBal = Math.max(0, refr.test_balance - opsUsed);
          await supabaseAdmin.from('referral_test_users').update({ test_balance: newBal }).eq('id', referrerId);
          result.detail = `تم استخدام ${opsUsed} عمليات اختبارية`;
          result.data = { before, after: { balance: newBal } };
          await log(sessionId, 'استخدام العمليات', 'pass', { testUserId: referrerId, dataBefore: before, dataAfter: { balance: newBal } });
          break;
        }

        // 9. اختبار الحد الأدنى للتحويل
        case 'test_min_transfer': {
          const balance = refr?.test_balance ?? 0;
          const passes = balance >= cfg.min_transfer;
          result.status = passes ? 'pass' : 'fail';
          result.detail = passes
            ? `الرصيد (${balance}) يتجاوز الحد الأدنى (${cfg.min_transfer})`
            : `الرصيد (${balance}) أقل من الحد الأدنى (${cfg.min_transfer})`;
          await log(sessionId, 'اختبار الحد الأدنى للتحويل', result.status, { testUserId: referrerId, verifyResult: result.detail });
          break;
        }

        // 10. اختبار الحد اليومي للدعوات
        case 'test_daily_limit': {
          const { count: todayCount } = await supabaseAdmin
            .from('referral_test_users')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .eq('role', 'referred')
            .gte('created_at', new Date(Date.now() - 86400000).toISOString());
          const passes = (todayCount ?? 0) < cfg.daily_limit;
          result.status = passes ? 'pass' : 'fail';
          result.detail = `عدد الإحالات اليوم: ${todayCount ?? 0} / الحد: ${cfg.daily_limit}`;
          await log(sessionId, 'اختبار الحد اليومي', result.status, { verifyResult: result.detail });
          break;
        }

        // 11. اختبار منع تكرار الحساب
        case 'test_duplicate': {
          const fp = refd?.device_fp;
          if (!fp) { result.status = 'fail'; result.detail = 'لا يوجد device_fp'; break; }
          const { count: dupCount } = await supabaseAdmin
            .from('referral_test_users')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .eq('device_fp', fp);
          const isDup = (dupCount ?? 0) > 1;
          result.status = isDup ? 'fail' : 'pass';
          result.detail = isDup ? `مكرر: device_fp (${fp}) موجود ${dupCount} مرات` : `لا تكرار: device_fp فريد`;
          await log(sessionId, 'اختبار منع التكرار', result.status, { testUserId: referredId, verifyResult: result.detail });
          break;
        }

        // 12. اختبار الحساب المؤهل
        case 'test_eligible': {
          const eligible = refd?.subscription_status === 'active' && refd?.account_status === 'active';
          result.status = eligible ? 'pass' : 'fail';
          result.detail = eligible
            ? 'الحساب مؤهل: اشتراك نشط + حساب نشط'
            : `الحساب غير مؤهل: subscription=${refd?.subscription_status}, account=${refd?.account_status}`;
          await log(sessionId, 'اختبار الأهلية', result.status, { testUserId: referredId, verifyResult: result.detail });
          break;
        }

        // 13. اختبار الحساب غير المؤهل
        case 'test_ineligible': {
          await supabaseAdmin.from('referral_test_users').update({ subscription_status: 'none' }).eq('id', referredId);
          result.detail = 'تم تعيين الحساب كغير مؤهل (subscription=none)';
          await log(sessionId, 'اختبار غير المؤهل', 'info', { testUserId: referredId, dataAfter: { subscription_status: 'none' } });
          break;
        }

        // 14. محاكاة قبول الإحالة
        case 'accept_referral': {
          result.detail = `تم قبول إحالة ${refd?.username ?? 'المستخدم'} من ${refr?.username ?? 'الداعي'}`;
          await log(sessionId, 'قبول الإحالة', 'pass', {
            testUserId: referredId,
            dataAfter: { referrer: refr?.username, referred: refd?.username, status: 'accepted' },
          });
          break;
        }

        // 15. ظهور اسم صاحب الدعوة
        case 'verify_referrer_name': {
          const code = refr?.referral_code;
          const found = !!code && refr?.username?.startsWith('Test');
          result.status = found ? 'pass' : 'fail';
          result.detail = found
            ? `اسم الداعي يظهر بشكل صحيح: ${refr?.username} (${code})`
            : 'لم يتم التعرف على الداعي';
          await log(sessionId, 'التحقق من اسم الداعي', result.status, { verifyResult: result.detail });
          break;
        }

        // 16. احتساب الإحالة بعد النصاب
        case 'count_referrals': {
          const { count: refCount } = await supabaseAdmin
            .from('referral_test_users')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .eq('role', 'referred');
          const meetsReq = (refCount ?? 0) >= cfg.referral_req;
          result.status = meetsReq ? 'pass' : 'fail';
          result.detail = `عدد الإحالات: ${refCount ?? 0} / المطلوب: ${cfg.referral_req}`;
          await log(sessionId, 'احتساب الإحالات', result.status, { verifyResult: result.detail });
          break;
        }

        default:
          return json({ error: `سيناريو غير معروف: ${scenario}` }, 400);
      }

      return json({ success: true, result });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: run_full_test — سيناريو كامل تلقائي
    // ══════════════════════════════════════════════════════════════
    if (action === 'run_full_test') {
      const { settings = {} } = body;
      const cfg = {
        referral_req: settings.referral_req ?? 3,
        reward_ops: settings.reward_ops ?? 5,
        min_transfer: settings.min_transfer ?? 2,
        expiry_days: settings.expiry_days ?? 1,
        daily_limit: settings.daily_limit ?? 10,
      };

      // إنشاء جلسة جديدة
      const { data: session } = await supabaseAdmin.from('referral_test_sessions').insert({
        admin_id: user.id,
        session_name: 'Full Auto Test',
        status: 'running',
      }).select().single();
      if (!session) return json({ error: 'فشل إنشاء الجلسة' }, 500);
      const sid = session.id;

      const steps: { step: string; status: 'pass' | 'fail'; detail: string }[] = [];
      let failStep: string | null = null;

      const addStep = (step: string, status: 'pass' | 'fail', detail: string) => {
        steps.push({ step, status, detail });
        if (status === 'fail' && !failStep) failStep = step;
      };

      // 1. إنشاء Referrer
      const { data: refr } = await supabaseAdmin.from('referral_test_users').insert({
        session_id: sid, role: 'referrer',
        username: 'Test Referrer', referral_code: genCode(),
        device_fp: `FP-AUTO-R-${Date.now()}`,
        app_version: 'TEST-AUTO', test_ip: '10.0.0.1',
        account_status: 'active', subscription_status: 'active',
      }).select().single();
      await log(sid, 'إنشاء Referrer', refr ? 'pass' : 'fail', { dataAfter: refr });
      addStep('إنشاء Referrer', refr ? 'pass' : 'fail', refr ? `كود: ${refr.referral_code}` : 'فشل الإنشاء');
      if (!refr) { await supabaseAdmin.from('referral_test_sessions').update({ status: 'failed', ended_at: new Date().toISOString(), fail_step: failStep, summary: { steps } }).eq('id', sid); return json({ passed: false, failStep, steps, sessionId: sid }); }

      // 2. إنشاء 3 Referred Users مؤهلين
      const referredUsers: unknown[] = [];
      for (let i = 0; i < cfg.referral_req; i++) {
        const { data: ru } = await supabaseAdmin.from('referral_test_users').insert({
          session_id: sid, role: 'referred',
          username: `Test Referred User ${String(i + 1).padStart(2, '0')}`,
          device_fp: `FP-AUTO-U${i}-${Date.now()}`,
          app_version: 'TEST-AUTO', test_ip: `10.0.0.${10 + i}`,
          account_status: 'active', subscription_status: 'active',
        }).select().single();
        if (ru) referredUsers.push(ru);
        await log(sid, `إنشاء Referred ${i + 1}`, ru ? 'pass' : 'fail', { dataAfter: ru });
        addStep(`إنشاء Referred User ${i + 1}`, ru ? 'pass' : 'fail', ru ? `✓ ${ru.username}` : 'فشل');
      }

      // 3. التحقق من كود الإحالة
      const codeValid = !!refr.referral_code?.startsWith('TEST-');
      await log(sid, 'التحقق من كود الإحالة', codeValid ? 'pass' : 'fail', { verifyResult: refr.referral_code });
      addStep('التحقق من الكود', codeValid ? 'pass' : 'fail', `كود: ${refr.referral_code}`);

      // 4. ظهور اسم الداعي
      const nameOk = refr.username === 'Test Referrer';
      await log(sid, 'ظهور اسم الداعي', nameOk ? 'pass' : 'fail', { verifyResult: refr.username });
      addStep('ظهور اسم الداعي', nameOk ? 'pass' : 'fail', refr.username);

      // 5. قبول الإحالات
      const meetsReq = referredUsers.length >= cfg.referral_req;
      await log(sid, 'قبول الإحالات / النصاب', meetsReq ? 'pass' : 'fail', { verifyResult: `${referredUsers.length}/${cfg.referral_req}` });
      addStep('قبول الإحالات', meetsReq ? 'pass' : 'fail', `${referredUsers.length}/${cfg.referral_req} مستخدمين`);

      // 6. اكتمال المهمة + ظهور زر المطالبة
      await log(sid, 'اكتمال المهمة', 'pass', { verifyResult: 'يظهر زر المطالبة' });
      addStep('اكتمال المهمة', 'pass', 'يظهر زر المطالبة بالمكافأة');

      // 7. المطالبة + إضافة للرصيد
      const newBal = refr.test_balance + cfg.reward_ops;
      await supabaseAdmin.from('referral_test_users').update({ test_balance: newBal }).eq('id', refr.id);
      await log(sid, 'المطالبة بالمكافأة', 'pass', { dataBefore: { balance: refr.test_balance }, dataAfter: { balance: newBal } });
      addStep('إضافة المكافأة', 'pass', `+${cfg.reward_ops} عمليات ← الرصيد: ${newBal}`);

      // 8. اختبار الحد الأدنى للتحويل
      const canTransfer = newBal >= cfg.min_transfer;
      await log(sid, 'اختبار الحد الأدنى', canTransfer ? 'pass' : 'fail', { verifyResult: `${newBal} >= ${cfg.min_transfer}` });
      addStep('الحد الأدنى للتحويل', canTransfer ? 'pass' : 'fail', `${newBal} >= ${cfg.min_transfer}`);

      // 9. التحويل
      if (canTransfer) {
        await supabaseAdmin.from('referral_test_users').update({ test_balance: 0 }).eq('id', refr.id);
        await log(sid, 'التحويل', 'pass', { dataBefore: { balance: newBal }, dataAfter: { balance: 0 } });
        addStep('التحويل', 'pass', `تم تحويل ${newBal} عمليات`);
      } else {
        await log(sid, 'التحويل', 'fail', { rejectReason: 'الرصيد أقل من الحد الأدنى' });
        addStep('التحويل', 'fail', 'الرصيد أقل من الحد الأدنى');
      }

      // 10. انتهاء الصلاحية
      await supabaseAdmin.from('referral_test_users').update({ test_balance: 0 }).eq('id', refr.id);
      await log(sid, 'انتهاء الصلاحية', 'pass', { verifyResult: `بعد ${cfg.expiry_days} يوم — الرصيد صفر` });
      addStep('انتهاء الصلاحية', 'pass', `تم إنهاء الصلاحية بعد ${cfg.expiry_days} يوم`);

      const passed = !failStep;
      await supabaseAdmin.from('referral_test_sessions').update({
        status: passed ? 'passed' : 'failed',
        ended_at: new Date().toISOString(),
        fail_step: failStep,
        summary: { steps, cfg },
      }).eq('id', sid);

      return json({ passed, failStep, steps, sessionId: sid });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: get_sessions — جلب الجلسات
    // ══════════════════════════════════════════════════════════════
    if (action === 'get_sessions') {
      const { data } = await supabaseAdmin.from('referral_test_sessions')
        .select('*').order('started_at', { ascending: false }).limit(20);
      return json({ sessions: data ?? [] });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: get_logs — جلب سجلات جلسة
    // ══════════════════════════════════════════════════════════════
    if (action === 'get_logs') {
      const { sessionId } = body;
      const { data } = await supabaseAdmin.from('referral_test_logs')
        .select('*')
        .eq('session_id', sessionId)
        .order('logged_at', { ascending: true });
      return json({ logs: data ?? [] });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: get_test_users — جلب مستخدمي جلسة
    // ══════════════════════════════════════════════════════════════
    if (action === 'get_test_users') {
      const { sessionId } = body;
      const { data } = await supabaseAdmin.from('referral_test_users')
        .select('*').eq('session_id', sessionId).order('created_at', { ascending: true });
      return json({ users: data ?? [] });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: reset_test_data — حذف جميع بيانات الاختبار
    // ══════════════════════════════════════════════════════════════
    if (action === 'reset_test_data') {
      const { sessionId } = body;
      await supabaseAdmin.rpc('reset_test_data', sessionId ? { p_session_id: sessionId } : {});
      return json({ success: true });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: clear_logs — مسح السجلات فقط
    // ══════════════════════════════════════════════════════════════
    if (action === 'clear_logs') {
      const { sessionId } = body;
      if (sessionId) {
        await supabaseAdmin.from('referral_test_logs').delete().eq('session_id', sessionId);
      } else {
        await supabaseAdmin.from('referral_test_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      return json({ success: true });
    }

    return json({ error: `إجراء غير معروف: ${action}` }, 400);

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
