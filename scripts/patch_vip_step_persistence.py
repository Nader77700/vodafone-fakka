#!/usr/bin/env python3
"""
Patch for etisalat-vip-executor/index.ts
Enforces state payload updates on steps 7, 8, 10, 13 and cycle completion
"""

TARGET_FILE = "/workspace/app-ck2v94t1nev5/supabase/functions/etisalat-vip-executor/index.ts"

with open(TARGET_FILE, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Update step 7 completion
OLD_STEP_7 = """    await sendStep("step_7_request_plan_change", 7, "طلب تغيير النظام", `تم إرسال طلب التغيير بنجاح، جاري المراقبة وعدم افتراض الاكتمال...`, "confirmed");"""

NEW_STEP_7 = """    await sendStep(
      "step_7_request_plan_change",
      7,
      "طلب تغيير النظام",
      `تم إرسال طلب التغيير بنجاح، جاري المراقبة وعدم افتراض الاكتمال...`,
      "confirmed",
      {
        isUnresolved: true,
        payload: {
          parkedMixAmount,
          postParkChildBal,
          ownerStartMix,
          ownerPlanPre,
          currentOwnerPlanName,
          targetPlanName,
          targetPlanDisplay,
          targetCost,
          currentCost,
          childDial,
        }
      }
    );"""

# 2. Update step 8 completion
OLD_STEP_8 = """    await sendStep("step_8_monitor_plan_change", 8, "مراقبة تغيير النظام", `تم تأكيد اعتماد النظام الجديد بنجاح: ${targetPlanDisplay}`, "confirmed");"""

NEW_STEP_8 = """    await sendStep(
      "step_8_monitor_plan_change",
      8,
      "مراقبة تغيير النظام",
      `تم تأكيد اعتماد النظام الجديد بنجاح: ${targetPlanDisplay}`,
      "confirmed",
      {
        isUnresolved: false,
        confirmedPlan: targetPlanName,
        payload: {
          parkedMixAmount,
          postParkChildBal,
          ownerStartMix,
          ownerPlanPre,
          targetPlanName,
          targetPlanDisplay,
          targetCost,
          currentCost,
          childDial,
        }
      }
    );"""

# 3. Update step 10 completion
OLD_STEP_10 = """    await sendStep("step_10_transfer_child_to_owner", 10, "استرجاع للأونر", "تم إرسال وقبول أمر استرجاع الرصيد بنجاح بالسيرفر", "confirmed");"""

NEW_STEP_10 = """    await sendStep(
      "step_10_transfer_child_to_owner",
      10,
      "استرجاع للأونر",
      "تم إرسال وقبول أمر استرجاع الرصيد بنجاح بالسيرفر",
      "confirmed",
      {
        isUnresolved: false,
        payload: {
          recoveredMixAmount,
          safeChildBalance,
          targetPlanName,
          targetPlanDisplay,
          targetCost,
          childDial,
        }
      }
    );"""

# 4. Update final session update in step 13
OLD_SESSION_UPDATE = """      current_step: targetReached ? "completed" : "idle",
      operation_state: targetReached ? "completed" : "idle",
      automation_enabled: !targetReached && session.automation_enabled,
      worker_status: "idle",
      last_successful_op_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", session_id);"""

NEW_SESSION_UPDATE = """      current_step: targetReached ? "completed" : "idle",
      current_step_key: targetReached ? "completed" : "idle",
      is_operation_unresolved: false,
      pending_operation_id: null,
      resume_step_payload: {},
      operation_state: targetReached ? "completed" : "idle",
      automation_enabled: !targetReached && session.automation_enabled,
      worker_status: "idle",
      last_successful_op_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", session_id);"""

# 5. Update vip_cycle_history insert
OLD_CYCLE_INSERT = """      cycle_status: targetReached ? "stopped_at_target" : "completed",
      increased_owner_balance: finalOwnerMix > ownerStartMix,
      safe_error_summary: null,
    });"""

NEW_CYCLE_INSERT = """      cycle_status: targetReached ? "stopped_at_target" : "completed",
      increased_owner_balance: finalOwnerMix > ownerStartMix,
      safe_error_summary: null,
      is_resumed: Boolean(session.current_step_key && session.current_step_key !== 'idle' && session.current_step_key !== 'completed'),
      resume_count: (session.resume_count || 0) + (session.current_step_key && session.current_step_key !== 'idle' ? 1 : 0),
    });"""

for old, new, label in [
    (OLD_STEP_7, NEW_STEP_7, "step 7"),
    (OLD_STEP_8, NEW_STEP_8, "step 8"),
    (OLD_STEP_10, NEW_STEP_10, "step 10"),
    (OLD_SESSION_UPDATE, NEW_SESSION_UPDATE, "session update"),
    (OLD_CYCLE_INSERT, NEW_CYCLE_INSERT, "cycle insert")
]:
    if old in code:
        code = code.replace(old, new, 1)
        print(f"[+] Replaced {label}")
    else:
        print(f"[-] Could not find {label}")
        sys.exit(1)

with open(TARGET_FILE, "w", encoding="utf-8") as f:
    f.write(code)

print("[+] All persistence updates written successfully")
