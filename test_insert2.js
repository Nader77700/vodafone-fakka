import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.rpc('atomic_insert_operation_and_consume', {
    p_user_id: 'a5887045-489c-46d7-8338-fe9e679a02a6',
    p_phone: '01011111111',
    p_card_type: 'فكة 9',
    p_amount: 9,
    p_status: 'failed',
    p_error_msg: 'test',
    p_performed_at: new Date().toISOString(),
    p_category: 'فكة',
    p_api_res: 'test',
    p_card_data: { product_id: 'test', price: 9, units: 400, units_label: 'وحدة', validity: 'صالح 4 أيام', type: 'fakka', via: 'unknown' },
    p_source: 'vodafone_cash',
    p_idempotency_key: 'test1',
    p_duration_ms: null,
    p_correlation_id: 'test1',
    p_execution_layer: null,
    p_retry_count: 0,
    p_latency_ms: 500,
    p_device_fp: 'test',
    p_hardware_hash: 'test',
    p_native_id: 'test'
  });
  console.log('data:', data);
  console.log('error:', error);
}

test();
