import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
supabase.rpc('atomic_insert_operation_and_consume', {
  p_user_id: '00000000-0000-0000-0000-000000000000',
  p_phone: '01012345678',
  p_card_type: 'كارت فكة 10',
  p_amount: 10.0,
  p_status: 'failed',
  p_error_msg: 'test',
  p_performed_at: new Date().toISOString(),
  p_category: 'فكة',
  p_api_res: 'test',
  p_card_data: {},
  p_source: 'vodafone_cash',
  p_idempotency_key: 'idemp_123',
  p_duration_ms: 1000,
  p_correlation_id: 'corr_123',
  p_execution_layer: 'client',
  p_retry_count: 0,
  p_latency_ms: 1000,
  p_device_fp: 'device_fp',
  p_hardware_hash: 'hw_hash',
  p_native_id: 'native_id'
}).then(console.log).catch(console.error);
