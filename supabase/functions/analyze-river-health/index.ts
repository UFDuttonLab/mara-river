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

    // Calculate 24hr averages for DO and Temperature
    const doSensor = sensors.find((s: any) => s.name.toLowerCase().includes('do') || s.name.toLowerCase().includes('oxygen'));
    const tempSensor = sensors.find((s: any) => s.name.toLowerCase().includes('temp'));
    
    const mean24hrDO = doSensor?.mean24hr || doSensor?.avg || 0;
    const mean24hrTemp = tempSensor?.mean24hr || tempSensor?.avg || 0;

    // Detect malfunctioning sensors (stuck values)
    const malfunctioningSensors = sensors.filter((s: any) => {
      if (!s.readings || s.readings.length < 10) return false;
      const recentValues = s.readings.slice(-20).map((r: any) => r.value);
      const uniqueValues = new Set(recentValues);
      return uniqueValues.size === 1;
    });
    
    const malfunctionNames = malfunctioningSensors.map((s: any) => s.name).join(', ');

    // Build simple sensor summary (exclude malfunctioning sensors from detailed analysis)
    const workingSensors = sensors.filter((s: any) => !malfunctioningSensors.includes(s));
    const sensorDataText = workingSensors.map((s: any) => 
      `${s.name}: ${s.current.toFixed(2)} ${s.unit}`
    ).join('\n');
    
    const malfunctionNote = malfunctioningSensors.length > 0 
      ? `\n\nNote: ${malfunctionNames} may be malfunctioning.` 
      : '';

    const systemPrompt = `You are a water quality expert. Write in a conversational, human tone - like you're explaining to a friend. No bullet points, no bold headings with **, no formal sections. Just natural paragraphs. ${languageInstructions[language] || languageInstructions.english}`;

    const userPrompt = `Analyze the Mara River water quality from ${station.name}. 

Current readings:
${sensorDataText}

24-hour averages:
- Dissolved Oxygen: ${mean24hrDO.toFixed(2)} mg/L
- Temperature: ${mean24hrTemp.toFixed(2)} °C${malfunctionNote}

Write 3-4 short paragraphs (2-3 sentences each) in a natural, conversational style:

1. Start with how the river is doing overall - is it healthy, stressed, or concerning? Speak plainly.

2. Talk about dissolved oxygen and temperature. What do these levels mean for fish and aquatic life? Keep it simple.

3. Explain the pH and water chemistry. Are these good levels or problematic?

4. Mention flow conditions or any notable patterns you see in the data. End with a brief outlook.

${malfunctioningSensors.length > 0 ? 'If sensors are malfunctioning, mention it very briefly in one sentence - do not analyze their data.' : ''}

Write naturally like a person, not a report. No bullet points. No headings. Just clear, conversational paragraphs. ${languageInstructions[language] || languageInstructions.english}`;

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
