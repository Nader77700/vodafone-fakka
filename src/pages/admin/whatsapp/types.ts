// Types for WhatsApp Business Cloud API Integration (Phase 1)

export type WhatsAppConnectionStatus = 'success' | 'failed' | 'incomplete' | 'insufficient_permissions' | 'partial' | 'untested';

export type WhatsAppMessageStatus = 'queued' | 'sending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'uncertain';

export type WhatsAppMessageType = 'text' | 'template';

export interface WhatsAppConfig {
  id: string;
  meta_app_id: string | null;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  graph_api_version: string;
  access_token_configured: boolean;
  app_secret_configured: boolean;
  webhook_verify_token_configured: boolean;
  webhook_url: string | null;
  webhook_verified: boolean;
  webhook_subscribed: boolean;
  last_connection_test_at: string | null;
  last_connection_status: WhatsAppConnectionStatus;
  connection_details: Record<string, any>;
  last_reachability_test_at: string | null;
  last_reachability_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppMessage {
  id: string;
  recipient_phone: string;
  message_type: WhatsAppMessageType;
  template_name: string | null;
  template_language: string | null;
  template_variables: string[];
  body_text: string | null;
  status: WhatsAppMessageStatus;
  wamid: string | null;
  meta_response: Record<string, any>;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  source: string;
  created_by: string | null;
  send_attempt_at: string | null;
  accepted_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppStatusHistory {
  id: string;
  message_id: string;
  wamid: string | null;
  status: string;
  raw_event: Record<string, any> | null;
  event_timestamp: string;
  created_at: string;
}

export interface WhatsAppWebhookEvent {
  id: string;
  event_id: string;
  event_type: string;
  signature_valid: boolean;
  processing_status: 'pending' | 'processed' | 'ignored' | 'failed' | 'reprocessing';
  processing_result: string | null;
  attempt_count: number;
  error_details: string | null;
  payload: Record<string, any>;
  wamid: string | null;
  recipient_or_sender: string | null;
  received_at: string;
  processed_at: string | null;
}


// Phase 2 Types: Automation Rules, Queue & Customer Preferences

export interface WhatsAppAutomationRules {
  id: string;
  is_global_paused: boolean;
  red_status_enabled: boolean;
  conversion_enabled: boolean;
  renewal_reminder_enabled: boolean;
  renewal_same_day_enabled: boolean;
  renewal_confirmation_enabled: boolean;
  invoice_due_reminder_enabled: boolean;
  invoice_overdue_reminder_enabled: boolean;
  payment_confirmation_enabled: boolean;
  lead_days_before_renewal: number;
  daily_execution_hour: number;
  timezone: string;
  supported_activation_days: number[];
  max_retry_attempts: number;
  retry_backoff_minutes: number;
  rate_limit_per_minute: number;
  templates_mapping: Record<string, { template_name: string; language: string }>;
  last_scheduler_run_at: string | null;
  last_scheduler_status: string | null;
  last_scheduler_metrics: Record<string, any>;
  updated_at: string;
  updated_by: string | null;
}

export interface WhatsAppCustomerPreference {
  id: string;
  entity_type: 'line' | 'merchant' | 'custom';
  entity_id: string;
  line_phone_number: string;
  customer_name: string | null;
  whatsapp_recipient: string;
  is_valid_number: boolean;
  consent_status: 'consented' | 'opt_out' | 'pending';
  consent_date: string;
  consent_source: string | null;
  is_enabled: boolean;
  is_paused: boolean;
  pause_reason: string | null;
  allow_red_status_notif: boolean;
  allow_conversion_notif: boolean;
  allow_renewal_reminders: boolean;
  allow_renewal_confirmation: boolean;
  allow_invoice_reminders: boolean;
  allow_payment_confirmation: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type WhatsAppQueueStatus = 'pending' | 'processing' | 'completed' | 'skipped' | 'failed' | 'cancelled';

export interface WhatsAppQueueJob {
  id: string;
  event_category: string;
  source_event_id: string;
  line_id: string | null;
  merchant_id: string | null;
  customer_name: string | null;
  recipient_phone: string;
  template_name: string;
  template_language: string;
  template_parameters: Record<string, any>;
  status: WhatsAppQueueStatus;
  skip_reason: string | null;
  scheduled_for: string;
  claimed_at: string | null;
  claimed_by: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  whatsapp_message_id: string | null;
  wamid: string | null;
  created_at: string;
  updated_at: string;
}
