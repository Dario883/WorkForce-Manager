import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { it } from "date-fns/locale";
import { api } from "../lib/api";
import type { Assignment, Project, StaffingSnapshot } from "@shared/types";
import Button from "../components/Button";
import { Card, CardBody, CardHeader } from "../components/Card";
import { Badge } from "../components/ui";
import { STATUS_COLOR, STATUS_LABEL } from "../components/ProjectModal";

const UPCOMING_DEADLINE_DAYS = 14;
type PeriodView = "week" | "month" | "year";

interface PmGroup {
  pmId: number | null;
  pmName: string;
  projects: Project[];
}

export default function PMOverviewPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [snapshot, setSnapshot] = useState<StaffingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<PeriodView>("week");
  const [anchor, setAnchor] = useState(new Date());

  const range =
    view === "week"
      ? { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) }
      : view === "year"
      ? { start: startOfYear(anchor), end: endOfYear(anchor) }
      : { start: startOfMonth(anchor), end: endOfMonth(anchor) };

  useEffect(() => {
    Promise.all([api.get<Project[]>("/projects"), api.get<Assignment[]>("/assignments")]).then(([pr, a]) => {
      setProjects(pr);
      setAssignments(a);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const from = format(range.start, "yyyy-MM-dd");
    const to = format(range.end, "yyyy-MM-dd");
    api
      .get<StaffingSnapshot>(`/staffing/snapshot?from=${from}&to=${to}`)
      .then(setSnapshot)
      .finally(() => setLoading(false));
  }, [view, anchor.toDateString()]);

  function shiftPeriod(dir: 1 | -1) {
    setAnchor((a) => (view === "week" ? addWeeks(a, dir) : view === "year" ? addYears(a, dir) : addMonths(a, dir)));
  }

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading && !snapshot) return <div className="text-slate-400 dark:text-slate-500">Caricamento…</div>;

  const today = format(new Date(), "yyyy-MM-dd");
  const fromStr = format(range.start, "yyyy-MM-dd");
  const toStr = format(range.end, "yyyy-MM-dd");
  const deadlineCutoff = format(addDays(new Date(), UPCOMING_DEADLINE_DAYS), "yyyy-MM-dd");
  const periodLabel = `${format(range.start, "d MMM", { locale: it })} – ${format(range.end, "d MMM yyyy", { locale: it })}`;

  const groupMap = new Map<string, PmGroup>();
  for (const p of projects) {
    const key = p.pmId ? String(p.pmId) : "none";
    const entry = groupMap.get(key) ?? { pmId: p.pmId, pmName: p.pmName ?? "Nessun PM assegnato", projects: [] };
    entry.projects.push(p);
    groupMap.set(key, entry);
  }
  const groups = [...groupMap.values()].sort((a, b) => b.projects.length - a.projects.length);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Per PM</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Portfolio progetti raggruppato per PM responsabile · {periodLabel}</p>
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

      {groups.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Nessun progetto registrato</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const key = g.pmId ? String(g.pmId) : "none";
            const isExpanded = !!expanded[key];
            const active = g.projects.filter((p) => p.status === "active");
            const nearingDeadline = active.filter((p) => p.endDate && p.endDate >= today && p.endDate <= deadlineCutoff);
            const projectNames = new Set(g.projects.map((p) => p.name));
            const projectIds = new Set(g.projects.map((p) => p.id));

            const staffedProjectIdsInPeriod = new Set(
              assignments
                .filter((a) => a.startDate <= toStr && a.endDate >= fromStr && projectIds.has(a.projectId))
                .map((a) => a.projectId)
            );
            const withoutResources = active.filter((p) => !staffedProjectIdsInPeriod.has(p.id));

            // Per-person average allocation to THIS PM's projects specifically,
            // resolved day-by-day from the shared staffing snapshot (so it
            // reflects the portfolio's own load, not the person's total load
            // across every project they work on).
            const involvedAverages: number[] = [];
            for (const person of snapshot?.people ?? []) {
              const dayValues = Object.values(person.days);
              if (dayValues.length === 0) continue;
              const sum = dayValues.reduce(
                (acc, day) =>
                  acc + day.items.filter((i) => projectNames.has(i.projectName)).reduce((s, i) => s + i.percentage, 0),
                0
              );
              const avg = sum / dayValues.length;
              if (avg > 0) involvedAverages.push(avg);
            }
            const teamAvgAllocation = involvedAverages.length
              ? involvedAverages.reduce((s, v) => s + v, 0) / involvedAverages.length
              : 0;

            return (
              <Card key={key}>
                <CardHeader
                  className="flex cursor-pointer items-center justify-between"
                  onClick={() => toggle(key)}
                >
                  <div>
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                      {g.pmId ? (
                        <Link
                          href={`/people/${g.pmId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline"
                        >
                          {g.pmName}
                        </Link>
                      ) : (
                        g.pmName
                      )}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{g.projects.length} progetti</p>
                  </div>
                  <span className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                    {isExpanded ? "Comprimi" : "Mostra progetti"}
                  </span>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{active.length}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Progetti attivi</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                      <div className={`text-lg font-bold ${nearingDeadline.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"}`}>
                        {nearingDeadline.length}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">In scadenza ({UPCOMING_DEADLINE_DAYS}gg)</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                      <div className={`text-lg font-bold ${withoutResources.length > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
                        {withoutResources.length}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Senza risorse nel periodo</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{involvedAverages.length}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Persone coinvolte</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{Math.round(teamAvgAllocation)}%</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Allocazione media</div>
                    </div>
                  </div>

                  {isExpanded && (
                    <table className="mt-4 w-full text-sm">
                      <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="py-2">Progetto</th>
                          <th className="py-2">Cliente</th>
                          <th className="py-2">Stato</th>
                          <th className="py-2">Periodo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {g.projects.map((p) => (
                          <tr key={p.id}>
                            <td className="py-2 font-medium text-slate-800 dark:text-slate-100">
                              <Link href={`/projects/${p.id}`} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                                {p.name}
                              </Link>
                            </td>
                            <td className="py-2 text-slate-600 dark:text-slate-300">{p.client ?? "—"}</td>
                            <td className="py-2">
                              <Badge color={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                            </td>
                            <td className="py-2 text-slate-600 dark:text-slate-300">
                              {p.startDate ?? "—"} → {p.endDate ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
