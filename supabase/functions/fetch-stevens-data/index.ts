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
    
    // Find the specific station "Mara River Purungat Bridge" with code CF4DF9C92B33
    const TARGET_STATION_CODE = 'CF4DF9C92B33';
    const allStations = project.stations || [];
    const targetStation = allStations.find((s: any) => 
      s.code === TARGET_STATION_CODE || s.public_key === TARGET_STATION_CODE
    );
    
    if (!targetStation) {
      console.log('Available stations:', allStations.map((s: any) => ({ id: s.id, name: s.name, code: s.code })));
      throw new Error(`Station with code ${TARGET_STATION_CODE} not found`);
    }
    
    const targetStationId = targetStation.id;
    const targetStationName = targetStation.name || 'Mara River Purungat Bridge';
    console.log(`Found target station: ${targetStationName} (ID: ${targetStationId})`);
    
    // Extract channel IDs from widget profiles that belong to this station
    const widgetProfiles = project.other_widget_profiles || [];
    const channelIdsSet = new Set<number>();
    const channelMap = new Map<number, any>(); // Store channel details for later mapping

    console.log(`Found ${widgetProfiles.length} widget profiles`);

    widgetProfiles.forEach((profile: any) => {
      // Filter for profiles that match our target station (station_id === 0 means all stations)
      if (profile.station_id === 0 || profile.station_id === targetStationId) {
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
                  widgetTitle: widget.chart_title,
                  category: profile.name || 'Other'
                });
              }
            }
          });
        });
      }
    });

    const channelIds = Array.from(channelIdsSet);
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
        const widgetTitle = channel.widgetTitle || 'Unknown';
        const category = channel.category || 'Other';
        
        // Determine unit based on title
        let unit = '';
        const titleLower = widgetTitle.toLowerCase();
        if (titleLower.includes('temperature')) unit = '°C';
        else if (titleLower.includes('oxygen') && titleLower.includes('%')) unit = '% sat';
        else if (titleLower.includes('oxygen')) unit = 'mg/L';
        else if (titleLower.includes('ph')) unit = '';
        else if (titleLower.includes('conductivity')) unit = 'µS/cm';
        else if (titleLower.includes('turbidity')) unit = 'NTU';
        else if (titleLower.includes('depth')) unit = 'm';
        else if (titleLower.includes('salinity')) unit = 'PSU';
        else if (titleLower.includes('battery')) unit = 'V';
        else if (titleLower.includes('voltage')) unit = 'V';

        const sensor = {
          id: `sensor_${channel.id}`,
          name: widgetTitle,
          value: reading.value,
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
            id: TARGET_STATION_CODE
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
          id: TARGET_STATION_CODE
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
