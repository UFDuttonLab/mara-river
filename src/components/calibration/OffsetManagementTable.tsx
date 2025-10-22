import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, StopCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface CalibrationOffset {
  id: string;
  offset_value: number;
  valid_from: string;
  valid_until: string | null;
  reason: string;
  created_at: string;
}

interface OffsetManagementTableProps {
  offsets: CalibrationOffset[];
  onDeleteOffset: (id: string) => Promise<void>;
  onDeactivateOffset: (id: string) => Promise<void>;
}

export const OffsetManagementTable = ({ offsets, onDeleteOffset, onDeactivateOffset }: OffsetManagementTableProps) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteOffset(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeactivate = async (id: string) => {
    setDeactivatingId(id);
    try {
      await onDeactivateOffset(id);
    } finally {
      setDeactivatingId(null);
    }
  };

  const isActive = (offset: CalibrationOffset) => {
    if (!offset.valid_until) return true;
    return new Date(offset.valid_until) > new Date();
  };

  if (offsets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Existing Offsets</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No calibration offsets found for this sensor.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Existing Offsets ({offsets.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Offset Value</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offsets.map((offset) => {
                const active = isActive(offset);
                return (
                  <TableRow key={offset.id}>
                    <TableCell>
                      <Badge variant={active ? "default" : "secondary"}>
                        {active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {offset.offset_value > 0 ? '+' : ''}{offset.offset_value}
                    </TableCell>
                    <TableCell>
                      {format(new Date(offset.valid_from), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      {offset.valid_until 
                        ? format(new Date(offset.valid_until), "MMM d, yyyy HH:mm")
                        : "Ongoing"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={offset.reason}>
                      {offset.reason}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {active && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={deactivatingId === offset.id}
                              >
                                <StopCircle className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Deactivate Offset?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will set the end date to now, stopping the offset from being applied to future readings.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeactivate(offset.id)}>
                                  Deactivate
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deletingId === offset.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Offset?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this calibration offset. All historical readings will revert to their original values.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(offset.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
