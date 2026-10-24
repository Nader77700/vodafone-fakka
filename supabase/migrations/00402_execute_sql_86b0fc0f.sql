DO $$
DECLARE
  v_owner_uid uuid := 'b82d3e47-e161-419d-bd59-71089ec51a24';
  v_delegated_uid uuid := '0fd64bea-c065-42c1-81b8-28f9d0cfc606';
  v_other_user_uid uuid := 'f62be1e3-d6a4-4903-9212-64be78dc9ea8';
  v_owner_session_id text := 'sess_test_owner_' || substr(md5(random()::text), 1, 6);
  v_del_session_id text := 'sess_test_del_' || substr(md5(random()::text), 1, 6);
  v_owner_sessions jsonb;
  v_del_sessions jsonb;
  v_other_sessions jsonb;
  v_found_in_del boolean;
  v_found_in_owner boolean;
BEGIN
  -- 1. Create session as Owner
  INSERT INTO public.vip_sessions (
    id, session_name, owner_account_identifier, individual_account_identifier,
    target_mix_balance, is_active, created_by_user_id
  ) VALUES (
    v_owner_session_id, 'جلسة اختبار المالك لايف', '1100000001', '1100000002',
    50000, true, v_owner_uid
  );

  -- 2. Create session as Delegated user (sos1122)
  INSERT INTO public.vip_sessions (
    id, session_name, owner_account_identifier, individual_account_identifier,
    target_mix_balance, is_active, created_by_user_id
  ) VALUES (
    v_del_session_id, 'جلسة اختبار المفوض لايف', '1100000003', '1100000004',
    50000, true, v_delegated_uid
  );

  -- Check from Delegated user perspective
  PERFORM set_config('request.jwt.claim.sub', v_delegated_uid::text, true);
  PERFORM set_config('request.jwt.claim.email', 'sos1122@miaoda.com', true);
  v_del_sessions := public.vip_list_sessions();

  -- Verify: Delegated user sees their session, but NOT the owner session
  v_found_in_del := false;
  FOR i IN 0 .. jsonb_array_length(v_del_sessions) - 1 LOOP
    IF (v_del_sessions->i->>'id') = v_owner_session_id THEN
      v_found_in_del := true;
    END IF;
  END LOOP;
  IF v_found_in_del THEN
    RAISE EXCEPTION 'TEST FAILED: Delegated user can see Owner session!';
  END IF;

  -- Check from Other Delegated user perspective (nader88)
  PERFORM set_config('request.jwt.claim.sub', v_other_user_uid::text, true);
  PERFORM set_config('request.jwt.claim.email', 'nader88@miaoda.com', true);
  v_other_sessions := public.vip_list_sessions();

  FOR i IN 0 .. jsonb_array_length(v_other_sessions) - 1 LOOP
    IF (v_other_sessions->i->>'id') = v_del_session_id THEN
      RAISE EXCEPTION 'TEST FAILED: User nader88 can see user sos1122 session!';
    END IF;
  END LOOP;

  -- Check from Owner perspective
  PERFORM set_config('request.jwt.claim.sub', v_owner_uid::text, true);
  PERFORM set_config('request.jwt.claim.email', 'nader77@miaoda.com', true);
  v_owner_sessions := public.vip_list_sessions();

  v_found_in_owner := false;
  FOR i IN 0 .. jsonb_array_length(v_owner_sessions) - 1 LOOP
    IF (v_owner_sessions->i->>'id') = v_del_session_id THEN
      v_found_in_owner := true;
    END IF;
  END LOOP;
  IF NOT v_found_in_owner THEN
    RAISE EXCEPTION 'TEST FAILED: Owner CANNOT see delegated user session!';
  END IF;

  -- Clean up test sessions
  DELETE FROM public.vip_sessions WHERE id IN (v_owner_session_id, v_del_session_id);

  RAISE NOTICE 'ALL ISOLATION TESTS PASSED 100%% SUCCESSFULLY!';
END $$;