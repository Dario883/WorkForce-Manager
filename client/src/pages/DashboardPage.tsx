import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import Button from "../components/Button";
import { Card, CardBody, CardHeader } from "../components/Card";
import { Badge } from "../components/ui";
import Modal from "../components/Modal";
import DonutChart from "../components/DonutChart";
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
  const [allAbsences, setAllAbsences] = useState<Absence[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    subtitle?: string;
    rows: { label: string; value: string; color?: string; href?: string }[];
  } | null>(null);

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
        setAllAbsences(absences);
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

  const outOfThresholdCount = underAllocated.length + overAllocated.length;
  const prevOutOfThresholdCount = prevAvgPerPerson.filter((v) => v < underThreshold || v > overThreshold).length;
  const outOfThresholdDelta = outOfThresholdCount - prevOutOfThresholdCount;

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

  const fromStr = format(range.start, "yyyy-MM-dd");
  const toStr = format(range.end, "yyyy-MM-dd");
  const prevFromStr = format(prevRange.start, "yyyy-MM-dd");
  const prevToStr = format(prevRange.end, "yyyy-MM-dd");
  const periodAbsences = allAbsences.filter((a) => a.endDate >= fromStr && a.startDate <= toStr);
  const prevPeriodAbsences = allAbsences.filter((a) => a.endDate >= prevFromStr && a.startDate <= prevToStr);

  function absenceDaysInRange(list: Absence[], rangeStartStr: string, rangeEndStr: string) {
    let total = 0;
    for (const a of list) {
      if (a.status === "rifiutata") continue;
      const clippedStart = a.startDate < rangeStartStr ? rangeStartStr : a.startDate;
      const clippedEnd = a.endDate > rangeEndStr ? rangeEndStr : a.endDate;
      total += differenceInCalendarDays(new Date(clippedEnd), new Date(clippedStart)) + 1;
    }
    return total;
  }

  const absenceDaysByPerson = new Map<number, { personName: string; days: number }>();
  for (const a of periodAbsences) {
    if (a.status === "rifiutata") continue;
    const clippedStart = a.startDate < fromStr ? fromStr : a.startDate;
    const clippedEnd = a.endDate > toStr ? toStr : a.endDate;
    const days = differenceInCalendarDays(new Date(clippedEnd), new Date(clippedStart)) + 1;
    const entry = absenceDaysByPerson.get(a.personId) ?? { personName: a.personName ?? "—", days: 0 };
    entry.days += days;
    absenceDaysByPerson.set(a.personId, entry);
  }
  const absenceDaysList = [...absenceDaysByPerson.entries()]
    .map(([personId, v]) => ({ personId, ...v }))
    .sort((a, b) => b.days - a.days);
  const totalAbsenceDays = absenceDaysInRange(periodAbsences, fromStr, toStr);
  const prevTotalAbsenceDays = absenceDaysInRange(prevPeriodAbsences, prevFromStr, prevToStr);
  const absenceDaysDelta = totalAbsenceDays - prevTotalAbsenceDays;

  const pendingApprovals = allAbsences.filter((a) => a.status === "in_attesa");

  const periodLabel = `${format(range.start, "d MMM", { locale: it })} – ${format(range.end, "d MMM yyyy", {
    locale: it,
  })}`;

  const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    count: projects.filter((p) => p.status === status).length,
  }));

  function openProjectsDrilldown(title: string, subtitle: string | undefined, rows: Project[]) {
    setDrilldown({
      title,
      subtitle,
      rows:
        rows.length > 0
          ? rows.map((p) => ({ label: p.name, value: p.client ?? "—", href: `/projects/${p.id}` }))
          : [{ label: "Nessun progetto", value: "" }],
    });
  }

  function openStatusDrilldown(status: ProjectStatus) {
    openProjectsDrilldown(`Progetti · ${STATUS_LABEL[status]}`, undefined, projects.filter((p) => p.status === status));
  }

  function openDeliveryDrilldown(type: DeliveryType) {
    openProjectsDrilldown(`Progetti · ${type}`, DELIVERY_LABEL[type], projects.filter((p) => p.deliveryType === type));
  }

  function openUtilizationDrilldown(projectName: string) {
    const rows = periodAssignments
      .filter((a) => a.projectName === projectName)
      .map((a) => ({ label: a.personName ?? "—", value: `${a.percentage}%`, href: `/people/${a.personId}` }));
    setDrilldown({
      title: `Utilizzo capacità · ${projectName}`,
      subtitle: "Persone allocate nel periodo selezionato",
      rows: rows.length > 0 ? rows : [{ label: "Nessuna allocazione nel periodo", value: "" }],
    });
  }

  function openDeadlineDrilldown() {
    setDrilldown({
      title: "Progetti in scadenza",
      subtitle: `Attivi, entro ${UPCOMING_DEADLINE_DAYS} giorni`,
      rows:
        projectsNearingDeadline.length > 0
          ? projectsNearingDeadline.map((p) => ({ label: p.name, value: p.endDate ?? "—", color: "#d97706", href: `/projects/${p.id}` }))
          : [{ label: "Nessun progetto in scadenza a breve", value: "" }],
    });
  }

  function openStartingSoonDrilldown() {
    setDrilldown({
      title: "Progetti in partenza",
      subtitle: `Entro ${UPCOMING_START_DAYS} giorni`,
      rows:
        projectsStartingSoon.length > 0
          ? projectsStartingSoon.map((p) => ({ label: p.name, value: p.startDate ?? "—", color: "#059669", href: `/projects/${p.id}` }))
          : [{ label: "Nessun progetto in partenza a breve", value: "" }],
    });
  }

  function openWithoutResourcesDrilldown() {
    setDrilldown({
      title: "Progetti senza risorse",
      subtitle: "Attivi, nessuna assegnazione nel periodo",
      rows:
        projectsWithoutResources.length > 0
          ? projectsWithoutResources.map((p) => ({ label: p.name, value: p.client ?? "—", color: "#dc2626", href: `/projects/${p.id}` }))
          : [{ label: "Tutti i progetti attivi hanno risorse", value: "" }],
    });
  }

  function openOutOfThresholdDrilldown() {
    const rows = [...underAllocated, ...overAllocated]
      .sort((a, b) => a.avg - b.avg)
      .map((p) => ({
        label: p.personName,
        value: `${Math.round(p.avg)}%`,
        color: p.avg < underThreshold ? "#d97706" : "#dc2626",
        href: `/people/${p.personId}`,
      }));
    setDrilldown({
      title: "Persone fuori soglia",
      subtitle: `Sotto ${underThreshold}% o sopra ${overThreshold}% — media nel periodo`,
      rows: rows.length > 0 ? rows : [{ label: "Nessuna persona fuori soglia", value: "" }],
    });
  }

  function openPendingApprovalsDrilldown() {
    setDrilldown({
      title: "Richieste ferie in attesa",
      subtitle: "Da approvare o rifiutare",
      rows:
        pendingApprovals.length > 0
          ? pendingApprovals.map((a) => ({
              label: `${a.personName} · ${a.startDate} → ${a.endDate}`,
              value: a.type,
              color: "#d97706",
              href: "/absences",
            }))
          : [{ label: "Nessuna richiesta in attesa", value: "" }],
    });
  }

  function openAbsencesDrilldown() {
    setDrilldown({
      title: "Assenze nel periodo",
      subtitle: "Giorni di ferie/assenza per persona",
      rows:
        absenceDaysList.length > 0
          ? absenceDaysList.map((a) => ({ label: a.personName, value: `${a.days} gg`, color: "#0891b2", href: `/people/${a.personId}` }))
          : [{ label: "Nessuna assenza nel periodo selezionato", value: "" }],
    });
  }

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
      <div className="mb-6 space-y-4">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Team</h3>
          <StatStrip
            items={[
              { label: "Persone", value: people.length, icon: "👥", href: "/people" },
              {
                label: "Persone fuori soglia",
                value: outOfThresholdCount,
                icon: "⚖️",
                tone: outOfThresholdCount > 0 ? "warn" : "ok",
                onClick: openOutOfThresholdDrilldown,
                trendDelta: outOfThresholdDelta,
              },
              {
                label: "Allocazione media team",
                value: `${Math.round(teamAvg)}%`,
                icon: "📊",
                trendDelta: teamAvgDelta,
              },
              {
                label: "Capacità libera / FTE",
                value: `${freeHoursTotal}h · ${fteAllocated.toFixed(1)}/${fteTotal.toFixed(1)} FTE`,
                icon: "🧮",
              },
            ]}
          />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Progetti</h3>
          <StatStrip
            items={[
              { label: "Progetti attivi", value: activeProjects.length, icon: "📁", href: "/projects" },
              {
                label: `In scadenza (${UPCOMING_DEADLINE_DAYS}gg)`,
                value: projectsNearingDeadline.length,
                icon: "⏳",
                tone: projectsNearingDeadline.length > 0 ? "warn" : "ok",
                onClick: openDeadlineDrilldown,
              },
              {
                label: `In partenza (${UPCOMING_START_DAYS}gg)`,
                value: projectsStartingSoon.length,
                icon: "🚀",
                tone: projectsStartingSoon.length > 0 ? "warn" : "ok",
                onClick: openStartingSoonDrilldown,
              },
              {
                label: "Senza risorse",
                value: projectsWithoutResources.length,
                icon: "🚧",
                tone: projectsWithoutResources.length > 0 ? "danger" : "ok",
                onClick: openWithoutResourcesDrilldown,
              },
            ]}
          />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Ferie</h3>
          <StatStrip
            items={[
              {
                label: "Giorni di assenza nel periodo",
                value: totalAbsenceDays,
                icon: "🌴",
                onClick: openAbsencesDrilldown,
                trendDelta: absenceDaysDelta,
              },
              {
                label: "Richieste in attesa",
                value: pendingApprovals.length,
                icon: "📝",
                tone: pendingApprovals.length > 0 ? "warn" : "ok",
                onClick: openPendingApprovalsDrilldown,
              },
            ]}
          />
        </div>
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
              const pct = Math.min(Math.max(p.avg, 0), METER_MAX);
              const fillWidth = (pct / METER_MAX) * 100;
              const underMarker = Math.min(Math.max((underThreshold / METER_MAX) * 100, 0), 100);
              const overMarker = Math.min(Math.max((overThreshold / METER_MAX) * 100, 0), 100);
              const color =
                p.avg === 0
                  ? "#94a3b8"
                  : p.avg < underThreshold
                  ? "#f59e0b"
                  : p.avg <= overThreshold
                  ? "#10b981"
                  : "#ef4444";

              return (
                <Link
                  key={p.personId}
                  href={`/people/${p.personId}`}
                  className="group block rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 transition hover:border-slate-300 hover:bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-600 dark:hover:bg-slate-700/60"
                >
                  <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                    <span>{p.personName}</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-200">{Math.round(p.avg)}%</span>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-200/30 to-transparent" />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${fillWidth}%`, background: color }}
                      title={`${p.personName}: ${Math.round(p.avg)}% (media periodo)`}
                    />
                    <div className="absolute inset-y-0 w-[1px] bg-slate-500/70" style={{ left: `${underMarker}%` }} />
                    <div className="absolute inset-y-0 w-[1px] bg-slate-700/70" style={{ left: `${overMarker}%` }} />
                  </div>
                </Link>
              );
            })}
        </CardBody>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            0
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            {`< ${underThreshold}`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            {`${underThreshold}-${overThreshold}`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            {`> ${overThreshold}`}
          </span>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Progetti per stato</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{projects.length} progetti totali</p>
          </CardHeader>
          <CardBody>
            <DonutChart
              data={statusCounts.filter((s) => s.count > 0).map((s) => ({ name: STATUS_LABEL[s.status], value: s.count, color: STATUS_COLOR[s.status] }))}
              onSliceClick={(name) => {
                const status = STATUS_ORDER.find((s) => STATUS_LABEL[s] === name);
                if (status) openStatusDrilldown(status);
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Progetti per tipo di delivery</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">TK · T&M · TaaS · AMS</p>
          </CardHeader>
          <CardBody>
            <DonutChart
              data={deliveryTypeCounts.filter((d) => d.count > 0).map((d) => ({ name: d.type, value: d.count, color: DELIVERY_COLOR[d.type] }))}
              onSliceClick={(name) => openDeliveryDrilldown(name as DeliveryType)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Utilizzo capacità per progetto</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Ore assorbite dal team nel periodo</p>
          </CardHeader>
          <CardBody>
            <DonutChart
              data={projectUtilization.slice(0, 8).map((p) => ({ name: p.projectName, value: Math.round(p.hours * 10) / 10, color: p.color }))}
              onSliceClick={openUtilizationDrilldown}
              valueFormat={(v) => `${v}h`}
            />
          </CardBody>
        </Card>
      </div>
        </>
      )}

      <Modal open={!!drilldown} onClose={() => setDrilldown(null)} title={drilldown?.title ?? ""}>
        {drilldown?.subtitle && <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{drilldown.subtitle}</p>}
        <div className="space-y-2">
          {drilldown?.rows.map((r, idx) => {
            const content = (
              <>
                <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  {r.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />}
                  {r.label}
                </span>
                {r.value && <Badge color={r.color ?? "#3457d5"}>{r.value}</Badge>}
              </>
            );
            return r.href ? (
              <Link
                key={idx}
                href={r.href}
                onClick={() => setDrilldown(null)}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 hover:bg-slate-100 dark:bg-slate-700/40 dark:hover:bg-slate-700"
              >
                {content}
              </Link>
            ) : (
              <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-700/40">
                {content}
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

interface StatItemData {
  label: string;
  value: number | string;
  icon: string;
  tone?: "ok" | "warn" | "danger" | "neutral";
  href?: string;
  onClick?: () => void;
  trendDelta?: number;
}

const STAT_TONE_COLOR: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  neutral: "text-slate-900 dark:text-slate-100",
};

function StatStrip({ items }: { items: StatItemData[] }) {
  return (
    <Card>
      <div className="flex flex-wrap divide-x divide-slate-100 dark:divide-slate-700">
        {items.map((item) => (
          <StatItem key={item.label} item={item} />
        ))}
      </div>
    </Card>
  );
}

function StatItem({ item }: { item: StatItemData }) {
  const tone = item.tone ?? "neutral";
  const roundedDelta = item.trendDelta !== undefined ? Math.round(item.trendDelta) : 0;

  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{item.icon}</span>
        <span className={`text-lg font-bold leading-tight ${STAT_TONE_COLOR[tone]}`}>{item.value}</span>
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{item.label}</div>
      {item.trendDelta !== undefined && (
        <div className="mt-0.5 text-xs font-medium text-slate-400 dark:text-slate-500" title="Rispetto al periodo precedente">
          {roundedDelta === 0 ? "–" : roundedDelta > 0 ? "▲" : "▼"} {Math.abs(roundedDelta)}pt vs prec.
        </div>
      )}
    </>
  );

  const className = `min-w-[150px] flex-1 basis-[150px] px-4 py-3 ${
    item.href || item.onClick ? "text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/50" : ""
  }`;

  if (item.href) {
    return (
      <Link href={item.href} className={className}>
        {inner}
      </Link>
    );
  }
  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} className={className}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}
