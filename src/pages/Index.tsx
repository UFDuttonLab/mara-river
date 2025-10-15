import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SensorData {
  timestamp: string;
  sensors: {
    temperature?: number;
    ph?: number;
    conductivity?: number;
    salinity?: number;
    tds?: number;
    turbidity?: number;
    chlorophyll?: number;
    blueGreenAlgae?: number;
    rhodamine?: number;
    fluorescein?: number;
    cdom?: number;
    opticalBrighteners?: number;
    tryptophan?: number;
    refinedFuels?: number;
    dissolvedOxygen?: number;
    depth?: number;
    latitude?: number;
    longitude?: number;
    battery?: number;
    signalStrength?: number;
    dataQuality?: number;
  };
}

const Index = () => {
  const [data, setData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: responseData, error } = await supabase.functions.invoke('fetch-stevens-data');
      
      if (error) throw error;
      
      setData(responseData.data);
      toast({
        title: "Data Updated",
        description: "Stevens sensor data fetched successfully",
      });
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

  const renderMetricCard = (title: string, value: number | undefined, unit: string) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value !== undefined ? `${value.toFixed(2)} ${unit}` : 'N/A'}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">Stevens Manta Dashboard</h1>
            <p className="text-muted-foreground">Real-time water quality monitoring</p>
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

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {renderMetricCard("Temperature", data.sensors.temperature, "°C")}
              {renderMetricCard("pH Level", data.sensors.ph, "")}
              {renderMetricCard("Conductivity", data.sensors.conductivity, "µS/cm")}
              {renderMetricCard("Salinity", data.sensors.salinity, "PSU")}
              {renderMetricCard("TDS", data.sensors.tds, "mg/L")}
              {renderMetricCard("Turbidity", data.sensors.turbidity, "NTU")}
              {renderMetricCard("Chlorophyll", data.sensors.chlorophyll, "µg/L")}
              {renderMetricCard("Blue-Green Algae", data.sensors.blueGreenAlgae, "cells/mL")}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Fluorescence Data</CardTitle>
                <CardDescription>Optical measurements</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {renderMetricCard("Rhodamine", data.sensors.rhodamine, "ppb")}
                  {renderMetricCard("Fluorescein", data.sensors.fluorescein, "ppb")}
                  {renderMetricCard("CDOM", data.sensors.cdom, "ppb")}
                  {renderMetricCard("Optical Brighteners", data.sensors.opticalBrighteners, "ppb")}
                  {renderMetricCard("Tryptophan", data.sensors.tryptophan, "ppb")}
                  {renderMetricCard("Refined Fuels", data.sensors.refinedFuels, "ppb")}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Environmental Data</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {renderMetricCard("Dissolved Oxygen", data.sensors.dissolvedOxygen, "mg/L")}
                  {renderMetricCard("Depth", data.sensors.depth, "m")}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>System Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {renderMetricCard("Battery", data.sensors.battery, "%")}
                  {renderMetricCard("Signal Strength", data.sensors.signalStrength, "dBm")}
                  {renderMetricCard("Data Quality", data.sensors.dataQuality, "%")}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Location</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderMetricCard("Latitude", data.sensors.latitude, "°")}
                {renderMetricCard("Longitude", data.sensors.longitude, "°")}
              </CardContent>
            </Card>

            <p className="text-sm text-muted-foreground text-center">
              Last updated: {new Date(data.timestamp).toLocaleString()}
            </p>
          </>
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
