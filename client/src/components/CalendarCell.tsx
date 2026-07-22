import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";

export interface CalendarCellData {
  totalPercent: number;
  scheduledHours: number;
  projects: Array<{ project: any; percent: number }>;
  residualCapacity?: number; // ore rimanenti
  isSaturated?: boolean; // >= 80% (o soglia)
  isOverallocated?: boolean; // > 100%
}

interface CalendarCellProps {
  data: CalendarCellData | null;
  showHours?: boolean;
  isWeekend?: boolean;
  onEditAssignment?: () => void;
  onEditPerson?: () => void;
  onEditProject?: () => void;
  tooltipLabel?: string;
}

export function CalendarCell({
  data,
  showHours = false,
  isWeekend = false,
  onEditAssignment,
  onEditPerson,
  onEditProject,
  tooltipLabel,
}: CalendarCellProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editPercent, setEditPercent] = useState(data?.totalPercent ?? 0);

  if (!data || data.totalPercent === 0) {
    return (
      <div
        className={`rounded-lg h-[52px] ${
          isWeekend ? "" : "border border-dashed border-border/40"
        }`}
      />
    );
  }

  const color =
    data.isOverallocated
      ? "bg-rose-100 border-rose-200"
      : data.isSaturated
        ? "bg-emerald-50 border-emerald-200"
        : "bg-amber-50 border-amber-200";

  const textColor = data.isOverallocated ? "text-rose-700" : "text-foreground";

  const displayValue = showHours
    ? `${data.scheduledHours.toFixed(1)}h`
    : `${Math.round(data.totalPercent)}%`;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onEditAssignment}
            className={`rounded-lg border px-2 py-1.5 cursor-pointer w-full transition-all hover:shadow-md ${color} group`}
          >
            <div className="flex items-center justify-between gap-1">
              <div className="text-center flex-1">
                <p className={`text-xs font-semibold ${textColor}`}>{displayValue}</p>
                {!showHours && (
                  <p className="text-xs text-muted-foreground">{data.scheduledHours.toFixed(1)}h</p>
                )}
              </div>
              {onEditAssignment && (
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </div>

            {/* Project color bars */}
            {data.projects.length > 0 && (
              <div className="flex gap-0.5 mt-1.5 justify-center">
                {data.projects.map(({ project, percent }, idx) => (
                  <div
                    key={idx}
                    className="h-1 rounded-full"
                    style={{
                      backgroundColor: project?.color ?? "#6366f1",
                      width: `${Math.max(percent, 10)}%`,
                      maxWidth: "100%",
                    }}
                  />
                ))}
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1.5">
            {tooltipLabel && <p className="font-semibold text-xs">{tooltipLabel}</p>}
            {data.projects.map(({ project, percent }, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: project?.color ?? "#6366f1" }}
                />
                <span>{project?.name ?? "—"}</span>
                <span className="ml-auto font-medium">{percent}%</span>
              </div>
            ))}
            <div className="border-t pt-1.5 text-xs font-medium space-y-0.5">
              <div>Allocazione: {Math.round(data.totalPercent)}%</div>
              <div>Ore: {data.scheduledHours.toFixed(1)}h</div>
              {data.residualCapacity !== undefined && (
                <div className={data.residualCapacity < 0 ? "text-rose-600" : "text-emerald-600"}>
                  Capacità residua: {data.residualCapacity.toFixed(1)}h
                </div>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica allocazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Percentuale allocazione</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={editPercent}
                  onChange={e => setEditPercent(parseFloat(e.target.value) || 0)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Annulla
              </Button>
              <Button
                onClick={() => {
                  onEditAssignment?.();
                  setEditDialogOpen(false);
                }}
              >
                Salva
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
