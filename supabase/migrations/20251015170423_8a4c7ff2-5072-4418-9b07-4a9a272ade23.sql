-- Schedule scraping every 15 minutes using pg_cron
SELECT cron.schedule(
  'scrape-reconyx-photo-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gsudsnelhdmixbxcghwv.supabase.co/functions/v1/scrape-reconyx-photo',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzdWRzbmVsaGRtaXhieGNnaHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MDc3NDUsImV4cCI6MjA3NjA4Mzc0NX0.cTidq2WfnaG3zXAwwXEF5HVwLrVd9EO7nPqvuzkCrRk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);