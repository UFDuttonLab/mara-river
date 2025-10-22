-- Remove existing duplicates (keep earliest created record for each channel_id + measured_at)
DELETE FROM sensor_readings a
USING sensor_readings b
WHERE a.id > b.id
  AND a.channel_id = b.channel_id
  AND a.measured_at = b.measured_at;

-- Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_readings_unique 
ON sensor_readings(channel_id, measured_at);