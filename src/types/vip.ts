export interface VipOwnerConfig {
  id: string;
  owner_user_id: string | null;
  is_verified: boolean;
  verification_method?: string;
  verified_at: string | null;
  owner_account_identifier: string | null;
  owner_account_status: 'not_connected' | 'pending_verification' | 'verified' | 'error';
  owner_current_plan: string | null;
  owner_mix_balance: number | null;
  last_owner_refresh_at: string | null;
  individual_account_identifier: string | null;
  individual_account_status: 'not_connected' | 'pending_verification' | 'verified' | 'error';
  individual_current_plan: string | null;
  individual_mix_balance: number | null;
  last_individual_refresh_at: string | null;
  relationship_verified: boolean;
  relationship_status: 'unverified' | 'pending_verification' | 'linked_and_verified' | 'mismatched';
  relationship_details: Record<string, any>;
  last_relationship_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VipAutomationSettings {
  id: string;
  automation_enabled: boolean;
  operation_state: 'stopped' | 'running' | 'paused' | 'awaiting_integration' | 'error' | 'completed';
  target_mix_balance: number;
  custom_target_balance: number | null;
  cycle_delay_seconds: number;
  current_cycle: number;
  last_actual_operation: string | null;
  last_successful_operation: string | null;
  last_successful_op_at: string | null;
  next_scheduled_action: string | null;
  next_scheduled_at: string | null;
  most_recent_error: string | null;
  pause_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface VipSession {
  id: string;
  session_name: string;
  session_description?: string | null;
  is_active: boolean;

  // Owner Account Info
  owner_account_identifier: string | null;
  owner_account_status: 'not_connected' | 'pending_verification' | 'verified' | 'error';
  owner_current_plan: string | null;
  owner_mix_balance: number | null;
  owner_balance_status?: 'confirmed' | 'unable_to_read' | 'pending_verification' | 'in_progress';
  last_owner_refresh_at: string | null;

  // Individual Account Info
  individual_account_identifier: string | null;
  individual_account_status: 'not_connected' | 'pending_verification' | 'verified' | 'error';
  individual_current_plan: string | null;
  individual_mix_balance: number | null;
  individual_balance_status?: 'confirmed' | 'unable_to_read' | 'pending_verification' | 'in_progress';
  last_individual_refresh_at: string | null;

  // Simulation / Testing Mode
  is_simulation_mode?: boolean;
  simulation_scenario?: string | null;

  // Relationship Info
  relationship_verified: boolean;
  relationship_status: 'unverified' | 'pending_verification' | 'linked_and_verified' | 'mismatched';
  relationship_details?: Record<string, any>;
  last_relationship_check_at?: string | null;

  // Automation Settings per Session
  automation_enabled: boolean;
  auto_eject_child_on_complete?: boolean;
  operation_state: 'stopped' | 'running' | 'paused' | 'awaiting_integration' | 'error' | 'completed';
  target_mix_balance: number;
  custom_target_balance?: number | null;
  cycle_delay_seconds: number;
  current_cycle: number;

  // Background Worker & Realtime Execution
  worker_status?: 'idle' | 'ready' | 'running' | 'executing' | 'paused' | 'stopped' | 'completed' | 'error';
  worker_last_heartbeat?: string | null;
  current_step?: string | null;
  current_step_key?: VipStepKey | null;
  current_cycle_details?: Record<string, any> | null;

  // Persistence, Resumption & Unresolved Operations (Sections 1 & 2)
  pending_operation_id?: string | null;
  is_operation_unresolved?: boolean;
  last_confirmed_plan?: string | null;
  resume_step_payload?: Record<string, any> | null;
  last_successful_read_at?: string | null;
  last_plan_change_request_at?: string | null;
  last_confirmed_transfer_amount?: number | null;

  // Credentials and Security (Masked)
  owner_email?: string | null;
  has_owner_password?: boolean;
  individual_email?: string | null;
  has_individual_password?: boolean;

  // Diagnostics and Operations
  last_actual_operation: string | null;
  last_successful_operation: string | null;
  last_successful_op_at: string | null;
  last_error_summary: string | null;
  pause_reason?: string | null;
  stop_reason?: string | null;
  mixes_parked_at_child?: boolean;
  parked_amount?: number | null;

  // Creator info & delegation tracking
  created_by_user_id?: string | null;
  creator_user_name?: string | null;
  creator_user_email?: string | null;
  is_delegated_session?: boolean;

  created_at: string;
  updated_at: string;
}

export interface VipCycleRecord {
  id: string;
  session_id: string;
  cycle_number: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  owner_balance_start: number | null;
  owner_balance_post_renewal: number | null;
  amount_transferred_owner_to_indiv: number | null;
  individual_balance_pre_transfer: number | null;
  individual_balance_post_transfer: number | null;
  system_pre_migration: string | null;
  system_post_migration: string | null;
  migration_result: string | null;
  amount_transferred_indiv_to_owner: number | null;
  final_verified_owner_balance: number | null;
  difference_to_target: number | null;
  cycle_status: 'pending_integration' | 'completed' | 'failed' | 'stopped_at_target' | 'running';
  failure_step: string | null;
  safe_error_summary: string | null;
  increased_owner_balance: boolean;
  created_at: string;

  // Extended Cycle Audit & Recovery Diagnostics
  resume_count?: number;
  is_resumed?: boolean;
  unresolved_reason?: string | null;
  error_category?: string | null;
  failure_timestamp?: string | null;
  last_api_response_summary?: string | null;
}

export interface VipSupportedSystem {
  id: string;
  display_name: string;
  is_auto_eligible: boolean;
  allowed_transitions: string[];
  renewal_values: number[];
  eligibility_requirements: string | null;
  unsupported_reason: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface VipOperationRecord {
  id: string;
  session_id?: string | null;
  operation_type: 'change_system' | 'transfer_to_individual' | 'transfer_to_owner' | 'renew_bundle' | 'sync_account_data' | 'view_account_details' | 'automation_cycle';
  owner_account_ref: string | null;
  individual_account_ref: string | null;
  requested_action: string;
  relevant_plan_id: string | null;
  requested_amount: number | null;
  status: 'requested' | 'pending' | 'pending_integration' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, any>;
  failure_reason: string | null;
  initiating_user_id: string | null;
  is_automatic: boolean;
}

export type VipStepKey =
  | 'idle'
  | 'step_1_auth_check'
  | 'step_2_read_initial_status'
  | 'step_3_renew_owner_initial'
  | 'step_4_wait_and_recheck'
  | 'step_5_transfer_owner_to_child'
  | 'step_6_verify_post_transfer'
  | 'step_7_request_plan_change'
  | 'step_8_monitor_plan_change'
  | 'step_9_verify_child_post_change'
  | 'step_10_transfer_child_to_owner'
  | 'step_11_reread_balances'
  | 'step_12_renew_owner_final'
  | 'step_13_record_final_result'
  | 'cooldown'
  | 'completed'
  | 'safety_stop'
  | 'error';

export interface VipStepDefinition {
  num: number;
  key: VipStepKey;
  title: string;
  desc: string;
}

export const VIP_STANDARD_13_STEPS: VipStepDefinition[] = [
  { num: 1, key: 'step_1_auth_check', title: 'فحص الحسابات', desc: 'تسجيل الدخول والتحقق من حساب الأونر والفرد' },
  { num: 2, key: 'step_2_read_initial_status', title: 'قراءة الأرصدة والأنظمة', desc: 'قراءة النظام الحالي وأرصدة الحسابين الحية من الخدمة' },
  { num: 3, key: 'step_3_renew_owner_initial', title: 'تجديد نظام الأونر', desc: 'إرسال طلب تجديد نظام الأونر الحالي' },
  { num: 4, key: 'step_4_wait_and_recheck', title: 'انتظار ثانيتين وإعادة القراءة', desc: 'الانتظار ثانيتين ثم إعادة قراءة البيانات والتأكد' },
  { num: 5, key: 'step_5_transfer_owner_to_child', title: 'تحويل ميكسات للأفراد', desc: 'تحويل ميكسات الأونر إلى الفرد والتحقق من نتيجة العملية' },
  { num: 6, key: 'step_6_verify_post_transfer', title: 'التحقق بعد التحويل', desc: 'التحقق من الأرصدة بعد التحويل والتأكد من وصولها' },
  { num: 7, key: 'step_7_request_plan_change', title: 'طلب تغيير النظام', desc: 'طلب تغيير نظام الأونر إلى النظام الآخر' },
  { num: 8, key: 'step_8_monitor_plan_change', title: 'مراقبة تغيير النظام', desc: 'مراقبة حالة النظام بقراءات حديثة حتى اعتماده' },
  { num: 9, key: 'step_9_verify_child_post_change', title: 'التحقق من رصيد الفرد', desc: 'التحقق من رصيد الفرد بعد استقرار تغيير النظام' },
  { num: 10, key: 'step_10_transfer_child_to_owner', title: 'استرجاع للأونر', desc: 'التحقق من نتيجة نقل الرصيد من الفرد إلى الأونر' },
  { num: 11, key: 'step_11_reread_balances', title: 'إعادة قراءة الحسابين', desc: 'إعادة قراءة رصيد الأونر والفرد للتحقق من النتيجة' },
  { num: 12, key: 'step_12_renew_owner_final', title: 'تجديد النظام النهائي', desc: 'تجديد النظام الحالي للأونر بعد اكتمال النقل والتحقق' },
  { num: 13, key: 'step_13_record_final_result', title: 'توثيق نتيجة الدورة', desc: 'تسجيل نتيجة الدورة والرصيد النهائي الفعلي' },
];

export interface VipDashboardData {
  config?: VipOwnerConfig;
  session?: VipSession;
  automation?: VipAutomationSettings;
  supported_systems: VipSupportedSystem[];
  recent_operations: VipOperationRecord[];
  recent_cycles?: VipCycleRecord[];
  server_time: string;
}

export interface VipOwnerSessionVerification {
  is_authorized: boolean;
  reason?: string;
  user_id?: string;
  is_verified_owner?: boolean;
  verified_at?: string;
  owner_account_identifier?: string;
  individual_account_identifier?: string;
  relationship_status?: string;
}
