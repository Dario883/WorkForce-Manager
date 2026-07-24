import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Assignment, Person, Project } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import { Badge } from "../components/ui";
import AssignmentModal from "../components/AssignmentModal";

export default function StaffingPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    Promise.all([
      api.get<Assignment[]>("/assignments"),
      api.get<Person[]>("/people"),
      api.get<Project[]>("/projects"),
    ])
      .then(([a, p, pr]) => {
        setAssignments(a);
        setPeople(p);
        setProjects(pr);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDelete(id: number) {
    if (!confirm("Rimuovere questa assegnazione?")) return;
    await api.delete(`/assignments/${id}`);
    load();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = await api.post<{ imported: number; skipped?: number }>("/assignments/import", { csv: text });
    const skippedMsg = result.skipped ? ` (${result.skipped} righe saltate per dati non validi)` : "";
    alert(`Importate ${result.imported} assegnazioni.${skippedMsg}`);
    load();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staffing</h1>
          <p className="text-sm text-slate-500">{assignments.length} assegnazioni attive</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.open("/api/assignments/csv-template", "_blank")}>
            Template CSV
          </Button>
          <Button variant="secondary" onClick={() => window.open("/api/assignments/export", "_blank")}>
            Esporta CSV
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Importa CSV
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={handleImport} />
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            disabled={people.length === 0 || projects.length === 0}
          >
            + Nuova assegnazione
          </Button>
        </div>
      </div>

      {(people.length === 0 || projects.length === 0) && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Servono almeno una persona e un progetto prima di poter creare un'assegnazione.
        </p>
      )}

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400">Caricamento…</p>
          ) : assignments.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Nessuna assegnazione presente</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Persona</th>
                  <th className="px-5 py-3">Progetto</th>
                  <th className="px-5 py-3">%</th>
                  <th className="px-5 py-3">Periodo</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{a.personName}</td>
                    <td className="px-5 py-3">
                      <Badge color={a.projectColor}>{a.projectName}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{a.percentage}%</td>
                    <td className="px-5 py-3 text-slate-600">
                      {a.startDate} → {a.endDate}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="mr-3 text-slate-500 hover:text-brand-600"
                        onClick={() => {
                          setEditing(a);
                          setModalOpen(true);
                        }}
                      >
                        Modifica
                      </button>
                      <button className="text-slate-500 hover:text-red-600" onClick={() => handleDelete(a.id)}>
                        Rimuovi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <AssignmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        assignment={editing}
        people={people}
        projects={projects}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
}
