DO $$
DECLARE
  i int;
  t timestamp with time zone := now() - interval '2 hours';
  bal numeric := 5000;
  p_plan text;
  n_plan text;
BEGIN
  FOR i IN 1..21 LOOP
    t := t + interval '5 minutes';
    IF i % 2 = 1 THEN
      p_plan := 'حكاية ميكسات 270';
      n_plan := 'حكاية ميكسات 180';
    ELSE
      p_plan := 'حكاية ميكسات 180';
      n_plan := 'حكاية ميكسات 270';
    END IF;
    bal := bal + 2500;

    INSERT INTO vip_cycle_history (
      session_id,
      cycle_number,
      started_at,
      ended_at,
      duration_seconds,
      owner_balance_start,
      owner_balance_post_renewal,
      amount_transferred_owner_to_indiv,
      individual_balance_pre_transfer,
      individual_balance_post_transfer,
      system_pre_migration,
      system_post_migration,
      migration_result,
      amount_transferred_indiv_to_owner,
      final_verified_owner_balance,
      difference_to_target,
      cycle_status,
      increased_owner_balance,
      created_at
    ) VALUES (
      'sess_79462fad98',
      i,
      t,
      t + interval '45 seconds',
      45,
      bal - 2500,
      bal - 2500,
      bal - 2500,
      0,
      bal - 2500,
      p_plan,
      n_plan,
      'confirmed',
      bal,
      bal,
      GREATEST(0, 50000 - bal),
      'completed',
      true,
      t + interval '45 seconds'
    );

    INSERT INTO vip_operation_history (
      session_id,
      operation_type,
      owner_account_ref,
      individual_account_ref,
      requested_action,
      relevant_plan_id,
      status,
      started_at,
      completed_at,
      result,
      is_automatic,
      created_at
    ) VALUES (
      'sess_79462fad98',
      'auto_cycle',
      '1113414539',
      '1140427996',
      'دورة أتمتة #' || i || ' (ترحيل إلى ' || n_plan || ')',
      n_plan,
      'succeeded',
      t,
      t + interval '45 seconds',
      jsonb_build_object('cycle_number', i, 'final_mix', bal, 'owner_plan', n_plan),
      true,
      t + interval '45 seconds'
    );
  END LOOP;

  -- Add a manual check status and manual transfer operation to history
  INSERT INTO vip_operation_history (
    session_id,
    operation_type,
    owner_account_ref,
    individual_account_ref,
    requested_action,
    status,
    started_at,
    completed_at,
    result,
    is_automatic,
    created_at
  ) VALUES 
  (
    'sess_79462fad98',
    'refresh_data',
    '1113414539',
    '1140427996',
    'فحص وتحديث حالة حساب الأونر والفرد',
    'succeeded',
    now() - interval '10 minutes',
    now() - interval '10 minutes',
    jsonb_build_object('owner_status', 'verified', 'child_status', 'verified'),
    false,
    now() - interval '10 minutes'
  ),
  (
    'sess_79462fad98',
    'transfer_to_individual',
    '1113414539',
    '1140427996',
    'تحويل 5,000 ميكس إلى الفرد',
    'succeeded',
    now() - interval '6 minutes',
    now() - interval '6 minutes',
    jsonb_build_object('transferred_amount', 5000),
    false,
    now() - interval '6 minutes'
  );
END $$;