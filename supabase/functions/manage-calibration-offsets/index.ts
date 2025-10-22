import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OffsetRequest {
  action: 'create' | 'update' | 'delete';
  password: string;
  data?: {
    id?: string;
    channel_id: string;
    offset_value: number;
    valid_from: string;
    valid_until?: string | null;
    reason: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, password, data }: OffsetRequest = await req.json();

    console.log('Calibration offset request:', { action, hasData: !!data });

    // Validate password
    const CALIBRATION_PASSWORD = Deno.env.get('CALIBRATION_PASSWORD');
    if (!CALIBRATION_PASSWORD || password !== CALIBRATION_PASSWORD) {
      console.error('Invalid password attempt');
      return new Response(
        JSON.stringify({ error: 'Invalid password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let result;

    switch (action) {
      case 'create': {
        if (!data) {
          throw new Error('Data required for create action');
        }

        // Validate no overlapping periods for the same channel
        const { data: existing, error: checkError } = await supabase
          .from('sensor_calibration_offsets')
          .select('*')
          .eq('channel_id', data.channel_id)
          .or(`valid_until.is.null,valid_until.gte.${data.valid_from}`)
          .lte('valid_from', data.valid_until || '9999-12-31');

        if (checkError) {
          console.error('Error checking overlaps:', checkError);
          throw checkError;
        }

        if (existing && existing.length > 0) {
          return new Response(
            JSON.stringify({ error: 'Overlapping offset period exists for this sensor' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create new offset
        const { data: created, error: createError } = await supabase
          .from('sensor_calibration_offsets')
          .insert({
            channel_id: data.channel_id,
            offset_value: data.offset_value,
            valid_from: data.valid_from,
            valid_until: data.valid_until,
            reason: data.reason,
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating offset:', createError);
          throw createError;
        }

        console.log('Created offset:', created.id);
        result = created;
        break;
      }

      case 'update': {
        if (!data || !data.id) {
          throw new Error('Data with ID required for update action');
        }

        const { data: updated, error: updateError } = await supabase
          .from('sensor_calibration_offsets')
          .update({
            offset_value: data.offset_value,
            valid_from: data.valid_from,
            valid_until: data.valid_until,
            reason: data.reason,
          })
          .eq('id', data.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating offset:', updateError);
          throw updateError;
        }

        console.log('Updated offset:', updated.id);
        result = updated;
        break;
      }

      case 'delete': {
        if (!data || !data.id) {
          throw new Error('ID required for delete action');
        }

        const { error: deleteError } = await supabase
          .from('sensor_calibration_offsets')
          .delete()
          .eq('id', data.id);

        if (deleteError) {
          console.error('Error deleting offset:', deleteError);
          throw deleteError;
        }

        console.log('Deleted offset:', data.id);
        result = { success: true, id: data.id };
        break;
      }

      default:
        throw new Error('Invalid action');
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in manage-calibration-offsets:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
