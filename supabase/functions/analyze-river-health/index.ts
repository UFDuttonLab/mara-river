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
    const { station, sensors, timeRange, language = 'english' } = await req.json();
    
    if (!sensors || sensors.length === 0) {
      throw new Error('No sensor data provided');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Language-specific instructions
    const languageInstructions: Record<string, string> = {
      english: 'Provide the analysis in English.',
      swahili: 'Provide the entire analysis in Swahili (Kiswahili). Use clear, accessible language suitable for local communities.',
      maa: 'Provide the entire analysis in Maa language. Use clear, accessible language suitable for Maasai communities.'
    };

    // Build comprehensive prompt with sensor data
    const sensorDataText = sensors.map((s: any) => 
      `${s.name}: Current=${s.current.toFixed(2)}${s.unit}, Min=${s.min.toFixed(2)}${s.unit}, Max=${s.max.toFixed(2)}${s.unit}, Avg=${s.avg.toFixed(2)}${s.unit}, Trend=${s.trend > 0 ? '+' : ''}${s.trend.toFixed(2)}${s.unit}`
    ).join('\n');

    const systemPrompt = `You are a water quality expert analyzing data from the Mara River in Kenya, a critical ecosystem supporting wildlife and local communities. Provide a comprehensive yet accessible analysis. ${languageInstructions[language] || languageInstructions.english}`;

    const userPrompt = `Analyze this week's water quality data from ${station.name} and provide insights:

SENSOR DATA (${timeRange}):
${sensorDataText}

Provide analysis in the following format:

**River Health Summary**
[2-3 sentences for general public explaining overall river health status]

**Ecological Impact**
- Temperature effects on fish and invertebrates
- Dissolved oxygen levels and hypoxia risk
- pH suitability for aquatic life

**Flow Conditions**
- Recent flooding or drought indicators
- Water depth trends

**Water Chemistry**
- Conductivity/salinity impacts on aquatic life
- Other chemical indicators

**Anomalies**
- Any unusual readings or concerns
- Sensor performance notes

Keep explanations accessible but scientifically accurate. Focus on ecological implications. ${languageInstructions[language] || languageInstructions.english}`;

    console.log('Calling Lovable AI for river analysis...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1500
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content;

    if (!analysis) {
      throw new Error('No analysis generated');
    }

    console.log('Analysis generated successfully');

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-river-health function:', error);
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
