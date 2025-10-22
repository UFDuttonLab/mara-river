import { useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

interface Reading {
  id: string;
  measured_at: string;
  value: number;
}

interface ReadingDataTableProps {
  readings: Reading[];
  unit: string | null;
  onDeleteReading: (readingId: string) => Promise<void>;
}

export const ReadingDataTable = ({ readings, unit, onDeleteReading }: ReadingDataTableProps) => {
  const [selectedReading, setSelectedReading] = useState<{ id: string; value: number; date: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredReadings = readings.filter((reading) => {
    const searchLower = searchTerm.toLowerCase();
    const dateStr = format(new Date(reading.measured_at), "MMM d, yyyy HH:mm").toLowerCase();
    const valueStr = reading.value.toString();
    return dateStr.includes(searchLower) || valueStr.includes(searchLower);
  });

  const handleDeleteClick = (reading: Reading) => {
    setSelectedReading({
      id: reading.id,
      value: reading.value,
      date: format(new Date(reading.measured_at), "MMM d, yyyy HH:mm"),
    });
  };

  const handleConfirmDelete = async () => {
    if (!selectedReading) return;
    
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

  return (
    <>
      <div className="mb-4">
        <Input
          placeholder="Search by date or value..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date & Time</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReadings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No readings found
                </TableCell>
              </TableRow>
            ) : (
              filteredReadings.map((reading) => (
                <TableRow key={reading.id} className="hover:bg-muted/50">
                  <TableCell>{format(new Date(reading.measured_at), "MMM d, yyyy HH:mm")}</TableCell>
                  <TableCell>{reading.value} {unit}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(reading)}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
    </>
  );
};
