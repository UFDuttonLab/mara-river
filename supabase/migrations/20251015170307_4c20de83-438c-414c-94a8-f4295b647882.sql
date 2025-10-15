-- Create reconyx_photos table to store photo metadata
CREATE TABLE public.reconyx_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_url text NOT NULL,
  storage_url text,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (public read access for dashboard)
ALTER TABLE public.reconyx_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view photos"
  ON public.reconyx_photos
  FOR SELECT
  USING (true);

-- Index for fast latest photo lookup
CREATE INDEX idx_reconyx_photos_scraped_at ON public.reconyx_photos(scraped_at DESC);

-- Create storage bucket for reconyx photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('reconyx-photos', 'reconyx-photos', true);

-- Storage policies for reconyx-photos bucket
CREATE POLICY "Public read access for reconyx photos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'reconyx-photos');

CREATE POLICY "Service role can insert reconyx photos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'reconyx-photos');

-- Enable pg_cron and pg_net for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enable realtime for reconyx_photos table
ALTER PUBLICATION supabase_realtime ADD TABLE public.reconyx_photos;