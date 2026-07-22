import { trpc } from "@/lib/trpc";
import { useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Mail, Clock, Layers } from "lucide-react";
import { AllocationBar, AllocationBadge } from "@/components/AllocationBar";

export default function PersonDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const personId = parseInt(params.id ?? "0");

  const { data: person, isLoading: loadingPerson } = trpc.people.byId.useQuery({ id: personId });
  const { data: assignments, isLoading: loadingAssignments } = trpc.people.assignments.useQuery({ personId });
  const { data: projects } = trpc.projects.list.useQuery();

  const getProject = (id: number) => projects?.find(p => p.id === id);

  // Group assignments by project
  const byProject = useMemo(() => {
    if (!assignments) return [];
    const map: Record<number, { project: any; assignments: typeof assignments }> = {};
    assignments.forEach(a => {
      if (!map[a.projectId]) {
        map[a.projectId] = { project: getProject(a.projectId), assignments: [] };
      }
      map[a.projectId].assignments.push(a);
    });
    return Object.values(map);
  }, [assignments, projects]);

  // Total hours per project (rough estimate: avg allocation * capacity * working days)
  const projectHours = useMemo(() => {
    if (!assignments || !person) return {};
    const map: Record<number, number> = {};
    assignments.forEach(a => {
      const days = differenceInDays(new Date(a.endDate), new Date(a.startDate)) + 1;
      const workDays = Math.round(days * 5 / 7);
      const hoursPerDay = parseFloat(String(person.weeklyCapacityHours)) / 5;
      const hours = (hoursPerDay * parseFloat(String(a.allocationPercent)) / 100) * workDays;
      map[a.projectId] = (map[a.projectId] ?? 0) + hours;
    });
    return map;
  }, [assignments, person]);

  const totalHours = Object.values(projectHours).reduce((sum, h) => sum + h, 0);

  // Timeline: find min/max dates
  const timelineRange = useMemo(() => {
    if (!assignments || assignments.length === 0) return null;
    const starts = assignments.map(a => new Date(a.startDate).getTime());
    const ends = assignments.map(a => new Date(a.endDate).getTime());
    return {
      min: new Date(Math.min(...starts)),
      max: new Date(Math.max(...ends)),
    };
  }, [assignments]);

  if (loadingPerson) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Persona non trovata.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/people")}>
          Torna alle persone
        </Button>
      </div>
    );
  }

  const initials = person.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => setLocation("/people")}>
        <ArrowLeft className="h-4 w-4" />
        Persone
      </Button>

      {/* Person header */}
      <Card className="card-elegant">
        <CardContent className="p-6">
          <div className="flex items-start gap-5">
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0"
              style={{ backgroundColor: person.avatarColor ?? "#6366f1" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">{person.name}</h1>
              <p className="text-muted-foreground mt-0.5">{person.role}</p>
              <div className="flex flex-wrap gap-4 mt-3">
                {person.email && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {person.email}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {parseFloat(String(person.weeklyCapacityHours))}h/settimana
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  {assignments?.length ?? 0} assegnazioni
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Ore totali stimate</p>
              <p className="text-3xl font-bold mt-1">{totalHours.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">ore su tutti i progetti</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ore per progetto */}
        <Card className="card-elegant">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Ore per progetto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingAssignments ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : byProject.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nessuna assegnazione</p>
            ) : (
              byProject.map(({ project, assignments: pas }) => {
                const hours = projectHours[project?.id ?? 0] ?? 0;
                const pct = totalHours > 0 ? (hours / totalHours) * 100 : 0;
                return (
                  <div key={project?.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: project?.color ?? "#6366f1" }}
                        />
                        <span className="text-sm font-medium">{project?.name ?? "—"}</span>
                      </div>
                      <span className="text-sm font-semibold">{hours.toFixed(0)}h</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: project?.color ?? "#6366f1",
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Timeline assegnazioni */}
        <Card className="card-elegant">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Timeline assegnazioni</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAssignments ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)
            ) : !assignments || assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nessuna assegnazione</p>
            ) : (
              <div className="space-y-2">
                {assignments.map(a => {
                  const project = getProject(a.projectId);
                  const percent = parseFloat(String(a.allocationPercent));
                  return (
                    <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/60 hover:bg-muted/30 transition-elegant">
                      <div
                        className="h-8 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: project?.color ?? "#6366f1" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{project?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(a.startDate), "d MMM yyyy", { locale: it })}
                          {" → "}
                          {format(new Date(a.endDate), "d MMM yyyy", { locale: it })}
                        </p>
                      </div>
                      <AllocationBadge percent={percent} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Storico completo */}
      {assignments && assignments.length > 0 && (
        <Card className="card-elegant">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Storico allocazioni</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {assignments.map(a => {
                const project = getProject(a.projectId);
                const percent = parseFloat(String(a.allocationPercent));
                const days = differenceInDays(new Date(a.endDate), new Date(a.startDate)) + 1;
                const workDays = Math.round(days * 5 / 7);
                const hoursPerDay = parseFloat(String(person.weeklyCapacityHours)) / 5;
                const hours = (hoursPerDay * percent / 100) * workDays;
                return (
                  <div key={a.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-elegant">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: project?.color ?? "#6366f1" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{project?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(a.startDate), "d MMM yyyy", { locale: it })}
                        {" → "}
                        {format(new Date(a.endDate), "d MMM yyyy", { locale: it })}
                        {" · "}
                        {workDays} giorni lavorativi
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <AllocationBadge percent={percent} />
                      <p className="text-xs text-muted-foreground mt-1">{hours.toFixed(0)}h stimate</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
