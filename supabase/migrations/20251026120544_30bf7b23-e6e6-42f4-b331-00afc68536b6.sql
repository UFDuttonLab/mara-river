-- Fix extension schema placement
-- Drop extensions from public schema if they exist there
DROP EXTENSION IF EXISTS pg_cron CASCADE;
DROP EXTENSION IF EXISTS pg_net CASCADE;

-- Create extensions in proper schemas (schemas already exist in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Recreate the cron job (CASCADE dropped it)
SELECT cron.schedule(
  'fetch-stevens-hourly',
  '0 * * * *',
  $$
  SELECT extensions.http_post(
    url := 'https://gsudsnelhdmixbxcghwv.supabase.co/functions/v1/fetch-stevens-data',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzdWRzbmVsaGRtaXhieGNnaHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MDc3NDUsImV4cCI6MjA3NjA4Mzc0NX0.cTidq2WfnaG3zXAwwXEF5HVwLrVd9EO7nPqvuzkCrRk"}'::jsonb,
    body := '{"forceRefresh": true}'::jsonb
  ) AS request_id;
  $$
);