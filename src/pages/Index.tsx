import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  mean24hr?: number;
  isMalfunctioning?: boolean;
  malfunctionReason?: string;
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
  cached?: boolean;
  lastUpdated?: string;
}

type Language = 'english' | 'swahili' | 'maa';

const Index = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState<Language>('english');
  const { toast } = useToast();

  const fetchData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const { data: responseData, error } = await supabase.functions.invoke('fetch-stevens-data', {
        body: { language, forceRefresh }
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

  const handleLanguageChange = async (newLanguage: Language) => {
    setLanguage(newLanguage);
    // Trigger immediate data refresh with new language
    setLoading(true);
    try {
      const { data: responseData, error } = await supabase.functions.invoke('fetch-stevens-data', {
        body: { language: newLanguage }
      });
      
      if (error) throw error;
      setData(responseData.data);
      
      toast({
        title: "Language Updated",
        description: `Analysis updated to ${newLanguage === 'english' ? 'English' : newLanguage === 'swahili' ? 'Kiswahili' : 'Maa'}`,
      });
    } catch (error) {
      console.error('Error updating language:', error);
      toast({
        title: "Error",
        description: "Failed to update language",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const detectMalfunction = (sensor: Sensor): { isMalfunctioning: boolean; reason?: string } => {
    if (!sensor.readings || sensor.readings.length < 10) {
      return { isMalfunctioning: false };
    }

    // Check for stuck values (same value for extended period)
    const recentValues = sensor.readings.slice(-20).map(r => r.value);
    const uniqueValues = new Set(recentValues);
    if (uniqueValues.size === 1) {
      return { isMalfunctioning: true, reason: "Sensor reporting constant value (may be stuck)" };
    }

    // Check for unrealistic values
    if (sensor.name.toLowerCase().includes('temp')) {
      if (sensor.currentValue < -10 || sensor.currentValue > 50) {
        return { isMalfunctioning: true, reason: "Temperature reading outside realistic range" };
      }
    }

    // Check for extreme variance (noisy sensor)
    const mean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const variance = recentValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentValues.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > mean * 0.5 && mean > 1) {
      return { isMalfunctioning: true, reason: "Sensor showing erratic readings" };
    }

    return { isMalfunctioning: false };
  };

  const renderSensorChart = (sensor: Sensor) => {
    // Safety check for readings array
    if (!sensor.readings || sensor.readings.length === 0) {
      return null;
    }

    // Check for malfunction
    const malfunction = detectMalfunction(sensor);
    const isMalfunctioning = malfunction.isMalfunctioning;

    // Transform readings for recharts
    const chartData = sensor.readings.map(r => ({
      time: new Date(r.timestamp).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit'
      }),
      value: r.value
    }));

    const chartContent = (
      <>
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
      </>
    );

    if (isMalfunctioning) {
      return (
        <Accordion key={sensor.id} type="single" collapsible className="col-span-full">
          <AccordionItem value={sensor.id} className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3 w-full">
                <Badge variant="destructive" className="shrink-0">⚠️ Malfunction</Badge>
                <div className="flex-1 text-left">
                  <div className="font-semibold">{sensor.name}</div>
                  <div className="text-sm text-muted-foreground">{malfunction.reason}</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card className="border-0 shadow-none">
                {chartContent}
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      );
    }

    return (
      <Card key={sensor.id} className="col-span-full">
        {chartContent}
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

  const renderAnalysis = (analysis: string) => {
    if (!analysis) return null;

    const doSensor = data?.sensors.find(s => s.name.toLowerCase().includes('do'));
    const tempSensor = data?.sensors.find(s => s.name.toLowerCase().includes('temp'));

    const [generalAnalysis, communityImpact] = analysis.split('---COMMUNITY_IMPACT---');

    return (
      <Card className="col-span-full bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-950 dark:to-green-950 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌊</span>
              <CardTitle>River Health Analysis</CardTitle>
            </div>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="english">English</SelectItem>
                <SelectItem value="swahili">Kiswahili</SelectItem>
                <SelectItem value="maa">Maa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CardDescription>
            AI-powered water quality insights
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
            {tempSensor && (
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  Temp
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {tempSensor.currentValue.toFixed(1)} {tempSensor.unit}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="prose prose-sm max-w-none dark:prose-invert leading-relaxed">
            {generalAnalysis.split('\n\n').map((paragraph, idx) => 
              paragraph.trim() && <p key={idx} className="mb-4">{paragraph}</p>
            )}
          </div>

          {communityImpact && communityImpact.trim() && (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="community-impact" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">🐟 Impact on Fish & Bug Communities</span>
                    <Badge variant="outline" className="ml-2">Detailed Analysis</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="prose prose-sm max-w-none dark:prose-invert pt-2 leading-relaxed">
                    {communityImpact.split('\n\n').map((paragraph, idx) => 
                      paragraph.trim() && <p key={idx} className="mb-4">{paragraph}</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
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
          <div className="flex gap-2">
            <Button onClick={() => fetchData(false)} disabled={loading} variant="outline" size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
            <Button onClick={() => fetchData(true)} disabled={loading} variant="outline" size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Force Refresh
            </Button>
          </div>
        </header>

        {data && data.sensors.length > 0 && (
          <>
            {data.cached && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Showing cached data • Last updated: {new Date(data.lastUpdated || data.timestamp).toLocaleString()}
              </div>
            )}
            {data.analysis && renderAnalysis(data.analysis)}
            
            <div className="space-y-4 mt-6">
              {data.sensors
                .filter(sensor => {
                  const lowercaseName = sensor.name.toLowerCase().trim();
                  const excludedSensors = ['ph mv', 'ph - mv', 'depth f', 'depth psig', 'cable power'];
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
