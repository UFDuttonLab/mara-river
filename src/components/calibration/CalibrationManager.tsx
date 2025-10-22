import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PasswordDialog } from "./PasswordDialog";
import { SensorSelector } from "./SensorSelector";
import { FullHistoryChart } from "./FullHistoryChart";
import { OffsetCreationForm } from "./OffsetCreationForm";
import { OffsetManagementTable } from "./OffsetManagementTable";

interface Sensor {
  id: string;
  channel_name: string;
  sensor_name: string | null;
  unit: string | null;
}

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
  created_at: string;
}

interface CalibrationManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalibrationManager = ({ isOpen, onClose }: CalibrationManagerProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [offsets, setOffsets] = useState<CalibrationOffset[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const selectedSensor = sensors.find((s) => s.id === selectedSensorId);

  // Fetch sensors on mount
  useEffect(() => {
    fetchSensors();
  }, []);

  // Fetch readings and offsets when sensor changes
  useEffect(() => {
    if (selectedSensorId && isAuthenticated) {
      fetchReadings(selectedSensorId);
      fetchOffsets(selectedSensorId);
    }
  }, [selectedSensorId, isAuthenticated]);

  const fetchSensors = async () => {
    try {
      const { data, error } = await supabase
        .from("sensor_channels")
        .select("id, channel_name, sensor_name, unit")
        .eq("is_active", true)
        .order("channel_name");

      if (error) throw error;
      setSensors(data || []);
    } catch (error) {
      console.error("Error fetching sensors:", error);
      toast.error("Failed to load sensors");
    }
  };

  const fetchReadings = async (channelId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("sensor_readings")
        .select("measured_at, value")
        .eq("channel_id", channelId)
        .order("measured_at", { ascending: true });

      if (error) throw error;
      setReadings(data || []);
    } catch (error) {
      console.error("Error fetching readings:", error);
      toast.error("Failed to load historical data");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOffsets = async (channelId: string) => {
    try {
      const { data, error } = await supabase
        .from("sensor_calibration_offsets")
        .select("*")
        .eq("channel_id", channelId)
        .order("valid_from", { ascending: false });

      if (error) throw error;
      setOffsets(data || []);
    } catch (error) {
      console.error("Error fetching offsets:", error);
      toast.error("Failed to load calibration offsets");
    }
  };

  const handleAuthenticate = (inputPassword: string) => {
    setPassword(inputPassword);
    setIsAuthenticated(true);
    toast.success("Authentication successful");
  };

  const callEdgeFunction = async (action: string, data?: any) => {
    try {
      const { data: result, error } = await supabase.functions.invoke("manage-calibration-offsets", {
        body: { action, password, data },
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error || "Operation failed");
      
      return result;
    } catch (error: any) {
      console.error("Edge function error:", error);
      if (error.message?.includes("Invalid password")) {
        setIsAuthenticated(false);
        setPassword("");
        toast.error("Authentication expired. Please log in again.");
      }
      throw error;
    }
  };

  const handleCreateOffset = async (offsetData: any) => {
    try {
      await callEdgeFunction("create", offsetData);
      toast.success("Calibration offset created successfully");
      if (selectedSensorId) {
        await fetchOffsets(selectedSensorId);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create offset");
      throw error;
    }
  };

  const handleDeleteOffset = async (id: string) => {
    try {
      await callEdgeFunction("delete", { id });
      toast.success("Calibration offset deleted");
      if (selectedSensorId) {
        await fetchOffsets(selectedSensorId);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete offset");
    }
  };

  const handleDeactivateOffset = async (id: string) => {
    try {
      const offset = offsets.find((o) => o.id === id);
      if (!offset || !selectedSensorId) return;

      await callEdgeFunction("update", {
        id,
        channel_id: selectedSensorId,
        offset_value: offset.offset_value,
        valid_from: offset.valid_from,
        valid_until: new Date().toISOString(),
        reason: offset.reason,
      });
      
      toast.success("Calibration offset deactivated");
      if (selectedSensorId) {
        await fetchOffsets(selectedSensorId);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to deactivate offset");
    }
  };

  const handleClose = () => {
    setIsAuthenticated(false);
    setPassword("");
    setSelectedSensorId(null);
    setReadings([]);
    setOffsets([]);
    onClose();
  };

  return (
    <>
      <PasswordDialog
        open={isOpen && !isAuthenticated}
        onOpenChange={handleClose}
        onAuthenticate={handleAuthenticate}
      />

      {isOpen && isAuthenticated && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="container mx-auto p-6 space-y-6 min-h-screen">
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold">Calibration Offset Manager</h1>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground"
              >
                Close ✕
              </button>
            </div>

            <SensorSelector
              sensors={sensors}
              selectedSensorId={selectedSensorId}
              onSensorChange={setSelectedSensorId}
            />

            {selectedSensorId && selectedSensor && (
              <>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    <FullHistoryChart
                      sensorName={selectedSensor.channel_name}
                      unit={selectedSensor.unit}
                      readings={readings}
                      offsets={offsets}
                    />

                    <OffsetCreationForm
                      sensorId={selectedSensorId}
                      sensorName={selectedSensor.channel_name}
                      onCreateOffset={handleCreateOffset}
                    />

                    <OffsetManagementTable
                      offsets={offsets}
                      onDeleteOffset={handleDeleteOffset}
                      onDeactivateOffset={handleDeactivateOffset}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
