-- Add DELETE policy to sensor_readings table for authenticated users
CREATE POLICY "Allow authenticated deletes on sensor readings"
ON public.sensor_readings
FOR DELETE
TO authenticated
USING (true);