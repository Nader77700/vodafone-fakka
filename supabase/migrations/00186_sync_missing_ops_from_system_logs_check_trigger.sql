-- Check which triggers exist
SELECT tgname FROM pg_trigger WHERE tgrelid = 'operations'::regclass;
