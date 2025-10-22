import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush, ReferenceArea } from "recharts";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Reading {
  measured_at: string;
  value: number;
}

interface CalibrationOffset {
  id: string;
  offset_value: number;
  valid_from: string;
  valid_until: string | null;
  reason: string;
}

interface FullHistoryChartProps {
  sensorName: string;
  unit: string | null;
  readings: Reading[];
  offsets: CalibrationOffset[];
}

export const FullHistoryChart = ({ sensorName, unit, readings, offsets }: FullHistoryChartProps) => {
  const chartData = useMemo(() => {
    return readings.map((reading) => ({
      timestamp: new Date(reading.measured_at).getTime(),
      value: reading.value,
      date: format(new Date(reading.measured_at), "MMM d, yyyy HH:mm"),
    }));
  }, [readings]);

  const offsetRegions = useMemo(() => {
    return offsets.map((offset) => {
      const startTime = new Date(offset.valid_from).getTime();
      const endTime = offset.valid_until ? new Date(offset.valid_until).getTime() : Date.now();
      return {
        x1: startTime,
        x2: endTime,
        fill: "hsl(var(--primary))",
        fillOpacity: 0.1,
        label: `Offset: ${offset.offset_value > 0 ? '+' : ''}${offset.offset_value}`,
      };
    });
  }, [offsets]);

  if (readings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Historical Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No historical data available for this sensor.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {sensorName} - Full Historical Data
          {offsets.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({offsets.length} offset{offsets.length !== 1 ? 's' : ''} applied)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={500}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis 
              dataKey="timestamp" 
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(timestamp) => format(new Date(timestamp), "MMM yyyy")}
              scale="time"
            />
            <YAxis 
              label={{ value: unit || '', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-popover border border-border p-3 rounded-md shadow-lg">
                      <p className="text-sm font-medium">{payload[0].payload.date}</p>
                      <p className="text-sm text-muted-foreground">
                        Value: {payload[0].value} {unit}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            
            {offsetRegions.map((region, index) => (
              <ReferenceArea
                key={index}
                x1={region.x1}
                x2={region.x2}
                fill={region.fill}
                fillOpacity={region.fillOpacity}
                label={{ value: region.label, position: 'top' }}
              />
            ))}
            
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={false}
              name={`${sensorName} ${unit ? `(${unit})` : ''}`}
            />
            
            <Brush 
              dataKey="timestamp" 
              height={30} 
              stroke="hsl(var(--primary))"
              tickFormatter={(timestamp) => format(new Date(timestamp), "MMM yyyy")}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
