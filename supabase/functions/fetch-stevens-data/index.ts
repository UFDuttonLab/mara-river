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
    
    // Step 2.5: Fetch station-specific channels from the dedicated API endpoint
    console.log('Step 2.5: Fetching station channels...');
    const channelsUrl = `${BASE_URL}/project/${projectId}/config/channels?station_id=${targetStationId}`;
    const channelsResponse = await fetch(channelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!channelsResponse.ok) {
      const errorText = await channelsResponse.text();
      console.error('Channels fetch failed:', errorText);
      throw new Error(`Channels fetch failed: ${channelsResponse.status}`);
    }

    const channelsData = await channelsResponse.json();
    console.log('Channels data received:', JSON.stringify(channelsData, null, 2).substring(0, 1000));
    
    // Extract station channels (these are the actual sensor data channels)
    const stationChannels = channelsData.data?.channels || [];
    console.log(`Found ${stationChannels.length} station channels`);
    console.log('Sample channels:', stationChannels.slice(0, 5).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      sensor: ch.sensor_name,
      status: ch.status,
      unit: ch.unit
    })));
    
    // Filter for active channels only
    const activeChannels = stationChannels.filter((ch: any) => ch.status === 1);
    console.log(`Active channels: ${activeChannels.length}`);
    
    // Build channel map with proper metadata
    const channelMap = new Map<number, any>();
    activeChannels.forEach((ch: any) => {
      channelMap.set(ch.id, {
        id: ch.id,
        name: ch.name, // e.g., "Cable Power (V)", "SC (uS)"
        sensorName: ch.sensor_name || 'Unknown Sensor', // e.g., "M20"
        unit: ch.unit || '',
        precision: ch.precision || 2,
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

    // Create a map of channel_id to latest reading
    const channelReadingMap = new Map<number, { value: number; timestamp: string }>();
    
    // Readings is an object keyed by channel_id
    Object.entries(readingsObject).forEach(([channelId, readings]: [string, any]) => {
      if (Array.isArray(readings) && readings.length > 0) {
        // Get the latest reading (last item in array)
        const latestReading = readings[readings.length - 1];
        const value = latestReading?.reading ?? null;
        const timestamp = latestReading?.timestamp || latestReading?.measured_at || new Date().toISOString();
        
        if (value !== null) {
          channelReadingMap.set(parseInt(channelId), { value, timestamp });
          console.log(`Channel ${channelId}: ${value} (from ${readings.length} readings)`);
        }
      }
    });

    console.log('Channel reading map size:', channelReadingMap.size);

    // Build structured sensor data with metadata
    const sensors: any[] = [];
    const sensorsByCategory = new Map<string, any[]>();

    channels.forEach((channel: any) => {
      const reading = channelReadingMap.get(channel.id);
      if (reading) {
        const sensorName = channel.name || 'Unknown'; // e.g., "Cable Power (V)"
        const category = channel.category || 'Other'; // e.g., "M20"
        const unit = channel.unit || ''; // Use unit from channel metadata
        const precision = channel.precision || 2;

        const sensor = {
          id: `sensor_${channel.id}`,
          name: sensorName,
          value: parseFloat(reading.value.toFixed(precision)),
          unit,
          timestamp: reading.timestamp,
          category
        };

        sensors.push(sensor);
        
        if (!sensorsByCategory.has(category)) {
          sensorsByCategory.set(category, []);
        }
        sensorsByCategory.get(category)!.push(sensor);
      }
    });

    console.log('Transformed sensors:', sensors);
    console.log('Sensors by category:', Array.from(sensorsByCategory.keys()));
    console.log('Data fetch complete');

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
        timestamp: new Date().toISOString()
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
