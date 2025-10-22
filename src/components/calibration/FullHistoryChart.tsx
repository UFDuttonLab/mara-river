import { useMemo, useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from "recharts";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface Reading {
  id: string;
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
  onDeleteReading?: (readingId: string) => Promise<void>;
}

export const FullHistoryChart = ({ sensorName, unit, readings, offsets, onDeleteReading }: FullHistoryChartProps) => {
  const [selectedReading, setSelectedReading] = useState<{ id: string; value: number; date: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Initialize date range from readings data
  useEffect(() => {
    if (readings.length > 0) {
      const dates = readings.map(r => new Date(r.measured_at));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      setStartDate(minDate);
      setEndDate(maxDate);
    }
  }, [readings]);

  const chartData = useMemo(() => {
    return readings.map((reading) => ({
      id: reading.id,
      timestamp: new Date(reading.measured_at).getTime(),
      value: reading.value,
      date: format(new Date(reading.measured_at), "MMM d, yyyy HH:mm"),
    }));
  }, [readings]);

  // Filter chart data based on date range
  const filteredChartData = useMemo(() => {
    if (!startDate || !endDate) return chartData;
    
    const startTime = new Date(startDate).setHours(0, 0, 0, 0);
    const endTime = new Date(endDate).setHours(23, 59, 59, 999);
    
    return chartData.filter(item => 
      item.timestamp >= startTime && item.timestamp <= endTime
    );
  }, [chartData, startDate, endDate]);

  const handleResetDateRange = () => {
    if (readings.length > 0) {
      const dates = readings.map(r => new Date(r.measured_at));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      setStartDate(minDate);
      setEndDate(maxDate);
    }
  };

  const handleDotClick = (data: any) => {
    if (onDeleteReading && data) {
      setSelectedReading({
        id: data.id,
        value: data.value,
        date: data.date,
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedReading || !onDeleteReading) return;
    
    setIsDeleting(true);
    try {
      await onDeleteReading(selectedReading.id);
      setSelectedReading(null);
    } catch (error) {
      console.error('Failed to delete reading:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    
    if (!onDeleteReading) {
      return null;
    }

    return (
      <circle
        cx={cx}
        cy={cy}
        r={3}
        fill="hsl(var(--primary))"
        stroke="hsl(var(--background))"
        strokeWidth={1}
        style={{ cursor: 'pointer' }}
        onClick={() => handleDotClick(payload)}
        onMouseEnter={(e) => {
          e.currentTarget.setAttribute('r', '5');
          e.currentTarget.style.fill = 'hsl(var(--primary))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.setAttribute('r', '3');
        }}
      />
    );
  };

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
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Start Date:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "MMM d, yyyy") : <span>Pick start date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">End Date:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "MMM d, yyyy") : <span>Pick end date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <Button variant="secondary" onClick={handleResetDateRange}>
            Reset to Full Range
          </Button>
        </div>

        {startDate && endDate && (
          <p className="text-sm text-muted-foreground mb-4">
            Showing {filteredChartData.length} of {chartData.length} readings from {format(startDate, "MMM d, yyyy")} to {format(endDate, "MMM d, yyyy")}
          </p>
        )}

        <ResponsiveContainer width="100%" height={500}>
          <LineChart data={filteredChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
              dot={<CustomDot />}
              name={`${sensorName} ${unit ? `(${unit})` : ''}`}
            />
          </LineChart>
        </ResponsiveContainer>

        <AlertDialog open={!!selectedReading} onOpenChange={(open) => !open && setSelectedReading(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Sensor Reading</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this reading? This action cannot be undone.
                {selectedReading && (
                  <div className="mt-4 p-3 bg-muted rounded-md space-y-1">
                    <p className="text-sm"><strong>Date:</strong> {selectedReading.date}</p>
                    <p className="text-sm"><strong>Value:</strong> {selectedReading.value} {unit}</p>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};
