import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import Button from "../components/Button";
import { Card, CardBody, CardHeader } from "../components/Card";
import { Badge } from "../components/ui";
import type { Absence, Assignment, DeliveryType, Person, Project, ProjectStatus, Settings, StaffingSnapshot } from "@shared/types";
import { DELIVERY_COLOR, DELIVERY_LABEL } from "../components/ProjectModal";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { it } from "date-fns/locale";

type PeriodView = "week" | "month" | "year";
const UPCOMING_DEADLINE_DAYS = 14;
const UPCOMING_START_DAYS = 14;
const METER_MAX = 150;
const DELIVERY_ORDER: DeliveryType[] = ["TK", "T&M", "TaaS", "AMS"];
const STANDARD_FTE_HOURS = 40;

// Same mapping already used for status badges in ProjectsPage — reused here
// for consistency rather than introducing a second palette for the same data.
const STATUS_ORDER: ProjectStatus[] = ["planned", "active", "on_hold", "completed"];
const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Pianificato",
  active: "Attivo",
  on_hold: "In pausa",
  completed: "Completato",
};
const STATUS_COLOR: Record<ProjectStatus, string> = {
  planned: "#64748b",
  active: "#059669",
  on_hold: "#d97706",
  completed: "#3457d5",
};

export default function DashboardPage() {
  const [view, setView] = useState<PeriodView>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [snapshot, setSnapshot] = useState<StaffingSnapshot | null>(null);
  const [prevSnapshot, setPrevSnapshot] = useState<StaffingSnapshot | null>(null);
  const [periodAssignments, setPeriodAssignments] = useState<Assignment[]>([]);
  const [periodAbsences, setPeriodAbsences] = useState<Absence[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const range =
    view === "week"
      ? { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) }
      : view === "year"
      ? { start: startOfYear(anchor), end: endOfYear(anchor) }
      : { start: startOfMonth(anchor), end: endOfMonth(anchor) };

  const prevAnchor = view === "week" ? subWeeks(anchor, 1) : view === "year" ? subYears(anchor, 1) : subMonths(anchor, 1);
  const prevRange =
    view === "week"
      ? { start: startOfWeek(prevAnchor, { weekStartsOn: 1 }), end: endOfWeek(prevAnchor, { weekStartsOn: 1 }) }
      : view === "year"
      ? { start: startOfYear(prevAnchor), end: endOfYear(prevAnchor) }
      : { start: startOfMonth(prevAnchor), end: endOfMonth(prevAnchor) };

  useEffect(() => {
    Promise.all([api.get<Person[]>("/people"), api.get<Project[]>("/projects"), api.get<Settings>("/settings")]).then(
      ([p, pr, s]) => {
        setPeople(p);
        setProjects(pr);
        setSettings(s);
      }
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    const from = format(range.start, "yyyy-MM-dd");
    const to = format(range.end, "yyyy-MM-dd");
    const prevFrom = format(prevRange.start, "yyyy-MM-dd");
    const prevTo = format(prevRange.end, "yyyy-MM-dd");
    Promise.all([
      api.get<StaffingSnapshot>(`/staffing/snapshot?from=${from}&to=${to}`),
      api.get<Assignment[]>("/assignments"),
      api.get<StaffingSnapshot>(`/staffing/snapshot?from=${prevFrom}&to=${prevTo}`),
      api.get<Absence[]>("/absences"),
    ])
      .then(([snap, assignments, prevSnap, absences]) => {
        setSnapshot(snap);
        setPeriodAssignments(assignments.filter((a) => a.endDate >= from && a.startDate <= to));
        setPrevSnapshot(prevSnap);
        setPeriodAbsences(absences.filter((a) => a.endDate >= from && a.startDate <= to));
      })
      .finally(() => setLoading(false));
  }, [view, anchor.toDateString()]);

  function shiftPeriod(dir: 1 | -1) {
    setAnchor((a) => (view === "week" ? addWeeks(a, dir) : view === "year" ? addYears(a, dir) : addMonths(a, dir)));
  }

  const underThreshold = Number(settings?.underutilization_threshold ?? 70);
  const overThreshold = Number(settings?.overutilization_threshold ?? 100);

  const avgPerPerson =
    snapshot?.people.map((p) => {
      const dayValues = Object.values(p.days);
      const avg = dayValues.length ? dayValues.reduce((a, d) => a + d.total, 0) / dayValues.length : 0;
      const avgCapacity = dayValues.length
        ? dayValues.reduce((a, d) => a + d.capacityHoursPerWeek, 0) / dayValues.length
        : p.capacityHoursPerWeek;
      return { ...p, avg, avgCapacity };
    }) ?? [];

  const underAllocated = avgPerPerson.filter((p) => p.avg < underThreshold);
  const overAllocated = avgPerPerson.filter((p) => p.avg > overThreshold);
  const activeProjects = projects.filter((p) => p.status === "active");

  const teamAvg = avgPerPerson.length ? avgPerPerson.reduce((s, p) => s + p.avg, 0) / avgPerPerson.length : 0;
  const prevAvgPerPerson =
    prevSnapshot?.people.map((p) => {
      const values = Object.values(p.days).map((d) => d.total);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }) ?? [];
  const prevTeamAvg = prevAvgPerPerson.length ? prevAvgPerPerson.reduce((s, v) => s + v, 0) / prevAvgPerPerson.length : 0;
  const teamAvgDelta = teamAvg - prevTeamAvg;

  const deadlineCutoff = format(addDays(new Date(), UPCOMING_DEADLINE_DAYS), "yyyy-MM-dd");
  const startingCutoff = format(addDays(new Date(), UPCOMING_START_DAYS), "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const projectsNearingDeadline = activeProjects.filter(
    (p) => p.endDate && p.endDate >= todayStr && p.endDate <= deadlineCutoff
  );
  const projectsStartingSoon = projects.filter(
    (p) => p.status !== "completed" && p.startDate && p.startDate >= todayStr && p.startDate <= startingCutoff
  );

  const staffedProjectIds = new Set(periodAssignments.map((a) => a.projectId));
  const projectsWithoutResources = activeProjects.filter((p) => !staffedProjectIds.has(p.id));

  const periodDays = differenceInCalendarDays(range.end, range.start) + 1;
  const periodWeeks = periodDays / 7;
  const freeHoursTotal = Math.round(
    avgPerPerson.reduce((sum, p) => sum + p.avgCapacity * periodWeeks * Math.max(0, 1 - p.avg / 100), 0)
  );

  // Total team capacity-hours in the period, resolved day-by-day (so variable
  // capacity periods are reflected instead of a flat capacityHoursPerWeek).
  const totalTeamCapacityHours = avgPerPerson.reduce((sum, p) => sum + p.avgCapacity * periodWeeks, 0);

  const fteTotal = avgPerPerson.reduce((sum, p) => sum + p.avgCapacity / STANDARD_FTE_HOURS, 0);
  const fteAllocated = avgPerPerson.reduce(
    (sum, p) => sum + (p.avgCapacity / STANDARD_FTE_HOURS) * (p.avg / 100),
    0
  );

  // Hours allocated per project (keyed by name, which is unique) in the
  // period, used for the per-project capacity utilization breakdown.
  const projectHoursMap = new Map<string, { color: string; hours: number }>();
  for (const p of avgPerPerson) {
    const dailyRate = p.capacityHoursPerWeek / 7;
    for (const day of Object.values(p.days)) {
      for (const item of day.items) {
        const entry = projectHoursMap.get(item.projectName) ?? { color: item.projectColor, hours: 0 };
        entry.hours += dailyRate * (item.percentage / 100);
        projectHoursMap.set(item.projectName, entry);
      }
    }
  }
  const projectUtilization = [...projectHoursMap.entries()]
    .map(([projectName, v]) => ({
      projectName,
      color: v.color,
      hours: v.hours,
      pctOfTeamCapacity: totalTeamCapacityHours > 0 ? (v.hours / totalTeamCapacityHours) * 100 : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  const deliveryTypeCounts = DELIVERY_ORDER.map((type) => ({
    type,
    count: projects.filter((p) => p.deliveryType === type).length,
  }));

  const absenceDaysByPerson = new Map<number, { personName: string; days: number }>();
  let totalAbsenceDays = 0;
  for (const a of periodAbsences) {
    if (a.status === "rifiutata") continue;
    const clippedStart = a.startDate < format(range.start, "yyyy-MM-dd") ? format(range.start, "yyyy-MM-dd") : a.startDate;
    const clippedEnd = a.endDate > format(range.end, "yyyy-MM-dd") ? format(range.end, "yyyy-MM-dd") : a.endDate;
    const days = differenceInCalendarDays(new Date(clippedEnd), new Date(clippedStart)) + 1;
    totalAbsenceDays += days;
    const entry = absenceDaysByPerson.get(a.personId) ?? { personName: a.personName ?? "—", days: 0 };
    entry.days += days;
    absenceDaysByPerson.set(a.personId, entry);
  }
  const absenceDaysList = [...absenceDaysByPerson.values()].sort((a, b) => b.days - a.days);

  const periodLabel = `${format(range.start, "d MMM", { locale: it })} – ${format(range.end, "d MMM yyyy", {
    locale: it,
  })}`;

  const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    count: projects.filter((p) => p.status === status).length,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5">
            {(["week", "month", "year"] as PeriodView[]).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  view === m ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {m === "week" ? "Settimana" : m === "month" ? "Mese" : "Anno"}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => shiftPeriod(-1)}>
            ←
          </Button>
          <Button variant="secondary" onClick={() => setAnchor(new Date())}>
            Oggi
          </Button>
          <Button variant="secondary" onClick={() => shiftPeriod(1)}>
            →
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 dark:text-slate-500">Caricamento…</p>
      ) : (
        <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Persone" value={people.length} icon="👥" href="/people" />
        <KpiCard label="Progetti attivi" value={activeProjects.length} icon="📁" href="/projects" />
        <KpiCard
          label="Sotto-allocati"
          value={underAllocated.length}
          icon="⬇️"
          tone={underAllocated.length > 0 ? "warn" : "ok"}
        />
        <KpiCard
          label="Sovra-allocati"
          value={overAllocated.length}
          icon="⬆️"
          tone={overAllocated.length > 0 ? "danger" : "ok"}
        />
        <KpiCard
          label={`Progetti in scadenza (${UPCOMING_DEADLINE_DAYS}gg)`}
          value={projectsNearingDeadline.length}
          icon="⏳"
          tone={projectsNearingDeadline.length > 0 ? "warn" : "ok"}
          href="/projects"
        />
        <KpiCard
          label={`Progetti in partenza (${UPCOMING_START_DAYS}gg)`}
          value={projectsStartingSoon.length}
          icon="🚀"
          tone={projectsStartingSoon.length > 0 ? "warn" : "ok"}
          href="/projects"
        />
        <KpiCard
          label="Progetti senza risorse"
          value={projectsWithoutResources.length}
          icon="🚧"
          tone={projectsWithoutResources.length > 0 ? "danger" : "ok"}
          href="/projects"
        />
        <KpiCard label="Capacità libera nel periodo" value={`${freeHoursTotal}h`} icon="🕒" />
        <KpiCard
          label="Allocazione media team"
          value={`${Math.round(teamAvg)}%`}
          icon="📊"
          trendDelta={teamAvgDelta}
        />
        <KpiCard
          label="FTE allocati / disponibili"
          value={`${fteAllocated.toFixed(1)} / ${fteTotal.toFixed(1)}`}
          icon="🧮"
        />
        <KpiCard
          label="Giorni di assenza nel periodo"
          value={totalAbsenceDays}
          icon="🌴"
          href="/absences"
        />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Allocazione per persona</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Media nel periodo selezionato</p>
          </div>
          <Link href="/settings" className="text-xs font-medium text-brand-600 hover:underline">
            Modifica soglie →
          </Link>
        </CardHeader>
        <CardBody className="space-y-3">
          {avgPerPerson.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Nessun dato per il periodo selezionato</p>
          )}
          {[...avgPerPerson]
            .sort((a, b) => b.avg - a.avg)
            .map((p) => {
              const pct = Math.min(p.avg, METER_MAX);
              const fillWidth = (pct / METER_MAX) * 100;
              const markerPos = (100 / METER_MAX) * 100;
              const color =
                p.avg === 0
                  ? "bg-slate-200"
                  : p.avg < underThreshold
                  ? "bg-amber-400"
                  : p.avg <= overThreshold
                  ? "bg-emerald-500"
                  : "bg-red-500";
              return (
                <Link
                  key={p.personId}
                  href={`/people/${p.personId}`}
                  className="block rounded-lg px-2 py-1.5 transition hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-200">{p.personName}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.round(p.avg)}%</span>
                  </div>
                  <div
                    className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
                    title={`${p.personName}: ${Math.round(p.avg)}% (media periodo)`}
                  >
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${fillWidth}%` }} />
                    <div className="absolute top-0 h-full w-px bg-slate-400/60" style={{ left: `${markerPos}%` }} />
                  </div>
                </Link>
              );
            })}
        </CardBody>
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 dark:border-slate-700 px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            0%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            {`< ${underThreshold}% (sotto-allocato)`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            {`${underThreshold}–${overThreshold}%`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            {`> ${overThreshold}% (sovra-allocato)`}
          </span>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Utilizzo capacità per progetto</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Quota di capacità totale del team assorbita da ciascun progetto nel periodo
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          {projectUtilization.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna allocazione nel periodo selezionato</p>
          ) : (
            projectUtilization.slice(0, 8).map((p) => (
              <div key={p.projectName} className="px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.projectName}
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {Math.round(p.pctOfTeamCapacity)}% · {Math.round(p.hours)}h
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(p.pctOfTeamCapacity, 100)}%`, backgroundColor: p.color }}
                  />
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Progetti per stato</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{projects.length} progetti totali</p>
        </CardHeader>
        <CardBody>
          {projects.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Nessun progetto registrato</p>
          ) : (
            <>
              <div className="flex h-6 w-full overflow-hidden rounded-full">
                {statusCounts
                  .filter((s) => s.count > 0)
                  .map((s, idx, arr) => {
                    const widthPct = (s.count / projects.length) * 100;
                    return (
                      <div
                        key={s.status}
                        className="flex h-full items-center justify-center text-[10px] font-medium text-white"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: STATUS_COLOR[s.status],
                          marginRight: idx < arr.length - 1 ? "2px" : 0,
                        }}
                        title={`${STATUS_LABEL[s.status]}: ${s.count}`}
                      >
                        {widthPct >= 12 ? s.count : ""}
                      </div>
                    );
                  })}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                {statusCounts.map((s) => (
                  <span key={s.status} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[s.status] }} />
                    {STATUS_LABEL[s.status]} ({s.count})
                  </span>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Progetti per tipo di delivery</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">TK · T&M · TaaS · AMS</p>
        </CardHeader>
        <CardBody>
          {projects.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Nessun progetto registrato</p>
          ) : (
            <>
              <div className="flex h-6 w-full overflow-hidden rounded-full">
                {deliveryTypeCounts
                  .filter((d) => d.count > 0)
                  .map((d, idx, arr) => {
                    const widthPct = (d.count / projects.length) * 100;
                    return (
                      <div
                        key={d.type}
                        className="flex h-full items-center justify-center text-[10px] font-medium text-white"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: DELIVERY_COLOR[d.type],
                          marginRight: idx < arr.length - 1 ? "2px" : 0,
                        }}
                        title={`${DELIVERY_LABEL[d.type]}: ${d.count}`}
                      >
                        {widthPct >= 12 ? d.count : ""}
                      </div>
                    );
                  })}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                {deliveryTypeCounts.map((d) => (
                  <span key={d.type} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DELIVERY_COLOR[d.type] }} />
                    {d.type} ({d.count})
                  </span>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Progetti in scadenza</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Attivi, entro {UPCOMING_DEADLINE_DAYS} giorni</p>
          </CardHeader>
          <CardBody className="space-y-2">
            {projectsNearingDeadline.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Nessun progetto in scadenza a breve</p>
            )}
            {projectsNearingDeadline.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                <span className="text-sm text-slate-700 dark:text-slate-200">{p.name}</span>
                <Badge color="#d97706">{p.endDate}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Progetti senza risorse</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Attivi, nessuna assegnazione nel periodo</p>
          </CardHeader>
          <CardBody className="space-y-2">
            {projectsWithoutResources.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Tutti i progetti attivi hanno risorse</p>
            )}
            {projectsWithoutResources.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                <span className="text-sm text-slate-700 dark:text-slate-200">{p.name}</span>
                <Badge color="#dc2626">{p.client ?? "—"}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Progetti in partenza</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Entro {UPCOMING_START_DAYS} giorni</p>
          </CardHeader>
          <CardBody className="space-y-2">
            {projectsStartingSoon.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Nessun progetto in partenza a breve</p>
            )}
            {projectsStartingSoon.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                <span className="text-sm text-slate-700 dark:text-slate-200">{p.name}</span>
                <Badge color="#059669">{p.startDate}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Assenze nel periodo</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Giorni di ferie/assenza per persona</p>
          </CardHeader>
          <CardBody className="space-y-2">
            {absenceDaysList.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna assenza nel periodo selezionato</p>
            )}
            {absenceDaysList.slice(0, 6).map((a) => (
              <div key={a.personName} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                <span className="text-sm text-slate-700 dark:text-slate-200">{a.personName}</span>
                <Badge color="#0891b2">{a.days} gg</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
  href,
  trendDelta,
}: {
  label: string;
  value: number | string;
  icon: string;
  tone?: "ok" | "warn" | "danger" | "neutral";
  href?: string;
  trendDelta?: number;
}) {
  const toneColor: Record<string, string> = {
    ok: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    neutral: "text-slate-900 dark:text-slate-100",
  };
  const roundedDelta = trendDelta !== undefined ? Math.round(trendDelta) : 0;
  const body = (
    <CardBody className="flex items-center gap-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 dark:bg-brand-500/10 text-xl">{icon}</div>
      <div>
        <div className={`text-2xl font-bold ${toneColor[tone]}`}>{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        {trendDelta !== undefined && (
          <div
            className={`mt-0.5 text-xs font-medium ${
              roundedDelta === 0 ? "text-slate-400 dark:text-slate-500" : roundedDelta > 0 ? "text-slate-600 dark:text-slate-300" : "text-slate-600 dark:text-slate-300"
            }`}
            title="Rispetto al periodo precedente"
          >
            {roundedDelta === 0 ? "–" : roundedDelta > 0 ? "▲" : "▼"} {Math.abs(roundedDelta)}pt vs periodo prec.
          </div>
        )}
      </div>
    </CardBody>
  );

  if (href) {
    return (
      <Link href={href}>
        <Card className="block transition hover:border-brand-300 hover:shadow-md">{body}</Card>
      </Link>
    );
  }
  return <Card>{body}</Card>;
}
