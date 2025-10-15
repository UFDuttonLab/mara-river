import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    console.log('Authenticating with Stevens-Connect API...');

    // Authenticate
    const authResponse = await fetch('https://api.stevens-connect.com/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.error('Authentication failed:', errorText);
      throw new Error(`Authentication failed: ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    const token = authData.token;

    console.log('Authentication successful, fetching sensor data...');

    // Fetch all 21 sensor data
    const dataResponse = await fetch('https://api.stevens-connect.com/data/manta', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!dataResponse.ok) {
      const errorText = await dataResponse.text();
      console.error('Data fetch failed:', errorText);
      throw new Error(`Data fetch failed: ${dataResponse.status}`);
    }

    const sensorData = await dataResponse.json();
    console.log('Sensor data fetched successfully');

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
