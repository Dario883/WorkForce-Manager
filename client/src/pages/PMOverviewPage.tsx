import { useEffect, useState } from "react";
import { Link } from "wouter";
import { format, addDays } from "date-fns";
import { api } from "../lib/api";
import type { Assignment, Project } from "@shared/types";
import { Card, CardBody, CardHeader } from "../components/Card";
import { Badge } from "../components/ui";
import { STATUS_COLOR, STATUS_LABEL } from "../components/ProjectModal";

const UPCOMING_DEADLINE_DAYS = 14;

interface PmGroup {
  pmId: number | null;
  pmName: string;
  projects: Project[];
}

export default function PMOverviewPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([api.get<Project[]>("/projects"), api.get<Assignment[]>("/assignments")])
      .then(([pr, a]) => {
        setProjects(pr);
        setAssignments(a);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-400 dark:text-slate-500">Caricamento…</div>;

  const today = format(new Date(), "yyyy-MM-dd");
  const deadlineCutoff = format(addDays(new Date(), UPCOMING_DEADLINE_DAYS), "yyyy-MM-dd");

  const groupMap = new Map<string, PmGroup>();
  for (const p of projects) {
    const key = p.pmId ? String(p.pmId) : "none";
    const entry = groupMap.get(key) ?? { pmId: p.pmId, pmName: p.pmName ?? "Nessun PM assegnato", projects: [] };
    entry.projects.push(p);
    groupMap.set(key, entry);
  }
  const groups = [...groupMap.values()].sort((a, b) => b.projects.length - a.projects.length);

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Per PM</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Portfolio progetti raggruppato per PM responsabile</p>
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
            const projectIds = new Set(g.projects.map((p) => p.id));
            const staffedProjectIdsToday = new Set(
              assignments.filter((a) => a.startDate <= today && a.endDate >= today && projectIds.has(a.projectId)).map((a) => a.projectId)
            );
            const withoutResources = active.filter((p) => !staffedProjectIdsToday.has(p.id));
            const peopleToday = new Set(
              assignments
                .filter((a) => a.startDate <= today && a.endDate >= today && projectIds.has(a.projectId))
                .map((a) => a.personId)
            );

            return (
              <Card key={key}>
                <CardHeader className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                      {g.pmId ? (
                        <Link href={`/people/${g.pmId}`} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                          {g.pmName}
                        </Link>
                      ) : (
                        g.pmName
                      )}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{g.projects.length} progetti</p>
                  </div>
                  <button
                    className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                    onClick={() => toggle(key)}
                  >
                    {isExpanded ? "Comprimi" : "Mostra progetti"}
                  </button>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                      <div className="text-xs text-slate-500 dark:text-slate-400">Senza risorse oggi</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{peopleToday.size}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Persone coinvolte oggi</div>
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
