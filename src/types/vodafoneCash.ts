export type OperationStatus = "pending" | "processing" | "completed" | "failed";

export interface MoneyTransfer {
  id: string;
  user_id: string;
  receiver_number: string;
  amount: number;
  status: OperationStatus;
  reference_number?: string;
  failure_reason?: string;
  execution_time_ms?: number;
  created_at: string;
  updated_at: string;
}

export interface RechargeBalance {
  id: string;
  user_id: string;
  receiver_number: string;
  amount: number;
  status: OperationStatus;
  reference_number?: string;
  failure_reason?: string;
  execution_time_ms?: number;
  created_at: string;
  updated_at: string;
}

export interface OperationLogs {
  id: string;
  operation_id: string;
  operation_type: "money_transfer" | "recharge_balance";
  log_level: "info" | "warning" | "error";
  message: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface VodafoneCashCenterStats {
  total_transfers: number;
  total_recharges: number;
  successful_operations: number;
  failed_operations: number;
  total_amount_transferred: number;
  total_amount_recharged: number;
}
