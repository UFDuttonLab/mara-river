-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create hourly cron job to fetch Stevens data
SELECT cron.schedule(
  'fetch-stevens-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT net.http_post(
    url := 'https://gsudsnelhdmixbxcghwv.supabase.co/functions/v1/fetch-stevens-data',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzdWRzbmVsaGRtaXhieGNnaHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MDc3NDUsImV4cCI6MjA3NjA4Mzc0NX0.cTidq2WfnaG3zXAwwXEF5HVwLrVd9EO7nPqvuzkCrRk"}'::jsonb,
    body := '{"forceRefresh": true}'::jsonb
  ) AS request_id;
  $$
);