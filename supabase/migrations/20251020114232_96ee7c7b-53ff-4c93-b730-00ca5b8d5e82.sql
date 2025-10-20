-- Make station_code nullable since Stevens API doesn't always provide it
ALTER TABLE sensor_stations 
ALTER COLUMN station_code DROP NOT NULL;