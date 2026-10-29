#!/usr/bin/env python3
"""
Patch for etisalat-vip-executor/index.ts
Implements persistent state saving and seamless resumption across reconnects/restarts.
"""

import sys

TARGET_FILE = "/workspace/app-ck2v94t1nev5/supabase/functions/etisalat-vip-executor/index.ts"

with open(TARGET_FILE, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Update sendStep signature and body to persist step_key, unresolved state, and payload
OLD_SEND_STEP = """  // Helper: notify UI step
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
  };"""

NEW_SEND_STEP = """  // Helper: notify UI step & persist state machine for seamless resume across disconnects
  const sendStep = async (
    stepKey: string,
    stepNum: number,
    title: string,
    desc: string,
    status: 'in_progress' | 'confirmed' | 'failed' | 'pending_verification' = 'in_progress',
    extras?: {
      isUnresolved?: boolean;
      operationId?: string;
      payload?: Record<string, any>;
      confirmedPlan?: string;
    }
  ) => {
    if (sendEvent) {
      await sendEvent("step", { step: stepKey, stepNumber: stepNum, title, desc, status });
    }
    try {
      const updatePayload: Record<string, any> = {
        current_step: stepKey,
        current_step_key: stepKey,
        is_operation_unresolved: extras?.isUnresolved ?? false,
        pending_operation_id: extras?.operationId ?? null,
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
      };

      if (extras?.payload) {
        updatePayload.resume_step_payload = extras.payload;
      }
      if (extras?.confirmedPlan) {
        updatePayload.last_confirmed_plan = extras.confirmedPlan;
      }

      await supabase.from("vip_sessions").update(updatePayload).eq("id", session_id);
    } catch (_) {}
  };"""

if OLD_SEND_STEP in code:
    code = code.replace(OLD_SEND_STEP, NEW_SEND_STEP, 1)
    print("[+] Successfully patched sendStep with state persistence")
else:
    print("[-] OLD_SEND_STEP not found verbatim, checking alternatives...")
    sys.exit(1)

with open(TARGET_FILE, "w", encoding="utf-8") as f:
    f.write(code)

print("[+] Wrote patched index.ts")
