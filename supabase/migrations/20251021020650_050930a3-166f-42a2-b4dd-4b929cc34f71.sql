-- Create sensor_calibration_offsets table
CREATE TABLE public.sensor_calibration_offsets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.sensor_channels(id) ON DELETE CASCADE,
  offset_value NUMERIC NOT NULL,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  valid_until TIMESTAMP WITH TIME ZONE,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sensor_calibration_offsets ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Public read access" 
ON public.sensor_calibration_offsets 
FOR SELECT 
USING (true);

-- Insert pH calibration offset
-- First, find the pH channel ID
INSERT INTO public.sensor_calibration_offsets (channel_id, offset_value, valid_from, reason)
SELECT 
  id,
  56.14,
  '2024-12-12 22:30:00+00'::timestamp with time zone,
  'Bad calibration correction - restoring to normal river pH range (6-8)'
FROM public.sensor_channels
WHERE sensor_name = 'pH' AND channel_name = 'M 20'
LIMIT 1;