DO $$
DECLARE
  v_owner_uid uuid := '1f4bd575-dad6-4011-9864-8759ff771147';
  v_delegated_uid uuid := '0fd64bea-c065-42c1-81b8-28f9d0cfc606';
  v_other_user_uid uuid := 'f62be1e3-d6a4-4903-9212-64be78dc9ea8';
  v_del_session_id text := 'sess_test_arch_' || substr(md5(random()::text), 1, 6);
  v_del_arch_res jsonb;
  v_other_arch_res jsonb;
  v_unarchive_res jsonb;
BEGIN
  -- 1. Create archived session as Delegated user (sos1122)
  INSERT INTO public.vip_sessions (
    id, session_name, owner_account_identifier, individual_account_identifier,
    target_mix_balance, is_active, created_by_user_id
  ) VALUES (
    v_del_session_id, 'جلسة أرشفة تجريبية', '1100000005', '1100000006',
    50000, false, v_delegated_uid
  );

  -- 2. Check archived list for Delegated user (sos1122)
  PERFORM set_config('request.jwt.claim.sub', v_delegated_uid::text, true);
  PERFORM set_config('request.jwt.claim.email', 'sos1122@miaoda.com', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_del_arch_res := public.vip_list_archived_sessions();
  IF jsonb_array_length(v_del_arch_res->'sessions') = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: Delegated user cannot see their archived session!';
  END IF;

  -- 3. Check archived list for Other user (nader88)
  PERFORM set_config('request.jwt.claim.sub', v_other_user_uid::text, true);
  PERFORM set_config('request.jwt.claim.email', 'nader88@miaoda.com', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  v_other_arch_res := public.vip_list_archived_sessions();
  FOR i IN 0 .. jsonb_array_length(v_other_arch_res->'sessions') - 1 LOOP
    IF (v_other_arch_res->'sessions'->i->>'id') = v_del_session_id THEN
      RAISE EXCEPTION 'TEST FAILED: User nader88 can see user sos1122 archived session!';
    END IF;
  END LOOP;

  -- 4. Delegated user unarchives their session
  PERFORM set_config('request.jwt.claim.sub', v_delegated_uid::text, true);
  PERFORM set_config('request.jwt.claim.email', 'sos1122@miaoda.com', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  v_unarchive_res := public.vip_unarchive_session(v_del_session_id);

  IF NOT (v_unarchive_res->>'success')::boolean THEN
    RAISE EXCEPTION 'TEST FAILED: unarchive returned failure!';
  END IF;

  -- Clean up
  DELETE FROM public.vip_sessions WHERE id = v_del_session_id;

  RAISE NOTICE 'ALL ARCHIVE AND UNARCHIVE TESTS PASSED 100%%!';
END $$;