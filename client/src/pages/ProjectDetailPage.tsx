import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import type { Assignment, Project } from "@shared/types";
import { Card, CardBody, CardHeader } from "../components/Card";
import Button from "../components/Button";
import { Badge } from "../components/ui";
import ProjectModal, { STATUS_COLOR, STATUS_LABEL } from "../components/ProjectModal";

export default function ProjectDetailPage({ id }: { id: number }) {
  const [project, setProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  function load() {
    Promise.all([api.get<Project>(`/projects/${id}`), api.get<Assignment[]>(`/assignments?projectId=${id}`)])
      .then(([p, a]) => {
        setProject(p);
        setAssignments(a.sort((x, y) => (x.startDate < y.startDate ? 1 : -1)));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  if (loading) return <div className="text-slate-400 dark:text-slate-500">Caricamento…</div>;
  if (!project) return <div className="text-slate-400 dark:text-slate-500">Progetto non trovato</div>;

  const today = new Date().toISOString().slice(0, 10);
  const currentAssignments = assignments.filter((a) => a.startDate <= today && a.endDate >= today);

  return (
    <div>
      <Link href="/projects" className="mb-4 inline-block text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400">
        ← Torna a Progetti
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: project.color }} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{project.name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {project.client || "Nessun cliente"} · <span className="font-mono text-xs">{project.commessaId}</span>
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          Modifica
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500 dark:text-slate-400">Stato</p>
            <Badge color={STATUS_COLOR[project.status]}>{STATUS_LABEL[project.status]}</Badge>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500 dark:text-slate-400">Periodo</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
              {project.startDate ?? "—"} → {project.endDate ?? "—"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500 dark:text-slate-400">Persone assegnate oggi</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{currentAssignments.length}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Persone assegnate</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Storico completo delle assegnazioni a questo progetto</p>
        </CardHeader>
        <CardBody className="p-0">
          {assignments.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna assegnazione registrata</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Persona</th>
                  <th className="px-5 py-3">%</th>
                  <th className="px-5 py-3">Periodo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {assignments.map((a) => {
                  const active = a.startDate <= today && a.endDate >= today;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                      <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                        <Link href={`/people/${a.personId}`} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                          {a.personName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{a.percentage}%</td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                        {a.startDate} → {a.endDate}
                        {active && (
                          <span className="ml-2">
                            <Badge color="#059669">in corso</Badge>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <ProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        project={project}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
