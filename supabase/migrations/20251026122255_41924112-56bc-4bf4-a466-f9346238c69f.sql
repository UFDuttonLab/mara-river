-- Create optimized dashboard data function
CREATE OR REPLACE FUNCTION get_dashboard_data(p_language text DEFAULT 'en')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  sensors_data jsonb;
  analysis_data jsonb;
  latest_timestamp timestamptz;
BEGIN
  -- Get latest data timestamp from readings
  SELECT MAX(measured_at) INTO latest_timestamp
  FROM sensor_readings
  WHERE measured_at >= NOW() - INTERVAL '7 days';

  -- Get all active sensors with their data
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', sc.sensor_name || ' - ' || sc.channel_name,
      'value', latest.value,
      'unit', sc.unit,
      'category', sc.category,
      'channelId', sc.id,
      'chartData', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'date', sr.measured_at,
            'value', sr.value
          ) ORDER BY sr.measured_at
        )
        FROM sensor_readings sr
        WHERE sr.channel_id = sc.id
          AND sr.measured_at >= NOW() - INTERVAL '7 days'
      )
    )
  ) INTO sensors_data
  FROM sensor_channels sc
  JOIN sensor_stations ss ON sc.station_id = ss.id
  LEFT JOIN LATERAL (
    SELECT value, measured_at
    FROM sensor_readings
    WHERE channel_id = sc.id
    ORDER BY measured_at DESC
    LIMIT 1
  ) latest ON true
  WHERE sc.is_active = true;

  -- Get latest AI analysis for the requested language
  SELECT jsonb_build_object(
    'analysis', analysis_text,
    'language', language,
    'timestamp', created_at
  ) INTO analysis_data
  FROM ai_analyses
  WHERE language = p_language
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no analysis exists for requested language, get the most recent one
  IF analysis_data IS NULL THEN
    SELECT jsonb_build_object(
      'analysis', analysis_text,
      'language', language,
      'timestamp', created_at
    ) INTO analysis_data
    FROM ai_analyses
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Build final result
  result := jsonb_build_object(
    'sensors', COALESCE(sensors_data, '[]'::jsonb),
    'analysis', COALESCE(analysis_data->>'analysis', 'No analysis available'),
    'language', COALESCE(analysis_data->>'language', p_language),
    'timestamp', COALESCE(latest_timestamp, NOW())
  );

  RETURN result;
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION get_dashboard_data(text) TO anon;
GRANT EXECUTE ON FUNCTION get_dashboard_data(text) TO authenticated;