
-- ================================================================
-- CRITICAL FIX: Remove recursive RLS policy on profiles
-- Root cause: merchant_read_own_users policy references profiles
-- table within itself → Infinite recursion → getProfile() returns
-- null → AuthContext triggers "account deleted" logout for ALL users
-- 
-- Safe to drop because:
-- ✅ "Users can view own profile" already covers users reading own profile
-- ✅ "Admins full access to profiles" already covers admin reads
-- ✅ Merchant user queries go through SECURITY DEFINER RPCs (no direct table access)
-- ================================================================

DROP POLICY IF EXISTS "merchant_read_own_users" ON profiles;
