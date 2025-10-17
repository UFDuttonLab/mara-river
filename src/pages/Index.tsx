import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Languages } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

interface Reading {
  timestamp: string;
  value: number;
}

interface Sensor {
  id: string;
  name: string;
  unit: string;
  category: string;
  currentValue: number;
  currentTimestamp: string;
  readings: Reading[];
}

interface DashboardData {
  station: {
    name: string;
    id: string;
  };
  sensors: Sensor[];
  timestamp: string;
  analysis?: string;
  message?: string;
}

interface ReconoxyPhoto {
  storage_url: string;
  scraped_at: string;
}

type Language = 'english' | 'swahili' | 'maa';

const Index = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [latestPhoto, setLatestPhoto] = useState<ReconoxyPhoto | null>(null);
  const [language, setLanguage] = useState<Language>('english');
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: responseData, error } = await supabase.functions.invoke('fetch-stevens-data', {
        body: { language }
      });
      
      if (error) throw error;
      
      setData(responseData.data);
      
      if (responseData.data?.message) {
        toast({
          title: "No Data Available",
          description: responseData.data.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Data Updated",
          description: `${responseData.data.sensors.length} sensors updated successfully`,
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch sensor data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const cycleLanguage = () => {
    const languages: Language[] = ['english', 'swahili', 'maa'];
    const currentIndex = languages.indexOf(language);
    const nextLanguage = languages[(currentIndex + 1) % languages.length];
    setLanguage(nextLanguage);
  };

  const getLanguageDisplay = () => {
    switch(language) {
      case 'english': return 'English';
      case 'swahili': return 'Kiswahili';
      case 'maa': return 'Maa';
    }
  };

  const fetchLatestPhoto = async () => {
    try {
      const { data: photoData, error } = await supabase
        .from('reconyx_photos')
        .select('storage_url, scraped_at')
        .order('scraped_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (photoData && !error) {
        setLatestPhoto(photoData);
      }
    } catch (error) {
      console.error('Error fetching latest photo:', error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchLatestPhoto();

    // Subscribe to new photos
    const channel = supabase
      .channel('reconyx-photos')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reconyx_photos'
        },
        (payload) => {
          setLatestPhoto({
            storage_url: payload.new.storage_url,
            scraped_at: payload.new.scraped_at,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [language]); // Refetch when language changes

  const renderSensorChart = (sensor: Sensor) => {
    // Safety check for readings array
    if (!sensor.readings || sensor.readings.length === 0) {
      return null;
    }

    // Transform readings for recharts
    const chartData = sensor.readings.map(r => ({
      time: new Date(r.timestamp).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit'
      }),
      value: r.value
    }));

    return (
      <Card key={sensor.id} className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{sensor.name}</span>
            <span className="text-2xl font-bold text-primary">
              {sensor.currentValue.toFixed(2)} {sensor.unit}
            </span>
          </CardTitle>
          <CardDescription>
            Last 7 days • Last updated: {new Date(sensor.currentTimestamp).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                label={{ value: sensor.unit, angle: -90, position: 'insideLeft' }}
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                formatter={(value: number) => [`${value.toFixed(2)} ${sensor.unit}`, sensor.name]}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const renderLatestPhoto = () => {
    if (!latestPhoto) return null;

    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-2xl">📷</span>
            Latest River Camera Photo
          </CardTitle>
          <CardDescription>
            Captured: {new Date(latestPhoto.scraped_at).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <img 
            src={latestPhoto.storage_url} 
            alt="Latest river camera photo"
            className="w-full rounded-lg shadow-lg"
          />
        </CardContent>
      </Card>
    );
  };

  const getStatusColor = (metric: string, value: number) => {
    // Status thresholds for different metrics
    if (metric.toLowerCase().includes('do') || metric.toLowerCase().includes('oxygen')) {
      if (value >= 6) return 'bg-green-500';
      if (value >= 4) return 'bg-yellow-500';
      return 'bg-red-500';
    }
    if (metric.toLowerCase().includes('ph')) {
      if (value >= 6.5 && value <= 8.5) return 'bg-green-500';
      if (value >= 6 && value <= 9) return 'bg-yellow-500';
      return 'bg-red-500';
    }
    return 'bg-blue-500';
  };

  const getStatusText = (metric: string, value: number) => {
    if (metric.toLowerCase().includes('do') || metric.toLowerCase().includes('oxygen')) {
      if (value >= 6) return 'Good';
      if (value >= 4) return 'Fair';
      return 'Poor';
    }
    if (metric.toLowerCase().includes('ph')) {
      if (value >= 6.5 && value <= 8.5) return 'Optimal';
      if (value >= 6 && value <= 9) return 'Acceptable';
      return 'Critical';
    }
    return 'Normal';
  };

  const parseAnalysisIntoSections = (analysis: string) => {
    const sections = {
      temperature: '',
      dissolvedOxygen: '',
      flow: '',
      chemistry: '',
      overall: ''
    };

    const lines = analysis.split('\n');
    let currentSection = 'overall';

    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('temperature') || lowerLine.includes('thermal')) {
        currentSection = 'temperature';
      } else if (lowerLine.includes('oxygen') || lowerLine.includes('do ')) {
        currentSection = 'dissolvedOxygen';
      } else if (lowerLine.includes('flow') || lowerLine.includes('discharge')) {
        currentSection = 'flow';
      } else if (lowerLine.includes('ph') || lowerLine.includes('chemistry') || lowerLine.includes('turbidity')) {
        currentSection = 'chemistry';
      }
      
      if (line.trim()) {
        sections[currentSection as keyof typeof sections] += line + '\n';
      }
    });

    return sections;
  };

  const renderAnalysis = (analysis: string) => {
    if (!analysis) return null;

    const sections = parseAnalysisIntoSections(analysis);
    const doSensor = data?.sensors.find(s => s.name.toLowerCase().includes('do'));
    const phSensor = data?.sensors.find(s => s.name.toLowerCase().includes('ph'));

    return (
      <Card className="col-span-full bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-950 dark:to-green-950 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌊</span>
              <CardTitle>River Health Analysis</CardTitle>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={cycleLanguage}
              className="gap-2"
            >
              <Languages className="h-4 w-4" />
              {getLanguageDisplay()}
            </Button>
          </div>
          <CardDescription>
            AI-powered interpretation of this week&apos;s water quality data
          </CardDescription>
          
          {/* Critical Metrics Overview */}
          <div className="flex gap-4 mt-4">
            {doSensor && (
              <div className="flex items-center gap-2">
                <Badge className={`${getStatusColor('do', doSensor.currentValue)} text-white`}>
                  {getStatusText('do', doSensor.currentValue)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  DO: {doSensor.currentValue.toFixed(2)} {doSensor.unit}
                </span>
              </div>
            )}
            {phSensor && (
              <div className="flex items-center gap-2">
                <Badge className={`${getStatusColor('ph', phSensor.currentValue)} text-white`}>
                  {getStatusText('ph', phSensor.currentValue)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  pH: {phSensor.currentValue.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {sections.temperature && (
              <AccordionItem value="temperature">
                <AccordionTrigger className="text-lg font-semibold">
                  🌡️ Temperature
                </AccordionTrigger>
                <AccordionContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {sections.temperature.split('\n').map((line, idx) => 
                      line.trim() && <p key={idx} className="mb-2 leading-relaxed">{line}</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            
            {sections.dissolvedOxygen && (
              <AccordionItem value="oxygen">
                <AccordionTrigger className="text-lg font-semibold">
                  💨 Dissolved Oxygen
                </AccordionTrigger>
                <AccordionContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {sections.dissolvedOxygen.split('\n').map((line, idx) => 
                      line.trim() && <p key={idx} className="mb-2 leading-relaxed">{line}</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            
            {sections.flow && (
              <AccordionItem value="flow">
                <AccordionTrigger className="text-lg font-semibold">
                  🌊 Flow & Discharge
                </AccordionTrigger>
                <AccordionContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {sections.flow.split('\n').map((line, idx) => 
                      line.trim() && <p key={idx} className="mb-2 leading-relaxed">{line}</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            
            {sections.chemistry && (
              <AccordionItem value="chemistry">
                <AccordionTrigger className="text-lg font-semibold">
                  🧪 Chemistry & pH
                </AccordionTrigger>
                <AccordionContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {sections.chemistry.split('\n').map((line, idx) => 
                      line.trim() && <p key={idx} className="mb-2 leading-relaxed">{line}</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
            
            {sections.overall && (
              <AccordionItem value="overall">
                <AccordionTrigger className="text-lg font-semibold">
                  📊 Overall Assessment
                </AccordionTrigger>
                <AccordionContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {sections.overall.split('\n').map((line, idx) => 
                      line.trim() && <p key={idx} className="mb-2 leading-relaxed">{line}</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              {data?.station.name || 'Water Quality Dashboard'}
            </h1>
            <p className="text-muted-foreground">
              {data?.station.id ? `Station ID: ${data.station.id}` : 'Real-time water quality monitoring'}
            </p>
          </div>
          <Button onClick={fetchData} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh Data
          </Button>
        </header>

        {data && data.sensors.length > 0 && (
          <>
            {data.analysis && renderAnalysis(data.analysis)}
            {latestPhoto && renderLatestPhoto()}
            
            <div className="space-y-4 mt-6">
              {data.sensors
                .filter(sensor => {
                  const lowercaseName = sensor.name.toLowerCase().trim();
                  const excludedSensors = ['ph mv', 'depth f', 'depth psig', 'cable power'];
                  return !excludedSensors.some(excluded => 
                    lowercaseName === excluded || lowercaseName.includes(excluded)
                  );
                })
                .map(renderSensorChart)}
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Last updated: {new Date(data.timestamp).toLocaleString()}
            </p>
          </>
        )}

        {data && data.sensors.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-muted-foreground mb-2">{data.message || 'No sensor data available'}</p>
                <p className="text-sm text-muted-foreground">Station: {data.station.name}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!data && !loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No data available. Click refresh to fetch data.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Index;
