import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Sensor {
  id: string;
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  category: string;
}

interface Category {
  name: string;
  sensors: Sensor[];
}

interface DashboardData {
  station: {
    name: string;
    id: string;
  };
  sensors: Sensor[];
  categories: Category[];
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

  const renderSensorCard = (sensor: Sensor) => (
    <Card key={sensor.id}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{sensor.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {sensor.value.toFixed(2)} {sensor.unit}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(sensor.timestamp).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );

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
            {data.categories.map((category) => (
              <Card key={category.name}>
                <CardHeader>
                  <CardTitle>{category.name}</CardTitle>
                  <CardDescription>
                    {category.sensors.length} sensor{category.sensors.length > 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {category.sensors.map(renderSensorCard)}
                  </div>
                </CardContent>
              </Card>
            ))}

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
