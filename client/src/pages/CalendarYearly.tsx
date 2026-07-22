import { useMemo, useState } from "react";
import {
  format,
  startOfYear,
  endOfYear,
  addYears,
  subYears,
  eachMonthOfInterval,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarCheck2, Clock, Percent, Plus, ChevronDown, Trash2 } from "lucide-react";
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

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function getAllocationColor(percent: number, threshold: number): string {
  if (percent === 0) return "bg-muted/40";
  if (percent > 100) return "bg-rose-400";
  if (percent >= threshold) return "bg-emerald-400";
  if (percent >= 50) return "bg-amber-300";
  return "bg-amber-200";
}

function getAllocationTextColor(percent: number, threshold: number): string {
  if (percent === 0) return "text-muted-foreground/40";
  if (percent > 100) return "text-rose-700";
  if (percent >= threshold) return "text-emerald-700";
  return "text-amber-700";
}

export default function CalendarYearly() {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showHours, setShowHours] = useState(false);
  const [expandedPersons, setExpandedPersons] = useState<Set<number>>(new Set());
  const [editingAssignment, setEditingAssignment] = useState<{ personId: number; projectId: number; currentPercent: number } | null>(null);
  const [newPercent, setNewPercent] = useState(0);
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
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
        periodDate: format(new Date(currentYear, 0, 1), "yyyy-MM-dd"),
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
  const yearStart = startOfYear(new Date(currentYear, 0, 1));
  const yearEnd = endOfYear(new Date(currentYear, 0, 1));

  const startStr = format(yearStart, "yyyy-MM-dd");
  const endStr = format(yearEnd, "yyyy-MM-dd");

  const { data: people, isLoading: loadingPeople } = trpc.people.list.useQuery();
  const { data: snapshot, isLoading: loadingSnapshot } = trpc.staffing.snapshot.useQuery({
    startDate: startStr,
    endDate: endStr,
  });
  const { data: settings } = trpc.settings.all.useQuery();
  const threshold = parseFloat(settings?.underutilization_threshold ?? "80");

  const isLoading = loadingPeople || loadingSnapshot;

  const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

  // For each person, for each month, compute average allocation and hours
  const grid = useMemo(() => {
    if (!people || !snapshot) return [];
    return people.map(person => {
      const personAssignments = snapshot.assignments.filter(a => a.personId === person.id);
      const monthData = months.map(monthDate => {
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);
        const workDays = eachDayOfInterval({ start: mStart, end: mEnd })
          .filter(d => d.getDay() !== 0 && d.getDay() !== 6);

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

        return { monthDate, avgPercent, totalHours, projects };
      });

      const yearAvgPercent = monthData.filter(m => m.avgPercent > 0).reduce((sum, m, _, arr) => sum + m.avgPercent / arr.length, 0);
      const yearTotalHours = monthData.reduce((sum, m) => sum + m.totalHours, 0);

      return { person, monthData, yearAvgPercent, yearTotalHours, personAssignments };
    });
  }, [people, snapshot, months]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vista Annuale</h1>
          <p className="text-muted-foreground text-sm mt-1">Anno {currentYear}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentYear(y => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentYear(new Date().getFullYear())} className="gap-2">
            <CalendarCheck2 className="h-4 w-4" />
            Anno corrente
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentYear(y => y + 1)}>
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
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-52">
                  Persona
                </th>
                {MONTHS.map((month, i) => (
                  <th
                    key={i}
                    className={`text-center px-1 py-3 text-xs font-semibold uppercase tracking-wider min-w-[60px] ${
                      new Date().getMonth() === i && new Date().getFullYear() === currentYear
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {month}
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[80px]">
                  Anno
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
                    {MONTHS.map((_, j) => (
                      <td key={j} className="px-1 py-3">
                        <Skeleton className="h-12 w-full rounded-lg" />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-12 mx-auto" />
                    </td>
                  </tr>
                ))
              ) : grid.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-12 text-muted-foreground text-sm">
                    Nessuna persona. Aggiungi persone dalla sezione Persone.
                  </td>
                </tr>
              ) : (
                grid.map(({ person, monthData, yearAvgPercent, yearTotalHours, personAssignments }) => {
                  const initials = person.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
                  const isPersonOverallocated = monthData.some((m: any) => m.avgPercent > 100);
                  const isExpanded = expandedPersons.has(person.id);
                  const hasProjects = personAssignments.length > 0;
                  return (
                    <>
                    <tr key={person.id} className={`border-b border-border/40 hover:bg-muted/10 transition-elegant ${
                      isPersonOverallocated ? "bg-rose-50/50" : ""
                    }`}>
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
                      {monthData.map(({ monthDate, avgPercent, totalHours, projects }, mi) => {
                        const isCurrentMonth = new Date().getMonth() === mi && new Date().getFullYear() === currentYear;
                        return (
                          <td key={mi} className="px-1 py-3">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={`rounded-lg px-1 py-2 cursor-default text-center transition-elegant hover:opacity-80 ${getAllocationColor(avgPercent, threshold)} ${isCurrentMonth ? "ring-2 ring-primary/40 ring-offset-1" : ""}`}
                                >
                                  {avgPercent > 0 ? (
                                    <>
                                      <p className={`text-xs font-bold ${getAllocationTextColor(avgPercent, threshold)}`}>
                                        {showHours ? `${totalHours.toFixed(0)}h` : `${Math.round(avgPercent)}%`}
                                      </p>
                                      {!showHours && (
                                        <p className="text-xs text-muted-foreground/80 mt-0.5">
                                          {totalHours.toFixed(0)}h
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground/30 py-1">—</p>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1.5">
                                  <p className="font-semibold text-xs capitalize">
                                    {format(monthDate, "MMMM yyyy", { locale: it })}
                                  </p>
                                  {projects.length > 0 ? (
                                    projects.map(({ project, avgPercent: ap }, idx) => (
                                      <div key={idx} className="flex items-center gap-2 text-xs">
                                        <div
                                          className="h-2 w-2 rounded-full shrink-0"
                                          style={{ backgroundColor: project?.color ?? "#6366f1" }}
                                        />
                                        <span>{project?.name ?? "—"}</span>
                                        <span className="ml-auto font-medium">{Math.round(ap)}%</span>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Nessuna allocazione</p>
                                  )}
                                  {avgPercent > 0 && (
                                    <div className="border-t pt-1 text-xs font-medium">
                                      Media: {Math.round(avgPercent)}% · {totalHours.toFixed(0)}h
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <p className={`text-sm font-semibold ${isPersonOverallocated ? "text-rose-600" : ""}`}>
                          {showHours ? `${yearTotalHours.toFixed(0)}h` : `${Math.round(yearAvgPercent)}%`}
                        </p>
                        {!showHours && (
                          <p className={`text-xs ${isPersonOverallocated ? "text-rose-600 font-semibold" : "text-muted-foreground"}`}>
                            {yearTotalHours.toFixed(0)}h
                          </p>
                        )}
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
                          {MONTHS.map((_, mi) => (
                            <td key={mi} className="px-1 py-2 text-center">
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
      <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-muted/40" />
          Nessuna allocazione
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-amber-200" />
          Bassa (&lt;50%)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-amber-300" />
          Media (50–{threshold}%)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-emerald-400" />
          Ottimale ({threshold}–100%)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-rose-400" />
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="period"
                    value="yearly"
                    checked={periodType === 'yearly'}
                    onChange={() => setPeriodType('yearly')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Anno</span>
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
