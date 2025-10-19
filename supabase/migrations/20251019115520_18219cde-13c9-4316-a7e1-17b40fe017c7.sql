-- Create sensor_stations table to store monitoring station metadata
CREATE TABLE sensor_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stevens_station_id integer UNIQUE NOT NULL,
  station_name text NOT NULL,
  station_code text NOT NULL,
  location text,
  project_id integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_stations_stevens_id ON sensor_stations(stevens_station_id);

-- Create sensor_channels table to store sensor channel metadata
CREATE TABLE sensor_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid REFERENCES sensor_stations(id) ON DELETE CASCADE,
  stevens_channel_id integer NOT NULL,
  channel_name text NOT NULL,
  unit text,
  category text,
  sensor_name text,
  precision integer DEFAULT 2,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(station_id, stevens_channel_id)
);

CREATE INDEX idx_channels_station ON sensor_channels(station_id);
CREATE INDEX idx_channels_stevens_id ON sensor_channels(stevens_channel_id);

-- Create sensor_readings table to store all sensor readings indefinitely
CREATE TABLE sensor_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES sensor_channels(id) ON DELETE CASCADE,
  value numeric NOT NULL,
  measured_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_readings_channel ON sensor_readings(channel_id);
CREATE INDEX idx_readings_measured_at ON sensor_readings(channel_id, measured_at DESC);
CREATE INDEX idx_readings_latest ON sensor_readings(channel_id, measured_at DESC, id);

-- Create ai_analyses table to cache AI-generated analyses
CREATE TABLE ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid REFERENCES sensor_stations(id) ON DELETE CASCADE,
  analysis_text text NOT NULL,
  language text NOT NULL CHECK (language IN ('english', 'swahili', 'maa')),
  sensor_data_snapshot jsonb,
  data_timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_analyses_station ON ai_analyses(station_id);
CREATE INDEX idx_analyses_language ON ai_analyses(station_id, language, data_timestamp DESC);

-- Create api_fetch_log table to track Stevens API fetch attempts
CREATE TABLE api_fetch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid REFERENCES sensor_stations(id) ON DELETE CASCADE,
  fetch_started_at timestamptz NOT NULL,
  fetch_completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('in_progress', 'success', 'failed')),
  error_message text,
  readings_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_fetch_log_station ON api_fetch_log(station_id, fetch_started_at DESC);

-- Enable Row Level Security on all tables
ALTER TABLE sensor_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_fetch_log ENABLE ROW LEVEL SECURITY;

-- Create public read access policies (this is public river data)
CREATE POLICY "Public read access" ON sensor_stations FOR SELECT USING (true);
CREATE POLICY "Public read access" ON sensor_channels FOR SELECT USING (true);
CREATE POLICY "Public read access" ON sensor_readings FOR SELECT USING (true);
CREATE POLICY "Public read access" ON ai_analyses FOR SELECT USING (true);
CREATE POLICY "Public read access" ON api_fetch_log FOR SELECT USING (true);