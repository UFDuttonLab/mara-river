import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { EAST_AFRICAN_TIMEZONE } from '@/lib/timezoneConfig';

interface OffsetCreationFormProps {
  sensorId: string;
  sensorName: string;
  onCreateOffset: (offsetData: {
    channel_id: string;
    offset_value: number;
    valid_from: string;
    valid_until: string | null;
    reason: string;
  }) => Promise<void>;
}

export const OffsetCreationForm = ({ sensorId, sensorName, onCreateOffset }: OffsetCreationFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [offsetValue, setOffsetValue] = useState("");
  const [validFrom, setValidFrom] = useState(formatInTimeZone(new Date(), EAST_AFRICAN_TIMEZONE, "yyyy-MM-dd'T'HH:mm"));
  const [validUntil, setValidUntil] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!offsetValue || !validFrom || !reason) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Convert EAT datetime input to UTC for storage
      const validFromDate = new Date(validFrom);
      const validFromUTC = toZonedTime(validFromDate, EAST_AFRICAN_TIMEZONE).toISOString();
      
      const validUntilUTC = validUntil 
        ? toZonedTime(new Date(validUntil), EAST_AFRICAN_TIMEZONE).toISOString()
        : null;

      await onCreateOffset({
        channel_id: sensorId,
        offset_value: parseFloat(offsetValue),
        valid_from: validFromUTC,
        valid_until: validUntilUTC,
        reason: reason,
      });
      
      // Reset form
      setOffsetValue("");
      setValidFrom(formatInTimeZone(new Date(), EAST_AFRICAN_TIMEZONE, "yyyy-MM-dd'T'HH:mm"));
      setValidUntil("");
      setReason("");
      setIsOpen(false);
    } catch (error) {
      console.error("Error creating offset:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add New Calibration Offset
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Offset for {sensorName}</CardTitle>
        <CardDescription>
          Apply a calibration correction to a specific time period
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="offset-value">Offset Value *</Label>
              <Input
                id="offset-value"
                type="number"
                step="0.01"
                value={offsetValue}
                onChange={(e) => setOffsetValue(e.target.value)}
                placeholder="e.g., 56.14 or -2.5"
                required
              />
              <p className="text-xs text-muted-foreground">
                Positive or negative number to add to readings
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="valid-from">Start Date/Time *</Label>
              <Input
                id="valid-from"
                type="datetime-local"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="valid-until">End Date/Time (Optional)</Label>
              <Input
                id="valid-until"
                type="datetime-local"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for ongoing correction
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Sensor swap - calibration drift detected"
              rows={3}
              required
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Apply Offset"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
