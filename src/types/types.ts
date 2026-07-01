// أنواع البيانات الأساسية للمنصة

export type UserRole = 'user' | 'admin' | 'super_admin' | 'merchant';

// ─── Phase 7: Merchant Invite System ──────────────────────────────────────────
export type InviteTokenStatus = 'active' | 'disabled' | 'expired';

export interface MerchantInvite {
  id:                   string;
  merchant_id:          string;
  token:                string;
  status:               InviteTokenStatus;
  expires_at:           string | null;
  view_count:           number;
  join_count:           number;
  last_viewed_at:       string | null;
  last_joined_at:       string | null;
  last_joined_user_id:  string | null;
  created_at:           string;
  recent_joins:         InviteRecentJoin[];
}

export interface InviteRecentJoin {
  user_id:   string;
  username:  string | null;
  phone:     string | null;
  joined_at: string;
}

export interface InviteUsageLog {
  id:           string;
  invite_id:    string;
  merchant_id:  string;
  user_id:      string | null;
  action:       'view' | 'join' | 'reject' | 'duplicate';
  reject_reason: string | null;
  created_at:   string;
}

/** رابط الدعوة المؤقت المخزّن في localStorage بعد فتح /invite/:token */
export interface PendingInviteToken {
  token:         string;
  merchant_id:   string;
  merchant_name: string;
  stored_at:     number;  // Date.now()
}


// ─── Merchant Types ───────────────────────────────────────────────────────────
export type MerchantStatus = 'active' | 'suspended' | 'disabled' | 'blocked' | 'deleted';
export type MerchantUserStatus = 'active' | 'suspended' | 'blocked' | 'pending' | 'disabled';

export interface Merchant {
  id: string;
  name: string;
  status: MerchantStatus;
  invite_code: string;
  notes: string | null;
  total_points: number;
  used_points: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // computed / joined
  remaining_points?: number;
  users_count?: number;
  active_users?: number;
  blocked_users?: number;
}

export interface MerchantStats {
  total_users: number;
  active_users: number;
  blocked_users: number;
}

// Phase 4: أنواع موسّعة للتاجر
export interface MerchantFull extends Merchant {
  invite_enabled: boolean;
  invite_status: 'active' | 'disabled' | 'expired';
  balance: number;
  ops_count: number;
  last_seen_at: string | null;
  users_count: number;
  active_users: number;
  blocked_users: number;
}

export interface MerchantDetail extends MerchantFull {
  owner_profile: {
    id: string;
    username: string | null;
    email: string | null;
    phone: string | null;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
    is_active: boolean;
    created_at: string;
    last_sign_in_at: string | null;
  } | null;
  stats: {
    total_users: number;
    active_users: number;
    blocked_users: number;
  };
}
export type MerchantTxType =
  | 'recharge'
  | 'deduct'
  | 'refund'
  | 'adjustment'
  | 'subscription_bonus'
  | 'admin_grant'
  | 'admin_remove'
  | 'transfer_to_user';

