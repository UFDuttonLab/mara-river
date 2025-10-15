import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
  message?: string;
}

const Index = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: responseData, error } = await supabase.functions.invoke('fetch-stevens-data');
      
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

  useEffect(() => {
    fetchData();
  }, []);

  const renderSensorChart = (sensor: Sensor) => {
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
            <div className="space-y-4">
              {data.sensors.map(renderSensorChart)}
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
