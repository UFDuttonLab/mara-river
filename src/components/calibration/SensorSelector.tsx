import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Sensor {
  id: string;
  channel_name: string;
  sensor_name: string | null;
  unit: string | null;
}

interface SensorSelectorProps {
  sensors: Sensor[];
  selectedSensorId: string | null;
  onSensorChange: (sensorId: string) => void;
}

export const SensorSelector = ({ sensors, selectedSensorId, onSensorChange }: SensorSelectorProps) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="sensor-select">Select Sensor Channel</Label>
      <Select value={selectedSensorId || ""} onValueChange={onSensorChange}>
        <SelectTrigger id="sensor-select" className="w-full">
          <SelectValue placeholder="Choose a sensor to manage..." />
        </SelectTrigger>
        <SelectContent>
          {sensors.map((sensor) => (
            <SelectItem key={sensor.id} value={sensor.id}>
              {sensor.channel_name} {sensor.sensor_name ? `(${sensor.sensor_name})` : ""} 
              {sensor.unit ? ` - ${sensor.unit}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
