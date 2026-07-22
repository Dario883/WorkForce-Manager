import { useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  eachWeekOfInterval,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
} from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarRange, Plus, ChevronDown, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AllocationBar } from "@/components/AllocationBar";
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

export default function CalendarMonthly() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedPersons, setExpandedPersons] = useState<Set<number>>(new Set());
  const [editingAssignment, setEditingAssignment] = useState<{ personId: number; projectId: number; currentPercent: number } | null>(null);
  const [newPercent, setNewPercent] = useState(0);
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const splitAssignmentMutation = trpc.assignments.splitByPeriod.useMutation({
    onSuccess: () => {
      utils.staffing.snapshot.invalidate();
      utils.assignments.list.invalidate();
      utils.people.assignments.invalidate();
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

  const handleSavePercent = () => {
    if (!editingAssignment) return;
    const assignment = snapshot?.assignments.find(
      a => a.personId === editingAssignment.personId && a.projectId === editingAssignment.projectId
    );
    if (assignment) {
      splitAssignmentMutation.mutate({
        id: assignment.id,
        newPercent,
        periodType,
        periodDate: format(currentDate, "yyyy-MM-dd"),
      });
    }
  };

  const toggleExpanded = (personId: number) => {
    const newSet = new Set(expandedPersons);
    if (newSet.has(personId)) {
      newSet.delete(personId);
    } else {
      newSet.add(personId);
    }
    setExpandedPersons(newSet);
  };
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const startStr = format(monthStart, "yyyy-MM-dd");
  const endStr = format(monthEnd, "yyyy-MM-dd");

  const { data: people, isLoading: loadingPeople } = trpc.people.list.useQuery();
  const { data: snapshot, isLoading: loadingSnapshot } = trpc.staffing.snapshot.useQuery({
    startDate: startStr,
    endDate: endStr,
  });
  const { data: settings } = trpc.settings.all.useQuery();
  const threshold = parseFloat(settings?.underutilization_threshold ?? "80");

  const isLoading = loadingPeople || loadingSnapshot;

  // Build weeks of the month
  const weeks = useMemo(() => {
    const weekStarts = eachWeekOfInterval(
      { start: monthStart, end: monthEnd },
      { weekStartsOn: 1 }
    );
    return weekStarts.map(ws => {
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const clampedStart = ws < monthStart ? monthStart : ws;
      const clampedEnd = we > monthEnd ? monthEnd : we;
      return {
        weekStart: ws,
        weekEnd: we,
        label: `${format(clampedStart, "d")}–${format(clampedEnd, "d MMM", { locale: it })}`,
        days: eachDayOfInterval({ start: clampedStart, end: clampedEnd }).filter(d => d.getDay() !== 0 && d.getDay() !== 6),
      };
    });
  }, [currentDate]);

  // For each person, for each week, compute average allocation
  const grid = useMemo(() => {
    if (!people || !snapshot) return [];
    return people.map(person => {
      const personAssignments = snapshot.assignments.filter(a => a.personId === person.id);
      const weekData = weeks.map(week => {
        const workDays = week.days;
        let totalPercent = 0;
        let totalHours = 0;
        const projectMap: Record<number, { project: any; totalPercent: number }> = {};

        workDays.forEach(day => {
          const dayStr = format(day, "yyyy-MM-dd");
          const activeAssignments = personAssignments.filter(a => {
            const aStart = format(new Date(a.assignmentStart), "yyyy-MM-dd");
            const aEnd = format(new Date(a.assignmentEnd), "yyyy-MM-dd");
            return aStart <= dayStr && aEnd >= dayStr;
          });
          const dayPercent = activeAssignments.reduce((sum, a) => sum + parseFloat(String(a.allocationPercent)), 0);
          totalPercent += dayPercent;
          const capacityPerDay = parseFloat(String(person.weeklyCapacityHours)) / 5;
          totalHours += (capacityPerDay * dayPercent) / 100;

          activeAssignments.forEach(a => {
            const proj = snapshot.projects.find(p => p.id === a.projectId);
            if (!projectMap[a.projectId]) {
              projectMap[a.projectId] = { project: proj, totalPercent: 0 };
            }
            projectMap[a.projectId].totalPercent += parseFloat(String(a.allocationPercent));
          });
        });

        const avgPercent = workDays.length > 0 ? totalPercent / workDays.length : 0;
        const projects = Object.values(projectMap).map(pm => ({
          ...pm,
          avgPercent: workDays.length > 0 ? pm.totalPercent / workDays.length : 0,
        }));

        return { week, avgPercent, totalHours, projects };
      });

      const monthAvgPercent = weekData.reduce((sum, w) => sum + w.avgPercent, 0) / (weekData.length || 1);
      const monthTotalHours = weekData.reduce((sum, w) => sum + w.totalHours, 0);

      return { person, weekData, monthAvgPercent, monthTotalHours, personAssignments };
    });
  }, [people, snapshot, weeks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendario Mensile</h1>
          <p className="text-muted-foreground text-sm mt-1 capitalize">
            {format(currentDate, "MMMM yyyy", { locale: it })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="gap-2">
            <CalendarRange className="h-4 w-4" />
            Questo mese
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <Card className="card-elegant overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-52">
                  Persona
                </th>
                {weeks.map((week, i) => (
                  <th
                    key={i}
                    className="text-center px-2 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[100px]"
                  >
                    <div>Sett. {i + 1}</div>
                    <div className="text-xs font-normal normal-case mt-0.5 text-muted-foreground/70">
                      {week.label}
                    </div>
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]">
                  Media mese
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
                    {weeks.map((_, j) => (
                      <td key={j} className="px-2 py-3">
                        <Skeleton className="h-14 w-full rounded-lg" />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-16 mx-auto" />
                    </td>
                  </tr>
                ))
              ) : grid.length === 0 ? (
                <tr>
                  <td colSpan={weeks.length + 2} className="text-center py-12 text-muted-foreground text-sm">
                    Nessuna persona. Aggiungi persone dalla sezione Persone.
                  </td>
                </tr>
              ) : (
                grid.map(({ person, weekData, monthAvgPercent, monthTotalHours, personAssignments }) => {
                  const initials = person.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
                  const isExpanded = expandedPersons.has(person.id);
                  const hasProjects = personAssignments.length > 0;
                  return (
                    <>
                    <tr key={person.id} className="border-b border-border/40 hover:bg-muted/20 transition-elegant">
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
                            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
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
                      {weekData.map(({ week, avgPercent, totalHours, projects }, wi) => {
                        const color =
                          avgPercent > 100
                            ? "bg-rose-50 border-rose-200"
                            : avgPercent >= threshold
                              ? "bg-emerald-50 border-emerald-200"
                              : avgPercent > 0
                                ? "bg-amber-50 border-amber-200"
                                : "border-dashed border-border/40";
                        return (
                          <td key={wi} className="px-2 py-3">
                            {avgPercent > 0 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className={`rounded-lg border px-2 py-2 cursor-default ${color}`}>
                                    <p className="text-xs font-semibold text-center">{Math.round(avgPercent)}%</p>
                                    <p className="text-xs text-muted-foreground text-center">{totalHours.toFixed(0)}h</p>
                                    <div className="flex gap-0.5 mt-1.5">
                                      {projects.map(({ project, avgPercent: ap }, idx) => (
                                        <Tooltip key={idx}>
                                          <TooltipTrigger asChild>
                                            <div
                                              className="h-1.5 rounded-full cursor-default"
                                              style={{
                                                backgroundColor: project?.color ?? "#6366f1",
                                                flex: ap,
                                              }}
                                            />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {project?.name}: {Math.round(ap)}%
                                          </TooltipContent>
                                        </Tooltip>
                                      ))}
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <div className="space-y-1.5">
                                    <p className="font-semibold text-xs">{week.label}</p>
                                    {projects.map(({ project, avgPercent: ap }, idx) => (
                                      <div key={idx} className="flex items-center gap-2 text-xs">
                                        <div
                                          className="h-2 w-2 rounded-full shrink-0"
                                          style={{ backgroundColor: project?.color ?? "#6366f1" }}
                                        />
                                        <span>{project?.name ?? "—"}</span>
                                        <span className="ml-auto font-medium">{Math.round(ap)}%</span>
                                      </div>
                                    ))}
                                    <div className="border-t pt-1 text-xs font-medium">
                                      Media: {Math.round(avgPercent)}% · {totalHours.toFixed(0)}h
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <div className="rounded-lg border border-dashed border-border/40 h-[66px]" />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3">
                        <div className="space-y-1.5">
                          <AllocationBar percent={monthAvgPercent} threshold={threshold} showLabel />
                          <p className="text-xs text-muted-foreground text-center">{monthTotalHours.toFixed(0)}h totali</p>
                        </div>
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
                          {weekData.map(({ week }) => (
                            <td key={week.label} className="px-2 py-2 text-center">
                              <button
                                onClick={() => {
                                  const percent = parseFloat(String(assignment.allocationPercent));
                                  setEditingAssignment({
                                    personId: person.id,
                                    projectId: assignment.projectId,
                                    currentPercent: percent,
                                  });
                                  setNewPercent(percent);
                                }}
                                className="text-xs font-semibold cursor-pointer hover:bg-primary/10 hover:text-primary rounded px-2 py-1 transition-colors border border-transparent hover:border-primary/30"
                              >
                                {assignment.allocationPercent}%
                              </button>
                            </td>
                          ))}
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
                              }}
                              className="text-xs font-semibold cursor-pointer hover:bg-primary/10 hover:text-primary rounded px-2 py-1 transition-colors border border-transparent hover:border-primary/30"
                            >
                              {assignment.allocationPercent}%
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => setDeletingAssignmentId(assignment.id)}
                              className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                              title="Elimina allocazione"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
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
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-amber-100 border border-amber-200" />
          Sotto-allocato
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-emerald-50 border border-emerald-200" />
          Allocato
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-rose-50 border border-rose-200" />
          Sovra-allocato
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="period"
                    value="monthly"
                    checked={periodType === 'monthly'}
                    onChange={() => setPeriodType('monthly')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Mese</span>
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
