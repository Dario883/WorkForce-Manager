import { useMemo, useState } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isToday,
} from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Percent, Plus, ChevronDown, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Toggle } from "@/components/ui/toggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function CalendarWeekly() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showHours, setShowHours] = useState(false);
  const [expandedPersons, setExpandedPersons] = useState<Set<number>>(new Set());
  const [editingAssignment, setEditingAssignment] = useState<{
    personId: number;
    projectId: number;
    currentPercent: number;
    cellDate?: string;
  } | null>(null);
  const [newPercent, setNewPercent] = useState(0);
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<number | null>(null);

  const toggleExpanded = (personId: number) => {
    const newSet = new Set(expandedPersons);
    if (newSet.has(personId)) {
      newSet.delete(personId);
    } else {
      newSet.add(personId);
    }
    setExpandedPersons(newSet);
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  const { data: people, isLoading: loadingPeople } = trpc.people.list.useQuery();
  const { data: snapshot, isLoading: loadingSnapshot } = trpc.staffing.snapshot.useQuery({
    startDate: startStr,
    endDate: endStr,
  });
  const { data: settings } = trpc.settings.all.useQuery();
  const utils = trpc.useUtils();

  const splitAssignmentMutation = trpc.assignments.splitByPeriod.useMutation({
    onSuccess: () => {
      utils.staffing.snapshot.invalidate();
      utils.assignments.list.invalidate();
      utils.people.assignments.invalidate();
      toast.success(`Allocazione aggiornata (${periodType})`);
      setEditingAssignment(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteAssignmentMutation = trpc.assignments.delete.useMutation({
    onSuccess: () => {
      utils.staffing.snapshot.invalidate();
      utils.assignments.list.invalidate();
      utils.people.assignments.invalidate();
      toast.success('Allocazione eliminata');
      setDeletingAssignmentId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const isLoading = loadingPeople || loadingSnapshot;
  const threshold = parseFloat(settings?.underutilization_threshold ?? "80");

  // For each person, for each day, compute allocations
  const grid = useMemo(() => {
    if (!people || !snapshot) return [];
    return people.map(person => {
      const personAssignments = snapshot.assignments.filter(a => a.personId === person.id);
      const dayData = days.map(day => {
        const dayStr = format(day, "yyyy-MM-dd");
        const activeAssignments = personAssignments.filter(a => {
          const aStart = format(new Date(a.assignmentStart), "yyyy-MM-dd");
          const aEnd = format(new Date(a.assignmentEnd), "yyyy-MM-dd");
          return aStart <= dayStr && aEnd >= dayStr;
        });
        const totalPercent = activeAssignments.reduce((sum, a) => sum + parseFloat(String(a.allocationPercent)), 0);
        const projects = activeAssignments.map(a => ({
          project: snapshot.projects.find(p => p.id === a.projectId),
          percent: parseFloat(String(a.allocationPercent)),
          assignmentId: a.id,
        }));
        const capacityHours = parseFloat(String(person.weeklyCapacityHours)) / 5;
        const scheduledHours = (capacityHours * totalPercent) / 100;
        const residualCapacity = capacityHours - scheduledHours;
        return {
          day,
          totalPercent,
          projects,
          scheduledHours,
          residualCapacity,
          isOverallocated: totalPercent > 100,
          isSaturated: totalPercent >= threshold,
        };
      });
      const workDayData = dayData.filter(d => d.day.getDay() !== 0 && d.day.getDay() !== 6);
      const weekTotal = workDayData.reduce((sum, d) => sum + d.scheduledHours, 0);
      const weekPercent = workDayData.length > 0 ? workDayData.reduce((sum, d) => sum + d.totalPercent, 0) / workDayData.length : 0;
      return { person, dayData, weekTotal, weekPercent, personAssignments };
    });
  }, [people, snapshot, days, threshold]);

  const handleSavePercent = () => {
    if (!editingAssignment) return;
    const assignment = snapshot?.assignments.find(
      a => a.personId === editingAssignment.personId && a.projectId === editingAssignment.projectId
    );
    if (assignment) {
      // Per modifica giornaliera usa la data della cella cliccata, altrimenti currentDate
      const dateToUse = periodType === 'daily' && editingAssignment.cellDate
        ? editingAssignment.cellDate
        : format(currentDate, "yyyy-MM-dd");
      splitAssignmentMutation.mutate({
        id: assignment.id,
        newPercent,
        periodType,
        periodDate: dateToUse,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendario Settimanale</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {format(weekStart, "d MMM", { locale: it })} – {format(weekEnd, "d MMMM yyyy", { locale: it })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(subWeeks(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="gap-2">
            <CalendarDays className="h-4 w-4" />
            Oggi
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="border-l border-border/60 pl-2 ml-2 flex items-center gap-1">
            <Toggle
              pressed={!showHours}
              onPressedChange={() => setShowHours(false)}
              size="sm"
              className="gap-1.5"
            >
              <Percent className="h-4 w-4" />
              <span className="text-xs">%</span>
            </Toggle>
            <Toggle
              pressed={showHours}
              onPressedChange={() => setShowHours(true)}
              size="sm"
              className="gap-1.5"
            >
              <Clock className="h-4 w-4" />
              <span className="text-xs">h</span>
            </Toggle>
          </div>
        </div>
      </div>

      {/* Grid */}
      <Card className="card-elegant overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-48">
                  Persona
                </th>
                {days.map(day => (
                  <th
                    key={day.toISOString()}
                    className={`text-center px-2 py-3 text-xs font-semibold uppercase tracking-wider min-w-[90px] ${
                      isToday(day) ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <div>{format(day, "EEE", { locale: it })}</div>
                    <div
                      className={`text-base font-bold mt-0.5 ${
                        isToday(day)
                          ? "h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto"
                          : ""
                      }`}
                    >
                      {format(day, "d")}
                    </div>
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[80px]">
                  Totale
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </td>
                    {days.map((_, j) => (
                      <td key={j} className="px-2 py-3">
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-12 mx-auto" />
                    </td>
                  </tr>
                ))
              ) : grid.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                    Nessuna persona. Aggiungi persone dalla sezione Persone.
                  </td>
                </tr>
              ) : (
                grid.map(({ person, dayData, weekTotal, weekPercent, personAssignments }) => {
                  const initials = person.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
                  const isPersonOverallocated = dayData.some(d => d.isOverallocated);
                  const isExpanded = expandedPersons.has(person.id);
                  const hasProjects = personAssignments.length > 0;
                  return (
                    <>
                    <tr
                      key={person.id}
                      className={`border-b border-border/40 hover:bg-muted/20 transition-elegant ${
                        isPersonOverallocated ? "bg-rose-50/50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {hasProjects && (
                            <button
                              onClick={() => toggleExpanded(person.id)}
                              className="p-1 hover:bg-muted rounded transition-colors"
                              title={isExpanded ? "Nascondi progetti" : "Mostra progetti"}
                            >
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            </button>
                          )}
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${
                              isPersonOverallocated ? "ring-2 ring-rose-400" : ""
                            }`}
                            style={{ backgroundColor: person.avatarColor ?? "#6366f1" }}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{person.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{person.role}</p>
                          </div>
                        </div>
                      </td>
                      {dayData.map(({ day, totalPercent, projects, scheduledHours, residualCapacity, isOverallocated, isSaturated }) => {
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        const color = isOverallocated
                          ? "bg-rose-100 border-rose-200"
                          : isSaturated
                            ? "bg-emerald-50 border-emerald-200"
                            : totalPercent > 0
                              ? "bg-amber-50 border-amber-200"
                              : "";
                        return (
                          <td
                            key={day.toISOString()}
                            className={`px-2 py-3 ${isWeekend ? "bg-muted/30" : ""}`}
                          >
                            {totalPercent > 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => {
                                      if (projects.length > 0) {
                                        setEditingAssignment({
                                          personId: person.id,
                                          projectId: projects[0].project?.id ?? 0,
                                          currentPercent: projects[0].percent,
                                          cellDate: format(day, "yyyy-MM-dd"),
                                        });
                                        setNewPercent(projects[0].percent);
                                      }
                                    }}
                                    className={`rounded-lg border px-2 py-1.5 cursor-pointer w-full transition-all hover:shadow-md ${color} group`}
                                  >
                                    <div className="text-center">
                                      <p className="text-xs font-semibold">
                                        {showHours ? `${scheduledHours.toFixed(1)}h` : `${Math.round(totalPercent)}%`}
                                      </p>
                                      {!showHours && (
                                        <p className="text-xs text-muted-foreground">{scheduledHours.toFixed(1)}h</p>
                                      )}
                                    </div>
                                    {/* Project color bars */}
                                    <div className="flex gap-0.5 mt-1.5 justify-center">
                                      {projects.map(({ project, percent }, idx) => (
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
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <div className="space-y-1.5">
                                    <p className="font-semibold text-xs">{format(day, "EEEE d MMMM", { locale: it })}</p>
                                    {projects.map(({ project, percent }, idx) => (
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
                                      <div>Allocazione: {Math.round(totalPercent)}%</div>
                                      <div>Ore: {scheduledHours.toFixed(1)}h</div>
                                      <div className={residualCapacity < 0 ? "text-rose-600" : "text-emerald-600"}>
                                        Capacità residua: {residualCapacity.toFixed(1)}h
                                      </div>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <div className={`rounded-lg h-[52px] ${isWeekend ? "" : "border border-dashed border-border/40"}`} />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <p className={`text-sm font-semibold ${isPersonOverallocated ? "text-rose-600" : ""}`}>
                          {weekTotal.toFixed(0)}h
                        </p>
                        <p className={`text-xs ${isPersonOverallocated ? "text-rose-600 font-semibold" : "text-muted-foreground"}`}>
                          {Math.round(weekPercent)}%
                        </p>
                      </td>
                    </tr>
                    {isExpanded && hasProjects && personAssignments.map((assignment) => {
                      const project = snapshot?.projects.find(p => p.id === assignment.projectId);
                      return (
                        <tr key={`detail-${assignment.id}`} className="border-b border-border/40 bg-muted/20 hover:bg-muted/30 transition-elegant">
                          <td className="px-4 py-2 pl-12">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: project?.color ?? "#6366f1" }}
                              />
                              <span className="text-sm text-muted-foreground">{project?.name ?? "—"}</span>
                            </div>
                          </td>
                          {dayData.map(({ day }) => {
                            const dayStr = format(day, "yyyy-MM-dd");
                            const aStart = format(new Date(assignment.assignmentStart), "yyyy-MM-dd");
                            const aEnd = format(new Date(assignment.assignmentEnd), "yyyy-MM-dd");
                            const isActive = aStart <= dayStr && aEnd >= dayStr;
                            return (
                              <td key={day.toISOString()} className="px-2 py-2 text-center">
                                {isActive ? (
                                  <button
                                    onClick={() => {
                                      const percent = parseFloat(String(assignment.allocationPercent));
                                      setEditingAssignment({
                                        personId: person.id,
                                        projectId: assignment.projectId,
                                        currentPercent: percent,
                                        cellDate: format(day, "yyyy-MM-dd"),
                                      });
                                      setNewPercent(percent);
                                    }}
                                    className="text-xs font-medium cursor-pointer hover:bg-muted/40 rounded px-1.5 py-0.5 transition-colors"
                                  >
                                    {assignment.allocationPercent}%
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => {
                                const percent = parseFloat(String(assignment.allocationPercent));
                                setEditingAssignment({
                                  personId: person.id,
                                  projectId: assignment.projectId,
                                  currentPercent: percent,
                                });
                                setNewPercent(percent);
                                setPeriodType('weekly');
                              }}
                              className="text-xs font-medium cursor-pointer hover:bg-muted/40 rounded px-1.5 py-0.5 transition-colors"
                            >
                              {assignment.allocationPercent}%
                            </button>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => setDeletingAssignmentId(assignment.id)}
                              className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                              title="Elimina allocazione"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                          </td>
                        </tr>
                      );
                    })}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-amber-200 border border-amber-300" />
          Sotto-allocato (&lt;{threshold}%)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-emerald-100 border border-emerald-200" />
          Allocato ({threshold}–100%)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-rose-100 border border-rose-200" />
          Sovra-allocato (&gt;100%)
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingAssignment} onOpenChange={v => !v && setEditingAssignment(null)}>
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
                  value={newPercent}
                  onChange={e => setNewPercent(parseFloat(e.target.value) || 0)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    newPercent > 100 ? "bg-rose-500" : newPercent >= 80 ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${Math.min(newPercent, 100)}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Applica a</Label>
              <div className="flex gap-4">
                <label className={`flex items-center gap-2 ${editingAssignment?.cellDate ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                  <input
                    type="radio"
                    name="period"
                    value="daily"
                    checked={periodType === 'daily'}
                    onChange={() => setPeriodType('daily')}
                    disabled={!editingAssignment?.cellDate}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Giorno</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="period"
                    value="weekly"
                    checked={periodType === 'weekly'}
                    onChange={() => setPeriodType('weekly')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Settimana</span>
                </label>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setEditingAssignment(null)}>
                Annulla
              </Button>
              <Button onClick={handleSavePercent} disabled={splitAssignmentMutation.isPending}>
                {splitAssignmentMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingAssignmentId !== null} onOpenChange={v => !v && setDeletingAssignmentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina allocazione</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione eliminerà l'allocazione. Non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deletingAssignmentId) {
                  deleteAssignmentMutation.mutate({ id: deletingAssignmentId });
                }
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
