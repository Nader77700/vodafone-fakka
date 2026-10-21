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
  last_owner_refresh_at: string | null;

  // Individual Account Info
  individual_account_identifier: string | null;
  individual_account_status: 'not_connected' | 'pending_verification' | 'verified' | 'error';
  individual_current_plan: string | null;
  individual_mix_balance: number | null;
  last_individual_refresh_at: string | null;

  // Relationship Info
  relationship_verified: boolean;
  relationship_status: 'unverified' | 'pending_verification' | 'linked_and_verified' | 'mismatched';
  relationship_details?: Record<string, any>;
  last_relationship_check_at?: string | null;

  // Automation Settings per Session
  automation_enabled: boolean;
  operation_state: 'stopped' | 'running' | 'paused' | 'awaiting_integration' | 'error' | 'completed';
  target_mix_balance: number;
  custom_target_balance?: number | null;
  cycle_delay_seconds: number;
  current_cycle: number;

  // Background Worker & Realtime Execution
  worker_status?: 'idle' | 'ready' | 'running' | 'paused' | 'stopped' | 'completed' | 'error';
  worker_last_heartbeat?: string | null;
  current_step?: string | null;
  current_cycle_details?: Record<string, any> | null;

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
