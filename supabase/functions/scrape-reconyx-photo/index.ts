import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Reconyx photo scraping...');

    const username = Deno.env.get('RECONYX_USERNAME');
    const password = Deno.env.get('RECONYX_PASSWORD');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!username || !password) {
      throw new Error('Reconyx credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Login to Reconyx Connect
    console.log('Logging in to Reconyx Connect...');
    const loginResponse = await fetch('https://connect.reconyx.com/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: username,
        password: password,
      }),
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const authToken = loginData.token || loginData.access_token;
    
    if (!authToken) {
      throw new Error('No auth token received from login');
    }

    console.log('Login successful, fetching photos...');

    // Step 2: Fetch photos from the account
    const photosResponse = await fetch('https://connect.reconyx.com/api/accounts/1028088/photos?limit=1&sort=newest', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!photosResponse.ok) {
      throw new Error(`Failed to fetch photos: ${photosResponse.status}`);
    }

    const photosData = await photosResponse.json();
    
    if (!photosData.photos || photosData.photos.length === 0) {
      console.log('No photos found');
      return new Response(
        JSON.stringify({ success: false, message: 'No photos available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const latestPhoto = photosData.photos[0];
    const photoUrl = latestPhoto.url || latestPhoto.image_url;
    
    console.log('Latest photo URL:', photoUrl);

    // Step 3: Download the photo
    const photoResponse = await fetch(photoUrl, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (!photoResponse.ok) {
      throw new Error(`Failed to download photo: ${photoResponse.status}`);
    }

    const photoBlob = await photoResponse.blob();
    const photoBuffer = await photoBlob.arrayBuffer();
    const photoSize = photoBuffer.byteLength;

    console.log(`Photo downloaded, size: ${photoSize} bytes`);

    // Step 4: Upload to Supabase Storage
    const timestamp = new Date();
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    const hours = String(timestamp.getHours()).padStart(2, '0');
    const minutes = String(timestamp.getMinutes()).padStart(2, '0');
    const seconds = String(timestamp.getSeconds()).padStart(2, '0');
    
    const storagePath = `${year}/${month}/${day}/${hours}-${minutes}-${seconds}.jpg`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('reconyx-photos')
      .upload(storagePath, photoBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Step 5: Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('reconyx-photos')
      .getPublicUrl(storagePath);

    console.log('Photo uploaded to:', publicUrl);

    // Step 6: Save metadata to database
    const { error: dbError } = await supabase
      .from('reconyx_photos')
      .insert({
        photo_url: photoUrl,
        storage_url: publicUrl,
        scraped_at: timestamp.toISOString(),
        file_size: photoSize,
      });

    if (dbError) {
      console.error('Database insert error:', dbError);
      throw new Error(`Database insert failed: ${dbError.message}`);
    }

    console.log('Photo metadata saved to database');

    return new Response(
      JSON.stringify({
        success: true,
        photo_url: photoUrl,
        storage_url: publicUrl,
        timestamp: timestamp.toISOString(),
        file_size: photoSize,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-reconyx-photo function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
