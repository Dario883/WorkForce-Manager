import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "../lib/api";
import type { Assignment, Person, Project } from "@shared/types";
import { Card, CardBody } from "../components/Card";
import Button from "../components/Button";
import { Badge, Input, Select } from "../components/ui";
import AssignmentModal from "../components/AssignmentModal";

export default function StaffingPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [search, setSearch] = useState("");
  const [personFilter, setPersonFilter] = useState<number | "">("");
  const [projectFilter, setProjectFilter] = useState<number | "">("");
  const [activeOn, setActiveOn] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredAssignments = assignments.filter((a) => {
    const q = search.trim().toLowerCase();
    if (q && !a.personName?.toLowerCase().includes(q) && !a.projectName?.toLowerCase().includes(q)) return false;
    if (personFilter !== "" && a.personId !== personFilter) return false;
    if (projectFilter !== "" && a.projectId !== projectFilter) return false;
    if (activeOn && (a.startDate > activeOn || a.endDate < activeOn)) return false;
    return true;
  });

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Staffing</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{assignments.length} assegnazioni attive</p>
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
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          Servono almeno una persona e un progetto prima di poter creare un'assegnazione.
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          type="text"
          placeholder="Cerca per persona o progetto…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={personFilter} onChange={(e) => setPersonFilter(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Tutte le persone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Tutti i progetti</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={activeOn} onChange={(e) => setActiveOn(e.target.value)} title="Attive in questa data" />
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Caricamento…</p>
          ) : assignments.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessuna assegnazione presente</p>
          ) : filteredAssignments.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Nessun risultato per i filtri selezionati</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Persona</th>
                  <th className="px-5 py-3">Progetto</th>
                  <th className="px-5 py-3">%</th>
                  <th className="px-5 py-3">Periodo</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredAssignments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                      <Link href={`/people/${a.personId}`} className="hover:text-brand-600 dark:hover:text-brand-400 hover:underline">
                        {a.personName}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/projects/${a.projectId}`}>
                        <Badge color={a.projectColor}>{a.projectName}</Badge>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{a.percentage}%</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                      {a.startDate} → {a.endDate}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="mr-3 text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
                        onClick={() => {
                          setEditing(a);
                          setModalOpen(true);
                        }}
                      >
                        Modifica
                      </button>
                      <button className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400" onClick={() => handleDelete(a.id)}>
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
