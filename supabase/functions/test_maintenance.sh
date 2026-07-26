#!/bin/bash
URL="https://vchmsnavyhripakyvzom.supabase.co/functions/v1/vodafone-execute"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODc4NTUsImV4cCI6MjA5Nzg2Mzg1NX0.pnqdmg5BApYx3HAPWR2UFhuV5ewyayvKR_dZk8of4s8"

echo "=== Test 1: Direct API Request ==="
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "apikey: $KEY"

echo -e "\n=== Test 2: Official Version ==="
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "apikey: $KEY" \
  -H "x-app-build: 338" \
  -H "x-app-version: 3.0.338" \
  -H "x-device-id: official-device-123"

echo -e "\n=== Test 3: Old Version ==="
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "apikey: $KEY" \
  -H "x-app-build: 300"

echo -e "\n=== Test 4: Modded Version ==="
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "apikey: $KEY" \
  -H "x-device-id: unknown" \
  -H "x-app-build: 338"

echo -e "\n=== Test 5: ana-balance-charge Endpoint ==="
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "https://vchmsnavyhripakyvzom.supabase.co/functions/v1/ana-balance-charge" \
  -H "Authorization: Bearer $KEY" \
  -H "apikey: $KEY"
