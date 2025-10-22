-- Add RLS policies for calibration offset management
-- These policies will be used by the edge function with service role key

-- Policy for inserting new calibration offsets
CREATE POLICY "Allow authenticated inserts on calibration offsets"
ON sensor_calibration_offsets
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy for updating calibration offsets
CREATE POLICY "Allow authenticated updates on calibration offsets"
ON sensor_calibration_offsets
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy for deleting calibration offsets
CREATE POLICY "Allow authenticated deletes on calibration offsets"
ON sensor_calibration_offsets
FOR DELETE
TO authenticated
USING (true);