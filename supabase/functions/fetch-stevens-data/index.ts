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
    const stations = project.stations || [];
    
    if (stations.length === 0) {
      throw new Error('No stations found in project');
    }

    // Log all available stations for debugging
    console.log(`Found ${stations.length} stations in project`);
    stations.forEach((s: any, index: number) => {
      console.log(`Station ${index + 1}: "${s.name}" - ${s.channels?.length || 0} channels`);
    });

    // Find station with the most channels (likely the Manta sensor)
    const mantaStation = stations.reduce((best: any, current: any) => {
      const currentChannels = current.channels?.length || 0;
      const bestChannels = best?.channels?.length || 0;
      return currentChannels > bestChannels ? current : best;
    }, null);

    if (!mantaStation || !mantaStation.channels || mantaStation.channels.length === 0) {
      throw new Error(
        `No station with channels found. Available stations: ${stations.map((s: any) => 
          `"${s.name}" (${s.channels?.length || 0} channels)`
        ).join(', ')}`
      );
    }

    const channels = mantaStation.channels;
    const channelIds = channels.map((ch: any) => ch.id);

    console.log(`Selected station: "${mantaStation.name}" with ${channelIds.length} channels`);
    console.log('Channel IDs:', channelIds);

    console.log('Step 3: Fetching readings data...');

    // Step 3: Fetch readings for all channels
    const readingsUrl = new URL(`${BASE_URL}/project/${projectId}/readings`);
    channelIds.forEach((id: string) => readingsUrl.searchParams.append('channel_id', id));
    readingsUrl.searchParams.append('relative', '60'); // Last 60 minutes
    readingsUrl.searchParams.append('relative_unit', 'minutes');

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

    // Step 4: Transform data to match dashboard structure
    const sensorData: Record<string, number | null> = {};
    const channelReadings = readingsData.data?.channels || [];

    // Map channel data to sensor names
    channels.forEach((channel: any, index: number) => {
      const channelName = channel.name?.toLowerCase().replace(/\s+/g, '_');
      const readings = channelReadings[index]?.readings || [];
      
      // Get the latest reading
      const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;
      const value = latestReading?.value ?? null;

      // Map to dashboard field names
      if (channelName?.includes('temperature') || channelName?.includes('temp')) {
        sensorData.temperature = value;
      } else if (channelName?.includes('ph')) {
        sensorData.ph = value;
      } else if (channelName?.includes('depth')) {
        sensorData.depth = value;
      } else if (channelName?.includes('conductivity') && !channelName?.includes('specific')) {
        sensorData.conductivity = value;
      } else if (channelName?.includes('chlorophyll') || channelName?.includes('chl')) {
        sensorData.chlorophyll = value;
      } else if (channelName?.includes('phycocyanin') || channelName?.includes('pc')) {
        sensorData.phycocyanin = value;
      } else if (channelName?.includes('phycoerythrin') || channelName?.includes('pe')) {
        sensorData.phycoerythrin = value;
      } else if (channelName?.includes('cdom') || channelName?.includes('fdom')) {
        sensorData.cdom = value;
      } else if (channelName?.includes('crude') || channelName?.includes('oil')) {
        sensorData.crudeOil = value;
      } else if (channelName?.includes('optical') || channelName?.includes('brightener')) {
        sensorData.opticalBrighteners = value;
      } else if (channelName?.includes('turbidity') || channelName?.includes('turb')) {
        sensorData.turbidity = value;
      } else if (channelName?.includes('dissolved') || channelName?.includes('do')) {
        sensorData.dissolvedOxygen = value;
      } else if (channelName?.includes('salinity') || channelName?.includes('sal')) {
        sensorData.salinity = value;
      } else if (channelName?.includes('tds')) {
        sensorData.tds = value;
      } else if (channelName?.includes('specific') && channelName?.includes('conductivity')) {
        sensorData.specificConductivity = value;
      } else if (channelName?.includes('resistivity') || channelName?.includes('resist')) {
        sensorData.resistivity = value;
      } else if (channelName?.includes('battery') || channelName?.includes('voltage')) {
        sensorData.batteryVoltage = value;
      } else if (channelName?.includes('wiper')) {
        sensorData.wiperPosition = value;
      } else if (channelName?.includes('latitude') || channelName?.includes('lat')) {
        sensorData.latitude = value;
      } else if (channelName?.includes('longitude') || channelName?.includes('lon')) {
        sensorData.longitude = value;
      } else if (channelName?.includes('vertical') || channelName?.includes('altitude')) {
        sensorData.verticalPosition = value;
      }
    });

    console.log('Transformed sensor data:', sensorData);
    console.log('Data fetch complete');

    return new Response(JSON.stringify({ data: sensorData }), {
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