export interface MerchantWallet {
  id: string;
  merchant_id: string;
  current_points: number;
  used_points: number;
  reserved_points: number;
  remaining_points: number;
  lifetime_consumed: number;
  lifetime_purchased: number;
  monthly_consumed: number;
  daily_consumed: number;
  last_operation_at: string | null;
  last_recharge_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MerchantLedgerEntry {
  id: string;
  transaction_id: string;
  merchant_id: string;
  type: MerchantTxType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reason: string | null;
  notes: string | null;
  created_by: string | null;
  correlation_id: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export type SubscriptionStatus = 'active' | 'expired' | 'suspended' | 'pending' | 'cancelled' | 'replaced';
export type LicenseKeyStatus = 'active' | 'used' | 'disabled' | 'expired' | 'closed';
export type OperationStatus = 'success' | 'failed' | 'pending';
export type NotificationType =
  | 'subscription_renewal' | 'subscription_expiry' | 'subscription_activated' | 'subscription_failed'
  | 'update_available' | 'update_downloaded' | 'update_installed' | 'update_critical'
  | 'system' | 'operation' | 'info' | 'message'
  | 'security' | 'maintenance' | 'announcement' | 'offer';

export type NotificationPriority = 'normal' | 'important' | 'urgent';
export type LogLevel = 'info' | 'warning' | 'error' | 'debug';
export type CodeAction = 'created' | 'viewed' | 'attempt' | 'activated' | 'failed' | 'expired' | 'disabled';

export interface Profile {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  merchant_id: string | null;
  // Phase 3 — merchant user tracking
  merchant_user_status: MerchantUserStatus | null;
  registration_source: string | null;
  invite_token: string | null;
  merchant_created_at: string | null;
  merchant_last_seen: string | null;
  device_id: string | null;
  // Vodafone PIN lock — يُعبَّأ عند خطأ 1118 من Vodafone
  vodafone_pin_locked_at: string | null;
  vodafone_lock_reason:   string | null;
  created_at: string;
  updated_at: string;
}

export type CodeType = 'paid' | 'trial' | 'gift';
export type ExpirationMode = 'BY_DATE' | 'BY_USAGE' | 'EARLIEST';

export interface LicenseKey {
  id: string;
  code: string;
  status: LicenseKeyStatus;
  code_type: CodeType;
  duration_days: number;
  custom_duration_days: number | null;
  max_users: number | null;
  max_ops_per_user: number | null;
  allowed_users: number | null;
  uses_per_user: number | null;
  activation_limit_per_user: number | null;
  operations_per_user: number | null;
  total_operations: number | null;
  expiry_date: string | null;
  expiration_mode: ExpirationMode;
  used_count: number;
  used_by: string | null;
  used_at: string | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  used_by_profile?: Pick<Profile, 'id' | 'username' | 'email'>;
}

export interface Subscription {
  id: string;
  user_id: string;
  license_key_id: string | null;
  status: SubscriptionStatus;
  activated_at: string | null;
  expires_at: string | null;
  grace_started_at: string | null;
  grace_ends_at: string | null;
  in_grace_period: boolean;
  ops_count: number;
  ops_limit: number | null;
  ops_remaining: number | null;
  code_used: string | null;
  serial_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrialUsage {
  id: string;
  key_id: string;
  user_id: string;
  ops_used: number;
  activated_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  name: string | null;
  phone_number: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Operation {
  id: string;
  user_id: string;
  phone_number: string;
  card_type: string | null;
  card_data: Record<string, unknown> | null;
  category: string | null;
  amount: number | null;
  operation_number: number | null;
  status: OperationStatus;
  error_message: string | null;
  performed_at: string;
  created_at: string;
  duration_ms?: number | null;
  api_response?: string | null;
  // حقول إضافية من DB
  operation_source?: string | null;
  correlation_id?: string | null;
  execution_layer?: string | null;
  retry_count?: number | null;
  latency_ms?: number | null;
  idempotency_key?: string | null;
  // joined
  profile?: Pick<Profile, 'id' | 'username' | 'email'>;
}

export interface UserStatistics {
  total_operations: number;
  total_cards: number;
  total_amount: number;
  unique_phones: number;
  today_operations: number;
  week_operations: number;
  month_operations: number;
  last_operation: Operation | null;
  daily_chart: { date: string; count: number; amount: number }[];
}

export interface Notification {
  id: string;
  user_id: string | null;
  title: string;
  body: string;
  type: NotificationType;
  priority: NotificationPriority;
  is_read: boolean;
  is_global: boolean;
  action_url: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  priority: NotificationPriority;
  action_url: string | null;
  target_type: 'all' | 'specific';
  target_user_id: string | null;
  scheduled_at: string;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface NotificationDelivery {
  notification_id: string;
  user_id: string;
  delivered_at: string;
  opened_at: string | null;
  push_sent: boolean;
}

export interface SystemLog {
  id: string;
  user_id: string | null;
  level: LogLevel;
  action: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  profile?: Pick<Profile, 'id' | 'username' | 'email'>;
}

// نوع الكارت الديناميكي — يتم تحميله من مصدر خارجي
export interface RechargeCard {
  id: string;
  name: string;
  description?: string;
  [key: string]: unknown; // حقول ديناميكية إضافية من محرك الشحن
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
}

// ─── Phase 6: Merchant Members & Subscription System ─────────────────────────

export type MemberStatus = 'pending' | 'active' | 'suspended' | 'disabled' | 'blocked' | 'expired';
export type MemberSubStatus = 'pending' | 'active' | 'expired' | 'cancelled';
export type MemberTxType =
  | 'assign' | 'increase' | 'decrease' | 'refund' | 'adjustment'
  | 'subscription_bonus' | 'admin_grant' | 'admin_remove' | 'consume';

export interface MerchantMember {
  member_id:         string;
  user_id:           string;
  merchant_id?:      string;
  member_status:     MemberStatus;
  assigned_points:   number;
  consumed_points:   number;
  remaining_points:  number;
  member_created_at: string;
  activated_at:      string | null;
  expired_at:        string | null;
  last_operation_at: string | null;
  // joined from profiles
  username:          string | null;
  phone:             string | null;
  email:             string | null;
  // joined from subscription
  sub_status:        MemberSubStatus | null;
  start_date:        string | null;
  end_date:          string | null;
  remaining_days:    number;
  sub_assigned_points:  number;
  sub_remaining_points: number;
  // admin only
  merchant_name?:    string;
}

export interface MemberSubscription {
  id:              string;
  member_id:       string;
  merchant_id:     string;
  user_id:         string;
  status:          MemberSubStatus;
  assigned_points:  number;
  consumed_points:  number;
  remaining_points: number;
  start_date:      string | null;
  end_date:        string | null;
  created_at:      string;
  renewed_at:      string | null;
}

export interface MemberLedgerEntry {
  id:             string;
  transaction_id: string;
  member_id:      string;
  merchant_id:    string;
  user_id:        string;
  type:           MemberTxType;
  amount:         number;
  balance_before: number;
  balance_after:  number;
  reason:         string | null;
  notes:          string | null;
  created_by:     string | null;
  created_at:     string;
}

export interface MemberStatsResult {
  total:          number;
  active:         number;
  suspended:      number;
  blocked:        number;
  pending:        number;
  expired:        number;
  total_assigned:  number;
  total_consumed:  number;
  total_remaining: number;
}
