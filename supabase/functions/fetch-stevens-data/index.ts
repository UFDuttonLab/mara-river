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
    
    // Extract channel IDs from widget profiles
    const widgetProfiles = project.other_widget_profiles || [];
    const channelIdsSet = new Set<number>();
    const channelMap = new Map<number, any>(); // Store channel details for later mapping

    console.log(`Found ${widgetProfiles.length} widget profiles`);

    widgetProfiles.forEach((profile: any) => {
      const widgets = profile.widgets || [];
      widgets.forEach((widget: any) => {
        const widgetChannels = widget.widget_channels || [];
        widgetChannels.forEach((wc: any) => {
          if (wc.channel_id) {
            channelIdsSet.add(wc.channel_id);
            // Store channel info for mapping later
            if (!channelMap.has(wc.channel_id)) {
              channelMap.set(wc.channel_id, {
                id: wc.channel_id,
                widgetTitle: widget.chart_title
              });
            }
          }
        });
      });
    });

    const channelIds = Array.from(channelIdsSet);
    const channels = Array.from(channelMap.values());

    if (channelIds.length === 0) {
      throw new Error('No channels found in widget profiles');
    }

    console.log(`Found ${channelIds.length} unique channels across all widgets`);
    console.log('Channel IDs:', channelIds.slice(0, 10), channelIds.length > 10 ? '...' : '');

    console.log('Step 3: Fetching readings data...');

    // Step 3: Fetch readings for all channels
    const readingsUrl = new URL(`${BASE_URL}/project/${projectId}/readings`);
    channelIds.forEach((id: number) => readingsUrl.searchParams.append('channel_id', id.toString()));
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

    // Map channel data to sensor names using widget titles
    channels.forEach((channel: any, index: number) => {
      const widgetTitle = channel.widgetTitle?.toLowerCase() || '';
      const readings = channelReadings[index]?.readings || [];
      
      // Get the latest reading
      const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;
      const value = latestReading?.value ?? null;

      // Map to dashboard field names based on widget titles
      if (widgetTitle.includes('temperature') || widgetTitle.includes('temp')) {
        sensorData.temperature = value;
      } else if (widgetTitle.includes('ph') && !widgetTitle.includes('phyco')) {
        sensorData.ph = value;
      } else if (widgetTitle.includes('depth')) {
        sensorData.depth = value;
      } else if (widgetTitle.includes('conductivity') && !widgetTitle.includes('specific')) {
        sensorData.conductivity = value;
      } else if (widgetTitle.includes('chlorophyll') || widgetTitle.includes('chl')) {
        sensorData.chlorophyll = value;
      } else if (widgetTitle.includes('phycocyanin') || widgetTitle.includes('pc-')) {
        sensorData.phycocyanin = value;
      } else if (widgetTitle.includes('phycoerythrin') || widgetTitle.includes('pe-')) {
        sensorData.phycoerythrin = value;
      } else if (widgetTitle.includes('cdom') || widgetTitle.includes('fdom')) {
        sensorData.cdom = value;
      } else if (widgetTitle.includes('crude') || widgetTitle.includes('oil')) {
        sensorData.crudeOil = value;
      } else if (widgetTitle.includes('optical') || widgetTitle.includes('brightener')) {
        sensorData.opticalBrighteners = value;
      } else if (widgetTitle.includes('turbidity') || widgetTitle.includes('turb')) {
        sensorData.turbidity = value;
      } else if (widgetTitle.includes('dissolved') || widgetTitle.includes('oxygen') || widgetTitle.includes('do')) {
        sensorData.dissolvedOxygen = value;
      } else if (widgetTitle.includes('salinity') || widgetTitle.includes('sal')) {
        sensorData.salinity = value;
      } else if (widgetTitle.includes('tds')) {
        sensorData.tds = value;
      } else if (widgetTitle.includes('specific') && widgetTitle.includes('conductivity')) {
        sensorData.specificConductivity = value;
      } else if (widgetTitle.includes('resistivity') || widgetTitle.includes('resist')) {
        sensorData.resistivity = value;
      } else if (widgetTitle.includes('battery') || widgetTitle.includes('voltage')) {
        sensorData.batteryVoltage = value;
      } else if (widgetTitle.includes('wiper')) {
        sensorData.wiperPosition = value;
      } else if (widgetTitle.includes('latitude') || widgetTitle.includes('lat')) {
        sensorData.latitude = value;
      } else if (widgetTitle.includes('longitude') || widgetTitle.includes('lon')) {
        sensorData.longitude = value;
      } else if (widgetTitle.includes('vertical') || widgetTitle.includes('altitude')) {
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
