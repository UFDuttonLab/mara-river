import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_URL = 'https://api.stevens-connect.com';

// Channel ID to sensor name mapping for Manta sensors
const CHANNEL_MAP: Record<string, string> = {
  'temperature': 'temperature',
  'ph': 'ph',
  'depth': 'depth',
  'conductivity': 'conductivity',
  'chlorophyll': 'chlorophyll',
  'phycocyanin': 'phycocyanin',
  'phycoerythrin': 'phycoerythrin',
  'cdom': 'cdom',
  'crude_oil': 'crudeOil',
  'optical_brighteners': 'opticalBrighteners',
  'turbidity': 'turbidity',
  'dissolved_oxygen': 'dissolvedOxygen',
  'salinity': 'salinity',
  'tds': 'tds',
  'specific_conductivity': 'specificConductivity',
  'resistivity': 'resistivity',
  'battery_voltage': 'batteryVoltage',
  'wiper_position': 'wiperPosition',
  'latitude': 'latitude',
  'longitude': 'longitude',
  'vertical_position': 'verticalPosition',
};

// Helper to get Supabase client
const getSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseKey);
};

// Check if we should fetch fresh data from Stevens API
const shouldFetchFreshData = async (supabase: any, stationUuid: string) => {
  const { data } = await supabase
    .from('api_fetch_log')
    .select('fetch_completed_at, status')
    .eq('station_id', stationUuid)
    .eq('status', 'success')
    .order('fetch_completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (!data) return true; // No previous fetch
  
  const lastFetch = new Date(data.fetch_completed_at);
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  
  return lastFetch < fifteenMinutesAgo;
};

// Get cached sensor data from database
const getCachedData = async (supabase: any, stevensStationId: number) => {
  // Get station info
  const { data: station } = await supabase
    .from('sensor_stations')
    .select('*')
    .eq('stevens_station_id', stevensStationId)
    .maybeSingle();
  
  if (!station) return null;
  
  // Get channels
  const { data: channels } = await supabase
    .from('sensor_channels')
    .select('*')
    .eq('station_id', station.id)
    .eq('is_active', true);
  
  if (!channels || channels.length === 0) return null;
  
  // Get latest readings for the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const channelIds = channels.map((c: any) => c.id);
  
  const { data: readings } = await supabase
    .from('sensor_readings')
    .select('*')
    .in('channel_id', channelIds)
    .gte('measured_at', sevenDaysAgo.toISOString())
    .order('measured_at', { ascending: true });
  
  if (!readings || readings.length === 0) return null;
  
  return { station, channels, readings };
};

// Store station and channel metadata
const storeMetadata = async (supabase: any, stationInfo: any, channelsData: any[]) => {
  // Upsert station
  const { data: station, error: stationError } = await supabase
    .from('sensor_stations')
    .upsert({
      stevens_station_id: stationInfo.id,
      station_name: stationInfo.name,
      station_code: stationInfo.code,
      location: 'Mara River, Kenya',
      project_id: 425,
      updated_at: new Date().toISOString()
    }, { onConflict: 'stevens_station_id' })
    .select()
    .maybeSingle();

  if (stationError) {
    console.error('Station upsert error:', stationError);
    throw new Error(`Failed to upsert station: ${stationError.message}`);
  }

  if (!station) {
    throw new Error('Station upsert returned no data');
  }
  
  // Upsert channels
  const channelUpserts = channelsData.map((ch: any) => ({
    station_id: station.id,
    stevens_channel_id: ch.id,
    channel_name: ch.name,
    unit: ch.unit,
    category: ch.category,
    sensor_name: ch.category,
    is_active: true,
    updated_at: new Date().toISOString()
  }));
  
  const { data: channels, error: channelsError } = await supabase
    .from('sensor_channels')
    .upsert(channelUpserts, { onConflict: 'station_id,stevens_channel_id' })
    .select();

  if (channelsError) {
    console.error('Channels upsert error:', channelsError);
    throw new Error(`Failed to upsert channels: ${channelsError.message}`);
  }

  if (!channels || channels.length === 0) {
    throw new Error('Channels upsert returned no data');
  }
  
  return { station, channels };
};

// Store readings in bulk
const storeReadings = async (supabase: any, channelMap: Map<number, string>, readingsData: any) => {
  const readingsToInsert: any[] = [];
  
  Object.entries(readingsData).forEach(([stevensChannelId, readings]: [string, any]) => {
    const channelId = channelMap.get(parseInt(stevensChannelId));
    if (!channelId) return;
    
    if (Array.isArray(readings)) {
      readings.forEach((r: any) => {
        readingsToInsert.push({
          channel_id: channelId,
          value: r.reading,
          measured_at: r.timestamp
        });
      });
    }
  });
  
  if (readingsToInsert.length > 0) {
    // Insert in batches of 1000 to avoid timeout
    const batchSize = 1000;
    for (let i = 0; i < readingsToInsert.length; i += batchSize) {
      const batch = readingsToInsert.slice(i, i + batchSize);
      const { error: insertError } = await supabase.from('sensor_readings').insert(batch);
      if (insertError) {
        console.error(`Batch insert error (batch ${Math.floor(i / batchSize) + 1}):`, insertError);
        throw new Error(`Failed to insert readings batch: ${insertError.message}`);
      }
    }
  }
  
  return readingsToInsert.length;
};

// Get or generate AI analysis
const getOrGenerateAnalysis = async (supabase: any, stationId: string, language: string, sensorData: any) => {
  // Check cache (< 1 hour old)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const { data: cached } = await supabase
    .from('ai_analyses')
    .select('analysis_text')
    .eq('station_id', stationId)
    .eq('language', language)
    .gte('created_at', oneHourAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (cached) {
    console.log('Using cached AI analysis');
    return { analysis: cached.analysis_text, cached: true };
  }
  
  // Generate new analysis
  console.log('Generating new AI analysis...');
  const analysisResponse = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-river-health`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sensorData)
    }
  );
  
  if (!analysisResponse.ok) {
    console.error('Analysis generation failed:', await analysisResponse.text());
    throw new Error('Failed to generate analysis');
  }
  
  const { analysis } = await analysisResponse.json();
  
  // Cache it
  await supabase.from('ai_analyses').insert({
    station_id: stationId,
    analysis_text: analysis,
    language: language,
    sensor_data_snapshot: sensorData,
    data_timestamp: new Date().toISOString()
  });
  
  return { analysis, cached: false };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();
    const { language = 'english', forceRefresh = false, daysBack = 7 } = await req.json().catch(() => ({}));
    
    const TARGET_STATION_ID = 5285; // Mara River Purungat Bridge
    
    // Step 1: Check if we have cached data
    console.log("Checking cache...");
    const cachedData = await getCachedData(supabase, TARGET_STATION_ID);
    
    let shouldFetch = forceRefresh || !cachedData;
    
    if (cachedData && !forceRefresh) {
      // Check if we should refresh from Stevens API
      shouldFetch = await shouldFetchFreshData(supabase, cachedData.station.id);
      
      if (!shouldFetch) {
        console.log("Using cached data (still fresh)");
        
        // Fetch calibration offsets
        const { data: calibrationOffsets } = await supabase
          .from('sensor_calibration_offsets')
          .select('*');
        
        const offsetsMap = new Map<string, any[]>();
        if (calibrationOffsets) {
          calibrationOffsets.forEach((offset: any) => {
            if (!offsetsMap.has(offset.channel_id)) {
              offsetsMap.set(offset.channel_id, []);
            }
            offsetsMap.get(offset.channel_id)!.push(offset);
          });
        }

        const applyOffset = (value: number, channelId: string, timestamp: string): number => {
          const offsets = offsetsMap.get(channelId);
          if (!offsets) return value;
          
          const readingTime = new Date(timestamp);
          const activeOffset = offsets.find(offset => {
            const validFrom = new Date(offset.valid_from);
            const validUntil = offset.valid_until ? new Date(offset.valid_until) : null;
            return readingTime >= validFrom && (!validUntil || readingTime <= validUntil);
          });
          
          return activeOffset ? value + activeOffset.offset_value : value;
        };
        
        // Transform cached data to match expected format
        const channelMap = new Map(cachedData.channels.map((c: any) => [c.id, c]));
        const sensorDataMap = new Map<string, any>();
        
        cachedData.readings.forEach((reading: any) => {
          const channel: any = channelMap.get(reading.channel_id);
          if (!channel) return;
          
          const correctedValue = applyOffset(reading.value, reading.channel_id, reading.measured_at);
          
          const sensorKey = channel.id;
          if (!sensorDataMap.has(sensorKey)) {
            sensorDataMap.set(sensorKey, {
              id: sensorKey,
              name: channel.channel_name,
              unit: channel.unit,
              category: channel.category,
              readings: [],
              currentValue: 0,
              currentTimestamp: '',
              mean24hr: 0
            });
          }
          
          const sensor = sensorDataMap.get(sensorKey);
          sensor.readings.push({
            timestamp: reading.measured_at,
            value: correctedValue
          });
        });
        
        // Process sensors and calculate stats
        const sensors = Array.from(sensorDataMap.values());
        sensors.forEach((sensor: any) => {
          if (sensor.readings.length > 0) {
            sensor.readings.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            const latest = sensor.readings[sensor.readings.length - 1];
            sensor.currentValue = latest.value;
            sensor.currentTimestamp = latest.timestamp;
            
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recent24hr = sensor.readings.filter((r: any) => new Date(r.timestamp) >= oneDayAgo);
            if (recent24hr.length > 0) {
              sensor.mean24hr = recent24hr.reduce((sum: number, r: any) => sum + r.value, 0) / recent24hr.length;
            }
          }
        });
        
        // Get or generate AI analysis
        const { analysis } = await getOrGenerateAnalysis(
          supabase,
          cachedData.station.id,
          language,
          { 
            station: { name: cachedData.station.station_name, location: 'Mara River, Kenya' }, 
            sensors: sensors.map(s => ({
              name: s.name,
              unit: s.unit,
              current: s.currentValue,
              min: Math.min(...s.readings.map((r: any) => r.value)),
              max: Math.max(...s.readings.map((r: any) => r.value)),
              avg: s.readings.reduce((sum: number, r: any) => sum + r.value, 0) / s.readings.length,
              mean24hr: s.mean24hr,
              trend: s.readings.length > 1 ? (s.readings[s.readings.length - 1].value - s.readings[0].value) : 0
            })),
            timeRange: '7 days', 
            language 
          }
        );
        
        return new Response(
          JSON.stringify({
            data: {
              station: {
                id: cachedData.station.stevens_station_id,
                name: cachedData.station.station_name,
                code: cachedData.station.station_code
              },
              sensors,
              analysis,
              cached: true,
              lastUpdated: cachedData.station.updated_at,
              timestamp: new Date().toISOString()
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    console.log("Fetching fresh data from Stevens API...");
    console.log("Step 1: Authenticating with Stevens-Connect API...");
    
    const email = Deno.env.get('STEVENS_EMAIL');
    const password = Deno.env.get('STEVENS_PASSWORD');

    if (!email || !password) {
      throw new Error('Missing Stevens credentials');
    }

    // Step 1: Authenticate using form data
    const authBody = new URLSearchParams();
    authBody.append('email', email);
    authBody.append('password', password);

    const authResponse = await fetch(`${BASE_URL}/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: authBody.toString(),
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.error('Authentication failed:', errorText);
      throw new Error(`Authentication failed: ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    let token = authData.data?.token;

    if (!token) {
      console.error('No token in response:', authData);
      throw new Error('No token received from authentication');
    }

    console.log('Authentication successful');
    console.log('Step 2: Fetching configuration packet...');

    // Step 2: Get configuration packet
    const configResponse = await fetch(`${BASE_URL}/config-packet`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!configResponse.ok) {
      const errorText = await configResponse.text();
      console.error('Config fetch failed:', errorText);
      throw new Error(`Config fetch failed: ${configResponse.status}`);
    }

    // Update token if provided in response header
    const newToken = configResponse.headers.get('X-Token');
    if (newToken) {
      token = newToken;
      console.log('Token refreshed from config response');
    }

    const configData = await configResponse.json();

    // Extract project and station info
    const projects = configData.data?.config_packet?.projects || [];
    if (projects.length === 0) {
      throw new Error('No projects found in config packet');
    }

    const project = projects[0];
    const projectId = project.id;
    
    // Find the specific station "Mara River Purungat Bridge"
    const TARGET_STATION_NAME = 'Mara River Purungat Bridge';
    const allStations = project.stations || [];
    const targetStation = allStations.find((s: any) => 
      s.name === TARGET_STATION_NAME
    );
    
    if (!targetStation) {
      throw new Error(`Station "${TARGET_STATION_NAME}" not found in project`);
    }
    
    const targetStationId = targetStation.id;
    const targetStationName = targetStation.name;
    console.log(`Found target station: ${targetStationName} (ID: ${targetStationId})`);
    
    // Step 2.5: Extract station-specific channels from config packet
    console.log('Step 2.5: Extracting station channels from config packet...');

    const stationSensors = targetStation.sensors || [];
    console.log(`Found ${stationSensors.length} sensors for station ${targetStationName}`);

    // Flatten all channels from all sensors
    const stationChannels: any[] = [];
    stationSensors.forEach((sensor: any) => {
      const sensorChannels = sensor.channels || [];
      sensorChannels.forEach((channel: any) => {
        stationChannels.push({
          ...channel,
          sensor_id: sensor.id,
          sensor_name: sensor.name,
          sensor_status: sensor.status
        });
      });
    });

    // Filter for active sensors only
    const activeChannels = stationChannels.filter((ch: any) => ch.sensor_status === 1);

    // Filter for M 20 sensors only
    const m20Channels = activeChannels.filter((ch: any) => ch.sensor_name === "M 20");
    console.log(`Filtered to ${m20Channels.length} M 20 channels`);

    // Get units dictionary from config packet
    const units = configData.data?.config_packet?.units || [];
    const unitMap = new Map(units.map((u: any) => [u.id, u.unit]));

    // Build channel map with proper metadata (M 20 only)
    const channelMap = new Map<number, any>();
    m20Channels.forEach((ch: any) => {
      channelMap.set(ch.id, {
        id: ch.id,
        name: ch.name,
        sensorName: ch.sensor_name || 'Unknown Sensor',
        unit: unitMap.get(ch.unit_id) || '',
        precision: 2,
        category: ch.sensor_name || 'Other Sensors'
      });
    });

    const channelIds = Array.from(channelMap.keys());
    const channels = Array.from(channelMap.values());

    if (channelIds.length === 0) {
      throw new Error('No channels found for the target station');
    }

    console.log(`Found ${channelIds.length} unique channels for station ${targetStationName}`);
    console.log('Step 3: Fetching readings data...');

    // Step 3: Fetch readings for all channels
    const minutes = daysBack * 24 * 60; // Convert days to minutes
    console.log(`Fetching ${daysBack} days of data (${minutes} minutes)...`);
    
    const readingsUrl = new URL(`${BASE_URL}/project/${projectId}/readings/v3/channels`);
    readingsUrl.searchParams.append('channel_ids', channelIds.join(','));
    readingsUrl.searchParams.append('range_type', 'relative');
    readingsUrl.searchParams.append('start_date', 'null');
    readingsUrl.searchParams.append('end_date', 'null');
    readingsUrl.searchParams.append('minutes', minutes.toString());
    readingsUrl.searchParams.append('transformation', 'none');

    const readingsResponse = await fetch(readingsUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!readingsResponse.ok) {
      const errorText = await readingsResponse.text();
      console.error('Readings fetch failed:', errorText);
      throw new Error(`Readings fetch failed: ${readingsResponse.status}`);
    }

    const readingsData = await readingsResponse.json();
    console.log('Readings data received');

    // Step 4: Transform data into structured sensor objects
    const readingsObject = readingsData.data?.readings || {};

    // Create a map of channel_id to full readings array
    const channelReadingsMap = new Map<number, Array<{ timestamp: string; value: number }>>();
    
    // Readings is an object keyed by channel_id
    Object.entries(readingsObject).forEach(([channelId, readings]: [string, any]) => {
      if (Array.isArray(readings) && readings.length > 0) {
        const parsedReadings = readings.map((r: any) => ({
          timestamp: r.timestamp || r.measured_at || new Date().toISOString(),
          value: parseFloat(r.reading)
        }));
        channelReadingsMap.set(parseInt(channelId), parsedReadings);
      }
    });

    // Fetch calibration offsets and stored channel data
    const { data: storedChannels } = await supabase
      .from('sensor_channels')
      .select('id, stevens_channel_id');
    
    const stevensToDbChannelMap = new Map<number, string>();
    if (storedChannels) {
      storedChannels.forEach((ch: any) => {
        stevensToDbChannelMap.set(ch.stevens_channel_id, ch.id);
      });
    }

    const { data: calibrationOffsets } = await supabase
      .from('sensor_calibration_offsets')
      .select('*');
    
    const offsetsMap = new Map<string, any[]>();
    if (calibrationOffsets) {
      calibrationOffsets.forEach((offset: any) => {
        if (!offsetsMap.has(offset.channel_id)) {
          offsetsMap.set(offset.channel_id, []);
        }
        offsetsMap.get(offset.channel_id)!.push(offset);
      });
    }

    // Helper function to apply calibration offset
    const applyOffset = (value: number, channelDbId: string, timestamp: string): number => {
      const offsets = offsetsMap.get(channelDbId);
      if (!offsets) return value;
      
      const readingTime = new Date(timestamp);
      const activeOffset = offsets.find(offset => {
        const validFrom = new Date(offset.valid_from);
        const validUntil = offset.valid_until ? new Date(offset.valid_until) : null;
        return readingTime >= validFrom && (!validUntil || readingTime <= validUntil);
      });
      
      return activeOffset ? value + activeOffset.offset_value : value;
    };

    // Build structured sensor data with metadata
    const sensors: any[] = [];

    channels.forEach((channel: any) => {
      const readings = channelReadingsMap.get(channel.id);
      if (readings && readings.length > 0) {
        // Get database UUID for this channel
        const channelDbId = stevensToDbChannelMap.get(channel.id);
        
        // Get latest reading for current value
        const latestReading = readings[readings.length - 1];
        
        // Apply calibration offset to current value
        const correctedCurrentValue = channelDbId 
          ? applyOffset(latestReading.value, channelDbId, latestReading.timestamp)
          : latestReading.value;
        
        // Calculate 24hr averages with corrected values
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last24hrReadings = readings
          .filter(r => new Date(r.timestamp) >= twentyFourHoursAgo)
          .map(r => channelDbId ? applyOffset(r.value, channelDbId, r.timestamp) : r.value);
        const mean24hr = last24hrReadings.length > 0
          ? last24hrReadings.reduce((sum, v) => sum + v, 0) / last24hrReadings.length
          : null;
        
        // Apply calibration to all readings
        const correctedReadings = readings.map(r => {
          const correctedValue = channelDbId 
            ? applyOffset(r.value, channelDbId, r.timestamp)
            : r.value;
          return {
            timestamp: r.timestamp,
            value: parseFloat(correctedValue.toFixed(channel.precision))
          };
        });
        
        const sensor = {
          id: channelDbId || `sensor_${channel.id}`,
          name: channel.name,
          unit: channel.unit,
          category: channel.category,
          currentValue: parseFloat(correctedCurrentValue.toFixed(channel.precision)),
          currentTimestamp: latestReading.timestamp,
          mean24hr: mean24hr ? parseFloat(mean24hr.toFixed(channel.precision)) : null,
          readings: correctedReadings
        };

        sensors.push(sensor);
      }
    });

    console.log('Data fetch complete');
    
    // Store data in background (don't block response)
    const storeDataInBackground = async () => {
      try {
        console.log('Storing data in background...');
        const { station, channels: dbChannels } = await storeMetadata(supabase, targetStation, channels);
        
        // Create channel ID map
        const channelIdMap: Map<number, string> = new Map(
          dbChannels.map((c: any) => [c.stevens_channel_id, c.id])
        );
        
        // Store readings
        const readingsCount = await storeReadings(supabase, channelIdMap, readingsObject);
        
        // Log the fetch
        await supabase.from('api_fetch_log').insert({
          station_id: station.id,
          fetch_started_at: new Date().toISOString(),
          fetch_completed_at: new Date().toISOString(),
          status: 'success',
          readings_count: readingsCount
        });
        
        console.log(`Stored ${readingsCount} readings in database`);
      } catch (error) {
        console.error('Error storing data in background:', error);
      }
    };
    
    // Start background task
    storeDataInBackground();
    
    // Generate AI analysis if we have sensor data
    let analysisText = '';
    if (sensors.length > 0) {
      try {
        const analysisPayload = {
          station: {
            name: targetStationName,
            location: 'Mara River, Kenya'
          },
          sensors: sensors.map(s => ({
            name: s.name,
            unit: s.unit,
            current: s.currentValue,
            min: Math.min(...s.readings.map((r: any) => r.value)),
            max: Math.max(...s.readings.map((r: any) => r.value)),
            avg: s.readings.reduce((sum: number, r: any) => sum + r.value, 0) / s.readings.length,
            mean24hr: s.mean24hr,
            trend: s.readings.length > 1 
              ? (s.readings[s.readings.length - 1].value - s.readings[0].value) 
              : 0
          })),
          timeRange: '7 days',
          language: language
        };

        // Check if we have station UUID from cache
        if (cachedData?.station?.id) {
          const { analysis } = await getOrGenerateAnalysis(
            supabase,
            cachedData.station.id,
            language,
            analysisPayload
          );
          analysisText = analysis;
        } else {
          // Fallback to direct call if no station UUID yet
          const analysisResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-river-health`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(analysisPayload)
            }
          );

          if (analysisResponse.ok) {
            const analysisData = await analysisResponse.json();
            analysisText = analysisData.analysis;
          }
        }
        console.log('AI analysis generated successfully');
      } catch (error) {
        console.error('Failed to generate AI analysis:', error);
      }
    }

    if (sensors.length === 0) {
      return new Response(JSON.stringify({ 
        data: {
          station: {
            name: targetStationName,
            id: targetStationId,
            code: 'CF4DF9C92B33'
          },
          sensors: [],
          timestamp: new Date().toISOString(),
          message: 'No data available for the past 7 days. Please check if sensors are active.'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return structured data with station info and sensors
    return new Response(JSON.stringify({ 
      data: {
        station: {
          name: targetStationName,
          id: targetStationId,
          code: 'CF4DF9C92B33'
        },
        sensors,
        timestamp: new Date().toISOString(),
        analysis: analysisText,
        cached: false,
        lastUpdated: new Date().toISOString()
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in fetch-stevens-data function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
