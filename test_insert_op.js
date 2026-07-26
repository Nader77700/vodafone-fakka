import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.rpc('atomic_insert_operation_and_consume', {
    p_user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // valid uuid? maybe we need a real one
    p_phone: '01012345678',
    p_card_type: 'Test',
    p_amount: 10,
    p_status: 'failed',
    p_error_msg: 'Wrong password',
    p_performed_at: new Date().toISOString(),
    p_category: 'فكة',
    p_api_res: 'Error',
    p_card_data: {},
    p_source: 'ana_vodafone_balance',
    p_idempotency_key: 'test-1234',
    p_duration_ms: 100,
    p_correlation_id: null,
    p_execution_layer: null,
    p_retry_count: 0,
    p_latency_ms: 100,
    p_device_fp: null,
    p_hardware_hash: null,
    p_native_id: null
  });
  console.log('Result:', data, 'Error:', error);
}

test();
