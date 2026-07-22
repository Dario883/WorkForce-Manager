import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AllocationBar } from "@/components/AllocationBar";
import { Users, BriefcaseBusiness, AlertTriangle, TrendingUp, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    planning: "Pianificazione",
    active: "Attivo",
    on_hold: "In pausa",
    completed: "Completato",
    cancelled: "Annullato",
  };
  return map[status] ?? status;
}

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    planning: "bg-blue-100 text-blue-700 border-blue-200",
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    on_hold: "bg-amber-100 text-amber-700 border-amber-200",
    completed: "bg-slate-100 text-slate-600 border-slate-200",
    cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const today = new Date();
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data: people, isLoading: loadingPeople } = trpc.people.list.useQuery();
  const { data: projects, isLoading: loadingProjects } = trpc.projects.list.useQuery();
  const { data: settings } = trpc.settings.all.useQuery();
  const { data: snapshot, isLoading: loadingSnapshot } = trpc.staffing.snapshot.useQuery({
    startDate: weekStart,
    endDate: weekEnd,
  });

  const threshold = parseFloat(settings?.underutilization_threshold ?? "80");

  const personAllocations = useMemo(() => {
    if (!people || !snapshot) return [];
    return people.map(person => {
      const personAssignments = snapshot.assignments.filter(a => a.personId === person.id);
      const totalAlloc = personAssignments.reduce((sum, a) => sum + parseFloat(String(a.allocationPercent)), 0);
      const projects = personAssignments.map(a => ({
        projectId: a.projectId,
        percent: parseFloat(String(a.allocationPercent)),
      }));
      return {
        person,
        totalAlloc,
        projects,
        weeklyHours: (parseFloat(String(person.weeklyCapacityHours)) * totalAlloc) / 100,
      };
    });
  }, [people, snapshot]);

  const underutilized = personAllocations.filter(p => p.totalAlloc < threshold);
  const overallocated = personAllocations.filter(p => p.totalAlloc > 100);
  const activeProjects = projects?.filter(p => p.status === "active") ?? [];

  const isLoading = loadingPeople || loadingProjects || loadingSnapshot;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Settimana corrente · {format(today, "d MMMM yyyy", { locale: it })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Persone",
            value: people?.length ?? 0,
            icon: Users,
            color: "text-indigo-600",
            bg: "bg-indigo-50",
            path: "/people",
          },
          {
            label: "Progetti attivi",
            value: activeProjects.length,
            icon: BriefcaseBusiness,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            path: "/projects",
          },
          {
            label: "Sotto-utilizzati",
            value: underutilized.length,
            icon: AlertTriangle,
            color: "text-amber-600",
            bg: "bg-amber-50",
            path: "/people",
          },
          {
            label: "Sovra-allocati",
            value: overallocated.length,
            icon: TrendingUp,
            color: "text-rose-600",
            bg: "bg-rose-50",
            path: "/people",
          },
        ].map(kpi => (
          <Card
            key={kpi.label}
            className="card-elegant cursor-pointer hover:shadow-md transition-elegant"
            onClick={() => setLocation(kpi.path)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-2" />
                  ) : (
                    <p className="text-3xl font-bold mt-1 tracking-tight">{kpi.value}</p>
                  )}
                </div>
                <div className={`h-10 w-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocazioni settimana corrente */}
        <Card className="card-elegant">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Allocazioni questa settimana</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7"
                onClick={() => setLocation("/calendar/weekly")}
              >
                Vedi calendario <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                </div>
              ))
            ) : personAllocations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nessuna allocazione questa settimana</p>
            ) : (
              personAllocations.slice(0, 8).map(({ person, totalAlloc, weeklyHours }) => {
                const initials = person.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <div
                    key={person.id}
                    className="flex items-center gap-3 cursor-pointer hover:bg-muted/40 rounded-lg p-1.5 -mx-1.5 transition-elegant"
                    onClick={() => setLocation(`/people/${person.id}`)}
                  >
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                      style={{ backgroundColor: person.avatarColor ?? "#6366f1" }}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate">{person.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                          {Math.round(weeklyHours)}h
                        </span>
                      </div>
                      <AllocationBar percent={totalAlloc} threshold={threshold} showLabel />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Progetti attivi */}
        <Card className="card-elegant">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Progetti attivi</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7"
                onClick={() => setLocation("/projects")}
              >
                Tutti i progetti <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))
            ) : activeProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nessun progetto attivo</p>
            ) : (
              activeProjects.slice(0, 6).map(project => {
                const projectAssignments = snapshot?.assignments.filter(a => a.projectId === project.id) ?? [];
                const teamSize = new Set(projectAssignments.map(a => a.personId)).size;
                return (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 cursor-pointer transition-elegant"
                    onClick={() => setLocation("/projects")}
                  >
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: project.color ?? "#6366f1" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{teamSize} {teamSize === 1 ? "persona" : "persone"}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${getStatusColor(project.status)}`}>
                      {getStatusLabel(project.status)}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {(underutilized.length > 0 || overallocated.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {underutilized.length > 0 && (
            <Card className="card-elegant border-amber-200/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-amber-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Sotto-utilizzati (&lt;{threshold}%)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {underutilized.map(({ person, totalAlloc }) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-amber-50 cursor-pointer transition-elegant"
                    onClick={() => setLocation(`/people/${person.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium">{person.name}</p>
                      <p className="text-xs text-muted-foreground">{person.role}</p>
                    </div>
                    <AllocationBar percent={totalAlloc} threshold={threshold} showLabel className="w-32" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {overallocated.length > 0 && (
            <Card className="card-elegant border-rose-200/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-rose-700 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Sovra-allocati (&gt;100%)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overallocated.map(({ person, totalAlloc }) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-rose-50 cursor-pointer transition-elegant"
                    onClick={() => setLocation(`/people/${person.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium">{person.name}</p>
                      <p className="text-xs text-muted-foreground">{person.role}</p>
                    </div>
                    <AllocationBar percent={totalAlloc} threshold={threshold} showLabel className="w-32" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
