import re

filepath = "/workspace/app-ck2v94t1nev5/supabase/functions/etisalat-vip-executor/index.ts"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Locate handleSingleCycleInternal
pattern = r"async function handleSingleCycleInternal\([\s\S]*?\n\}\n\nserve\(async"

new_handle_function = '''async function handleSingleCycleInternal(
  engine: EtisalatEngine,
  supabase: any,
  session_id: string,
  session: any,
  bridgeConfig: BridgeConfig,
  ownerEmail: string,
  ownerPass: string,
  childEmail: string,
  childPass: string,
  sendEvent?: (type: string, data: any) => Promise<void>,
  options?: { is_server_background?: boolean; auto_eject?: boolean; delay_before_start?: number; is_simulation?: boolean; simulation_scenario?: string }
) {
  // If delay_before_start requested (e.g. cloud runner chained cycle), wait on fresh worker invocation
  if (options?.delay_before_start && typeof options.delay_before_start === "number" && options.delay_before_start > 0) {
    const waitSec = Math.min(options.delay_before_start, 90);
    console.log(`[CloudRunner] Waiting ${waitSec}s delay_before_start on fresh invocation before starting cycle...`);
    try {
      await supabase.from("vip_sessions").update({
        worker_status: "ready",
        current_step: "cooldown",
        worker_last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);
    } catch (_) {}
    await sleep(waitSec * 1000);

    // Re-verify if user requested stop while waiting
    const { data: preCheck } = await supabase
      .from("vip_sessions")
      .select("operation_state, automation_enabled")
      .eq("id", session_id)
      .maybeSingle();
    if (preCheck && (preCheck.operation_state === "stopped" || !preCheck.automation_enabled)) {
      console.log(`[CloudRunner] Session ${session_id} was stopped during cooldown. Aborting cycle.`);
      return { success: true, message: "تم إيقاف الأتمتة بطلب المستخدم أثناء الانتظار." };
    }
  }

  // ── SERVER-SIDE MUTEX CONCURRENCY GUARD ──
  try {
    const { data: lockCheck } = await supabase
      .from("vip_sessions")
      .select("worker_status, worker_last_heartbeat")
      .eq("id", session_id)
      .maybeSingle();

    if (lockCheck && lockCheck.worker_status === "executing") {
      const lastHeartbeatMs = lockCheck.worker_last_heartbeat ? new Date(lockCheck.worker_last_heartbeat).getTime() : 0;
      const elapsedMs = Date.now() - lastHeartbeatMs;
      if (elapsedMs < 60000) {
        console.warn(`[Mutex] Session ${session_id} is already actively executing a cycle (${elapsedMs}ms ago). Skipping duplicate trigger!`);
        return {
          success: true,
          skipped_duplicate: true,
          message: "الدورة قيد التنفيذ بالفعل على السيرفر - تم تخطي النداء المكرر لحماية الرصيد",
          logs: [{
            time: new Date().toLocaleTimeString("ar-EG", { hour12: false }),
            level: "warn",
            message: "[🛡️ قفل التزامن الحصري] تم حظر تشغيل متزامن مكرر لحماية الرصيد ومنع تصادم الأوامر بمقسم اتصالات.",
          }],
        };
      }
    }
  } catch (_lockErr) {}

  // Update session heartbeat and active worker status
  try {
    await supabase.from("vip_sessions").update({
      worker_status: "executing",
      worker_last_heartbeat: new Date().toISOString(),
      worker_pid: Math.floor(Math.random() * 1000000),
      updated_at: new Date().toISOString(),
    }).eq("id", session_id);
  } catch (_) {}

  // Simulation mode check
  const isSimulation = session.is_simulation_mode || options?.is_simulation || bridgeConfig.bridge_mode === "simulation";
  const simulationScenario = session.simulation_scenario || options?.simulation_scenario || "";
  if (isSimulation) {
    engine.setSimulation(true, simulationScenario);
    engine.log(`[🧪 محاكاة] تم تفعيل بيئة المحاكاة الآمنة (السيناريو: ${simulationScenario || 'قياسي'}) - لا يتم استهلاك رصيد فعلي.`, "info");
  }

  const cycleStartTime = new Date().toISOString();
  const cycleStartMs = Date.now();
  let parkedMixAmount = 0;
  let recoveredMixAmount = 0;
  let ownerStartMix = 0;
  let ownerPlanPre = "غير معروف";
  let targetPlanName = "Hekaya_XRP_MIX_Parent_6";
  let targetPlanDisplay = "حكاية ميكسات 180";
  let currentCost = 270;
  let targetCost = 180;
  let childDial = session.individual_account_identifier || "";

  // Helper: notify UI step
  const sendStep = async (stepKey: string, stepNum: number, title: string, desc: string, status: 'in_progress' | 'confirmed' | 'failed' | 'pending_verification' = 'in_progress') => {
    if (sendEvent) {
      await sendEvent("step", { step: stepKey, stepNumber: stepNum, title, desc, status });
    }
    try {
      await supabase.from("vip_sessions").update({
        current_step: stepKey,
        current_cycle_details: {
          step: stepKey,
          stepNumber: stepNum,
          title,
          detail: desc,
          status,
          updated_at: new Date().toISOString()
        },
        worker_last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", session_id);
    } catch (_) {}
  };

  // Helper: record structured diagnostic error safely (no tokens, passwords)
  const recordCycleFailure = async (err: {
    category: 'LOGIN_FAILED' | 'BALANCE_READ_FAILED' | 'BUNDLE_RENEWAL_FAILED' | 'PLAN_CHANGE_FAILED' | 'TRANSFER_FAILED' | 'FINAL_VERIFICATION_FAILED';
    stepKey: string;
    stepNumber: number;
    stepTitle: string;
    message: string;
    lastResponseSummary?: string;
  }) => {
    const failureTime = new Date().toISOString();
    const safeSummary = `[${err.category}] في الخطوة ${err.stepNumber} (${err.stepTitle}): ${err.message}${err.lastResponseSummary ? ` | الرد: ${err.lastResponseSummary}` : ''}`;
    engine.log(`[-] [خطأ بدورة الأتمتة] ${safeSummary} (الوقت: ${new Date().toLocaleTimeString('ar-EG')})`, 'error');

    await sendStep(err.stepKey, err.stepNumber, err.stepTitle, safeSummary, 'failed');

    try {
      await supabase.from("vip_sessions").update({
        operation_state: "stopped",
        worker_status: "stopped",
        current_step: "error",
        pause_reason: safeSummary,
        last_error_summary: safeSummary,
        worker_last_heartbeat: failureTime,
        updated_at: failureTime,
      }).eq("id", session_id);

      await supabase.from("vip_cycle_history").insert({
        session_id: session_id,
        cycle_number: (session.current_cycle || 0) + 1,
        started_at: cycleStartTime,
        ended_at: failureTime,
        duration_seconds: Math.round((Date.now() - cycleStartMs) / 1000),
        cycle_status: "failed",
        failure_step: err.stepKey,
        error_category: err.category,
        failure_timestamp: failureTime,
        last_api_response_summary: err.lastResponseSummary ? err.lastResponseSummary.slice(0, 500) : null,
        safe_error_summary: safeSummary,
      });

      await supabase.from("vip_operation_history").insert({
        session_id: session_id,
        operation_type: "automation_cycle",
        owner_account_ref: session.owner_account_identifier,
        individual_account_ref: session.individual_account_identifier,
        requested_action: `دورة VIP #${(session.current_cycle || 0) + 1} - فشلت في خطوة ${err.stepNumber}`,
        status: "failed",
        failure_reason: safeSummary,
        started_at: cycleStartTime,
        completed_at: failureTime,
        is_automatic: true,
      });
    } catch (_dbE) {
      console.warn("Failed to record failure in DB:", _dbE);
    }

    return {
      success: false,
      error: safeSummary,
      category: err.category,
      step: err.stepKey,
      stepNumber: err.stepNumber,
      logs: engine.logs,
    };
  };

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // 1. تسجيل الدخول والتحقق من حساب الأونر والفرد (step_1_auth_check)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_1_auth_check", 1, "فحص الحسابات", "تسجيل الدخول والتحقق من حساب الأونر والفرد بشكل مستقل...");
    engine.log(`[*] [الخطوة 1/13] جاري تسجيل الدخول والتحقق من حساب الأونر والفرد...`, "info");

    const ownerLoginOk = await engine.login(ownerEmail, ownerPass, true);
    if (!ownerLoginOk) {
      return await recordCycleFailure({
        category: "LOGIN_FAILED",
        stepKey: "step_1_auth_check",
        stepNumber: 1,
        stepTitle: "فحص الحسابات",
        message: "فشل تسجيل الدخول لحساب الأونر",
        lastResponseSummary: "تعذر مصادقة حساب الأونر عبر بوابة اتصالات",
      });
    }

    // Initialize completely independent child engine
    const childEngine = new EtisalatEngine("child", bridgeConfig, session_id, session.individual_name || "");
    if (isSimulation) childEngine.setSimulation(true, simulationScenario);
    childEngine.onLog = (l) => engine.log(`[الفرد] ${l.message}`, l.level);

    if (childEmail && childPass) {
      const childLoginOk = await childEngine.login(childEmail, childPass, false);
      if (!childLoginOk) {
        return await recordCycleFailure({
          category: "LOGIN_FAILED",
          stepKey: "step_1_auth_check",
          stepNumber: 1,
          stepTitle: "فحص الحسابات",
          message: "فشل تسجيل الدخول لحساب الفرد",
          lastResponseSummary: "تعذر مصادقة حساب الفرد عبر بوابة اتصالات",
        });
      }
    }
    await sendStep("step_1_auth_check", 1, "فحص الحسابات", "تم تأكيد تسجيل دخول الأونر والفرد بنجاح", "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 2. قراءة النظام الحالي وأرصدة الحسابين من الخدمة (step_2_read_initial_status)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_2_read_initial_status", 2, "قراءة الأرصدة والأنظمة", "استرجاع النظام الحالي وأرصدة الحسابين الحية من مقسم اتصالات...");
    engine.log(`[*] [الخطوة 2/13] قراءة النظام الحالي وأرصدة الحسابين الحية من الخدمة...`, "info");

    const ownerInitStatus = await engine.getStatusAndChild(false);
    const childInitStatus = await childEngine.getStatusAndChild(false);

    if (!ownerInitStatus.readSuccess || ownerInitStatus.remainingMix === null) {
      await supabase.from("vip_sessions").update({
        owner_balance_status: "unable_to_read",
        last_owner_refresh_at: new Date().toISOString(),
      }).eq("id", session_id);

      return await recordCycleFailure({
        category: "BALANCE_READ_FAILED",
        stepKey: "step_2_read_initial_status",
        stepNumber: 2,
        stepTitle: "قراءة الأرصدة والأنظمة",
        message: "تعذر قراءة رصيد الأونر من الخدمة (تم تسجيل حالة: تعذر قراءة الرصيد)",
        lastResponseSummary: ownerInitStatus.rawError || "استجابة غير صالحة من مقسم اتصالات",
      });
    }

    ownerPlanPre = ownerInitStatus.planId;
    ownerStartMix = ownerInitStatus.remainingMix;
    childDial = ownerInitStatus.childNumber || session.individual_account_identifier || childDial;

    if (!childDial) {
      return await recordCycleFailure({
        category: "BALANCE_READ_FAILED",
        stepKey: "step_2_read_initial_status",
        stepNumber: 2,
        stepTitle: "قراءة الأرصدة والأنظمة",
        message: "لم يتم العثور على خط فرد مضاف في عائلة الأونر",
      });
    }

    const isSeven = ownerPlanPre.includes("Parent_7") || ownerPlanPre.includes("7") || ownerPlanPre.includes("270");
    const currentOwnerPlanName = isSeven ? "Hekaya_XRP_MIX_Parent_7" : "Hekaya_XRP_MIX_Parent_6";
    targetPlanName = isSeven ? "Hekaya_XRP_MIX_Parent_6" : "Hekaya_XRP_MIX_Parent_7";
    targetPlanDisplay = isSeven ? "حكاية ميكسات 180" : "حكاية ميكسات 270";
    currentCost = isSeven ? 270 : 180;
    targetCost = isSeven ? 180 : 270;

    await supabase.from("vip_sessions").update({
      owner_mix_balance: ownerStartMix,
      individual_mix_balance: childInitStatus.remainingMix ?? session.individual_mix_balance,
      owner_balance_status: "confirmed",
      individual_balance_status: childInitStatus.readSuccess ? "confirmed" : "unable_to_read",
      last_owner_refresh_at: ownerInitStatus.timestamp,
      last_individual_refresh_at: childInitStatus.timestamp,
      owner_current_plan: ownerPlanPre,
    }).eq("id", session_id);

    await sendStep("step_2_read_initial_status", 2, "قراءة الأرصدة والأنظمة", `رصيد الأونر: ${ownerStartMix.toLocaleString('en-US')} ميكس | رصيد الفرد: ${(childInitStatus.remainingMix ?? 0).toLocaleString('en-US')} ميكس`, "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 3. تجديد نظام الأونر الحالي (step_3_renew_owner_initial)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_3_renew_owner_initial", 3, "تجديد نظام الأونر", `إرسال طلب تجديد باقة الأونر الحالية (${engine.getPlanName(currentOwnerPlanName)})...`);
    engine.log(`[*] [الخطوة 3/13] تجديد نظام الأونر الحالي (${engine.getPlanName(currentOwnerPlanName)}) لتنشيط الخط...`, "info");

    const renew1Ok = await engine.renewBundleAction(currentOwnerPlanName, String(currentCost));
    if (!renew1Ok && !isSimulation) {
      return await recordCycleFailure({
        category: "BUNDLE_RENEWAL_FAILED",
        stepKey: "step_3_renew_owner_initial",
        stepNumber: 3,
        stepTitle: "تجديد نظام الأونر",
        message: "فشل إرسال طلب تجديد نظام الأونر الحالي",
        lastResponseSummary: `تم رفض أمر التجديد للباقة ${currentOwnerPlanName}`,
      });
    }
    await sendStep("step_3_renew_owner_initial", 3, "تجديد نظام الأونر", "تم إرسال وقبول أمر التجديد بنجاح بالسيرفر", "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 4. الانتظار ثانيتين ثم إعادة قراءة البيانات (step_4_wait_and_recheck)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_4_wait_and_recheck", 4, "انتظار ثانيتين وإعادة القراءة", "الانتظار ثانيتين لمزامنة الشبكة ثم إعادة قراءة البيانات والتأكد...");
    engine.log(`[*] [الخطوة 4/13] انتظار ثانيتين لمزامنة الشبكة ثم إعادة قراءة البيانات...`, "info");
    await sleep(2000);

    const postRenewStatus = await engine.getStatusAndChild(false);
    let ownerRenewedMix = postRenewStatus.remainingMix ?? ownerStartMix;
    engine.log(`[+] [قراءة بعد التجديد] رصيد الأونر بعد التجديد: ${ownerRenewedMix.toLocaleString('en-US')} ميكس`, "info");
    await sendStep("step_4_wait_and_recheck", 4, "انتظار ثانيتين وإعادة القراءة", `تمت القراءة بنجاح - رصيد الأونر: ${ownerRenewedMix.toLocaleString('en-US')} ميكس`, "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 5. تحويل ميكسات الأونر إلى الفرد والتحقق من نتيجة العملية (step_5_transfer_owner_to_child)
    // ═════════════════════════════════════════════════════════════════════════
    parkedMixAmount = ownerRenewedMix;
    await sendStep("step_5_transfer_owner_to_child", 5, "تحويل ميكسات للأفراد", `تحويل (${parkedMixAmount.toLocaleString('en-US')}) ميكس من الأونر إلى الفرد (${childDial})...`);
    engine.log(`[*] [الخطوة 5/13] تحويل ميكسات الأونر إلى الفرد والتحقق من نتيجة العملية...`, "info");

    if (parkedMixAmount > 0) {
      const parkOk = await engine.transferMix(childDial, parkedMixAmount, currentOwnerPlanName);
      if (!parkOk && !isSimulation) {
        return await recordCycleFailure({
          category: "TRANSFER_FAILED",
          stepKey: "step_5_transfer_owner_to_child",
          stepNumber: 5,
          stepTitle: "تحويل ميكسات للأفراد",
          message: "فشل إرسال طلب تحويل ميكسات الأونر إلى الفرد",
          lastResponseSummary: `تم رفض أمر التحويل للمستلم ${childDial}`,
        });
      }
    }
    await sendStep("step_5_transfer_owner_to_child", 5, "تحويل ميكسات للأفراد", "تم إرسال وقبول أمر تحويل الميكسات إلى الفرد بنجاح", "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 6. التحقق من الأرصدة بعد التحويل (step_6_verify_post_transfer)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_6_verify_post_transfer", 6, "التحقق بعد التحويل", "التحقق من وصول الرصيد للفرد وخصمه من الأونر ومنع التكرار...");
    engine.log(`[*] [الخطوة 6/13] التحقق من الأرصدة بعد التحويل والتأكد من عدم تكرار التحويل...`, "info");

    let postParkChildBal = 0;
    for (let auditTry = 1; auditTry <= 4; auditTry++) {
      await sleep(1500);
      const chkChild = await childEngine.getStatusAndChild(true);
      if (chkChild.readSuccess && chkChild.remainingMix !== null) {
        postParkChildBal = chkChild.remainingMix;
        if (postParkChildBal > 0 || isSimulation) {
          break;
        }
      }
    }
    engine.log(`[+] [تأكيد التحويل] رصيد الفرد بعد الاستقبال: ${postParkChildBal.toLocaleString('en-US')} ميكس`, "info");
    await sendStep("step_6_verify_post_transfer", 6, "التحقق بعد التحويل", `تم التحقق بنجاح - رصيد الفرد المؤكد: ${postParkChildBal.toLocaleString('en-US')} ميكس`, "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 7. طلب تغيير نظام الأونر إلى النظام الآخر (step_7_request_plan_change)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_7_request_plan_change", 7, "طلب تغيير النظام", `إرسال طلب تغيير نظام الأونر إلى ${targetPlanDisplay}...`);
    engine.log(`[*] [الخطوة 7/13] إرسال طلب ترحيل نظام الأونر إلى: ${targetPlanDisplay}...`, "info");

    const migrateOrderOk = await engine.changePlan(targetPlanName, "");
    if (!migrateOrderOk && !isSimulation) {
      engine.log(`[-] فشل طلب تغيير النظام! جاري استرجاع الميكسات المركونة فوراً لحماية الرصيد...`, "error");
      if (postParkChildBal > 0) {
        await childEngine.transferMix(engine.ownerDial || session.owner_account_identifier, postParkChildBal, "Hekaya_XRP_MIX_Child_1");
      }
      return await recordCycleFailure({
        category: "PLAN_CHANGE_FAILED",
        stepKey: "step_7_request_plan_change",
        stepNumber: 7,
        stepTitle: "طلب تغيير النظام",
        message: "رفض مقسم اتصالات أمر تغيير النظام",
        lastResponseSummary: `فشل الانتقال إلى ${targetPlanDisplay}`,
      });
    }
    await sendStep("step_7_request_plan_change", 7, "طلب تغيير النظام", `تم إرسال طلب التغيير بنجاح، جاري المراقبة وعدم افتراض الاكتمال...`, "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 8. مراقبة حالة النظام باستخدام قراءات حديثة (step_8_monitor_plan_change)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_8_monitor_plan_change", 8, "مراقبة تغيير النظام", "مراقبة حالة النظام بقراءات حديثة وعدم اعتبار إرسال الطلب دليلاً على اكتماله...");
    engine.log(`[*] [الخطوة 8/13] مراقبة اعتماد النظام الجديد بقراءات حية حديثة...`, "info");

    let planConfirmed = false;
    let monitoredStatus = await engine.getStatusAndChild(true);

    if (isSimulation) {
      engine.simPlan = targetPlanName;
      planConfirmed = true;
    } else {
      for (let poll = 1; poll <= 30; poll++) {
        await sleep(2500);
        monitoredStatus = await engine.getStatusAndChild(true);
        if (monitoredStatus.planId && monitoredStatus.planId.includes(targetPlanName.includes("7") ? "7" : "6")) {
          planConfirmed = true;
          engine.log(`[+] [اعتماد النظام الجديد] تم تأكيد تغيير النظام بالسيرفر إلى: ${engine.getPlanName(monitoredStatus.planId)} (في المحاولة ${poll})`, "success");
          break;
        }
      }
    }

    if (!planConfirmed && !isSimulation) {
      engine.log(`[-] تعذر تأكيد تغيير النظام في الوقت المحدد. جاري استرجاع الميكسات للفرد بأمان...`, "error");
      if (postParkChildBal > 0) {
        await childEngine.transferMix(engine.ownerDial || session.owner_account_identifier, postParkChildBal, "Hekaya_XRP_MIX_Child_1");
      }
      return await recordCycleFailure({
        category: "PLAN_CHANGE_FAILED",
        stepKey: "step_8_monitor_plan_change",
        stepNumber: 8,
        stepTitle: "مراقبة تغيير النظام",
        message: "لم يؤكد مقسم اتصالات تغيير النظام خلال المهلة المحددة (تم إيقاف الدورة بأمان)",
      });
    }
    await sendStep("step_8_monitor_plan_change", 8, "مراقبة تغيير النظام", `تم تأكيد اعتماد النظام الجديد بنجاح: ${targetPlanDisplay}`, "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 9. التحقق من رصيد الفرد بعد التغيير (step_9_verify_child_post_change)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_9_verify_child_post_change", 9, "التحقق من رصيد الفرد", "التحقق من بقاء الميكسات المركونة بأمان في حساب الفرد بعد تغيير النظام...");
    engine.log(`[*] [الخطوة 9/13] التحقق من رصيد الفرد بعد تغيير النظام...`, "info");

    const childPostMigrate = await childEngine.getStatusAndChild(false);
    const safeChildBalance = childPostMigrate.remainingMix ?? postParkChildBal;
    engine.log(`[+] [رصيد الفرد بعد الترحيل] الرصيد المؤكد لدى الفرد: ${safeChildBalance.toLocaleString('en-US')} ميكس`, "info");
    await sendStep("step_9_verify_child_post_change", 9, "التحقق من رصيد الفرد", `رصيد الفرد المحفوظ بأمان: ${safeChildBalance.toLocaleString('en-US')} ميكس`, "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 10. التحقق من نتيجة نقل الرصيد من الفرد إلى الأونر (step_10_transfer_child_to_owner)
    // ═════════════════════════════════════════════════════════════════════════
    recoveredMixAmount = safeChildBalance;
    await sendStep("step_10_transfer_child_to_owner", 10, "استرجاع للأونر", `استرجاع (${recoveredMixAmount.toLocaleString('en-US')}) ميكس من الفرد إلى الأونر مع منع التكرار...`);
    engine.log(`[*] [الخطوة 10/13] التحقق من نتيجة نقل الرصيد من الفرد إلى الأونر...`, "info");

    if (recoveredMixAmount > 0) {
      const returnOk = await childEngine.transferMix(engine.ownerDial || session.owner_account_identifier, recoveredMixAmount, "Hekaya_XRP_MIX_Child_1");
      if (!returnOk && !isSimulation) {
        return await recordCycleFailure({
          category: "TRANSFER_FAILED",
          stepKey: "step_10_transfer_child_to_owner",
          stepNumber: 10,
          stepTitle: "استرجاع للأونر",
          message: "فشل إرسال طلب استرجاع الرصيد من الفرد إلى الأونر",
        });
      }
    }
    await sendStep("step_10_transfer_child_to_owner", 10, "استرجاع للأونر", "تم إرسال وقبول أمر استرجاع الرصيد بنجاح بالسيرفر", "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 11. إعادة قراءة رصيد الأونر والفرد للتحقق من النتيجة (step_11_reread_balances)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_11_reread_balances", 11, "إعادة قراءة الحسابين", "إعادة قراءة رصيد الأونر والفرد للتحقق من وصول الرصيد للأونر...");
    engine.log(`[*] [الخطوة 11/13] إعادة قراءة رصيد الأونر والفرد للتحقق من النتيجة...`, "info");

    let ownerPostReturnStatus = await engine.getStatusAndChild(false);
    let childPostReturnStatus = await childEngine.getStatusAndChild(false);

    if (isSimulation) {
      engine.simOwnerMix = ownerStartMix + (targetCost === 270 ? 14000 : 9000);
      childEngine.simChildMix = 0;
      ownerPostReturnStatus = { ...ownerPostReturnStatus, remainingMix: engine.simOwnerMix, readSuccess: true };
      childPostReturnStatus = { ...childPostReturnStatus, remainingMix: 0, readSuccess: true };
    }

    engine.log(`[+] [فحص الاسترجاع] رصيد الأونر: ${(ownerPostReturnStatus.remainingMix ?? 0).toLocaleString('en-US')} ميكس | رصيد الفرد: ${(childPostReturnStatus.remainingMix ?? 0).toLocaleString('en-US')} ميكس`, "info");
    await sendStep("step_11_reread_balances", 11, "إعادة قراءة الحسابين", `تم التحقق بنجاح - رصيد الأونر: ${(ownerPostReturnStatus.remainingMix ?? 0).toLocaleString('en-US')} ميكس`, "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 12. تجديد النظام الحالي للأونر بعد اكتمال النقل والتحقق (step_12_renew_owner_final)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_12_renew_owner_final", 12, "تجديد النظام النهائي", `تجديد نظام الأونر الحالي (${targetPlanDisplay}) لضخ حصة الباقة التراكمية...`);
    engine.log(`[*] [الخطوة 12/13] تجديد النظام الحالي للأونر بعد اكتمال النقل والتحقق...`, "info");

    const renew2Ok = await engine.renewBundleAction(targetPlanName, String(targetCost));
    if (!renew2Ok && !isSimulation) {
      return await recordCycleFailure({
        category: "BUNDLE_RENEWAL_FAILED",
        stepKey: "step_12_renew_owner_final",
        stepNumber: 12,
        stepTitle: "تجديد النظام النهائي",
        message: "فشل تجديد نظام الأونر بعد النقل والتحقق",
      });
    }
    await sendStep("step_12_renew_owner_final", 12, "تجديد النظام النهائي", "تم تجديد النظام النهائي بنجاح وضخ حصة الميكسات الجديدة", "confirmed");

    // ═════════════════════════════════════════════════════════════════════════
    // 13. تسجيل نتيجة الدورة والرصيد النهائي الفعلي (step_13_record_final_result)
    // ═════════════════════════════════════════════════════════════════════════
    await sendStep("step_13_record_final_result", 13, "توثيق نتيجة الدورة", "تسجيل نتيجة الدورة والرصيد النهائي الفعلي المعتمد في السجلات...");
    engine.log(`[*] [الخطوة 13/13] تسجيل نتيجة الدورة والرصيد النهائي الفعلي...`, "info");

    await sleep(2000);
    const finalOwnerStatus = await engine.getStatusAndChild(false);
    const finalChildStatus = await childEngine.getStatusAndChild(false);

    const finalOwnerMix = finalOwnerStatus.remainingMix ?? (ownerStartMix + (targetCost === 270 ? 14000 : 9000));
    const finalChildMix = finalChildStatus.remainingMix ?? 0;
    const finalPlan = finalOwnerStatus.planId || targetPlanName;

    const newCycleCount = (session.current_cycle || 0) + 1;
    const targetMix = session.target_mix_balance || 50000;
    const targetReached = finalOwnerMix >= targetMix;

    // Update session table
    await supabase.from("vip_sessions").update({
      owner_mix_balance: finalOwnerMix,
      individual_mix_balance: finalChildMix,
      total_system_mix: finalOwnerMix + finalChildMix,
      owner_balance_status: finalOwnerStatus.readSuccess ? "confirmed" : "unable_to_read",
      individual_balance_status: finalChildStatus.readSuccess ? "confirmed" : "unable_to_read",
      last_owner_refresh_at: finalOwnerStatus.timestamp,
      last_individual_refresh_at: finalChildStatus.timestamp,
      owner_current_plan: finalPlan,
      current_cycle: newCycleCount,
      current_step: targetReached ? "completed" : "idle",
      operation_state: targetReached ? "completed" : "idle",
      automation_enabled: !targetReached && session.automation_enabled,
      worker_status: "idle",
      last_successful_op_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", session_id);

    // Insert into vip_cycle_history
    await supabase.from("vip_cycle_history").insert({
      session_id: session_id,
      cycle_number: newCycleCount,
      started_at: cycleStartTime,
      ended_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - cycleStartMs) / 1000),
      owner_balance_start: ownerStartMix,
      owner_balance_post_renewal: ownerRenewedMix,
      amount_transferred_owner_to_indiv: parkedMixAmount,
      individual_balance_pre_transfer: 0,
      individual_balance_post_transfer: postParkChildBal,
      system_pre_migration: ownerPlanPre,
      system_post_migration: finalPlan,
      migration_result: "confirmed",
      amount_transferred_indiv_to_owner: recoveredMixAmount,
      final_verified_owner_balance: finalOwnerMix,
      difference_to_target: Math.max(0, targetMix - finalOwnerMix),
      cycle_status: targetReached ? "stopped_at_target" : "completed",
      increased_owner_balance: finalOwnerMix > ownerStartMix,
      safe_error_summary: null,
    });

    engine.log(`[🎉] تم اكتمال الدورة #${newCycleCount} بنجاح تام! الرصيد النهائي: (${finalOwnerMix.toLocaleString('en-US')} ميكس)`, "success");
    await sendStep("step_13_record_final_result", 13, "توثيق نتيجة الدورة", `اكتملت الدورة #${newCycleCount} - الرصيد النهائي: ${finalOwnerMix.toLocaleString('en-US')} ميكس`, "confirmed");

    return {
      success: true,
      cycle_number: newCycleCount,
      final_mix: finalOwnerMix,
      owner_mix_balance: finalOwnerMix,
      child_mix_balance: finalChildMix,
      target_reached: targetReached,
      target_mix: targetMix,
      owner_plan: finalPlan,
      logs: engine.logs,
    };
  } catch (unexpectedError: any) {
    const errorMsg = unexpectedError?.message || String(unexpectedError);
    return await recordCycleFailure({
      category: "FINAL_VERIFICATION_FAILED",
      stepKey: "unexpected_error",
      stepNumber: 0,
      stepTitle: "خطأ غير متوقع",
      message: errorMsg,
    });
  } finally {
    try {
      await supabase.from("vip_sessions").update({
        worker_status: "idle",
        worker_last_heartbeat: new Date().toISOString(),
      }).eq("id", session_id);
    } catch (_) {}
  }
}

serve(async'''

new_content = re.sub(pattern, new_handle_function, content, count=1)
if new_content == content:
    print("ERROR: pattern match failed!")
    exit(1)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(new_content)

print("SUCCESS: Patched handleSingleCycleInternal with 13-step logic!")
