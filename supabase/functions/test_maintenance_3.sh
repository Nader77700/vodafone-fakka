#!/bin/bash
URL="https://vchmsnavyhripakyvzom.supabase.co/functions/v1/vodafone-execute"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODc4NTUsImV4cCI6MjA5Nzg2Mzg1NX0.pnqdmg5BApYx3HAPWR2UFhuV5ewyayvKR_dZk8of4s8"

echo "=== Test 7: Fake/Anon Auth Header ==="
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "apikey: $KEY"
