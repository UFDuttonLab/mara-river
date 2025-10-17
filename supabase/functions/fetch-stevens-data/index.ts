import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { language = 'english' } = await req.json().catch(() => ({}));
    
    const email = Deno.env.get('STEVENS_EMAIL');
    const password = Deno.env.get('STEVENS_PASSWORD');

    if (!email || !password) {
      throw new Error('Missing Stevens credentials');
    }

    console.log('Step 1: Authenticating with Stevens-Connect API...');

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
    console.log('Config data received:', JSON.stringify(configData, null, 2));

    // Extract project and station info
    const projects = configData.data?.config_packet?.projects || [];
    if (projects.length === 0) {
      throw new Error('No projects found in config packet');
    }

    const project = projects[0];
    const projectId = project.id;
    
    // Find the specific station "Mara River Purungat Bridge"
    // Note: CF4DF9C92B33 is the station identifier but not returned in config packet
    const TARGET_STATION_NAME = 'Mara River Purungat Bridge';
    const allStations = project.stations || [];
    const targetStation = allStations.find((s: any) => 
      s.name === TARGET_STATION_NAME
    );
    
    if (!targetStation) {
      console.log('Available stations:', allStations.map((s: any) => ({ id: s.id, name: s.name, code: s.code })));
      throw new Error(`Station "${TARGET_STATION_NAME}" not found in project`);
    }
    
    const targetStationId = targetStation.id;
    const targetStationName = targetStation.name;
    console.log(`Found target station: ${targetStationName} (ID: ${targetStationId}, Code: CF4DF9C92B33)`);
    
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
          sensor_name: sensor.name, // e.g., "M20"
          sensor_status: sensor.status
        });
      });
    });

    console.log(`Found ${stationChannels.length} total channels across all sensors`);
    console.log('Sample channels:', stationChannels.slice(0, 5).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      sensor: ch.sensor_name,
      unit_id: ch.unit_id,
      status: ch.sensor_status
    })));

    // Filter for active sensors only
    const activeChannels = stationChannels.filter((ch: any) => ch.sensor_status === 1);
    console.log(`Active channels: ${activeChannels.length}`);

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
        name: ch.name, // e.g., "Cable Power (V)", "SC (uS)"
        sensorName: ch.sensor_name || 'Unknown Sensor', // e.g., "M20"
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
    console.log('Channel IDs:', channelIds.slice(0, 10), channelIds.length > 10 ? '...' : '');

    console.log('Step 3: Fetching readings data...');

    // Step 3: Fetch readings for all channels
    const readingsUrl = new URL(`${BASE_URL}/project/${projectId}/readings/v3/channels`);
    readingsUrl.searchParams.append('channel_ids', channelIds.join(','));
    readingsUrl.searchParams.append('range_type', 'relative');
    readingsUrl.searchParams.append('start_date', 'null');
    readingsUrl.searchParams.append('end_date', 'null');
    readingsUrl.searchParams.append('minutes', '10080'); // 7 days to increase chances of finding data
    readingsUrl.searchParams.append('transformation', 'none');
    
    console.log('Requesting readings from:', readingsUrl.toString());

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
    console.log('Full readings response structure:', JSON.stringify(readingsData, null, 2).substring(0, 2000));

    // Step 4: Transform data into structured sensor objects
    const readingsObject = readingsData.data?.readings || {};
    
    console.log('Readings object keys:', Object.keys(readingsObject));
    console.log('Channels array length:', channels.length);

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
        console.log(`Channel ${channelId}: ${parsedReadings[parsedReadings.length - 1].value} (from ${readings.length} readings)`);
      }
    });

    console.log('Channel reading map size:', channelReadingsMap.size);

    // Build structured sensor data with metadata
    const sensors: any[] = [];
    const sensorsByCategory = new Map<string, any[]>();

    channels.forEach((channel: any) => {
      const readings = channelReadingsMap.get(channel.id);
      if (readings && readings.length > 0) {
        // Get latest reading for current value
        const latestReading = readings[readings.length - 1];
        
        const sensor = {
          id: `sensor_${channel.id}`,
          name: channel.name,
          unit: channel.unit,
          category: channel.category,
          currentValue: parseFloat(latestReading.value.toFixed(channel.precision)),
          currentTimestamp: latestReading.timestamp,
          readings: readings.map(r => ({
            timestamp: r.timestamp,
            value: parseFloat(r.value.toFixed(channel.precision))
          }))
        };

        sensors.push(sensor);
        
        if (!sensorsByCategory.has(channel.category)) {
          sensorsByCategory.set(channel.category, []);
        }
        sensorsByCategory.get(channel.category)!.push(sensor);
      }
    });

    console.log('Transformed sensors:', sensors);
    console.log('Sensors by category:', Array.from(sensorsByCategory.keys()));
    console.log('Data fetch complete');

    // Generate AI analysis if we have sensor data
    let analysisText = '';
    if (sensors.length > 0) {
      try {
        console.log('Generating AI analysis...');
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
            trend: s.readings.length > 1 
              ? (s.readings[s.readings.length - 1].value - s.readings[0].value) 
              : 0
          })),
          timeRange: '7 days',
          language: language // Pass language to analysis function
        };

        // Call analyze-river-health function
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
          if (analysisData.analysis) {
            analysisText = analysisData.analysis;
            console.log('AI analysis generated successfully');
          }
        } else {
          console.error('Analysis function error:', await analysisResponse.text());
        }
      } catch (error) {
        console.error('Failed to generate AI analysis:', error);
        // Continue without analysis rather than failing
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
          categories: [],
          timestamp: new Date().toISOString(),
          message: 'No data available for the past 7 days. Please check if sensors are active.'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return structured data with station info and sensors grouped by category
    return new Response(JSON.stringify({ 
      data: {
        station: {
          name: targetStationName,
          id: targetStationId,
          code: 'CF4DF9C92B33'
        },
        sensors,
        categories: Array.from(sensorsByCategory.entries()).map(([name, sensors]) => ({
          name,
          sensors
        })),
        timestamp: new Date().toISOString(),
        analysis: analysisText // Add AI analysis
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
